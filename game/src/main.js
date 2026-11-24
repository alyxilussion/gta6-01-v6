// FROSTLINE 3D — main: renderer, fixed-timestep loop, central state machine,
// player controller (on foot + in car), cameras, day/night + rain, pointer
// lock, input, WASTED/BUSTED, save/autosave, title flyover.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var game = {
    state: 'loading',
    renderer: null, scene: null, camera: null,
    sun: null, hemi: null, sunSprite: null, moonSprite: null,
    player: null, keys: {}, mouseDown: false, mousePressed: false, aiming: false,
    camYaw: 0, camPitch: 0.35, camDist: 7,
    cameraHeading: 0, fov: 60, shake: 0,
    hour: FL.CFG.startHour, rain: null, raining: false, rainTimer: 60,
    money: 250, missionsCompleted: 0,
    settings: { volume: 0.8, sensitivity: 1.0, quality: 'high', invertY: false },
    fps: 60, frameCount: 0, fpsTimer: 0,
    lastTime: 0, acc: 0, saveTimer: 0,
    flyoverT: 0, respawnPoint: null, respawnFee: 0, snapCamera: false,
  };
  FL.game = game;

  // --- Player ---
  function createPlayer() {
    var g = FL.makeHumanoid({ skin: 0xd8a07a, shirt: 0x1a9a7a, pants: 0x1a1a2a, hair: 0x1a1a1a });
    // Spawn on the x=0 road, clear of the Meridian Tower (its collider spans
    // +/-13 around the origin — the old spawn (8,8) was INSIDE the tower).
    g.position.set(0, 0, 32);
    game.scene.add(g);
    var p = {
      group: g, position: g.position, heading: 0, speed: 0,
      vy: 0, onGround: true, health: 100, armor: 0,
      weapons: ['fists', 'pistol'], weaponIdx: 1,
      ammo: 12, reserveAmmo: 48, inCar: false, vehicle: null,
      animT: 0, shootCooldown: 0, reloadTimer: 0, grenades: 3,
      punchCooldown: 0,
    };
    p.weapon = FL.WEAPONS[1];
    return p;
  }

  // --- Renderer / scene setup ---
  function initRenderer() {
    var canvas = document.getElementById('game');
    try {
      game.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      var err = document.getElementById('webgl-error');
      if (err) err.style.display = 'flex';
      var load = document.getElementById('loading');
      if (load) load.style.display = 'none';
      FL.logError('WebGL unavailable: ' + e.message);
      return false;
    }
    game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    game.renderer.shadowMap.enabled = true;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    game.renderer.toneMappingExposure = 1.15;
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x1a2440);
    game.scene.fog = new THREE.Fog(0x1a2440, 60, 320);
    game.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
    game.camera.position.set(8, 6, 16);
    // Sun (one directional light, shadow camera follows the player).
    game.sun = new THREE.DirectionalLight(0xffb36b, 2.2);
    game.sun.castShadow = true;
    game.sun.shadow.mapSize.set(2048, 2048);
    game.sun.shadow.camera.left = -70; game.sun.shadow.camera.right = 70;
    game.sun.shadow.camera.top = 70; game.sun.shadow.camera.bottom = -70;
    game.sun.shadow.camera.near = 1; game.sun.shadow.camera.far = 300;
    game.sun.shadow.bias = -0.0005;
    game.scene.add(game.sun);
    game.scene.add(game.sun.target);
    game.hemi = new THREE.HemisphereLight(0x8a7aff, 0x1a2030, 0.7);
    game.scene.add(game.hemi);
    // Hero light: a soft warm light that follows the player at night so the
    // protagonist stays readable on dark streets (no shadow — cheap).
    game.heroLight = new THREE.PointLight(0xffe0b3, 0, 14, 1.6);
    game.heroLight.position.set(0, 3, 32);
    game.scene.add(game.heroLight);
    // Sun + moon sprites (fake glow, no post-processing).
    function glowSprite(color, size) {
      var c = document.createElement('canvas'); c.width = 64; c.height = 64;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
      s.scale.set(size, size, 1);
      return s;
    }
    game.sunSprite = glowSprite('rgba(255,170,80,0.9)', 60);
    game.moonSprite = glowSprite('rgba(200,220,255,0.8)', 35);
    game.scene.add(game.sunSprite);
    game.scene.add(game.moonSprite);
    // (Vignette overlay already exists in index.html as #vignette.)
    return true;
  }

  // --- Rain (Points, recycled around the player) ---
  function initRain() {
    var count = 900;
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9ab8d8, size: 0.12, transparent: true, opacity: 0.5 }));
    rain.visible = false;
    rain.frustumCulled = false;
    game.scene.add(rain);
    game.rain = rain;
  }
  function updateRain(dt) {
    if (!game.rain) return;
    if (!game.raining) { game.rain.visible = false; return; }
    game.rain.visible = true;
    var pp = game.player.position;
    game.rain.position.set(pp.x, 0, pp.z);
    var pos = game.rain.geometry.attributes.position.array;
    for (var i = 0; i < pos.length; i += 3) {
      pos[i + 1] -= 28 * dt;
      if (pos[i + 1] < 0) pos[i + 1] = 40;
    }
    game.rain.geometry.attributes.position.needsUpdate = true;
  }

  // --- Day/night cycle ---
  function updateDayNight(dt) {
    game.hour += (dt / FL.CFG.dayLength) * 24;
    if (game.hour >= 24) game.hour -= 24;
    var h = game.hour;
    // Sun angle: 6h = sunrise (east), 18h = sunset (west).
    var sunAngle = ((h - 6) / 12) * Math.PI;
    var sunY = Math.sin(sunAngle);
    var isDay = sunY > 0;
    var pp = game.player ? game.player.position : { x: 0, z: 0 };
    // Sun position (relative to the player, shadow camera follows).
    var sx = pp.x + Math.cos(sunAngle) * 120;
    var sy = Math.max(8, sunY * 120 + 20);
    var sz = pp.z + 40;
    // Snap the shadow camera to a texel grid (no flicker).
    var texel = 140 / 2048;
    game.sun.position.set(Math.round(sx / texel) * texel, sy, Math.round(sz / texel) * texel);
    game.sun.target.position.set(pp.x, 0, pp.z);
    // Colors by time of day.
    var dayCol = new THREE.Color(0x87b5e0), duskCol = new THREE.Color(0x2a1a4a), nightCol = new THREE.Color(0x0a1024);
    var sky = new THREE.Color();
    if (h >= 6 && h < 17) sky.copy(dayCol);
    else if (h >= 17 && h < 20) sky.copy(duskCol).lerp(dayCol, (20 - h) / 3 * 0.4);
    else sky.copy(nightCol);
    game.scene.background.copy(sky);
    game.scene.fog.color.copy(sky);
    // Night is never pitch black: this is a neon city. Dusk (17-21h) keeps a
    // warm glow; deep night keeps enough ambient to read the street.
    var dusk = !isDay && h >= 17 && h < 21;
    game.sun.intensity = isDay ? 2.2 : (dusk ? 1.0 : 0.55);
    game.sun.color.setHex(isDay ? 0xfff2cc : (dusk ? 0xffb38a : 0x8a9aff));
    game.hemi.intensity = isDay ? 0.7 : (dusk ? 1.0 : 0.6);
    // Hero light follows the player; on at dusk/night only.
    game.heroLight.intensity = isDay ? 0 : (dusk ? 12 : 16);
    game.heroLight.position.set(pp.x, 3.2, pp.z);
    // Sun/moon sprites.
    game.sunSprite.position.set(pp.x + Math.cos(sunAngle) * 300, Math.max(20, sunY * 300 + 40), pp.z - 200);
    game.sunSprite.visible = isDay;
    var moonAngle = sunAngle + Math.PI;
    game.moonSprite.position.set(pp.x + Math.cos(moonAngle) * 300, Math.max(30, Math.sin(moonAngle) * 300 + 60), pp.z - 200);
    game.moonSprite.visible = !isDay;
    // Rain weather: random 20% chance every 60 s.
    game.rainTimer -= dt;
    if (game.rainTimer <= 0) {
      game.rainTimer = 60;
      game.raining = Math.random() < 0.2;
    }
  }

  // --- Input ---
  function initInput() {
    var canvas = document.getElementById('game');
    window.addEventListener('keydown', function (e) {
      if (e.code === 'F3') { e.preventDefault(); FL.hud.toggleDebug(); return; }
      game.keys[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.repeat) return;
      handleKeyPress(e.code);
    });
    window.addEventListener('keyup', function (e) { game.keys[e.code] = false; });
    window.addEventListener('blur', function () {
      game.keys = {};
      if (game.state === 'playing') game.pause();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.state === 'playing') game.pause();
    });
    window.addEventListener('resize', function () {
      if (!game.renderer) return;
      game.camera.aspect = window.innerWidth / window.innerHeight;
      game.camera.updateProjectionMatrix();
      game.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement !== canvas) return;
      // The first mousemove after a lock can carry a spurious delta (the
      // browser warps the cursor); drop it so the camera never jumps.
      if (game.ignoreNextMouseMove) { game.ignoreNextMouseMove = false; return; }
      var sens = game.settings.sensitivity * 0.0022;
      game.camYaw -= e.movementX * sens;
      game.camPitch += e.movementY * sens * (game.settings.invertY ? -1 : 1);
      game.camPitch = FL.clamp(game.camPitch, -0.5, 1.1);
    });
    document.addEventListener('mousedown', function (e) {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) { game.mouseDown = true; game.mousePressed = true; }
      if (e.button === 2) game.aiming = true;
    });
    document.addEventListener('mouseup', function (e) {
      // NOTE: mousePressed is NOT cleared here — a click's down+up pair can
      // complete inside one frame (before the game loop runs), which would
      // swallow the shot. It is consumed by the shooting code instead.
      if (e.button === 0) game.mouseDown = false;
      if (e.button === 2) game.aiming = false;
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('wheel', function (e) {
      if (game.state !== 'playing') return;
      var dir = e.deltaY > 0 ? 1 : -1;
      cycleWeapon(dir);
    }, { passive: true });
    canvas.addEventListener('click', function () {
      if (game.state === 'playing' && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', function () {
      if (document.pointerLockElement === canvas) game.ignoreNextMouseMove = true;
      else if (game.state === 'playing') game.pause();
    });
  }
  function handleKeyPress(code) {
    if (game.state === 'cutscene') {
      if (code === 'Space' || code === 'Enter') FL.missions.advanceCutscene();
      return;
    }
    if (game.state === 'title') return;
    // v7: when a shop/garage menu is open, it owns the keys (Esc closes it).
    if (FL.systems && FL.systems.menuOpen()) {
      FL.systems.menuKey(code);
      return;
    }
    if (code === 'Escape') {
      if (game.state === 'map') { closeMap(); return; }
      if (game.state === 'playing') { game.pause(); return; }
      if (game.state === 'paused') { game.resume(); return; }
    }
    if (game.state !== 'playing') return;
    switch (code) {
      case 'KeyM': openMap(); break;
      case 'KeyQ': FL.audio.radioNext(); FL.hud.notify('Radio: ' + FL.audio.radioName()); break;
      case 'KeyH': FL.hud.toggleControls(); break;
      case 'KeyF': tryEnterCar(); break;
      case 'KeyE': tryEnterCar(); break;
      case 'KeyR':
        if (game.player.inCar) { /* flip recovery handled in update */ }
        else startReload();
        break;
      case 'KeyG': throwGrenade(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
        selectWeapon(parseInt(code.slice(5), 10) - 1);
        break;
      case 'KeyT': FL.missions.startTaxi(); break;
      case 'KeyY': FL.missions.startRace(); break;
      case 'KeyB': if (FL.systems) FL.systems.toggleShop(); break;
      case 'KeyN': if (FL.systems) FL.systems.startVigilante(); break;
      case 'KeyU': if (FL.systems) FL.systems.startDelivery(); break;
      case 'KeyJ': {
        var ms = FL.missions.getState();
        if (ms.state === 'active' || ms.state === 'intro') {
          FL.hud.notify('Misi sedang berjalan — ikuti penanda kuning');
        } else if (game.missionsCompleted < FL.MISSIONS.length) {
          FL.missions.startMission(game.missionsCompleted);
        } else {
          FL.hud.notify('Semua misi selesai! Jelajahi Neon Harbor.');
        }
        break;
      }
    }
  }
  function selectWeapon(idx) {
    var p = game.player;
    if (!p || p.inCar) return;
    if (idx < 0 || idx >= p.weapons.length) return;
    p.weaponIdx = idx;
    var id = p.weapons[idx];
    for (var i = 0; i < FL.WEAPONS.length; i++) if (FL.WEAPONS[i].id === id) p.weapon = FL.WEAPONS[i];
    FL.audio.click();
  }
  function cycleWeapon(dir) {
    var p = game.player;
    if (!p || p.inCar || p.weapons.length < 2) return;
    var idx = (p.weaponIdx + dir + p.weapons.length) % p.weapons.length;
    selectWeapon(idx);
  }
  function startReload() {
    var p = game.player;
    if (!p || p.weapon.id === 'fists' || p.reloadTimer > 0 || p.reserveAmmo <= 0) return;
    p.reloadTimer = p.weapon.reload;
    FL.audio.click();
  }

  // --- Carjack / enter-exit ---
  function nearestVehicle(maxDist) {
    var pp = game.player.position;
    var best = null, bestD = maxDist * maxDist;
    function check(v, owner) {
      var d2 = FL.dist2(v.group.position.x, v.group.position.z, pp.x, pp.z);
      if (d2 < bestD && !v.dead) { bestD = d2; best = { v: v, owner: owner }; }
    }
    FL.world.traffic.forEach(function (c) { check(c.v, 'traffic'); });
    FL.world.policeCars.forEach(function (c) { check(c.v, 'police'); });
    // v7: helicopters + boats are boardable too (the boat from the causeway).
    if (FL.vehicles2) {
      FL.vehicles2.helis.forEach(function (h) { check(h, 'heli'); });
      FL.vehicles2.boats.forEach(function (b) { check(b, 'boat'); });
    }
    return best;
  }
  function tryEnterCar() {
    var p = game.player;
    if (!p) return;
    if (p.inCar) { exitCar(); return; }
    var found = nearestVehicle(4.5);
    if (!found) { FL.hud.notify('Tidak ada kendaraan di dekatmu'); return; }
    var v = found.v;
    if (found.owner === 'traffic') {
      // Carjack: remove from traffic, the driver flees on foot.
      for (var i = 0; i < FL.world.traffic.length; i++) {
        if (FL.world.traffic[i].v === v) { FL.world.traffic.splice(i, 1); break; }
      }
      var driver = FL.makeHumanoid({ skin: 0xd8a07a, shirt: 0x8a8a8a, pants: 0x2a3348, hair: 0x1a1a1a });
      driver.position.set(v.group.position.x + 2, 0, v.group.position.z + 2);
      game.scene.add(driver);
      // The fleeing driver becomes a panicked ped.
      var from = FL.city.nearestNode(driver.position.x, driver.position.z);
      var to = FL.randInt(0, FL.city.navNodes.length - 1);
      FL.world.peds.push({
        g: driver, path: FL.city.findPath(from, to), pathIdx: 1,
        speed: 1.5, hp: 100, dead: false, panic: 5,
        panicDir: { x: 1, z: 0 }, animT: 0, isCop: false, isGang: false,
      });
      FL.hud.notify('Mobil dicuri!');
      // Wanted if a cop sees it.
      var copNear = false;
      FL.world.policeCars.forEach(function (c) {
        if (FL.dist2(c.v.group.position.x, c.v.group.position.z, p.position.x, p.position.z) < 3600) copNear = true;
      });
      FL.world.footCops.forEach(function (c) {
        if (FL.dist2(c.g.position.x, c.g.position.z, p.position.x, p.position.z) < 3600) copNear = true;
      });
      if (copNear) FL.world.addWanted(1, 'carjack seen');
    }
    p.inCar = true;
    p.vehicle = v;
    v.isPlayer = true;
    p.group.visible = false;
    game.snapCamera = true;
    FL.audio.engine(true);
    FL.hud.setCrosshair(false);
  }
  function exitCar() {
    var p = game.player;
    if (!p || !p.vehicle) return;
    var v = p.vehicle;
    // v7: no bailing out of a helicopter mid-air — land first.
    if (v.isHeli && v.group.position.y > 3) {
      FL.hud.notify('Mendarat dulu sebelum keluar!');
      return;
    }
    var side = { x: v.group.position.x + Math.cos(v.heading) * 3, z: v.group.position.z - Math.sin(v.heading) * 3 };
    var res = FL.city.resolveCircle(side.x, side.z, 0.6);
    p.group.position.set(res.x, 0, res.z);
    p.group.visible = true;
    p.inCar = false;
    p.vehicle = null;
    v.isPlayer = false;
    v.speed *= 0.3;
    game.snapCamera = true;
    FL.audio.engine(false);
  }

  function throwGrenade() {
    var p = game.player;
    if (!p || p.grenades <= 0 || p.inCar) return;
    p.grenades--;
    FL.hud.notify('Granat dilempar! Sisa: ' + p.grenades);
    var dir = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    var gx = p.position.x + dir.x * 6, gz = p.position.z + dir.z * 6;
    setTimeout(function () {
      FL.particles.burst(gx, 1.0, gz, 26, { color: 0xff8833, size: 1.6, life: 0.8, spread: 7, vy: 4 });
      FL.audio.explosion();
      FL.emit('shake', 0.7);
      FL.emit('explosion', { x: gx, z: gz, radius: 9 });
      FL.world.addWanted(1, 'explosion');
    }, 1200);
  }

  // --- Player update (on foot) ---
  function updatePlayerOnFoot(dt) {
    var p = game.player;
    p.animT += dt;
    p.shootCooldown -= dt;
    p.punchCooldown -= dt;
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        var need = p.weapon.mag - p.ammo;
        var take = Math.min(need, p.reserveAmmo);
        p.ammo += take; p.reserveAmmo -= take;
      }
    }
    var k = game.keys;
    var fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    var strafe = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    var sprint = !!(k['ShiftLeft'] || k['ShiftRight']);
    var speed = sprint ? FL.CFG.playerSprint : FL.CFG.playerSpeed;
    // Movement relative to the camera yaw.
    var moveX = 0, moveZ = 0;
    if (fwd !== 0 || strafe !== 0) {
      var sin = Math.sin(game.camYaw), cos = Math.cos(game.camYaw);
      // Camera looks along -sin/-cos from the player; forward = (-sin, -cos).
      moveX = -sin * fwd + cos * strafe;
      moveZ = -cos * fwd - sin * strafe;
      var len = Math.sqrt(moveX * moveX + moveZ * moveZ) || 1;
      moveX /= len; moveZ /= len;
      p.heading = Math.atan2(moveX, moveZ);
    }
    var moving = (fwd !== 0 || strafe !== 0);
    p.speed = moving ? speed : 0;
    if (moving) {
      var nx = p.position.x + moveX * speed * dt;
      var nz = p.position.z + moveZ * speed * dt;
      var res = FL.city.resolveCircle(nx, nz, 0.5);
      p.position.x = res.x; p.position.z = res.z;
      p.group.rotation.y = p.heading;
      // Footsteps.
      if (Math.random() < dt * (sprint ? 6 : 3.5)) FL.audio.step();
    }
    // Jump.
    if ((k['Space']) && p.onGround) {
      p.vy = 8; p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= FL.CFG.gravity * dt;
      p.position.y += p.vy * dt;
      if (p.position.y <= 0) { p.position.y = 0; p.vy = 0; p.onGround = true; }
    }
    // Aim: face the camera direction while aiming.
    if (game.aiming) {
      p.heading = game.camYaw + Math.PI;
      p.group.rotation.y = p.heading;
      FL.hud.setCrosshair(true);
    } else {
      FL.hud.setCrosshair(false);
    }
    // Shooting / punching. Auto weapons (SMG) fire while held; semi-auto
    // weapons (pistol, shotgun) fire once per click (trigger discipline).
    var trigger = p.weapon.auto ? game.mouseDown : game.mousePressed;
    if (trigger && p.shootCooldown <= 0 && p.reloadTimer <= 0) {
      if (p.weapon.id === 'fists') {
        if (p.punchCooldown <= 0) {
          p.punchCooldown = 0.45;
          FL.audio.punch();
          // Melee: hit the nearest ped/gang/cop within 2.2 m in front.
          var hitDone = false;
          function meleeList(list, getPos) {
            for (var i = 0; i < list.length && !hitDone; i++) {
              var e = list[i];
              if (e.dead) continue;
              var pos = getPos(e);
              var d2 = FL.dist2(pos.x, pos.z, p.position.x, p.position.z);
              if (d2 < 4.8) {
                e.hp -= 25;
                FL.particles.burst(pos.x, 1.2, pos.z, 4, { color: 0xffcc66, size: 0.4, life: 0.3, spread: 2 });
                if (e.hp <= 0) {
                  e.dead = true;
                  e.g.userData.setPose('fall', 0, 0);
                  if (list === FL.world.peds) FL.world.addWanted(1, 'ped down');
                }
                hitDone = true;
              }
            }
          }
          meleeList(FL.world.peds, function (e) { return e.g.position; });
          meleeList(FL.world.gangs, function (e) { return e.g.position; });
          meleeList(FL.world.footCops, function (e) { return e.g.position; });
        }
      } else if (p.ammo > 0) {
        p.shootCooldown = 1 / p.weapon.rate;
        p.ammo--;
        game.mousePressed = false; // semi-auto: consume the click
        // Shoot from the camera through the crosshair.
        var dir = new THREE.Vector3();
        game.camera.getWorldDirection(dir);
        var origin = { x: p.position.x, y: 1.4, z: p.position.z };
        // Assisted aim: snap toward the nearest enemy within a cone.
        var best = null, bestAngle = 0.25;
        function aimList(list, getPos) {
          for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e.dead) continue;
            var pos = getPos(e);
            var dx = pos.x - p.position.x, dz = pos.z - p.position.z;
            var d = Math.sqrt(dx * dx + dz * dz);
            if (d > p.weapon.range) continue;
            var ang = Math.abs(FL.wrapAngle(Math.atan2(dx, dz) - Math.atan2(dir.x, dir.z)));
            if (ang < bestAngle) { bestAngle = ang; best = { x: dx / d, y: 0, z: dz / d }; }
          }
        }
        aimList(FL.world.gangs, function (e) { return e.g.position; });
        aimList(FL.world.footCops, function (e) { return e.g.position; });
        var shootDir = best || { x: dir.x, y: dir.y, z: dir.z };
        FL.world.playerShoot(origin, shootDir, p.weapon);
        // Recoil: camera pitch kick.
        game.camPitch = FL.clamp(game.camPitch + 0.02, -0.5, 1.1);
        game.shake = Math.min(0.15, game.shake + 0.05);
        if (p.ammo === 0) startReload();
      } else {
        game.mousePressed = false; // consume the click even when dry
        startReload();
      }
    }
    // Animation.
    if (game.aiming || game.mouseDown) p.group.userData.setPose('shoot', p.animT, 0);
    else if (moving) p.group.userData.setPose(sprint ? 'run' : 'walk', p.animT, sprint ? 1 : 0.5);
    else p.group.userData.setPose('idle', p.animT, 0);
    // Prompt: near a car?
    if (!p.inCar) {
      var near = nearestVehicle(4.5);
      FL.hud.setPrompt(near ? '[F] ' + (near.owner === 'traffic' ? 'Curi mobil' : 'Naik mobil') : '');
    }
  }

  // --- Player update (in car) ---
  function updatePlayerInCar(dt) {
    var p = game.player;
    var v = p.vehicle;
    if (!v) { p.inCar = false; return; }
    var k = game.keys;
    var input = {
      throttle: !!(k['KeyW'] || k['ArrowUp']),
      brake: !!(k['KeyS'] || k['ArrowDown']),
      reverse: false,
      steer: ((k['KeyD'] || k['ArrowRight']) ? 1 : 0) - ((k['KeyA'] || k['ArrowLeft']) ? 1 : 0),
      handbrake: !!(k['Space']),
    };
    // S brakes; hold S at a stop to reverse.
    if (input.brake && v.speed <= 0.5) { input.reverse = true; input.brake = false; }
    v.update(dt, input);
    // Flip recovery (hold R).
    if (k['KeyR']) {
      v.flipTimer = (v.flipTimer || 0) + dt;
      if (v.flipTimer > 1) {
        v.group.rotation.x = 0; v.group.rotation.z = 0;
        v.speed = 0; v.flipTimer = 0;
        FL.hud.notify('Mobil dibalikkan');
      }
    } else v.flipTimer = 0;
    // Camera heading follows the car.
    game.camYaw = FL.angleLerp(game.camYaw, v.heading + Math.PI, Math.min(1, dt * 2.5));
    // Skid marks + tire smoke on handbrake drift.
    if (input.handbrake && Math.abs(v.speed) > 8 && Math.random() < dt * 20) {
      FL.particles.spawn(v.group.position.x, 0.3, v.group.position.z, { color: 0xcccccc, size: 0.8, life: 0.6, vy: 1, grow: 1, opacity: 0.4 });
      if (Math.random() < 0.3) FL.audio.skid();
    }
    // Engine sound follows speed.
    FL.audio.setEngine(Math.abs(v.speed) / v.def.topSpeed);
    // FOV kick at speed.
    var targetFov = 60 + FL.clamp(Math.abs(v.speed) / v.def.topSpeed, 0, 1) * 14;
    game.fov = FL.damp(game.fov, targetFov, 3, dt);
    game.camera.fov = game.fov;
    game.camera.updateProjectionMatrix();
    // Player position follows the car.
    p.position.copy(v.group.position);
    p.speed = Math.abs(v.speed);
    // Car destroyed while driving.
    if (v.dead) {
      FL.emit('player-damage', { amount: 20, from: 'explosion' });
      exitCar();
    }
  }

  // --- Cameras ---
  function updateCamera(dt) {
    var p = game.player;
    var pp = p.position;
    game.cameraHeading = game.camYaw + Math.PI;
    var desired;
    if (game.state === 'cutscene' && FL.missions.cutsceneCam) {
      var cc = FL.missions.cutsceneCam;
      game.camera.position.set(cc.pos.x, cc.pos.y, cc.pos.z);
      game.camera.lookAt(cc.look.x, cc.look.y, cc.look.z);
      return;
    }
    if (game.state === 'title') {
      // Flyover: slow orbit around downtown.
      game.flyoverT += dt * 0.03;
      var fx = Math.sin(game.flyoverT) * 180, fz = Math.cos(game.flyoverT) * 180;
      game.camera.position.set(fx, 70 + Math.sin(game.flyoverT * 2) * 15, fz);
      game.camera.lookAt(0, 20, 0);
      return;
    }
    if (p.inCar && p.vehicle) {
      // Chase camera: behind the car, looking ahead down the road. C =
      // look-behind (camera swings in front and looks back at the car).
      // NOTE: camera = carPos - forward*dist puts it BEHIND the car; the
      // earlier code used heading+PI here, which put it in front.
      var v = p.vehicle;
      var lookBehind = !!game.keys['KeyC'];
      var yaw = lookBehind ? v.heading + Math.PI : v.heading;
      var dist = 9.5;
      // v7: a helicopter's chase camera rides at its altitude.
      var alt = v.isHeli ? v.group.position.y : 0;
      var cx = v.group.position.x - Math.sin(yaw) * dist;
      var cz = v.group.position.z - Math.cos(yaw) * dist;
      var cy = 4.2 + alt;
      var lx = lookBehind ? v.group.position.x : v.group.position.x + Math.sin(v.heading) * 10;
      var lz = lookBehind ? v.group.position.z : v.group.position.z + Math.cos(v.heading) * 10;
      desired = { x: cx, y: cy, z: cz, lookX: lx, lookY: 2.6 + alt, lookZ: lz };
    } else if (game.aiming) {
      // Over-the-shoulder aim camera.
      var ay = game.camYaw;
      var ax = pp.x + Math.sin(ay) * 2.2 + Math.cos(ay) * 0.9;
      var az = pp.z + Math.cos(ay) * 2.2 - Math.sin(ay) * 0.9;
      desired = { x: ax, y: 2.1, z: az, lookX: pp.x - Math.sin(ay) * 10, lookY: 1.4 - game.camPitch * 4, lookZ: pp.z - Math.cos(ay) * 10 };
    } else {
      // Third-person follow.
      var dist2 = game.camDist;
      var cy2 = pp.y + 2.2 + Math.sin(game.camPitch) * 4;
      var horiz = Math.cos(game.camPitch) * dist2;
      var cx2 = pp.x + Math.sin(game.camYaw) * horiz;
      var cz2 = pp.z + Math.cos(game.camYaw) * horiz;
      desired = { x: cx2, y: cy2, z: cz2, lookX: pp.x, lookY: pp.y + 1.5, lookZ: pp.z };
    }
    // Camera collision: pull in if the ray hits a building.
    var from = { x: desired.lookX, y: desired.lookY, z: desired.lookZ };
    var to = { x: desired.x, y: desired.y, z: desired.z };
    var steps = 10;
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var px = from.x + (to.x - from.x) * t;
      var pz = from.z + (to.z - from.z) * t;
      if (FL.city.isBlocked(px, pz, 0.4)) {
        var t2 = Math.max(0.15, (i - 1) / steps);
        desired.x = from.x + (to.x - from.x) * t2;
        desired.z = from.z + (to.z - from.z) * t2;
        desired.y = Math.max(0.8, from.y + (to.y - from.y) * t2);
        break;
      }
    }
    desired.y = Math.max(0.6, desired.y);
    // Smooth + shake. snapCamera (set on car enter/exit/respawn) jumps the
    // camera to its target at once so it never sweeps through buildings.
    if (game.snapCamera) {
      game.camera.position.set(desired.x, desired.y, desired.z);
      game.snapCamera = false;
    } else {
      game.camera.position.x = FL.damp(game.camera.position.x, desired.x, 8, dt);
      game.camera.position.y = FL.damp(game.camera.position.y, desired.y, 8, dt);
      game.camera.position.z = FL.damp(game.camera.position.z, desired.z, 8, dt);
    }
    game.shake = Math.max(0, game.shake - dt * 1.8);
    var shX = (Math.random() - 0.5) * game.shake;
    var shY = (Math.random() - 0.5) * game.shake;
    game.camera.lookAt(desired.lookX + shX, desired.lookY + shY, desired.lookZ);
  }

  // --- State machine ---
  game.setState = function (s) {
    game.state = s;
    FL.emit('state-change', s);
  };
  game.newGame = function () {
    FL.audio.ensure();
    game.money = 250;
    game.missionsCompleted = 0;
    resetPlayer();
    FL.world.clearWanted();
    FL.hud.showHud();
    game.setState('playing');
    requestLock();
    FL.hud.notify('Selamat datang di Neon Harbor!');
    FL.hud.setObjective('Tekan M untuk peta — misi pertama tersedia di menu (tekan J)');
    // Auto-start mission 1 after a beat.
    setTimeout(function () { FL.missions.startMission(0); }, 2500);
  };
  game.continueGame = function () {
    FL.audio.ensure();
    var data = FL.hud.loadGame();
    if (!data) { game.newGame(); return; }
    game.money = data.money;
    game.missionsCompleted = data.missionsCompleted || 0;
    resetPlayer();
    game.player.position.set(data.player.x, 0, data.player.z);
    game.player.health = data.player.health;
    game.player.armor = data.player.armor;
    game.player.weapons = data.player.weapons || ['fists', 'pistol'];
    FL.hud.showHud();
    game.setState('playing');
    requestLock();
    FL.hud.notify('Lanjutan game dimuat');
    setTimeout(function () { FL.missions.startMission(game.missionsCompleted); }, 1500);
  };
  game.pause = function () {
    if (game.state !== 'playing') return;
    game.setState('paused');
    game.mousePressed = false;
    game.mouseDown = false;
    FL.hud.showPause(true);
    if (document.pointerLockElement) document.exitPointerLock();
    FL.audio.engine(false);
  };
  game.resume = function () {
    if (game.state !== 'paused') return;
    FL.hud.showPause(false);
    game.setState('playing');
    requestLock();
  };
  game.quitToTitle = function () {
    game.saveGame();
    FL.hud.showPause(false);
    game.setState('title');
    FL.hud.showTitle(FL.hud.hasSave());
    if (document.pointerLockElement) document.exitPointerLock();
  };
  game.respawn = function () {
    FL.hud.hideEnd();
    resetPlayer();
    if (game.respawnPoint) {
      game.player.position.set(game.respawnPoint.x, 0, game.respawnPoint.z);
    }
    game.money = Math.max(0, game.money - game.respawnFee);
    FL.world.clearWanted();
    game.snapCamera = true;
    game.setState('playing');
    requestLock();
    FL.hud.notify('Kamu bangun kembali. Biaya: $' + game.respawnFee);
  };
  game.saveGame = function () { FL.hud.saveGame(game); };
  game.setSetting = function (key, value) {
    game.settings[key] = value;
    FL.hud.saveSettings(game.settings);
    applySettings();
  };
  game.addMoney = function (n) { game.money += n; };
  function resetPlayer() {
    var p = game.player;
    if (p.inCar) exitCar();
    p.health = 100; p.armor = 0;
    p.position.set(0, 0, 32);
    p.group.visible = true;
    p.group.rotation.set(0, 0, 0);
    p.group.userData.setPose('idle', 0, 0);
    game.camYaw = 0; game.camPitch = 0.35;
  }
  function requestLock() {
    var canvas = document.getElementById('game');
    if (!canvas) return;
    try {
      var r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(function () { /* denied: fallback cursor, game still runs */ });
    } catch (e) { /* pointer lock unavailable */ }
  }
  function openMap() {
    if (game.state !== 'playing') return;
    game.setState('map');
    FL.hud.openMap(game);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeMap() {
    if (game.state !== 'map') return;
    FL.hud.closeMap();
    game.setState('playing');
    requestLock();
  }

  // --- Damage / death / busted ---
  FL.on('player-damage', function (e) {
    var p = game.player;
    if (!p || game.state !== 'playing') return;
    var amount = e.amount || 10;
    if (p.armor > 0) {
      var absorbed = Math.min(p.armor, amount * 0.6);
      p.armor -= absorbed;
      amount -= absorbed;
    }
    p.health -= amount;
    FL.hud.flashDamage();
    game.shake = Math.min(0.4, game.shake + 0.15);
    if (p.health <= 0) {
      p.health = 0;
      game.setState('dead');
      p.group.userData.setPose('fall', 0, 0);
      FL.emit('player-dead', {});
      FL.audio.explosion();
      setTimeout(function () {
        game.respawnPoint = { x: -96, z: -96 }; // hospital (road intersection, clear)
        game.respawnFee = 100;
        FL.hud.showEnd('WASTED', 'Kamu mati. Tagihan rumah sakit: $100');
        if (document.pointerLockElement) document.exitPointerLock();
      }, 1200);
    }
  });
  FL.on('busted', function () {
    if (game.state !== 'playing') return;
    game.setState('busted');
    setTimeout(function () {
      game.respawnPoint = { x: 96, z: 128 }; // police station (on the x=96 road, clear)
      game.respawnFee = 200;
      FL.hud.showEnd('BUSTED', 'Kamu ditangkap. Denda: $200');
      if (document.pointerLockElement) document.exitPointerLock();
    }, 800);
  });
  FL.on('shake', function (amount) { game.shake = Math.min(1, game.shake + (amount || 0.3)); });
  FL.on('pickup', function (kind) {
    var p = game.player;
    if (!p) return;
    if (kind === 'health') p.health = Math.min(100, p.health + 25);
    if (kind === 'armor') p.armor = Math.min(100, p.armor + 25);
    if (kind === 'ammo') { p.reserveAmmo += 60; p.grenades = Math.min(5, p.grenades + 1); }
    if (kind === 'money') game.money += 50;
  });
  FL.on('mission-complete', function () { game.missionsCompleted++; });
  FL.on('cutscene-start', function () { game.setState('cutscene'); });
  FL.on('cutscene-end', function () { if (game.state === 'cutscene') game.setState('playing'); });

  function applySettings() {
    if (!game.renderer) return;
    FL.audio.setVolume(game.settings.volume);
    var q = game.settings.quality;
    if (q === 'low') {
      game.renderer.setPixelRatio(1);
      game.renderer.shadowMap.enabled = false;
      game.sun.shadow.mapSize.set(512, 512);
      game.sun.castShadow = false;
    } else if (q === 'medium') {
      game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      game.renderer.shadowMap.enabled = true;
      game.sun.castShadow = true;
      game.sun.shadow.mapSize.set(1024, 1024);
    } else {
      game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      game.renderer.shadowMap.enabled = true;
      game.sun.castShadow = true;
      game.sun.shadow.mapSize.set(2048, 2048);
    }
    if (game.sun.shadow.map) { game.sun.shadow.map.dispose(); game.sun.shadow.map = null; }
  }

  // --- Fixed-timestep main loop ---
  var FIXED = 1 / 60;
  function step(dt) {
    FL.guard('daynight', function () { updateDayNight(dt); });
    FL.guard('rain', function () { updateRain(dt); });
    if (game.state === 'playing' || game.state === 'cutscene') {
      if (game.state === 'playing') {
        if (game.player.inCar) FL.guard('player-car', function () { updatePlayerInCar(dt); });
        else FL.guard('player-foot', function () { updatePlayerOnFoot(dt); });
      }
      FL.guard('world', function () { FL.world.update(dt); });
      FL.guard('city', function () { FL.city.update(game.player.position, performance.now() / 1000); });
      FL.guard('missions', function () { FL.missions.update(dt); FL.missions.updateSide(dt); });
      // v7: extended systems (each guarded, like the rest).
      FL.guard('systems', function () { if (FL.systems) FL.systems.update(dt); });
      FL.guard('vehicles2', function () { if (FL.vehicles2) FL.vehicles2.update(dt); });
      FL.guard('docks', function () { if (FL.docks) FL.docks.update(dt); });
      FL.guard('gang2', function () { if (FL.gang2) FL.gang2.update(dt); });
      FL.guard('weather', function () { if (FL.weather) FL.weather.update(dt); });
      FL.guard('particles', function () { FL.particles.update(dt); });
      FL.guard('audio', function () { FL.audio.radioUpdate(dt); });
      // Autosave every 60 s.
      game.saveTimer += dt;
      if (game.saveTimer > 60) { game.saveTimer = 0; game.saveGame(); }
    }
    if (game.state === 'title') {
      FL.guard('city-title', function () { FL.city.update({ x: 0, z: 0 }, performance.now() / 1000); });
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    // Real elapsed time (unclamped) drives the FPS counter; the simulation
    // uses the clamped dt so a slow frame never spirals the physics.
    var realDt = (now - game.lastTime) / 1000 || 0;
    var dt = Math.min(0.1, realDt);
    game.lastTime = now;
    // FPS counter (real time — the old version used clamped dt and always
    // read 10 under heavy load).
    game.frameCount++;
    game.fpsTimer += realDt;
    if (game.fpsTimer >= 0.5) {
      game.fps = game.frameCount / game.fpsTimer;
      game.frameCount = 0; game.fpsTimer = 0;
    }
    game.acc += dt;
    var steps = 0;
    while (game.acc >= FIXED && steps < 5) {
      step(FIXED);
      game.acc -= FIXED;
      steps++;
    }
    // Spiral-of-death guard: if 5 fixed steps still leave backlog (a very
    // slow frame), drop it rather than run more steps and fall further behind.
    if (steps === 5) game.acc = 0;
    FL.guard('camera', function () { updateCamera(dt); });
    FL.guard('hud', function () { FL.hud.update(dt, game); });
    if (game.renderer && game.scene && game.camera) {
      FL.guard('render', function () { game.renderer.render(game.scene, game.camera); });
    }
  }

  // --- Boot ---
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function boot() {
    FL.hud.init(game);
    var savedSettings = FL.hud.loadSettings();
    if (savedSettings) game.settings = Object.assign(game.settings, savedSettings);
    FL.hud.setLoading(0.1, 'Memuat kota Neon Harbor...');
    await sleep(30);
    if (!initRenderer()) return;
    applySettings();
    FL.hud.setLoading(0.3, 'Membangun gedung dan jalan...');
    await sleep(30);
    FL.city.build(game.scene);
    FL.particles.init(game.scene);
    initRain();
    FL.hud.setLoading(0.55, 'Menyiapkan lalu lintas dan pejalan kaki...');
    await sleep(30);
    game.player = createPlayer();
    FL.world.init(game.scene, game);
    FL.world.setPlayer(game.player);
    FL.missions.init(game.scene, game);
    // v7: extended systems — missions m9-m12, shop/garage, new vehicles,
    // the Docks, the Vipers, dynamic weather.
    if (FL.missions2) FL.missions2.init(game.scene, game);
    if (FL.systems) FL.systems.init(game.scene, game);
    if (FL.vehicles2) FL.vehicles2.init(game.scene, game);
    if (FL.docks) FL.docks.init(game.scene, game);
    if (FL.gang2) FL.gang2.init(game.scene, game);
    if (FL.weather) FL.weather.init(game.scene, game);
    initInput();
    FL.hud.setLoading(0.85, 'Menyiapkan radio dan suara...');
    await sleep(30);
    FL.audio.setVolume(game.settings.volume);
    game.setState('title');
    FL.hud.setLoading(1, 'Siap!');
    await sleep(200);
    FL.hud.showTitle(FL.hud.hasSave());
    game.lastTime = performance.now();
    requestAnimationFrame(frame);
    // Expose a tiny test hook (used by the Playwright smoke test only).
    window.__FROSTLINE__ = { game: game, FL: FL };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
