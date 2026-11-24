// FROSTLINE 3D — systems (v7): the city's economy layer.
// A weapon shop (Ammu-Nation), a car garage (Dex's Garage), and two side
// jobs (vigilante takedowns, courier deliveries). All of it runs on the
// money the player already earns from missions — no new currency, no new
// HUD widgets: menus reuse the objective line + the prompt pill, and the
// shop/garage locations are marked by pulsing ground rings.
(function () {
  'use strict';
  var FL = window.FL;
  var THREE = window.THREE;

  var SHOP_POS = { x: 96, z: -96 };   // Ammu-Nation (intersection, clear)
  var GARAGE_POS = { x: -96, z: 96 }; // Dex's Garage (intersection, clear)
  var PAINTS = [
    { name: 'Merah Neon', color: 0xc22d4a },
    { name: 'Biru Es', color: 0x2d7ac2 },
    { name: 'Hijau Limau', color: 0x2dc26a },
    { name: 'Ungu Vapor', color: 0x7a4ac2 },
    { name: 'Emas', color: 0xd8a02d },
    { name: 'Cyan Neon', color: 0x2de8ff },
  ];

  var S = {
    scene: null, game: null,
    menu: null, // { type, idx, items }
    vigilante: null, // { v, bust, timeLeft, retarget }
    delivery: null,  // { from, to, phase, timeLeft }
    rings: [],
    ringT: 0,
  };
  FL.systems = S;

  FL.systems.init = function (scene, game) {
    S.scene = scene;
    S.game = game;
    // Ground rings mark the shop (green) and the garage (cyan).
    [ { p: SHOP_POS, c: 0x51ff7a }, { p: GARAGE_POS, c: 0x2de8ff } ].forEach(function (def) {
      var ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 32),
        new THREE.MeshBasicMaterial({ color: def.c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(def.p.x, 0.12, def.p.z);
      scene.add(ring);
      S.rings.push(ring);
    });
  };

  // --- Menu plumbing ---
  FL.systems.menuOpen = function () { return !!S.menu; };
  function openMenu(type, items) {
    S.menu = { type: type, idx: 0, items: items };
    renderMenu();
    FL.hud.setPrompt('[W/S] Pilih  ·  [Enter] Beli  ·  [B] Tutup');
  }
  function closeMenu() {
    S.menu = null;
    FL.hud.setPrompt('');
    FL.emit('objective', 'Neon Harbor');
  }
  function renderMenu() {
    if (!S.menu) return;
    var it = S.menu.items[S.menu.idx];
    var owned = it.owned && it.owned();
    var line = '[' + (S.menu.idx + 1) + '/' + S.menu.items.length + '] ' + it.name +
      ' — ' + FL.fmtMoney(it.price) + (owned ? ' (sudah dimiliki)' : '') + ' — ' + it.desc;
    FL.emit('objective', line);
  }
  FL.systems.menuKey = function (code) {
    if (!S.menu) return;
    if (code === 'KeyB' || code === 'Escape') { closeMenu(); FL.audio.click(); return; }
    if (code === 'KeyW' || code === 'ArrowUp') {
      S.menu.idx = (S.menu.idx + S.menu.items.length - 1) % S.menu.items.length;
      renderMenu(); FL.audio.click(); return;
    }
    if (code === 'KeyS' || code === 'ArrowDown') {
      S.menu.idx = (S.menu.idx + 1) % S.menu.items.length;
      renderMenu(); FL.audio.click(); return;
    }
    if (code === 'Enter') {
      var it = S.menu.items[S.menu.idx];
      if (it.owned && it.owned()) { FL.hud.notify('Item ini sudah kamu miliki'); return; }
      if (S.game.money < it.price) {
        FL.hud.notify('Uang tidak cukup! Butuh ' + FL.fmtMoney(it.price));
        FL.audio.fail();
        return;
      }
      S.game.money -= it.price;
      it.buy();
      FL.audio.pickup();
      FL.hud.notify('Terbeli: ' + it.name + ' (-' + FL.fmtMoney(it.price) + ')');
      renderMenu();
    }
  };

  // --- Weapon shop ---
  function hasWeapon(id) { return S.game.player.weapons.indexOf(id) >= 0; }
  function shopItems() {
    var p = S.game.player;
    return [
      { name: 'Amunisi (60)', price: 50, desc: 'Tambah 60 amunisi cadangan',
        buy: function () { p.reserveAmmo += 60; } },
      { name: 'SMG VK-9', price: 800, desc: 'Senjata otomatis, fire rate tinggi',
        owned: function () { return hasWeapon('smg'); },
        buy: function () { p.weapons.push('smg'); p.reserveAmmo += 96; } },
      { name: 'Shotgun M870', price: 1200, desc: '7 peluru sekali tembak, jarak dekat',
        owned: function () { return hasWeapon('shotgun'); },
        buy: function () { p.weapons.push('shotgun'); p.reserveAmmo += 36; } },
      { name: 'Granat x3', price: 200, desc: 'Granat lempar (tombol G)',
        owned: function () { return p.grenades >= 5; },
        buy: function () { p.grenades = Math.min(5, p.grenades + 3); } },
      { name: 'Armor +50', price: 300, desc: 'Pelindung badan, menyerap damage',
        owned: function () { return p.armor >= 100; },
        buy: function () { p.armor = Math.min(100, p.armor + 50); } },
      { name: 'Medkit +50', price: 150, desc: 'Pulihkan 50 HP',
        owned: function () { return p.health >= 100; },
        buy: function () { p.health = Math.min(100, p.health + 50); } },
    ];
  }

  // --- Garage (car customization) ---
  function upgradesOf(v) {
    if (!v.upgrades) v.upgrades = { engine: 0, tires: false, armor: 0, paint: 0, repaired: 0 };
    return v.upgrades;
  }
  function baseDef(v) {
    for (var i = 0; i < FL.VEHICLES.length; i++) if (FL.VEHICLES[i].id === v.type) return FL.VEHICLES[i];
    return FL.VEHICLES[0];
  }
  function applyUpgrades(v) {
    // Clone the shared type definition — mutating it would upgrade every
    // car of this type in the city.
    var up = upgradesOf(v);
    var base = baseDef(v);
    v.def = {
      id: base.id, name: base.name,
      accel: base.accel * (1 + 0.10 * up.engine),
      topSpeed: base.topSpeed * (1 + 0.10 * up.engine),
      grip: base.grip * (up.tires ? 1.15 : 1),
      mass: base.mass, color: base.color,
    };
    v.maxHp = 100 + 50 * up.armor;
    v.hp = Math.min(v.maxHp, v.hp);
  }
  function paintVehicle(v, color) {
    // Walk the model with an explicit stack; every mesh painted in the
    // factory colour gets a cloned material in the new colour (the factory
    // materials are shared across all cars, so they must never be mutated).
    var target = baseDef(v).color;
    var stack = [v.group];
    while (stack.length) {
      var node = stack.pop();
      if (node.isMesh && node.material && node.material.color && node.material.color.getHex() === target) {
        node.material = node.material.clone();
        node.material.color.setHex(color);
      }
      if (node.children) for (var i = 0; i < node.children.length; i++) stack.push(node.children[i]);
    }
  }
  function garageItems(v) {
    var up = upgradesOf(v);
    var nextPaint = PAINTS[(up.paint + 1) % PAINTS.length];
    return [
      { name: 'Cat: ' + nextPaint.name, price: 200, desc: 'Repaint mobil (giliran warna)',
        buy: function () {
          up.paint = (up.paint + 1) % PAINTS.length;
          paintVehicle(v, PAINTS[up.paint].color);
        } },
      { name: 'Mesin Lv' + (up.engine + 1), price: 600, desc: '+10% kecepatan & akselerasi',
        owned: function () { return up.engine >= 3; },
        buy: function () { up.engine++; applyUpgrades(v); } },
      { name: 'Ban Racing', price: 400, desc: '+15% grip, drift lebih terkendali',
        owned: function () { return up.tires; },
        buy: function () { up.tires = true; applyUpgrades(v); } },
      { name: 'Armor Kendaraan Lv' + (up.armor + 1), price: 500, desc: '+50 HP maksimal + reparasi penuh',
        owned: function () { return up.armor >= 2; },
        buy: function () { up.armor++; applyUpgrades(v); v.hp = v.maxHp; } },
      { name: 'Perbaiki Total', price: 150, desc: 'Kembalikan HP mobil ke penuh',
        owned: function () { return v.hp >= (v.maxHp || 100); },
        buy: function () { v.hp = v.maxHp || 100; } },
    ];
  }
  FL.systems.toggleShop = function () {
    if (S.menu) { closeMenu(); return; }
    var p = S.game.player;
    var pp = p.position;
    if (!p.inCar && FL.dist2(pp.x, pp.z, SHOP_POS.x, SHOP_POS.z) < 49) {
      openMenu('shop', shopItems());
      FL.audio.click();
      return;
    }
    if (p.inCar && p.vehicle && FL.dist2(pp.x, pp.z, GARAGE_POS.x, GARAGE_POS.z) < 81) {
      openMenu('garage', garageItems(p.vehicle));
      FL.audio.click();
      return;
    }
    FL.hud.notify('Tidak ada toko/bengkel di sini — cari ring hijau (toko) atau cyan (bengkel)');
  };

  // --- Vigilante (KeyN) ---
  // A criminal flees in a sports car. Stay within 10 m for 3 seconds to
  // bust them ($600), or destroy the car to neutralise them ($300). Only
  // available when no story mission is running (it borrows the marker).
  FL.systems.startVigilante = function () {
    if (S.vigilante) { FL.hud.notify('Vigilante sedang berjalan — kejar penjahatnya!'); return; }
    var ms = FL.missions.getState();
    if (ms.state === 'active' || ms.state === 'intro') {
      FL.hud.notify('Selesaikan misi dulu sebelum jadi vigilante');
      return;
    }
    var pp = S.game.player.position;
    var spot = null;
    for (var t = 0; t < 30; t++) {
      var cand = FL.city.randomRoadPoint();
      var d2 = FL.dist2(cand.x, cand.z, pp.x, pp.z);
      if (d2 > 3600 && d2 < 14400) { spot = cand; break; }
    }
    if (!spot) spot = FL.city.randomRoadPoint();
    var v = new FL.Vehicle('sports', spot.x, spot.z, Math.random() * Math.PI * 2);
    S.scene.add(v.group);
    S.vigilante = { v: v, bust: 0, timeLeft: 150, retarget: 0, target: null };
    FL.missions.setMarker(spot.x, spot.z, 0xff4444);
    FL.emit('objective', 'Vigilante: kejar penjahat (dekat 3 detik untuk menangkap)');
    FL.emit('notif', 'Penjahat kabur dengan mobil sport — kejar!');
    FL.audio.siren();
  };
  function endVigilante(msg, reward) {
    if (!S.vigilante) return;
    if (S.vigilante.v && S.vigilante.v.group) S.scene.remove(S.vigilante.v.group);
    S.vigilante = null;
    FL.missions.clearMarker();
    FL.emit('timer', 0);
    if (reward) S.game.addMoney(reward);
    FL.emit('notif', msg);
  }
  function updateVigilante(dt) {
    var V = S.vigilante;
    if (!V) return;
    var pp = S.game.player.position;
    V.timeLeft -= dt;
    FL.emit('timer', Math.max(0, V.timeLeft));
    if (V.timeLeft <= 0) { endVigilante('Vigilante gagal — penjahat lolos'); return; }
    var v = V.v;
    if (v.dead) {
      FL.audio.explosion();
      endVigilante('Penjahat dinetralisir! +$300', 300);
      return;
    }
    // Flee: pick a road point away from the player, drive to it, re-pick.
    V.retarget -= dt;
    var vx = v.group.position.x, vz = v.group.position.z;
    if (!V.target || V.retarget <= 0 || FL.dist2(vx, vz, V.target.x, V.target.z) < 100) {
      V.retarget = 6;
      var away = null;
      for (var t = 0; t < 20; t++) {
        var cand = FL.city.randomRoadPoint();
        if (FL.dist2(cand.x, cand.z, pp.x, pp.z) > FL.dist2(vx, vz, pp.x, pp.z)) { away = cand; break; }
      }
      V.target = away || FL.city.randomRoadPoint();
    }
    var dx = V.target.x - vx, dz = V.target.z - vz;
    var want = Math.atan2(dx, dz);
    var steer = FL.clamp(FL.wrapAngle(want - v.heading) * 2.0, -1, 1);
    v.update(dt, {
      throttle: Math.abs(v.speed) < 26, brake: false, reverse: false,
      steer: steer, handbrake: false,
    });
    // Marker follows the fleeing car.
    FL.missions.setMarker(vx, vz, 0xff4444);
    // Bust meter: within 10 m of the criminal.
    var d2p = FL.dist2(pp.x, pp.z, vx, vz);
    if (d2p < 100) {
      V.bust += dt;
      FL.emit('objective', 'Menangkap penjahat: ' + Math.floor(V.bust / 3 * 100) + '%');
      if (V.bust >= 3) {
        FL.audio.mission();
        endVigilante('Penjahat ditangkap! +$600', 600);
      }
    } else {
      V.bust = Math.max(0, V.bust - dt * 0.5);
      var d = Math.floor(Math.sqrt(d2p));
      FL.emit('objective', 'Vigilante: kejar penjahat (' + d + ' m)');
    }
  }

  // --- Courier delivery (KeyU) ---
  // Pick up a package, then deliver it against a 90-second clock.
  FL.systems.startDelivery = function () {
    if (S.delivery) { FL.hud.notify('Pengiriman sedang berjalan!'); return; }
    var ms = FL.missions.getState();
    if (ms.state === 'active' || ms.state === 'intro') {
      FL.hud.notify('Selesaikan misi dulu sebelum mengambil order');
      return;
    }
    var from = FL.city.randomSidewalkPoint();
    var to = FL.city.randomSidewalkPoint();
    for (var t = 0; t < 20 && FL.dist2(from.x, from.z, to.x, to.z) < 10000; t++) {
      to = FL.city.randomSidewalkPoint();
    }
    S.delivery = { from: from, to: to, phase: 'pickup', timeLeft: 0 };
    FL.missions.setMarker(from.x, from.z, 0x51ff7a);
    FL.emit('objective', 'Kurir: ambil paket (penanda hijau)');
    FL.emit('notif', 'Order kurir baru — ambil paketnya!');
  };
  function endDelivery(msg, reward) {
    if (!S.delivery) return;
    S.delivery = null;
    FL.missions.clearMarker();
    FL.emit('timer', 0);
    if (reward) S.game.addMoney(reward);
    FL.emit('notif', msg);
  }
  function updateDelivery(dt) {
    var D = S.delivery;
    if (!D) return;
    var pp = S.game.player.position;
    if (D.phase === 'pickup') {
      if (FL.dist2(pp.x, pp.z, D.from.x, D.from.z) < 25) {
        D.phase = 'deliver';
        D.timeLeft = 90;
        FL.missions.setMarker(D.to.x, D.to.z, 0x51ff7a);
        FL.emit('objective', 'Kurir: antar paket (90 detik)');
        FL.emit('notif', 'Paket diambil — antar sebelum waktu habis!');
        FL.audio.pickup();
      }
      return;
    }
    D.timeLeft -= dt;
    FL.emit('timer', Math.max(0, D.timeLeft));
    if (D.timeLeft <= 0) { endDelivery('Pengiriman gagal — waktu habis'); return; }
    if (FL.dist2(pp.x, pp.z, D.to.x, D.to.z) < 25) {
      FL.audio.mission();
      endDelivery('Paket terkirim! +$300', 300);
    }
  }

  // --- Per-frame update ---
  FL.systems.update = function (dt) {
    if (!S.game || !S.game.player) return;
    // Ring pulse.
    S.ringT += dt;
    var pulse = 0.55 + Math.sin(S.ringT * 2.2) * 0.25;
    S.rings.forEach(function (r) { r.material.opacity = pulse; });
    // Proximity prompts (only when near; otherwise the car prompt owns it).
    var p = S.game.player;
    var pp = p.position;
    if (!p.inCar && FL.dist2(pp.x, pp.z, SHOP_POS.x, SHOP_POS.z) < 49) {
      FL.hud.setPrompt('[B] Toko Senjata — Ammu-Nation');
    } else if (p.inCar && p.vehicle && FL.dist2(pp.x, pp.z, GARAGE_POS.x, GARAGE_POS.z) < 81) {
      FL.hud.setPrompt('[B] Bengkel — Garasi Dex');
    }
    updateVigilante(dt);
    updateDelivery(dt);
  };
})();
