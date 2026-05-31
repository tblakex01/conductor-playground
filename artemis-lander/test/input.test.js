import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, dom, fireKey, fireKeyUp, fireWindow, els } from "./harness.js";

// A fresh Input wires window/document listeners in its constructor.
// Note: other Input instances (e.g. from a Game) may also be listening on the
// same window, but they keep their own `held` state and a no-op onAction, so
// they never affect assertions made on a freshly-created instance.
function newInput() {
  return new ARTEMIS.Input();
}

// ---- Held movement keys ----------------------------------------------------
test("KeyW sets throttle up (throttleDelta = 1)", () => {
  const input = newInput();
  fireKey("KeyW");
  assert.equal(input.throttleDelta(), 1);
});

test("KeyS sets throttle down (throttleDelta = -1)", () => {
  const input = newInput();
  fireKey("KeyS");
  assert.equal(input.throttleDelta(), -1);
});

test("both up and down held -> throttleDelta 0", () => {
  const input = newInput();
  fireKey("KeyW");
  fireKey("KeyS");
  assert.equal(input.throttleDelta(), 0);
});

test("KeyUp on KeyW clears the up intent", () => {
  const input = newInput();
  fireKey("KeyW");
  assert.equal(input.throttleDelta(), 1);
  fireKeyUp("KeyW");
  assert.equal(input.throttleDelta(), 0);
});

test("Arrow keys map identically to WASD for throttle", () => {
  const up = newInput();
  fireKey("ArrowUp");
  assert.equal(up.throttleDelta(), 1);

  const down = newInput();
  fireKey("ArrowDown");
  assert.equal(down.throttleDelta(), -1);
});

test("KeyA / ArrowLeft -> rotate -1", () => {
  const a = newInput();
  fireKey("KeyA");
  assert.equal(a.rotate(), -1);

  const left = newInput();
  fireKey("ArrowLeft");
  assert.equal(left.rotate(), -1);
});

test("KeyD / ArrowRight -> rotate +1", () => {
  const d = newInput();
  fireKey("KeyD");
  assert.equal(d.rotate(), 1);

  const right = newInput();
  fireKey("ArrowRight");
  assert.equal(right.rotate(), 1);
});

test("both left and right held -> rotate 0", () => {
  const input = newInput();
  fireKey("KeyA");
  fireKey("KeyD");
  assert.equal(input.rotate(), 0);
});

test("keyup on rotate key clears the intent", () => {
  const input = newInput();
  fireKey("KeyD");
  assert.equal(input.rotate(), 1);
  fireKeyUp("KeyD");
  assert.equal(input.rotate(), 0);
});

// ---- Discrete actions ------------------------------------------------------
test("Space fires 'cut'", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name, value) => captured.push([name, value]);
  fireKey("Space");
  assert.deepEqual(captured, [["cut", undefined]]);
});

test("KeyP and Escape fire 'pause'", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name) => captured.push(name);
  fireKey("KeyP");
  fireKey("Escape");
  assert.deepEqual(captured, ["pause", "pause"]);
});

test("KeyR fires 'restart'", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name) => captured.push(name);
  fireKey("KeyR");
  assert.deepEqual(captured, ["restart"]);
});

test("Digit5 fires setThrottle with value 5/9", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name, value) => captured.push([name, value]);
  fireKey("Digit5");
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0], "setThrottle");
  assert.ok(Math.abs(captured[0][1] - 5 / 9) < 1e-9);
});

test("Digit0 fires setThrottle 0", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name, value) => captured.push([name, value]);
  fireKey("Digit0");
  assert.deepEqual(captured, [["setThrottle", 0]]);
});

test("Digit9 fires setThrottle 1 (full)", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name, value) => captured.push([name, value]);
  fireKey("Digit9");
  assert.equal(captured[0][0], "setThrottle");
  assert.ok(Math.abs(captured[0][1] - 1) < 1e-9);
});

test("unrelated key fires no action", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name) => captured.push(name);
  fireKey("KeyZ");
  assert.deepEqual(captured, []);
});

// ---- repeat guard ----------------------------------------------------------
test("repeated Space does not fire a second 'cut'", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name) => captured.push(name);
  fireKey("Space");                    // first press
  fireKey("Space", { repeat: true });  // auto-repeat -> ignored
  assert.deepEqual(captured, ["cut"]);
});

test("repeated KeyR does not fire onAction", () => {
  const input = newInput();
  const captured = [];
  input.onAction = (name) => captured.push(name);
  fireKey("KeyR", { repeat: true });
  assert.deepEqual(captured, []);
});

// ---- preventDefault --------------------------------------------------------
function spyEvent(code, extra) {
  let called = false;
  const ev = Object.assign(
    { type: "keydown", code, repeat: false, preventDefault() { called = true; } },
    extra
  );
  return { ev, wasCalled: () => called };
}

test("preventDefault is called for held control key (KeyW)", () => {
  newInput();
  const { ev, wasCalled } = spyEvent("KeyW");
  fireWindow("keydown", ev);
  assert.equal(wasCalled(), true);
});

test("preventDefault is called for Space", () => {
  newInput();
  const { ev, wasCalled } = spyEvent("Space");
  fireWindow("keydown", ev);
  assert.equal(wasCalled(), true);
});

test("preventDefault is NOT called for an unrelated key (KeyZ)", () => {
  newInput();
  const { ev, wasCalled } = spyEvent("KeyZ");
  fireWindow("keydown", ev);
  assert.equal(wasCalled(), false);
});

// ---- Touch / pointer buttons ----------------------------------------------
test("touch button pointerdown sets held intent; pointerup clears it", () => {
  const input = newInput();
  const upBtn = els.touchButtons[1]; // ArrowUp -> "up"
  upBtn.dispatch("pointerdown", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 1);
  upBtn.dispatch("pointerup", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 0);
});

test("touch button pointerleave clears held intent", () => {
  const input = newInput();
  const upBtn = els.touchButtons[1];
  upBtn.dispatch("pointerdown", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 1);
  upBtn.dispatch("pointerleave", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 0);
});

test("touch button pointercancel clears held intent", () => {
  const input = newInput();
  const upBtn = els.touchButtons[1];
  upBtn.dispatch("pointerdown", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 1);
  upBtn.dispatch("pointercancel", { preventDefault() {} });
  assert.equal(input.throttleDelta(), 0);
});

test("touch button pointerdown calls preventDefault", () => {
  newInput();
  const leftBtn = els.touchButtons[0]; // ArrowLeft -> "left"
  let called = false;
  leftBtn.dispatch("pointerdown", { preventDefault() { called = true; } });
  assert.equal(called, true);
});

test("touch buttons map left/down/right intents", () => {
  const input = newInput();
  els.touchButtons[0].dispatch("pointerdown", { preventDefault() {} }); // ArrowLeft
  assert.equal(input.rotate(), -1);
  els.touchButtons[0].dispatch("pointerup", { preventDefault() {} });

  els.touchButtons[3].dispatch("pointerdown", { preventDefault() {} }); // ArrowRight
  assert.equal(input.rotate(), 1);
  els.touchButtons[3].dispatch("pointerup", { preventDefault() {} });

  els.touchButtons[2].dispatch("pointerdown", { preventDefault() {} }); // ArrowDown
  assert.equal(input.throttleDelta(), -1);
  els.touchButtons[2].dispatch("pointerup", { preventDefault() {} });
});

// ---- Touch detection -------------------------------------------------------
test("touchstart adds is-touch to document.body", () => {
  newInput();
  fireWindow("touchstart");
  assert.ok(dom.body.classList.contains("is-touch"));
});
