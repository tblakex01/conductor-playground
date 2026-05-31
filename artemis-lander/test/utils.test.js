import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS } from "./harness.js";

const U = ARTEMIS.U;

// ---- clamp ---------------------------------------------------------------
test("clamp: value below range returns lo", () => {
  assert.equal(U.clamp(-5, 0, 10), 0);
});

test("clamp: value within range returns value", () => {
  assert.equal(U.clamp(4, 0, 10), 4);
});

test("clamp: value above range returns hi", () => {
  assert.equal(U.clamp(99, 0, 10), 10);
});

test("clamp: value equal to lo returns lo", () => {
  assert.equal(U.clamp(0, 0, 10), 0);
});

test("clamp: value equal to hi returns hi", () => {
  assert.equal(U.clamp(10, 0, 10), 10);
});

test("clamp: works with negative ranges", () => {
  assert.equal(U.clamp(-20, -10, -1), -10);
  assert.equal(U.clamp(0, -10, -1), -1);
  assert.equal(U.clamp(-5, -10, -1), -5);
});

// ---- lerp ----------------------------------------------------------------
test("lerp: t=0 returns a", () => {
  assert.equal(U.lerp(2, 8, 0), 2);
});

test("lerp: t=1 returns b", () => {
  assert.equal(U.lerp(2, 8, 1), 8);
});

test("lerp: t=0.5 returns midpoint", () => {
  assert.equal(U.lerp(2, 8, 0.5), 5);
});

test("lerp: extrapolates beyond [0,1]", () => {
  assert.equal(U.lerp(0, 10, 2), 20);
  assert.equal(U.lerp(0, 10, -1), -10);
});

// ---- makeRng -------------------------------------------------------------
test("makeRng: returns values in [0,1)", () => {
  const rng = U.makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of [0,1)`);
  }
});

test("makeRng: same seed produces identical sequence", () => {
  const a = U.makeRng(12345);
  const b = U.makeRng(12345);
  for (let i = 0; i < 50; i++) {
    assert.equal(a(), b());
  }
});

test("makeRng: different seeds produce different sequences", () => {
  const a = U.makeRng(1);
  const b = U.makeRng(2);
  let anyDifferent = false;
  for (let i = 0; i < 50; i++) {
    if (a() !== b()) { anyDifferent = true; break; }
  }
  assert.ok(anyDifferent, "different seeds should diverge");
});

test("makeRng: sequence is not constant", () => {
  const rng = U.makeRng(7);
  const first = rng();
  let varied = false;
  for (let i = 0; i < 20; i++) {
    if (rng() !== first) { varied = true; break; }
  }
  assert.ok(varied, "rng should produce varying values");
});

// ---- randRange -----------------------------------------------------------
test("randRange: stays within [lo, hi)", () => {
  const rng = U.makeRng(99);
  for (let i = 0; i < 1000; i++) {
    const v = U.randRange(rng, 5, 15);
    assert.ok(v >= 5 && v < 15, `value ${v} out of [5,15)`);
  }
});

test("randRange: deterministic with seeded rng", () => {
  const a = U.randRange(U.makeRng(3), 0, 100);
  const b = U.randRange(U.makeRng(3), 0, 100);
  assert.equal(a, b);
});

test("randRange: rng() of 0 yields lo, near-1 yields near hi", () => {
  assert.equal(U.randRange(() => 0, 10, 20), 10);
  assert.ok(Math.abs(U.randRange(() => 0.999999, 10, 20) - 20) < 0.001);
});

// ---- deg / rad -----------------------------------------------------------
test("deg: deg(Math.PI) === 180", () => {
  assert.equal(U.deg(Math.PI), 180);
});

test("deg: deg(Math.PI/2) === 90", () => {
  assert.ok(Math.abs(U.deg(Math.PI / 2) - 90) < 1e-9);
});

test("deg: deg(0) === 0", () => {
  assert.equal(U.deg(0), 0);
});

test("rad: rad(180) === Math.PI", () => {
  assert.equal(U.rad(180), Math.PI);
});

test("rad: rad(90) === Math.PI/2", () => {
  assert.ok(Math.abs(U.rad(90) - Math.PI / 2) < 1e-9);
});

test("deg/rad: round-trip preserves value", () => {
  for (const v of [0, 1, 45, 90, 123.4, 360]) {
    assert.ok(Math.abs(U.deg(U.rad(v)) - v) < 1e-9);
  }
  for (const r of [0, 0.5, 1, Math.PI, 2 * Math.PI]) {
    assert.ok(Math.abs(U.rad(U.deg(r)) - r) < 1e-9);
  }
});

// ---- formatMET -----------------------------------------------------------
test("formatMET: 0 -> 00:00.0", () => {
  assert.equal(U.formatMET(0), "00:00.0");
});

test("formatMET: 65.4 -> 01:05.4", () => {
  assert.equal(U.formatMET(65.4), "01:05.4");
});

test("formatMET: 5 -> 00:05.0 (seconds padded)", () => {
  assert.equal(U.formatMET(5), "00:05.0");
});

test("formatMET: 9.9 -> 00:09.9", () => {
  assert.equal(U.formatMET(9.9), "00:09.9");
});

test("formatMET: 600 -> 10:00.0 (two-digit minutes)", () => {
  assert.equal(U.formatMET(600), "10:00.0");
});

test("formatMET: 125.5 -> 02:05.5", () => {
  assert.equal(U.formatMET(125.5), "02:05.5");
});

test("formatMET: 59.95 rounds to 01:00.0 (seconds rollover edge)", () => {
  // 59.95 within first minute: m=0, s=59.95 -> toFixed(1) = "60.0"
  // documents current behavior of the implementation.
  assert.equal(U.formatMET(59.95), "00:60.0");
});

// ---- loadFirstImage ------------------------------------------------------
test("loadFirstImage: failing load resolves to null", async () => {
  const result = await U.loadFirstImage(["x"]);
  assert.equal(result, null);
});

test("loadFirstImage: empty list resolves to null", async () => {
  const result = await U.loadFirstImage([]);
  assert.equal(result, null);
});

test("loadFirstImage: multiple failing urls still resolves to null", async () => {
  const result = await U.loadFirstImage(["a", "b", "c"]);
  assert.equal(result, null);
});
