// FROSTLINE 3D — world: traffic AI, pedestrian AI, combat, gangs, the wanted
// system (0-5 stars), police (foot/car/SWAT/helicopter), WASTED/BUSTED.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var world = {
    scene: null, traffic: [], peds: [], policeCars: [], footCops: [],
    gangs: [], pickups: [], tracers: [], heli: null, heliLight: null,
    wanted: 0, wantedTimer: 0, evadeTimer: 0, seenTimer: 0,
    lastKnown: { x: 0, z: 0 }, heliLoseTimer: 0, alerted: false, unseenTimer: 0,
    lightPhase: 0, lightTimer: 0, player: null, game: null,
    roadblocks: [], swatSpawned: false,
  };
  FL.world = world;

  var SKINS = [0xd8a07a, 0xb87a52, 0x8a5a34, 0xf0c8a0, 0x6a4630];
  var SHIRTS = [0x3a6ac2, 0xc22d4a, 0x2d8a4a, 0xd8a02d, 0x7a4ac2, 0x2d8a8a, 0x8a8a8a, 0xc2702d];
  var PANTS = [0x2a3348, 0x3a2a1a, 0x1a2a3a, 0x4a4a4a, 0x2a4a2a];

  function randomPedLook() {
    return { skin: FL.pick(SKINS), shirt: FL.pick(SHIRTS), pants: FL.pick(PANTS), hair: FL.pick([0x1a1a1a, 0x4a2a1a, 0x8a6a2a, 0xd8d8d8, 0x2a2a4a]) };
  }

  // --- Tracers (pooled lines) ---
  var tracerPool = [];
  function initTracers(scene) {
    for (var i = 0; i < 24; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0 }));
      line.visible = false;
      scene.add(line);
      tracerPool.push({ line: line, life: 0 });
    }
  }
  function fireTracer(from, to) {
    for (var i = 0; i < tracerPool.length; i++) {
      var t = tracerPool[i];
      if (t.life > 0) continue;
      var pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 0.9;
      t.life = 0.07;
      return;
    }
  }
  function updateTracers(dt) {
    for (var i = 0; i < tracerPool.length; i++) {
      var t = tracerPool[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.line.visible = false; t.line.material.opacity = 0; }
    }
  }

  // Ray vs sphere (for hit detection, no Raycaster needed).
  function raySphere(origin, dir, cx, cy, cz, r) {
    var ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
    var t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0) return -1;
    var d2 = ox * ox + oy * oy + oz * oz - t * t;
    if (d2 > r * r) return -1;
    return t - Math.sqrt(r * r - d2);
  }

  // --- Traffic ---
  function spawnTrafficCar() {
    var types = ['sedan', 'sedan', 'sports', 'suv', 'truck', 'bus'];
    var type = FL.pick(types);
    var p = FL.city.randomRoadPoint();
    var heading = FL.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    var v = new FL.Vehicle(type, p.x, p.z, heading);
    v.driver = { ai: true };
    var from = FL.city.nearestNode(p.x, p.z);
    var to = FL.randInt(0, FL.city.navNodes.length - 1);
    var car = {
      v: v, path: FL.city.findPath(from, to), pathIdx: 1,
      speed: FL.rand(7, 11), honkTimer: 0, brakeTimer: 0, waitLight: 0,
    };
    world.scene.add(v.group);
    world.traffic.push(car);
    return car;
  }
  function updateTraffic(dt) {
    // Maintain count (spawn outside the player's view).
    if (world.traffic.length < FL.CFG.maxTraffic && Math.random() < dt * 2) {
      spawnTrafficCar();
    }
    for (var i = world.traffic.length - 1; i >= 0; i--) {
      var car = world.traffic[i];
      var v = car.v;
      if (v.dead) {
        // Burning wreck: remove after a while.
        car.wreckTimer = (car.wreckTimer || 0) + dt;
        if (car.wreckTimer > 20) { world.scene.remove(v.group); world.traffic.splice(i, 1); }
        continue;
      }
      var pp = world.player ? world.player.position : { x: 0, z: 0 };
      var distToPlayer = Math.sqrt(FL.dist2(v.group.position.x, v.group.position.z, pp.x, pp.z));
      // Despawn far cars, respawn near.
      if (distToPlayer > 260) {
        world.scene.remove(v.group);
        world.traffic.splice(i, 1);
        continue;
      }
      // Follow the path (node to node, right-hand lane offset).
      var path = car.path;
      var target = path[Math.min(car.pathIdx, path.length - 1)];
      var node = FL.city.navNodes[target];
      var dx = node.x - v.group.position.x, dz = node.z - v.group.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 6) {
        car.pathIdx++;
        if (car.pathIdx >= path.length) {
          var from = FL.city.nearestNode(v.group.position.x, v.group.position.z);
          var to = FL.randInt(0, FL.city.navNodes.length - 1);
          car.path = FL.city.findPath(from, to);
          car.pathIdx = 1;
        }
      }
      var wantHeading = Math.atan2(dx, dz);
      var steer = FL.clamp(FL.wrapAngle(wantHeading - v.heading) * 1.5, -1, 1);
      // Traffic light: stop at red when near an intersection.
      var lightNS = world.lightPhase === 0; // NS green when phase 0
      var movingNS = Math.abs(dz) > Math.abs(dx);
      var nearNode = dist < 14;
      var redLight = nearNode && ((movingNS && !lightNS) || (!movingNS && lightNS));
      // Brake if something is ahead (car/ped within 10m in front).
      var fwd = v.forward();
      var aheadX = v.group.position.x + fwd.x * 9, aheadZ = v.group.position.z + fwd.z * 9;
      var blocked = false;
      for (var j = 0; j < world.traffic.length; j++) {
        if (j === i) continue;
        var o = world.traffic[j].v;
        if (FL.dist2(o.group.position.x, o.group.position.z, aheadX, aheadZ) < 16) { blocked = true; break; }
      }
      if (!blocked && world.player && !world.player.inCar) {
        if (FL.dist2(world.player.position.x, world.player.position.z, aheadX, aheadZ) < 9) blocked = true;
      }
      if (blocked) {
        car.honkTimer -= dt;
        if (car.honkTimer <= 0) { car.honkTimer = 2.5; if (distToPlayer < 60) FL.audio.horn(); }
      }
      var throttle = !redLight && !blocked;
      v.update(dt, { throttle: throttle, brake: redLight || blocked, steer: steer });
      // Stuck: teleport to the nearest road.
      if (v.stuckTimer > 0 && Math.random() < dt * 0.1) { /* handled by event */ }
    }
  }

  // --- Pedestrians ---
  function spawnPed() {
    var p = FL.city.randomSidewalkPoint();
    var g = FL.makeHumanoid(randomPedLook());
    g.position.set(p.x, 0, p.z);
    var from = FL.city.nearestNode(p.x, p.z);
    var to = FL.randInt(0, FL.city.navNodes.length - 1);
    var ped = {
      g: g, path: FL.city.findPath(from, to), pathIdx: 1,
      speed: FL.rand(1.1, 1.8), hp: 100, dead: false,
      panic: 0, panicDir: { x: 0, z: 0 }, animT: Math.random() * 10,
      isCop: false, isGang: false,
    };
    world.scene.add(g);
    world.peds.push(ped);
    return ped;
  }
  function updatePeds(dt) {
    if (world.peds.length < FL.CFG.maxPeds && Math.random() < dt * 3) spawnPed();
    var pp = world.player ? world.player.position : { x: 0, z: 0 };
    for (var i = world.peds.length - 1; i >= 0; i--) {
      var ped = world.peds[i];
      if (ped.dead) {
        ped.deadTimer = (ped.deadTimer || 0) + dt;
        if (ped.deadTimer > 12) { world.scene.remove(ped.g); world.peds.splice(i, 1); }
        continue;
      }
      var distToPlayer = Math.sqrt(FL.dist2(ped.g.position.x, ped.g.position.z, pp.x, pp.z));
      if (distToPlayer > 200) { world.scene.remove(ped.g); world.peds.splice(i, 1); continue; }
      ped.animT += dt;
      var speed = ped.speed;
      var heading = ped.g.rotation.y;
      if (ped.panic > 0) {
        // Flee from the panic source.
        ped.panic -= dt;
        speed = 5.5;
        heading = Math.atan2(ped.panicDir.x, ped.panicDir.z);
        ped.g.rotation.y = heading;
        var nx = ped.g.position.x + Math.sin(heading) * speed * dt;
        var nz = ped.g.position.z + Math.cos(heading) * speed * dt;
        var res = FL.city.resolveCircle(nx, nz, 0.5);
        ped.g.position.x = res.x; ped.g.position.z = res.z;
        ped.g.userData.setPose('run', ped.animT, 1);
        continue;
      }
      var path = ped.path;
      var target = path[Math.min(ped.pathIdx, path.length - 1)];
      var node = FL.city.navNodes[target];
      // Walk on the sidewalk (offset from the road centre).
      var dx = node.x - ped.g.position.x, dz = node.z - ped.g.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 4) {
        ped.pathIdx++;
        if (ped.pathIdx >= path.length) {
          var from = FL.city.nearestNode(ped.g.position.x, ped.g.position.z);
          var to = FL.randInt(0, FL.city.navNodes.length - 1);
          ped.path = FL.city.findPath(from, to);
          ped.pathIdx = 1;
        }
      }
      var wantHeading = Math.atan2(dx, dz);
      ped.g.rotation.y = FL.angleLerp(ped.g.rotation.y, wantHeading, Math.min(1, dt * 6));
      var mx = ped.g.position.x + Math.sin(ped.g.rotation.y) * speed * dt;
      var mz = ped.g.position.z + Math.cos(ped.g.rotation.y) * speed * dt;
      var res2 = FL.city.resolveCircle(mx, mz, 0.5);
      ped.g.position.x = res2.x; ped.g.position.z = res2.z;
      ped.g.userData.setPose('walk', ped.animT, 0.5);
    }
  }
  FL.world.panicNearby = function (x, z, radius) {
    world.peds.forEach(function (ped) {
      if (ped.dead) return;
      var d2 = FL.dist2(ped.g.position.x, ped.g.position.z, x, z);
      if (d2 < radius * radius) {
        ped.panic = 3 + Math.random() * 3;
        var dx = ped.g.position.x - x, dz = ped.g.position.z - z;
        var len = Math.sqrt(dx * dx + dz * dz) || 1;
        ped.panicDir = { x: dx / len, z: dz / len };
      }
    });
  };

  // --- Combat ---
  var muzzleFlash = null, muzzleLight = null;
  function initCombatFx(scene) {
    muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: null, color: 0xffdd88, transparent: true, opacity: 0, depthWrite: false,
    }));
    // Reuse the particle texture via a tiny canvas.
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    muzzleFlash.material.map = new THREE.CanvasTexture(c);
    muzzleFlash.scale.set(1.4, 1.4, 1);
    muzzleFlash.visible = false;
    scene.add(muzzleFlash);
    muzzleLight = new THREE.PointLight(0xffc46b, 0, 12, 1.5);
    scene.add(muzzleLight);
  }
  FL.world.playerShoot = function (origin, dir, weapon) {
    if (!origin || !dir) return;
    FL.audio.shoot(weapon.id === 'shotgun' ? 'shotgun' : (weapon.id === 'smg' ? 'smg' : 'pistol'));
    // Muzzle flash at the gun tip.
    var tip = { x: origin.x + dir.x * 1.2, y: 1.4, z: origin.z + dir.z * 1.2 };
    if (muzzleFlash) {
      muzzleFlash.position.set(tip.x, tip.y, tip.z);
      muzzleFlash.visible = true;
      muzzleFlash.material.opacity = 0.95;
      setTimeout(function () { if (muzzleFlash) { muzzleFlash.visible = false; muzzleFlash.material.opacity = 0; } }, 50);
    }
    if (muzzleLight) {
      muzzleLight.position.set(tip.x, tip.y, tip.z);
      muzzleLight.intensity = 24;
      setTimeout(function () { if (muzzleLight) muzzleLight.intensity = 0; }, 60);
    }
    var pellets = weapon.pellets || 1;
    for (var p = 0; p < pellets; p++) {
      var d = {
        x: dir.x + (Math.random() - 0.5) * weapon.spread * 2,
        y: (dir.y || 0) + (Math.random() - 0.5) * weapon.spread * 2,
        z: dir.z + (Math.random() - 0.5) * weapon.spread * 2,
      };
      var len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1;
      d.x /= len; d.y /= len; d.z /= len;
      var bestT = weapon.range, hit = null, hitKind = null;
      // Test peds, gangs, cops, vehicles (sphere tests).
      function testList(list, getPos, radius, kind) {
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          if (e.dead) continue;
          var pos = getPos(e);
          var t = raySphere(origin, d, pos.x, pos.y, pos.z, radius);
          if (t > 0 && t < bestT) { bestT = t; hit = e; hitKind = kind; }
        }
      }
      testList(world.peds, function (e) { return { x: e.g.position.x, y: 1.2, z: e.g.position.z }; }, 0.8, 'ped');
      testList(world.gangs, function (e) { return { x: e.g.position.x, y: 1.2, z: e.g.position.z }; }, 0.8, 'gang');
      testList(world.footCops, function (e) { return { x: e.g.position.x, y: 1.2, z: e.g.position.z }; }, 0.8, 'cop');
      testList(world.traffic, function (e) { return { x: e.v.group.position.x, y: 1.0, z: e.v.group.position.z }; }, 2.2, 'car');
      testList(world.policeCars, function (e) { return { x: e.v.group.position.x, y: 1.0, z: e.v.group.position.z }; }, 2.2, 'policecar');
      // Wall hit: check building AABBs along the ray (coarse: step march).
      var wallT = -1;
      for (var s = 2; s < weapon.range; s += 2) {
        var px = origin.x + d.x * s, pz = origin.z + d.z * s;
        if (FL.city.isBlocked(px, pz, 0.2)) { wallT = s; break; }
      }
      if (wallT > 0 && wallT < bestT) { bestT = wallT; hit = null; hitKind = 'wall'; }
      var end = { x: origin.x + d.x * bestT, y: (origin.y || 1.4) + (d.y || 0) * bestT, z: origin.z + d.z * bestT };
      fireTracer(tip, end);
      if (hitKind === 'wall') {
        FL.particles.burst(end.x, end.y, end.z, 4, { color: 0xffd88a, size: 0.4, life: 0.3, spread: 3 });
      } else if (hit) {
        FL.particles.burst(end.x, end.y, end.z, 5, { color: 0xffcc66, size: 0.5, life: 0.35, spread: 3 });
        if (hitKind === 'ped') {
          hit.hp -= weapon.damage;
          if (hit.hp <= 0 && !hit.dead) {
            hit.dead = true;
            hit.g.userData.setPose('fall', 0, 0);
            FL.world.addWanted(1, 'ped down');
            FL.emit('notif', 'Pedestrian down — wanted level up');
          } else {
            hit.panic = 4;
            hit.panicDir = { x: hit.g.position.x - origin.x, z: hit.g.position.z - origin.z };
            var l = Math.sqrt(hit.panicDir.x * hit.panicDir.x + hit.panicDir.z * hit.panicDir.z) || 1;
            hit.panicDir.x /= l; hit.panicDir.z /= l;
          }
        } else if (hitKind === 'gang') {
          hit.hp -= weapon.damage;
          if (hit.hp <= 0 && !hit.dead) {
            hit.dead = true;
            hit.g.userData.setPose('fall', 0, 0);
            FL.emit('gang-down', hit);
          }
        } else if (hitKind === 'cop') {
          hit.hp -= weapon.damage;
          FL.world.addWanted(1, 'cop down');
          if (hit.hp <= 0 && !hit.dead) {
            hit.dead = true;
            hit.g.userData.setPose('fall', 0, 0);
          }
        } else if (hitKind === 'car' || hitKind === 'policecar') {
          hit.v.damage(weapon.damage * 0.6);
        }
      }
    }
    // Noise panics nearby peds.
    FL.world.panicNearby(origin.x, origin.z, 30);
  };

  // --- Gangs (mission enemies) ---
  FL.world.spawnGang = function (x, z, count) {
    var spawned = [];
    for (var i = 0; i < count; i++) {
      var gx = x + (Math.random() - 0.5) * 14, gz = z + (Math.random() - 0.5) * 14;
      var res = FL.city.resolveCircle(gx, gz, 0.6);
      var g = FL.makeHumanoid({ skin: FL.pick(SKINS), shirt: 0x8a1a1a, pants: 0x1a1a1a, hair: 0x1a1a1a });
      g.position.set(res.x, 0, res.z);
      var gang = { g: g, hp: 80, dead: false, shootTimer: Math.random() * 2, animT: Math.random() * 10, cover: null };
      world.scene.add(g);
      world.gangs.push(gang);
      spawned.push(gang);
    }
    return spawned;
  };
  function updateGangs(dt) {
    if (!world.player) return;
    var pp = world.player.position;
    for (var i = world.gangs.length - 1; i >= 0; i--) {
      var gang = world.gangs[i];
      if (gang.dead) {
        gang.deadTimer = (gang.deadTimer || 0) + dt;
        if (gang.deadTimer > 10) { world.scene.remove(gang.g); world.gangs.splice(i, 1); }
        continue;
      }
      gang.animT += dt;
      var dx = pp.x - gang.g.position.x, dz = pp.z - gang.g.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      gang.g.rotation.y = Math.atan2(dx, dz);
      // Seek cover: strafe to a nearby building edge if too exposed; else shoot.
      gang.shootTimer -= dt;
      if (dist < 45 && gang.shootTimer <= 0 && !world.player.inCar) {
        gang.shootTimer = 0.9 + Math.random() * 0.9;
        // Inaccurate shot at the player.
        var hitChance = FL.clamp(0.45 - dist * 0.006, 0.08, 0.4);
        var from = { x: gang.g.position.x, y: 1.4, z: gang.g.position.z };
        var to = { x: pp.x + (Math.random() - 0.5) * 2, y: 1.2, z: pp.z + (Math.random() - 0.5) * 2 };
        fireTracer(from, to);
        FL.audio.shoot('smg');
        if (Math.random() < hitChance) {
          FL.emit('player-damage', { amount: 8 + Math.random() * 8, from: 'gang' });
        }
        gang.g.userData.setPose('shoot', gang.animT, 0);
      } else if (dist > 30) {
        // Close the distance.
        var nx = gang.g.position.x + Math.sin(gang.g.rotation.y) * 4 * dt;
        var nz = gang.g.position.z + Math.cos(gang.g.rotation.y) * 4 * dt;
        var res = FL.city.resolveCircle(nx, nz, 0.5);
        gang.g.position.x = res.x; gang.g.position.z = res.z;
        gang.g.userData.setPose('run', gang.animT, 0.8);
      } else {
        gang.g.userData.setPose('shoot', gang.animT, 0);
      }
    }
  }

  // --- Wanted system + police ---
  FL.world.addWanted = function (n, reason) {
    var before = world.wanted;
    world.wanted = FL.clamp(world.wanted + n, 0, 5);
    world.evadeTimer = 0;
    world.seenTimer = 0;
    world.alerted = true; // a fresh crime re-alerts the police
    world.unseenTimer = 0;
    // The crime scene is the last known position — without this, the police
    // fell back to the player's LIVE position (perfect knowledge) and
    // evasion was impossible.
    if (world.player) {
      world.lastKnown = { x: world.player.position.x, z: world.player.position.z };
    }
    if (world.wanted > before) {
      FL.emit('wanted-change', world.wanted);
      FL.emit('notif', 'Wanted level ' + world.wanted + ' star' + (world.wanted > 1 ? 's' : ''));
    }
    if (world.wanted >= 3 && world.roadblocks.length === 0) world.spawnRoadblock();
    if (world.wanted >= 4 && !world.swatSpawned) { world.swatSpawned = true; world.spawnSwat(); }
    if (world.wanted >= 5 && !world.heli) world.spawnHeli();
  };
  FL.world.clearWanted = function () {
    world.wanted = 0;
    world.evadeTimer = 0;
    world.alerted = false;
    world.unseenTimer = 0;
    FL.emit('wanted-change', 0);
  };
  function spawnPoliceCar(nearPlayer) {
    // Reinforcements rally to the last known position when the player is
    // unseen — they never materialise next to a hiding player. The sight
    // flag is set by updatePolice each step (world.playerSeen).
    var anchor = (nearPlayer && world.player) ? world.player.position : null;
    if (anchor && world.lastKnown && world.playerSeen === false) anchor = world.lastKnown;
    var p = anchor
      ? { x: anchor.x + (Math.random() < 0.5 ? -1 : 1) * FL.rand(40, 70), z: anchor.z + (Math.random() < 0.5 ? -1 : 1) * FL.rand(40, 70) }
      : FL.city.randomRoadPoint();
    var rp = FL.city.nearestRoadPoint(p.x, p.z);
    var v = new FL.Vehicle('police', rp.x, rp.z, Math.random() * Math.PI * 2);
    v.sirenOn = true;
    var car = { v: v, ramTimer: 0 };
    world.scene.add(v.group);
    world.policeCars.push(car);
    return car;
  }
  function spawnFootCop(x, z) {
    var g = FL.makeHumanoid({ skin: FL.pick(SKINS), shirt: 0x1a2a4a, pants: 0x1a2a4a, hair: 0x1a1a1a });
    g.position.set(x, 0, z);
    var cop = { g: g, hp: 100, dead: false, animT: Math.random() * 10, shootTimer: 1 };
    world.scene.add(g);
    world.footCops.push(cop);
    return cop;
  }
  FL.world.spawnRoadblock = function () {
    if (!world.player) return;
    var pp = world.player.position;
    var ahead = FL.city.nearestRoadPoint(pp.x + 30, pp.z);
    for (var i = 0; i < 2; i++) {
      var v = new FL.Vehicle('police', ahead.x + (i - 0.5) * 8, ahead.z, Math.PI / 2);
      v.sirenOn = true;
      world.scene.add(v.group);
      world.policeCars.push({ v: v, roadblock: true, ramTimer: 0 });
      world.roadblocks.push(v);
    }
    FL.emit('notif', 'Roadblock ahead!');
  };
  FL.world.spawnSwat = function () {
    if (!world.player) return;
    var pp = world.player.position;
    var v = new FL.Vehicle('truck', pp.x + 30, pp.z + 10, 0);
    v.sirenOn = true;
    world.scene.add(v.group);
    world.policeCars.push({ v: v, swat: true, ramTimer: 0 });
    for (var i = 0; i < 4; i++) spawnFootCop(pp.x + (Math.random() - 0.5) * 20, pp.z + (Math.random() - 0.5) * 20);
    FL.emit('notif', 'SWAT deployed!');
  };
  FL.world.spawnHeli = function () {
    if (world.heli || !world.scene) return;
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5, metalness: 0.5 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 6), bodyMat);
    g.add(body);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4), bodyMat);
    tail.position.set(0, 0.3, -4.5); g.add(tail);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    rotor.position.y = 1.1; g.add(rotor);
    g.userData.rotor = rotor;
    var light = new THREE.SpotLight(0xfff2b8, 400, 60, 0.35, 0.5, 1.2);
    light.position.set(0, -0.5, 0);
    g.add(light);
    g.add(light.target);
    g.userData.light = light;
    world.heli = g;
    world.scene.add(g);
    FL.emit('notif', 'Police helicopter overhead!');
  };
  function updatePolice(dt) {
    if (!world.player) return;
    var pp = world.player.position;
    var wanted = world.wanted;
    // Nearest police distance FIRST — it drives sight, spawning and evasion.
    var nearestPolice = Infinity;
    world.policeCars.forEach(function (c) {
      var d = Math.sqrt(FL.dist2(c.v.group.position.x, c.v.group.position.z, pp.x, pp.z));
      if (d < nearestPolice) nearestPolice = d;
    });
    world.footCops.forEach(function (c) {
      var d = Math.sqrt(FL.dist2(c.g.position.x, c.g.position.z, pp.x, pp.z));
      if (d < nearestPolice) nearestPolice = d;
    });
    // "Seen" = a police unit is close enough to spot the player. While seen,
    // the police know exactly where the player is; once unseen they only
    // remember the LAST KNOWN position and drive there to search.
    var seen = nearestPolice < 110;
    world.playerSeen = seen; // read by the spawn helpers below
    if (seen) {
      world.lastKnown = { x: pp.x, z: pp.z };
      world.evadeTimer = 0;
      world.heliLoseTimer = 0;
      world.unseenTimer = 0;
      world.seenTimer += dt;
    } else {
      // Unseen for a while: the police lose the trail and stop sending
      // fresh units. (A new crime re-alerts them via addWanted.)
      world.unseenTimer += dt;
      if (world.unseenTimer > 5) world.alerted = false;
    }
    // Maintain police presence by wanted level — but NEVER spawn fresh units
    // on top of a hiding player (that made evasion impossible).
    var wantCars = wanted === 0 ? 0 : (wanted === 1 ? 1 : (wanted === 2 ? 2 : (wanted === 3 ? 3 : 4)));
    var wantCops = wanted >= 2 ? Math.min(6, wanted * 2) : 0;
    var spawning = wanted > 0 && world.alerted;
    if (spawning && world.policeCars.length < wantCars && Math.random() < dt * 2) spawnPoliceCar(true);
    if (spawning && world.footCops.length < wantCops && Math.random() < dt * 2) {
      var copAnchor = (!seen && world.lastKnown) ? world.lastKnown : pp;
      spawnFootCop(copAnchor.x + (Math.random() < 0.5 ? -1 : 1) * FL.rand(60, 100), copAnchor.z + (Math.random() < 0.5 ? -1 : 1) * FL.rand(60, 100));
    }
    // Evasion: hidden while no police is near. The helicopter keeps the player
    // "seen" for 10 s, then loses the trail and leaves.
    if (wanted > 0 && !seen) {
      if (world.heli) {
        world.heliLoseTimer += dt;
        if (world.heliLoseTimer > 10) {
          world.scene.remove(world.heli);
          world.heli = null;
          world.heliLoseTimer = 0;
          FL.emit('notif', 'Helikopter kehilangan jejakmu');
        }
      } else {
        world.evadeTimer += dt;
        world.seenTimer = 0;
        if (world.evadeTimer > 8) {
          world.wanted = Math.max(0, world.wanted - 1);
          world.evadeTimer = 0;
          FL.emit('wanted-change', world.wanted);
          if (world.wanted === 0) {
            FL.emit('notif', 'You evaded the police');
            world.roadblocks = [];
            world.swatSpawned = false;
            world.alerted = false;
          }
        }
      }
    }
    // Police cars chase the player while seen, else the last known position.
    var chaseTarget = seen ? pp : (world.lastKnown || pp);
    for (var i = world.policeCars.length - 1; i >= 0; i--) {
      var car = world.policeCars[i];
      var v = car.v;
      if (v.dead) {
        car.wreckTimer = (car.wreckTimer || 0) + dt;
        if (car.wreckTimer > 15) { world.scene.remove(v.group); world.policeCars.splice(i, 1); }
        continue;
      }
      if (wanted === 0 && !car.roadblock) {
        // Stand down: drive away, despawn when far.
        var dFar = Math.sqrt(FL.dist2(v.group.position.x, v.group.position.z, pp.x, pp.z));
        if (dFar > 160) { world.scene.remove(v.group); world.policeCars.splice(i, 1); continue; }
      }
      var dx = chaseTarget.x - v.group.position.x, dz = chaseTarget.z - v.group.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var wantHeading = Math.atan2(dx, dz);
      var steer = FL.clamp(FL.wrapAngle(wantHeading - v.heading) * 2, -1, 1);
      // If the player is unseen and the car reached the last known spot, it
      // slows to a search crawl instead of knowing exactly where to go.
      var throttle = dist > 4;
      if (!seen && dist < 12) throttle = false;
      // PIT: if alongside the player's car, steer into it.
      if (seen && world.player.inCar && dist < 8) {
        car.ramTimer += dt;
        if (car.ramTimer > 1.5) { car.ramTimer = 0; steer = steer * 1.5; }
      }
      v.update(dt, { throttle: throttle, brake: false, steer: steer });
      // Ram damage to the player's car.
      if (seen && world.player.inCar && dist < 4.5) {
        var pv = world.player.vehicle;
        if (pv && Math.abs(v.speed) > 5) {
          pv.damage(4 * dt * 10);
          if (Math.random() < dt * 2) FL.audio.crash(false);
        }
      }
    }
    // Foot cops chase; arrest if close and the player is slow.
    for (var j = world.footCops.length - 1; j >= 0; j--) {
      var cop = world.footCops[j];
      if (cop.dead) {
        cop.deadTimer = (cop.deadTimer || 0) + dt;
        if (cop.deadTimer > 10) { world.scene.remove(cop.g); world.footCops.splice(j, 1); }
        continue;
      }
      cop.animT += dt;
      // Foot cops run to the chase target (player while seen, last known spot
      // while unseen); arrest/shoot only when actually close to the player.
      var cdx = chaseTarget.x - cop.g.position.x, cdz = chaseTarget.z - cop.g.position.z;
      var cdist = Math.sqrt(cdx * cdx + cdz * cdz);
      var distToPlayer = Math.sqrt(FL.dist2(pp.x, pp.z, cop.g.position.x, cop.g.position.z));
      if (wanted === 0) {
        if (distToPlayer > 120) { world.scene.remove(cop.g); world.footCops.splice(j, 1); continue; }
        cop.g.userData.setPose('walk', cop.animT, 0.4);
        continue;
      }
      cop.g.rotation.y = Math.atan2(cdx, cdz);
      if (cdist > 2.2) {
        var sp = 6.5;
        var nx = cop.g.position.x + Math.sin(cop.g.rotation.y) * sp * dt;
        var nz = cop.g.position.z + Math.cos(cop.g.rotation.y) * sp * dt;
        var res = FL.city.resolveCircle(nx, nz, 0.5);
        cop.g.position.x = res.x; cop.g.position.z = res.z;
        cop.g.userData.setPose('run', cop.animT, 0.9);
      } else if (distToPlayer < 3) {
        // Arrest attempt (player on foot and slow) or shoot at 3+ stars.
        if (!world.player.inCar && wanted >= 1) {
          var playerSpeed = world.player.speed || 0;
          if (playerSpeed < 2) {
            FL.emit('busted', {});
          }
        }
        if (wanted >= 3 && !world.player.inCar) {
          cop.shootTimer -= dt;
          if (cop.shootTimer <= 0) {
            cop.shootTimer = 1.2 + Math.random();
            fireTracer(
              { x: cop.g.position.x, y: 1.4, z: cop.g.position.z },
              { x: pp.x, y: 1.2, z: pp.z }
            );
            FL.audio.shoot('pistol');
            if (Math.random() < 0.3) FL.emit('player-damage', { amount: 7, from: 'police' });
          }
        }
        cop.g.userData.setPose('idle', cop.animT, 0);
      }
    }
    // Helicopter follows the player while seen, else circles the last known
    // position with its searchlight.
    if (world.heli) {
      var h = world.heli;
      h.userData.rotor.rotation.y += dt * 22;
      var ht = seen ? pp : (world.lastKnown || pp);
      var hx = ht.x + Math.sin(performance.now() * 0.0004) * 14;
      var hz = ht.z + Math.cos(performance.now() * 0.0004) * 14;
      h.position.x = FL.damp(h.position.x, hx, 1.2, dt);
      h.position.z = FL.damp(h.position.z, hz, 1.2, dt);
      h.position.y = FL.damp(h.position.y, 42, 1.2, dt);
      h.userData.light.target.position.set(ht.x - h.position.x, -h.position.y, ht.z - h.position.z);
      h.lookAt(ht.x, h.position.y, ht.z);
      if (wanted === 0) { world.scene.remove(h); world.heli = null; }
    }
  }

  // --- Pickups ---
  FL.world.spawnPickup = function (kind, x, z) {
    var colors = { health: 0x51ff7a, armor: 0x5aa8ff, ammo: 0xffd75e, money: 0x7dff9a };
    var g = new THREE.Group();
    var boxM = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: colors[kind] || 0xffffff, emissive: colors[kind] || 0xffffff, emissiveIntensity: 1.2 }));
    boxM.rotation.y = Math.PI / 4;
    g.add(boxM);
    g.position.set(x, 1.0, z);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 30, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 15;
    g.add(beam);
    world.scene.add(g);
    var pk = { kind: kind, g: g, x: x, z: z, t: 0 };
    world.pickups.push(pk);
    return pk;
  };
  function updatePickups(dt) {
    if (!world.player) return;
    var pp = world.player.position;
    for (var i = world.pickups.length - 1; i >= 0; i--) {
      var pk = world.pickups[i];
      pk.t += dt;
      pk.g.rotation.y += dt * 2;
      pk.g.position.y = 1.0 + Math.sin(pk.t * 3) * 0.15;
      if (FL.dist2(pk.x, pk.z, pp.x, pp.z) < 2.6) {
        FL.emit('pickup', pk.kind);
        FL.audio.pickup();
        world.scene.remove(pk.g);
        world.pickups.splice(i, 1);
      }
    }
  }

  // --- Lifecycle ---
  FL.world.init = function (scene, game) {
    world.scene = scene;
    world.game = game;
    initTracers(scene);
    initCombatFx(scene);
    buildNavGraphRef();
    // Seed traffic + peds + a few pickups.
    for (var i = 0; i < 16; i++) spawnTrafficCar();
    for (var j = 0; j < 26; j++) spawnPed();
    for (var k = 0; k < 6; k++) {
      var p = FL.city.randomSidewalkPoint();
      FL.world.spawnPickup(FL.pick(['health', 'armor', 'ammo', 'money']), p.x, p.z);
    }
    FL.on('explosion', function (e) {
      FL.world.panicNearby(e.x, e.z, 40);
      // Chain damage to nearby vehicles.
      world.traffic.concat(world.policeCars).forEach(function (c) {
        var v = c.v;
        if (v.dead) return;
        var d2 = FL.dist2(v.group.position.x, v.group.position.z, e.x, e.z);
        if (d2 < e.radius * e.radius) v.damage(60);
      });
    });
    FL.on('vehicle-stuck', function (v) {
      var rp = FL.city.nearestRoadPoint(v.group.position.x, v.group.position.z);
      v.group.position.x = rp.x; v.group.position.z = rp.z;
      v.speed = 0; v.vx = 0; v.vz = 0;
    });
  };
  function buildNavGraphRef() { /* nav graph lives in FL.city */ }
  FL.world.update = function (dt) {
    // Traffic light cycle (12 s each way).
    world.lightTimer += dt;
    if (world.lightTimer > 12) { world.lightTimer = 0; world.lightPhase = 1 - world.lightPhase; }
    FL.guard('traffic', function () { updateTraffic(dt); });
    FL.guard('peds', function () { updatePeds(dt); });
    FL.guard('gangs', function () { updateGangs(dt); });
    FL.guard('police', function () { updatePolice(dt); });
    FL.guard('pickups', function () { updatePickups(dt); });
    updateTracers(dt);
  };
  FL.world.setPlayer = function (player) { world.player = player; };
})();
