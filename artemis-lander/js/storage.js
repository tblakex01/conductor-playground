/* ============================================================
   ARTEMIS · Local persistence
   Stores player preferences (HUD toggles) and per-difficulty
   mission records in localStorage, degrading gracefully to an
   in-memory store when storage is unavailable.
   ============================================================ */
(function (global) {
  "use strict";

  const KEY = "artemis.lander.v1";

  const DEFAULTS = {
    settings: { sound: true, predict: true, graph: true, trail: true },
    records: {},   // keyed by difficulty: { bestScore, softest, missions, landings, crashes }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function read() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return {
        settings: Object.assign({}, DEFAULTS.settings, parsed.settings),
        records: parsed.records || {},
      };
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  function write(data) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* private mode / quota — keep the in-memory copy */ }
  }

  function blankRecord() {
    return { bestScore: 0, softest: null, missions: 0, landings: 0, crashes: 0 };
  }

  const Store = {
    _data: read(),

    // Live settings object — mutated in place so other modules holding a
    // reference (e.g. the Game) observe changes immediately.
    getSettings() { return this._data.settings; },

    setSetting(key, value) {
      this._data.settings[key] = value;
      write(this._data);
    },

    getRecord(diffKey) {
      return this._data.records[diffKey] || blankRecord();
    },

    // Fold a finished mission into the stored record.
    // Returns { newRecord: bool, prevBest: number } for the results screen.
    recordResult(diffKey, result, descend) {
      const r = this._data.records[diffKey] || blankRecord();
      const prevBest = r.bestScore;

      r.missions += 1;
      if (result.success) {
        r.landings += 1;
        if (r.softest == null || descend < r.softest) r.softest = descend;
      } else {
        r.crashes += 1;
      }

      const newRecord = result.success && result.score > prevBest;
      if (newRecord) r.bestScore = result.score;

      this._data.records[diffKey] = r;
      write(this._data);
      return { newRecord: newRecord, prevBest: prevBest };
    },
  };

  global.ARTEMIS = global.ARTEMIS || {};
  global.ARTEMIS.Store = Store;
})(window);
