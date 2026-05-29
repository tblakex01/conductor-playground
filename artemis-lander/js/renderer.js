/* ============================================================
   ARTEMIS · Canvas renderer
   Starfield, Earth (NASA imagery w/ fallback), lunar terrain,
   vector lander with throttle-driven exhaust, RCS puffs, and
   regolith dust. Auto-zooming camera follows the descent.
   ============================================================ */
(function (global) {
  "use strict";

  const { U, CONFIG } = global.ARTEMIS;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = 0;
    this.H = 0;

    this.cam = { x: 0, y: 0, scale: 1 };
    this.camTarget = { x: 0, y: 0, scale: 1 };

    this.stars = [];
    this.exhaust = [];   // engine plume particles
    this.dust = [];      // regolith kicked up near surface
    this.rcsPuffs = [];
    this.earthImg = null;

    this.terrain = null;
    this.lander = null;

    this.resize();
    this._makeStars();

    U.loadFirstImage(CONFIG.ASSETS.earth).then((img) => { this.earthImg = img; });
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
    this.stars = [];
    for (let i = 0; i < 320; i++) {
      this.stars.push({
        x: rng() * 2600 - 300,
        y: rng() * 1400 - 200,
        r: rng() * 1.3 + 0.2,
        a: rng() * 0.7 + 0.2,
        tw: rng() * 6.28,
      });
    }
  };

  Renderer.prototype.setScene = function (terrain, lander) {
    this.terrain = terrain;
    this.lander = lander;
    this.exhaust.length = 0;
    this.dust.length = 0;
    this.rcsPuffs.length = 0;
    // Snap camera immediately.
    this._computeCamTarget();
    this.cam.x = this.camTarget.x;
    this.cam.y = this.camTarget.y;
    this.cam.scale = this.camTarget.scale;
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

    // Clear and paint the background in the untransformed frame so that the
    // clearRect/background fill always cover the full canvas. Impact shake is
    // applied only to the scene on top, avoiding uncleared bands at the edges.
    ctx.clearRect(0, 0, this.W, this.H);
    this._drawSky();

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
    this._updateParticles(dt, opts);
    this._drawParticles();
    this._drawLander();
    this._drawApproachVector(opts);

    if (shake > 0) ctx.restore();
  };

  // ---- Background -----------------------------------------------------------
  Renderer.prototype._drawSky = function () {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#02040a");
    g.addColorStop(0.55, "#040810");
    g.addColorStop(1, "#070d18");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  };

  Renderer.prototype._drawStars = function (dt) {
    const ctx = this.ctx;
    const px = -this.cam.x * 0.04;
    const py = this.cam.y * 0.04;
    this._t = (this._t || 0) + dt;
    for (const s of this.stars) {
      let x = ((s.x + px) % this.W + this.W) % this.W;
      let y = ((s.y + py) % this.H + this.H) % this.H;
      const tw = 0.6 + 0.4 * Math.sin(this._t * 2 + s.tw);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = "#cfe8ff";
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, 6.2831);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype._drawEarth = function () {
    const ctx = this.ctx;
    // Distant Earth with heavy parallax, fixed high in the sky.
    const ex = this.W * 0.78 - this.cam.x * 0.015;
    const ey = this.H * 0.2 + this.cam.y * 0.01;
    const r = Math.min(this.W, this.H) * 0.11;

    // Glow halo
    const glow = ctx.createRadialGradient(ex, ey, r * 0.7, ex, ey, r * 1.9);
    glow.addColorStop(0, "rgba(90,160,255,0.30)");
    glow.addColorStop(1, "rgba(90,160,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ex, ey, r * 1.9, 0, 6.2831);
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
      const og = ctx.createRadialGradient(ex - r * 0.3, ey - r * 0.3, r * 0.1, ex, ey, r);
      og.addColorStop(0, "#7fb8ff");
      og.addColorStop(0.5, "#2f6fc0");
      og.addColorStop(1, "#10336a");
      ctx.fillStyle = og;
      ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(120,200,150,0.55)";
      ctx.beginPath();
      ctx.ellipse(ex - r * 0.2, ey + r * 0.1, r * 0.5, r * 0.3, 0.4, 0, 6.2831);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ex + r * 0.4, ey - r * 0.4, r * 0.3, r * 0.22, -0.5, 0, 6.2831);
      ctx.fill();
    }
    // Terminator shading.
    const term = ctx.createLinearGradient(ex - r, ey, ex + r, ey);
    term.addColorStop(0, "rgba(0,0,10,0)");
    term.addColorStop(0.62, "rgba(0,0,10,0.1)");
    term.addColorStop(1, "rgba(0,0,10,0.78)");
    ctx.fillStyle = term;
    ctx.fillRect(ex - r, ey - r, r * 2, r * 2);
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

    const g = ctx.createLinearGradient(0, this._sy(t.padHeight + 200), 0, this.H);
    g.addColorStop(0, "#5a5e68");
    g.addColorStop(0.4, "#3b3f48");
    g.addColorStop(1, "#191b22");
    ctx.fillStyle = g;
    ctx.fill();

    // Sunlit rim highlight.
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = this._sx(t.points[i].x);
      const y = this._sy(t.points[i].y);
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(210,220,235,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Craters.
    ctx.save();
    for (const cr of t.craters) {
      if (cr.x < left || cr.x > right) continue;
      const cx = this._sx(cr.x);
      const cy = this._sy(cr.y);
      const rr = cr.r * this.cam.scale;
      if (rr < 1.5) continue;
      ctx.fillStyle = "rgba(10,11,16,0.5)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + rr * 0.25, rr, rr * 0.45, 0, 0, 6.2831);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,208,222,0.30)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy + rr * 0.1, rr, rr * 0.45, 0, Math.PI, 6.2831);
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

    // Pad surface bar.
    ctx.fillStyle = "rgba(40,46,58,0.9)";
    ctx.fillRect(sx0, sy - 2, sx1 - sx0, 4);

    // Center cross / target marker.
    const cx = this._sx(t.padCenterX);
    ctx.strokeStyle = "rgba(79,210,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, sy);
    ctx.lineTo(cx + 10, sy);
    ctx.stroke();

    // Blinking beacon lights at the pad edges.
    const blink = (Math.sin((this._t || 0) * 6) > 0);
    const lights = [sx0, sx1];
    for (const lx of lights) {
      ctx.fillStyle = blink ? "#46f08a" : "rgba(70,240,138,0.25)";
      ctx.beginPath();
      ctx.arc(lx, sy - 5, 3.2, 0, 6.2831);
      ctx.fill();
      if (blink) {
        ctx.shadowColor = "#46f08a";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(lx, sy - 5, 2, 0, 6.2831);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Chevron markers pointing to the pad.
    ctx.strokeStyle = "rgba(255,182,72,0.8)";
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      const off = i * 9;
      ctx.beginPath();
      ctx.moveTo(sx0 - 4, sy - off - 6);
      ctx.lineTo(sx0 - 4 + 6, sy - off - 12);
      ctx.lineTo(sx0 - 4 + 12, sy - off - 6);
      ctx.stroke();
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
    body.addColorStop(0, "#8a6a2f");
    body.addColorStop(0.45, "#d9b25a");
    body.addColorStop(0.55, "#f0d27e");
    body.addColorStop(1, "#7a5e2a");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "#3a2f14";
    ctx.lineWidth = 1.5;
    ctx.stroke();

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
    bell.addColorStop(0, "#9aa0ad");
    bell.addColorStop(1, "#4c5160");
    ctx.fillStyle = bell;
    ctx.fill();
    ctx.strokeStyle = "#2a2e38";
    ctx.stroke();

    // --- Ascent module ---
    ctx.beginPath();
    ctx.moveTo(-16, -78);
    ctx.lineTo(16, -78);
    ctx.lineTo(12, -100);
    ctx.lineTo(-12, -100);
    ctx.closePath();
    ctx.fillStyle = "#cdd2dc";
    ctx.fill();
    ctx.strokeStyle = "#5a5f6b";
    ctx.stroke();

    // Window
    ctx.fillStyle = "#1c5a7a";
    ctx.beginPath();
    ctx.arc(0, -90, 4.5, 0, 6.2831);
    ctx.fill();
    ctx.strokeStyle = "#8fd6ff";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ARTEMIS roundel / flag accent
    ctx.fillStyle = "#ff4d5e";
    ctx.fillRect(-20, -60, 6, 6);
    ctx.fillStyle = "#4fd2ff";
    ctx.fillRect(14, -60, 6, 6);

    // RCS thruster nubs (top corners)
    ctx.fillStyle = "#9aa0ad";
    ctx.fillRect(-18, -98, 4, 5);
    ctx.fillRect(14, -98, 4, 5);

    ctx.restore();
  };

  Renderer.prototype._drawFlame = function (intensity) {
    const ctx = this.ctx;
    const flick = 0.82 + Math.random() * 0.36;
    const len = (40 + intensity * 130) * flick;
    const w = 9 + intensity * 7;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Outer plume
    let g = ctx.createLinearGradient(0, -16, 0, -16 + len);
    g.addColorStop(0, "rgba(120,200,255,0.95)");
    g.addColorStop(0.3, "rgba(150,180,255,0.6)");
    g.addColorStop(1, "rgba(120,160,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, -16);
    ctx.lineTo(w, -16);
    ctx.lineTo(0, -16 + len);
    ctx.closePath();
    ctx.fill();
    // Inner core
    g = ctx.createLinearGradient(0, -16, 0, -16 + len * 0.6);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(180,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, -16);
    ctx.lineTo(w * 0.45, -16);
    ctx.lineTo(0, -16 + len * 0.6);
    ctx.closePath();
    ctx.fill();
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

  Renderer.prototype._drawParticles = function () {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.exhaust) {
      const a = 1 - p.age / p.max;
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = a > 0.5 ? "#dff0ff" : "#7fb0ff";
      ctx.beginPath();
      ctx.arc(this._sx(p.x), this._sy(p.y), p.r * this.cam.scale * 1.2, 0, 6.2831);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    for (const p of this.dust) {
      const a = 1 - p.age / p.max;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#b9bccb";
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

  global.ARTEMIS.Renderer = Renderer;
})(window);
