/* ============================================================
   Tests for ARTEMIS.Renderer (js/renderer.js)
   The renderer draws to a mocked Canvas 2D context (all no-ops),
   so the goal is to drive every code path WITHOUT throwing while
   asserting the observable bookkeeping (camera, star/particle
   arrays). A freshGame() gives us a fully-wired terrain + lander.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, freshGame, win } from "./harness.js";

// Build a started game so the renderer has a real terrain + lander and a
// scene already snapped via setScene().
function startedGame(diff) {
  const g = freshGame();
  g.start(diff || "commander");
  return g;
}

const BASE_OPTS = { frozen: false, shake: 0, predict: null, path: null, review: false };

// Turn the descent engine on (drives _drawFlame + exhaust spawning).
function engineOn(l, throttle) {
  l.thrust = 30000;
  l.effThrottle = throttle == null ? 0.7 : throttle;
}

// ---- Construction ---------------------------------------------------------

test("Renderer is exported as a constructor", () => {
  assert.equal(typeof ARTEMIS.Renderer, "function");
});

test("construction initialises camera, star and particle arrays", () => {
  const g = startedGame();
  const r = g.renderer;
  assert.ok(r.cam && typeof r.cam.x === "number");
  assert.ok(r.camTarget && typeof r.camTarget.scale === "number");
  assert.ok(Array.isArray(r.exhaust));
  assert.ok(Array.isArray(r.dust));
  assert.ok(Array.isArray(r.rcsPuffs));
});

test("_makeStars produced a non-empty starfield", () => {
  const g = startedGame();
  assert.ok(g.renderer.stars.length > 0);
  const s = g.renderer.stars[0];
  for (const k of ["x", "y", "r", "a", "tw"]) {
    assert.equal(typeof s[k], "number");
  }
});

test("earthImg starts null so the procedural Earth fallback is used", () => {
  const g = startedGame();
  // The harness Image always fails to load -> stays null.
  assert.equal(g.renderer.earthImg, null);
});

// ---- resize ---------------------------------------------------------------

test("resize() sets W/H from the canvas and does not throw", () => {
  const g = startedGame();
  const c = g.renderer.canvas;
  assert.doesNotThrow(() => g.renderer.resize());
  assert.equal(g.renderer.W, c.clientWidth);
  assert.equal(g.renderer.H, c.clientHeight);
  assert.ok(g.renderer.dpr >= 1);
});

test("resize() honours window.devicePixelRatio (clamped to 2)", () => {
  const g = startedGame();
  const prev = win.devicePixelRatio;
  try {
    win.devicePixelRatio = 3; // should clamp to 2
    g.renderer.resize();
    assert.equal(g.renderer.dpr, 2);
    win.devicePixelRatio = 1.5;
    g.renderer.resize();
    assert.equal(g.renderer.dpr, 1.5);
  } finally {
    win.devicePixelRatio = prev;
    g.renderer.resize();
  }
});

// ---- setScene -------------------------------------------------------------

test("setScene() snaps the camera onto the lander and clears particles", () => {
  const g = startedGame();
  const r = g.renderer;
  r.exhaust.push({}); r.dust.push({}); r.rcsPuffs.push({});
  r.setScene(g.terrain, g.lander);
  assert.equal(r.exhaust.length, 0);
  assert.equal(r.dust.length, 0);
  assert.equal(r.rcsPuffs.length, 0);
  // Camera snapped exactly to the target (no smoothing on setScene).
  assert.equal(r.cam.x, r.camTarget.x);
  assert.equal(r.cam.y, r.camTarget.y);
  assert.equal(r.cam.scale, r.camTarget.scale);
});

// ---- _sx / _sy / _computeCamTarget direct -------------------------------

test("_sx / _sy map world coords to finite screen coords", () => {
  const g = startedGame();
  const r = g.renderer;
  assert.ok(Number.isFinite(r._sx(g.lander.x)));
  assert.ok(Number.isFinite(r._sy(g.lander.y)));
});

test("_computeCamTarget produces a finite, positive scale", () => {
  const g = startedGame();
  const r = g.renderer;
  r._computeCamTarget();
  assert.ok(Number.isFinite(r.camTarget.scale));
  assert.ok(r.camTarget.scale > 0);
  assert.equal(r.camTarget.x, g.lander.x);
});

test("_computeCamTarget zoom span clamps at extreme altitude", () => {
  const g = startedGame();
  const r = g.renderer;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 100000;
  r._computeCamTarget();
  assert.ok(Number.isFinite(r.camTarget.scale));
  assert.ok(r.camTarget.scale > 0);
});

// ---- render: basic flight -------------------------------------------------

test("render() in normal flight does not throw", () => {
  const g = startedGame();
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS }));
  assert.ok(g.renderer.exhaust.length >= 0);
});

test("render() with no opts argument falls back to {}", () => {
  const g = startedGame();
  assert.doesNotThrow(() => g.renderer.render(0.016));
});

test("render() advances the smoothed camera toward the target", () => {
  const g = startedGame();
  const r = g.renderer;
  g.lander.x += 400;
  const before = r.cam.x;
  r.render(0.05, { ...BASE_OPTS });
  assert.notEqual(r.cam.x, before);
});

// ---- render: engine plume + exhaust particles -----------------------------

test("render() with engine on spawns exhaust particles over several frames", () => {
  const g = startedGame();
  const r = g.renderer;
  engineOn(g.lander, 0.7);
  // High above the surface so we isolate exhaust (no dust).
  g.lander.y = g.terrain.heightAt(g.lander.x) + 500;
  for (let i = 0; i < 5; i++) {
    assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS }));
  }
  assert.ok(r.exhaust.length > 0, "engine should have spawned exhaust");
});

test("render() ages and eventually retires exhaust particles", () => {
  const g = startedGame();
  const r = g.renderer;
  engineOn(g.lander, 1.0);
  g.lander.y = g.terrain.heightAt(g.lander.x) + 500;
  r.render(0.016, { ...BASE_OPTS });
  assert.ok(r.exhaust.length > 0);
  // Cut the engine and run long frames so all particles exceed their max age.
  g.lander.thrust = 0;
  g.lander.effThrottle = 0;
  for (let i = 0; i < 5; i++) r.render(1.0, { ...BASE_OPTS });
  assert.equal(r.exhaust.length, 0, "all exhaust particles should have aged out");
});

// ---- render: low-altitude regolith dust -----------------------------------

test("render() near the surface with engine on spawns regolith dust", () => {
  const g = startedGame();
  const r = g.renderer;
  engineOn(g.lander, 1.0);
  for (let i = 0; i < 6; i++) {
    // Keep the lander below 70 m over the surface each frame.
    g.lander.y = g.terrain.heightAt(g.lander.x) + 30;
    assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS }));
  }
  assert.ok(r.dust.length > 0, "low-altitude thrust should kick up dust");
});

// ---- render: RCS puffs ----------------------------------------------------

test("render() with rcs > 0 spawns cold-gas puffs (negative-turn branch)", () => {
  const g = startedGame();
  const r = g.renderer;
  g.lander.rcs = 1;
  for (let i = 0; i < 4; i++) {
    assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS }));
  }
  assert.ok(r.rcsPuffs.length > 0);
});

test("render() with rcs < 0 spawns puffs on the opposite side", () => {
  const g = startedGame();
  const r = g.renderer;
  g.lander.rcs = -1;
  for (let i = 0; i < 4; i++) {
    assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS }));
  }
  assert.ok(r.rcsPuffs.length > 0);
});

// ---- render: camera shake -------------------------------------------------

test("render() with shake exercises the save/translate/restore branch", () => {
  const g = startedGame();
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, shake: 0.8 }));
});

// ---- render: frozen -------------------------------------------------------

test("render() frozen skips particle updates and the approach vector", () => {
  const g = startedGame();
  const r = g.renderer;
  engineOn(g.lander, 1.0);
  g.lander.rcs = 1;
  g.lander.y = g.terrain.heightAt(g.lander.x) + 30;
  // Frozen: no particle should spawn even with engine + rcs + low altitude.
  for (let i = 0; i < 5; i++) {
    assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS, frozen: true }));
  }
  assert.equal(r.exhaust.length, 0);
  assert.equal(r.dust.length, 0);
  assert.equal(r.rcsPuffs.length, 0);
});

test("frozen render() stays finite without chasing the camera target", () => {
  const g = startedGame();
  const r = g.renderer;
  g.lander.x += 500;
  assert.doesNotThrow(() => r.render(0.016, { ...BASE_OPTS, frozen: true }));
  assert.ok(Number.isFinite(r.cam.x));
});

// ---- render: predictor ----------------------------------------------------

function predictPoints(g) {
  const pts = [];
  const baseX = g.terrain.padCenterX - 100;
  for (let i = 0; i < 6; i++) {
    const x = baseX + i * 30;
    pts.push({ x, y: g.terrain.heightAt(x) + (100 - i * 15) });
  }
  return pts;
}

test("render() predictor: good landing (green) branch", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 1.0, vx: 0, safe: true, good: true,
    points: predictPoints(g),
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() predictor: safe-but-not-good (amber) branch", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 2.4, vx: 0.5, safe: true, good: false,
    points: predictPoints(g),
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() predictor: unsafe (red) branch with red trajectory stroke", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX + 80, y: g.terrain.heightAt(g.terrain.padCenterX + 80),
    descend: 7.5, vx: 4, safe: false, good: false,
    points: predictPoints(g),
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() predictor with empty points array hits the guard (no arc)", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 1.5, vx: 0, safe: true, good: true, points: [],
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() predictor with a single point hits the length<=1 guard", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 1.5, vx: 0, safe: true, good: false,
    points: [{ x: g.terrain.padCenterX, y: g.terrain.padHeight + 50 }],
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() predictor with no points property still draws the marker", () => {
  const g = startedGame();
  const p = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 0.8, vx: 0, safe: true, good: true,
  };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: p }));
});

test("render() with predict null skips the predictor entirely", () => {
  const g = startedGame();
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS, predict: null }));
});

// ---- render: flight-path trail --------------------------------------------

// Build a path with speed values spanning all three colour bands:
//   s > 20  -> red, 8 < s <= 20 -> amber, s <= 8 -> green
function buildPath(g, n) {
  const path = [];
  const x0 = g.terrain.padCenterX - 600;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 14;
    const y = g.terrain.heightAt(x) + 400 - i * 4;
    const band = i % 3;
    const s = band === 0 ? 25 : band === 1 ? 14 : 5;
    path.push({ x, y, s });
  }
  return path;
}

test("render() live trail (review:false) draws the recent breadcrumb", () => {
  const g = startedGame();
  const path = buildPath(g, 80);
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path, review: false }));
});

test("render() review trail (review:true) colours all three speed bands", () => {
  const g = startedGame();
  const path = buildPath(g, 80); // contains s>20, 8<s<=20, s<=8
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path, review: true }));
});

test("render() trail with fewer than 2 points hits the guard", () => {
  const g = startedGame();
  const path = [{ x: g.terrain.padCenterX, y: g.terrain.padHeight + 50, s: 3 }];
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path, review: true }));
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path, review: false }));
});

test("render() trail null skips the trail draw", () => {
  const g = startedGame();
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path: null }));
});

test("render() live trail longer than the 60-point window exercises the start clamp", () => {
  const g = startedGame();
  const path = buildPath(g, 200); // > 60 => N clamps to 60
  assert.doesNotThrow(() =>
    g.renderer.render(0.016, { ...BASE_OPTS, path, review: false }));
});

// ---- render: Earth image branch -------------------------------------------

test("render() draws the imagery Earth when earthImg is set", () => {
  const g = startedGame();
  // Simulate a successfully-loaded image to hit the drawImage branch.
  g.renderer.earthImg = { width: 100, height: 100 };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS }));
  // And a non-square image to exercise the min() scaling.
  g.renderer.earthImg = { width: 200, height: 100 };
  assert.doesNotThrow(() => g.renderer.render(0.016, { ...BASE_OPTS }));
});

// ---- render: pad beacon blink phases --------------------------------------

test("render() over time advances the _t accumulator (beacon blink)", () => {
  const g = startedGame();
  const r = g.renderer;
  // Run many frames so _t advances through both blink phases of the beacon.
  for (let i = 0; i < 30; i++) {
    assert.doesNotThrow(() => r.render(0.1, { ...BASE_OPTS }));
  }
  assert.ok(typeof r._t === "number" && r._t > 0);
});

// ---- combined heavy frame -------------------------------------------------

test("render() with everything on at once stays finite and does not throw", () => {
  const g = startedGame();
  const r = g.renderer;
  engineOn(g.lander, 0.9);
  g.lander.rcs = 1;
  const path = buildPath(g, 120);
  const predict = {
    x: g.terrain.padCenterX, y: g.terrain.padHeight,
    descend: 2.0, vx: 1, safe: true, good: false, points: predictPoints(g),
  };
  for (let i = 0; i < 6; i++) {
    g.lander.y = g.terrain.heightAt(g.lander.x) + 25;
    assert.doesNotThrow(() =>
      r.render(0.016, { frozen: false, shake: 0.5, predict, path, review: false }));
  }
  assert.ok(Number.isFinite(r.cam.scale));
  assert.ok(r.exhaust.length >= 0 && r.dust.length >= 0 && r.rcsPuffs.length >= 0);
});
