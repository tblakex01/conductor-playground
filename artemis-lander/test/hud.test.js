import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, freshGame } from "./harness.js";

const U = ARTEMIS.U;

// Build a started game with a real HUD bound to DOM elements.
function started() {
  const g = freshGame();
  g.start("commander");
  return g;
}

// Helper: place the lander at a chosen altitude above ground.
function setAlt(g, altMeters) {
  g.lander.y = g.terrain.heightAt(g.lander.x) + altMeters;
}

// Helper: read the resolved .readout__value classList for a span.
function valClass(span) {
  const v = span.closest(".readout__value") || span.parentElement;
  return v.classList;
}

test("HUD constructor binds all DOM elements and starts with masterOn false", () => {
  const g = started();
  const e = g.hud.el;
  const keys = [
    "met", "phase", "alt", "vy", "vx", "range", "tilt",
    "fuelPct", "fuelKg", "fuelBar", "thrPct", "thrust", "thrBar",
    "mass", "adiBall", "cwMaster", "cwFuel", "cwVel", "cwTilt", "cwProx",
  ];
  for (const k of keys) assert.ok(e[k], "bound element: " + k);
  assert.equal(typeof g.hud.masterOn, "boolean");
});

test("update() runs without throwing and writes telemetry text", () => {
  const g = started();
  // Put it in a benign, high-altitude, slow state.
  setAlt(g, 1000);
  g.lander.vy = -1;
  g.lander.vx = 0.2;
  g.lander.angle = U.rad(1);
  g.lander.fuel = g.lander.fuel0;
  assert.doesNotThrow(() => g.hud.update(g));
  const e = g.hud.el;
  assert.equal(e.alt.textContent, 1000);
  assert.equal(e.vy.textContent, "-1.0");
  assert.equal(e.vx.textContent, "0.2");
  assert.ok(e.fuelKg.textContent !== "");
  assert.ok(e.mass.textContent !== "");
});

test("update() formats tilt: near-zero shows 0, otherwise rounded degrees", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.angle = U.rad(0.01); // |deg| < 0.05 -> 0
  g.hud.update(g);
  assert.equal(g.hud.el.tilt.textContent, 0);

  g.lander.angle = U.rad(5);
  g.hud.update(g);
  assert.equal(g.hud.el.tilt.textContent, "5");
});

test("update() downrange formatting: positive gets a + prefix, negative does not", () => {
  const g = started();
  g.lander.x = g.terrain.padCenterX + 50;
  setAlt(g, 1000);
  g.hud.update(g);
  assert.ok(g.hud.el.range.textContent.startsWith("+"));

  g.lander.x = g.terrain.padCenterX - 50;
  setAlt(g, 1000);
  g.hud.update(g);
  assert.ok(!g.hud.el.range.textContent.startsWith("+"));
});

// ---- Descent-rate colour tiers --------------------------------------------
test("descent rate tier: danger when -vy > safeVy", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = -(g.limits.safeVy + 2); // strongly descending
  g.lander.vx = 0;
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vy).contains("is-danger"));
});

test("descent rate tier: warn when between perfectVy and safeVy", () => {
  const g = started();
  setAlt(g, 1000);
  const mid = (g.limits.perfectVy + g.limits.safeVy) / 2;
  g.lander.vy = -mid;
  g.lander.vx = 0;
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vy).contains("is-warn"));
});

test("descent rate tier: ok when below perfectVy", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = -(g.limits.perfectVy * 0.5);
  g.lander.vx = 0;
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vy).contains("is-ok"));
});

// ---- Lateral velocity tiers ------------------------------------------------
test("lateral velocity tier: danger when |vx| > safeVx", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = g.limits.safeVx + 2;
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vx).contains("is-danger"));
});

test("lateral velocity tier: warn when between perfectVx and safeVx", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = -((g.limits.perfectVx + g.limits.safeVx) / 2); // negative magnitude
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vx).contains("is-warn"));
});

test("lateral velocity tier: ok when below perfectVx", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = g.limits.perfectVx * 0.4;
  g.lander.angle = 0;
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.vx).contains("is-ok"));
});

// ---- Attitude tiers --------------------------------------------------------
test("attitude tier: danger when |deg| > maxTilt", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = 0;
  g.lander.angle = U.rad(g.limits.maxTilt + 5);
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.tilt).contains("is-danger"));
});

