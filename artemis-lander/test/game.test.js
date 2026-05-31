import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, freshGame, resetStore } from "./harness.js";

const { U, CONFIG } = ARTEMIS;

// ---- helpers --------------------------------------------------------------

// Place the lander on the ground at x with the given kinematics, then run the
// real landing evaluation directly.
function evalAt(g, x, { vy = -1, vx = 0, angle = 0 } = {}) {
  g.lander.x = x;
  g.lander.y = g.terrain.heightAt(x);
  g.lander.vy = vy;
  g.lander.vx = vx;
  g.lander.angle = angle;
  g.lander.landed = false;
  g._evaluateLanding();
  return g.result;
}

// Find an x that is OFF the pad but on gentle ground (|slope| <= 12 deg).
function findGentleOffPad(g) {
  const t = g.terrain;
  for (let x = 60; x < CONFIG.WORLD.width - 60; x += 7) {
    if (t.isOnPad(x)) continue;
    if (Math.abs(U.deg(t.slopeAt(x))) <= 12) return x;
  }
  return null;
}

// Find an x off the pad with a steep slope (> 12 deg) for hazardous-terrain crash.
function findSteepOffPad(g) {
  const t = g.terrain;
  for (let x = 60; x < CONFIG.WORLD.width - 60; x += 3) {
    if (t.isOnPad(x)) continue;
    if (Math.abs(U.deg(t.slopeAt(x))) > 12) return x;
  }
  return null;
}

// ---- start() --------------------------------------------------------------

test("start('commander') initialises a flying mission", () => {
  const g = freshGame();
  g.start("commander");
  assert.equal(g.state, "flying");
  assert.equal(g.diffKey, "commander");
  assert.ok(g.terrain, "terrain created");
  assert.ok(g.lander, "lander created");
  assert.ok(g.limits, "limits created");
  assert.deepEqual(g.path, []);
  assert.equal(g.predict, null);
  assert.equal(g.met, 0);
  assert.equal(g.cmdThrottle, 0);
  assert.equal(g.shake, 0);
  assert.equal(g.result, null);
  assert.equal(g.phaseLabel, "BRAKING");
  assert.equal(g._pathTimer, 0);
  assert.equal(g._gphTimer, 0);
  assert.equal(g.telemetry.samples.length, 0);
});

test("start applies per-difficulty limit/scale branches", () => {
  const g = freshGame();
  const L = CONFIG.LIMITS;

  g.start("cadet");
  assert.equal(g.diffKey, "cadet");
  assert.equal(g.limits.maxTilt, CONFIG.DIFFICULTY.cadet.tilt);
  assert.ok(Math.abs(g.limits.safeVy - L.safeVy * CONFIG.DIFFICULTY.cadet.limitScale) < 1e-9);

  g.start("commander");
  assert.equal(g.limits.maxTilt, CONFIG.DIFFICULTY.commander.tilt);
  assert.ok(Math.abs(g.limits.safeVy - L.safeVy * 1.0) < 1e-9);

  g.start("ace");
  assert.equal(g.limits.maxTilt, CONFIG.DIFFICULTY.ace.tilt);
  assert.ok(Math.abs(g.limits.safeVy - L.safeVy * CONFIG.DIFFICULTY.ace.limitScale) < 1e-9);
});

test("start defaults diffKey when omitted", () => {
  const g = freshGame();
  g.start("ace");
  g.start();
  assert.equal(g.diffKey, "ace");
});

test("on() registers callbacks and start fires onStart", () => {
  const g = freshGame();
  let started = 0;
  g.on("onStart", () => { started++; });
  g.start("commander");
  assert.equal(started, 1);
  g.start("commander");
  assert.equal(started, 2);
});

// ---- _action --------------------------------------------------------------

test("_action pause toggles flying<->paused", () => {
  const g = freshGame();
  g.start("commander");
  g._action("pause");
  assert.equal(g.state, "paused");
  g._action("pause");
  assert.equal(g.state, "flying");
});

test("_action restart calls start again", () => {
  const g = freshGame();
  g.start("commander");
  g.met = 5;
  g._action("restart");
  assert.equal(g.state, "flying");
  assert.equal(g.met, 0);
});

