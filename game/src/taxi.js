// FROSTLINE 3D — taxi (v8): the Taxi Shift. The base game has a one-fare
// taxi job (missions.js, KeyT); this module replaces it with a full shift:
// five consecutive fares against one 300-second clock, with a combo bonus
// that grows per fare and a night bonus after dark (via FL.daynight). The
// shift borrows the mission marker like the vigilante job does, so it only
// runs when no story mission is active. KeyT starts it (main.js routes the
// key here when this module is loaded, and falls back to the one-fare job
// if it is not).
(function () {
  'use strict';
  var FL = window.FL;

  var SHIFT_FARES = 5;
  var SHIFT_TIME = 300; // seconds for all five fares
  var SHIFT_BONUS = 200; // paid on completing the whole shift

  var T = {
    scene: null, game: null,
    shift: null, // { fare, from, to, phase, timeLeft, earned }
    chipEl: null,
  };
  FL.taxi = T;

  FL.taxi.init = function (scene, game) {
    T.scene = scene;
    T.game = game;
    T.chipEl = document.getElementById('taxi-chip');
  };

  function farePay() {
    // Base $40-120, +50% at night, +10% per combo step (fare 2 = +10% ...).
    var base = FL.randInt(40, 120);
    var mult = FL.daynight ? FL.daynight.fareMultiplier() : 1;
    var combo = 1 + (T.shift.fare - 1) * 0.1;
    return Math.round(base * mult * combo);
  }
  function nextFare() {
    var from = FL.city.randomSidewalkPoint();
    var to = FL.city.randomSidewalkPoint();
    for (var t = 0; t < 20 && FL.dist2(from.x, from.z, to.x, to.z) < 10000; t++) {
      to = FL.city.randomSidewalkPoint();
    }
    T.shift.from = from;
    T.shift.to = to;
    T.shift.phase = 'pickup';
    FL.missions.setMarker(from.x, from.z, 0x51ff7a);
    FL.emit('objective', 'Taksi ' + T.shift.fare + '/' + SHIFT_FARES + ': jemput penumpang (penanda hijau)');
  }
  function updateChip() {
    if (!T.chipEl) return;
    if (!T.shift) { T.chipEl.style.display = 'none'; return; }
    T.chipEl.style.display = 'block';
    T.chipEl.textContent = 'TAXI ' + T.shift.fare + '/' + SHIFT_FARES + ' · ' +
      FL.fmtTime(T.shift.timeLeft) + ' · +$' + T.shift.earned;
  }
  function endShift(msg, bonus) {
    T.shift = null;
    FL.missions.clearMarker();
    FL.emit('timer', 0);
    updateChip();
    if (bonus) {
      T.game.addMoney(bonus);
      FL.emit('notif', msg + ' Bonus shift +' + FL.fmtMoney(bonus) + '!');
    } else {
      FL.emit('notif', msg);
    }
  }

  FL.taxi.startShift = function () {
    if (T.shift) { FL.hud.notify('Shift taksi sedang berjalan — selesaikan dulu!'); return; }
    var ms = FL.missions.getState();
    if (ms.state === 'active' || ms.state === 'intro') {
      FL.hud.notify('Selesaikan misi dulu sebelum narik taksi');
      return;
    }
    T.shift = { fare: 1, from: null, to: null, phase: 'pickup', timeLeft: SHIFT_TIME, earned: 0 };
    nextFare();
    updateChip();
    FL.emit('notif', 'Shift taksi dimulai! 5 penumpang, 300 detik — combo naik tiap fare');
    FL.audio.click();
  };
  FL.taxi.isActive = function () { return !!T.shift; };

  FL.taxi.update = function (dt) {
    if (!T.shift || !T.game) return;
    var S = T.shift;
    S.timeLeft -= dt;
    FL.emit('timer', Math.max(0, S.timeLeft));
    updateChip();
    if (S.timeLeft <= 0) {
      FL.audio.fail();
      endShift('Shift taksi gagal — waktu habis. Kamu dapat $' + S.earned + '.');
      return;
    }
    var pp = T.game.player.position;
    var target = S.phase === 'pickup' ? S.from : S.to;
    if (FL.dist2(pp.x, pp.z, target.x, target.z) < 25) {
      if (S.phase === 'pickup') {
        S.phase = 'dropoff';
        FL.missions.setMarker(S.to.x, S.to.z, 0x51ff7a);
        FL.emit('objective', 'Taksi ' + S.fare + '/' + SHIFT_FARES + ': antar penumpang ke tujuan');
        FL.emit('notif', 'Penumpang naik!');
        FL.audio.pickup();
      } else {
        var pay = farePay();
        S.earned += pay;
        T.game.addMoney(pay);
        FL.audio.mission();
        if (S.fare >= SHIFT_FARES) {
          endShift('Shift taksi SELESAI! Total fare $' + S.earned + '.', SHIFT_BONUS);
          return;
        }
        S.fare++;
        FL.emit('notif', 'Fare selesai! +$' + pay + ' (combo +' + ((S.fare - 1) * 10) + '% untuk fare berikutnya)');
        nextFare();
        updateChip();
      }
    }
  };
})();