test("attitude tier: warn when |deg| > maxTilt*0.55", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = 0;
  g.lander.angle = U.rad(-(g.limits.maxTilt * 0.7)); // between 0.55 and 1.0
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.tilt).contains("is-warn"));
});

test("attitude tier: ok when small tilt", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0;
  g.lander.vx = 0;
  g.lander.angle = U.rad(g.limits.maxTilt * 0.1);
  g.hud.update(g);
  assert.ok(valClass(g.hud.el.tilt).contains("is-ok"));
});

// ---- Fuel gauge tiers ------------------------------------------------------
test("fuel gauge: danger styling when fpct <= 10", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0 * 0.05; // 5%
  g.hud.update(g);
  assert.ok(g.hud.el.fuelBar.classList.contains("is-danger"));
  assert.ok(!g.hud.el.fuelBar.classList.contains("is-warn"));
  assert.equal(g.hud.el.fuelPct.textContent, 5);
});

test("fuel gauge: warn styling when 10 < fpct <= 25", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0 * 0.20; // 20%
  g.hud.update(g);
  assert.ok(g.hud.el.fuelBar.classList.contains("is-warn"));
  assert.ok(!g.hud.el.fuelBar.classList.contains("is-danger"));
});

test("fuel gauge: neither warn nor danger when fpct high", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0; // 100%
  g.hud.update(g);
  assert.ok(!g.hud.el.fuelBar.classList.contains("is-warn"));
  assert.ok(!g.hud.el.fuelBar.classList.contains("is-danger"));
  assert.equal(g.hud.el.fuelPct.textContent, 100);
});

test("fuel bar width clamps to 0-100%", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.fuel = g.lander.fuel0 * 2; // overfull -> clamps to 100
  g.hud.update(g);
  assert.equal(g.hud.el.fuelBar.style.width, "100%");
  g.lander.fuel = -50; // negative -> clamps to 0
  g.hud.update(g);
  assert.equal(g.hud.el.fuelBar.style.width, "0%");
});

// ---- Caution & warning lights ---------------------------------------------
test("CW fuel light: warn (is-on) when lowFuel and not critical", () => {
  const g = started();
  setAlt(g, 1000); // high so no prox/master from altitude
  g.lander.vy = 0; g.lander.vx = 0; g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0 * 0.12; // 12% -> lowFuel(<=15) but not crit(<=6)
  g.hud.update(g);
  assert.ok(g.hud.el.cwFuel.classList.contains("is-on"));
  assert.ok(!g.hud.el.cwFuel.classList.contains("is-crit"));
});

test("CW fuel light: critical (is-crit) when critFuel", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0 * 0.04; // 4% -> critFuel(<=6)
  g.hud.update(g);
  assert.ok(g.hud.el.cwFuel.classList.contains("is-crit"));
  assert.ok(!g.hud.el.cwFuel.classList.contains("is-on"));
  // critFuel forces the master alarm on.
  assert.equal(g.hud.masterOn, true);
  assert.ok(g.hud.el.cwMaster.classList.contains("is-on"));
});

test("CW velocity light: warn tier and fast tier", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.angle = 0; g.lander.fuel = g.lander.fuel0;
  // warn: descent between perfect and safe
  g.lander.vy = -((g.limits.perfectVy + g.limits.safeVy) / 2);
  g.lander.vx = 0;
  g.hud.update(g);
  assert.ok(g.hud.el.cwVel.classList.contains("is-on"));
  assert.ok(!g.hud.el.cwVel.classList.contains("is-crit"));
  // fast: descent over safe -> crit
  g.lander.vy = -(g.limits.safeVy + 3);
  g.hud.update(g);
  assert.ok(g.hud.el.cwVel.classList.contains("is-crit"));
});

test("CW tilt light: warn tier and bad tier", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.fuel = g.lander.fuel0;
  // warn tilt: > maxTilt*0.55 but <= maxTilt
  g.lander.angle = U.rad(g.limits.maxTilt * 0.7);
  g.hud.update(g);
  assert.ok(g.hud.el.cwTilt.classList.contains("is-on"));
  assert.ok(!g.hud.el.cwTilt.classList.contains("is-crit"));
  // bad tilt: > maxTilt
  g.lander.angle = U.rad(g.limits.maxTilt + 5);
  g.hud.update(g);
  assert.ok(g.hud.el.cwTilt.classList.contains("is-crit"));
});

