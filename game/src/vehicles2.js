// FROSTLINE 3D — vehicles2 (v7): vehicles the base game does not have.
// A flyable helicopter (moored on the island helipad), a boat (moored by
// the causeway, for the harbor water), and a wheelie stunt for the existing
// motorbike. Both new vehicles speak the same duck-typed interface the
// player controller already uses (group, heading, speed, hp, dead, def,
// update(dt, input)), so entering, driving and exiting them needs no
// special case in the player code beyond the boardable-vehicle list.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var V2 = { scene: null, game: null, helis: [], boats: [], wheelieT: 0, wheeliePay: 0 };
  FL.vehicles2 = V2;

  // Shared box helper (local to this file — same shape as the entities one,
  // written independently so the module stands alone).
  function part(w, h, d, color, x, y, z, opts) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.5, metalness: 0.4 }, opts || {}))
    );
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }

  // --- Helicopter ---
  FL.makeHelicopter = function () {
    var g = new THREE.Group();
    var body = part(2.2, 1.6, 3.6, 0xd8d8d8, 0, 1.4, 0, { roughness: 0.35, metalness: 0.6 });
    g.add(body);
    var nose = part(1.8, 1.1, 1.0, 0x2d7ac2, 0, 1.3, 2.0, { roughness: 0.2, metalness: 0.7 });
    g.add(nose);
    var glass = part(1.9, 0.9, 0.9, 0x0e2238, 0, 1.7, 1.6, { roughness: 0.1, metalness: 0.8 });
    g.add(glass);
    var boom = part(0.5, 0.5, 4.2, 0xb8b8b8, 0, 1.6, -3.6);
    g.add(boom);
    var fin = part(0.18, 1.4, 0.9, 0xc22d4a, 0, 2.2, -5.4);
    g.add(fin);
    var tailRotor = new THREE.Group();
    var tr1 = part(0.08, 1.6, 0.12, 0x222222, 0, 0, 0);
    var tr2 = part(0.08, 0.12, 1.6, 0x222222, 0, 0, 0);
    tailRotor.add(tr1, tr2);
    tailRotor.position.set(0.4, 2.2, -5.4);
    g.add(tailRotor);
    // Main rotor: a hub + two long blades, spun in update().
    var rotor = new THREE.Group();
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 }));
    rotor.add(hub);
    var blade1 = part(9.5, 0.08, 0.5, 0x222222, 0, 0.1, 0);
    var blade2 = part(0.5, 0.08, 9.5, 0x222222, 0, 0.1, 0);
    rotor.add(blade1, blade2);
    rotor.position.set(0, 2.5, 0);
    g.add(rotor);
    // Skids.
    [-0.9, 0.9].forEach(function (x) {
      var skid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 }));
      skid.rotation.x = Math.PI / 2;
      skid.position.set(x, 0.35, 0);
      skid.castShadow = true;
      g.add(skid);
      [-1.1, 1.1].forEach(function (z) {
        var strut = part(0.12, 0.7, 0.12, 0x333333, x, 0.7, z);
        g.add(strut);
      });
    });
    // Navigation lights.
    var navL = part(0.2, 0.2, 0.2, 0xff2020, -1.15, 1.4, 0, { emissive: 0xff2020, emissiveIntensity: 2 });
    var navR = part(0.2, 0.2, 0.2, 0x20ff50, 1.15, 1.4, 0, { emissive: 0x20ff50, emissiveIntensity: 2 });
    g.add(navL, navR);
    g.userData.rotor = rotor;
    g.userData.tailRotor = tailRotor;
    return g;
  };

  FL.Helicopter = function (x, z) {
    this.isHeli = true;
    this.type = 'heli';
    this.def = { id: 'heli', name: 'Harbor Hawk', accel: 14, topSpeed: 42, grip: 8, mass: 1.2, color: 0xd8d8d8 };
    this.group = FL.makeHelicopter();
    this.group.position.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.hp = 100;
    this.dead = false;
    this.radius = 4.5;
    this.isPlayer = false;
    this.rotorSpeed = 0;
    this.steer = 0;
  };
  FL.Helicopter.prototype.forward = function () {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  };
  FL.Helicopter.prototype.update = function (dt, input) {
    if (this.dead) {
      // A dead helicopter falls out of the sky, then rests as a wreck.
      if (this.group.position.y > 0) {
        this.vy = Math.max(-18, this.vy - 22 * dt);
        this.group.position.y = Math.max(0, this.group.position.y + this.vy * dt);
      }
      this.rotorSpeed = Math.max(0, this.rotorSpeed - dt * 4);
      this.group.userData.rotor.rotation.y += this.rotorSpeed * dt;
      return;
    }
    var alt = this.group.position.y;
    // Rotor spool: full speed while flown, idle spin while parked.
    var targetRotor = this.isPlayer ? 26 : 4;
    this.rotorSpeed = FL.damp(this.rotorSpeed, targetRotor, 1.2, dt);
    this.group.userData.rotor.rotation.y += this.rotorSpeed * dt;
    this.group.userData.tailRotor.rotation.x += this.rotorSpeed * 1.6 * dt;
    // Vertical: Space ascends, X descends, otherwise hover.
    var wantVy = 0;
    if (input && input.handbrake) wantVy = 7;
    else if (FL.game && FL.game.keys && FL.game.keys['KeyX']) wantVy = -7;
    this.vy = FL.damp(this.vy, wantVy, 3, dt);
    var newAlt = FL.clamp(alt + this.vy * dt, 0, 70);
    if (newAlt <= 0) { newAlt = 0; if (this.vy < 0) this.vy = 0; }
    this.group.position.y = newAlt;
    // Horizontal: only flies once airborne (no taxiing on the skids).
    var throttle = input && input.throttle;
    var brake = input && input.brake;
    if (newAlt > 0.5) {
      if (throttle) this.speed = Math.min(this.def.topSpeed, this.speed + this.def.accel * dt);
      else if (brake) this.speed = Math.max(0, this.speed - this.def.accel * 1.4 * dt);
      else this.speed -= this.speed * 0.4 * dt;
    } else {
      this.speed -= this.speed * 3 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    // Yaw (A/D).
    var steerInput = input ? (input.steer || 0) : 0;
    this.steer = FL.damp(this.steer, steerInput, 8, dt);
    this.heading += this.steer * 1.6 * dt;
    var fwd = this.forward();
    var nx = this.group.position.x + fwd.x * this.speed * dt;
    var nz = this.group.position.z + fwd.z * this.speed * dt;
    // Low flight still collides with buildings; high flight clears them.
    if (newAlt < 12) {
      var res = FL.city.resolveCircle(nx, nz, this.radius * 0.5);
      if (res.x !== nx || res.z !== nz) {
        var impact = Math.abs(this.speed);
        if (impact > 6) {
          this.damage(impact * 1.5);
          FL.audio.crash(impact > 14);
          FL.emit('shake', Math.min(0.6, impact * 0.02));
        }
        this.speed *= 0.4;
        nx = res.x; nz = res.z;
      }
    }
    nx = FL.clamp(nx, -316, 316); nz = FL.clamp(nz, -316, 316);
    this.group.position.x = FL.sanitize(nx, this.group.position.x);
    this.group.position.z = FL.sanitize(nz, this.group.position.z);
    this.group.rotation.y = this.heading;
    // Attitude: pitch forward with speed, roll into the turn.
    var speed01 = FL.clamp(Math.abs(this.speed) / this.def.topSpeed, 0, 1);
    this.group.rotation.x = FL.damp(this.group.rotation.x || 0, speed01 * 0.14, 4, dt);
    this.group.rotation.z = FL.damp(this.group.rotation.z || 0, -this.steer * speed01 * 0.2, 4, dt);
    // Rotor wash: dust + spray under a low helicopter.
    if (newAlt < 6 && newAlt > 0.5 && this.rotorSpeed > 15 && Math.random() < dt * 14) {
      var a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4;
      FL.particles.spawn(this.group.position.x + Math.cos(a) * r, 0.3, this.group.position.z + Math.sin(a) * r,
        { color: 0xaab8c8, size: 0.9, life: 0.7, vy: 0.6, grow: 1.2, opacity: 0.35 });
    }
  };
  FL.Helicopter.prototype.damage = function (amount) {
    if (this.dead) return;
    this.hp -= FL.sanitize(amount, 0);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.speed = 0;
      var p = this.group.position;
      FL.particles.burst(p.x, p.y + 1.5, p.z, 30, { color: 0xff8833, size: 1.8, life: 0.9, spread: 8, vy: 4 });
      FL.audio.explosion();
      FL.emit('shake', 0.9);
      FL.emit('explosion', { x: p.x, z: p.z, radius: 10 });
    }
  };

  // --- Boat ---
  FL.makeBoat = function () {
    var g = new THREE.Group();
    var hull = part(2.6, 1.1, 6.5, 0x2d7ac2, 0, 0.7, 0, { roughness: 0.4, metalness: 0.3 });
    g.add(hull);
    var bow = part(2.2, 0.9, 1.6, 0x2d7ac2, 0, 0.75, 3.6, { roughness: 0.4, metalness: 0.3 });
    bow.rotation.x = -0.25;
    g.add(bow);
    var deck = part(2.4, 0.15, 6.0, 0x8a6a3a, 0, 1.3, 0, { roughness: 0.9 });
    g.add(deck);
    var cabin = part(1.8, 1.1, 2.2, 0xe8e8e8, 0, 1.95, -0.6, { roughness: 0.5, metalness: 0.2 });
    g.add(cabin);
    var windshield = part(1.7, 0.7, 0.15, 0x0e2238, 0, 2.1, 0.55, { roughness: 0.1, metalness: 0.8 });
    g.add(windshield);
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.6 }));
    mast.position.set(0, 3.4, -0.6);
    mast.castShadow = true;
    g.add(mast);
    var flag = part(0.9, 0.5, 0.05, 0xff2d78, 0.5, 4.3, -0.6, { roughness: 0.8 });
    g.add(flag);
    var motor = part(0.7, 0.8, 0.5, 0x222222, 0, 0.9, -3.4);
    g.add(motor);
    return g;
  };

  // The harbor water rect (matches city.js: z 272-320, full width).
  var WATER = { minX: -316, maxX: 316, minZ: 273, maxZ: 318 };
  // The Docks cargo ship — boats steer around it (circle, centre + radius).
  var SHIP_CIRCLE = { x: -100, z: 295, r: 26 };
  FL.Boat = function (x, z) {
    this.isBoat = true;
    this.type = 'boat';
    this.def = { id: 'boat', name: 'Harbor Runner', accel: 8, topSpeed: 24, grip: 4, mass: 1.5, color: 0x2d7ac2 };
    this.group = FL.makeBoat();
    this.group.position.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.hp = 100;
    this.dead = false;
    this.radius = 4;
    this.isPlayer = false;
    this.bobT = Math.random() * 10;
    this.steer = 0;
  };
  FL.Boat.prototype.forward = function () {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  };
  FL.Boat.prototype.update = function (dt, input) {
    if (this.dead) {
      // A wrecked boat lists and settles low in the water.
      this.group.position.y = FL.damp(this.group.position.y, -0.5, 1, dt);
      this.group.rotation.z = FL.damp(this.group.rotation.z, 0.35, 1, dt);
      return;
    }
    this.bobT += dt;
    var throttle = input && input.throttle;
    var brake = input && input.brake;
    if (throttle) this.speed = Math.min(this.def.topSpeed, this.speed + this.def.accel * dt);
    else if (brake) this.speed = Math.max(0, this.speed - this.def.accel * 1.2 * dt);
    else this.speed -= this.speed * 0.5 * dt;
    var steerInput = input ? (input.steer || 0) : 0;
    this.steer = FL.damp(this.steer, steerInput, 5, dt);
    // Boats turn slowly, and only while moving.
    if (Math.abs(this.speed) > 0.5) {
      this.heading += this.steer * 0.9 * dt * Math.min(1, Math.abs(this.speed) / 8 + 0.2);
    }
    var fwd = this.forward();
    var nx = this.group.position.x + fwd.x * this.speed * dt;
    var nz = this.group.position.z + fwd.z * this.speed * dt;
    // Stay in the water: bounce off the shore, the causeway and the island.
    if (nx < WATER.minX || nx > WATER.maxX || nz < WATER.minZ || nz > WATER.maxZ) {
      this.speed *= -0.3;
      nx = FL.clamp(nx, WATER.minX, WATER.maxX);
      nz = FL.clamp(nz, WATER.minZ, WATER.maxZ);
      FL.audio.crash(false);
    }
    // Steer around the cargo ship.
    var sdx = nx - SHIP_CIRCLE.x, sdz = nz - SHIP_CIRCLE.z;
    var sd = Math.sqrt(sdx * sdx + sdz * sdz);
    if (sd < SHIP_CIRCLE.r) {
      var push = (SHIP_CIRCLE.r - sd) / (sd || 1);
      nx += sdx * push; nz += sdz * push;
      this.speed *= 0.5;
    }
    this.group.position.x = FL.sanitize(nx, this.group.position.x);
    this.group.position.z = FL.sanitize(nz, this.group.position.z);
    this.group.rotation.y = this.heading;
    // Waves: bob + roll. A moving boat also pitches slightly.
    this.group.position.y = Math.sin(this.bobT * 1.4) * 0.22;
    this.group.rotation.z = Math.sin(this.bobT * 0.9) * 0.04;
    this.group.rotation.x = FL.clamp(this.speed / this.def.topSpeed, 0, 1) * -0.05 + Math.sin(this.bobT * 1.1) * 0.02;
    // Wake.
    if (Math.abs(this.speed) > 5 && Math.random() < dt * 16) {
      FL.particles.spawn(this.group.position.x - fwd.x * 3, 0.2, this.group.position.z - fwd.z * 3,
        { color: 0xdfe9f5, size: 0.8, life: 0.8, vy: 0.4, grow: 1.4, opacity: 0.5 });
    }
  };
  FL.Boat.prototype.damage = function (amount) {
    if (this.dead) return;
    this.hp -= FL.sanitize(amount, 0);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.speed = 0;
      var p = this.group.position;
      FL.particles.burst(p.x, 1.2, p.z, 26, { color: 0xff8833, size: 1.6, life: 0.8, spread: 7, vy: 4 });
      FL.audio.explosion();
      FL.emit('shake', 0.8);
      FL.emit('explosion', { x: p.x, z: p.z, radius: 9 });
    }
  };

  // --- Motorbike wheelie (stunt) ---
  // Hold Shift+W on a motorbike above 12 m/s: the front lifts, style cash
  // trickles in. The tilt is re-applied every frame after the vehicle
  // physics (which damps the pitch back toward level), so it reads as a
  // steady wheelie and settles smoothly when it ends.
  function updateWheelie(dt) {
    var p = V2.game.player;
    var v = p.vehicle;
    var shift = !!(V2.game.keys['ShiftLeft'] || V2.game.keys['ShiftRight']);
    var accel = !!(V2.game.keys['KeyW'] || V2.game.keys['ArrowUp']);
    var active = p.inCar && v && v.type === 'moto' && !v.dead &&
      Math.abs(v.speed) > 12 && shift && accel;
    if (active) {
      v.group.rotation.x = -0.35;
      V2.wheelieT += dt;
      V2.wheeliePay += dt;
      if (Math.random() < dt * 8) {
        FL.particles.spawn(v.group.position.x, 0.4, v.group.position.z,
          { color: 0xffd75e, size: 0.4, life: 0.4, spread: 2, vy: 1.5 });
      }
      if (V2.wheeliePay >= 2.5) {
        V2.wheeliePay = 0;
        V2.game.addMoney(5);
        FL.hud.notify('Wheelie! +$5 gaya');
      }
    } else {
      V2.wheelieT = 0;
      V2.wheeliePay = 0;
    }
  }

  // --- Init / per-frame update ---
  FL.vehicles2.init = function (scene, game) {
    V2.scene = scene;
    V2.game = game;
    // Helicopter on the island helipad (the Docks build the pad visuals).
    var heli = new FL.Helicopter(140, 285);
    heli.heading = Math.PI;
    heli.group.rotation.y = Math.PI;
    scene.add(heli.group);
    V2.helis.push(heli);
    // Boat moored beside the causeway — boardable from the bridge edge.
    var boat = new FL.Boat(170, 276);
    boat.heading = Math.PI / 2;
    boat.group.rotation.y = Math.PI / 2;
    scene.add(boat.group);
    V2.boats.push(boat);
  };
  FL.vehicles2.update = function (dt) {
    if (!V2.game || !V2.game.player) return;
    // Parked boats still bob; parked helicopters idle-spin their rotors.
    V2.boats.forEach(function (b) {
      if (b.isPlayer || b.dead) return;
      b.bobT += dt;
      b.group.position.y = Math.sin(b.bobT * 1.4) * 0.22;
      b.group.rotation.z = Math.sin(b.bobT * 0.9) * 0.04;
    });
    V2.helis.forEach(function (h) {
      if (h.isPlayer || h.dead) return;
      h.rotorSpeed = FL.damp(h.rotorSpeed, 4, 1.2, dt);
      h.group.userData.rotor.rotation.y += h.rotorSpeed * dt;
    });
    updateWheelie(dt);
  };
})();