test("_action restart works from ended state", () => {
  const g = freshGame();
  g.start("commander");
  evalAt(g, g.terrain.padCenterX, { vy: -50 }); // crash -> ended
  assert.equal(g.state, "ended");
  g._action("restart");
  assert.equal(g.state, "flying");
});

test("_action cut sets cmdThrottle 0 while flying", () => {
  const g = freshGame();
  g.start("commander");
  g.cmdThrottle = 0.8;
  g._action("cut");
  assert.equal(g.cmdThrottle, 0);
});

test("_action setThrottle clamps value", () => {
  const g = freshGame();
  g.start("commander");
  g._action("setThrottle", 2);
  assert.equal(g.cmdThrottle, 1);
  g._action("setThrottle", -1);
  assert.equal(g.cmdThrottle, 0);
  g._action("setThrottle", 0.5);
  assert.equal(g.cmdThrottle, 0.5);
});

test("_action ignored when not flying (returns early)", () => {
  const g = freshGame();
  g.start("commander");
  evalAt(g, g.terrain.padCenterX, { vy: -50 }); // ended
  assert.equal(g.state, "ended");
  g.cmdThrottle = 0.42;
  g._action("cut");          // ignored because state !== flying
  assert.equal(g.cmdThrottle, 0.42);
  g._action("setThrottle", 0.9);
  assert.equal(g.cmdThrottle, 0.42);
});

test("setPaused and onPause callback", () => {
  const g = freshGame();
  const seen = [];
  g.on("onPause", (p) => seen.push(p));
  g.start("commander");
  g.setPaused(true);
  assert.equal(g.state, "paused");
  g.setPaused(false);
  assert.equal(g.state, "flying");
  assert.deepEqual(seen, [true, false]);
  // No-ops: pausing when not flying, resuming when not paused.
  g.setPaused(false);
  assert.equal(g.state, "flying");
  g.state = "ended";
  g.setPaused(true);
  assert.equal(g.state, "ended");
});

// ---- _physics -------------------------------------------------------------

test("_physics advances time and runs steps", () => {
  const g = freshGame();
  g.start("commander");
  const t0 = g.met;
  for (let i = 0; i < 5; i++) g._physics(1 / 120);
  assert.ok(g.met > t0);
});

test("_physics phase label: BRAKING / APPROACH / TERMINAL", () => {
  const g = freshGame();
  g.start("commander");
  const x = g.lander.x;
  const base = g.terrain.heightAt(x);

  g.lander.y = base + 800;
  g._physics(1 / 120);
  assert.equal(g.phaseLabel, "BRAKING");

  g.lander.y = base + 300;
  g._physics(1 / 120);
  assert.equal(g.phaseLabel, "APPROACH");

  g.lander.y = base + 100;
  g._physics(1 / 120);
  assert.equal(g.phaseLabel, "TERMINAL");
});

test("_physics clamps horizontal position to world bounds", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.y = g.terrain.heightAt(g.lander.x) + 800; // high up, no contact
  g.lander.x = 999999;
  g.lander.vx = 0;
  g._physics(1 / 120);
  assert.ok(g.lander.x <= CONFIG.WORLD.width - 30);

  g.lander.x = -999999;
  g._physics(1 / 120);
  assert.ok(g.lander.x >= 30);
});

test("_physics triggers landing evaluation on ground contact", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.x = g.terrain.padCenterX;
  g.lander.y = g.terrain.heightAt(g.lander.x) - 5; // below ground
  g.lander.vy = -1;
  g.lander.vx = 0;
  g.lander.angle = 0;
  g._physics(1 / 120);
  assert.equal(g.state, "ended");
  assert.ok(g.result);
});

// ---- _evaluateLanding: crashes -------------------------------------------

test("crash: excessive descent rate", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -50, vx: 0, angle: 0 });
  assert.equal(r.success, false);
  assert.match(r.grade, /FAILURE/);
  assert.equal(r.score, 0);
  assert.equal(g.state, "ended");
  assert.match(r.message, /descent/);
  assert.ok(r.record);
});

