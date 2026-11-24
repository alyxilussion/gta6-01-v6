// FROSTLINE 3D — missions: 8-chapter story state machine with cinematic
// dialogue (letterbox + subtitles + camera cuts), objectives, timers,
// fail/retry, rewards, unlocks + side activities (taxi, races, collectibles).
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var M = {
    current: -1, // index into FL.MISSIONS, -1 = none active
    state: 'idle', // idle | intro | active | complete | failed
    step: 0, // objective step within the mission
    timer: 0, timeLeft: 0,
    marker: null, markerBeam: null, markerPos: null,
    cutscene: null, // { lines, idx, t, onDone }
    cutsceneCam: null,
    kills: 0, killsNeeded: 0,
    targetVehicle: null, convoy: [],
    taxi: null, race: null, collectibles: [], collected: 0,
    scene: null, game: null,
  };
  FL.missions = M;

  // --- Mission marker beam ---
  function setMarker(x, z, color) {
    clearMarker();
    var g = new THREE.Group();
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: color || 0xffd75e, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30;
    g.add(beam);
    var ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: color || 0xffd75e, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(ring);
    g.position.set(x, 0, z);
    M.scene.add(g);
    M.marker = g;
    M.markerPos = { x: x, z: z };
  }
  function clearMarker() {
    if (M.marker) { M.scene.remove(M.marker); M.marker = null; M.markerPos = null; }
  }

  // --- Cutscenes ---
  function playCutscene(lines, onDone) {
    M.cutscene = { lines: lines, idx: 0, t: 0, onDone: onDone };
    M.state = 'intro';
    FL.emit('cutscene-start', { lines: lines });
    showCutsceneLine();
  }
  function showCutsceneLine() {
    if (!M.cutscene) return;
    var line = M.cutscene.lines[M.cutscene.idx];
    if (!line) { endCutscene(); return; }
    // Camera cut: alternate between two angles around the player.
    var pp = M.game.player.position;
    var angle = M.cutscene.idx % 2 === 0 ? 0.6 : 2.4;
    M.cutsceneCam = {
      pos: { x: pp.x + Math.sin(angle) * 7, y: 3.2, z: pp.z + Math.cos(angle) * 7 },
      look: { x: pp.x, y: 1.4, z: pp.z },
    };
    FL.emit('subtitle', { speaker: line[0], text: line[1] });
  }
  function endCutscene() {
    var cb = M.cutscene ? M.cutscene.onDone : null;
    M.cutscene = null;
    M.cutsceneCam = null;
    FL.emit('cutscene-end', {});
    if (cb) cb();
  }
  FL.missions.advanceCutscene = function () {
    if (!M.cutscene) return;
    M.cutscene.idx++;
    M.cutscene.t = 0;
    showCutsceneLine();
  };

  // --- Mission definitions (steps are data-driven) ---
  function missionSteps(idx) {
    // Each step: { type, x, z, text, time?, kills?, target? }
    switch (idx) {
      case 0: return [
        // All mission targets sit ON ROADS (or the tower plaza) — never on
        // block centres, where buildings make the goto trigger unreachable.
        { type: 'goto', x: 96, z: -64, text: 'Pergi ke garasi Mara di Downtown' },
        { type: 'steal', x: 96, z: -64, text: 'Curi Vortex GT (tekan F di dekat mobil)' },
        { type: 'goto', x: -96, z: 64, text: 'Bawa mobil ke tempat persembunyian' },
      ];
      case 1: return [
        { type: 'goto', x: 160, z: 192, text: 'Ambil paket di pelabuhan' },
        { type: 'goto', x: -224, z: -224, text: 'Antar paket ke taman (180 detik)', time: 180 },
      ];
      case 2: return [
        { type: 'wanted', text: 'Buat onar — dapatkan 2 bintang wanted' },
        { type: 'evade', text: 'Kabur dari polisi sampai wanted hilang' },
      ];
      case 3: return [
        { type: 'goto', x: 0, z: 160, text: 'Temui Dex di jalan selatan' },
        { type: 'kills', kills: 3, x: 0, z: 160, text: 'Habisi 3 anggota geng (drive-by)' },
      ];
      case 4: return [
        { type: 'goto', x: 0, z: 24, text: 'Pergi ke plaza Meridian Tower' },
        { type: 'kills', kills: 6, x: 0, z: 24, text: 'Habisi 6 anggota geng di plaza tower' },
      ];
      case 5: return [
        { type: 'goto', x: 96, z: 96, text: 'Masuk ke Bank Harbor' },
        { type: 'survive', time: 45, text: 'Tahan polisi selama 45 detik' },
        { type: 'evade', text: 'Kabur dengan 3 bintang wanted' },
      ];
      case 6: return [
        { type: 'goto', x: 160, z: 256, text: 'Pergi ke jembatan pelabuhan' },
        { type: 'convoy', text: 'Hancurkan 3 truk konvoi Kade' },
      ];
      case 7: return [
        { type: 'goto', x: 192, z: -32, text: 'Pergi ke gerbang Stadion Harbor' },
        { type: 'kills', kills: 8, x: 192, z: -32, text: 'Habisi Kade dan pengawalnya (8 target)' },
      ];
      case 8: return [
        // v7: m9 "The Big One" — heist: gather the crew, crack the vault,
        // then lose a 4-star wanted level.
        { type: 'heist', phase: 'crew', x: -96, z: 96, text: 'Kumpulkan tim: temui Dex di garasi barat' },
        { type: 'heist', phase: 'crew', x: 96, z: -96, text: 'Temui Silas di Downtown utara' },
        { type: 'heist', phase: 'vault', x: 96, z: 96, text: 'Bobol brankas Bank Harbor (tahan E di dekat brankas)' },
        { type: 'evade', text: 'Kabur dari polisi dengan 4 bintang wanted' },
      ];
      case 9: return [
        // v7: m10 "Neon Grand Prix" — street race, 6 checkpoints, 2 rivals.
        { type: 'race', time: 180, text: 'Neon Grand Prix: 6 checkpoint, kalahkan Vex dan Rook (180 detik)' },
      ];
      case 10: return [
        // v7: m11 "Silent Harbor" — stealth: infiltrate the Docks, disable
        // the alarm, extract the documents.
        { type: 'stealth', phase: 'infiltrate', x: -224, z: 224, text: 'Masuk ke gudang Docks tanpa ketahuan penjaga' },
        { type: 'stealth', phase: 'alarm', x: -160, z: 256, text: 'Nonaktifkan panel alarm (tahan E di dekat panel)' },
        { type: 'stealth', phase: 'extract', x: -96, z: 160, text: 'Bawa dokumen keluar dari Docks' },
      ];
      case 11: return [
        // v7: m12 "Viper's Nest" — boss fight against Seth Vane.
        { type: 'goto', x: -224, z: 256, text: 'Pergi ke sarang Viper di Docks' },
        { type: 'boss', text: 'Kalahkan Seth Vane, bos The Vipers' },
      ];
      default: return [];
    }
  }

  function startStep() {
    var steps = missionSteps(M.current);
    var step = steps[M.step];
    if (!step) { completeMission(); return; }
    M.timeLeft = step.time || 0;
    M.kills = 0;
    M.killsNeeded = step.kills || 0;
    FL.emit('objective', step.text);
    if (step.x !== undefined) setMarker(step.x, step.z, 0xffd75e);
    else clearMarker();
    if (step.type === 'kills') {
      FL.world.spawnGang(step.x, step.z, step.kills);
    }
    if (step.type === 'convoy') {
      M.convoy = [];
      for (var i = 0; i < 3; i++) {
        // Convoy parked across the z=256 road, in front of the causeway.
        var v = new FL.Vehicle('truck', 148 + i * 12, 256, 0);
        M.scene.add(v.group);
        M.convoy.push(v);
      }
      setMarker(160, 256, 0xff4444);
    }
    if (step.type === 'wanted') {
      FL.emit('notif', 'Lakukan kejahatan di depan polisi!');
    }
    if (step.type === 'survive') {
      FL.world.addWanted(3, 'bank heist');
      FL.world.spawnGang(96, 96, 4);
    }
    if (step.type === 'heist' || step.type === 'race' || step.type === 'stealth' || step.type === 'boss') {
      // v7: extended-mission mechanics live in missions2.js.
      if (FL.missions2) FL.missions2.startStep(step, M.current);
    }
  }
  function nextStep() {
    M.step++;
    startStep();
  }
  function failMission(reason) {
    M.state = 'failed';
    clearMarker();
    FL.audio.fail();
    FL.emit('mission-failed', { reason: reason });
    FL.emit('notif', 'Misi gagal: ' + reason + ' — tekan J untuk mencoba lagi');
  }
  function completeMission() {
    var def = FL.MISSIONS[M.current];
    M.state = 'complete';
    clearMarker();
    FL.audio.mission();
    M.game.addMoney(def.reward);
    FL.emit('mission-complete', { mission: def, reward: def.reward });
    FL.emit('notif', 'Misi selesai! +' + FL.fmtMoney(def.reward));
    if (def.unlock) FL.emit('notif', 'Unlock: ' + def.unlock);
    M.current = -1;
    M.game.saveGame();
  }

  FL.missions.startMission = function (idx) {
    if (M.state === 'active' || M.state === 'intro') return false;
    var def = FL.MISSIONS[idx];
    if (!def) return false;
    M.current = idx;
    M.step = 0;
    // Intro cutscene (briefing dialogue).
    var lines = [
      [def.giver, def.brief || def.briefing],
      ['Kai', 'Siap. Aku yang urus.'],
    ];
    if (idx === 0) {
      lines = [
        ['Mara Voss', 'Kai. Selamat datang di Neon Harbor. Kota ini milik mereka yang berani.'],
        ['Mara Voss', 'Kade menguasai pelabuhan. Kita ambil alih, satu pekerjaan demi satu pekerjaan.'],
        ['Kai', 'Mulai dari mana?'],
        ['Mara Voss', 'Ada Vortex GT di garasi Downtown. Ambil. Jangan sampai ketahuan.'],
      ];
    }
    playCutscene(lines, function () {
      M.state = 'active';
      startStep();
    });
    return true;
  };
  FL.missions.retryMission = function () {
    if (M.current < 0) return;
    M.state = 'idle';
    FL.missions.startMission(M.current);
  };
  FL.missions.nextMissionIndex = function () {
    return M.game ? M.game.missionsCompleted : 0;
  };

  FL.missions.update = function (dt) {
    // Cutscene auto-advance (4 s per line).
    if (M.cutscene) {
      M.cutscene.t += dt;
      if (M.cutscene.t > 4.5) FL.missions.advanceCutscene();
      return;
    }
    if (M.state !== 'active') return;
    var steps = missionSteps(M.current);
    var step = steps[M.step];
    if (!step) return;
    var pp = M.game.player.position;
    // Timer.
    if (step.time) {
      M.timeLeft -= dt;
      FL.emit('timer', Math.max(0, M.timeLeft));
      if (M.timeLeft <= 0) {
        if (step.type === 'survive') { nextStep(); return; }
        failMission('Waktu habis');
        return;
      }
    }
    switch (step.type) {
      case 'goto':
        if (FL.dist2(pp.x, pp.z, step.x, step.z) < 36) nextStep();
        break;
      case 'steal':
        if (M.game.player.inCar && M.game.player.vehicle && M.game.player.vehicle.type === 'sports') nextStep();
        break;
      case 'wanted':
        if (FL.world.wanted >= 2) nextStep();
        break;
      case 'evade':
        if (FL.world.wanted === 0) nextStep();
        break;
      case 'kills':
        if (M.kills >= M.killsNeeded) nextStep();
        break;
      case 'convoy': {
        var alive = 0;
        M.convoy.forEach(function (v) { if (!v.dead) alive++; });
        FL.emit('objective', 'Hancurkan konvoi: ' + (3 - alive) + '/3');
        if (alive === 0) nextStep();
        break;
      }
      case 'survive':
        // Handled by the timer above.
        break;
      case 'heist': case 'race': case 'stealth': case 'boss':
        // v7: the step's own mechanics decide when it advances.
        if (FL.missions2) FL.missions2.updateStep(dt, step);
        break;
    }
    // Mission marker pulse.
    if (M.marker) M.marker.rotation.y += dt * 0.8;
  };

  // --- Side activities ---
  FL.missions.startTaxi = function () {
    if (M.taxi) return;
    var from = FL.city.randomSidewalkPoint();
    var to = FL.city.randomSidewalkPoint();
    M.taxi = { from: from, to: to, phase: 'pickup', fare: FL.randInt(40, 120) };
    setMarker(from.x, from.z, 0x51ff7a);
    FL.emit('objective', 'Taksi: jemput penumpang (penanda hijau)');
    FL.emit('notif', 'Order taksi baru — tarif $' + M.taxi.fare);
  };
  FL.missions.startRace = function () {
    if (M.race) return;
    var pts = [];
    for (var i = 0; i < 5; i++) pts.push(FL.city.randomRoadPoint());
    M.race = { points: pts, idx: 0, timeLeft: 120 };
    setMarker(pts[0].x, pts[0].z, 0x5aa8ff);
    FL.emit('objective', 'Balapan jalanan: lewati 5 checkpoint (120 detik)');
  };
  FL.missions.updateSide = function (dt) {
    if (!M.game) return;
    var pp = M.game.player.position;
    if (M.taxi) {
      var target = M.taxi.phase === 'pickup' ? M.taxi.from : M.taxi.to;
      if (FL.dist2(pp.x, pp.z, target.x, target.z) < 25) {
        if (M.taxi.phase === 'pickup') {
          M.taxi.phase = 'dropoff';
          setMarker(M.taxi.to.x, M.taxi.to.z, 0x51ff7a);
          FL.emit('objective', 'Taksi: antar penumpang ke tujuan');
          FL.emit('notif', 'Penumpang naik!');
        } else {
          M.game.addMoney(M.taxi.fare);
          FL.emit('notif', 'Taksi selesai! +$' + M.taxi.fare);
          FL.audio.mission();
          M.taxi = null;
          clearMarker();
        }
      }
    }
    if (M.race) {
      M.race.timeLeft -= dt;
      FL.emit('timer', Math.max(0, M.race.timeLeft));
      if (M.race.timeLeft <= 0) {
        FL.emit('notif', 'Balapan gagal — waktu habis');
        M.race = null; clearMarker();
        return;
      }
      var pt = M.race.points[M.race.idx];
      if (FL.dist2(pp.x, pp.z, pt.x, pt.z) < 49) {
        M.race.idx++;
        if (M.race.idx >= M.race.points.length) {
          M.game.addMoney(300);
          FL.emit('notif', 'Balapan menang! +$300');
          FL.audio.mission();
          M.race = null; clearMarker();
        } else {
          setMarker(M.race.points[M.race.idx].x, M.race.points[M.race.idx].z, 0x5aa8ff);
          FL.emit('objective', 'Checkpoint ' + (M.race.idx + 1) + '/5');
        }
      }
    }
    // Collectibles: 10 hidden packages.
    if (M.collectibles.length === 0) {
      for (var i = 0; i < 10; i++) {
        var p = FL.city.randomSidewalkPoint();
        M.collectibles.push({ x: p.x, z: p.z, taken: false });
        FL.world.spawnPickup('money', p.x, p.z);
      }
    }
  };

  FL.missions.init = function (scene, game) {
    M.scene = scene;
    M.game = game;
    FL.on('gang-down', function () {
      M.kills++;
      FL.emit('objective', 'Target: ' + M.kills + '/' + M.killsNeeded);
    });
    FL.on('player-dead', function () {
      if (M.state === 'active') failMission('Kamu mati');
    });
  };
  FL.missions.getMarkerPos = function () { return M.markerPos; };
  FL.missions.getState = function () { return { current: M.current, state: M.state, step: M.step }; };
  // v7: hooks for missions2 (extended missions m9-m12) and systems.js
  // (vigilante + delivery borrow the marker when no mission is running).
  FL.missions.setMarker = setMarker;
  FL.missions.clearMarker = clearMarker;
  FL.missions.nextStep = nextStep;
  FL.missions.failMission = failMission;
})();
