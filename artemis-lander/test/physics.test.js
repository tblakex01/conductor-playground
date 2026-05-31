import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS } from "./harness.js";

const Lander = ARTEMIS.Lander;
const CONFIG = ARTEMIS.CONFIG;
const V = CONFIG.VEHICLE;

function makeLander(overrides) {
  return new Lander(Object.assign(
    { x: 0, y: 1000, vx: 0, vy: 0, angle: 0, fuel: 3000 },
    overrides || {}
  ));
}

// ---- construction --------------------------------------------------------
test("constructor initializes state from input", () => {
  const l = makeLander({ x: 5, y: 200, vx: 3, vy: -7, angle: 0.1, fuel: 1500 });
  assert.equal(l.x, 5);
  assert.equal(l.y, 200);
  assert.equal(l.vx, 3);
  assert.equal(l.vy, -7);
  assert.equal(l.angle, 0.1);
  assert.equal(l.fuel, 1500);
  assert.equal(l.fuel0, 1500);
  assert.equal(l.angVel, 0);
  assert.equal(l.landed, false);
});

test("angle defaults to 0 when omitted", () => {
  const l = new Lander({ x: 0, y: 0, vx: 0, vy: 0, fuel: 100 });
  assert.equal(l.angle, 0);
});

test("exhaustVel = isp * G0", () => {
  const l = makeLander();
  assert.ok(Math.abs(l.exhaustVel - V.isp * CONFIG.G0) < 1e-9);
});

// ---- mass ----------------------------------------------------------------
test("mass() === dryMass + fuel", () => {
  const l = makeLander({ fuel: 2000 });
  assert.equal(l.mass(), V.dryMass + 2000);
});

test("mass() decreases as fuel burns", () => {
  const l = makeLander({ fuel: 3000 });
  const m0 = l.mass();
  l.update(1, { throttle: 1, rotate: 0 });
  assert.ok(l.mass() < m0);
});

// ---- free fall (zero throttle) ------------------------------------------
test("zero throttle: lander falls at lunar gravity, no fuel burned", () => {
  const l = makeLander({ fuel: 3000, vy: 0 });
  const fuelBefore = l.fuel;
  const dt = 0.5;
  l.update(dt, { throttle: 0, rotate: 0 });
  assert.ok(Math.abs(l.vy - (-CONFIG.MOON_GRAVITY * dt)) < 1e-9);
  assert.equal(l.fuel, fuelBefore);
  assert.equal(l.thrust, 0);
  assert.equal(l.effThrottle, 0);
});

test("zero throttle: vy decreases each step", () => {
  const l = makeLander({ vy: 0 });
  l.update(1, { throttle: 0, rotate: 0 });
  const v1 = l.vy;
  l.update(1, { throttle: 0, rotate: 0 });
  assert.ok(l.vy < v1);
});

test("throttle exactly 0 produces zero thrust and effThrottle", () => {
  const l = makeLander();
  l.update(0.1, { throttle: 0, rotate: 0 });
  assert.equal(l.thrust, 0);
  assert.equal(l.effThrottle, 0);
});

test("throttle below 0.001 deadband produces zero thrust", () => {
  const l = makeLander();
  l.update(0.1, { throttle: 0.0005, rotate: 0 });
  assert.equal(l.thrust, 0);
  assert.equal(l.effThrottle, 0);
});

// ---- full throttle upward ------------------------------------------------
test("full throttle at angle 0: accelerates upward and burns fuel", () => {
  const l = makeLander({ fuel: 3000, vy: 0, angle: 0 });
  const fuelBefore = l.fuel;
  l.update(0.5, { throttle: 1, rotate: 0 });
  // net upward accel = thrust/m - g; with maxThrust this is strongly positive
  assert.ok(l.vy > 0, "should gain upward velocity");
  assert.ok(l.fuel < fuelBefore, "fuel should be consumed");
  assert.equal(l.effThrottle, 1);
  assert.ok(Math.abs(l.thrust - V.maxThrust) < 1e-6);
});

test("full throttle: returns thrust-only accel magnitude", () => {
  const l = makeLander({ fuel: 3000, angle: 0 });
  const a = l.update(0.1, { throttle: 1, rotate: 0 });
  // thrust-only accel ~ thrust/mass (gravity removed in return)
  const expected = l.thrust / l.mass();
  assert.ok(Math.abs(a - expected) < 0.5, `accel ${a} vs ~${expected}`);
});

test("tilted thrust produces lateral acceleration", () => {
  const l = makeLander({ fuel: 3000, angle: 0.3, vx: 0 });
  l.update(0.2, { throttle: 1, rotate: 0 });
  assert.ok(l.vx > 0, "right-lean (positive angle) should push +x");
});