test("crash: excessive lateral velocity", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -1, vx: 50, angle: 0 });
  assert.equal(r.success, false);
  assert.match(r.message, /lateral/);
});

test("crash: bad tilt", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -1, vx: 0, angle: U.rad(80) });
  assert.equal(r.success, false);
  assert.match(r.message, /attitude/);
});

test("crash: hazardous terrain off pad", () => {
  resetStore();
  const g = freshGame();
  g.start("ace");
  const x = findSteepOffPad(g);
  assert.ok(x != null, "found a steep off-pad spot");
  const r = evalAt(g, x, { vy: -0.5, vx: 0, angle: 0 });
  assert.equal(r.success, false);
  assert.match(r.message, /hazardous terrain/);
});

// ---- _evaluateLanding: successes -----------------------------------------

test("success off-pad -> SAFE — OFF TARGET", () => {
  resetStore();
  const g = freshGame();
  g.start("cadet"); // generous limits
  const x = findGentleOffPad(g);
  assert.ok(x != null, "found a gentle off-pad spot");
  const r = evalAt(g, x, { vy: -1.0, vx: 0, angle: 0 });
  assert.equal(r.success, true);
  assert.equal(r.grade, "★ SAFE — OFF TARGET");
  assert.ok(r.score > 0);
  assert.ok(r.record);
});

test("success on-pad (non-perfect) -> ON-TARGET grade", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  // perfectVy = 1.4, safeVy = 3.2 -> vy 2.0 is safe but not perfect.
  const r = evalAt(g, g.terrain.padCenterX, { vy: -2.0, vx: 0, angle: 0 });
  assert.equal(r.success, true);
  assert.equal(r.grade, "★★ ON-TARGET");
  assert.ok(r.score > 0);
});

test("precision on-pad -> PRECISION LANDING with perfect bonus", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -0.5, vx: 0, angle: 0 });
  assert.equal(r.success, true);
  assert.match(r.grade, /PRECISION LANDING/);
  // Recompute the no-bonus score and confirm the +1200 perfect bonus applied.
  const l = g.lander;
  const lim = g.limits;
  const t = g.terrain;
  const descend = 0.5;
  const fuelFrac = l.fuel / l.fuel0;
  const softness = 1 - U.clamp(descend / lim.safeVy, 0, 1);
  const lateral = 1;
  const upright = 1;
  const accuracy = 1 - U.clamp(0 / t.padHalfWidth, 0, 1);
  const base = 1000 + fuelFrac * 1600 + softness * 700 + lateral * 500 +
    upright * 400 + (600 + accuracy * 600);
  const diffMult = 1.35;
  const expectWith = Math.round((base + 1200) * diffMult);
  assert.equal(r.score, expectWith);
});

test("recordResult marks a new personal best", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -0.5, vx: 0, angle: 0 });
  assert.equal(r.record.newRecord, true);
  assert.equal(r.record.prevBest, 0);
  // Store now holds the new best for this difficulty.
  assert.ok(ARTEMIS.Store.getRecord("commander").bestScore > 0);
  assert.equal(ARTEMIS.Store.getRecord("commander").bestScore, r.score);
});

// ---- _computePrediction ---------------------------------------------------

test("_computePrediction returns null when thrusting up beats gravity", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.thrust = g.lander.mass() * 5;
  g.lander.angle = 0;
  assert.equal(g._computePrediction(), null);
});

test("_computePrediction returns null when lander already landed", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.landed = true;
  assert.equal(g._computePrediction(), null);
});

test("_computePrediction ballistic touchdown returns object with points", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.thrust = 0;
  g.lander.angle = 0;
  // Place high and centred over the pad, descending gently -> SAFE/GOOD.
  g.lander.x = g.terrain.padCenterX;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 600;
  g.lander.vx = 0;
  g.lander.vy = -1;
  const p = g._computePrediction();
  assert.ok(p, "prediction object returned");
  assert.equal(typeof p.x, "number");
  assert.equal(typeof p.descend, "number");
  assert.ok(Array.isArray(p.points) && p.points.length > 0);
  assert.equal(typeof p.safe, "boolean");
  assert.equal(typeof p.good, "boolean");
});

