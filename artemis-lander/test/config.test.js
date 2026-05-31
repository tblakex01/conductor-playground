import test from "node:test";
import assert from "node:assert/strict";

// On some Node versions `globalThis.navigator` is a getter-only accessor, which
// makes the harness's `globalThis.navigator = ...` assignment throw at import
// time. Redefine it as a writable data property BEFORE the harness loads, then
// pull the harness in dynamically (static imports are hoisted, so a top-level
// `import` would run before this guard).
try {
  Object.defineProperty(globalThis, "navigator", {
    value: globalThis.navigator,
    writable: true,
    configurable: true,
    enumerable: true,
  });
} catch { /* already writable — nothing to do */ }

const { ARTEMIS } = await import("./harness.js");

const CONFIG = ARTEMIS.CONFIG;

// ---- physical constants --------------------------------------------------
test("CONFIG loads and is an object", () => {
  assert.equal(typeof CONFIG, "object");
  assert.ok(CONFIG !== null);
});

test("MOON_GRAVITY is 1.62", () => {
  assert.equal(CONFIG.MOON_GRAVITY, 1.62);
});

test("G0 standard gravity is present and positive", () => {
  assert.equal(CONFIG.G0, 9.80665);
  assert.ok(CONFIG.G0 > 0);
});

// ---- VEHICLE -------------------------------------------------------------
test("VEHICLE has dryMass/maxThrust/minThrottle/isp", () => {
  const v = CONFIG.VEHICLE;
  assert.equal(typeof v, "object");
  assert.equal(typeof v.dryMass, "number");
  assert.equal(typeof v.maxThrust, "number");
  assert.equal(typeof v.minThrottle, "number");
  assert.equal(typeof v.isp, "number");
});

test("VEHICLE values are physically sane", () => {
  const v = CONFIG.VEHICLE;
  assert.ok(v.dryMass > 0);
  assert.ok(v.maxThrust > 0);
  assert.ok(v.minThrottle > 0 && v.minThrottle < 1);
  assert.ok(v.isp > 0);
});

// ---- DIFFICULTY ----------------------------------------------------------
test("DIFFICULTY has cadet, commander, and ace profiles", () => {
  const d = CONFIG.DIFFICULTY;
  assert.ok(d.cadet, "cadet present");
  assert.ok(d.commander, "commander present");
  assert.ok(d.ace, "ace present");
});

for (const name of ["cadet", "commander", "ace"]) {
  test(`DIFFICULTY.${name} has required fields`, () => {
    const p = CONFIG.DIFFICULTY[name];
    assert.equal(typeof p.fuel, "number");
    assert.equal(typeof p.limitScale, "number");
    assert.equal(typeof p.terrainRoughness, "number");
    assert.equal(typeof p.padHalfWidth, "number");
    assert.equal(typeof p.tilt, "number");
  });

  test(`DIFFICULTY.${name} fields are positive`, () => {
    const p = CONFIG.DIFFICULTY[name];
    assert.ok(p.fuel > 0);
    assert.ok(p.limitScale > 0);
    assert.ok(p.terrainRoughness > 0);
    assert.ok(p.padHalfWidth > 0);
    assert.ok(p.tilt > 0);
  });
}

test("DIFFICULTY: cadet is easier than ace (more fuel, larger pad, softer limits)", () => {
  const { cadet, ace } = CONFIG.DIFFICULTY;
  assert.ok(cadet.fuel > ace.fuel);
  assert.ok(cadet.padHalfWidth > ace.padHalfWidth);
  assert.ok(cadet.limitScale > ace.limitScale);
});

// ---- LIMITS --------------------------------------------------------------
test("LIMITS has safeVy/safeVx/perfectVy/perfectVx", () => {
  const l = CONFIG.LIMITS;
  assert.equal(typeof l.safeVy, "number");
  assert.equal(typeof l.safeVx, "number");
  assert.equal(typeof l.perfectVy, "number");
  assert.equal(typeof l.perfectVx, "number");
});

test("LIMITS: perfect thresholds are tighter than safe thresholds", () => {
  const l = CONFIG.LIMITS;
  assert.ok(l.perfectVy < l.safeVy);
  assert.ok(l.perfectVx < l.safeVx);
});

// ---- START ---------------------------------------------------------------
test("START is present with expected fields", () => {
  const s = CONFIG.START;
  assert.equal(typeof s, "object");
  assert.equal(typeof s.altitude, "number");
  assert.equal(typeof s.vy, "number");
  assert.ok(Array.isArray(s.vxRange));
  assert.equal(s.vxRange.length, 2);
});

test("START: initial descent rate is downward (negative vy)", () => {
  assert.ok(CONFIG.START.vy < 0);
});

// ---- WORLD ---------------------------------------------------------------
test("WORLD is present with width/padHalfWidth/surfaceY", () => {
  const w = CONFIG.WORLD;
  assert.equal(typeof w, "object");
  assert.equal(typeof w.width, "number");
  assert.equal(typeof w.padHalfWidth, "number");
  assert.equal(typeof w.surfaceY, "number");
  assert.ok(w.width > 0);
});

// ---- ASSETS --------------------------------------------------------------
test("ASSETS.earth is a non-empty array", () => {
  assert.ok(Array.isArray(CONFIG.ASSETS.earth));
  assert.ok(CONFIG.ASSETS.earth.length > 0);
});

test("ASSETS.earth entries are non-empty strings", () => {
  for (const url of CONFIG.ASSETS.earth) {
    assert.equal(typeof url, "string");
    assert.ok(url.length > 0);
  }
});