// ---- minThrottle clamp ---------------------------------------------------
test("minThrottle clamp: tiny throttle above deadband clamps up to minThrottle", () => {
  const l = makeLander();
  l.update(0.1, { throttle: 0.01, rotate: 0 });
  assert.ok(l.effThrottle >= V.minThrottle);
  assert.ok(Math.abs(l.effThrottle - V.minThrottle) < 1e-9);
});

test("throttle above 1 clamps down to 1", () => {
  const l = makeLander();
  l.update(0.1, { throttle: 5, rotate: 0 });
  assert.equal(l.effThrottle, 1);
});

test("mid-range throttle passes through (above min, below 1)", () => {
  const l = makeLander();
  l.update(0.1, { throttle: 0.5, rotate: 0 });
  assert.ok(Math.abs(l.effThrottle - 0.5) < 1e-9);
});

// ---- fuel depletion ------------------------------------------------------
test("running out of fuel sets thrust 0 and fuel 0", () => {
  const l = makeLander({ fuel: 0.001 });
  for (let i = 0; i < 5; i++) {
    l.update(0.5, { throttle: 1, rotate: 0 });
  }
  assert.equal(l.fuel, 0);
  assert.equal(l.thrust, 0);
});

test("with fuel already 0: thrust 0, effThrottle 0, fuel stays 0", () => {
  const l = makeLander({ fuel: 0 });
  l.update(0.5, { throttle: 1, rotate: 0 });
  assert.equal(l.fuel, 0);
  assert.equal(l.thrust, 0);
  assert.equal(l.effThrottle, 0);
});

test("fuel never goes negative", () => {
  const l = makeLander({ fuel: 1 });
  for (let i = 0; i < 20; i++) {
    l.update(1, { throttle: 1, rotate: 0 });
    assert.ok(l.fuel >= 0);
  }
});

// ---- RCS / attitude ------------------------------------------------------
test("RCS rotate +1 increases angVel and angle, sets rcs field", () => {
  const l = makeLander();
  l.update(0.5, { throttle: 0, rotate: 1 });
  assert.ok(l.angVel > 0);
  assert.ok(l.angle > 0);
  assert.equal(l.rcs, 1);
});

test("RCS rotate -1 decreases angVel and angle, sets rcs field", () => {
  const l = makeLander();
  l.update(0.5, { throttle: 0, rotate: -1 });
  assert.ok(l.angVel < 0);
  assert.ok(l.angle < 0);
  assert.equal(l.rcs, -1);
});

test("rcs field defaults to 0 when rotate omitted", () => {
  const l = makeLander();
  l.update(0.5, { throttle: 0 });
  assert.equal(l.rcs, 0);
});

test("angular damping reduces angVel magnitude over time when rotate is 0", () => {
  const l = makeLander();
  // spin up first
  l.update(0.5, { throttle: 0, rotate: 1 });
  const spun = l.angVel;
  assert.ok(spun > 0);
  // coast with no rotate; damping should bleed off angular velocity
  for (let i = 0; i < 10; i++) {
    l.update(0.5, { throttle: 0, rotate: 0 });
  }
  assert.ok(l.angVel < spun, "damping should reduce angVel");
  assert.ok(l.angVel >= 0, "damping should not flip sign here");
});

// ---- landed short-circuit ------------------------------------------------
test("landed lander: update returns 0 and changes nothing", () => {
  const l = makeLander({ fuel: 3000, vy: -5, vx: 2 });
  l.landed = true;
  const snapshot = {
    x: l.x, y: l.y, vx: l.vx, vy: l.vy, angle: l.angle,
    angVel: l.angVel, fuel: l.fuel, thrust: l.thrust,
  };
  const ret = l.update(1, { throttle: 1, rotate: 1 });
  assert.equal(ret, 0);
  assert.equal(l.x, snapshot.x);
  assert.equal(l.y, snapshot.y);
  assert.equal(l.vx, snapshot.vx);
  assert.equal(l.vy, snapshot.vy);
  assert.equal(l.angle, snapshot.angle);
  assert.equal(l.angVel, snapshot.angVel);
  assert.equal(l.fuel, snapshot.fuel);
  assert.equal(l.thrust, snapshot.thrust);
});

// ---- position integration ------------------------------------------------
test("position integrates velocity (semi-implicit Euler)", () => {
  const l = makeLander({ x: 0, y: 100, vx: 10, vy: 0, fuel: 0 });
  const dt = 1;
  l.update(dt, { throttle: 0, rotate: 0 });
  // vy after gravity = -g*dt; y += vy*dt
  assert.ok(Math.abs(l.vy - (-CONFIG.MOON_GRAVITY * dt)) < 1e-9);
  assert.ok(Math.abs(l.y - (100 + l.vy * dt)) < 1e-9);
  // vx unchanged (no thrust), x advances by vx*dt
  assert.equal(l.vx, 10);
  assert.ok(Math.abs(l.x - 10) < 1e-9);
});
