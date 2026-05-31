/* ============================================================
   ARTEMIS · storage.js (ARTEMIS.Store) unit tests
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, win, resetStore } from "./harness.js";

const KEY = "artemis.lander.v1";
const Store = ARTEMIS.Store;

test.beforeEach(() => {
  resetStore();
});

function persisted() {
  const raw = win.localStorage.getItem(KEY);
  return raw == null ? null : JSON.parse(raw);
}

// ---- getSettings ----------------------------------------------------------

test("getSettings returns the live settings object", () => {
  const a = Store.getSettings();
  const b = Store.getSettings();
  assert.equal(a, b, "same reference returned each call");
});

test("getSettings defaults: all HUD toggles true", () => {
  const s = Store.getSettings();
  assert.equal(s.sound, true);
  assert.equal(s.predict, true);
  assert.equal(s.graph, true);
  assert.equal(s.trail, true);
});

test("getSettings has all four boolean keys", () => {
  const s = Store.getSettings();
  for (const k of ["sound", "predict", "graph", "trail"]) {
    assert.equal(typeof s[k], "boolean", `${k} is boolean`);
  }
});

// ---- setSetting -----------------------------------------------------------

test("setSetting mutates the live settings object", () => {
  const s = Store.getSettings();
  Store.setSetting("sound", false);
  assert.equal(s.sound, false, "mutation visible on held reference");
  assert.equal(Store.getSettings().sound, false);
});

test("setSetting persists to localStorage (sound:false in JSON)", () => {
  Store.setSetting("sound", false);
  const data = persisted();
  assert.ok(data, "data written under KEY");
  assert.equal(data.settings.sound, false);
});

test("setSetting persists each toggle independently", () => {
  Store.setSetting("predict", false);
  Store.setSetting("graph", false);
  const data = persisted();
  assert.equal(data.settings.predict, false);
  assert.equal(data.settings.graph, false);
  assert.equal(data.settings.sound, true, "untouched key stays default");
  assert.equal(data.settings.trail, true);
});

test("setSetting can set a value back to true", () => {
  Store.setSetting("trail", false);
  Store.setSetting("trail", true);
  assert.equal(Store.getSettings().trail, true);
  assert.equal(persisted().settings.trail, true);
});

// ---- getRecord ------------------------------------------------------------

test("getRecord returns a blank record when none stored", () => {
  const r = Store.getRecord("commander");
  assert.deepEqual(r, {
    bestScore: 0,
    softest: null,
    missions: 0,
    landings: 0,
    crashes: 0,
  });
});

test("getRecord returns blank for an unknown difficulty key", () => {
  const r = Store.getRecord("nonexistent-diff");
  assert.equal(r.bestScore, 0);
  assert.equal(r.softest, null);
});

// ---- recordResult: success ------------------------------------------------

test("recordResult success returns newRecord:true, prevBest:0", () => {
  const out = Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  assert.deepEqual(out, { newRecord: true, prevBest: 0 });
});

test("recordResult success increments missions and landings", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  const r = Store.getRecord("commander");
  assert.equal(r.missions, 1);
  assert.equal(r.landings, 1);
  assert.equal(r.crashes, 0);
});

test("recordResult success sets softest to descend and bestScore to score", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  const r = Store.getRecord("commander");
  assert.equal(r.softest, 1.2);
  assert.equal(r.bestScore, 5000);
});

// ---- recordResult: crash --------------------------------------------------

test("recordResult crash increments missions and crashes, not landings", () => {
  Store.recordResult("commander", { success: false, score: 0 }, 3.0);
  const r = Store.getRecord("commander");
  assert.equal(r.missions, 1);
  assert.equal(r.crashes, 1);
  assert.equal(r.landings, 0);
});

test("recordResult crash does not change bestScore and returns newRecord:false", () => {
  const out = Store.recordResult("commander", { success: false, score: 0 }, 3.0);
  assert.deepEqual(out, { newRecord: false, prevBest: 0 });
  assert.equal(Store.getRecord("commander").bestScore, 0);
});

test("recordResult crash leaves softest null (no soft-landing recorded)", () => {
  Store.recordResult("commander", { success: false, score: 0 }, 0.5);
  assert.equal(Store.getRecord("commander").softest, null);
});

test("a crash with a high score does NOT count as a new record", () => {
  const out = Store.recordResult("commander", { success: false, score: 99999 }, 1.0);
  assert.equal(out.newRecord, false);
  assert.equal(Store.getRecord("commander").bestScore, 0);
});

// ---- beating / not beating previous best ---------------------------------

test("beating previous best: 5000 then 8000 -> newRecord true, prevBest 5000", () => {
  const first = Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  assert.deepEqual(first, { newRecord: true, prevBest: 0 });

  const second = Store.recordResult("commander", { success: true, score: 8000 }, 1.5);
  assert.deepEqual(second, { newRecord: true, prevBest: 5000 });
  assert.equal(Store.getRecord("commander").bestScore, 8000);
});

test("lower score after a best: 8000 then 3000 -> newRecord false, best stays 8000", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  Store.recordResult("commander", { success: true, score: 8000 }, 1.5);
  const out = Store.recordResult("commander", { success: true, score: 3000 }, 2.0);
  assert.deepEqual(out, { newRecord: false, prevBest: 8000 });
  assert.equal(Store.getRecord("commander").bestScore, 8000);
});

test("equal score to best is NOT a new record (strictly greater required)", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  const out = Store.recordResult("commander", { success: true, score: 5000 }, 1.0);
  assert.equal(out.newRecord, false);
  assert.equal(out.prevBest, 5000);
  assert.equal(Store.getRecord("commander").bestScore, 5000);
});

test("missions/landings keep accumulating across several runs", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  Store.recordResult("commander", { success: true, score: 8000 }, 1.5);
  Store.recordResult("commander", { success: false, score: 0 }, 4.0);
  const r = Store.getRecord("commander");
  assert.equal(r.missions, 3);
  assert.equal(r.landings, 2);
  assert.equal(r.crashes, 1);
});

// ---- softest only improves (lower descend wins) --------------------------

test("softest improves when a lower descend lands (2.0 then 1.0 -> 1.0)", () => {
  Store.recordResult("commander", { success: true, score: 100 }, 2.0);
  assert.equal(Store.getRecord("commander").softest, 2.0);
  Store.recordResult("commander", { success: true, score: 100 }, 1.0);
  assert.equal(Store.getRecord("commander").softest, 1.0);
});

test("softest does NOT regress when a higher descend lands (1.0 then 1.5 -> 1.0)", () => {
  Store.recordResult("commander", { success: true, score: 100 }, 2.0);
  Store.recordResult("commander", { success: true, score: 100 }, 1.0);
  Store.recordResult("commander", { success: true, score: 100 }, 1.5);
  assert.equal(Store.getRecord("commander").softest, 1.0);
});

// ---- persistence round-trip ----------------------------------------------

test("recordResult persists the record to localStorage", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  const data = persisted();
  assert.ok(data.records.commander, "commander record present in storage");
  assert.equal(data.records.commander.bestScore, 5000);
  assert.equal(data.records.commander.softest, 1.2);
  assert.equal(data.records.commander.missions, 1);
});

test("fresh read path: a new Store-like read reflects persisted data", () => {
  Store.setSetting("sound", false);
  Store.recordResult("ace", { success: true, score: 1234 }, 0.7);

  // Simulate a fresh page load: re-parse what is in localStorage and ensure
  // the persisted shape round-trips back to the same values.
  const data = persisted();
  assert.equal(data.settings.sound, false);
  assert.equal(data.records.ace.bestScore, 1234);
  assert.equal(data.records.ace.softest, 0.7);
});

test("setSetting does not throw when localStorage.setItem throws", () => {
  const real = win.localStorage.setItem;
  win.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  try {
    assert.doesNotThrow(() => Store.setSetting("sound", false));
    // In-memory copy still updated.
    assert.equal(Store.getSettings().sound, false);
  } finally {
    win.localStorage.setItem = real;
  }
});

test("recordResult does not throw when localStorage.setItem throws", () => {
  const real = win.localStorage.setItem;
  win.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  try {
    let out;
    assert.doesNotThrow(() => {
      out = Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
    });
    assert.deepEqual(out, { newRecord: true, prevBest: 0 });
    // In-memory record still updated.
    assert.equal(Store.getRecord("commander").bestScore, 5000);
  } finally {
    win.localStorage.setItem = real;
  }
});

// ---- separate difficulties keep separate records -------------------------

test("commander and ace records are independent", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  Store.recordResult("ace", { success: true, score: 9000 }, 0.8);

  const c = Store.getRecord("commander");
  const a = Store.getRecord("ace");
  assert.equal(c.bestScore, 5000);
  assert.equal(c.softest, 1.2);
  assert.equal(a.bestScore, 9000);
  assert.equal(a.softest, 0.8);
});

test("recording into one difficulty does not bump another's mission count", () => {
  Store.recordResult("commander", { success: true, score: 5000 }, 1.2);
  Store.recordResult("commander", { success: false, score: 0 }, 3.0);
  Store.recordResult("ace", { success: true, score: 100 }, 2.0);

  assert.equal(Store.getRecord("commander").missions, 2);
  assert.equal(Store.getRecord("ace").missions, 1);
});

test("both difficulty records coexist in localStorage", () => {
  Store.recordResult("cadet", { success: true, score: 1000 }, 1.0);
  Store.recordResult("ace", { success: true, score: 2000 }, 0.5);
  const data = persisted();
  assert.ok(data.records.cadet);
  assert.ok(data.records.ace);
  assert.equal(data.records.cadet.bestScore, 1000);
  assert.equal(data.records.ace.bestScore, 2000);
});
