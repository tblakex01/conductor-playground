/* ============================================================
   ARTEMIS · Canvas renderer
   Layered starfield + Milky Way, NASA "Blue Marble" Earth with an
   atmosphere limb, sun-lit lunar terrain with regolith grain and
   shadowed craters, a beacon-lit landing pad, a rim-lit vector
   lander with a throttle-driven plume (shock diamonds), regolith
   dust, and a cinematic vignette. Auto-zooming camera follows the
   descent. All lighting keys off a single sun direction (upper-left)
   for a coherent, photographic look.
   ============================================================ */
(function (global) {
  "use strict";

  const { U, CONFIG } = global.ARTEMIS;

  // Single key light shared by every surface, so highlights and shadows agree.
  // World space (y is up): the sun sits high and to the upper-left.
  const SUN = { x: -0.46, y: 0.89 };       // unit-ish direction *towards* the sun

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = 0;
    this.H = 0;

    this.cam = { x: 0, y: 0, scale: 1 };
    this.camTarget = { x: 0, y: 0, scale: 1 };

    this.stars = [];
    this.bandStars = [];  // dimmer Milky Way band
    this.galaxy = [];     // soft nebula clouds
    this.exhaust = [];    // engine plume particles
    this.dust = [];       // regolith kicked up near surface
    this.rcsPuffs = [];
    this.specks = [];      // regolith surface grain (per-terrain)
    this.earthImg = null;

    this.terrain = null;
    this.lander = null;

    this.resize();
    this._makeStars();

    U.loadFirstImage(CONFIG.ASSETS.earth)
      .then((img) => { this.earthImg = img; })
      .catch(() => { /* keep the procedural Earth fallback */ });
  }

  Renderer.prototype.resize = function () {
    const c = this.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = c.clientWidth;
    this.H = c.clientHeight;
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  Renderer.prototype._makeStars = function () {
    const rng = U.makeRng(1337);
    // Cool-to-warm star colour palette (mostly blue-white, a few amber).
    const palette = [
      "#eaf2ff", "#dce8ff", "#cfe0ff", "#c2d4ff",
      "#ffffff", "#fff3df", "#ffe6c4", "#bcd0ff",
    ];
    const pick = () => palette[Math.floor(rng() * palette.length)];

    this.stars = [];
    for (let i = 0; i < 360; i++) {
      this.stars.push({
        x: rng() * 2600 - 300,
        y: rng() * 1400 - 200,
        r: rng() * 1.3 + 0.2,
        a: rng() * 0.7 + 0.2,
        tw: rng() * 6.28,
        c: pick(),
        glow: rng() < 0.06,          // a handful of bright "hero" stars
      });
    }

    // Milky Way band: a soft diagonal swath of faint stars, stored in
    // normalised [0,1] viewport space so it survives resizes.
    this.bandStars = [];
    const a0 = { u: -0.1, v: 0.18 }, a1 = { u: 1.1, v: 0.66 };
    for (let i = 0; i < 540; i++) {
      const t = rng();
      // Gaussian-ish perpendicular spread (sum of uniforms) clustered on the band.
      const spread = ((rng() + rng() + rng()) / 3 - 0.5) * 0.34;
      this.bandStars.push({
        u: U.lerp(a0.u, a1.u, t) + spread * 0.5,
        v: U.lerp(a0.v, a1.v, t) + spread,
        r: rng() * 0.9 + 0.15,
        a: rng() * 0.35 + 0.05,
        c: rng() < 0.5 ? "#cfe0ff" : "#e9e0ff",
      });
    }

    // A few translucent nebula clouds along the band for depth.
    this.galaxy = [];
    const hues = ["120,150,255", "150,130,255", "90,170,230", "180,150,220"];
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      this.galaxy.push({
        u: U.lerp(a0.u, a1.u, t) + (rng() - 0.5) * 0.12,
        v: U.lerp(a0.v, a1.v, t) + (rng() - 0.5) * 0.12,
        r: rng() * 0.16 + 0.12,
        hue: hues[i % hues.length],
        a: rng() * 0.05 + 0.03,
      });
    }
  };

  Renderer.prototype.setScene = function (terrain, lander) {
    this.terrain = terrain;
    this.lander = lander;
    this.exhaust.length = 0;
    this.dust.length = 0;
    this.rcsPuffs.length = 0;
    this._buildSurfaceDetail();
    // Snap camera immediately.
    this._computeCamTarget();
    this.cam.x = this.camTarget.x;
    this.cam.y = this.camTarget.y;
    this.cam.scale = this.camTarget.scale;
  };

  // Deterministic regolith grain along the surface (seeded from the terrain),
  // so the ground reads as dusty rock rather than a flat silhouette.
  Renderer.prototype._buildSurfaceDetail = function () {
    const t = this.terrain;
    const rng = U.makeRng(((t && t.seed) | 0) ^ 0x9e3779b9);
    this.specks = [];
    if (!t) return;
    const n = Math.floor(t.width / 5);
    for (let i = 0; i < n; i++) {
      const x = rng() * t.width;
      this.specks.push({
        x,
        depth: 2 + rng() * 46,            // metres below the rim (into the lit face)
        r: 0.5 + rng() * 1.6,
        tone: rng(),                       // 0 = dark pit, 1 = bright highlight
      });
    }
  };

  Renderer.prototype._computeCamTarget = function () {
    const l = this.lander;
    const groundH = this.terrain.heightAt(l.x);
    const alt = Math.max(0, l.y - groundH);
    // View span (metres) shrinks as we approach the surface -> auto zoom-in.
    const span = U.clamp(alt * 1.7 + 130, 150, 1500);
    this.camTarget.scale = this.H / span;
    this.camTarget.x = l.x;
    // Keep the lander ~42% down from the top of the viewport.
    this.camTarget.y = l.y;
  };

  // World -> screen helpers (world y is up; screen y is down).
  Renderer.prototype._sx = function (wx) {
    return this.W / 2 + (wx - this.cam.x) * this.cam.scale;
  };
  Renderer.prototype._sy = function (wy) {
    return this.H * 0.42 - (wy - this.cam.y) * this.cam.scale;
  };

  Renderer.prototype.render = function (dt, opts) {
    const ctx = this.ctx;
    opts = opts || {};

    // Smoothly chase the camera target.
    if (!opts.frozen) this._computeCamTarget();
    const k = 1 - Math.pow(0.0001, dt);
    this.cam.x = U.lerp(this.cam.x, this.camTarget.x, k);
    this.cam.y = U.lerp(this.cam.y, this.camTarget.y, k);
    this.cam.scale = U.lerp(this.cam.scale, this.camTarget.scale, k);
    this._t = (this._t || 0) + (opts.frozen ? 0 : dt);

    // Clear and paint the background in the untransformed frame so that the
    // clearRect/background fill always cover the full canvas. Impact shake is
    // applied only to the scene on top, avoiding uncleared bands at the edges.
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawSky();
    this._drawGalaxy();
    this._drawSunGlow();

    const shake = opts.shake || 0;
    if (shake > 0) {
      ctx.save();
      const amp = shake * 14;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    this._drawStars(dt);
    this._drawEarth();
    this._drawTerrain();
    this._drawPad();
    this._drawTrail(opts);
    this._drawPredictor(opts);
    this._updateParticles(dt, opts);
    this._drawGroundGlow();
    this._drawParticles();
    this._drawLander();
    this._drawApproachVector(opts);

    if (shake > 0) ctx.restore();

    this._drawVignette();
  };

  // ---- Background -----------------------------------------------------------
  Renderer.prototype._drawSky = function () {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#04050c");
    g.addColorStop(0.5, "#05080f");
    g.addColorStop(0.82, "#070b16");
    g.addColorStop(1, "#0a0f1c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  };

  // Soft Milky Way band + nebula clouds, drawn behind the stars.
  Renderer.prototype._drawGalaxy = function () {
    const ctx = this.ctx;
    const px = -this.cam.x * 0.012;
    const py = this.cam.y * 0.012;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of this.galaxy) {
      const cx = n.u * this.W + px;
      const cy = n.v * this.H + py;
      const rr = n.r * Math.max(this.W, this.H);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, "rgba(" + n.hue + "," + n.a + ")");
      g.addColorStop(1, "rgba(" + n.hue + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, 6.2831);
      ctx.fill();
    }
    // Faint band stars threaded through the nebula.
    for (const s of this.bandStars) {
      const x = s.u * this.W + px;
      const y = s.v * this.H + py;
      if (x < -4 || x > this.W + 4 || y < -4 || y > this.H + 4) continue;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, 6.2831);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // A subtle key-light bloom bleeding in from the upper-left sun.
  Renderer.prototype._drawSunGlow = function () {
    const ctx = this.ctx;
    const sx = this.W * 0.08, sy = this.H * 0.06;
    const r = Math.max(this.W, this.H) * 0.5;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, "rgba(120,150,210,0.10)");
    g.addColorStop(0.5, "rgba(90,120,180,0.04)");
    g.addColorStop(1, "rgba(90,120,180,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  };

  Renderer.prototype._drawStars = function (dt) {
    const ctx = this.ctx;
    const px = -this.cam.x * 0.04;
    const py = this.cam.y * 0.04;
    for (const s of this.stars) {
      let x = ((s.x + px) % this.W + this.W) % this.W;
      let y = ((s.y + py) % this.H + this.H) % this.H;
      const tw = 0.6 + 0.4 * Math.sin(this._t * 2 + s.tw);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.c;
      if (s.glow) {
        ctx.shadowColor = s.c;
        ctx.shadowBlur = 6 + s.r * 4;
      }
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, 6.2831);
      ctx.fill();
      if (s.glow) {
        ctx.shadowBlur = 0;
        // Tiny diffraction cross on the brightest stars.
        ctx.globalAlpha = s.a * tw * 0.5;
        ctx.strokeStyle = s.c;
        ctx.lineWidth = 0.6;
        const cr = s.r * 3.2;
        ctx.beginPath();
        ctx.moveTo(x - cr, y); ctx.lineTo(x + cr, y);
        ctx.moveTo(x, y - cr); ctx.lineTo(x, y + cr);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  Renderer.prototype._drawEarth = function () {
    const ctx = this.ctx;
    // Distant Earth with heavy parallax, fixed high in the sky.
    const ex = this.W * 0.8 - this.cam.x * 0.015;
    const ey = this.H * 0.19 + this.cam.y * 0.01;
    const r = Math.min(this.W, this.H) * 0.115;

    // Atmospheric scattering halo (two layers: soft cyan + tighter blue).
    let glow = ctx.createRadialGradient(ex, ey, r * 0.82, ex, ey, r * 2.1);
    glow.addColorStop(0, "rgba(95,165,255,0.34)");
    glow.addColorStop(0.5, "rgba(80,150,255,0.10)");
    glow.addColorStop(1, "rgba(80,150,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, r * 2.1, 0, 6.2831);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, 6.2831);
    ctx.clip();
    if (this.earthImg) {
      const s = (r * 2) / Math.min(this.earthImg.width, this.earthImg.height);
      const w = this.earthImg.width * s;
      const h = this.earthImg.height * s;
      ctx.drawImage(this.earthImg, ex - w / 2, ey - h / 2, w, h);
    } else {
      // Procedural blue marble fallback.
      const og = ctx.createRadialGradient(ex - r * 0.32, ey - r * 0.32, r * 0.1, ex, ey, r);
      og.addColorStop(0, "#8fc2ff");
      og.addColorStop(0.5, "#2f6fc0");
      og.addColorStop(1, "#0e2c5e");
      ctx.fillStyle = og;
      ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(120,200,150,0.55)";
      ctx.beginPath();
      ctx.ellipse(ex - r * 0.2, ey + r * 0.1, r * 0.5, r * 0.3, 0.4, 0, 6.2831);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + r * 0.4, ey - r * 0.4, r * 0.3, r * 0.22, -0.5, 0, 6.2831);
      ctx.fill();
      // Soft cloud swirls.
      ctx.fillStyle = "rgba(235,245,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(ex + r * 0.1, ey + r * 0.45, r * 0.45, r * 0.16, -0.3, 0, 6.2831);
      ctx.fill();
    }
    // Day-side specular sheen toward the sun (upper-left).
    const sheen = ctx.createRadialGradient(
      ex - r * 0.42, ey - r * 0.42, r * 0.05,
      ex - r * 0.42, ey - r * 0.42, r * 1.3);
    sheen.addColorStop(0, "rgba(255,255,255,0.16)");
    sheen.addColorStop(0.4, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
    // Terminator: night falls toward the lower-right, with a warm sunset rim.
    const term = ctx.createLinearGradient(ex - r * 0.7, ey - r * 0.7, ex + r, ey + r);
    term.addColorStop(0, "rgba(0,0,10,0)");
    term.addColorStop(0.5, "rgba(2,4,16,0.10)");
    term.addColorStop(0.66, "rgba(20,10,4,0.18)");   // dusk warmth
    term.addColorStop(0.78, "rgba(0,0,12,0.55)");
    term.addColorStop(1, "rgba(0,0,8,0.9)");
    ctx.fillStyle = term;
    ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
    ctx.restore();

    // Bright atmospheric limb on the sunlit edge.
    ctx.save();
    ctx.lineWidth = Math.max(1, r * 0.03);
    const limb = ctx.createLinearGradient(ex - r, ey - r, ex + r, ey + r);
    limb.addColorStop(0, "rgba(170,210,255,0.9)");
    limb.addColorStop(0.5, "rgba(120,180,255,0.25)");
    limb.addColorStop(1, "rgba(120,180,255,0)");
    ctx.strokeStyle = limb;
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, 6.2831);
    ctx.stroke();
    ctx.restore();
  };

  // ---- Terrain --------------------------------------------------------------
  Renderer.prototype._drawTerrain = function () {
    const ctx = this.ctx;
    const t = this.terrain;
    const left = this.cam.x - (this.W / 2) / this.cam.scale - 40;
    const right = this.cam.x + (this.W / 2) / this.cam.scale + 40;
    const i0 = Math.max(0, Math.floor(left / t.step));
    const i1 = Math.min(t.points.length - 1, Math.ceil(right / t.step));

    ctx.beginPath();
    ctx.moveTo(this._sx(t.points[i0].x), this.H + 4);
    for (let i = i0; i <= i1; i++) {
      ctx.lineTo(this._sx(t.points[i].x), this._sy(t.points[i].y));
    }
    ctx.lineTo(this._sx(t.points[i1].x), this.H + 4);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, this._sy(t.padHeight + 220), 0, this.H);
    g.addColorStop(0, "#6b6e78");
    g.addColorStop(0.32, "#494d57");
    g.addColorStop(0.7, "#2c2f38");
    g.addColorStop(1, "#15171e");
    ctx.fillStyle = g;
    ctx.fill();

    // Earthshine — a faint cool fill light on the regolith from the bright Earth.
    ctx.save();
    ctx.clip();
    const es = ctx.createLinearGradient(0, this._sy(t.padHeight + 160), 0, this.H);
    es.addColorStop(0, "rgba(90,120,180,0.10)");
    es.addColorStop(1, "rgba(90,120,180,0)");
    ctx.fillStyle = es;
    ctx.fillRect(0, 0, this.W, this.H);

    // Regolith grain: scattered lit/dark specks on the front face.
    for (const sp of this.specks) {
      if (sp.x < left || sp.x > right) continue;
      const gx = this._sx(sp.x);
      const gy = this._sy(t.heightAt(sp.x) - sp.depth);
      const rr = sp.r * Math.max(0.5, this.cam.scale * 0.7);
      if (rr < 0.4) continue;
      if (sp.tone > 0.5) {
        ctx.globalAlpha = (sp.tone - 0.5) * 0.5;
        ctx.fillStyle = "#d7dbe6";        // sunlit pebble
      } else {
        ctx.globalAlpha = (0.5 - sp.tone) * 0.6;
        ctx.fillStyle = "#0b0c11";        // tiny pit / shadow
      }
      ctx.beginPath();
      ctx.arc(gx, gy, rr, 0, 6.2831);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Sun-lit rim: brightness tracks how each segment faces the sun.
    for (let i = i0; i < i1; i++) {
      const ax = this._sx(t.points[i].x),     ay = this._sy(t.points[i].y);
      const bx = this._sx(t.points[i + 1].x), by = this._sy(t.points[i + 1].y);
      const slope = t.slopeAt(t.points[i].x);
      // World-space up-normal of the segment, dotted with the sun direction.
      const lit = U.clamp(-Math.sin(slope) * SUN.x + Math.cos(slope) * SUN.y, 0, 1);
      ctx.strokeStyle = "rgba(248,244,236," + (0.18 + lit * 0.6) + ")";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Craters with sun-lit rims and shadowed floors (light from upper-left).
    ctx.save();
    for (const cr of t.craters) {
      if (cr.x < left || cr.x > right) continue;
      const cx = this._sx(cr.x);
      const cy = this._sy(cr.y);
      const rr = cr.r * this.cam.scale;
      if (rr < 1.5) continue;
      // Shadowed bowl interior.
      const bowl = ctx.createRadialGradient(
        cx + rr * 0.35, cy + rr * 0.2, rr * 0.1, cx, cy + rr * 0.15, rr);
      bowl.addColorStop(0, "rgba(4,5,8,0.66)");
      bowl.addColorStop(1, "rgba(4,5,8,0)");
      ctx.fillStyle = bowl;
      ctx.beginPath();
      ctx.ellipse(cx, cy + rr * 0.22, rr, rr * 0.5, 0, 0, 6.2831);
      ctx.fill();
      // Sunlit upper-left rim arc.
      ctx.strokeStyle = "rgba(232,236,246,0.5)";
      ctx.lineWidth = Math.max(1, rr * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx, cy + rr * 0.1, rr, rr * 0.46, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // Soft shadowed lower-right rim.
      ctx.strokeStyle = "rgba(2,3,6,0.5)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + rr * 0.28, rr, rr * 0.46, 0, Math.PI * 0.08, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype._drawPad = function () {
    const ctx = this.ctx;
    const t = this.terrain;
    const padY = t.padHeight;
    const x0 = t.padCenterX - t.padHalfWidth;
    const x1 = t.padCenterX + t.padHalfWidth;
    const sx0 = this._sx(x0);
    const sx1 = this._sx(x1);
    const sy = this._sy(padY);
    const cx = this._sx(t.padCenterX);
    const pulse = 0.5 + 0.5 * Math.sin((this._t || 0) * 3);

    // Soft floodlit landing zone glow above the pad.
    const zone = ctx.createLinearGradient(0, sy - 60, 0, sy);
    zone.addColorStop(0, "rgba(79,210,255,0)");
    zone.addColorStop(1, "rgba(79,210,255," + (0.06 + pulse * 0.05) + ")");
    ctx.fillStyle = zone;
    ctx.fillRect(sx0, sy - 60, sx1 - sx0, 60);

    // Pad surface bar with a lit leading edge.
    ctx.fillStyle = "rgba(46,52,66,0.95)";
    ctx.fillRect(sx0, sy - 2, sx1 - sx0, 5);
    ctx.fillStyle = "rgba(150,170,200,0.5)";
    ctx.fillRect(sx0, sy - 2, sx1 - sx0, 1);

    // Center cross / target marker with a faint ring.
    ctx.strokeStyle = "rgba(79,210,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 12, sy);
    ctx.lineTo(cx + 12, sy);
    ctx.stroke();
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.beginPath();
    ctx.arc(cx, sy - 1, 9, Math.PI, 6.2831);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Blinking beacon lights at the pad edges.
    const blink = (Math.sin((this._t || 0) * 6) > 0);
    for (const lx of [sx0, sx1]) {
      ctx.fillStyle = blink ? "#5cf59a" : "rgba(70,240,138,0.25)";
      ctx.beginPath();
      ctx.arc(lx, sy - 5, 3.4, 0, 6.2831);
      ctx.fill();
      if (blink) {
        ctx.shadowColor = "#46f08a";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(lx, sy - 5, 2, 0, 6.2831);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Stacked chevrons on both shoulders, pointing up toward the pad.
    ctx.strokeStyle = "rgba(255,182,72,0.85)";
    ctx.lineWidth = 2;
    for (const dir of [-1, 1]) {
      const ex = dir < 0 ? sx0 - 9 : sx1 + 9;
      for (let i = 0; i < 3; i++) {
        const off = i * 8;
        ctx.beginPath();
        ctx.moveTo(ex - 6, sy - off - 4);
        ctx.lineTo(ex, sy - off - 10);
        ctx.lineTo(ex + 6, sy - off - 4);
        ctx.stroke();
      }
    }
  };

  // ---- Lander vector art ----------------------------------------------------
  Renderer.prototype._drawLander = function () {
    const ctx = this.ctx;
    const l = this.lander;
    const sx = this._sx(l.x);
    const sy = this._sy(l.y);
    // Scale the lander with zoom but keep it readable.
    const s = U.clamp(this.cam.scale * 1.0, 0.16, 0.9);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(l.angle);          // tilt; feet at origin
    ctx.scale(s, s);

    // --- Engine plume (drawn first, beneath the vehicle) ---
    if (l.thrust > 0) this._drawFlame(l.effThrottle);

    // --- Landing legs ---
    ctx.strokeStyle = "#c9ccd6";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * 9, -34);
      ctx.lineTo(dir * 30, -2);
      ctx.moveTo(dir * 30, -2);
      ctx.lineTo(dir * 24, 2);   // foot pad
      ctx.lineTo(dir * 36, 2);
      ctx.stroke();
      // strut
      ctx.beginPath();
      ctx.moveTo(dir * 14, -22);
      ctx.lineTo(dir * 28, -3);
      ctx.stroke();
    }

    // --- Descent stage (octagonal gold-foil body) ---
    ctx.beginPath();
    ctx.moveTo(-22, -34);
    ctx.lineTo(22, -34);
    ctx.lineTo(28, -56);
    ctx.lineTo(22, -78);
    ctx.lineTo(-22, -78);
    ctx.lineTo(-28, -56);
    ctx.closePath();
    const body = ctx.createLinearGradient(-28, 0, 28, 0);
    body.addColorStop(0, "#7c5d28");
    body.addColorStop(0.4, "#d9b25a");
    body.addColorStop(0.52, "#f4d889");
    body.addColorStop(0.62, "#caa24f");
    body.addColorStop(1, "#6b521f");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "#3a2f14";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crinkled gold-foil highlights.
    ctx.strokeStyle = "rgba(255,236,176,0.5)";
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12 - 3, -36);
      ctx.lineTo(i * 12 + 2, -56);
      ctx.lineTo(i * 12 - 2, -76);
      ctx.stroke();
    }
    // Foil panel seams.
    ctx.strokeStyle = "rgba(60,48,20,0.5)";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, -34);
      ctx.lineTo(i * 12, -78);
      ctx.stroke();
    }

    // --- Engine bell ---
    ctx.beginPath();
    ctx.moveTo(-10, -34);
    ctx.lineTo(10, -34);
    ctx.lineTo(7, -16);
    ctx.lineTo(-7, -16);
    ctx.closePath();
    const bell = ctx.createLinearGradient(0, -34, 0, -16);
    bell.addColorStop(0, "#aab0bd");
    bell.addColorStop(0.5, "#6c7280");
    bell.addColorStop(1, "#3a3f4c");
    ctx.fillStyle = bell;
    ctx.fill();
    ctx.strokeStyle = "#2a2e38";
    ctx.stroke();
    // Dark throat.
    ctx.fillStyle = "rgba(8,9,13,0.7)";
    ctx.beginPath();
    ctx.ellipse(0, -33, 6, 1.6, 0, 0, 6.2831);
    ctx.fill();

    // --- Ascent module ---
    ctx.beginPath();
    ctx.moveTo(-16, -78);
    ctx.lineTo(16, -78);
    ctx.lineTo(12, -100);
    ctx.lineTo(-12, -100);
    ctx.closePath();
    const cabin = ctx.createLinearGradient(-16, 0, 16, 0);
    cabin.addColorStop(0, "#aeb4c0");
    cabin.addColorStop(0.5, "#e2e6ee");
    cabin.addColorStop(1, "#9098a6");
    ctx.fillStyle = cabin;
    ctx.fill();
    ctx.strokeStyle = "#5a5f6b";
    ctx.stroke();

    // High-gain antenna dish.
    ctx.strokeStyle = "#aab0bd";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(20, -86); ctx.lineTo(28, -94);
    ctx.stroke();
    ctx.fillStyle = "rgba(210,220,235,0.85)";
    ctx.beginPath();
    ctx.ellipse(29, -95, 4.5, 2.4, -0.6, 0, 6.2831);
    ctx.fill();

    // Window.
    ctx.fillStyle = "#16455f";
    ctx.beginPath();
    ctx.arc(0, -90, 4.5, 0, 6.2831);
    ctx.fill();
    ctx.strokeStyle = "#9fdcff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Sun glint in the glass.
    ctx.fillStyle = "rgba(220,245,255,0.85)";
    ctx.beginPath();
    ctx.arc(-1.4, -91.4, 1.2, 0, 6.2831);
    ctx.fill();

    // Flag / roundel accents.
    ctx.fillStyle = "#ff4d5e";
    ctx.fillRect(-20, -60, 6, 6);
    ctx.fillStyle = "#4fd2ff";
    ctx.fillRect(14, -60, 6, 6);

    // RCS thruster nubs (top corners).
    ctx.fillStyle = "#9aa0ad";
    ctx.fillRect(-18, -98, 4, 5);
    ctx.fillRect(14, -98, 4, 5);

    // --- Coherent lighting passes over the whole vehicle ---
    // Sun rim light on the upper-left silhouette.
    ctx.strokeStyle = "rgba(255,246,224,0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-28, -56);
    ctx.lineTo(-22, -78);
    ctx.lineTo(-16, -78);
    ctx.lineTo(-12, -100);
    ctx.stroke();
    // Cool earthshine fill down the right flank.
    ctx.strokeStyle = "rgba(120,160,220,0.28)";
    ctx.beginPath();
    ctx.moveTo(28, -56);
    ctx.lineTo(22, -78);
    ctx.lineTo(16, -78);
    ctx.lineTo(12, -100);
    ctx.stroke();

    ctx.restore();
  };

  Renderer.prototype._drawFlame = function (intensity) {
    const ctx = this.ctx;
    const flick = 0.82 + Math.random() * 0.36;
    const len = (40 + intensity * 140) * flick;
    const w = 9 + intensity * 7;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Nozzle bloom.
    const bloom = ctx.createRadialGradient(0, -18, 0, 0, -18, w * 1.8);
    bloom.addColorStop(0, "rgba(200,225,255,0.85)");
    bloom.addColorStop(1, "rgba(150,190,255,0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(0, -18, w * 1.8, 0, 6.2831);
    ctx.fill();
    // Outer plume.
    let g = ctx.createLinearGradient(0, -16, 0, -16 + len);
    g.addColorStop(0, "rgba(120,200,255,0.95)");
    g.addColorStop(0.3, "rgba(150,180,255,0.6)");
    g.addColorStop(1, "rgba(120,160,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, -16);
    ctx.quadraticCurveTo(-w * 0.5, -16 + len * 0.6, 0, -16 + len);
    ctx.quadraticCurveTo(w * 0.5, -16 + len * 0.6, w, -16);
    ctx.closePath();
    ctx.fill();
    // Inner core.
    g = ctx.createLinearGradient(0, -16, 0, -16 + len * 0.62);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.6, "rgba(210,235,255,0.7)");
    g.addColorStop(1, "rgba(180,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, -16);
    ctx.quadraticCurveTo(0, -16 + len * 0.5, 0, -16 + len * 0.62);
    ctx.quadraticCurveTo(0, -16 + len * 0.5, w * 0.45, -16);
    ctx.closePath();
    ctx.fill();
    // Mach shock diamonds along the core.
    ctx.fillStyle = "rgba(235,245,255,0.8)";
    const diamonds = 3;
    for (let i = 1; i <= diamonds; i++) {
      const dy = -16 + (len * 0.5) * (i / (diamonds + 1));
      const dw = w * 0.32 * (1 - i / (diamonds + 2));
      ctx.beginPath();
      ctx.ellipse(0, dy, dw, dw * 1.6, 0, 0, 6.2831);
      ctx.fill();
    }
    ctx.restore();
  };

  // ---- Particles ------------------------------------------------------------
  Renderer.prototype._updateParticles = function (dt, opts) {
    const l = this.lander;
    const groundH = this.terrain.heightAt(l.x);
    const alt = l.y - groundH;

    // Spawn exhaust particles from the engine when thrusting.
    if (l.thrust > 0 && !opts.frozen) {
      const n = Math.round(l.effThrottle * 4);
      for (let i = 0; i < n; i++) {
        const ang = l.angle + Math.PI; // downward along body
        const spread = (Math.random() - 0.5) * 0.5;
        const spd = 60 + Math.random() * 90;
        const ex = l.x + Math.sin(l.angle) * 4;
        const ey = l.y - 6;
        this.exhaust.push({
          x: ex, y: ey,
          vx: Math.sin(ang + spread) * spd * 0.3 + l.vx,
          vy: Math.cos(ang + spread) * -spd + l.vy,
          life: 1, age: 0, max: 0.5 + Math.random() * 0.4,
          r: 2 + Math.random() * 3,
        });
      }
      // Regolith dust when low over the surface.
      if (alt < 70) {
        const blow = (1 - alt / 70) * l.effThrottle;
        const m = Math.round(blow * 5);
        for (let i = 0; i < m; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.dust.push({
            x: l.x + side * (4 + Math.random() * 8),
            y: groundH + 1,
            vx: side * (20 + Math.random() * 50),
            vy: 6 + Math.random() * 16,
            age: 0, max: 0.6 + Math.random() * 0.6,
            r: 1.5 + Math.random() * 2.5,
          });
        }
      }
    }

    // RCS attitude-thruster puffs: a short cold-gas jet fires from the upper
    // body whenever a rotation command is held.
    if (l.rcs && !opts.frozen) {
      const upX = Math.sin(l.angle), upY = Math.cos(l.angle);       // body "up"
      const rightX = Math.cos(l.angle), rightY = -Math.sin(l.angle); // body "right"
      const side = l.rcs > 0 ? -1 : 1;  // jet fires opposite the turn direction
      for (let i = 0; i < 2; i++) {
        const up = 7 + Math.random() * 2;   // m above the feet (near the top)
        const out = 3 + Math.random() * 2;  // m to the side
        const spd = 16 + Math.random() * 14;
        this.rcsPuffs.push({
          x: l.x + upX * up + rightX * side * out,
          y: l.y + upY * up + rightY * side * out,
          vx: rightX * side * spd + l.vx * 0.5,
          vy: rightY * side * spd + l.vy * 0.5,
          age: 0, max: 0.28 + Math.random() * 0.22,
          r: 1 + Math.random() * 1.4,
        });
      }
    }

    const step = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.age += dt;
        if (p.age >= p.max) { arr.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= CONFIG.MOON_GRAVITY * 0.5 * dt; // light gravity on particles
      }
    };
    if (!opts.frozen) { step(this.exhaust); step(this.dust); step(this.rcsPuffs); }
  };

  // Soft pool of light where the plume scours the surface on final approach.
  Renderer.prototype._drawGroundGlow = function () {
    const l = this.lander;
    if (!l || l.thrust <= 0) return;
    const groundH = this.terrain.heightAt(l.x);
    const alt = l.y - groundH;
    if (alt < 0 || alt > 80) return;
    const ctx = this.ctx;
    const gx = this._sx(l.x);
    const gy = this._sy(groundH);
    const k = (1 - alt / 80) * l.effThrottle;
    const rr = (26 + 40 * l.effThrottle) * this.cam.scale;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
    g.addColorStop(0, "rgba(190,220,255," + (0.5 * k) + ")");
    g.addColorStop(0.5, "rgba(140,180,255," + (0.18 * k) + ")");
    g.addColorStop(1, "rgba(140,180,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, gy, rr, rr * 0.42, 0, 0, 6.2831);
    ctx.fill();
    ctx.restore();
  };

  Renderer.prototype._drawParticles = function () {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.exhaust) {
      const a = 1 - p.age / p.max;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = a > 0.5 ? "#eaf4ff" : "#7fb0ff";
      ctx.beginPath();
      ctx.arc(this._sx(p.x), this._sy(p.y), p.r * this.cam.scale * 1.2, 0, 6.2831);
      ctx.fill();
    }
    // RCS cold-gas puffs — faint white wisps.
    for (const p of this.rcsPuffs) {
      const a = 1 - p.age / p.max;
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = "#eaf4ff";
      ctx.beginPath();
      ctx.arc(this._sx(p.x), this._sy(p.y), p.r * this.cam.scale * 1.1, 0, 6.2831);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    for (const p of this.dust) {
      const a = 1 - p.age / p.max;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#b3a89a";            // warm lunar regolith
      ctx.beginPath();
      ctx.arc(this._sx(p.x), this._sy(p.y), p.r * this.cam.scale, 0, 6.2831);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // ---- Approach guidance vector --------------------------------------------
  Renderer.prototype._drawApproachVector = function (opts) {
    if (opts.frozen) return;
    const ctx = this.ctx;
    const l = this.lander;
    const sx = this._sx(l.x);
    const sy = this._sy(l.y);
    // Velocity vector (scaled), classic flight-director cue.
    const vlen = 0.9;
    const ex = sx + l.vx * vlen;
    const ey = sy - l.vy * vlen;
    ctx.strokeStyle = "rgba(255,182,72,0.85)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,182,72,0.9)";
    ctx.beginPath();
    ctx.arc(ex, ey, 2.4, 0, 6.2831);
    ctx.fill();

    // Downrange guide to the pad center (horizontal tick at lander altitude).
    const padSX = this._sx(this.terrain.padCenterX);
    ctx.strokeStyle = "rgba(79,210,255,0.35)";
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(padSX, sy);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // ---- Flight-path trail ----------------------------------------------------
  // During flight: a short fading breadcrumb behind the lander.
  // On the results screen (review): the full path, segments coloured by speed.
  Renderer.prototype._drawTrail = function (opts) {
    const path = opts.path;
    if (!path || path.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (opts.review) {
      ctx.lineWidth = 2;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const spd = b.s;
        ctx.strokeStyle = spd > 20 ? "#ff4d5e" : spd > 8 ? "#ffb648" : "#46f08a";
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(this._sx(a.x), this._sy(a.y));
        ctx.lineTo(this._sx(b.x), this._sy(b.y));
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "#78c8ff";
      const N = Math.min(path.length, 60);
      const start = path.length - N;
      for (let i = start + 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        ctx.globalAlpha = 0.05 + ((i - start) / N) * 0.35;
        ctx.beginPath();
        ctx.moveTo(this._sx(a.x), this._sy(a.y));
        ctx.lineTo(this._sx(b.x), this._sy(b.y));
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // ---- Predicted touchdown indicator ---------------------------------------
  Renderer.prototype._drawPredictor = function (opts) {
    const p = opts.predict;
    if (!p) return;
    const ctx = this.ctx;
    const col = p.good ? "#46f08a" : p.safe ? "#ffb648" : "#ff4d5e";

    // Dotted predicted trajectory arc.
    if (p.points && p.points.length > 1) {
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = p.safe ? "rgba(70,240,138,0.45)" : "rgba(255,77,94,0.5)";
      ctx.beginPath();
      for (let i = 0; i < p.points.length; i++) {
        const X = this._sx(p.points[i].x), Y = this._sy(p.points[i].y);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Impact marker: ringed crosshair on the surface.
    const mx = this._sx(p.x), my = this._sy(p.y);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, 6.2831);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 12, my); ctx.lineTo(mx - 3, my);
    ctx.moveTo(mx + 3, my); ctx.lineTo(mx + 12, my);
    ctx.stroke();
    ctx.font = "11px 'Share Tech Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.95;
    ctx.fillText(p.descend.toFixed(1) + " m/s", mx, my - 12);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // ---- Cinematic vignette ---------------------------------------------------
  Renderer.prototype._drawVignette = function () {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      this.W * 0.5, this.H * 0.46, Math.min(this.W, this.H) * 0.34,
      this.W * 0.5, this.H * 0.5, Math.max(this.W, this.H) * 0.75);
    g.addColorStop(0, "rgba(2,4,10,0)");
    g.addColorStop(1, "rgba(2,4,10,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  };

  global.ARTEMIS.Renderer = Renderer;
})(window);
