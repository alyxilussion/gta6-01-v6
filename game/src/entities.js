// FROSTLINE 3D — entities: procedural humanoids (player/peds) with limb
// animation, 6+ vehicle types with distinct models + arcade physics, damage,
// smoke/fire/explosion, and a pooled sprite particle system.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  // --- Shared materials/geometries (reused, never re-created per entity) ---
  var MATS = {};
  function mat(color, opts) {
    var key = color + '|' + JSON.stringify(opts || {});
    if (!MATS[key]) {
      MATS[key] = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.8, metalness: 0.1 }, opts || {}));
    }
    return MATS[key];
  }
  var BOX = new THREE.BoxGeometry(1, 1, 1);
  var CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  function box(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(BOX, material);
    m.scale.set(w, h, d); m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }

  // Soft radial sprite texture (smoke/fire/spark/glow).
  var spriteTex = null;
  function getSpriteTex() {
    if (spriteTex) return spriteTex;
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    spriteTex = new THREE.CanvasTexture(c);
    return spriteTex;
  }

  // --- Particle pool (sprites) ---
  var MAX_PARTICLES = 240;
  var particles = [];
  var particleScene = null;
  FL.particles = {
    init: function (scene) {
      particleScene = scene;
      for (var i = 0; i < MAX_PARTICLES; i++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: getSpriteTex(), transparent: true, depthWrite: false,
        }));
        s.visible = false;
        scene.add(s);
        particles.push({ sprite: s, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grow: 0, fade: 1 });
      }
    },
    spawn: function (x, y, z, opts) {
      opts = opts || {};
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (p.life > 0) continue;
        p.life = p.maxLife = opts.life || 0.8;
        p.sprite.visible = true;
        p.sprite.position.set(x, y, z);
        var sc = opts.size || 1;
        p.sprite.scale.set(sc, sc, 1);
        p.sprite.material.color.setHex(opts.color || 0xffffff);
        p.sprite.material.opacity = opts.opacity !== undefined ? opts.opacity : 0.8;
        p.vx = (opts.vx || 0) + (Math.random() - 0.5) * (opts.spread || 1);
        p.vy = (opts.vy || 1) + Math.random() * (opts.spread || 1);
        p.vz = (opts.vz || 0) + (Math.random() - 0.5) * (opts.spread || 1);
        p.grow = opts.grow || 0;
        p.fade = opts.fade !== undefined ? opts.fade : 1;
        return;
      }
    },
    burst: function (x, y, z, n, opts) {
      for (var i = 0; i < n; i++) this.spawn(x, y, z, opts);
    },
    update: function (dt) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.sprite.visible = false; continue; }
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        p.vy -= 1.5 * dt;
        if (p.grow) {
          var s = p.sprite.scale.x + p.grow * dt;
          p.sprite.scale.set(s, s, 1);
        }
        if (p.fade) p.sprite.material.opacity = 0.8 * (p.life / p.maxLife);
      }
    },
  };

  // --- Humanoid (procedural, animated limbs) ---
  FL.makeHumanoid = function (opts) {
    opts = opts || {};
    var skin = opts.skin || 0xd8a07a;
    var shirt = opts.shirt || 0x3a6ac2;
    var pants = opts.pants || 0x2a3348;
    var hair = opts.hair || 0x1a1a1a;
    var g = new THREE.Group();
    var head = box(0.42, 0.42, 0.42, mat(skin), 0, 1.62, 0);
    var hairM = box(0.44, 0.16, 0.44, mat(hair), 0, 1.86, 0);
    var torso = box(0.55, 0.7, 0.32, mat(shirt), 0, 1.15, 0);
    var armL = box(0.16, 0.65, 0.16, mat(shirt), -0.38, 1.35, 0);
    var armR = box(0.16, 0.65, 0.16, mat(shirt), 0.38, 1.35, 0);
    var legL = box(0.2, 0.75, 0.2, mat(pants), -0.14, 0.42, 0);
    var legR = box(0.2, 0.75, 0.2, mat(pants), 0.14, 0.42, 0);
    // Pivot groups so limbs swing from the shoulder/hip.
    function pivot(mesh, px, py, pz) {
      var p = new THREE.Group();
      p.position.set(px, py, pz);
      mesh.position.set(0, mesh.position.y - py, 0);
      p.add(mesh);
      return p;
    }
    var armLp = pivot(armL, -0.38, 1.45, 0);
    var armRp = pivot(armR, 0.38, 1.45, 0);
    var legLp = pivot(legL, -0.14, 0.8, 0);
    var legRp = pivot(legR, 0.14, 0.8, 0);
    g.add(head, hairM, torso, armLp, armRp, legLp, legRp);
    g.userData.parts = { head: head, torso: torso, armL: armLp, armR: armRp, legL: legLp, legR: legRp };
    g.userData.setPose = function (pose, t, speed01) {
      var p = g.userData.parts;
      var swing = Math.sin(t * (6 + speed01 * 8)) * (0.25 + speed01 * 0.65);
      if (pose === 'fall') {
        g.rotation.x = -Math.PI / 2 + 0.15;
        p.armL.rotation.x = 0.4; p.armR.rotation.x = -0.4;
        p.legL.rotation.x = 0.2; p.legR.rotation.x = -0.2;
        return;
      }
      g.rotation.x = 0;
      if (pose === 'shoot') {
        p.armR.rotation.x = -Math.PI / 2 + 0.15; p.armL.rotation.x = -0.4;
        p.legL.rotation.x = swing * 0.4; p.legR.rotation.x = -swing * 0.4;
      } else if (pose === 'run' || pose === 'walk') {
        p.armL.rotation.x = swing; p.armR.rotation.x = -swing;
        p.legL.rotation.x = -swing; p.legR.rotation.x = swing;
        p.torso = p.torso;
        g.position.y = Math.abs(Math.sin(t * (6 + speed01 * 8))) * 0.06;
      } else { // idle
        p.armL.rotation.x = Math.sin(t * 1.5) * 0.05;
        p.armR.rotation.x = -Math.sin(t * 1.5) * 0.05;
        p.legL.rotation.x = 0; p.legR.rotation.x = 0;
        g.position.y = Math.sin(t * 1.5) * 0.02;
      }
    };
    return g;
  };

  // --- Vehicles ---
  function wheelMesh(radius, width) {
    var w = new THREE.Mesh(CYL, mat(0x111111, { roughness: 0.9 }));
    w.rotation.z = Math.PI / 2;
    w.scale.set(radius * 2, width, radius * 2);
    w.castShadow = true;
    return w;
  }
  function lightBar(color, emissive) {
    return mat(color, { emissive: emissive, emissiveIntensity: 2.0 });
  }

  FL.makeVehicle = function (typeId) {
    var def = null;
    for (var i = 0; i < FL.VEHICLES.length; i++) if (FL.VEHICLES[i].id === typeId) def = FL.VEHICLES[i];
    if (!def) def = FL.VEHICLES[0];
    var g = new THREE.Group();
    var bodyMat = mat(def.color, { roughness: 0.35, metalness: 0.6 });
    var glassMat = mat(0x0e2238, { roughness: 0.1, metalness: 0.8 });
    var wheels = [];
    var headlights = [], taillights = [];
    var headMat = lightBar(0xfff6c8, 0xffedb0);
    var tailMat = lightBar(0xff2a2a, 0xff2020);

    if (typeId === 'moto') {
      var frame = box(0.5, 0.5, 1.9, bodyMat, 0, 0.65, 0); g.add(frame);
      var tank = box(0.45, 0.35, 0.7, bodyMat, 0, 0.95, 0.1); g.add(tank);
      var seat = box(0.4, 0.15, 0.7, mat(0x111111), 0, 0.95, -0.5); g.add(seat);
      var w1 = wheelMesh(0.34, 0.18); w1.position.set(0, 0.34, 0.85); g.add(w1); wheels.push(w1);
      var w2 = wheelMesh(0.34, 0.18); w2.position.set(0, 0.34, -0.85); g.add(w2); wheels.push(w2);
      var hl = box(0.3, 0.18, 0.1, headMat, 0, 0.8, 1.0); g.add(hl); headlights.push(hl);
      var tl = box(0.25, 0.12, 0.08, tailMat, 0, 0.85, -1.0); g.add(tl); taillights.push(tl);
    } else if (typeId === 'bus') {
      var busBody = box(2.5, 2.6, 9, bodyMat, 0, 1.5, 0); g.add(busBody);
      var busGlass = box(2.55, 0.9, 8.4, glassMat, 0, 2.1, 0); g.add(busGlass);
      var stripe = box(2.56, 0.3, 8.9, mat(0xffd75e), 0, 1.0, 0); g.add(stripe);
      [[-1.1, 3.1], [1.1, 3.1], [-1.1, -3.1], [1.1, -3.1]].forEach(function (p) {
        var w = wheelMesh(0.48, 0.35); w.position.set(p[0], 0.48, p[1]); g.add(w); wheels.push(w);
      });
      [-0.8, 0.8].forEach(function (x) {
        var h = box(0.5, 0.3, 0.1, headMat, x, 1.0, 4.55); g.add(h); headlights.push(h);
        var t = box(0.5, 0.3, 0.1, tailMat, x, 1.0, -4.55); g.add(t); taillights.push(t);
      });
    } else if (typeId === 'truck') {
      var cab = box(2.2, 2.0, 1.8, bodyMat, 0, 1.4, 2.2); g.add(cab);
      var cabGlass = box(2.0, 0.8, 0.15, glassMat, 0, 1.9, 3.1); g.add(cabGlass);
      var bed = box(2.4, 1.4, 4.2, mat(0x6a7a8a, { roughness: 0.6, metalness: 0.4 }), 0, 1.1, -1.2); g.add(bed);
      [[-1.05, 2.6], [1.05, 2.6], [-1.05, -1.2], [1.05, -1.2], [-1.05, -2.6], [1.05, -2.6]].forEach(function (p) {
        var w = wheelMesh(0.5, 0.4); w.position.set(p[0], 0.5, p[1]); g.add(w); wheels.push(w);
      });
      [-0.7, 0.7].forEach(function (x) {
        var h = box(0.45, 0.3, 0.1, headMat, x, 0.9, 3.15); g.add(h); headlights.push(h);
        var t = box(0.45, 0.3, 0.1, tailMat, x, 0.9, -3.35); g.add(t); taillights.push(t);
      });
    } else {
      // sedan / sports / suv / police share a car layout, distinct proportions.
      var len = typeId === 'sports' ? 4.4 : (typeId === 'suv' ? 4.8 : 4.5);
      var wid = typeId === 'suv' ? 2.1 : 1.9;
      var hgt = typeId === 'suv' ? 0.85 : (typeId === 'sports' ? 0.55 : 0.7);
      var body = box(wid, hgt, len, bodyMat, 0, 0.55 + hgt / 2, 0); g.add(body);
      var cabinLen = len * 0.5;
      var cabin = box(wid * 0.85, 0.6, cabinLen, glassMat, 0, 0.55 + hgt + 0.28, -len * 0.05); g.add(cabin);
      var roof = box(wid * 0.85, 0.1, cabinLen, bodyMat, 0, 0.55 + hgt + 0.6, -len * 0.05); g.add(roof);
      if (typeId === 'sports') {
        var spoiler = box(wid * 0.9, 0.08, 0.4, mat(0x111111), 0, 1.15, -len / 2 + 0.2); g.add(spoiler);
        var sp2 = box(0.1, 0.3, 0.1, mat(0x111111), -wid * 0.35, 0.95, -len / 2 + 0.2); g.add(sp2);
        var sp3 = box(0.1, 0.3, 0.1, mat(0x111111), wid * 0.35, 0.95, -len / 2 + 0.2); g.add(sp3);
      }
      if (typeId === 'police') {
        var stripeP = box(wid + 0.02, 0.25, len + 0.02, mat(0xffffff), 0, 0.75, 0); g.add(stripeP);
        var barBase = box(1.2, 0.12, 0.4, mat(0x111111), 0, 0.55 + hgt + 0.68, -len * 0.05); g.add(barBase);
        var redL = box(0.5, 0.18, 0.35, lightBar(0xff2020, 0xff2020), -0.32, 0.55 + hgt + 0.8, -len * 0.05); g.add(redL);
        var blueL = box(0.5, 0.18, 0.35, lightBar(0x2050ff, 0x2050ff), 0.32, 0.55 + hgt + 0.8, -len * 0.05); g.add(blueL);
        g.userData.sirenRed = redL; g.userData.sirenBlue = blueL;
        var textP = box(0.1, 0.3, 1.2, mat(0xffffff), wid / 2 + 0.02, 0.8, 0); g.add(textP);
      }
      var wz = len / 2 - 0.8;
      [[-wid / 2 + 0.1, wz], [wid / 2 - 0.1, wz], [-wid / 2 + 0.1, -wz], [wid / 2 - 0.1, -wz]].forEach(function (p) {
        var w = wheelMesh(typeId === 'suv' ? 0.42 : 0.36, 0.3);
        w.position.set(p[0], typeId === 'suv' ? 0.42 : 0.36, p[1]);
        g.add(w); wheels.push(w);
      });
      [-wid / 2 + 0.35, wid / 2 - 0.35].forEach(function (x) {
        var h = box(0.45, 0.22, 0.08, headMat, x, 0.7, len / 2 + 0.02); g.add(h); headlights.push(h);
        var t = box(0.45, 0.22, 0.08, tailMat, x, 0.7, -len / 2 - 0.02); g.add(t); taillights.push(t);
      });
    }
    g.userData.wheels = wheels;
    g.userData.headlights = headlights;
    g.userData.taillights = taillights;
    g.userData.def = def;
    g.userData.type = typeId;
    return g;
  };

  // --- Vehicle entity: arcade physics + damage ---
  FL.Vehicle = function (typeId, x, z, heading) {
    this.type = typeId;
    this.def = null;
    for (var i = 0; i < FL.VEHICLES.length; i++) if (FL.VEHICLES[i].id === typeId) this.def = FL.VEHICLES[i];
    this.group = FL.makeVehicle(typeId);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading || 0;
    this.heading = heading || 0;
    this.speed = 0;
    this.vx = 0; this.vz = 0;
    this.hp = 100;
    this.dead = false;
    this.burning = false;
    this.steer = 0;
    this.radius = typeId === 'bus' ? 4.6 : (typeId === 'truck' ? 3.4 : (typeId === 'moto' ? 1.2 : 2.4));
    this.sirenOn = false;
    this.sirenPhase = 0;
    this.smokeTimer = 0;
    this.flipTimer = 0;
    this.isPlayer = false;
    this.driver = null; // ped driver (traffic) or null
    this.stuckTimer = 0;
    this.lastPos = { x: x, z: z };
  };
  FL.Vehicle.prototype.forward = function () {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  };
  FL.Vehicle.prototype.update = function (dt, input) {
    if (this.dead) return;
    var def = this.def;
    var fwd = this.forward();
    // Throttle / brake / reverse.
    var accelInput = 0;
    if (input) {
      if (input.throttle) accelInput += 1;
      if (input.brake) accelInput -= 1;
      if (input.reverse) accelInput -= 0.6;
    }
    var targetSpeed = accelInput * def.topSpeed;
    if (accelInput > 0) this.speed = Math.min(def.topSpeed, this.speed + def.accel * dt);
    else if (accelInput < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - def.accel * 1.6 * dt); // braking
      else this.speed = Math.max(-def.topSpeed * 0.4, this.speed - def.accel * 0.7 * dt); // reverse
    } else {
      // Natural drag + rolling resistance.
      this.speed -= this.speed * 0.6 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = FL.clamp(this.speed, -def.topSpeed * 0.45, def.topSpeed);
    // Steering (speed-dependent, less at high speed).
    var steerInput = input ? (input.steer || 0) : 0;
    this.steer = FL.damp(this.steer, steerInput, 8, dt);
    var speedFactor = FL.clamp(Math.abs(this.speed) / def.topSpeed, 0, 1);
    var steerRate = 1.9 * (1 - speedFactor * 0.55);
    if (Math.abs(this.speed) > 0.2) {
      this.heading += this.steer * steerRate * dt * (this.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(this.speed) / 6 + 0.2);
    }
    // Drift: velocity lags heading when handbraking (low grip).
    var grip = (input && input.handbrake) ? 2.2 : def.grip;
    var wantVx = fwd.x * this.speed, wantVz = fwd.z * this.speed;
    this.vx = FL.damp(this.vx, wantVx, grip, dt);
    this.vz = FL.damp(this.vz, wantVz, grip, dt);
    var nx = this.group.position.x + this.vx * dt;
    var nz = this.group.position.z + this.vz * dt;
    // Collide with the city (circle vs AABBs).
    var res = FL.city.resolveCircle(nx, nz, this.radius * 0.55);
    var hitWall = (res.x !== nx || res.z !== nz);
    if (hitWall) {
      var impact = Math.abs(this.speed);
      if (impact > 6) {
        this.damage(impact * 1.2);
        FL.audio.crash(impact > 14);
        FL.particles.burst(res.x, 0.8, res.z, 8, { color: 0xffd88a, size: 0.5, life: 0.4, spread: 4 });
        FL.emit('shake', Math.min(0.6, impact * 0.02));
      }
      // Bounce: kill the velocity component into the wall.
      if (res.x !== nx) this.vx *= -0.35;
      if (res.z !== nz) this.vz *= -0.35;
      this.speed *= 0.55;
      nx = res.x; nz = res.z;
    }
    this.group.position.x = FL.sanitize(nx, this.group.position.x);
    this.group.position.z = FL.sanitize(nz, this.group.position.z);
    this.group.rotation.y = this.heading;
    // Body tilt/roll + bounce.
    var roll = -this.steer * speedFactor * 0.06;
    var pitch = FL.clamp(accelInput, -1, 1) * -0.02 + Math.sin(performance.now() * 0.02) * speedFactor * 0.004;
    this.group.rotation.z = FL.damp(this.group.rotation.z || 0, roll, 6, dt);
    this.group.rotation.x = FL.damp(this.group.rotation.x || 0, pitch, 6, dt);
    // Wheels spin + front steer.
    var wheels = this.group.userData.wheels;
    for (var i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += (this.speed / 0.36) * dt;
    }
    // Brake lights.
    var braking = input && input.brake;
    this.group.userData.taillights.forEach(function (t) {
      t.material.emissiveIntensity = braking ? 3.5 : 2.0;
    });
    // Siren strobe (police).
    if (this.type === 'police' && this.sirenOn) {
      this.sirenPhase += dt * 10;
      var on = Math.sin(this.sirenPhase) > 0;
      var r = this.group.userData.sirenRed, b = this.group.userData.sirenBlue;
      if (r && b) {
        r.material.emissiveIntensity = on ? 4 : 0.4;
        b.material.emissiveIntensity = on ? 0.4 : 4;
      }
      if (Math.random() < dt * 1.2) FL.audio.siren();
    }
    // Damage smoke / fire.
    if (this.hp < 35 && this.hp > 0) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        var fx = this.group.position.x + fwd.x * 1.5, fz = this.group.position.z + fwd.z * 1.5;
        FL.particles.spawn(fx, 1.2, fz, {
          color: this.hp < 15 ? 0xff7722 : 0x555555, size: 1.2, life: 0.9, vy: 2.2, grow: 1.5, opacity: 0.6,
        });
      }
    }
    // Stuck detection (for AI): barely moved in 4 s while trying.
    var moved = FL.dist2(this.group.position.x, this.group.position.z, this.lastPos.x, this.lastPos.z);
    if (moved < 0.04 && Math.abs(this.speed) > 1) this.stuckTimer += dt; else this.stuckTimer = 0;
    if (this.stuckTimer > 4) { this.stuckTimer = 0; FL.emit('vehicle-stuck', this); }
    this.lastPos.x = this.group.position.x; this.lastPos.z = this.group.position.z;
  };
  FL.Vehicle.prototype.damage = function (amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.burning = true;
      this.speed = 0; this.vx = 0; this.vz = 0;
      var p = this.group.position;
      FL.particles.burst(p.x, 1.2, p.z, 26, { color: 0xff8833, size: 1.6, life: 0.8, spread: 7, vy: 4 });
      FL.particles.burst(p.x, 1.0, p.z, 14, { color: 0x333333, size: 2.2, life: 1.6, vy: 2.5, grow: 2 });
      FL.audio.explosion();
      FL.emit('shake', 0.8);
      FL.emit('explosion', { x: p.x, z: p.z, radius: 9 });
    }
  };
  FL.Vehicle.prototype.repair = function () { this.hp = 100; this.dead = false; this.burning = false; };
})();
