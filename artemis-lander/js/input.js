/* ============================================================
   ARTEMIS · Input — keyboard + on-screen touch controls
   Exposes continuously-held state (throttle / rotate intent)
   plus discrete action callbacks (pause, restart, set throttle).
   ============================================================ */
(function (global) {
  "use strict";

  function Input() {
    this.held = Object.create(null);
    this.onAction = function () {};       // (name, value)
    this._bind();
  }

  const HELD_KEYS = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
  };

  Input.prototype._bind = function () {
    window.addEventListener("keydown", (ev) => {
      // Prevent page scroll on the control keys.
      if (HELD_KEYS[ev.code] || ev.code === "Space") ev.preventDefault();

      if (HELD_KEYS[ev.code]) { this.held[HELD_KEYS[ev.code]] = true; return; }
      if (ev.repeat) return;

      switch (ev.code) {
        case "Space": this.onAction("cut"); break;
        case "KeyP": case "Escape": this.onAction("pause"); break;
        case "KeyR": this.onAction("restart"); break;
        default:
          if (ev.code.startsWith("Digit")) {
            const d = parseInt(ev.code.slice(5), 10);
            if (!isNaN(d)) this.onAction("setThrottle", d / 9);
          }
      }
    });

    window.addEventListener("keyup", (ev) => {
      if (HELD_KEYS[ev.code]) this.held[HELD_KEYS[ev.code]] = false;
    });

    // Touch / pointer buttons (data-key -> synthesised held intent).
    const MAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    document.querySelectorAll("[data-key]").forEach((btn) => {
      const intent = MAP[btn.getAttribute("data-key")];
      const set = (v) => (ev) => { ev.preventDefault(); this.held[intent] = v; };
      btn.addEventListener("pointerdown", set(true));
      btn.addEventListener("pointerup", set(false));
      btn.addEventListener("pointerleave", set(false));
      btn.addEventListener("pointercancel", set(false));
    });

    // Detect touch capability to reveal on-screen controls.
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      document.body.classList.add("is-touch");
    }
    window.addEventListener("touchstart", () => {
      document.body.classList.add("is-touch");
    }, { once: true, passive: true });
  };

  // Net rotation intent: -1 left, +1 right, 0 none.
  Input.prototype.rotate = function () {
    return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
  };
  // Throttle change intent: +1 up, -1 down.
  Input.prototype.throttleDelta = function () {
    return (this.held.up ? 1 : 0) - (this.held.down ? 1 : 0);
  };

  global.ARTEMIS.Input = Input;
})(window);
