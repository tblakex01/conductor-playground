/* ============================================================
   ARTEMIS · Procedural sound effects (Web Audio API)
   Every sound is synthesised at runtime — no audio assets, no
   network, no build step. A continuous filtered-noise + sine
   "engine" tracks throttle; discrete cues (RCS, alarm, touchdown,
   crash, chime, UI click) are one-shot envelopes.

   The AudioContext is created lazily on the first user gesture
   (unlock()) to comply with browser autoplay policies. When the
   Web Audio API is unavailable, every method is a safe no-op.
   ============================================================ */
(function (global) {
  "use strict";

  function AudioFX() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
    this.muted = false;
    this._noiseBuf = null;
    this._alarmOn = false;
    this._alarmTimer = null;
    this._lastRcs = 0;
  }

  // Create / resume the audio graph. Safe to call repeatedly; must be
  // triggered from within a user gesture the first time.
  AudioFX.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;                       // no Web Audio — stay silent
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    this._noiseBuf = this._makeNoise(2);
    this._buildEngine();
  };

  AudioFX.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
    }
  };

  // ---- Engine: continuous throttle-driven rumble ---------------------------
  AudioFX.prototype._buildEngine = function () {
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();

    const osc = ctx.createOscillator();   // sub-bass body
    osc.type = "sine";
    osc.frequency.value = 34;
    const oGain = ctx.createGain();
    oGain.gain.value = 0;
    osc.connect(oGain); oGain.connect(this.master); osc.start();

    this.engine = { src: src, filter: filter, gain: gain, osc: osc, oGain: oGain };
  };

  // level: applied throttle 0..1
  AudioFX.prototype.setEngine = function (level) {
    if (!this.ctx || !this.engine) return;
    level = level < 0 ? 0 : level > 1 ? 1 : level;
    const now = this.ctx.currentTime;
    const e = this.engine;
    e.gain.gain.setTargetAtTime(level <= 0 ? 0 : 0.04 + level * 0.16, now, 0.05);
    e.filter.frequency.setTargetAtTime(180 + level * 1500, now, 0.05);
    e.oGain.gain.setTargetAtTime(level <= 0 ? 0 : 0.03 + level * 0.09, now, 0.06);
    e.osc.frequency.setTargetAtTime(30 + level * 22, now, 0.1);
  };

  // ---- One-shot helpers -----------------------------------------------------
  AudioFX.prototype._makeNoise = function (seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  AudioFX.prototype.beep = function (freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    dur = dur || 0.15; vol = vol || 0.2;
    const o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + dur + 0.02);
  };

  AudioFX.prototype._burst = function (dur, fromFreq, toFreq, vol, type) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type || "bandpass";
    f.frequency.setValueAtTime(fromFreq, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), now + dur);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now); src.stop(now + dur + 0.02);
  };

  // ---- Discrete cues --------------------------------------------------------
  AudioFX.prototype.rcs = function () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastRcs < 0.09) return;   // throttle the spawn rate
    this._lastRcs = now;
    this._burst(0.12, 1700, 700, 0.10, "bandpass");
  };

  // softness: 0 (hard) .. 1 (feather) — louder/lower thud for harder contact.
  AudioFX.prototype.touchdown = function (softness) {
    if (!this.ctx) return;
    const hard = 1 - (softness || 0);
    this._burst(0.18, 480, 110, 0.16 + hard * 0.16, "lowpass");
    this.beep(90, 0.3, "sine", 0.22 + hard * 0.12);
  };

  AudioFX.prototype.crash = function () {
    if (!this.ctx) return;
    this._burst(0.6, 1400, 60, 0.5, "lowpass");
    this.beep(70, 0.5, "sine", 0.45);
    this.beep(44, 0.75, "sine", 0.4);
  };

  AudioFX.prototype.chime = function () {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      global.setTimeout(() => this.beep(f, 0.28, "triangle", 0.18), i * 120);
    });
  };

  AudioFX.prototype.click = function () {
    this.beep(330, 0.05, "square", 0.07);
  };

  // Repeating master-alarm beep while `on` is true.
  AudioFX.prototype.setAlarm = function (on) {
    if (on && !this._alarmOn) {
      this._alarmOn = true;
      this.beep(880, 0.12, "square", 0.13);
      this._alarmTimer = global.setInterval(() => {
        if (this.ctx && !this.muted) this.beep(880, 0.12, "square", 0.13);
      }, 560);
    } else if (!on && this._alarmOn) {
      this._alarmOn = false;
      global.clearInterval(this._alarmTimer);
      this._alarmTimer = null;
    }
  };

  global.ARTEMIS = global.ARTEMIS || {};
  global.ARTEMIS.AudioFX = AudioFX;
})(window);
