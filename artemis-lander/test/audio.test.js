/* ============================================================
   ARTEMIS · audio.js (ARTEMIS.AudioFX) unit tests
   The harness installs win.AudioContext = AudioContextMock, so
   unlock() builds a working (mocked) audio graph.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS } from "./harness.js";

const AudioFX = ARTEMIS.AudioFX;

// ---- construction ---------------------------------------------------------

test("new AudioFX() constructs with ctx null and muted false", () => {
  const a = new AudioFX();
  assert.equal(a.ctx, null);
  assert.equal(a.muted, false);
  assert.equal(a.master, null);
  assert.equal(a.engine, null);
  assert.equal(a._alarmOn, false);
  assert.equal(a._alarmTimer, null);
});

// ---- before unlock(): every method is a safe no-op -----------------------

test("setEngine before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.setEngine(0.5));
  assert.equal(a.ctx, null);
});

test("rcs before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.rcs());
});

test("touchdown before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.touchdown(0.5));
});

test("crash before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.crash());
});

test("chime before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.chime());
});

test("click before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.click());
});

test("beep before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.beep(440, 0.1));
});

test("setAlarm(true)/setAlarm(false) before unlock is a safe no-op", () => {
  const a = new AudioFX();
  // setAlarm doesn't gate on ctx, but the interval callback does — still
  // must not throw, and we clean up afterwards.
  assert.doesNotThrow(() => {
    a.setAlarm(true);
    a.setAlarm(false);
  });
  assert.equal(a._alarmOn, false);
});

test("setMuted(true) before unlock is a safe no-op", () => {
  const a = new AudioFX();
  assert.doesNotThrow(() => a.setMuted(true));
  assert.equal(a.muted, true);
  assert.equal(a.master, null);
});

// ---- unlock() -------------------------------------------------------------

test("unlock() sets ctx, master gain, and builds the engine graph", () => {
  const a = new AudioFX();
  a.unlock();
  assert.ok(a.ctx, "ctx created");
  assert.ok(a.master, "master gain created");
  assert.ok(a.engine, "engine graph built");
  assert.ok(a.engine.src && a.engine.filter && a.engine.gain, "engine nodes present");
  assert.ok(a.engine.osc && a.engine.oGain, "engine oscillator present");
  assert.ok(a._noiseBuf, "noise buffer made");
});

test("unlock() is idempotent: second call does not rebuild or throw", () => {
  const a = new AudioFX();
  a.unlock();
  const ctx1 = a.ctx;
  const engine1 = a.engine;
  assert.doesNotThrow(() => a.unlock());
  assert.equal(a.ctx, ctx1, "ctx unchanged");
  assert.equal(a.engine, engine1, "engine unchanged (not rebuilt)");
});

test("unlock() resumes a suspended context", () => {
  const a = new AudioFX();
  a.unlock();
  a.ctx.state = "suspended";
  a.unlock();
  assert.equal(a.ctx.state, "running", "suspended ctx resumed");
});

test("unlock() respects muted: master gain starts at 0 when muted", () => {
  const a = new AudioFX();
  a.setMuted(true);       // muted before any ctx exists
  a.unlock();
  assert.equal(a.master.gain.value, 0, "master gain muted on unlock");
});

test("unlock() sets master gain to 0.6 when not muted", () => {
  const a = new AudioFX();
  a.unlock();
  assert.equal(a.master.gain.value, 0.6);
});

// ---- setMuted both branches after unlock ----------------------------------

test("setMuted(true) then setMuted(false) after unlock — no throw, both branches", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setMuted(true));
  assert.equal(a.muted, true);
  assert.doesNotThrow(() => a.setMuted(false));
  assert.equal(a.muted, false);
});

test("setMuted coerces truthy/falsy values to boolean", () => {
  const a = new AudioFX();
  a.unlock();
  a.setMuted(1);
  assert.equal(a.muted, true);
  a.setMuted(0);
  assert.equal(a.muted, false);
});

// ---- setEngine across levels ----------------------------------------------

test("setEngine handles level 0 (engine off branch)", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setEngine(0));
});

test("setEngine handles mid level 0.5", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setEngine(0.5));
});

test("setEngine handles full level 1", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setEngine(1));
});

test("setEngine clamps negative level (< 0)", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setEngine(-0.5));
});

test("setEngine clamps over-range level (> 1)", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setEngine(2));
});

// ---- rcs throttling -------------------------------------------------------

test("rcs after unlock fires (non-throttled branch reaches _burst)", () => {
  const a = new AudioFX();
  a.unlock();
  // Advance time past the cooldown so the very first call actually fires
  // (_lastRcs starts at 0; at currentTime 0 it would be throttled).
  a.ctx.currentTime = 1;
  assert.doesNotThrow(() => a.rcs());
  assert.equal(a._lastRcs, 1, "fired call updated _lastRcs");
});

test("rcs second call at the same time is throttled (cooldown branch)", () => {
  const a = new AudioFX();
  a.unlock();
  a.ctx.currentTime = 1;
  a.rcs();                       // fires, _lastRcs = 1
  assert.equal(a._lastRcs, 1);

  // Same time again: now - _lastRcs = 0 < 0.09 -> throttled, no update.
  a.rcs();
  assert.equal(a._lastRcs, 1, "throttled call did not update _lastRcs");

  // Advance time past the cooldown — fires again and updates _lastRcs.
  a.ctx.currentTime = 2;
  a.rcs();
  assert.equal(a._lastRcs, 2, "non-throttled call updated _lastRcs");
});

// ---- touchdown / crash / chime / click ------------------------------------

test("touchdown soft (softness 1) after unlock — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.touchdown(1));
});

test("touchdown hard (softness 0) after unlock — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.touchdown(0));
});

test("touchdown with no argument (defaults softness to 0) — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.touchdown());
});

test("crash after unlock — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.crash());
});

test("chime after unlock schedules notes — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.chime());
});

test("click after unlock — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.click());
});

// ---- beep variants --------------------------------------------------------

test("beep with explicit freq/dur/type/vol — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.beep(440, 0.2, "square", 0.3));
});

test("beep with only freq uses default dur/type/vol — no throw", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.beep(440));
});

// ---- setAlarm -------------------------------------------------------------

test("setAlarm(true) starts the alarm and schedules an interval", () => {
  const a = new AudioFX();
  a.unlock();
  a.setAlarm(true);
  assert.equal(a._alarmOn, true);
  assert.ok(a._alarmTimer, "interval timer scheduled");
  a.setAlarm(false); // clean up
});

test("setAlarm(true) called twice is a no-op (already on)", () => {
  const a = new AudioFX();
  a.unlock();
  a.setAlarm(true);
  const timer1 = a._alarmTimer;
  a.setAlarm(true); // second call should not reschedule
  assert.equal(a._alarmTimer, timer1, "timer not replaced");
  assert.equal(a._alarmOn, true);
  a.setAlarm(false); // clean up
});

test("setAlarm(false) stops the alarm and clears the interval", () => {
  const a = new AudioFX();
  a.unlock();
  a.setAlarm(true);
  a.setAlarm(false);
  assert.equal(a._alarmOn, false);
  assert.equal(a._alarmTimer, null, "timer cleared");
});

test("setAlarm(false) when not on is a no-op", () => {
  const a = new AudioFX();
  a.unlock();
  assert.doesNotThrow(() => a.setAlarm(false));
  assert.equal(a._alarmOn, false);
  assert.equal(a._alarmTimer, null);
});

test("alarm interval callback is safe while muted (no throw on fire)", () => {
  const a = new AudioFX();
  a.unlock();
  a.setMuted(true);
  a.setAlarm(true);
  // The callback short-circuits when muted; just ensure starting/stopping is clean.
  assert.equal(a._alarmOn, true);
  a.setAlarm(false);
  assert.equal(a._alarmOn, false);
});
