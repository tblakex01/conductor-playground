import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTEMIS, dom, els, fireKey, fireWindow, fireDOMContentLoaded, resetStore,
} from "./harness.js";

const { U } = ARTEMIS;

// Bootstrap once: main.js registered a DOMContentLoaded handler at import.
resetStore();
fireDOMContentLoaded();

const game = ARTEMIS.game;
const $ = (id) => dom.getElementById(id);

// Land the live game on the pad with the given kinematics and fire onEnd.
function landGame({ vy = -0.5, vx = 0, angle = 0, x = null } = {}) {
  const t = game.terrain;
  game.lander.x = x == null ? t.padCenterX : x;
  game.lander.y = t.heightAt(game.lander.x);
  game.lander.vy = vy;
  game.lander.vx = vx;
  game.lander.angle = angle;
  game.lander.landed = false;
  game._evaluateLanding();
}

// ---- bootstrap ------------------------------------------------------------

test("bootstrap creates the game and sets best-line", () => {
  assert.ok(game, "ARTEMIS.game exists");
  const best = $("best-line").textContent;
  assert.ok(best && best.length > 0, "best-line populated");
  assert.match(best, /NO MISSIONS LOGGED/);
});

// ---- HUD toggles ----------------------------------------------------------

test("sound toggle flips setting and is-off class, persists", () => {
  const before = game.settings.sound;
  els.toggles[0].click(); // sound
  assert.equal(game.settings.sound, !before);
  assert.equal(els.toggles[0].classList.contains("is-off"), before); // off when now false
  // Persisted to Store.
  assert.equal(ARTEMIS.Store.getSettings().sound, !before);
  els.toggles[0].click();
  assert.equal(game.settings.sound, before);
  assert.equal(els.toggles[0].classList.contains("is-off"), !before);
});

test("predict toggle flips setting", () => {
  const before = game.settings.predict;
  els.toggles[1].click();
  assert.equal(game.settings.predict, !before);
  els.toggles[1].click();
  assert.equal(game.settings.predict, before);
});

test("graph toggle flips setting and telemetry is-hidden class", () => {
  const before = game.settings.graph;
  els.toggles[2].click();
  assert.equal(game.settings.graph, !before);
  assert.equal($("telemetry").classList.contains("is-hidden"), before); // hidden when off
  els.toggles[2].click();
  assert.equal(game.settings.graph, before);
});

test("trail toggle flips setting", () => {
  const before = game.settings.trail;
  els.toggles[3].click();
  assert.equal(game.settings.trail, !before);
  els.toggles[3].click();
  assert.equal(game.settings.trail, before);
});

// ---- keyboard shortcuts ---------------------------------------------------

test("KeyM toggles sound", () => {
  const before = game.settings.sound;
  fireKey("KeyM");
  assert.equal(game.settings.sound, !before);
  fireKey("KeyM");
  assert.equal(game.settings.sound, before);
});

test("KeyG toggles predict", () => {
  const before = game.settings.predict;
  fireKey("KeyG");
  assert.equal(game.settings.predict, !before);
  fireKey("KeyG");
  assert.equal(game.settings.predict, before);
});

test("KeyB toggles graph", () => {
  const before = game.settings.graph;
  fireKey("KeyB");
  assert.equal(game.settings.graph, !before);
  fireKey("KeyB");
  assert.equal(game.settings.graph, before);
});

test("KeyT toggles trail", () => {
  const before = game.settings.trail;
  fireKey("KeyT");
  assert.equal(game.settings.trail, !before);
  fireKey("KeyT");
  assert.equal(game.settings.trail, before);
});

test("repeated key is ignored", () => {
  const before = game.settings.sound;
  fireKey("KeyM", { repeat: true });
  assert.equal(game.settings.sound, before, "no flip on auto-repeat");
});

test("non-shortcut key does nothing", () => {
  const snap = { ...game.settings };
  fireKey("KeyZ");
  assert.deepEqual({ ...game.settings }, snap);
});

// ---- difficulty selection -------------------------------------------------

