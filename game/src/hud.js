// FROSTLINE 3D — HUD: health/armor/money/weapon/wanted/speedometer, a REAL
// minimap drawn from city data, fullscreen map with click waypoint + GPS
// route, menus, save/load, letterbox subtitles, debug overlay.
(function () {
  'use strict';
  var FL = window.FL;

  var H = {
    els: {}, game: null, waypoint: null, route: null,
    notifQueue: [], notifTimer: 0, debugOn: false,
    mapOpen: false, lastMinimap: 0,
  };
  FL.hud = H;

  function el(id) { return document.getElementById(id); }

  FL.hud.init = function (game) {
    H.game = game;
    var ids = ['loading', 'loading-fill', 'loading-tip', 'menu', 'hud',
      'health-fill', 'armor-fill', 'money', 'radio', 'stars', 'weapon',
      'ammo', 'objective-text', 'timer-text', 'speedo', 'speed-value', 'gear-value',
      'prompt', 'notif', 'crosshair', 'damage-flash', 'letterbox-top',
      'letterbox-bottom', 'subtitle',
      'pause-menu', 'map-screen', 'map-canvas', 'end-screen', 'end-title',
      'end-sub', 'debug-overlay', 'controls-overlay', 'webgl-error',
      'btn-new', 'btn-continue', 'btn-controls', 'btn-settings', 'menu-settings',
      'set-volume', 'set-sens', 'set-quality', 'set-invert',
      'btn-resume', 'btn-save', 'btn-quit', 'btn-end-continue',
      'minimap'];
    ids.forEach(function (id) { H.els[id] = el(id); });

    // Title menu.
    if (H.els['btn-new']) H.els['btn-new'].addEventListener('click', function () { FL.audio.click(); game.newGame(); });
    if (H.els['btn-continue']) H.els['btn-continue'].addEventListener('click', function () { FL.audio.click(); game.continueGame(); });
    if (H.els['btn-controls']) H.els['btn-controls'].addEventListener('click', function () { FL.audio.click(); H.toggleControls(); });
    if (H.els['btn-settings']) H.els['btn-settings'].addEventListener('click', function () { FL.audio.click(); H.toggleSettings(); });
    if (H.els['controls-overlay']) H.els['controls-overlay'].addEventListener('click', function () { H.showControls(false); });
    // Pause menu.
    if (H.els['btn-resume']) H.els['btn-resume'].addEventListener('click', function () { FL.audio.click(); game.resume(); });
    if (H.els['btn-save']) H.els['btn-save'].addEventListener('click', function () { FL.audio.click(); game.saveGame(); H.notify('Game tersimpan'); });
    if (H.els['btn-quit']) H.els['btn-quit'].addEventListener('click', function () { FL.audio.click(); game.quitToTitle(); });
    // Map (closes with M / Esc; no button needed).
    if (H.els['map-canvas']) H.els['map-canvas'].addEventListener('click', function (e) { H.onMapClick(e); });
    // End screen.
    if (H.els['btn-end-continue']) H.els['btn-end-continue'].addEventListener('click', function () { FL.audio.click(); game.respawn(); });
    // Settings inputs (sliders are 0-100 / 20-200 in the DOM, 0-1 / 0.2-2 in settings).
    if (H.els['set-volume']) H.els['set-volume'].addEventListener('input', function (e) { game.setSetting('volume', parseFloat(e.target.value) / 100); });
    if (H.els['set-sens']) H.els['set-sens'].addEventListener('input', function (e) { game.setSetting('sensitivity', parseFloat(e.target.value) / 100); });
    if (H.els['set-quality']) H.els['set-quality'].addEventListener('change', function (e) { game.setSetting('quality', e.target.value); });
    if (H.els['set-invert']) H.els['set-invert'].addEventListener('change', function (e) { game.setSetting('invertY', e.target.checked); });

    // Event wiring.
    FL.on('notif', function (msg) { H.notify(msg); });
    FL.on('objective', function (text) { H.setObjective(text); });
    FL.on('timer', function (t) { H.setTimer(t); });
    FL.on('wanted-change', function (n) { H.setWanted(n); });
    FL.on('subtitle', function (s) { H.showSubtitle(s.speaker, s.text); });
    FL.on('cutscene-start', function () { H.setLetterbox(true); H.setHudVisible(false); });
    FL.on('cutscene-end', function () { H.setLetterbox(false); H.hideSubtitle(); H.setHudVisible(true); });
    FL.on('pickup', function (kind) {
      var msgs = { health: '+25 Health', armor: '+25 Armor', ammo: 'Amunisi penuh', money: '+$50' };
      H.notify(msgs[kind] || kind);
    });
    FL.on('mission-complete', function (d) { H.notify('Misi selesai! +$' + d.reward); });
    FL.on('mission-failed', function (d) { H.notify('Misi gagal: ' + d.reason); });
  };

  H.showControls = function (show) {
    if (H.els['controls-overlay']) H.els['controls-overlay'].style.display = show ? 'block' : 'none';
  };
  H.toggleControls = function () {
    var o = H.els['controls-overlay'];
    if (o) H.showControls(o.style.display !== 'block');
  };
  H.showSettings = function (show) {
    if (H.els['menu-settings']) H.els['menu-settings'].style.display = show ? 'block' : 'none';
    if (show && H.game) {
      var s = H.game.settings;
      if (H.els['set-volume']) H.els['set-volume'].value = Math.round(s.volume * 100);
      if (H.els['set-sens']) H.els['set-sens'].value = Math.round(s.sensitivity * 100);
      if (H.els['set-quality']) H.els['set-quality'].value = s.quality;
      if (H.els['set-invert']) H.els['set-invert'].checked = s.invertY;
    }
  };
  H.toggleSettings = function () {
    var o = H.els['menu-settings'];
    if (o) H.showSettings(o.style.display !== 'block');
  };
  H.setLoading = function (pct, tip) {
    if (H.els['loading-fill']) H.els['loading-fill'].style.width = Math.round(pct * 100) + '%';
    if (tip && H.els['loading-tip']) H.els['loading-tip'].textContent = tip;
  };
  H.showTitle = function (hasSave) {
    if (H.els['loading']) H.els['loading'].style.display = 'none';
    if (H.els['menu']) H.els['menu'].style.display = 'flex';
    if (H.els['btn-continue']) H.els['btn-continue'].style.display = hasSave ? 'block' : 'none';
    if (H.els['hud']) H.els['hud'].style.display = 'none';
  };
  H.showHud = function () {
    if (H.els['menu']) H.els['menu'].style.display = 'none';
    if (H.els['pause-menu']) H.els['pause-menu'].style.display = 'none';
    if (H.els['hud']) H.els['hud'].style.display = 'block';
  };
  H.showPause = function (show) {
    if (H.els['pause-menu']) H.els['pause-menu'].style.display = show ? 'flex' : 'none';
  };
  H.showEnd = function (title, subtitle) {
    if (H.els['end-title']) H.els['end-title'].textContent = title;
    if (H.els['end-sub']) H.els['end-sub'].textContent = subtitle;
    if (H.els['end-screen']) H.els['end-screen'].style.display = 'flex';
    if (H.els['hud']) H.els['hud'].style.display = 'none';
  };
  H.hideEnd = function () {
    if (H.els['end-screen']) H.els['end-screen'].style.display = 'none';
    if (H.els['hud']) H.els['hud'].style.display = 'block';
  };
  H.setHudVisible = function (visible) {
    if (H.els['hud']) H.els['hud'].style.display = visible ? 'block' : 'none';
  };
  H.setLetterbox = function (on) {
    // The bars animate via a CSS height transition (height 0 = hidden).
    var h = on ? '9vh' : '0';
    if (H.els['letterbox-top']) H.els['letterbox-top'].style.height = h;
    if (H.els['letterbox-bottom']) H.els['letterbox-bottom'].style.height = h;
  };
  H.showSubtitle = function (speaker, text) {
    if (H.els['subtitle']) {
      H.els['subtitle'].style.display = 'block';
      H.els['subtitle'].innerHTML = '<span class="speaker">' + speaker + ': </span>' + text;
    }
  };
  H.hideSubtitle = function () {
    if (H.els['subtitle']) H.els['subtitle'].style.display = 'none';
  };
  H.setObjective = function (text) {
    if (H.els['objective-text']) H.els['objective-text'].textContent = text;
  };
  H.setTimer = function (t) {
    if (H.els['timer-text']) {
      if (t > 0) {
        H.els['timer-text'].textContent = FL.fmtTime(t);
        H.els['timer-text'].style.display = 'block';
      } else {
        H.els['timer-text'].style.display = 'none';
      }
    }
  };
  H.setWanted = function (n) {
    if (!H.els['stars']) return;
    var s = '';
    for (var i = 0; i < 5; i++) s += (i < n ? '★' : '☆');
    H.els['stars'].textContent = s;
    H.els['stars'].style.color = n >= 3 ? '#ff4444' : '#ffd75e';
  };
  H.setPrompt = function (text) {
    if (!H.els['prompt']) return;
    if (text) { H.els['prompt'].textContent = text; H.els['prompt'].style.display = 'block'; }
    else H.els['prompt'].style.display = 'none';
  };
  H.notify = function (msg) {
    H.notifQueue.push(msg);
    if (H.notifQueue.length > 4) H.notifQueue.shift();
    if (H.els['notif']) {
      H.els['notif'].textContent = msg;
      H.els['notif'].style.display = 'block';
    }
    H.notifTimer = 3;
  };
  H.flashDamage = function () {
    if (!H.els['damage-flash']) return;
    H.els['damage-flash'].style.opacity = '0.5';
    setTimeout(function () { if (H.els['damage-flash']) H.els['damage-flash'].style.opacity = '0'; }, 200);
  };
  H.setCrosshair = function (show) {
    if (H.els['crosshair']) H.els['crosshair'].style.display = show ? 'block' : 'none';
  };

  // --- Per-frame HUD refresh (called from main loop, throttled) ---
  H.update = function (dt, game) {
    if (H.notifTimer > 0) {
      H.notifTimer -= dt;
      if (H.notifTimer <= 0 && H.els['notif']) H.els['notif'].style.display = 'none';
    }
    if (!game || !game.player) return;
    var p = game.player;
    if (H.els['health-fill']) H.els['health-fill'].style.width = FL.clamp(p.health, 0, 100) + '%';
    if (H.els['armor-fill']) H.els['armor-fill'].style.width = FL.clamp(p.armor, 0, 100) + '%';
    if (H.els['money']) H.els['money'].textContent = FL.fmtMoney(game.money);
    if (H.els['radio']) H.els['radio'].textContent = '♪ ' + FL.audio.radioName();
    if (H.els['weapon']) H.els['weapon'].textContent = p.weapon ? p.weapon.name : 'Fists';
    if (H.els['ammo']) H.els['ammo'].textContent = p.weapon ? (p.weapon.id === 'fists' ? '∞' : p.ammo + ' / ' + p.reserveAmmo) : '';
    // Speedometer.
    if (H.els['speedo']) {
      if (p.inCar && p.vehicle) {
        H.els['speedo'].style.display = 'block';
        var kmh = Math.abs(p.vehicle.speed) * 3.6;
        if (H.els['speed-value']) H.els['speed-value'].textContent = Math.round(kmh);
        var gear = p.vehicle.speed < -0.5 ? 'R' : (kmh < 1 ? 'N' : Math.min(6, 1 + Math.floor(kmh / 35)));
        if (H.els['gear-value']) H.els['gear-value'].textContent = gear;
      } else {
        H.els['speedo'].style.display = 'none';
      }
    }
    // Wanted stars flash while evading.
    if (H.els['stars'] && FL.world.wanted > 0) {
      var evading = FL.world.evadeTimer > 0;
      H.els['stars'].style.opacity = evading ? (Math.sin(performance.now() * 0.01) > 0 ? '1' : '0.3') : '1';
    }
    // Minimap (throttled to 15 Hz).
    H.lastMinimap += dt;
    if (H.lastMinimap > 0.066) { H.lastMinimap = 0; H.drawMinimap(game); }
    // Debug overlay.
    if (H.debugOn && H.els['debug-overlay']) {
      H.els['debug-overlay'].style.display = 'block';
      H.els['debug-overlay'].innerHTML =
        'FPS: ' + game.fps.toFixed(0) + ' | Draw: ' + game.renderer.info.render.calls +
        ' | Tris: ' + (game.renderer.info.render.triangles / 1000).toFixed(0) + 'k' +
        '<br>Traffic: ' + FL.world.traffic.length + ' | Peds: ' + FL.world.peds.length +
        ' | Cops: ' + (FL.world.policeCars.length + FL.world.footCops.length) +
        ' | Gangs: ' + FL.world.gangs.length +
        '<br>Pos: ' + p.position.x.toFixed(0) + ', ' + p.position.z.toFixed(0) +
        ' | Wanted: ' + FL.world.wanted +
        '<br>Errors: ' + FL.errors.length + (FL.errors.length ? ' — ' + FL.errors[FL.errors.length - 1].msg : '');
    } else if (H.els['debug-overlay']) {
      H.els['debug-overlay'].style.display = 'none';
    }
  };

  // --- Minimap (real 2D canvas from city data, rotates with camera) ---
  var minimapCanvas = null, minimapCtx = null;
  H.drawMinimap = function (game) {
    if (!minimapCanvas) {
      minimapCanvas = H.els['minimap'];
      if (!minimapCanvas) return;
      minimapCtx = minimapCanvas.getContext('2d');
    }
    var ctx = minimapCtx;
    var W = minimapCanvas.width, Hh = minimapCanvas.height;
    var cx = W / 2, cy = Hh / 2;
    var pp = game.player.position;
    var heading = game.cameraHeading || 0;
    // Range shown: 120 m across the 200 px canvas.
    var scale = W / 120;
    ctx.clearRect(0, 0, W, Hh);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0e1a2a';
    ctx.fillRect(0, 0, W, Hh);
    ctx.translate(cx, cy);
    ctx.rotate(-heading);
    ctx.scale(scale, scale);
    ctx.translate(-pp.x, -pp.z);
    // Water.
    ctx.fillStyle = '#16405e';
    ctx.fillRect(-320, 272, 640, 48);
    // Roads.
    ctx.strokeStyle = '#2a3a4a';
    ctx.lineWidth = 12;
    FL.city.roads.forEach(function (r) {
      ctx.beginPath();
      if (r.dir === 'ns') { ctx.moveTo(r.at, -320); ctx.lineTo(r.at, 320); }
      else { ctx.moveTo(-320, r.at); ctx.lineTo(320, r.at); }
      ctx.stroke();
    });
    // Buildings.
    ctx.fillStyle = '#33465e';
    FL.city.buildings.forEach(function (b) {
      ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
    });
    // Park.
    ctx.fillStyle = '#1a4a2a';
    ctx.fillRect(-288, -288, 128, 128);
    // Mission marker.
    var mp = FL.missions.getMarkerPos();
    if (mp) {
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(mp.x, mp.z, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Waypoint.
    if (H.waypoint) {
      ctx.fillStyle = '#51ff7a';
      ctx.beginPath(); ctx.arc(H.waypoint.x, H.waypoint.z, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // GPS route.
    if (H.route && H.route.length > 1) {
      ctx.strokeStyle = '#51ff7a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      H.route.forEach(function (n, i) {
        if (i === 0) ctx.moveTo(n.x, n.z); else ctx.lineTo(n.x, n.z);
      });
      ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#4a90ff';
    FL.world.policeCars.forEach(function (c) {
      ctx.beginPath(); ctx.arc(c.v.group.position.x, c.v.group.position.z, 2.5, 0, Math.PI * 2); ctx.fill();
    });
    FL.world.footCops.forEach(function (c) {
      ctx.beginPath(); ctx.arc(c.g.position.x, c.g.position.z, 2, 0, Math.PI * 2); ctx.fill();
    });
    // Gangs (red).
    ctx.fillStyle = '#ff4444';
    FL.world.gangs.forEach(function (g) {
      if (g.dead) return;
      ctx.beginPath(); ctx.arc(g.g.position.x, g.g.position.z, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    // Player arrow (screen-aligned, always up = camera forward).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  };

  // --- Fullscreen map ---
  H.openMap = function (game) {
    H.mapOpen = true;
    if (H.els['map-screen']) H.els['map-screen'].style.display = 'block';
    H.drawMap(game);
  };
  H.closeMap = function () {
    H.mapOpen = false;
    if (H.els['map-screen']) H.els['map-screen'].style.display = 'none';
  };
  H.drawMap = function (game) {
    var canvas = H.els['map-canvas'];
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, Hh = canvas.height;
    // City spans -320..320 in both axes.
    var scale = Math.min(W, Hh) / 660;
    var ox = W / 2, oy = Hh / 2;
    function mx(x) { return ox + x * scale; }
    function mz(z) { return oy + z * scale; }
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, Hh);
    // Water.
    ctx.fillStyle = '#16405e';
    ctx.fillRect(mx(-320), mz(272), 640 * scale, 48 * scale);
    // Roads.
    ctx.strokeStyle = '#3a4a5a';
    ctx.lineWidth = 10 * scale;
    FL.city.roads.forEach(function (r) {
      ctx.beginPath();
      if (r.dir === 'ns') { ctx.moveTo(mx(r.at), mz(-320)); ctx.lineTo(mx(r.at), mz(320)); }
      else { ctx.moveTo(mx(-320), mz(r.at)); ctx.lineTo(mx(320), mz(r.at)); }
      ctx.stroke();
    });
    // Buildings.
    ctx.fillStyle = '#4a5a6e';
    FL.city.buildings.forEach(function (b) {
      ctx.fillRect(mx(b.x - b.w / 2), mz(b.z - b.d / 2), b.w * scale, b.d * scale);
    });
    // Park.
    ctx.fillStyle = '#2a6a3a';
    ctx.fillRect(mx(-288), mz(-288), 128 * scale, 128 * scale);
    // Landmarks.
    ctx.fillStyle = '#ff5e8a';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('▲ Meridian Tower', mx(0) + 6, mz(0));
    ctx.fillText('● Stadium', mx(240) + 6, mz(-32));
    ctx.fillText('◐ Ferris Wheel', mx(-160) + 6, mz(224));
    ctx.fillText('◉ Lighthouse', mx(160) + 6, mz(300));
    // GPS route.
    if (H.route && H.route.length > 1) {
      ctx.strokeStyle = '#51ff7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      H.route.forEach(function (n, i) {
        if (i === 0) ctx.moveTo(mx(n.x), mz(n.z)); else ctx.lineTo(mx(n.x), mz(n.z));
      });
      ctx.stroke();
    }
    // Waypoint.
    if (H.waypoint) {
      ctx.fillStyle = '#51ff7a';
      ctx.beginPath(); ctx.arc(mx(H.waypoint.x), mz(H.waypoint.z), 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('Waypoint', mx(H.waypoint.x) + 8, mz(H.waypoint.z));
    }
    // Mission marker.
    var mp = FL.missions.getMarkerPos();
    if (mp) {
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(mx(mp.x), mz(mp.z), 7, 0, Math.PI * 2); ctx.fill();
    }
    // Player.
    var pp = game.player.position;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx(pp.x), mz(pp.z), 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('Kamu', mx(pp.x) + 8, mz(pp.z));
  };
  H.onMapClick = function (e) {
    var canvas = H.els['map-canvas'];
    if (!canvas || !H.game) return;
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left) * (canvas.width / rect.width);
    var py = (e.clientY - rect.top) * (canvas.height / rect.height);
    var scale = Math.min(canvas.width, canvas.height) / 660;
    var wx = (px - canvas.width / 2) / scale;
    var wz = (py - canvas.height / 2) / scale;
    wx = FL.clamp(wx, -320, 320); wz = FL.clamp(wz, -320, 320);
    H.waypoint = { x: wx, z: wz };
    // GPS route: BFS along the nav graph.
    var from = FL.city.nearestNode(H.game.player.position.x, H.game.player.position.z);
    var to = FL.city.nearestNode(wx, wz);
    var path = FL.city.findPath(from, to);
    H.route = path.map(function (i) { return FL.city.navNodes[i]; });
    H.route.push({ x: wx, z: wz });
    H.notify('Waypoint diset — ikuti garis hijau');
    H.drawMap(H.game);
  };

  // --- Save / load (localStorage, versioned, corrupt-safe) ---
  H.saveGame = function (game) {
    try {
      var data = {
        version: 1, savedAt: Date.now(),
        money: game.money, missionsCompleted: game.missionsCompleted,
        player: {
          x: game.player.position.x, z: game.player.position.z,
          health: game.player.health, armor: game.player.armor,
          weapons: game.player.weapons, ammo: game.player.ammo, reserveAmmo: game.player.reserveAmmo,
        },
        wanted: FL.world.wanted,
        settings: game.settings,
      };
      localStorage.setItem(FL.CFG.saveKey, JSON.stringify(data));
      return true;
    } catch (e) {
      FL.logError('save failed: ' + e.message);
      return false;
    }
  };
  H.loadGame = function () {
    try {
      var raw = localStorage.getItem(FL.CFG.saveKey);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      if (typeof data.money !== 'number' || !data.player) return null;
      return data;
    } catch (e) {
      FL.logError('load failed (corrupt save): ' + e.message);
      try { localStorage.removeItem(FL.CFG.saveKey); } catch (e2) { /* ignore */ }
      return null;
    }
  };
  H.hasSave = function () {
    try { return !!localStorage.getItem(FL.CFG.saveKey); } catch (e) { return false; }
  };
  H.saveSettings = function (settings) {
    try { localStorage.setItem(FL.CFG.settingsKey, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  };
  H.loadSettings = function () {
    try {
      var raw = localStorage.getItem(FL.CFG.settingsKey);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && typeof s.volume === 'number') return s;
      return null;
    } catch (e) { return null; }
  };
  H.toggleDebug = function () { H.debugOn = !H.debugOn; };
})();
