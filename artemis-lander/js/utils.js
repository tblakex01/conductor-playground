/* ============================================================
   ARTEMIS · Small math / helper utilities
   ============================================================ */
(function (global) {
  "use strict";

  const U = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

    lerp(a, b, t) { return a + (b - a) * t; },

    // Seeded pseudo-random generator (mulberry32) for repeatable terrain.
    makeRng(seed) {
      let s = seed >>> 0;
      return function () {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    randRange(rng, lo, hi) { return lo + (hi - lo) * rng(); },

    deg(rad) { return (rad * 180) / Math.PI; },
    rad(deg) { return (deg * Math.PI) / 180; },

    // Format mission elapsed time as MM:SS.s
    formatMET(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds - m * 60;
      return (
        String(m).padStart(2, "0") +
        ":" +
        s.toFixed(1).padStart(4, "0")
      );
    },

    // Try a list of image URLs; resolve with the first that loads, else null.
    loadFirstImage(urls) {
      return new Promise((resolve) => {
        let i = 0;
        const tryNext = () => {
          if (i >= urls.length) return resolve(null);
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => { i += 1; tryNext(); };
          img.src = urls[i];
        };
        tryNext();
      });
    },
  };

  global.ARTEMIS = global.ARTEMIS || {};
  global.ARTEMIS.U = U;
})(window);
