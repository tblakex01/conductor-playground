/* ============================================================
   ARTEMIS · Heads-up guidance display
   Binds DOM telemetry elements and updates them each frame,
   including caution/warning logic and the attitude indicator.
   ============================================================ */
(function (global) {
  "use strict";

  const { U, CONFIG } = global.ARTEMIS;

  function HUD() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      met: $("met"),
      phase: $("phase"),
      alt: $("r-alt"),
      vy: $("r-vy"),
      vx: $("r-vx"),
      range: $("r-range"),
      tilt: $("r-tilt"),
      fuelPct: $("r-fuelpct"),
      fuelKg: $("r-fuelkg"),
      fuelBar: $("fuel-bar"),
      thrPct: $("r-thrpct"),
      thrust: $("r-thrust"),
      thrBar: $("thr-bar"),
      mass: $("r-mass"),
      adiBall: $("adi-ball"),
      cwMaster: $("cw-master"),
      cwFuel: $("cw-fuel"),
      cwVel: $("cw-vel"),
      cwTilt: $("cw-tilt"),
      cwProx: $("cw-prox"),
    };
    this.masterOn = false;   // latest master-alarm state (read by audio)
  }

  // Resolve the enclosing .readout__value container (robust to DOM nesting).
  function setState(span, cls) {
    const v = span.closest(".readout__value") || span.parentElement;
    v.classList.remove("is-warn", "is-danger", "is-ok");
    if (cls) v.classList.add(cls);
  }

  HUD.prototype.update = function (g) {
    const e = this.el;
    const l = g.lander;
    const t = g.terrain;
    const limits = g.limits;
    const groundH = t.heightAt(l.x);
    const alt = Math.max(0, l.y - groundH);
    const tiltDeg = U.deg(l.angle);
    const downrange = l.x - t.padCenterX;

    e.met.textContent = U.formatMET(g.met);
    e.phase.textContent = g.phaseLabel;

    e.alt.textContent = Math.round(alt);
    e.vy.textContent = (l.vy).toFixed(1);
    e.vx.textContent = (l.vx).toFixed(1);
    e.range.textContent = (downrange >= 0 ? "+" : "") + Math.round(downrange);
    e.tilt.textContent = (Math.abs(tiltDeg) < 0.05 ? 0 : tiltDeg.toFixed(0));

    // Descent rate colour coding.
    const descend = -l.vy; // positive when falling
    if (descend > limits.safeVy) setState(e.vy, "is-danger");
    else if (descend > limits.perfectVy) setState(e.vy, "is-warn");
    else setState(e.vy, "is-ok");

    // Lateral velocity colour.
    const ax = Math.abs(l.vx);
    if (ax > limits.safeVx) setState(e.vx, "is-danger");
    else if (ax > limits.perfectVx) setState(e.vx, "is-warn");
    else setState(e.vx, "is-ok");

    // Attitude colour.
    if (Math.abs(tiltDeg) > limits.maxTilt) setState(e.tilt, "is-danger");
    else if (Math.abs(tiltDeg) > limits.maxTilt * 0.55) setState(e.tilt, "is-warn");
    else setState(e.tilt, "is-ok");

    // Fuel gauge.
    const fpct = (l.fuel / l.fuel0) * 100;
    e.fuelPct.textContent = Math.round(fpct);
    e.fuelKg.textContent = Math.round(l.fuel);
    e.fuelBar.style.width = U.clamp(fpct, 0, 100) + "%";
    e.fuelBar.classList.toggle("is-warn", fpct <= 25 && fpct > 10);
    e.fuelBar.classList.toggle("is-danger", fpct <= 10);

    // Throttle gauge.
    const thrPct = l.effThrottle * 100;
    e.thrPct.textContent = Math.round(thrPct);
    e.thrBar.style.width = U.clamp(thrPct, 0, 100) + "%";
    e.thrust.textContent = (l.thrust / 1000).toFixed(1);

    e.mass.textContent = Math.round(l.mass());

    // Attitude director ball: counter-rotate to show horizon.
    e.adiBall.style.transform = "rotate(" + (-tiltDeg).toFixed(1) + "deg)";

    // ---- Caution & warning ----
    // Each light has a warn (amber) tier and a critical (red) tier so the
    // crew sees a trend before a hard limit is breached.
    const lowFuel = fpct <= 15;
    const critFuel = fpct <= 6;
    const fastVel = descend > limits.safeVy || ax > limits.safeVx;
    const warnVel = descend > limits.perfectVy || ax > limits.perfectVx;
    const badTilt = Math.abs(tiltDeg) > limits.maxTilt;
    const warnTilt = Math.abs(tiltDeg) > limits.maxTilt * 0.55;
    const prox = alt < 90 && (descend > limits.safeVy * 0.8 || ax > limits.safeVx * 0.8);

    toggle(e.cwFuel, lowFuel, critFuel);
    toggle(e.cwVel, warnVel, fastVel);
    toggle(e.cwTilt, warnTilt, badTilt);
    toggle(e.cwProx, prox, false);

    const master = critFuel || (alt < 200 && (fastVel || badTilt));
    e.cwMaster.classList.toggle("is-on", master);
    this.masterOn = master;
  };

  function toggle(el, on, crit) {
    el.classList.toggle("is-on", on && !crit);
    el.classList.toggle("is-crit", !!crit);
  }

  HUD.prototype.clearAlarms = function () {
    const e = this.el;
    [e.cwFuel, e.cwVel, e.cwTilt, e.cwProx].forEach((x) => {
      x.classList.remove("is-on", "is-crit");
    });
    e.cwMaster.classList.remove("is-on");
    this.masterOn = false;
  };

  global.ARTEMIS.HUD = HUD;
})(window);
