// FROSTLINE 3D — missions2 (v7): extended story missions m9-m12.
// The core state machine lives in missions.js (it owns the current mission,
// the step index and the marker); this module owns the MECHANICS of the four
// new steps: a heist with a vault-cracking channel, a street race against two
// rival AI drivers, a stealth infiltration with guard vision cones, and a
// three-phase boss fight. All four missions are appended to FL.MISSIONS at
// load time, so the existing "press J for the next mission" flow picks them
// up automatically once m1-m8 are done.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  // --- Story script, chapters 9-12 ---
  FL.MISSIONS.push(
    { id: 'm9', name: 'The Big One', giver: 'Silas Ren',
      brief: 'Silas has a plan for the Harbor Bank vault. Gather the crew, crack the vault, then lose a 4-star wanted level.',
      briefing: 'Silas has a plan for the Harbor Bank vault. Gather the crew, crack the vault, then lose a 4-star wanted level.',
      type: 'heist', reward: 8000 },
    { id: 'm10', name: 'Neon Grand Prix', giver: 'Dex Karr',
      brief: 'The underground Grand Prix is tonight. Six checkpoints across the city — beat Vex and Rook or go home.',
      briefing: 'The underground Grand Prix is tonight. Six checkpoints across the city — beat Vex and Rook or go home.',
      type: 'race', reward: 4000 },
    { id: 'm11', name: 'Silent Harbor', giver: 'Mara Voss',
      brief: 'The Vipers keep their ledger in a Docks warehouse. Slip past the guards, kill the alarm, bring the ledger out.',
      briefing: 'The Vipers keep their ledger in a Docks warehouse. Slip past the guards, kill the alarm, bring the ledger out.',
      type: 'stealth', reward: 6000 },
    { id: 'm12', name: "Viper's Nest", giver: 'Mara Voss',
      brief: 'Finale, part two: Seth Vane runs the Vipers from the Docks. End it — all three phases of him.',
      briefing: 'Finale, part two: Seth Vane runs the Vipers from the Docks. End it — all three phases of him.',
      type: 'finale', reward: 10000 }
  );

  var S = {
    scene: null, game: null,
    heist: null,   // { progress, started }
    race: null,    // { checkpoints, idx, rivals, rankTimer }
    stealth: null, // { guards, detection, alarmOn, channel, phase }
    bossRef: null, // gang object for Seth Vane (lives in FL.world.gangs)
    bossTimer: 0,
  };
  FL.missions2 = S;

  FL.missions2.init = function (scene, game) {
    S.scene = scene;
    S.game = game;
    // A failed or finished mission must never leave rivals or stealth
    // guards behind — clean both up on either outcome.
    FL.on('mission-failed', function () { cleanupRace(); cleanupStealth(); });
    FL.on('mission-complete', function () { cleanupRace(); cleanupStealth(); });
    // Shooting a stealth guard trips the alarm (unless it is already off).
    FL.on('gang-down', function (hit) {
      if (!S.stealth || !S.stealth.alarmOn) return;
      for (var i = 0; i < S.stealth.guards.length; i++) {
        if (S.stealth.guards[i].gang === hit) {
          S.stealth.detection = 100;
          FL.emit('notif', 'Tembakanmu memicu alarm!');
          return;
        }
      }
    });
  };

  // --- Entry points (called from missions.js) ---
  FL.missions2.startStep = function (step, missionIdx) {
    if (step.type === 'heist') startHeist(step);
    else if (step.type === 'race') startRace(step);
    else if (step.type === 'stealth') startStealth(step);
    else if (step.type === 'boss') startBoss(step);
  };
  FL.missions2.updateStep = function (dt, step) {
    if (step.type === 'heist') updateHeist(dt, step);
    else if (step.type === 'race') updateRace(dt, step);
    else if (step.type === 'stealth') updateStealth(dt, step);
    else if (step.type === 'boss') updateBoss(dt, step);
  };

  // --- Heist (m9) ---
  // Crew phases are plain gotos (the core marker already points at them).
  // The vault phase is a channel: hold E near the vault for 8 seconds.
  var VAULT_TIME = 8;
  function startHeist(step) {
    if (step.phase === 'vault') {
      S.heist = { progress: 0, started: false };
      FL.emit('notif', 'Brankas Bank Harbor — tahan E untuk membobol');
      FL.emit('objective', 'Bobol brankas: tahan E di dekat brankas');
    }
  }
  function updateHeist(dt, step) {
    var pp = S.game.player.position;
    if (step.phase === 'crew') {
      if (FL.dist2(pp.x, pp.z, step.x, step.z) < 36) FL.missions.nextStep();
      return;
    }
    if (step.phase !== 'vault') return;
    var near = FL.dist2(pp.x, pp.z, step.x, step.z) < 64;
    var onFoot = !S.game.player.inCar;
    var holding = !!(S.game.keys && S.game.keys['KeyE']);
    if (near && onFoot && holding) {
      if (!S.heist.started) {
        S.heist.started = true;
        FL.audio.click();
        FL.emit('notif', 'Membobol brankas... jangan bergerak!');
      }
      S.heist.progress += dt / VAULT_TIME;
      // Sparks fly while the drill works.
      if (Math.random() < dt * 12) {
        FL.particles.spawn(step.x + FL.rand(-1, 1), 1.2, step.z + FL.rand(-1, 1),
          { color: 0xffd88a, size: 0.4, life: 0.4, spread: 3, vy: 2 });
      }
      FL.emit('objective', 'Membobol brankas: ' + Math.floor(S.heist.progress * 100) + '%');
      if (S.heist.progress >= 1) {
        FL.audio.mission();
        FL.emit('notif', 'Brankas terbuka! Polisi datang — KABUR!');
        FL.world.addWanted(4, 'vault cracked');
        S.heist = null;
        FL.missions.nextStep();
      }
    } else {
      // Let go (or stepped away): the drill cools down, progress decays.
      if (S.heist) {
        S.heist.progress = Math.max(0, S.heist.progress - dt * 0.05);
        if (near && onFoot) FL.emit('objective', 'Bobol brankas: tahan E (' + Math.floor(S.heist.progress * 100) + '%)');
        else if (near) FL.emit('objective', 'Keluar dari mobil untuk membobol brankas');
      }
    }
  }

  // --- Race (m10) ---
  // Six checkpoints on a road loop, against two rival AI drivers. The core
  // timer (180 s) already fails the mission on timeout; this module drives
  // the rivals and decides the winner. Every race leg follows a single road,
  // so the rivals' straight-line steering stays on tarmac.
  var RACE_POINTS = [
    { x: -224, z: -224 }, { x: 224, z: -224 }, { x: 224, z: 224 },
    { x: 0, z: 224 }, { x: -224, z: 224 }, { x: -224, z: -32 },
  ];
  var RIVAL_DEFS = [
    { name: 'Vex', color: 0x2de8ff, cruise: 23 },
    { name: 'Rook', color: 0xffb02d, cruise: 25 },
  ];
  function recolorCar(v, color) {
    // Clone the body material (shared via the entities cache) so only this
    // car changes colour.
    var target = v.def.color;
    v.group.traverse(function (child) {
      if (!child.isMesh || !child.material || !child.material.color) return;
      if (child.material.color.getHex() === target) {
        child.material = child.material.clone();
        child.material.color.setHex(color);
      }
    });
  }
  function startRace(step) {
    cleanupRace();
    var rivals = [];
    RIVAL_DEFS.forEach(function (def, i) {
      var sx = RACE_POINTS[0].x + (i === 0 ? -6 : 6);
      var sz = RACE_POINTS[0].z + 10 + i * 6;
      var v = new FL.Vehicle('sports', sx, sz, Math.PI / 2);
      recolorCar(v, def.color);
      S.scene.add(v.group);
      rivals.push({ v: v, idx: 0, name: def.name, cruise: def.cruise, finished: false });
    });
    S.race = { checkpoints: RACE_POINTS, idx: 0, rivals: rivals, rankTimer: 0 };
    FL.missions.setMarker(RACE_POINTS[0].x, RACE_POINTS[0].z, 0x5aa8ff);
    FL.emit('objective', 'Neon Grand Prix: Checkpoint 1/6 — Posisi 3/3');
    FL.emit('notif', 'Balapan dimulai! Kalahkan Vex dan Rook!');
    FL.audio.horn();
  }
  function updateRace(dt, step) {
    if (!S.race) return;
    var pp = S.game.player.position;
    var R = S.race;
    // Player progress.
    var cp = R.checkpoints[R.idx];
    if (cp && FL.dist2(pp.x, pp.z, cp.x, cp.z) < 49) {
      R.idx++;
      FL.audio.pickup();
      if (R.idx >= R.checkpoints.length) {
        FL.emit('notif', 'Kamu MENANG Grand Prix!');
        cleanupRace();
        FL.missions.nextStep();
        return;
      }
      var next = R.checkpoints[R.idx];
      FL.missions.setMarker(next.x, next.z, 0x5aa8ff);
      FL.emit('notif', 'Checkpoint ' + (R.idx + 1) + '/6!');
    }
    // Rival AI: steer toward the current checkpoint, cruise at a fixed
    // speed, advance on arrival. A rival that finishes first wins.
    for (var i = 0; i < R.rivals.length; i++) {
      var r = R.rivals[i];
      if (r.finished || r.v.dead) continue;
      var target = R.checkpoints[r.idx];
      if (!target) continue;
      var vx = r.v.group.position.x, vz = r.v.group.position.z;
      var dx = target.x - vx, dz = target.z - vz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 10) {
        r.idx++;
        if (r.idx >= R.checkpoints.length) {
          r.finished = true;
          FL.emit('notif', r.name + ' finis lebih dulu!');
          cleanupRace();
          FL.missions.failMission(r.name + ' menang balapan');
          return;
        }
        continue;
      }
      var wantHeading = Math.atan2(dx, dz);
      var steer = FL.clamp(FL.wrapAngle(wantHeading - r.v.heading) * 2.2, -1, 1);
      var throttle = Math.abs(r.v.speed) < r.cruise;
      r.v.update(dt, { throttle: throttle, brake: false, reverse: false, steer: steer, handbrake: false });
      // Rival exhaust puffs.
      if (Math.random() < dt * 6) {
        FL.particles.spawn(vx - Math.sin(r.v.heading) * 2, 0.5, vz - Math.cos(r.v.heading) * 2,
          { color: 0x8899aa, size: 0.5, life: 0.5, vy: 0.8, grow: 0.6, opacity: 0.35 });
      }
    }
    // Live position: rank by checkpoint index, ties broken by distance to
    // the next checkpoint.
    R.rankTimer -= dt;
    if (R.rankTimer <= 0) {
      R.rankTimer = 0.5;
      var rank = 1;
      for (var j = 0; j < R.rivals.length; j++) {
        var rj = R.rivals[j];
        if (rj.idx > R.idx) rank++;
        else if (rj.idx === R.idx && cp) {
          var pd = FL.dist2(pp.x, pp.z, cp.x, cp.z);
          var rd = FL.dist2(rj.v.group.position.x, rj.v.group.position.z, cp.x, cp.z);
          if (rd < pd) rank++;
        }
      }
      FL.emit('objective', 'Checkpoint ' + (R.idx + 1) + '/6 — Posisi ' + rank + '/3');
    }
  }
  function cleanupRace() {
    if (!S.race) return;
    S.race.rivals.forEach(function (r) {
      if (r.v && r.v.group) S.scene.remove(r.v.group);
    });
    S.race = null;
  }

  // --- Stealth (m11) ---
  // Five guards patrol the Docks with vision cones. Being seen fills the
  // detection meter; at 100% the alarm trips and the mission fails. Killing
  // a guard also trips the alarm. Disabling the alarm panel (hold E, 3 s)
  // turns the cones off for the extraction phase.
  var GUARD_ROUTES = [
    { a: { x: -224, z: 192 }, b: { x: -224, z: 256 } },
    { a: { x: -160, z: 224 }, b: { x: -96, z: 224 } },
    { a: { x: -160, z: 256 }, b: { x: -160, z: 192 } },
    { a: { x: -288, z: 224 }, b: { x: -224, z: 224 } },
    { a: { x: -96, z: 256 }, b: { x: -32, z: 256 } },
  ];
  var CONE_RANGE = 18, CONE_HALF_ANGLE = 0.6;
  var ALARM_TIME = 3;
  function makeCone() {
    // A translucent 3D cone, apex at the guard, opening forward.
    var geo = new THREE.ConeGeometry(6, CONE_RANGE, 12, 1, true);
    var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x51ff7a, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = Math.PI / 2; // cone axis (+Y) -> forward (+Z)
    return m;
  }
  function startStealth(step) {
    if (step.phase === 'infiltrate') {
      cleanupStealth();
      var guards = [];
      GUARD_ROUTES.forEach(function (route) {
        var spawned = FL.world.spawnGang(route.a.x, route.a.z, 1);
        var gang = spawned[0];
        gang.isViper = true; // AI runs here, not in world.js
        gang.isStealthGuard = true;
        // Dark green uniform (clone the torso material — it is shared).
        var torso = gang.g.userData.parts.torso;
        torso.material = torso.material.clone();
        torso.material.color.setHex(0x1a5a2a);
        var cone = makeCone();
        cone.position.set(0, 1.1, CONE_RANGE / 2);
        gang.g.add(cone);
        guards.push({
          gang: gang, cone: cone, route: route,
          target: 'b', heading: 0, speed: 2.2,
        });
      });
      S.stealth = { guards: guards, detection: 0, alarmOn: true, channel: 0, phase: 'infiltrate' };
      FL.emit('notif', 'Jangan sampai terlihat — hindari cone penglihatan penjaga!');
    }
    if (step.phase === 'alarm') S.stealth.phase = 'alarm';
    if (step.phase === 'extract') S.stealth.phase = 'extract';
  }
  function updateStealth(dt, step) {
    if (!S.stealth) return;
    var pp = S.game.player.position;
    var ST = S.stealth;
    // Guard patrol + vision.
    var seen = false;
    for (var i = 0; i < ST.guards.length; i++) {
      var gd = ST.guards[i];
      var gang = gd.gang;
      if (gang.dead) { gd.cone.visible = false; continue; }
      // Patrol: walk toward the current waypoint, flip at arrival.
      var wp = gd.target === 'b' ? gd.route.b : gd.route.a;
      var gx = gang.g.position.x, gz = gang.g.position.z;
      var dx = wp.x - gx, dz = wp.z - gz;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2) { gd.target = gd.target === 'b' ? 'a' : 'b'; }
      else {
        gd.heading = Math.atan2(dx, dz);
        var nx = gx + Math.sin(gd.heading) * gd.speed * dt;
        var nz = gz + Math.cos(gd.heading) * gd.speed * dt;
        var res = FL.city.resolveCircle(nx, nz, 0.5);
        gang.g.position.x = res.x;
        gang.g.position.z = res.z;
        gang.g.rotation.y = gd.heading;
        gang.animT += dt;
        gang.g.userData.setPose('walk', gang.animT, 0.5);
      }
      // Vision: player inside the cone (range + angle) and the alarm on.
      if (ST.alarmOn) {
        var pdx = pp.x - gx, pdz = pp.z - gz;
        var pdist = Math.sqrt(pdx * pdx + pdz * pdz);
        var pang = Math.abs(FL.wrapAngle(Math.atan2(pdx, pdz) - gd.heading));
        if (pdist < CONE_RANGE && pang < CONE_HALF_ANGLE) seen = true;
      }
    }
    // Detection meter.
    if (ST.alarmOn) {
      if (seen) ST.detection = Math.min(100, ST.detection + dt * 45);
      else ST.detection = Math.max(0, ST.detection - dt * 25);
      // Cone colour follows the meter.
      for (var j = 0; j < ST.guards.length; j++) {
        var c = ST.guards[j].cone;
        if (ST.guards[j].gang.dead) continue;
        c.visible = true;
        c.material.color.setHex(ST.detection > 70 ? 0xff4444 : (ST.detection > 30 ? 0xffb02d : 0x51ff7a));
      }
      if (ST.detection >= 100) {
        FL.audio.fail();
        cleanupStealth();
        FL.missions.failMission('Kamu ketahuan penjaga!');
        return;
      }
    } else {
      for (var k = 0; k < ST.guards.length; k++) ST.guards[k].cone.visible = false;
    }
    // Phase objectives.
    if (step.phase === 'infiltrate') {
      if (ST.detection > 0) FL.emit('objective', 'Terdeteksi: ' + Math.floor(ST.detection) + '% — sembunyi!');
      else FL.emit('objective', 'Masuk ke gudang Docks tanpa ketahuan');
      if (FL.dist2(pp.x, pp.z, step.x, step.z) < 36) FL.missions.nextStep();
    } else if (step.phase === 'alarm') {
      var nearPanel = FL.dist2(pp.x, pp.z, step.x, step.z) < 16;
      var holding = !!(S.game.keys && S.game.keys['KeyE']) && !S.game.player.inCar;
      if (nearPanel && holding) {
        ST.channel += dt / ALARM_TIME;
        FL.emit('objective', 'Menonaktifkan alarm: ' + Math.floor(ST.channel * 100) + '%');
        if (ST.channel >= 1) {
          ST.alarmOn = false;
          ST.detection = 0;
          FL.audio.mission();
          FL.emit('notif', 'Alarm dinonaktifkan — penjaga tidak lagi waspada');
          FL.missions.nextStep();
        }
      } else {
        ST.channel = Math.max(0, ST.channel - dt * 0.2);
        if (nearPanel) FL.emit('objective', 'Nonaktifkan panel alarm: tahan E');
      }
    } else if (step.phase === 'extract') {
      if (FL.dist2(pp.x, pp.z, step.x, step.z) < 36) {
        cleanupStealth();
        FL.missions.nextStep();
      }
    }
  }
  function cleanupStealth() {
    if (!S.stealth) return;
    S.stealth.guards.forEach(function (gd) {
      if (gd.gang && gd.gang.g) {
        S.scene.remove(gd.gang.g);
        var idx = FL.world.gangs.indexOf(gd.gang);
        if (idx >= 0) FL.world.gangs.splice(idx, 1);
      }
    });
    S.stealth = null;
  }

  // --- Boss (m12) ---
  // Seth Vane fights in three phases (driven by gang2.js: pistol fire, then
  // molotovs + minions, then an enraged rush). This module spawns him, keeps
  // his HP on the objective line, and advances the step when he falls.
  function startBoss(step) {
    S.bossRef = null;
    S.bossTimer = 0;
    if (FL.gang2) {
      S.bossRef = FL.gang2.spawnBoss(-224, 256);
      FL.gang2.spawnViper(-224, 256, 2);
    }
    FL.missions.setMarker(-224, 256, 0xff4444);
    FL.emit('objective', 'Kalahkan Seth Vane, bos The Vipers');
    FL.emit('notif', 'Seth Vane muncul! Hati-hati — dia punya 3 fase!');
    FL.audio.siren();
  }
  function updateBoss(dt, step) {
    if (!S.bossRef) {
      // gang2 missing or the boss never spawned: treat as done rather than
      // soft-locking the finale.
      FL.missions.nextStep();
      return;
    }
    if (S.bossRef.dead) {
      FL.audio.mission();
      FL.particles.burst(S.bossRef.g.position.x, 1.5, S.bossRef.g.position.z, 30,
        { color: 0xffd75e, size: 1.4, life: 1.0, spread: 8, vy: 4 });
      FL.emit('notif', 'Seth Vane kalah! The Vipers bubar!');
      if (FL.gang2) FL.gang2.clearVipers();
      S.bossRef = null;
      FL.missions.nextStep();
      return;
    }
    S.bossTimer -= dt;
    if (S.bossTimer <= 0) {
      S.bossTimer = 0.5;
      var pct = Math.max(0, Math.floor(S.bossRef.hp / S.bossRef.maxHp * 100));
      var phaseName = S.bossRef.phase === 1 ? 'Fase 1' : (S.bossRef.phase === 2 ? 'Fase 2 — Molotov' : 'Fase 3 — MENGAMUK');
      FL.emit('objective', 'Seth Vane — HP ' + pct + '% (' + phaseName + ')');
    }
  }
})();
