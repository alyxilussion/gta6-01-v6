// FROSTLINE 3D — daynight (v8): the day/night cycle as GAMEPLAY, not just
// lighting. The base cycle in main.js already moves the sun and changes the
// sky; this module reads the same clock (game.hour) and makes the time of
// day matter: the weapon shop and the garage close at night, police patrols
// thicken after dark, taxi fares pay a night bonus, and street-lamp glows
// fade in as the city goes dark. Other modules read the rules here (never
// the clock directly) so the day/night rules live in exactly one place.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  // Shop hours: Ammu-Nation + Dex's Garage open 07:00-22:00.
  var SHOP_OPEN_HOUR = 7;
  var SHOP_CLOSE_HOUR = 22;
  // Night (for police + fares): 20:00-06:00.
  var NIGHT_START = 20;
  var NIGHT_END = 6;

  // Eight lamp-glow sprites at busy intersections (roads only, never on a
  // block centre). They fade in at dusk and out at dawn.
  var GLOW_SPOTS = [
    { x: 96, z: -96 }, { x: -96, z: 96 }, { x: 0, z: 160 },
    { x: 160, z: 0 }, { x: -160, z: -160 }, { x: 224, z: 224 },
    { x: -224, z: 32 }, { x: 32, z: -224 },
  ];

  var DN = {
    scene: null, game: null,
    glows: [], // glow sprites (one per GLOW_SPOTS entry)
    wasNight: null, // null = not yet announced
    wasShopOpen: null,
  };
  FL.daynight = DN;

  // Night is 20:00-06:00; dusk (17:00-20:00) and dawn (06:00-07:00) are
  // the transitions the lamp glows ease through.
  FL.daynight.isNight = function () {
    var h = DN.game ? DN.game.hour : FL.CFG.startHour;
    return h >= NIGHT_START || h < NIGHT_END;
  };
  FL.daynight.isDusk = function () {
    var h = DN.game ? DN.game.hour : FL.CFG.startHour;
    return h >= 17 && h < NIGHT_START;
  };
  FL.daynight.shopOpen = function () {
    var h = DN.game ? DN.game.hour : FL.CFG.startHour;
    return h >= SHOP_OPEN_HOUR && h < SHOP_CLOSE_HOUR;
  };
  // Night fares pay 50% extra (the taxi module reads this).
  FL.daynight.fareMultiplier = function () {
    return FL.daynight.isNight() ? 1.5 : 1;
  };
  // Police presence at night: +1 car, +2 foot cops (world.js reads this).
  FL.daynight.policeBoost = function () {
    return FL.daynight.isNight() ? { cars: 1, cops: 2 } : { cars: 0, cops: 0 };
  };

  function makeGlowSprite() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,220,150,0.95)');
    grad.addColorStop(0.4, 'rgba(255,190,100,0.4)');
    grad.addColorStop(1, 'rgba(255,190,100,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true,
      depthWrite: false, opacity: 0,
    }));
    s.scale.set(14, 14, 1);
    return s;
  }

  FL.daynight.init = function (scene, game) {
    DN.scene = scene;
    DN.game = game;
    GLOW_SPOTS.forEach(function (spot) {
      var s = makeGlowSprite();
      s.position.set(spot.x, 7.5, spot.z);
      scene.add(s);
      DN.glows.push(s);
    });
    DN.wasNight = FL.daynight.isNight();
    DN.wasShopOpen = FL.daynight.shopOpen();
  };

  FL.daynight.update = function (dt) {
    if (!DN.game) return;
    var h = DN.game.hour;
    var night = FL.daynight.isNight();
    // Lamp glows: full at night, half at dusk, off by day. The hour is
    // continuous, so the fade is smooth.
    var glow = 0;
    if (night) glow = 0.9;
    else if (h >= 17 && h < 20) glow = 0.45 + (h - 17) / 3 * 0.45;
    else if (h >= 6 && h < 7) glow = 0.9 - (h - 6) * 0.9;
    DN.glows.forEach(function (s) {
      s.material.opacity = FL.damp(s.material.opacity, glow, 1.5, dt);
    });
    // Transition announcements (once per change).
    if (DN.wasNight !== null && night !== DN.wasNight) {
      if (night) FL.emit('notif', 'Malam tiba — polisi lebih waspada, tarif taksi naik 50%');
      else FL.emit('notif', 'Pagi tiba — kota bangun lagi');
    }
    DN.wasNight = night;
    var open = FL.daynight.shopOpen();
    if (DN.wasShopOpen !== null && open !== DN.wasShopOpen) {
      if (!open) FL.emit('notif', 'Toko tutup — Ammu-Nation dan bengkel buka lagi jam 07:00');
      else FL.emit('notif', 'Toko buka — Ammu-Nation dan bengkel siap melayani');
    }
    DN.wasShopOpen = open;
  };
})();
