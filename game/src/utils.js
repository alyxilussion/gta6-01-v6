// FROSTLINE 3D — utils: seeded RNG, math helpers, spatial grid, small helpers.
// Plain classic script; every file below attaches to window.FL (created here).
(function () {
  'use strict';
  var FL = window.FL || (window.FL = {});

  // Deterministic seeded RNG (mulberry32) — the whole city is reproducible.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  FL.rng = mulberry32(1337);
  FL.makeRng = mulberry32;
  FL.rand = function (a, b) { return a + FL.rng() * (b - a); };
  FL.randInt = function (a, b) { return Math.floor(a + FL.rng() * (b - a + 1)); };
  FL.pick = function (arr) { return arr[Math.floor(FL.rng() * arr.length)]; };
  FL.chance = function (p) { return FL.rng() < p; };

  FL.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  FL.lerp = function (a, b, t) { return a + (b - a) * t; };
  FL.damp = function (a, b, lambda, dt) { return FL.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  FL.wrapAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  FL.angleLerp = function (a, b, t) { return a + FL.wrapAngle(b - a) * t; };
  FL.dist2 = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
  FL.sanitize = function (v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  };
  // Clamp a vector's components so NaN/Infinity can never freeze the loop.
  FL.sanitizeVec3 = function (v, fallback) {
    v.x = FL.sanitize(v.x, fallback); v.y = FL.sanitize(v.y, fallback); v.z = FL.sanitize(v.z, fallback);
    return v;
  };

  // Spatial grid on the XZ plane: O(1)-ish neighbour queries, no O(n^2).
  function SpatialGrid(cellSize) {
    this.cell = cellSize || 20;
    this.map = new Map();
  }
  SpatialGrid.prototype.key = function (x, z) {
    return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
  };
  SpatialGrid.prototype.clear = function () { this.map.clear(); };
  SpatialGrid.prototype.insert = function (obj, x, z) {
    var k = this.key(x, z);
    var arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(obj);
  };
  SpatialGrid.prototype.query = function (x, z, radius, out) {
    out = out || [];
    var c = this.cell;
    var x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    var z0 = Math.floor((z - radius) / c), z1 = Math.floor((z + radius) / c);
    for (var ix = x0; ix <= x1; ix++) {
      for (var iz = z0; iz <= z1; iz++) {
        var arr = this.map.get(ix + ',' + iz);
        if (arr) for (var i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  };
  FL.SpatialGrid = SpatialGrid;

  // Tiny event bus for decoupled subsystems (HUD, missions, audio).
  var listeners = {};
  FL.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  FL.emit = function (ev, data) {
    var arr = listeners[ev];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](data); } catch (e) { FL.logError('event ' + ev, e); }
    }
  };

  // Central error log (shown in the F3 overlay, never thrown into the loop).
  FL.errors = [];
  FL.logError = function (where, err) {
    var msg = where + ': ' + (err && err.message ? err.message : String(err));
    if (FL.errors.length > 40) FL.errors.shift();
    FL.errors.push(msg);
    if (typeof console !== 'undefined' && console.error) console.error('[FROSTLINE]', msg);
  };
  // Run a subsystem update guarded so one failure never freezes the loop.
  FL.guard = function (name, fn) {
    try { fn(); } catch (e) { FL.logError(name, e); }
  };

  // Format helpers.
  FL.fmtMoney = function (n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  FL.fmtTime = function (s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  };
})();