test("difficulty selection sets active class and updates best-line", () => {
  els.diffOpts[0].click(); // cadet
  assert.ok(els.diffOpts[0].classList.contains("is-active"));
  assert.ok(!els.diffOpts[1].classList.contains("is-active"));
  assert.ok(!els.diffOpts[2].classList.contains("is-active"));
  const best = $("best-line").textContent;
  assert.ok(best && best.length > 0);

  els.diffOpts[2].click(); // ace
  assert.ok(els.diffOpts[2].classList.contains("is-active"));
  assert.ok(!els.diffOpts[0].classList.contains("is-active"));
});

// ---- launch ---------------------------------------------------------------

test("launch starts the mission and reveals the HUD", () => {
  $("btn-launch").click();
  assert.equal(game.state, "flying");
  assert.ok($("screen-start").classList.contains("screen--hidden"));
  assert.ok(!$("hud").classList.contains("is-hidden"));
});

// ---- pause flow -----------------------------------------------------------

test("pause shows the pause screen; resume hides it", () => {
  // Ensure we are flying.
  if (game.state !== "flying") { $("btn-launch").click(); }
  game.setPaused(true);
  assert.equal(game.state, "paused");
  assert.ok(!$("screen-pause").classList.contains("screen--hidden"));

  $("btn-resume").click();
  assert.equal(game.state, "flying");
  assert.ok($("screen-pause").classList.contains("screen--hidden"));
});

test("abort returns to the menu and shows the start screen", () => {
  if (game.state !== "flying") { $("btn-launch").click(); }
  game.setPaused(true);
  $("btn-abort").click();
  assert.equal(game.state, "menu");
  assert.ok($("hud").classList.contains("is-hidden"));
  assert.ok(!$("screen-start").classList.contains("screen--hidden"));
});

// ---- end of mission -------------------------------------------------------

test("successful new-record landing populates the end screen", () => {
  resetStore();                 // clear records so this landing is a new best
  els.diffOpts[1].click();      // commander
  $("btn-launch").click();
  assert.equal(game.state, "flying");

  landGame({ vy: -0.5, vx: 0, angle: 0 }); // precision -> success + new record

  assert.equal(game.state, "ended");
  assert.ok($("end-title").textContent.length > 0);
  assert.ok($("end-badge").textContent.length > 0);
  assert.ok($("end-msg").textContent.length > 0);
  assert.ok($("end-stats").children.length > 0, "stat cells appended");
  assert.ok($("end-score").textContent.length > 0 || $("end-score").children.length > 0);

  const recEl = $("end-record");
  assert.match(recEl.textContent, /NEW PERSONAL BEST/);
  assert.ok(recEl.className.includes("is-new"));
  // Badge reflects success styling.
  assert.ok($("end-badge").className.includes("screen__badge--good"));
});

test("successful non-record landing shows the personal-best banner", () => {
  // A landing that does NOT beat the current best (records already seeded by
  // the previous test). Land softly but with less score -> not a new record.
  els.diffOpts[1].click(); // commander
  $("btn-launch").click();
  // Burn most fuel and use a harder (still safe) descent to lower the score.
  game.lander.fuel = 1;
  landGame({ vy: -2.0, vx: 0, angle: 0 });
  assert.equal(game.state, "ended");
  assert.equal(game.result.record.newRecord, false, "not a new record");
  const recEl = $("end-record");
  // Not a new record -> the prev-best banner shows (visible).
  assert.notEqual(recEl.style.display, "none");
  assert.match(recEl.textContent, /PERSONAL BEST/);
});

test("crash hides the end-record banner and uses bad styling", () => {
  els.diffOpts[1].click();
  $("btn-launch").click();
  landGame({ vy: -50, vx: 0, angle: 0 }); // crash
  assert.equal(game.state, "ended");
  assert.equal(game.result.success, false);
  const recEl = $("end-record");
  assert.equal(recEl.style.display, "none"); // banner hidden on crash
  // end-score should contain a "NO SCORE" span for a crash.
  const hasNoScore = ($("end-score").children || []).some(
    (c) => c.textContent === "NO SCORE"
  );
  assert.ok(hasNoScore, "NO SCORE span present on crash");
});

// ---- fly again ------------------------------------------------------------

test("fly again restarts the mission", () => {
  // From an ended state, btn-again launches a fresh mission.
  $("btn-again").click();
  assert.equal(game.state, "flying");
});

// ---- resize ---------------------------------------------------------------

test("resize does not throw", () => {
  assert.doesNotThrow(() => fireWindow("resize"));
});
