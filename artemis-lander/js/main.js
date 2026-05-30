/* ============================================================
   ARTEMIS · Bootstrap — wires the DOM screens to the Game.
   ============================================================ */
(function (global) {
  "use strict";

  const { Game, Store } = global.ARTEMIS;

  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("scene");
    const game = new Game(canvas);
    global.ARTEMIS.game = game;   // exposed for debugging / QA

    const $ = (id) => document.getElementById(id);
    const screenStart = $("screen-start");
    const screenEnd = $("screen-end");
    const screenPause = $("screen-pause");
    const hud = $("hud");
    const telCanvas = $("telemetry");
    const bestLine = $("best-line");

    let diff = "commander";

    // ---- HUD toggles (sound / predictor / graph / trail), persisted ----
    const settings = game.settings;          // live, Store-backed reference
    const toggleBtns = {};

    const reflect = (key) => {
      const val = settings[key];
      const btn = toggleBtns[key];
      if (btn) {
        btn.classList.toggle("is-off", !val);
        btn.setAttribute("aria-pressed", String(!!val));
      }
      if (key === "sound") game.audio.setMuted(!val);
      if (key === "graph" && telCanvas) telCanvas.classList.toggle("is-hidden", !val);
    };
    const setSetting = (key, val) => { Store.setSetting(key, val); reflect(key); };

    document.querySelectorAll("#hud-toggles .toggle").forEach((btn) => {
      const key = btn.getAttribute("data-toggle");
      toggleBtns[key] = btn;
      btn.addEventListener("click", () => {
        game.audio.unlock();
        game.audio.click();
        setSetting(key, !settings[key]);
      });
    });
    ["sound", "predict", "graph", "trail"].forEach(reflect);

    // Keyboard shortcuts for the toggles (work on every screen).
    const TOGGLE_KEYS = { KeyM: "sound", KeyG: "predict", KeyB: "graph", KeyT: "trail" };
    window.addEventListener("keydown", (ev) => {
      const key = TOGGLE_KEYS[ev.code];
      if (!key) return;
      game.audio.unlock();
      setSetting(key, !settings[key]);
    });

    // ---- Personal best (briefing screen) ----
    const updateBestLine = () => {
      if (!bestLine) return;
      const r = Store.getRecord(diff);
      bestLine.textContent = r.bestScore
        ? "PERSONAL BEST · " + r.bestScore.toLocaleString() + "   ·   " + r.landings + "/" + r.missions + " LANDED"
        : "NO MISSIONS LOGGED — FLY YOUR FIRST DESCENT";
    };
    updateBestLine();

    // ---- Difficulty selection ----
    $("diff-opts").querySelectorAll(".diff__opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("diff-opts").querySelectorAll(".diff__opt").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        diff = btn.getAttribute("data-diff");
        game.audio.unlock();
        game.audio.click();
        updateBestLine();
      });
    });

    // ---- Show/hide all overlays whenever a mission begins (button OR R key) ----
    game.on("onStart", () => {
      screenStart.classList.add("screen--hidden");
      screenEnd.classList.add("screen--hidden");
      screenPause.classList.add("screen--hidden");
      hud.classList.remove("is-hidden");
    });

    // ---- Launch ----
    const launch = () => {
      game.audio.unlock();      // first user gesture — start the audio context
      game.audio.click();
      game.start(diff);
    };
    $("btn-launch").addEventListener("click", launch);
    $("btn-again").addEventListener("click", launch);

    // ---- Pause ----
    game.on("onPause", (paused) => {
      screenPause.classList.toggle("screen--hidden", !paused);
    });
    $("btn-resume").addEventListener("click", () => { game.audio.click(); game.setPaused(false); });
    $("btn-abort").addEventListener("click", () => {
      game.audio.click();
      game.setPaused(false);
      game.state = "menu";
      hud.classList.add("is-hidden");
      screenPause.classList.add("screen--hidden");
      screenStart.classList.remove("screen--hidden");
      updateBestLine();
    });

    // ---- End of mission ----
    game.on("onEnd", (result) => {
      const badge = $("end-badge");
      const title = $("end-title");
      title.textContent = result.title;
      badge.textContent = result.grade;

      badge.className = "screen__badge " + (result.success ? "screen__badge--good" : "screen__badge--bad");
      title.className = "screen__title screen__title--sm " + (result.success ? "screen__title--good" : "screen__title--bad");

      $("end-msg").textContent = result.message;

      // New-record banner / personal-best context.
      const recEl = $("end-record");
      const rec = result.record || {};
      if (rec.newRecord) {
        recEl.textContent = "★ NEW PERSONAL BEST ★";
        recEl.className = "record-banner is-new";
        recEl.style.display = "";
      } else if (result.success && rec.prevBest) {
        recEl.textContent = "PERSONAL BEST · " + rec.prevBest.toLocaleString();
        recEl.className = "record-banner";
        recEl.style.display = "";
      } else {
        recEl.textContent = "";
        recEl.style.display = "none";
      }
      updateBestLine();

      // Build the stats grid with DOM nodes (no innerHTML) to stay XSS-safe.
      const statsEl = $("end-stats");
      statsEl.textContent = "";
      result.stats.forEach((s) => {
        const cell = document.createElement("div");
        cell.className = "stat";
        const label = document.createElement("div");
        label.className = "stat__label";
        label.textContent = s.label;
        const value = document.createElement("div");
        value.className = "stat__value";
        value.textContent = s.value;
        cell.append(label, value);
        statsEl.append(cell);
      });

      const scoreEl = $("end-score");
      scoreEl.textContent = "";
      const num = document.createElement("span");
      num.className = "score__num";
      if (result.success) {
        scoreEl.append(document.createTextNode("MISSION SCORE · "));
        num.textContent = result.score.toLocaleString();
      } else {
        num.style.color = "var(--red)";
        num.textContent = "NO SCORE";
      }
      scoreEl.append(num);

      // Brief delay so the crash shake/debris is visible before the panel.
      setTimeout(() => {
        screenEnd.classList.remove("screen--hidden");
      }, result.success ? 700 : 1100);
    });

    // ---- Resize ----
    let rT;
    window.addEventListener("resize", () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        game.renderer.resize();
        game.telemetry.resize();
      }, 120);
    });
  });
})(window);
