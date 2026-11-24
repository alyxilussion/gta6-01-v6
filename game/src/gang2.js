// FROSTLINE 3D — gang2 (v7): "The Vipers", a rival gang with its own AI.
// Vipers wear green, attack in groups (they converge on the player instead
// of holding ground), and throw molotovs that leave burning zones. They own
// a territory in the southwest Docks: entering it draws a patrol. Their
// boss, Seth Vane, is a 600-HP three-phase fight (missions2 m12 drives the
// mission step; this module drives the boss).
//
// Vipers live in FL.world.gangs so the player's shots can hit them —
// world.js skips them in its own gang update (isViper flag) and this module
// runs their AI instead. Dead Vipers are still cleaned up by world.js.
(function () {
  'use strict';
  var FL = window.FL;

  var TERRITORY = { minX: -288, maxX: 0, minZ: 192, maxZ: 272 };
  var BOSS_MAX_HP = 600;

  var G = {
    scene: null, game: null,
    vipers: [], // gang objects flagged isViper (plus per-viper timers)
    boss: null,
    fires: [], // { x, z, r, t }
    pendingMolotovs: [], // { x, z, t }
    territoryTimer: 0,
    fireTick: 0,
    radioTimer: 0, // v8: Viper radio chatter (at most one line per 15-25 s)
  };
  FL.gang2 = G;

  FL.gang2.init = function (scene, game) {
    G.scene = scene;
    G.game = game;
  };

  function recolorShirt(gang, color) {
    var torso = gang.g.userData.parts.torso;
    torso.material = torso.material.clone();
    torso.material.color.setHex(color);
  }
  FL.gang2.spawnViper = function (x, z, count) {
    var spawned = FL.world.spawnGang(x, z, count);
    spawned.forEach(function (gang) {
      gang.isViper = true;
      gang.hp = 90;
      gang.molotovTimer = FL.rand(6, 12);
      gang.shootTimer = Math.random() * 1.5;
      recolorShirt(gang, 0x1a8a3a);
      G.vipers.push(gang);
    });
    return spawned;
  };
  FL.gang2.clearVipers = function () {
    G.vipers.forEach(function (gang) {
      if (gang.g) G.scene.remove(gang.g);
      var idx = FL.world.gangs.indexOf(gang);
      if (idx >= 0) FL.world.gangs.splice(idx, 1);
    });
    G.vipers = [];
  };

  // --- Boss: Seth Vane ---
  FL.gang2.spawnBoss = function (x, z) {
    var spawned = FL.world.spawnGang(x, z, 1);
    var boss = spawned[0];
    boss.isViper = true;
    boss.isBoss = true;
    boss.hp = BOSS_MAX_HP;
    boss.maxHp = BOSS_MAX_HP;
    boss.phase = 1;
    boss.shootTimer = 1;
    boss.molotovTimer = 6;
    boss.summonTimer = 20;
    boss.deathFxDone = false;
    boss.g.scale.set(1.25, 1.25, 1.25);
    recolorShirt(boss, 0x6a1a8a);
    G.boss = boss;
    return boss;
  };
  function bossPhase(boss) {
    if (boss.hp > 400) return 1;
    if (boss.hp > 200) return 2;
    return 3;
  }
  function updateBoss(dt) {
    var boss = G.boss;
    if (!boss) return;
    if (boss.dead) {
      if (!boss.deathFxDone) {
        boss.deathFxDone = true;
        var p = boss.g.position;
        FL.particles.burst(p.x, 1.5, p.z, 40, { color: 0xff8833, size: 1.8, life: 1.0, spread: 9, vy: 5 });
        FL.audio.explosion();
        FL.emit('shake', 1.0);
        FL.world.addWanted(1, 'boss down');
      }
      return;
    }
    var pp = G.game.player.position;
    var bx = boss.g.position.x, bz = boss.g.position.z;
    var dx = pp.x - bx, dz = pp.z - bz;
    var dist = Math.sqrt(dx * dx + dz * dz);
    boss.g.rotation.y = Math.atan2(dx, dz);
    boss.animT += dt;
    // Phase transitions (announced once each).
    var phase = bossPhase(boss);
    if (phase !== boss.phase) {
      boss.phase = phase;
      FL.audio.blip(110, 0.5, 'sawtooth', 0.3);
      if (phase === 2) FL.emit('notif', 'Seth Vane: "Kamu pikir ini mudah?!" — Fase 2, molotov!');
      else FL.emit('notif', 'Seth Vane MENGAMUK! Fase 3!');
    }
    // Shooting: faster each phase.
    boss.shootTimer -= dt;
    var fireRate = phase === 1 ? 0.9 : (phase === 2 ? 0.7 : 0.4);
    if (dist < 50 && boss.shootTimer <= 0 && !G.game.player.inCar) {
      boss.shootTimer = fireRate + Math.random() * 0.3;
      var hitChance = FL.clamp(0.5 - dist * 0.006, 0.1, 0.45);
      FL.audio.shoot('smg');
      if (Math.random() < hitChance) {
        FL.emit('player-damage', { amount: 10 + Math.random() * 8, from: 'boss' });
      }
      boss.g.userData.setPose('shoot', boss.animT, 0);
    } else if (phase === 3 && dist > 6) {
      // Phase 3: the boss charges the player.
      var nx = bx + Math.sin(boss.g.rotation.y) * 6 * dt;
      var nz = bz + Math.cos(boss.g.rotation.y) * 6 * dt;
      var res = FL.city.resolveCircle(nx, nz, 0.6);
      boss.g.position.x = res.x;
      boss.g.position.z = res.z;
      boss.g.userData.setPose('run', boss.animT, 0.9);
    } else {
      boss.g.userData.setPose('shoot', boss.animT, 0);
    }
    // Molotovs from phase 2 up.
    if (phase >= 2) {
      boss.molotovTimer -= dt;
      if (boss.molotovTimer <= 0 && dist < 30) {
        boss.molotovTimer = phase === 2 ? 8 : 5;
        throwMolotov(pp.x, pp.z);
        FL.emit('notif', 'Molotov! Menjauh dari api!');
      }
    }
    // Phase 2 summons a minion every 25 s (max 3 alive).
    if (phase === 2) {
      boss.summonTimer -= dt;
      if (boss.summonTimer <= 0) {
        boss.summonTimer = 25;
        var alive = 0;
        G.vipers.forEach(function (v) { if (!v.dead) alive++; });
        if (alive < 3) {
          FL.gang2.spawnViper(bx + FL.rand(-8, 8), bz + FL.rand(-8, 8), 1);
          FL.emit('notif', 'Seth Vane memanggil anak buah!');
        }
      }
    }
  }

  // --- Molotovs + fire zones ---
  function throwMolotov(x, z) {
    // A short telegraph: the fire lands 0.8 s after the throw.
    G.pendingMolotovs.push({ x: x, z: z, t: 0.8 });
    FL.audio.blip(300, 0.2, 'sine', 0.2);
  }
  function updateFires(dt) {
    for (var i = G.pendingMolotovs.length - 1; i >= 0; i--) {
      var m = G.pendingMolotovs[i];
      m.t -= dt;
      if (m.t <= 0) {
        G.pendingMolotovs.splice(i, 1);
        G.fires.push({ x: m.x, z: m.z, r: 4, t: 6 });
        FL.particles.burst(m.x, 1.0, m.z, 18, { color: 0xff7722, size: 1.2, life: 0.7, spread: 4, vy: 3 });
        FL.audio.explosion();
      }
    }
    G.fireTick -= dt;
    for (var j = G.fires.length - 1; j >= 0; j--) {
      var f = G.fires[j];
      f.t -= dt;
      if (f.t <= 0) { G.fires.splice(j, 1); continue; }
      // Flames + smoke while the zone burns.
      if (Math.random() < dt * 10) {
        FL.particles.spawn(f.x + FL.rand(-f.r, f.r) * 0.7, 0.4, f.z + FL.rand(-f.r, f.r) * 0.7,
          { color: Math.random() < 0.6 ? 0xff7722 : 0x333333, size: 1.0, life: 0.8, vy: 2.5, grow: 1.2, opacity: 0.7 });
      }
      // Standing in fire hurts (ticked, so the damage flash is not constant).
      var pp = G.game.player.position;
      if (G.fireTick <= 0 && FL.dist2(pp.x, pp.z, f.x, f.z) < f.r * f.r && !G.game.player.inCar) {
        G.fireTick = 0.5;
        FL.emit('player-damage', { amount: 6, from: 'fire' });
      }
    }
  }

  // --- Viper radio chatter (v8) ---
  // When Vipers are in combat with the player, their radio crackles with
  // short callouts (at most one every 15-25 s, so it never spams). A radio
  // squelch blip plays a beat before the line appears.
  var RADIO_LINES = [
    'Viper-1: "Target terlihat! Semua unit ke posisiku!"',
    'Viper-2: "Dia bersenjata — jangan maju sendiri!"',
    'Viper-3: "Panggil bantuan, kita butuh molotov!"',
    'Viper-1: "Jangan biarkan dia lolos dari wilayah kita!"',
    'Viper-2: "Tembak ban mobilnya!"',
    'Viper-4: "Bos bilang: tangkap dia hidup-hidup... atau tidak."',
  ];
  function updateRadio(dt, inCombat) {
    G.radioTimer -= dt;
    if (!inCombat || G.radioTimer > 0) return;
    G.radioTimer = FL.rand(15, 25);
    FL.audio.blip(1200, 0.06, 'square', 0.1); // radio squelch
    setTimeout(function () { FL.emit('notif', FL.pick(RADIO_LINES)); }, 250);
  }

  // --- Viper AI + territory ---
  function updateVipers(dt) {
    if (!G.game.player) return;
    var pp = G.game.player.position;
    for (var i = G.vipers.length - 1; i >= 0; i--) {
      var gang = G.vipers[i];
      if (gang.dead) {
        // world.js removes the corpse from the scene after 10 s; drop the
        // local reference once it is gone from world.gangs.
        if (FL.world.gangs.indexOf(gang) < 0) G.vipers.splice(i, 1);
        continue;
      }
      gang.animT += dt;
      var gx = gang.g.position.x, gz = gang.g.position.z;
      var dx = pp.x - gx, dz = pp.z - gz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      gang.g.rotation.y = Math.atan2(dx, dz);
      // Group attack: converge on the player until in range, then shoot.
      if (dist > 32) {
        var nx = gx + Math.sin(gang.g.rotation.y) * 4.5 * dt;
        var nz = gz + Math.cos(gang.g.rotation.y) * 4.5 * dt;
        var res = FL.city.resolveCircle(nx, nz, 0.5);
        gang.g.position.x = res.x;
        gang.g.position.z = res.z;
        gang.g.userData.setPose('run', gang.animT, 0.8);
      } else {
        gang.shootTimer -= dt;
        if (gang.shootTimer <= 0 && dist < 45 && !G.game.player.inCar) {
          gang.shootTimer = 0.9 + Math.random() * 0.9;
          var hitChance = FL.clamp(0.45 - dist * 0.006, 0.08, 0.4);
          FL.audio.shoot('smg');
          if (Math.random() < hitChance) {
            FL.emit('player-damage', { amount: 8 + Math.random() * 8, from: 'viper' });
          }
        }
        gang.g.userData.setPose('shoot', gang.animT, 0);
      }
      // Molotov: one per viper every ~12 s, only at close range.
      gang.molotovTimer -= dt;
      if (gang.molotovTimer <= 0 && dist < 25) {
        gang.molotovTimer = 12 + Math.random() * 6;
        throwMolotov(pp.x, pp.z);
      }
    }
    // Territory: entering the Vipers' turf draws a patrol (max 6 alive,
    // at most one patrol per minute).
    G.territoryTimer -= dt;
    var inTerritory = pp.x >= TERRITORY.minX && pp.x <= TERRITORY.maxX &&
      pp.z >= TERRITORY.minZ && pp.z <= TERRITORY.maxZ;
    if (inTerritory && G.territoryTimer <= 0) {
      var alive = 0;
      G.vipers.forEach(function (v) { if (!v.dead) alive++; });
      if (alive < 6) {
        G.territoryTimer = 60;
        var spot = FL.city.randomRoadPoint();
        for (var t = 0; t < 20; t++) {
          var cand = FL.city.randomRoadPoint();
          if (cand.x >= TERRITORY.minX && cand.x <= TERRITORY.maxX &&
              cand.z >= TERRITORY.minZ && cand.z <= TERRITORY.maxZ) { spot = cand; break; }
        }
        FL.gang2.spawnViper(spot.x, spot.z, 3);
        FL.emit('notif', 'Kamu memasuki wilayah The Vipers!');
        // The patrol answers on the radio a beat later.
        FL.audio.blip(1200, 0.06, 'square', 0.1);
        setTimeout(function () { FL.emit('notif', 'Viper: "Penyusup di wilayah kita — semua unit siaga!"'); }, 1200);
      }
    }
    // v8: radio chatter while any Viper is in combat range (45 m).
    var inCombat = false;
    G.vipers.forEach(function (v) {
      if (v.dead) return;
      if (FL.dist2(v.g.position.x, v.g.position.z, pp.x, pp.z) < 2025) inCombat = true;
    });
    updateRadio(dt, inCombat);
  }

  FL.gang2.update = function (dt) {
    if (!G.game || !G.game.player) return;
    updateVipers(dt);
    updateBoss(dt);
    updateFires(dt);
  };
})();
