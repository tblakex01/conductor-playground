/* ============================================================
   ARTEMIS · Real-time telemetry strip chart
   Draws a compact two-zone graph on its own canvas: altitude
   (area) above, descent rate (line) below with a dashed "safe"
   threshold. Sampled at a fixed cadence by the game loop.
   ============================================================ */
(function (global) {
  "use strict";

  function Telemetry(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.samples = [];        // [{ alt, vy }]
    this.maxN = 320;          // ~32 s at a 0.1 s cadence
    this.dpr = 1;
    this.W = 0; this.H = 0;
    if (canvas) this.resize();
  }

  Telemetry.prototype.resize = function () {
    if (!this.canvas) return;
    const c = this.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = c.clientWidth;
    this.H = c.clientHeight;
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  Telemetry.prototype.reset = function () { this.samples.length = 0; };

  Telemetry.prototype.sample = function (alt, vy) {
    this.samples.push({ alt: alt, vy: vy });
    if (this.samples.length > this.maxN) this.samples.shift();
  };

  Telemetry.prototype.draw = function (limits) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.W, H = this.H, pad = 8;
    ctx.clearRect(0, 0, W, H);

    // Panel background + border (matches HUD panels).
    rr(ctx, 0.5, 0.5, W - 1, H - 1, 8);
    ctx.fillStyle = "rgba(8,16,28,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(86,196,255,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const splitY = pad + (H - 2 * pad) * 0.55;
    const topH = splitY - pad;
    const botY0 = splitY + 4;
    const botH = (H - pad) - botY0;

    ctx.strokeStyle = "rgba(127,155,179,0.18)";
    ctx.beginPath(); ctx.moveTo(pad, splitY); ctx.lineTo(W - pad, splitY); ctx.stroke();

    ctx.font = "9px 'Share Tech Mono', ui-monospace, monospace";
    ctx.fillStyle = "#7f9bb3";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("ALTITUDE m", pad + 2, pad + 1);
    ctx.fillText("DESCENT m/s", pad + 2, botY0 + 1);

    const s = this.samples, n = s.length;
    if (n < 2) return;

    const safeVy = limits ? limits.safeVy : 3;
    let maxAlt = 50, maxDesc = safeVy * 1.6;
    for (let i = 0; i < n; i++) {
      if (s[i].alt > maxAlt) maxAlt = s[i].alt;
      const d = Math.max(0, -s[i].vy);
      if (d > maxDesc) maxDesc = d;
    }

    const xAt = (i) => pad + (W - 2 * pad) * (i / (this.maxN - 1));

    // --- Altitude area ---
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i), y = pad + topH - (s[i].alt / maxAlt) * topH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(xAt(n - 1), pad + topH);
    ctx.lineTo(xAt(0), pad + topH);
    ctx.closePath();
    const ag = ctx.createLinearGradient(0, pad, 0, pad + topH);
    ag.addColorStop(0, "rgba(79,210,255,0.35)");
    ag.addColorStop(1, "rgba(79,210,255,0.02)");
    ctx.fillStyle = ag; ctx.fill();
    ctx.strokeStyle = "#4fd2ff"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(i), y = pad + topH - (s[i].alt / maxAlt) * topH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --- Descent rate line + safe threshold ---
    const sy = botY0 + botH - (safeVy / maxDesc) * botH;
    ctx.strokeStyle = "rgba(255,77,94,0.5)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad, sy); ctx.lineTo(W - pad, sy); ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = Math.max(0, -s[i].vy);
      const x = xAt(i), y = botY0 + botH - (d / maxDesc) * botH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const cur = Math.max(0, -s[n - 1].vy);
    const perfectVy = limits ? limits.perfectVy : 1.2;
    ctx.strokeStyle = cur > safeVy ? "#ff4d5e" : (cur > perfectVy ? "#ffb648" : "#46f08a");
    ctx.stroke();

    // Current values.
    ctx.textAlign = "right"; ctx.fillStyle = "#dff1ff";
    ctx.fillText(String(Math.round(s[n - 1].alt)), W - pad - 2, pad + 1);
    ctx.fillText(cur.toFixed(1), W - pad - 2, botY0 + 1);
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.ARTEMIS = global.ARTEMIS || {};
  global.ARTEMIS.Telemetry = Telemetry;
})(window);