test("CW proximity light: on when alt<90 and fast-ish", () => {
  const g = started();
  setAlt(g, 50); // < 90
  g.lander.angle = 0; g.lander.fuel = g.lander.fuel0;
  g.lander.vx = 0;
  g.lander.vy = -(g.limits.safeVy * 0.9); // > safeVy*0.8 -> prox true
  g.hud.update(g);
  assert.ok(g.hud.el.cwProx.classList.contains("is-on"));
  // prox light never has a critical tier.
  assert.ok(!g.hud.el.cwProx.classList.contains("is-crit"));
});

test("CW proximity light: off when high altitude even if fast", () => {
  const g = started();
  setAlt(g, 1000); // >= 90
  g.lander.angle = 0; g.lander.fuel = g.lander.fuel0;
  g.lander.vx = 0;
  g.lander.vy = -(g.limits.safeVy * 0.9);
  g.hud.update(g);
  assert.ok(!g.hud.el.cwProx.classList.contains("is-on"));
});

test("master alarm: on when alt<200 and fast velocity (no crit fuel)", () => {
  const g = started();
  setAlt(g, 150); // < 200
  g.lander.angle = 0; g.lander.fuel = g.lander.fuel0;
  g.lander.vx = 0;
  g.lander.vy = -(g.limits.safeVy + 3); // fastVel
  g.hud.update(g);
  assert.equal(g.hud.masterOn, true);
  assert.ok(g.hud.el.cwMaster.classList.contains("is-on"));
});

test("master alarm: on when alt<200 and bad tilt", () => {
  const g = started();
  setAlt(g, 150);
  g.lander.vy = 0; g.lander.vx = 0; g.lander.fuel = g.lander.fuel0;
  g.lander.angle = U.rad(g.limits.maxTilt + 5); // badTilt
  g.hud.update(g);
  assert.equal(g.hud.masterOn, true);
});

test("master alarm: stays off in a clean, high & slow state", () => {
  const g = started();
  setAlt(g, 1000); // >= 200
  g.lander.vy = -0.5; g.lander.vx = 0.1;
  g.lander.angle = U.rad(0.5);
  g.lander.fuel = g.lander.fuel0;
  g.hud.update(g);
  assert.equal(g.hud.masterOn, false);
  assert.ok(!g.hud.el.cwMaster.classList.contains("is-on"));
});

test("master alarm: off when fast but altitude >= 200", () => {
  const g = started();
  setAlt(g, 500); // >= 200, so no master from velocity
  g.lander.vy = -(g.limits.safeVy + 3); // fast
  g.lander.vx = 0;
  g.lander.angle = 0;
  g.lander.fuel = g.lander.fuel0;
  g.hud.update(g);
  assert.equal(g.hud.masterOn, false);
});

// ---- clearAlarms -----------------------------------------------------------
test("clearAlarms() clears all CW lights and master", () => {
  const g = started();
  // Drive everything hot first.
  setAlt(g, 40);
  g.lander.vy = -(g.limits.safeVy + 5);
  g.lander.vx = g.limits.safeVx + 5;
  g.lander.angle = U.rad(g.limits.maxTilt + 10);
  g.lander.fuel = g.lander.fuel0 * 0.02;
  g.hud.update(g);
  assert.equal(g.hud.masterOn, true);

  g.hud.clearAlarms();
  assert.equal(g.hud.masterOn, false);
  const e = g.hud.el;
  for (const x of [e.cwFuel, e.cwVel, e.cwTilt, e.cwProx]) {
    assert.ok(!x.classList.contains("is-on"));
    assert.ok(!x.classList.contains("is-crit"));
  }
  assert.ok(!e.cwMaster.classList.contains("is-on"));
});

// ---- Phase / MET passthrough ----------------------------------------------
test("update() passes through MET and phase label to DOM", () => {
  const g = started();
  setAlt(g, 1000);
  g.met = 75; // 01:15.0
  g.phaseLabel = "TOUCHDOWN";
  g.hud.update(g);
  assert.equal(g.hud.el.met.textContent, U.formatMET(75));
  assert.equal(g.hud.el.met.textContent, "01:15.0");
  assert.equal(g.hud.el.phase.textContent, "TOUCHDOWN");
});

test("update() writes throttle gauge from effThrottle and thrust", () => {
  const g = started();
  setAlt(g, 1000);
  g.lander.effThrottle = 0.5;
  g.lander.thrust = 9000;
  g.hud.update(g);
  assert.equal(g.hud.el.thrPct.textContent, 50);
  assert.equal(g.hud.el.thrBar.style.width, "50%");
  assert.equal(g.hud.el.thrust.textContent, "9.0");
});
