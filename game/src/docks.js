// FROSTLINE 3D — docks (v7): "The Docks", a working harbor district on the
// south waterfront. Warehouses, a rotating gantry crane, a cargo ship riding
// at anchor, container stacks, dock workers, an island helipad and five
// collectible crates. The city generator already builds industrial blocks
// along this strip, so every land structure is placed only after a runtime
// collision check — a candidate spot that is already built is skipped and
// the next one is tried, so the district never overlaps a building.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var D = {
    scene: null, game: null,
    craneJib: null, craneHook: null, craneT: 0,
    ship: null, shipT: 0,
    workers: [], crates: [], collected: 0,
    fishermen: [], // v8: two NPCs who walk the pier with fishing rods
    padLights: [], padT: 0,
    placed: { warehouses: 0, containers: 0, crates: 0 },
  };
  FL.docks = D;

  // Is a w-by-d footprint centred on (x, z) free of buildings and water?
  function footprintClear(x, z, hw, hd) {
    var pts = [
      [x - hw, z - hd], [x + hw, z - hd], [x - hw, z + hd], [x + hw, z + hd], [x, z],
    ];
    for (var i = 0; i < pts.length; i++) {
      if (FL.city.isBlocked(pts[i][0], pts[i][1], 1)) return false;
    }
    return true;
  }
  // Register a collider with the city's spatial grid (runtime addition).
  function addDockCollider(minX, maxX, minZ, maxZ) {
    var c = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    FL.city.colliders.push(c);
    FL.city.grid.insert(c, (minX + maxX) / 2, (minZ + maxZ) / 2);
  }
  function dockMat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.75, metalness: 0.25 }, opts || {}));
  }
  function dockBox(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // --- Warehouses ---
  var WAREHOUSE_SPOTS = [
    { x: -240, z: 264, c: 0x5a6a7a }, { x: -120, z: 264, c: 0x6a5a4a },
    { x: 0, z: 264, c: 0x4a5a6a }, { x: 120, z: 264, c: 0x5a6a5a },
    { x: 240, z: 264, c: 0x6a6a7a },
  ];
  function buildWarehouse(def) {
    var g = new THREE.Group();
    var body = dockBox(18, 8, 12, dockMat(def.c), 0, 4, 0);
    g.add(body);
    var roof = dockBox(18.6, 0.5, 12.6, dockMat(0x2a3348), 0, 8.2, 0);
    g.add(roof);
    // Loading door (dark, faces the road) + a neon strip above it.
    var door = dockBox(6, 5, 0.2, dockMat(0x1a2233, { roughness: 0.9 }), 0, 2.5, -6.1);
    g.add(door);
    var strip = dockBox(10, 0.5, 0.2,
      new THREE.MeshStandardMaterial({ color: 0x2de8ff, emissive: 0x2de8ff, emissiveIntensity: 1.6 }), 0, 6.2, -6.1);
    g.add(strip);
    // Roof vents.
    [-5, 0, 5].forEach(function (x) {
      g.add(dockBox(1.2, 1.0, 1.2, dockMat(0x8a8a8a), x, 8.9, 0));
    });
    g.position.set(def.x, 0, def.z);
    D.scene.add(g);
    addDockCollider(def.x - 9, def.x + 9, def.z - 6, def.z + 6);
    D.placed.warehouses++;
  }

  // --- Rotating gantry crane ---
  var CRANE_SPOTS = [{ x: 200, z: 264 }, { x: -40, z: 264 }, { x: 80, z: 264 }];
  function buildCrane(def) {
    var g = new THREE.Group();
    var mat = dockMat(0xd88a2a, { roughness: 0.6, metalness: 0.4 });
    [-4, 4].forEach(function (x) {
      g.add(dockBox(1.5, 26, 1.5, mat, x, 13, 0));
    });
    g.add(dockBox(10, 1.5, 2, mat, 0, 26, 0));
    // The jib rotates around the mast; the hook rides a cable below it.
    var jib = new THREE.Group();
    jib.add(dockBox(30, 1.2, 1.2, mat, 6, 0, 0));
    jib.add(dockBox(4, 2.4, 2.4, dockMat(0x333333), -8, -0.4, 0)); // counterweight
    var cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 4),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
    cable.position.set(18, -5, 0);
    jib.add(cable);
    var hook = dockBox(1.6, 1.2, 1.6, dockMat(0xc22d2d), 18, -10.5, 0);
    jib.add(hook);
    jib.position.set(0, 27, 0);
    g.add(jib);
    g.position.set(def.x, 0, def.z);
    D.scene.add(g);
    addDockCollider(def.x - 5, def.x + 5, def.z - 2, def.z + 2);
    D.craneJib = jib;
    D.craneHook = hook;
  }

  // --- Cargo ship (at anchor in the harbor water) ---
  function buildShip() {
    var g = new THREE.Group();
    var hull = dockBox(10, 6, 44, dockMat(0x1a2a3a, { roughness: 0.5, metalness: 0.5 }), 0, 2, 0);
    g.add(hull);
    var bow = dockBox(9, 5, 6, dockMat(0x1a2a3a, { roughness: 0.5, metalness: 0.5 }), 0, 2.2, 24);
    bow.rotation.x = 0.22;
    g.add(bow);
    var deck = dockBox(9.4, 0.5, 40, dockMat(0x3a4a5a), 0, 5.2, -1);
    g.add(deck);
    // Bridge tower (aft) + funnel.
    g.add(dockBox(7, 7, 5, dockMat(0xe8e8e8, { roughness: 0.6 }), 0, 9, -17));
    g.add(dockBox(7.4, 1.2, 5.4, dockMat(0x0e2238, { roughness: 0.2, metalness: 0.7 }), 0, 11.5, -17));
    g.add(dockBox(2.5, 4, 2.5, dockMat(0xc22d2d), 0, 8, -12));
    // Containers stacked on deck.
    var cols = [0xc22d2d, 0x2d7ac2, 0x2dc26a, 0xd8a02d];
    for (var i = 0; i < 10; i++) {
      var cx = (i % 2 === 0 ? -2.4 : 2.4);
      var cz = -10 + Math.floor(i / 2) * 6.5;
      var cy = 6.8 + (i % 3 === 0 ? 2.7 : 0);
      g.add(dockBox(4.4, 2.4, 5.6, dockMat(cols[i % cols.length]), cx, cy, cz));
    }
    // Deck lights.
    [-20, 0, 20].forEach(function (z) {
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0xffe28a, emissiveIntensity: 2.5 }));
      lamp.position.set(0, 6.2, z);
      g.add(lamp);
    });
    g.position.set(-100, 0, 295);
    D.scene.add(g);
    D.ship = g;
  }

  // --- Container stacks (extra, beside the warehouses) ---
  var CONTAINER_SPOTS = [];
  for (var ci = 0; ci < 12; ci++) {
    CONTAINER_SPOTS.push({ x: -260 + ci * 22, z: 258 + (ci % 2) * 6 });
  }
  function buildContainers() {
    var cols = [0xc22d2d, 0x2d7ac2, 0x2dc26a, 0xd8a02d, 0x7a4ac2];
    CONTAINER_SPOTS.forEach(function (spot, i) {
      if (!footprintClear(spot.x, spot.z, 3.2, 1.6)) return;
      var stacked = i % 4 === 0;
      var c1 = dockBox(6, 2.6, 2.6, dockMat(cols[i % cols.length]), spot.x, 1.3, spot.z);
      D.scene.add(c1);
      if (stacked) {
        var c2 = dockBox(6, 2.6, 2.6, dockMat(cols[(i + 2) % cols.length]), spot.x, 3.9, spot.z);
        D.scene.add(c2);
      }
      addDockCollider(spot.x - 3, spot.x + 3, spot.z - 1.3, spot.z + 1.3);
      D.placed.containers++;
    });
  }

  // --- Dock workers (ambient wandering NPCs) ---
  function buildWorkers() {
    var spots = [
      { x: -180, z: 262 }, { x: -60, z: 262 }, { x: 60, z: 262 }, { x: 180, z: 262 },
    ];
    spots.forEach(function (spot) {
      if (FL.city.isBlocked(spot.x, spot.z, 1)) return;
      // Yellow "hard hat" hair + orange vest shirt.
      var g = FL.makeHumanoid({ skin: 0xd8a07a, shirt: 0xd88a2a, pants: 0x2a3348, hair: 0xd8d83a });
      g.position.set(spot.x, 0, spot.z);
      D.scene.add(g);
      D.workers.push({
        g: g, animT: Math.random() * 10,
        home: { x: spot.x, z: spot.z },
        target: { x: spot.x, z: spot.z },
        speed: 1.6, idle: 0,
      });
    });
  }
  function updateWorkers(dt) {
    D.workers.forEach(function (w) {
      var gx = w.g.position.x, gz = w.g.position.z;
      var dx = w.target.x - gx, dz = w.target.z - gz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.5) {
        w.idle -= dt;
        w.g.userData.setPose('idle', w.animT, 0);
        if (w.idle <= 0) {
          w.idle = FL.rand(2, 6);
          w.target = {
            x: FL.clamp(w.home.x + FL.rand(-24, 24), -300, 300),
            z: FL.clamp(w.home.z + FL.rand(-6, 6), 250, 270),
          };
        }
        return;
      }
      w.animT += dt;
      var heading = Math.atan2(dx, dz);
      var nx = gx + Math.sin(heading) * w.speed * dt;
      var nz = gz + Math.cos(heading) * w.speed * dt;
      var res = FL.city.resolveCircle(nx, nz, 0.5);
      w.g.position.x = res.x;
      w.g.position.z = res.z;
      w.g.rotation.y = heading;
      w.g.userData.setPose('walk', w.animT, 0.4);
    });
  }

  // --- Fishermen (v8): two NPCs who walk the pier with fishing rods ---
  // They stroll the quay edge (z ~269) from end to end, pausing every few
  // seconds to face the water and cast (a small splash particle).
  function buildFishermen() {
    var spots = [{ x: -200, z: 269 }, { x: 160, z: 269 }];
    spots.forEach(function (spot) {
      if (FL.city.isBlocked(spot.x, spot.z, 1)) return;
      var g = FL.makeHumanoid({ skin: 0xb87a52, shirt: 0x2d7ac2, pants: 0x3a2a1a, hair: 0x8a6a2a });
      // A fishing rod: a thin pole held over the shoulder.
      var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4),
        new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
      rod.position.set(0.5, 1.6, 0);
      rod.rotation.z = -0.9;
      g.add(rod);
      g.position.set(spot.x, 0, spot.z);
      D.scene.add(g);
      D.fishermen.push({
        g: g, animT: Math.random() * 10,
        dir: Math.random() < 0.5 ? 1 : -1, speed: 1.2,
        minX: -280, maxX: 280, z: 269, castT: FL.rand(4, 10),
      });
    });
  }
  function updateFishermen(dt) {
    D.fishermen.forEach(function (f) {
      f.animT += dt;
      f.castT -= dt;
      if (f.castT <= 0) {
        // Pause to cast: face the water (south, +z) and splash.
        f.castT = FL.rand(6, 14);
        f.g.rotation.y = 0;
        f.g.userData.setPose('idle', f.animT, 0);
        FL.particles.spawn(f.g.position.x, 0.4, f.g.position.z + 3,
          { color: 0xdfe9f5, size: 0.5, life: 0.5, vy: 1, spread: 1 });
        return;
      }
      var nx = f.g.position.x + f.dir * f.speed * dt;
      if (nx > f.maxX) { nx = f.maxX; f.dir = -1; }
      if (nx < f.minX) { nx = f.minX; f.dir = 1; }
      var res = FL.city.resolveCircle(nx, f.z, 0.5);
      f.g.position.x = res.x;
      f.g.position.z = res.z;
      f.g.rotation.y = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.g.userData.setPose('walk', f.animT, 0.4);
    });
  }

  // --- Island helipad (the helicopter's home) ---
  function buildHelipad() {
    var pad = new THREE.Mesh(new THREE.CircleGeometry(7, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.9 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(140, 0.85, 285);
    D.scene.add(pad);
    var ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 7, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(140, 0.87, 285);
    D.scene.add(ring);
    // The "H": two posts + a crossbar, flat on the pad.
    var hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [[-1.6, 0], [1.6, 0]].forEach(function (o) {
      var post = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4.5), hMat);
      post.rotation.x = -Math.PI / 2;
      post.position.set(140 + o[0], 0.88, 285);
      D.scene.add(post);
    });
    var bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), hMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(140, 0.88, 285);
    D.scene.add(bar);
    // Corner lights (pulse at night).
    [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(function (o) {
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0x51ff7a, emissive: 0x51ff7a, emissiveIntensity: 2 }));
      lamp.position.set(140 + o[0], 1.1, 285 + o[1]);
      D.scene.add(lamp);
      D.padLights.push(lamp);
    });
  }

  // --- Collectible dock crates (+$100 each, $250 bonus for all five) ---
  var CRATE_SPOTS = [
    { x: -200, z: 266 }, { x: -80, z: 266 }, { x: 20, z: 266 },
    { x: 140, z: 266 }, { x: 260, z: 266 },
  ];
  function buildCrates() {
    CRATE_SPOTS.forEach(function (spot) {
      if (FL.city.isBlocked(spot.x, spot.z, 1)) return;
      var crate = dockBox(1.2, 1.2, 1.2,
        new THREE.MeshStandardMaterial({ color: 0xd8a02d, emissive: 0xd8a02d, emissiveIntensity: 0.5, roughness: 0.6 }),
        spot.x, 0.6, spot.z);
      D.scene.add(crate);
      D.crates.push({ mesh: crate, x: spot.x, z: spot.z, taken: false });
      D.placed.crates++;
    });
  }
  function updateCrates() {
    var pp = D.game.player.position;
    D.crates.forEach(function (c) {
      if (c.taken) return;
      c.mesh.rotation.y += 0.01;
      if (FL.dist2(pp.x, pp.z, c.x, c.z) < 4) {
        c.taken = true;
        D.scene.remove(c.mesh);
        D.collected++;
        D.game.addMoney(100);
        FL.audio.pickup();
        FL.particles.burst(c.x, 1.0, c.z, 10, { color: 0xffd75e, size: 0.6, life: 0.6, spread: 3 });
        FL.emit('notif', 'Peti Docks: +' + FL.fmtMoney(100) + ' (' + D.collected + '/' + D.crates.length + ')');
        if (D.collected >= D.crates.length && D.crates.length > 0) {
          D.game.addMoney(250);
          FL.emit('notif', 'Semua peti Docks terkumpul! Bonus +$250');
          FL.audio.mission();
        }
      }
    });
  }

  // --- Init / per-frame update ---
  FL.docks.init = function (scene, game) {
    D.scene = scene;
    D.game = game;
    WAREHOUSE_SPOTS.forEach(function (spot) {
      if (footprintClear(spot.x, spot.z, 9.5, 6.5)) buildWarehouse(spot);
    });
    for (var i = 0; i < CRANE_SPOTS.length; i++) {
      if (footprintClear(CRANE_SPOTS[i].x, CRANE_SPOTS[i].z, 5.5, 2.5)) {
        buildCrane(CRANE_SPOTS[i]);
        break;
      }
    }
    buildShip();
    buildContainers();
    buildWorkers();
    buildFishermen();
    buildHelipad();
    buildCrates();
  };
  FL.docks.update = function (dt) {
    if (!D.game || !D.game.player) return;
    // Crane jib sweeps slowly; the hook rides up and down.
    if (D.craneJib) {
      D.craneT += dt;
      D.craneJib.rotation.y = Math.sin(D.craneT * 0.12) * 0.6;
      D.craneHook.position.y = -10.5 + Math.sin(D.craneT * 0.25) * 3;
    }
    // The ship rides the swell.
    if (D.ship) {
      D.shipT += dt;
      D.ship.position.y = Math.sin(D.shipT * 0.5) * 0.3;
      D.ship.rotation.z = Math.sin(D.shipT * 0.35) * 0.02;
      D.ship.rotation.x = Math.sin(D.shipT * 0.42) * 0.01;
    }
    // Helipad lights pulse.
    D.padT += dt;
    var glow = 1.4 + Math.sin(D.padT * 2.5) * 0.8;
    D.padLights.forEach(function (lamp) { lamp.material.emissiveIntensity = glow; });
    updateWorkers(dt);
    updateFishermen(dt);
    updateCrates();
  };
})();
