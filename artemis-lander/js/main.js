/* ============================================================
   ARTEMIS · Bootstrap — wires the DOM screens to the Game.
   ============================================================ */
(function (global) {
  "use strict";

  const { Game } = global.ARTEMIS;

  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("scene");
    const game = new Game(canvas);
    global.ARTEMIS.game = game;   // exposed for debugging / QA

    const $ = (id) => document.getElementById(id);
    const screenStart = $("screen-start");
    const screenEnd = $("screen-end");
    const screenPause = $("screen-pause");
    const hud = $("hud");

    let diff = "commander";

    // ---- Difficulty selection ----
    $("diff-opts").querySelectorAll(".diff__opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("diff-opts").querySelectorAll(".diff__opt").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        diff = btn.getAttribute("data-diff");
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
    const launch = () => game.start(diff);
    $("btn-launch").addEventListener("click", launch);
    $("btn-again").addEventListener("click", launch);

    // ---- Pause ----
    game.on("onPause", (paused) => {
      screenPause.classList.toggle("screen--hidden", !paused);
    });
    $("btn-resume").addEventListener("click", () => game.setPaused(false));
    $("btn-abort").addEventListener("click", () => {
      game.setPaused(false);
      game.state = "menu";
      hud.classList.add("is-hidden");
      screenPause.classList.add("screen--hidden");
      screenStart.classList.remove("screen--hidden");
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

      $("end-stats").innerHTML = result.stats
        .map((s) => `<div class="stat"><div class="stat__label">${s.label}</div><div class="stat__value">${s.value}</div></div>`)
        .join("");

      $("end-score").innerHTML = result.success
        ? `MISSION SCORE · <span class="score__num">${result.score.toLocaleString()}</span>`
        : `<span class="score__num" style="color:var(--red)">NO SCORE</span>`;

      // Brief delay so the crash shake/debris is visible before the panel.
      setTimeout(() => {
        screenEnd.classList.remove("screen--hidden");
      }, result.success ? 700 : 1100);
    });

    // ---- Resize ----
    let rT;
    window.addEventListener("resize", () => {
      clearTimeout(rT);
      rT = setTimeout(() => game.renderer.resize(), 120);
    });
  });
})(window);
