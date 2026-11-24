// FROSTLINE 3D — weather (v7): dynamic weather + ambient particles.
// A slow state machine cycles the sky through clear, light rain, heavy
// rain, storm (lightning + delayed thunder) and fog. It owns the rain flag
// the day/night cycle used to flip at random, drives the rain's visual
// density, pulls the fog in and out, and adds two particle touches the base
// game lacks: exhaust puffs from traffic and an expanding shockwave ring on
// every explosion.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  // state: { rain (0-1 visual intensity), fogNear, fogFar, label }
  var STATES = {
    clear: { rain: 0, fogNear: 60, fogFar: 320, label: 'Langit cerah' },
    drizzle: { rain: 0.35, fogNear: 50, fogFar: 280, label: 'Gerimis' },
    downpour: { rain: 0.85, fogNear: 40, fogFar: 220, label: 'Hujan deras' },
    storm: { rain: 1.0, fogNear: 30, fogFar: 180, label: 'Badai petir!' },
    fog: { rain: 0, fogNear: 22, fogFar: 130, label: 'Kabut tebal' },
  };
  var ORDER = ['clear', 'drizzle', 'downpour', 'storm', 'fog'];

  var W = {
    scene: null, game: null,
    state: 'clear', timer: 50,
    flashT: 0, nextBolt: 8,
    thunderQueue: [], // delays (s) until each rumble
    rings: [], // shockwave rings { mesh, t }
    exhaustIdx: 0,
    announced: true,
  };
  FL.weather = W;

  FL.weather.init = function (scene, game) {
    W.scene = scene;
    W.game = game;
    // Every explosion gets a shockwave ring.
    FL.on('explosion', function (e) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.0, 32),
        new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.4, e.z);
      scene.add(ring);
      W.rings.push({ mesh: ring, t: 0, maxR: (e.radius || 9) * 1.6 });
    });
  };

  function pickNextState() {
    // Weighted wander: storms only follow heavy rain, fog only follows
    // clear or drizzle — the sky changes gradually, never jumps.
    var cur = W.state;
    var pool;
    if (cur === 'clear') pool = ['clear', 'clear', 'drizzle', 'fog'];
    else if (cur === 'drizzle') pool = ['clear', 'drizzle', 'downpour', 'fog'];
    else if (cur === 'downpour') pool = ['drizzle', 'downpour', 'storm'];
    else if (cur === 'storm') pool = ['downpour', 'downpour', 'drizzle'];
    else pool = ['clear', 'drizzle', 'fog'];
    return FL.pick(pool);
  }
  function setState(next) {
    W.state = next;
    W.timer = FL.rand(45, 100);
    W.nextBolt = FL.rand(3, 9);
    if (!W.announced) {
      FL.emit('notif', STATES[next].label);
    }
    W.announced = false;
  }

  function updateLightning(dt) {
    if (W.state !== 'storm') return;
    W.nextBolt -= dt;
    if (W.nextBolt <= 0) {
      W.nextBolt = FL.rand(4, 12);
      W.flashT = 0.18;
      // Thunder arrives 0.5-2 s after the flash (fake distance).
      W.thunderQueue.push(FL.rand(0.5, 2.0));
      // A jagged sky flash: spike the sun + hemisphere light.
      if (W.game.sun) W.game.sun.intensity += 3.5;
      if (W.game.hemi) W.game.hemi.intensity += 1.5;
      // v8: the bolt can strike a street lamp near the player.
      strikeLamp();
    }
    if (W.flashT > 0) {
      W.flashT -= dt;
      if (W.flashT <= 0 && W.game.sun) {
        // The day/night cycle restores the base intensities next frame;
        // nothing to undo here.
      }
    }
    for (var i = W.thunderQueue.length - 1; i >= 0; i--) {
      W.thunderQueue[i] -= dt;
      if (W.thunderQueue[i] <= 0) {
        W.thunderQueue.splice(i, 1);
        FL.audio.blip(55, 1.1, 'sine', 0.3);
        setTimeout(function () { FL.audio.blip(42, 0.8, 'sine', 0.2); }, 250);
      }
    }
  }

  // --- Lightning striking a street lamp (v8) ---
  // A bolt picks a random lamp within 120 m of the player and draws a
  // jagged line from the sky (y=40) down to the lamp head (y=7, the height
  // city.js mounts the heads at), with sparks at the strike point and a
  // sharp crack. The line lives 0.25 s and fades out.
  var BOLT_LIFE = 0.25;
  var strikeLine = null, strikeT = 0;
  function strikeLamp() {
    var lamps = FL.city.lamps || [];
    if (!lamps.length || !W.scene) return;
    var pp = W.game.player ? W.game.player.position : { x: 0, z: 0 };
    var near = lamps.filter(function (l) {
      return FL.dist2(l.x, l.z, pp.x, pp.z) < 14400; // within 120 m
    });
    if (!near.length) return;
    var lamp = FL.pick(near);
    var pts = [];
    for (var i = 0; i <= 8; i++) {
      var y = 40 - (40 - 7) * (i / 8);
      var jag = (i > 0 && i < 8) ? FL.rand(-2, 2) : 0;
      pts.push(new THREE.Vector3(lamp.x + jag, y, lamp.z + jag));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    if (strikeLine) { W.scene.remove(strikeLine); strikeLine.geometry.dispose(); }
    strikeLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 1 }));
    W.scene.add(strikeLine);
    strikeT = BOLT_LIFE;
    FL.particles.burst(lamp.x, 7, lamp.z, 12, { color: 0xffe28a, size: 0.7, life: 0.5, spread: 4, vy: 2 });
    FL.audio.noise(0.15, 3000, 0.4, 'highpass'); // the crack
    FL.audio.blip(180, 0.1, 'sawtooth', 0.2);
  }
  function updateStrike(dt) {
    if (strikeT <= 0) return;
    strikeT -= dt;
    if (strikeT <= 0 && strikeLine) {
      W.scene.remove(strikeLine);
      strikeLine.geometry.dispose();
      strikeLine = null;
    } else if (strikeLine) {
      strikeLine.material.opacity = strikeT / BOLT_LIFE;
    }
  }

  function updateRainAndFog(dt) {
    var def = STATES[W.state];
    var game = W.game;
    // Own the rain flag (the day/night cycle used to flip it at random).
    game.raining = def.rain > 0;
    if (game.rain) {
      // Density follows the state; the fall speed stays the engine's.
      game.rain.material.opacity = 0.25 + def.rain * 0.55;
    }
    // Fog eases toward the state's band (never snaps).
    if (game.scene && game.scene.fog) {
      game.scene.fog.near = FL.damp(game.scene.fog.near, def.fogNear, 0.8, dt);
      game.scene.fog.far = FL.damp(game.scene.fog.far, def.fogFar, 0.8, dt);
    }
  }

  function updateExhaust(dt) {
    // A rotating slice of traffic + police cars puff exhaust, so the cost
    // stays flat no matter how many cars are on the road.
    var cars = FL.world.traffic;
    var cops = FL.world.policeCars;
    var total = cars.length + cops.length;
    if (total === 0) return;
    for (var n = 0; n < 4; n++) {
      W.exhaustIdx = (W.exhaustIdx + 1) % total;
      var entry = W.exhaustIdx < cars.length ? cars[W.exhaustIdx] : cops[W.exhaustIdx - cars.length];
      var v = entry.v;
      if (!v || v.dead || Math.abs(v.speed) < 3) continue;
      if (Math.random() > dt * 6) continue;
      var bx = v.group.position.x - Math.sin(v.heading) * 2.2;
      var bz = v.group.position.z - Math.cos(v.heading) * 2.2;
      FL.particles.spawn(bx, 0.5, bz,
        { color: 0x99a5b5, size: 0.55, life: 0.7, vy: 0.9, grow: 0.9, opacity: 0.35 });
    }
  }

  function updateRings(dt) {
    for (var i = W.rings.length - 1; i >= 0; i--) {
      var r = W.rings[i];
      r.t += dt;
      var life = 0.7;
      if (r.t >= life) {
        W.scene.remove(r.mesh);
        W.rings.splice(i, 1);
        continue;
      }
      var k = r.t / life;
      var scale = 1 + k * r.maxR;
      r.mesh.scale.set(scale, scale, 1);
      r.mesh.material.opacity = 0.9 * (1 - k);
    }
  }

  FL.weather.update = function (dt) {
    if (!W.game) return;
    W.timer -= dt;
    if (W.timer <= 0) setState(pickNextState());
    updateRainAndFog(dt);
    updateLightning(dt);
    updateStrike(dt);
    updateExhaust(dt);
    updateRings(dt);
  };
  FL.weather.getState = function () { return { state: W.state, label: STATES[W.state].label }; };
})();
