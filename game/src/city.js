// FROSTLINE 3D — city: deterministic seeded procedural city (Neon Harbor).
// Road grid, sidewalks, markings, crosswalks, downtown towers, residential,
// industrial harbor + water, causeway bridge to a lighthouse island, park,
// landmarks (Meridian Tower, stadium, ferris wheel). Chunked streaming,
// InstancedMesh for buildings/props, canvas textures, collision AABBs + grid.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var CFG = FL.CFG, PAL = FL.PALETTE;
  var HALF = CFG.citySize / 2; // 320
  var ROAD_CENTERS = [];
  for (var k = 0; k < 10; k++) ROAD_CENTERS.push(-288 + k * 64);

  // Water: south harbor strip. Causeway + island are land inside it.
  var WATER = { minX: -HALF, maxX: HALF, minZ: 272, maxZ: HALF };
  var CAUSEWAY = { minX: 152, maxX: 168, minZ: 272, maxZ: HALF };
  var ISLAND = { minX: 128, maxX: 192, minZ: 272, maxZ: HALF };
  var PARK = { minX: -288, maxX: -160, minZ: -288, maxZ: -160 };

  function inRect(x, z, r) { return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ; }
  function isWater(x, z) {
    if (!inRect(x, z, WATER)) return false;
    if (inRect(x, z, CAUSEWAY) || inRect(x, z, ISLAND)) return false;
    return true;
  }
  function isRoad(x, z) {
    for (var i = 0; i < ROAD_CENTERS.length; i++) {
      var c = ROAD_CENTERS[i];
      if (Math.abs(x - c) <= CFG.roadWidth / 2 && Math.abs(z) <= HALF) return true;
      if (Math.abs(z - c) <= CFG.roadWidth / 2 && Math.abs(x) <= HALF) return true;
    }
    return false;
  }

  // Canvas texture: lit windows grid (emissive at night).
  function windowTexture() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#101828'; g.fillRect(0, 0, 64, 128);
    var rng = FL.makeRng(42);
    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 8; x++) {
        var lit = rng() < 0.55;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#0a1220';
        g.fillRect(2 + x * 8, 2 + y * 8, 5, 5);
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // Canvas texture: road asphalt with subtle noise.
  function roadTexture() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#2a3448'; g.fillRect(0, 0, 64, 64);
    var rng = FL.makeRng(7);
    for (var i = 0; i < 300; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (rng() * 0.05).toFixed(3) + ')';
      g.fillRect(rng() * 64, rng() * 64, 1.5, 1.5);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  var city = {
    group: null, chunks: [], colliders: [], grid: new FL.SpatialGrid(32),
    intersections: [], buildings: [], lamps: [], trees: [],
    ferrisWheel: null, waterMesh: null, buildingMat: null,
    roadMat: null, chunkMap: new Map(),
  };
  FL.city = city;
  // Road list for the minimap / fullscreen map (centre line of each road).
  city.roads = [];
  ROAD_CENTERS.forEach(function (c) {
    city.roads.push({ dir: 'ns', at: c });
    city.roads.push({ dir: 'ew', at: c });
  });
  FL.city.isWater = isWater;
  FL.city.isRoad = isRoad;

  function addCollider(minX, maxX, minZ, maxZ) {
    var c = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    city.colliders.push(c);
    city.grid.insert(c, (minX + maxX) / 2, (minZ + maxZ) / 2);
    return c;
  }
  // Is a circle (x,z,r) blocked by a building/water/landmark?
  FL.city.isBlocked = function (x, z, r) {
    r = r || 0.5;
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return true;
    if (isWater(x, z)) return true;
    var near = city.grid.query(x, z, 24);
    for (var i = 0; i < near.length; i++) {
      var c = near[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  };
  // Resolve a circle out of colliders (push out along the smallest axis).
  FL.city.resolveCircle = function (x, z, r) {
    var near = city.grid.query(x, z, 24);
    for (var i = 0; i < near.length; i++) {
      var c = near[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        var dxl = (x + r) - c.minX, dxr = c.maxX - (x - r);
        var dzl = (z + r) - c.minZ, dzr = c.maxZ - (z - r);
        var m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
        else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
    if (isWater(x, z)) {
      // Push back to the nearest shore (north edge of the water).
      if (z > 272 && !(x >= CAUSEWAY.minX && x <= CAUSEWAY.maxX) && !(x >= ISLAND.minX && x <= ISLAND.maxX)) z = 272 - r;
    }
    x = FL.clamp(x, -HALF + 2, HALF - 2); z = FL.clamp(z, -HALF + 2, HALF - 2);
    return { x: x, z: z };
  };
  FL.city.nearestRoadPoint = function (x, z) {
    var best = null, bd = Infinity;
    for (var i = 0; i < ROAD_CENTERS.length; i++) {
      var c = ROAD_CENTERS[i];
      var d1 = Math.abs(x - c), d2 = Math.abs(z - c);
      if (d1 < bd) { bd = d1; best = { x: c, z: FL.clamp(z, -HALF + 8, HALF - 8) }; }
      if (d2 < bd) { bd = d2; best = { x: FL.clamp(x, -HALF + 8, HALF - 8), z: c }; }
    }
    return best;
  };
  // Random spawn point on a road (validated: on road, not water, not blocked).
  FL.city.randomRoadPoint = function () {
    for (var t = 0; t < 40; t++) {
      var c = FL.pick(ROAD_CENTERS);
      var along = FL.rand(-HALF + 16, HALF - 16);
      var p = FL.chance(0.5) ? { x: c, z: along } : { x: along, z: c };
      if (isWater(p.x, p.z)) continue;
      if (city.isBlocked(p.x, p.z, 2)) continue;
      return p;
    }
    return { x: 0, z: 0 };
  };
  // Random sidewalk point (beside a road, not blocked).
  FL.city.randomSidewalkPoint = function () {
    for (var t = 0; t < 40; t++) {
      var c = FL.pick(ROAD_CENTERS);
      var along = FL.rand(-HALF + 16, HALF - 16);
      var off = (CFG.roadWidth / 2 + CFG.sidewalkWidth / 2) * (FL.chance(0.5) ? 1 : -1);
      var p = FL.chance(0.5) ? { x: c + off, z: along } : { x: along, z: c + off };
      if (isWater(p.x, p.z)) continue;
      if (city.isBlocked(p.x, p.z, 1)) continue;
      return p;
    }
    return { x: 8, z: 8 };
  };

  // Intersections + BFS pathing on the road grid.
  function buildNavGraph() {
    var nodes = [];
    var index = new Map();
    ROAD_CENTERS.forEach(function (x) {
      ROAD_CENTERS.forEach(function (z) {
        if (isWater(x, z)) return;
        var id = nodes.length;
        index.set(x + ',' + z, id);
        nodes.push({ x: x, z: z, links: [] });
      });
    });
    nodes.forEach(function (n) {
      [[64, 0], [-64, 0], [0, 64], [0, -64]].forEach(function (d) {
        var id = index.get((n.x + d[0]) + ',' + (n.z + d[1]));
        if (id !== undefined) n.links.push(id);
      });
    });
    city.navNodes = nodes;
    city.navIndex = index;
  }
  FL.city.nearestNode = function (x, z) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < city.navNodes.length; i++) {
      var n = city.navNodes[i];
      var d = FL.dist2(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  FL.city.findPath = function (fromIdx, toIdx) {
    if (fromIdx === toIdx) return [fromIdx];
    var prev = new Array(city.navNodes.length).fill(-1);
    var queue = [fromIdx]; prev[fromIdx] = fromIdx;
    while (queue.length) {
      var cur = queue.shift();
      if (cur === toIdx) break;
      var links = city.navNodes[cur].links;
      for (var i = 0; i < links.length; i++) {
        if (prev[links[i]] === -1) { prev[links[i]] = cur; queue.push(links[i]); }
      }
    }
    if (prev[toIdx] === -1) return [fromIdx];
    var path = [], at = toIdx;
    while (at !== fromIdx) { path.push(at); at = prev[at]; }
    path.push(fromIdx); path.reverse();
    return path;
  };

  function buildCity(scene) {
    var rng = FL.makeRng(20261124);
    city.group = new THREE.Group();
    city.group.name = 'city';
    scene.add(city.group);

    // Ground (sidewalk tone) + roads + water.
    var groundMat = new THREE.MeshStandardMaterial({ color: PAL.sidewalk, roughness: 0.95 });
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.citySize, CFG.citySize), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    city.group.add(ground);

    var roadTex = roadTexture(); roadTex.repeat.set(40, 40);
    city.roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: roadTex, roughness: 0.85, metalness: 0.05 });
    var roadGeoX = new THREE.PlaneGeometry(CFG.citySize, CFG.roadWidth);
    var roadGeoZ = new THREE.PlaneGeometry(CFG.roadWidth, CFG.citySize);
    ROAD_CENTERS.forEach(function (c) {
      var rx = new THREE.Mesh(roadGeoX, city.roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, c); rx.receiveShadow = true;
      city.group.add(rx);
      var rz = new THREE.Mesh(roadGeoZ, city.roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.02, 0); rz.receiveShadow = true;
      city.group.add(rz);
    });

    // Lane markings (dashed centre lines) + crosswalks at intersections.
    // Instanced (one draw call each) — the per-dash version cost 2,400 calls.
    var markMat = new THREE.MeshBasicMaterial({ color: 0xd8e2f0 });
    var yellowMat = new THREE.MeshBasicMaterial({ color: 0xd8b83a });
    var dashGeo = new THREE.PlaneGeometry(3, 0.35);
    var dashMats = [];
    var dummy = new THREE.Object3D();
    ROAD_CENTERS.forEach(function (c) {
      for (var a = -HALF + 8; a < HALF - 8; a += 8) {
        if (Math.abs(a) < 10) continue; // skip intersections
        dummy.position.set(a, 0.04, c);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        dashMats.push(dummy.matrix.clone());
        dummy.position.set(c, 0.04, a);
        dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        dummy.updateMatrix();
        dashMats.push(dummy.matrix.clone());
      }
    });
    var dashMesh = new THREE.InstancedMesh(dashGeo, yellowMat, dashMats.length);
    dashMats.forEach(function (m, i) { dashMesh.setMatrixAt(i, m); });
    dashMesh.instanceMatrix.needsUpdate = true;
    city.group.add(dashMesh);
    var stripeGeo = new THREE.PlaneGeometry(0.8, 3.2);
    var stripeMats = [];
    ROAD_CENTERS.forEach(function (x) {
      ROAD_CENTERS.forEach(function (z) {
        if (isWater(x, z)) return;
        for (var s = -4; s <= 4; s++) {
          dummy.position.set(x + s * 1.1, 0.04, z - 7.5);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.updateMatrix();
          stripeMats.push(dummy.matrix.clone());
        }
      });
    });
    var stripeMesh = new THREE.InstancedMesh(stripeGeo, markMat, stripeMats.length);
    stripeMats.forEach(function (m, i) { stripeMesh.setMatrixAt(i, m); });
    stripeMesh.instanceMatrix.needsUpdate = true;
    city.group.add(stripeMesh);

    // Water (harbor) + causeway + island.
    var waterMat = new THREE.MeshStandardMaterial({ color: PAL.water, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.92 });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(CFG.citySize, HALF - 272), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, (272 + HALF) / 2);
    city.group.add(water);
    city.waterMesh = water;
    var causeMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.8 });
    var causeway = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, HALF - 272), causeMat);
    causeway.position.set(160, 0.3, (272 + HALF) / 2); causeway.receiveShadow = true;
    city.group.add(causeway);
    var island = new THREE.Mesh(new THREE.BoxGeometry(64, 0.8, HALF - 272), new THREE.MeshStandardMaterial({ color: 0x3a4358, roughness: 0.95 }));
    island.position.set(160, 0.4, (272 + HALF) / 2); island.receiveShadow = true;
    city.group.add(island);
    // Bridge railings (neon) + supports.
    var railMat = new THREE.MeshStandardMaterial({ color: PAL.neonCyan, emissive: PAL.neonCyan, emissiveIntensity: 1.2 });
    [150, 170].forEach(function (x) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, HALF - 272), railMat);
      rail.position.set(x, 1.1, (272 + HALF) / 2);
      city.group.add(rail);
    });

    // --- Buildings (InstancedMesh, chunked) ---
    var winTex = windowTexture();
    city.buildingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: winTex, emissive: 0xffffff, emissiveMap: winTex,
      emissiveIntensity: 0.55, roughness: 0.85, metalness: 0.1,
    });
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    var roofMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.9 });

    // Plan buildings per block (skip roads/water/park/landmark plots).
    var specs = []; // {x,z,w,d,h,color,district}
    var landmarkPlots = [
      { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },       // Meridian Tower
      { minX: 192, maxX: 288, minZ: -96, maxZ: 32 },      // stadium
      { minX: -192, maxX: -128, minZ: 192, maxZ: 256 },   // ferris wheel
      { minX: 128, maxX: 192, minZ: 272, maxZ: HALF },    // island
    ];
    function onLandmarkPlot(x, z) {
      for (var i = 0; i < landmarkPlots.length; i++) if (inRect(x, z, landmarkPlots[i])) return true;
      return false;
    }
    for (var bx = -288; bx <= 288; bx += 64) {
      for (var bz = -288; bz <= 288; bz += 64) {
        var cx = bx, cz = bz; // block centre (between roads)
        // Blocks are centred between road centres: offset by 32.
        var blockX = bx + 32, blockZ = bz + 32;
        if (blockX > HALF - 8 || blockZ > HALF - 8) continue;
        if (isWater(blockX, blockZ)) continue;
        if (inRect(blockX, blockZ, PARK)) continue;
        if (onLandmarkPlot(blockX, blockZ)) continue;
        var downtown = Math.abs(blockX) < 128 && Math.abs(blockZ) < 128;
        var harbor = blockZ > 192;
        var n = downtown ? (rng() < 0.5 ? 1 : 2) : (rng() < 0.6 ? 2 : 3);
        for (var b = 0; b < n; b++) {
          var w = rng() * 18 + 12, d = rng() * 18 + 12;
          var ox = (b % 2 === 0 ? -1 : 1) * (rng() * 8 + 4);
          var oz = (b < 2 ? -1 : 1) * (rng() * 8 + 4);
          if (n === 1) { ox = 0; oz = 0; }
          var x = blockX + ox, z = blockZ + oz;
          if (isWater(x, z) || isRoad(x, z) || onLandmarkPlot(x, z)) continue;
          var h;
          if (downtown) h = 30 + rng() * rng() * 90;
          else if (harbor) h = 8 + rng() * 10;
          else h = 8 + rng() * 18;
          var col = downtown ? PAL.downtown : (harbor ? PAL.industrial : PAL.residential);
          col = new THREE.Color(col).offsetHSL(0, 0, (rng() - 0.5) * 0.12).getHex();
          specs.push({ x: x, z: z, w: w, d: d, h: h, color: col });
          addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
        }
      }
    }
    city.buildings = specs;

    // Split buildings into chunks; one InstancedMesh per chunk.
    var chunkCount = Math.ceil(CFG.citySize / CFG.chunkSize);
    var chunkSpecs = new Map();
    specs.forEach(function (s) {
      var ci = Math.floor((s.x + HALF) / CFG.chunkSize);
      var cj = Math.floor((s.z + HALF) / CFG.chunkSize);
      var key = ci + ',' + cj;
      if (!chunkSpecs.has(key)) chunkSpecs.set(key, []);
      chunkSpecs.get(key).push(s);
    });
    var dummy = new THREE.Object3D();
    var col = new THREE.Color();
    chunkSpecs.forEach(function (list, key) {
      var mesh = new THREE.InstancedMesh(boxGeo, city.buildingMat, list.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      list.forEach(function (s, i) {
        dummy.position.set(s.x, 0, s.z);
        dummy.scale.set(s.w, s.h, s.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, col.setHex(s.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      var parts = key.split(',');
      var chunk = { key: key, ci: +parts[0], cj: +parts[1], group: new THREE.Group(), mesh: mesh };
      chunk.group.add(mesh);
      city.chunks.push(chunk);
      city.chunkMap.set(key, chunk);
      city.group.add(chunk.group);
    });

    // Rooftop props (small AC boxes) on some buildings.
    var roofSpecs = [];
    specs.forEach(function (s) {
      if (rng() < 0.4) roofSpecs.push({ x: s.x + (rng() - 0.5) * s.w * 0.5, z: s.z + (rng() - 0.5) * s.d * 0.5, y: s.h, s: 2 + rng() * 2 });
    });
    if (roofSpecs.length) {
      var rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofMat, roofSpecs.length);
      roofSpecs.forEach(function (r, i) {
        dummy.position.set(r.x, r.y + 0.5, r.z); dummy.scale.set(r.s, 1, r.s); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix);
      });
      rm.instanceMatrix.needsUpdate = true;
      rm.castShadow = true;
      city.group.add(rm);
    }

    // Street lamps (instanced poles + emissive heads) along roads.
    var lampPos = [];
    ROAD_CENTERS.forEach(function (c) {
      for (var a = -HALF + 16; a < HALF - 8; a += 32) {
        if (isWater(c, a)) continue;
        lampPos.push({ x: c + 7.5, z: a });
        if (rng() < 0.5) lampPos.push({ x: a, z: c + 7.5 });
      }
    });
    var poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 5);
    poleGeo.translate(0, 3.5, 0);
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.7, metalness: 0.5 });
    var poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPos.length);
    var headGeo = new THREE.SphereGeometry(0.35, 6, 5);
    var headMat = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: PAL.lampWarm, emissiveIntensity: 2.2 });
    var heads = new THREE.InstancedMesh(headGeo, headMat, lampPos.length);
    lampPos.forEach(function (p, i) {
      dummy.position.set(p.x, 0, p.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 7, p.z); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    city.group.add(poles); city.group.add(heads);
    city.lamps = lampPos;

    // Trees (park + scattered): instanced cones + trunks.
    var treePos = [];
    for (var t = 0; t < 90; t++) {
      var tx = PARK.minX + rng() * (PARK.maxX - PARK.minX);
      var tz = PARK.minZ + rng() * (PARK.maxZ - PARK.minZ);
      treePos.push({ x: tx, z: tz, s: 0.8 + rng() * 0.9 });
    }
    for (t = 0; t < 60; t++) {
      var p2 = city.randomSidewalkPoint();
      if (!inRect(p2.x, p2.z, PARK)) treePos.push({ x: p2.x, z: p2.z, s: 0.7 + rng() * 0.6 });
    }
    var trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 2.2, 5);
    trunkGeo.translate(0, 1.1, 0);
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95 });
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePos.length);
    var coneGeo = new THREE.ConeGeometry(1.6, 4.5, 6);
    coneGeo.translate(0, 4.2, 0);
    var coneMat = new THREE.MeshStandardMaterial({ color: 0x2a5a3a, roughness: 0.9 });
    var cones = new THREE.InstancedMesh(coneGeo, coneMat, treePos.length);
    treePos.forEach(function (p, i) {
      dummy.position.set(p.x, 0, p.z); dummy.scale.set(p.s, p.s, p.s); dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); cones.setMatrixAt(i, dummy.matrix);
      addCollider(p.x - 0.5, p.x + 0.5, p.z - 0.5, p.z + 0.5);
    });
    trunks.instanceMatrix.needsUpdate = true; cones.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true; cones.castShadow = true;
    city.group.add(trunks); city.group.add(cones);
    city.trees = treePos;

    // Traffic lights at intersections (instanced small boxes + emissive lens).
    var tlPos = [];
    ROAD_CENTERS.forEach(function (x) {
      ROAD_CENTERS.forEach(function (z) {
        if (isWater(x, z)) return;
        tlPos.push({ x: x + 7, z: z + 7 });
      });
    });
    var tlGeo = new THREE.BoxGeometry(0.5, 3.2, 0.5);
    tlGeo.translate(0, 1.6, 0);
    var tlMat = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.6, metalness: 0.4 });
    var tls = new THREE.InstancedMesh(tlGeo, tlMat, tlPos.length);
    var lensGeo = new THREE.SphereGeometry(0.28, 6, 5);
    var lensMat = new THREE.MeshStandardMaterial({ color: 0x66ff88, emissive: 0x22cc55, emissiveIntensity: 1.6 });
    var lenses = new THREE.InstancedMesh(lensGeo, lensMat, tlPos.length);
    tlPos.forEach(function (p, i) {
      dummy.position.set(p.x, 0, p.z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix(); tls.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, 3.4, p.z); dummy.updateMatrix(); lenses.setMatrixAt(i, dummy.matrix);
    });
    tls.instanceMatrix.needsUpdate = true; lenses.instanceMatrix.needsUpdate = true;
    city.group.add(tls); city.group.add(lenses);

    // --- Landmarks ---
    // Meridian Tower (tallest, downtown centre) with neon crown.
    var tower = new THREE.Group();
    var towerMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6e, map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.7, roughness: 0.6, metalness: 0.3 });
    var towerMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 140, 26), towerMat);
    towerMesh.position.y = 70; towerMesh.castShadow = true; towerMesh.receiveShadow = true;
    tower.add(towerMesh);
    var crownMat = new THREE.MeshStandardMaterial({ color: PAL.neonPink, emissive: PAL.neonPink, emissiveIntensity: 2.5 });
    var crown = new THREE.Mesh(new THREE.BoxGeometry(28, 3, 28), crownMat);
    crown.position.y = 141.5; tower.add(crown);
    var spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 18, 6), crownMat);
    spire.position.y = 152; tower.add(spire);
    tower.position.set(0, 0, 0);
    city.group.add(tower);
    addCollider(-13, 13, -13, 13);

    // Stadium (east): ring + field + floodlights.
    var stadium = new THREE.Group();
    var bowlMat = new THREE.MeshStandardMaterial({ color: 0x4a5a7a, roughness: 0.8 });
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(34, 38, 14, 24, 1, true), bowlMat);
    bowl.position.y = 7; bowl.castShadow = true;
    stadium.add(bowl);
    var field = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.95 }));
    field.rotation.x = -Math.PI / 2; field.position.y = 0.1;
    stadium.add(field);
    var floodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8f0ff, emissiveIntensity: 2.0 });
    for (var f = 0; f < 4; f++) {
      var ang = f * Math.PI / 2 + Math.PI / 4;
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 22, 5), poleMat);
      pole.position.set(Math.cos(ang) * 36, 11, Math.sin(ang) * 36);
      stadium.add(pole);
      var flood = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.5), floodMat);
      flood.position.set(Math.cos(ang) * 36, 22.5, Math.sin(ang) * 36);
      flood.lookAt(0, 0, 0);
      stadium.add(flood);
    }
    stadium.position.set(240, 0, -32);
    city.group.add(stadium);
    addCollider(240 - 38, 240 + 38, -32 - 38, -32 + 38);

    // Ferris wheel (near harbor): rotating wheel + gondolas.
    var fw = new THREE.Group();
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x8a9ab8, roughness: 0.5, metalness: 0.6 });
    var rim = new THREE.Mesh(new THREE.TorusGeometry(18, 0.6, 6, 24), wheelMat);
    fw.add(rim);
    for (var s2 = 0; s2 < 8; s2++) {
      var spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 36, 4), wheelMat);
      spoke.rotation.z = s2 * Math.PI / 8;
      fw.add(spoke);
    }
    var gondolaMat = new THREE.MeshStandardMaterial({ color: PAL.neonAmber, emissive: PAL.neonAmber, emissiveIntensity: 1.0 });
    for (var gg = 0; gg < 8; gg++) {
      var ga = gg * Math.PI / 4;
      var gond = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), gondolaMat);
      gond.position.set(Math.cos(ga) * 18, Math.sin(ga) * 18, 0);
      fw.add(gond);
    }
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3, 8), wheelMat);
    hub.rotation.x = Math.PI / 2; fw.add(hub);
    var support = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 20, 5), poleMat);
    support.position.y = -10; fw.add(support);
    fw.position.set(-160, 20, 224);
    city.group.add(fw);
    city.ferrisWheel = fw;
    addCollider(-164, -156, 220, 228);

    // Lighthouse on the island.
    var lh = new THREE.Group();
    var lhMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 });
    var lhRed = new THREE.MeshStandardMaterial({ color: 0xc22d2d, roughness: 0.7 });
    var lhBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 8, 10), lhMat);
    lhBase.position.y = 4; lh.add(lhBase);
    var lhMid = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 8, 10), lhRed);
    lhMid.position.y = 12; lh.add(lhMid);
    var lhTop = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 6, 10), lhMat);
    lhTop.position.y = 19; lh.add(lhTop);
    var lhLamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff2b8, emissive: 0xffe28a, emissiveIntensity: 3 }));
    lhLamp.position.y = 23.5; lh.add(lhLamp);
    lh.position.set(160, 0.8, 300);
    city.group.add(lh);
    addCollider(155, 165, 295, 305);

    // Harbor cranes + containers (industrial).
    var craneMat = new THREE.MeshStandardMaterial({ color: 0xd88a2a, roughness: 0.6, metalness: 0.4 });
    [-200, -80, 40].forEach(function (x) {
      var crane = new THREE.Group();
      var leg1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 26, 1.5), craneMat);
      leg1.position.set(-4, 13, 0); crane.add(leg1);
      var leg2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 26, 1.5), craneMat);
      leg2.position.set(4, 13, 0); crane.add(leg2);
      var beam = new THREE.Mesh(new THREE.BoxGeometry(26, 1.5, 1.5), craneMat);
      beam.position.set(0, 26, 0); crane.add(beam);
      crane.position.set(x, 0, 250);
      city.group.add(crane);
      addCollider(x - 5, x + 5, 248, 252);
    });
    var contColors = [0xc22d2d, 0x2d7ac2, 0x2dc26a, 0xd8a02d, 0x7a4ac2];
    for (var ci2 = 0; ci2 < 24; ci2++) {
      var cc = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6),
        new THREE.MeshStandardMaterial({ color: contColors[ci2 % contColors.length], roughness: 0.7, metalness: 0.3 }));
      var cx2 = -240 + (ci2 % 8) * 14, cz2 = 232 + Math.floor(ci2 / 8) * 8;
      cc.position.set(cx2, 1.3, cz2);
      cc.rotation.y = (ci2 % 3) * 0.1;
      cc.castShadow = true;
      city.group.add(cc);
      addCollider(cx2 - 3, cx2 + 3, cz2 - 1.5, cz2 + 1.5);
    }

    // Neon signs on downtown buildings (emissive planes).
    var signMats = [PAL.neonPink, PAL.neonCyan, PAL.neonPurple, PAL.neonAmber].map(function (c) {
      return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.8 });
    });
    var signCount = 0;
    specs.forEach(function (s) {
      if (signCount >= 26) return;
      if (Math.abs(s.x) > 128 || Math.abs(s.z) > 128) return;
      if (rng() < 0.5) return;
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(6 + rng() * 6, 1.2),
        signMats[signCount % signMats.length]);
      sign.position.set(s.x, 6 + rng() * Math.min(20, s.h - 8), s.z + s.d / 2 + 0.15);
      city.group.add(sign);
      signCount++;
    });

    buildNavGraph();
  }

  // Chunk streaming: show chunks near the player, hide far ones.
  var lastChunkUpdate = 0;
  FL.city.update = function (playerPos, elapsed) {
    if (city.ferrisWheel) city.ferrisWheel.rotation.z += 0.02 * (1 / 60) * 2;
    if (city.waterMesh) {
      city.waterMesh.position.y = 0.03 + Math.sin(elapsed * 0.5) * 0.02;
    }
    if (!playerPos) return;
    var now = performance.now();
    if (now - lastChunkUpdate < 500) return;
    lastChunkUpdate = now;
    var pci = Math.floor((playerPos.x + HALF) / CFG.chunkSize);
    var pcj = Math.floor((playerPos.z + HALF) / CFG.chunkSize);
    city.chunks.forEach(function (chunk) {
      var near = Math.abs(chunk.ci - pci) <= CFG.chunkRadius && Math.abs(chunk.cj - pcj) <= CFG.chunkRadius;
      if (chunk.group.visible !== near) chunk.group.visible = near;
    });
  };

  FL.city.build = buildCity;
})();
