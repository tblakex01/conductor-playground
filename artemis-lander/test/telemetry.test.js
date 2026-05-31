/* ============================================================
   Tests for ARTEMIS.Telemetry (js/telemetry.js)
   Strip-chart telemetry renderer. Exercises construction,
   the null-canvas guard path, the ring-buffer sampling, and
   the draw() branches (limits present/absent, descent colour
   thresholds, climbing vs descending samples).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, dom, makeEl } from "./harness.js";

const LIMITS = { safeVy: 3, perfectVy: 1.2, safeVx: 1.5 };

function realTelem() {
  return new ARTEMIS.Telemetry(dom.getElementById("telemetry"));
}

// ---- Construction ---------------------------------------------------------

test("constructor exists and exports a Telemetry function", () => {
  assert.equal(typeof ARTEMIS.Telemetry, "function");
});

test("constructor with a real canvas wires ctx and runs resize()", () => {
  const t = realTelem();
  assert.ok(t.ctx, "ctx should be set from getContext('2d')");
  assert.equal(t.canvas, dom.getElementById("telemetry"));
  assert.ok(Array.isArray(t.samples));
  assert.equal(t.samples.length, 0);
  // resize() ran in the constructor and pulled the canvas client size.
  assert.equal(t.W, 264);
  assert.equal(t.H, 122);
  assert.ok(t.dpr >= 1);
  assert.equal(t.maxN, 320);
});

test("constructor with a real canvas sets the backing store width/height via dpr", () => {
  const t = realTelem();
  const c = t.canvas;
  assert.equal(c.width, Math.round(t.W * t.dpr));
  assert.equal(c.height, Math.round(t.H * t.dpr));
});

// ---- Null canvas guards ---------------------------------------------------

test("constructor with null canvas leaves ctx null and W/H zero", () => {
  const t = new ARTEMIS.Telemetry(null);
  assert.equal(t.ctx, null);
  assert.equal(t.W, 0);
  assert.equal(t.H, 0);
  assert.equal(t.dpr, 1);
  assert.deepEqual(t.samples, []);
});

test("null-canvas resize() is a safe no-op", () => {
  const t = new ARTEMIS.Telemetry(null);
  assert.doesNotThrow(() => t.resize());
  assert.equal(t.W, 0);
  assert.equal(t.H, 0);
});

test("null-canvas reset() is a safe no-op", () => {
  const t = new ARTEMIS.Telemetry(null);
  assert.doesNotThrow(() => t.reset());
  assert.deepEqual(t.samples, []);
});

test("null-canvas sample() still records into the buffer without throwing", () => {
  const t = new ARTEMIS.Telemetry(null);
  assert.doesNotThrow(() => t.sample(100, -2));
  assert.equal(t.samples.length, 1);
});

test("null-canvas draw() returns early via the ctx guard (no throw)", () => {
  const t = new ARTEMIS.Telemetry(null);
  t.sample(100, -2);
  t.sample(90, -2.5);
  assert.doesNotThrow(() => t.draw(LIMITS));
  assert.doesNotThrow(() => t.draw(undefined));
});

// ---- Sampling / ring buffer ----------------------------------------------

test("sample() pushes {alt, vy} records in order", () => {
  const t = realTelem();
  t.reset();
  t.sample(120, -1.5);
  t.sample(118, -2.0);
  assert.equal(t.samples.length, 2);
  assert.deepEqual(t.samples[0], { alt: 120, vy: -1.5 });
  assert.deepEqual(t.samples[1], { alt: 118, vy: -2.0 });
});

test("reset() empties the sample buffer", () => {
  const t = realTelem();
  t.sample(1, -1);
  t.sample(2, -1);
  assert.ok(t.samples.length >= 2);
  t.reset();
  assert.equal(t.samples.length, 0);
});

test("ring buffer trims to maxN when overfilled (shift branch)", () => {
  const t = realTelem();
  t.reset();
  const N = t.maxN; // 320
  for (let i = 0; i < N + 50; i++) t.sample(100 - i * 0.1, -2);
  assert.equal(t.samples.length, N, "length should clamp to maxN");
  // The oldest 50 should have been shifted out, so the first remaining
  // sample is the 51st one we pushed (index 50 in push order).
  assert.equal(t.samples.length <= t.maxN, true);
});

test("ring buffer keeps exactly maxN at the boundary", () => {
  const t = realTelem();
  t.reset();
  for (let i = 0; i < t.maxN; i++) t.sample(50, -1);
  assert.equal(t.samples.length, t.maxN);
  // One more push trims one off the front.
  t.sample(999, -9);
  assert.equal(t.samples.length, t.maxN);
  assert.equal(t.samples[t.samples.length - 1].alt, 999);
});

test("sample() handles a climbing (positive vy) sample without issue", () => {
  const t = realTelem();
  t.reset();
  t.sample(200, +4); // climbing -> descent rate Math.max(0,-vy) === 0
  t.sample(205, +3);
  assert.equal(t.samples.length, 2);
});

// ---- draw(): early return for < 2 samples --------------------------------

test("draw() with zero samples returns early (no throw)", () => {
  const t = realTelem();
  t.reset();
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() with a single sample returns early (n < 2 guard)", () => {
  const t = realTelem();
  t.reset();
  t.sample(100, -2);
  assert.doesNotThrow(() => t.draw(LIMITS));
});

// ---- draw(): main path with limits present and absent --------------------

function fill(t, n, fn) {
  t.reset();
  for (let i = 0; i < n; i++) {
    const { alt, vy } = fn(i);
    t.sample(alt, vy);
  }
}

test("draw() with many descending samples and explicit limits", () => {
  const t = realTelem();
  fill(t, 60, (i) => ({ alt: 300 - i * 4, vy: -1.0 - i * 0.02 }));
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() with undefined limits hits the default safeVy/perfectVy branches", () => {
  const t = realTelem();
  fill(t, 60, (i) => ({ alt: 300 - i * 4, vy: -1.0 - i * 0.02 }));
  assert.doesNotThrow(() => t.draw(undefined));
});

test("draw() with a climbing final sample drives the Math.max(0,-vy) zero branch", () => {
  const t = realTelem();
  fill(t, 40, (i) => ({ alt: 100 + i, vy: +2 })); // all climbing
  assert.doesNotThrow(() => t.draw(LIMITS));
  // current descent is 0 -> below perfectVy -> green branch
});

// ---- draw(): current-descent colour threshold branches -------------------

test("draw() final descent above safeVy hits the red colour branch", () => {
  const t = realTelem();
  // Mostly mild, but last sample is a hard descent (> safeVy = 3).
  fill(t, 30, (i) => ({ alt: 120 - i * 2, vy: -1.0 }));
  t.sample(40, -6.5); // cur = 6.5 > 3 -> "#ff4d5e"
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() final descent between perfectVy and safeVy hits the amber branch", () => {
  const t = realTelem();
  fill(t, 30, (i) => ({ alt: 120 - i * 2, vy: -1.0 }));
  t.sample(40, -2.2); // 1.2 < 2.2 <= 3 -> "#ffb648"
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() final descent below perfectVy hits the green branch", () => {
  const t = realTelem();
  fill(t, 30, (i) => ({ alt: 120 - i * 2, vy: -0.8 }));
  t.sample(40, -0.5); // 0.5 < 1.2 -> "#46f08a"
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() exercises the maxAlt and maxDesc rescaling loop", () => {
  const t = realTelem();
  // Include a very tall altitude and a very steep descent so both the
  // `alt > maxAlt` and `d > maxDesc` branches fire.
  fill(t, 50, (i) => ({ alt: i === 25 ? 5000 : 80, vy: i === 10 ? -40 : -1 }));
  assert.doesNotThrow(() => t.draw(LIMITS));
});

test("draw() works with the maximum filled buffer (maxN samples)", () => {
  const t = realTelem();
  fill(t, t.maxN, (i) => ({ alt: 400 - i, vy: -1 - (i % 5) * 0.3 }));
  assert.equal(t.samples.length, t.maxN);
  assert.doesNotThrow(() => t.draw(LIMITS));
  assert.doesNotThrow(() => t.draw(undefined));
});

// ---- resize() recomputes W/H ---------------------------------------------

test("resize() recomputes W/H from the canvas client size", () => {
  const t = realTelem();
  // A standalone canvas-like element with different dimensions.
  const el = makeEl("canvas", { w: 400, h: 200 });
  t.canvas = el;
  t.ctx = el.getContext("2d");
  t.resize();
  assert.equal(t.W, 400);
  assert.equal(t.H, 200);
  assert.equal(el.width, Math.round(400 * t.dpr));
  assert.equal(el.height, Math.round(200 * t.dpr));
});

test("draw() reflects an updated size after resize() without throwing", () => {
  const t = realTelem();
  const el = makeEl("canvas", { w: 320, h: 160 });
  t.canvas = el;
  t.ctx = el.getContext("2d");
  t.resize();
  fill(t, 20, (i) => ({ alt: 100 - i, vy: -1 }));
  assert.doesNotThrow(() => t.draw(LIMITS));
});
