/* ============================================================
   ARTEMIS · Lunar terrain generation & queries
   Generates a fractal height profile with a guaranteed flat
   landing pad, plus scattered craters for visual texture.
   ============================================================ */
(function (global) {
  "use strict";

  const { U } = global.ARTEMIS;

  function Terrain(opts) {
    const cfg = global.ARTEMIS.CONFIG;
    this.width = cfg.WORLD.width;
    this.step = 10;                       // metres between sample points
    this.roughness = opts.roughness;
    this.padHalfWidth = opts.padHalfWidth;
    this.padCenterX = opts.padCenterX;
    this.seed = opts.seed;
    this.points = [];                     // [{x, y}] — y is surface height (m, up+)
    this.craters = [];
    this._generate();
  }

  Terrain.prototype._generate = function () {
    const rng = U.makeRng(this.seed);
    const n = Math.ceil(this.width / this.step) + 1;
    const base = 90;                      // mean surface height above datum

    // Multi-octave value noise.
    const octaves = [
      { wl: 1400, amp: 120 },
      { wl: 520, amp: 60 },
      { wl: 190, amp: 28 },
      { wl: 70, amp: 12 },
    ];
    // Pre-seed random phase per octave so profiles differ per mission.
    const phase = octaves.map(() => rng() * 1000);

    const heights = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * this.step;
      let h = base;
      for (let o = 0; o < octaves.length; o++) {
        const { wl, amp } = octaves[o];
        const t = x / wl + phase[o];
        // smooth combination of sines for organic ridges
        h += Math.sin(t * 6.2831) * amp * 0.6 * this.roughness;
        h += Math.sin(t * 2.7 + 1.3) * amp * 0.4 * this.roughness;
      }
      heights[i] = Math.max(20, h);
    }

    // Carve a flat, level landing pad around padCenterX with ramped shoulders.
    const padI = Math.round(this.padCenterX / this.step);
    const padHalfI = Math.round(this.padHalfWidth / this.step);
    const rampI = padHalfI + 6;
    const padH = heights[U.clamp(padI, 0, n - 1)];
    for (let i = padI - rampI; i <= padI + rampI; i++) {
      if (i < 0 || i >= n) continue;
      const d = Math.abs(i - padI);
      if (d <= padHalfI) {
        heights[i] = padH;              // perfectly flat pad
      } else {
        const t = (d - padHalfI) / (rampI - padHalfI);
        heights[i] = U.lerp(padH, heights[i], t * t); // smooth shoulder
      }
    }

    for (let i = 0; i < n; i++) {
      this.points.push({ x: i * this.step, y: heights[i] });
    }
    this.padHeight = padH;

    // Decorative craters away from the pad.
    const craterCount = Math.round(10 + this.roughness * 8);
    for (let c = 0; c < craterCount; c++) {
      const x = U.randRange(rng, 60, this.width - 60);
      if (Math.abs(x - this.padCenterX) < this.padHalfWidth * 3) continue;
      this.craters.push({
        x,
        y: this.heightAt(x),
        r: U.randRange(rng, 8, 34),
      });
    }
  };

  // Surface height at world x (linear interpolation between samples).
  Terrain.prototype.heightAt = function (x) {
    const fx = U.clamp(x, 0, this.width - 0.001) / this.step;
    const i = Math.floor(fx);
    const t = fx - i;
    const a = this.points[i] ? this.points[i].y : this.points[0].y;
    const b = this.points[i + 1] ? this.points[i + 1].y : a;
    return U.lerp(a, b, t);
  };

  // Local surface slope (radians) at world x.
  Terrain.prototype.slopeAt = function (x) {
    const d = this.step;
    const h1 = this.heightAt(x - d);
    const h2 = this.heightAt(x + d);
    return Math.atan2(h2 - h1, 2 * d);
  };

  // Is world x inside the flat landing pad?
  Terrain.prototype.isOnPad = function (x) {
    return Math.abs(x - this.padCenterX) <= this.padHalfWidth;
  };

  global.ARTEMIS.Terrain = Terrain;
})(window);