test("_computePrediction predicts UNSAFE for a fast descent", () => {
  const g = freshGame();
  g.start("ace");
  g.lander.thrust = 0;
  g.lander.angle = 0;
  g.lander.x = g.terrain.padCenterX;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 900;
  g.lander.vx = 0;
  g.lander.vy = -40;
  const p = g._computePrediction();
  assert.ok(p);
  assert.equal(p.safe, false);
  assert.equal(p.good, false);
});

test("_computePrediction predicts GOOD for a soft on-pad approach", () => {
  const g = freshGame();
  g.start("cadet");
  // Near-hover: thrust just below weight so it settles onto the pad gently,
  // keeping the predicted descent rate within the perfect limit.
  g.lander.angle = 0;
  g.lander.thrust = g.lander.mass() * CONFIG.MOON_GRAVITY * 0.98;
  g.lander.x = g.terrain.padCenterX;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 4;
  g.lander.vx = 0;
  g.lander.vy = 0;
  const p = g._computePrediction();
  assert.ok(p);
  assert.equal(p.onPad, true);
  assert.equal(p.safe, true);
  assert.equal(p.good, true);
});

// ---- _postFrame -----------------------------------------------------------

test("_postFrame grows path and telemetry samples over time", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.y = g.terrain.heightAt(g.lander.x) + 800; // keep airborne
  const p0 = g.path.length;
  const s0 = g.telemetry.samples.length;
  for (let i = 0; i < 10; i++) g._postFrame(0.2);
  assert.ok(g.path.length > p0, "path grew");
  assert.ok(g.telemetry.samples.length > s0, "telemetry grew");
});

test("_postFrame caps path length at 600", () => {
  const g = freshGame();
  g.start("commander");
  g.lander.y = g.terrain.heightAt(g.lander.x) + 800;
  // Force path beyond cap then run one more sample.
  for (let i = 0; i < 600; i++) g.path.push({ x: 0, y: 0, s: 0 });
  g._postFrame(0.2);
  assert.ok(g.path.length <= 600);
});

test("_postFrame predict null when predict setting off", () => {
  const g = freshGame();
  g.start("commander");
  g.settings.predict = false;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 800;
  g._postFrame(0.2);
  assert.equal(g.predict, null);
  g.settings.predict = true;
});

// ---- _loop ----------------------------------------------------------------

test("_loop drives physics/render/postframe while flying", () => {
  const g = freshGame();
  g.start("commander");
  g._last = 0;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 900;
  assert.doesNotThrow(() => { g._loop(16); g._loop(32); });
});

test("_loop in ended/paused state takes the audio-off branch", () => {
  const g = freshGame();
  g.start("commander");
  evalAt(g, g.terrain.padCenterX, { vy: -50 }); // ended
  assert.doesNotThrow(() => { g._loop(48); });
  g.start("commander");
  g.setPaused(true);
  assert.doesNotThrow(() => { g._loop(64); });
});

test("_loop clamps large dt and decays shake", () => {
  const g = freshGame();
  g.start("commander");
  g.shake = 1;
  g._last = 0;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 900;
  g._loop(500); // dt would be 0.5 -> clamped to 0.1
  assert.ok(g.shake < 1);
});

// ---- _spawnDebris ---------------------------------------------------------

test("_spawnDebris adds dust on crash", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const d0 = g.renderer.dust.length;
  evalAt(g, g.terrain.padCenterX, { vy: -50 });
  assert.ok(g.renderer.dust.length > d0, "dust grew after crash");
});

// ---- _stats ---------------------------------------------------------------

test("_stats produces the labelled stats array", () => {
  resetStore();
  const g = freshGame();
  g.start("commander");
  const r = evalAt(g, g.terrain.padCenterX, { vy: -1.0, vx: 0, angle: 0 });
  const labels = r.stats.map((s) => s.label);
  assert.deepEqual(labels, [
    "DESCENT RATE", "LATERAL VEL", "TILT", "FUEL LEFT", "ON PAD", "MISSION TIME",
  ]);
  assert.equal(r.stats.find((s) => s.label === "ON PAD").value, "YES");
});
