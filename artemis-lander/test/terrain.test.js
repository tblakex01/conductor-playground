import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS } from "./harness.js";

const Terrain = ARTEMIS.Terrain;

function makeTerrain(overrides) {
  return new Terrain(Object.assign(
    { roughness: 1, padHalfWidth: 26, padCenterX: 2100, seed: 12345 },
    overrides || {}
  ));
}

// ---- generation ----------------------------------------------------------
test("points array is generated and non-empty", () => {
  const t = makeTerrain();
  assert.ok(Array.isArray(t.points));
  assert.ok(t.points.length > 0);
});

test("each point is a {x, y} with numeric coordinates", () => {
  const t = makeTerrain();
  for (const p of t.points) {
    assert.equal(typeof p.x, "number");
    assert.equal(typeof p.y, "number");
    assert.ok(Number.isFinite(p.x));
    assert.ok(Number.isFinite(p.y));
  }
});

test("points are spaced by step and start at x=0", () => {
  const t = makeTerrain();
  assert.equal(t.points[0].x, 0);
  assert.equal(t.points[1].x - t.points[0].x, t.step);
});

test("padHeight is set to a finite number", () => {
  const t = makeTerrain();
  assert.equal(typeof t.padHeight, "number");
  assert.ok(Number.isFinite(t.padHeight));
});

test("craters array is generated", () => {
  const t = makeTerrain();
  assert.ok(Array.isArray(t.craters));
  for (const c of t.craters) {
    assert.ok(Number.isFinite(c.x));
    assert.ok(Number.isFinite(c.y));
    assert.ok(c.r > 0);
  }
});

test("craters avoid the immediate pad neighborhood", () => {
  const t = makeTerrain();
  for (const c of t.craters) {
    assert.ok(Math.abs(c.x - t.padCenterX) >= t.padHalfWidth * 3);
  }
});

// ---- heightAt ------------------------------------------------------------
test("heightAt returns a finite number", () => {
  const t = makeTerrain();
  for (const x of [0, 500, 2100, 4000, t.width]) {
    const h = t.heightAt(x);
    assert.equal(typeof h, "number");
    assert.ok(Number.isFinite(h));
  }
});

test("heightAt at an exact sample x equals that point's y", () => {
  const t = makeTerrain();
  // pick a sample point away from the pad and its ramp
  const p = t.points[40]; // x = 400
  assert.ok(Math.abs(t.heightAt(p.x) - p.y) < 1e-6);
});

test("heightAt interpolates between two samples", () => {
  const t = makeTerrain();
  const a = t.points[40];
  const b = t.points[41];
  const mid = t.heightAt((a.x + b.x) / 2);
  const expected = (a.y + b.y) / 2;
  assert.ok(Math.abs(mid - expected) < 1e-6);
});

test("heightAt clamps x below 0 without throwing", () => {
  const t = makeTerrain();
  const h = t.heightAt(-9999);
  assert.ok(Number.isFinite(h));
  assert.ok(Math.abs(h - t.points[0].y) < 1e-6);
});

test("heightAt clamps x beyond width without throwing", () => {
  const t = makeTerrain();
  const h = t.heightAt(t.width + 9999);
  assert.ok(Number.isFinite(h));
});

// ---- landing pad flatness ------------------------------------------------
test("landing pad is flat around padCenterX", () => {
  const t = makeTerrain();
  const left = t.heightAt(t.padCenterX - 10);
  const right = t.heightAt(t.padCenterX + 10);
  assert.ok(Math.abs(left - right) < 1e-6, `pad not flat: ${left} vs ${right}`);
});

test("pad height equals padHeight at center", () => {
  const t = makeTerrain();
  assert.ok(Math.abs(t.heightAt(t.padCenterX) - t.padHeight) < 1e-6);
});

// ---- isOnPad -------------------------------------------------------------
test("isOnPad is true at pad center", () => {
  const t = makeTerrain();
  assert.equal(t.isOnPad(t.padCenterX), true);
});

test("isOnPad is true at pad edges", () => {
  const t = makeTerrain();
  assert.equal(t.isOnPad(t.padCenterX - t.padHalfWidth), true);
  assert.equal(t.isOnPad(t.padCenterX + t.padHalfWidth), true);
});

test("isOnPad is false far from the pad", () => {
  const t = makeTerrain();
  assert.equal(t.isOnPad(t.padCenterX + 1000), false);
});

test("isOnPad is false just outside the pad", () => {
  const t = makeTerrain();
  assert.equal(t.isOnPad(t.padCenterX + t.padHalfWidth + 0.001), false);
});

// ---- slopeAt -------------------------------------------------------------
test("slopeAt returns a finite number (radians)", () => {
  const t = makeTerrain();
  for (const x of [0, 500, 2100, 4000]) {
    const s = t.slopeAt(x);
    assert.equal(typeof s, "number");
    assert.ok(Number.isFinite(s));
  }
});

test("slope on the flat pad is approximately 0", () => {
  const t = makeTerrain();
  assert.ok(Math.abs(t.slopeAt(t.padCenterX)) < 1e-6);
});

// ---- determinism ---------------------------------------------------------
test("same seed produces identical points", () => {
  const a = makeTerrain({ seed: 555 });
  const b = makeTerrain({ seed: 555 });
  assert.equal(a.points.length, b.points.length);
  for (let i = 0; i < a.points.length; i++) {
    assert.equal(a.points[i].x, b.points[i].x);
    assert.equal(a.points[i].y, b.points[i].y);
  }
});

test("different seeds produce different profiles", () => {
  const a = makeTerrain({ seed: 1 });
  const b = makeTerrain({ seed: 2 });
  let anyDifferent = false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i].y !== b.points[i].y) { anyDifferent = true; break; }
  }
  assert.ok(anyDifferent, "different seeds should yield different terrain");
});

test("higher roughness yields more craters", () => {
  const low = makeTerrain({ roughness: 0.5, seed: 9 });
  const high = makeTerrain({ roughness: 1.55, seed: 9 });
  // craterCount = round(10 + roughness*8); high should generate >= low candidates.
  assert.ok(high.craters.length >= low.craters.length);
});
