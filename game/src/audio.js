// FROSTLINE 3D — audio: fully procedural WebAudio. No audio files, no network.
// SFX are synthesized (oscillators + filtered noise); the radio is a tiny
// generative sequencer per station. AudioContext starts only after a user gesture.
(function () {
  'use strict';
  var FL = window.FL;

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, musicGain = null, sfxGain = null, engineNodes = null;
  var started = false, muted = false;
  var radioIndex = 0, radioTimer = 0, radioStep = 0, nextNoteTime = 0;
  var volume = 0.7;

  function ensure() {
    if (ctx) return true;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
      started = true;
      return true;
    } catch (e) { FL.logError('audio.ensure', e); return false; }
  }

  FL.audio = {
    // Call from a user gesture (click/keydown) to unlock audio.
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
    },
    setVolume: function (v) {
      volume = FL.clamp(v, 0, 1);
      if (master) master.gain.value = volume;
    },
    getVolume: function () { return volume; },
    isStarted: function () { return started; },

    // Aliases used by main.js.
    ensure: function () { this.unlock(); },
    engine: function (on) { if (on) this.engineStart(); else this.engineStop(); },
    setEngine: function (speed01) { this.engineSet(speed01, true); },

    // --- SFX (each is a short synthesized burst) ---
    blip: function (freq, dur, type, gain) {
      if (!ensure() || !sfxGain) return;
      try {
        var t = ctx.currentTime;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'square'; o.frequency.value = freq || 440;
        g.gain.setValueAtTime(gain || 0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.08));
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + (dur || 0.08) + 0.02);
      } catch (e) { FL.logError('audio.blip', e); }
    },
    noise: function (dur, filterFreq, gain, type) {
      if (!ensure() || !sfxGain) return;
      try {
        var t = ctx.currentTime;
        var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1000;
        var g = ctx.createGain();
        g.gain.setValueAtTime(gain || 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(sfxGain);
        src.start(t);
      } catch (e) { FL.logError('audio.noise', e); }
    },
    shoot: function (kind) {
      if (kind === 'shotgun') { this.noise(0.22, 900, 0.5); this.blip(90, 0.12, 'sawtooth', 0.25); }
      else if (kind === 'smg') { this.noise(0.07, 1800, 0.28); this.blip(220, 0.05, 'square', 0.12); }
      else { this.noise(0.12, 1400, 0.35); this.blip(160, 0.08, 'square', 0.15); }
    },
    punch: function () { this.noise(0.08, 500, 0.4); },
    explosion: function () {
      this.noise(0.9, 300, 0.8); this.blip(45, 0.7, 'sine', 0.5);
    },
    crash: function (hard) {
      this.noise(hard ? 0.35 : 0.15, 700, hard ? 0.6 : 0.3);
      this.blip(70, 0.15, 'sawtooth', 0.2);
    },
    horn: function () {
      this.blip(370, 0.18, 'sawtooth', 0.18); this.blip(440, 0.18, 'sawtooth', 0.15);
    },
    siren: function () {
      if (!ensure() || !sfxGain) return;
      try {
        var t = ctx.currentTime;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(700, t);
        o.frequency.linearRampToValueAtTime(1100, t + 0.35);
        o.frequency.linearRampToValueAtTime(700, t + 0.7);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.1);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g); g.connect(sfxGain);
        o.start(t); o.stop(t + 0.75);
      } catch (e) { FL.logError('audio.siren', e); }
    },
    pickup: function () { this.blip(660, 0.09, 'sine', 0.2); setTimeout(function () { FL.audio.blip(990, 0.12, 'sine', 0.2); }, 90); },
    mission: function () { this.blip(523, 0.12, 'triangle', 0.2); setTimeout(function () { FL.audio.blip(784, 0.2, 'triangle', 0.2); }, 120); },
    fail: function () { this.blip(220, 0.3, 'sawtooth', 0.15); setTimeout(function () { FL.audio.blip(165, 0.4, 'sawtooth', 0.15); }, 180); },
    click: function () { this.blip(880, 0.05, 'sine', 0.12); },
    step: function () { this.noise(0.05, 400, 0.08); },
    skid: function () { this.noise(0.18, 2400, 0.12, 'highpass'); },

    // --- Engine loop (one oscillator + noise, pitched by speed) ---
    engineStart: function () {
      if (!ensure() || engineNodes) return;
      try {
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
        var g = ctx.createGain(); g.gain.value = 0.0;
        o.connect(f); f.connect(g); g.connect(sfxGain);
        o.start();
        engineNodes = { osc: o, filter: f, gain: g };
      } catch (e) { FL.logError('audio.engineStart', e); }
    },
    engineSet: function (speed01, on) {
      if (!engineNodes) return;
      speed01 = FL.clamp(FL.sanitize(speed01, 0), 0, 1); // a NaN pitch would throw inside setTargetAtTime
      try {
        var t = ctx.currentTime;
        engineNodes.osc.frequency.setTargetAtTime(50 + speed01 * 160, t, 0.08);
        engineNodes.filter.frequency.setTargetAtTime(200 + speed01 * 1200, t, 0.08);
        engineNodes.gain.gain.setTargetAtTime(on ? 0.10 + speed01 * 0.08 : 0.0, t, 0.1);
      } catch (e) { /* ignore */ }
    },
    engineStop: function () {
      if (!engineNodes) return;
      try { engineNodes.osc.stop(); } catch (e) { /* ignore */ }
      engineNodes = null;
    },

    // --- Radio: generative sequencer (3 stations, distinct feels) ---
    radioName: function () { return FL.RADIO[radioIndex].name; },
    radioNext: function () {
      radioIndex = (radioIndex + 1) % FL.RADIO.length;
      radioStep = 0;
      return FL.RADIO[radioIndex].name;
    },
    radioUpdate: function (dt) {
      if (!started || !ctx || ctx.state !== 'running') return;
      var st = FL.RADIO[radioIndex];
      var stepDur = 60 / st.bpm / 2; // eighth notes
      radioTimer += dt;
      while (radioTimer >= stepDur) {
        radioTimer -= stepDur;
        this.radioNote(st, radioStep);
        radioStep = (radioStep + 1) % 64;
      }
    },
    radioNote: function (st, step) {
      if (!musicGain) return;
      try {
        var t = ctx.currentTime + 0.02;
        var scale = st.genre === 'jazz' ? [0, 3, 5, 7, 10] : (st.genre === 'rock' ? [0, 0, 7, 0, 10, 12] : [0, 3, 7, 10, 12, 15]);
        // Bass on beats.
        if (step % 4 === 0) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = st.genre === 'rock' ? 'sawtooth' : 'triangle';
          o.frequency.value = st.root * (step % 16 === 8 ? 1.5 : 1);
          g.gain.setValueAtTime(0.16, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.45);
        }
        // Sparse lead (deterministic-ish via step pattern).
        if (step % 2 === 1 && ((step * 7 + 3) % 5) < 2) {
          var idx = scale[(step * 5 + 1) % scale.length];
          var o2 = ctx.createOscillator(), g2 = ctx.createGain();
          o2.type = st.genre === 'synthwave' ? 'sawtooth' : 'sine';
          o2.frequency.value = st.root * 4 * Math.pow(2, idx / 12);
          g2.gain.setValueAtTime(0.05, t);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          o2.connect(g2); g2.connect(musicGain); o2.start(t); o2.stop(t + 0.32);
        }
        // Hat tick.
        if (step % 2 === 0) {
          var len = Math.floor(ctx.sampleRate * 0.03);
          var buf = ctx.createBuffer(1, len, ctx.sampleRate);
          var d = buf.getChannelData(0);
          for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          var s = ctx.createBufferSource(); s.buffer = buf;
          var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
          var g3 = ctx.createGain(); g3.gain.value = 0.05;
          s.connect(f); f.connect(g3); g3.connect(musicGain); s.start(t);
        }
      } catch (e) { /* keep music non-fatal */ }
    },
  };
})();
