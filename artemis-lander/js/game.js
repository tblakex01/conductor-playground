/* ============================================================
   ARTEMIS · Game controller
   Mission setup, fixed-step physics loop, collision & landing
   evaluation, scoring, and screen/state management.
   ============================================================ */
(function (global) {
  "use strict";

  const { U, CONFIG, Terrain, Lander, Renderer, HUD, Input, AudioFX, Telemetry, Store } = global.ARTEMIS;
  const V = CONFIG.VEHICLE;

  function Game(canvas) {
    this.renderer = new Renderer(canvas);
    this.hud = new HUD();
    this.input = new Input();
    this.audio = new AudioFX();
    this.telemetry = new Telemetry(document.getElementById("telemetry"));
    this.settings = Store.getSettings();   // live reference (persisted)

    this.state = "menu";          // menu | flying | paused | ended
    this.diffKey = "commander";
    this.lander = null;
    this.terrain = null;
    this.limits = null;
    this.met = 0;                  // mission elapsed time (s)
    this.phaseLabel = "PRE-LAUNCH";
    this.cmdThrottle = 0;
    this.shake = 0;
    this.path = [];                // flight-path breadcrumb trail
    this.predict = null;           // predicted touchdown {x,y,descend,...}
    this._pathTimer = 0;
    this._gphTimer = 0;
    this._acc = 0;
    this._last = 0;

    this.input.onAction = (name, value) => this._action(name, value);

    this.callbacks = {};          // { onEnd(result) } set by main
    this._loop = this._loop.bind(this);
    requestAnimationFrame((t) => { this._last = t; requestAnimationFrame(this._loop); });
  }

  Game.prototype.on = function (name, fn) { this.callbacks[name] = fn; };

  // ---- Mission setup --------------------------------------------------------
  Game.prototype.start = function (diffKey) {
    this.diffKey = diffKey || this.diffKey;
    const prof = CONFIG.DIFFICULTY[this.diffKey];
    const rng = U.makeRng((Date.now() & 0xffffff) ^ 0x9e3779b9);

    const padCenterX = CONFIG.WORLD.width / 2 + U.randRange(rng, -260, 260);
    this.terrain = new Terrain({
      roughness: prof.terrainRoughness,
      padHalfWidth: prof.padHalfWidth,
      padCenterX,
      seed: (rng() * 1e9) | 0,
    });

    const side = rng() < 0.5 ? -1 : 1;
    const startX = padCenterX + side * CONFIG.START.downrange;
    const surfH = this.terrain.heightAt(startX);
    const vx = -side * U.randRange(rng, prof.startVxRange[0], prof.startVxRange[1]);

    this.lander = new Lander({
      x: startX,
      y: surfH + CONFIG.START.altitude,
      vx,
      vy: CONFIG.START.vy,
      angle: U.rad(U.randRange(rng, -4, 4)),
      fuel: prof.fuel,
    });

    const L = CONFIG.LIMITS;
    const s = prof.limitScale;
    this.limits = {
      safeVy: L.safeVy * s,
      safeVx: L.safeVx * s,
      perfectVy: L.perfectVy * s,
      perfectVx: L.perfectVx * s,
      maxTilt: prof.tilt,
    };

    this.met = 0;
    this.cmdThrottle = 0;
    this.shake = 0;
    this.result = null;
    this.phaseLabel = "BRAKING";
    this.path = [];
    this.predict = null;
    this._pathTimer = 0;
    this._gphTimer = 0;
    this.telemetry.reset();

    this.renderer.setScene(this.terrain, this.lander);
    this.hud.clearAlarms();
    this.hud.update(this);
    this.state = "flying";
    if (this.callbacks.onStart) this.callbacks.onStart();
  };

  // ---- Discrete actions -----------------------------------------------------
  Game.prototype._action = function (name, value) {
    if (name === "pause") {
      if (this.state === "flying") this.setPaused(true);
      else if (this.state === "paused") this.setPaused(false);
      return;
    }
    if (name === "restart") {
      if (this.state === "flying" || this.state === "paused" || this.state === "ended") {
        this.setPaused(false);
        this.start(this.diffKey);
      }
      return;
    }
    if (this.state !== "flying") return;
    if (name === "cut") this.cmdThrottle = 0;
    if (name === "setThrottle") this.cmdThrottle = U.clamp(value, 0, 1);
  };

  Game.prototype.setPaused = function (on) {
    if (on && this.state === "flying") {
      this.state = "paused";
      if (this.callbacks.onPause) this.callbacks.onPause(true);
    } else if (!on && this.state === "paused") {
      this.state = "flying";
      if (this.callbacks.onPause) this.callbacks.onPause(false);
    }
  };

  // ---- Main loop ------------------------------------------------------------
  Game.prototype._loop = function (t) {
    let dt = (t - this._last) / 1000;
    this._last = t;
    if (dt > 0.1) dt = 0.1;       // clamp after tab switches

    if (this.state === "flying") {
      this._acc += dt;
      const STEP = 1 / 120;
      let guard = 0;
      while (this._acc >= STEP && guard < 16) {
        this._physics(STEP);
        this._acc -= STEP;
        guard++;
        if (this.state !== "flying") break;
      }
      this.hud.update(this);
      this._postFrame(dt);
    } else {
      // Silence the engine and master alarm whenever we're not flying.
      this.audio.setEngine(0);
      this.audio.setAlarm(false);
    }

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    const frozen = this.state === "ended" || this.state === "paused";
    if (this.terrain && this.lander) {
      // Shake is applied inside render(), after the background is cleared,
      // so clearRect is never offset (no uncleared bands at the edges).
      this.renderer.render(dt, {
        frozen: frozen,
        shake: this.shake,
        predict: this.state === "flying" ? this.predict : null,
        path: this.settings.trail ? this.path : null,
        review: this.state === "ended",
      });
      if (this.settings.graph && this.limits) this.telemetry.draw(this.limits);
    }
    requestAnimationFrame(this._loop);
  };

  // ---- Per-frame work that isn't fixed-step physics ------------------------
  // Drives the engine/alarm audio, records the flight path + telemetry
  // samples, and recomputes the predicted touchdown.
  Game.prototype._postFrame = function (dt) {
    const l = this.lander;

    this.audio.setEngine(l.effThrottle);
    this.audio.setAlarm(this.hud.masterOn);
    if (this.input.rotate() !== 0) this.audio.rcs();

    this._pathTimer += dt;
    if (this._pathTimer >= 0.12) {
      this._pathTimer = 0;
      this.path.push({ x: l.x, y: l.y, s: Math.hypot(l.vx, l.vy) });
      if (this.path.length > 600) this.path.shift();
    }

    this._gphTimer += dt;
    if (this._gphTimer >= 0.1) {
      this._gphTimer = 0;
      const gh = this.terrain.heightAt(l.x);
      this.telemetry.sample(Math.max(0, l.y - gh), l.vy);
    }

    this.predict = this.settings.predict ? this._computePrediction() : null;
  };

  // Forward-integrate the current state (throttle/attitude held constant,
  // mass frozen) to estimate where and how hard the lander will touch down.
  // Returns null when no impact lies within the horizon (e.g. climbing).
  Game.prototype._computePrediction = function () {
    const l = this.lander;
    if (l.landed) return null;
    const m = l.mass();
    const ax0 = (l.thrust / m) * Math.sin(l.angle);
    const ay0 = (l.thrust / m) * Math.cos(l.angle) - CONFIG.MOON_GRAVITY;

    let x = l.x, y = l.y, vx = l.vx, vy = l.vy;
    const dt = 0.06;
    const pts = [];
    // Horizon (~48 s) comfortably covers a full ballistic descent from the
    // 1100 m start; a thrusting-upward state simply never impacts -> null.
    for (let i = 0; i < 800; i++) {
      vx += ax0 * dt; vy += ay0 * dt;
      x += vx * dt; y += vy * dt;
      if (x < 30 || x > CONFIG.WORLD.width - 30) break;
      if (i % 8 === 0) pts.push({ x: x, y: y });
      const gh = this.terrain.heightAt(x);
      if (y <= gh) {
        const lim = this.limits;
        const descend = -vy;
        const onPad = this.terrain.isOnPad(x);
        const slope = Math.abs(U.deg(this.terrain.slopeAt(x)));
        const safe = descend <= lim.safeVy && Math.abs(vx) <= lim.safeVx &&
          !(!onPad && slope > 12);
        const good = onPad && descend <= lim.perfectVy && Math.abs(vx) <= lim.perfectVx;
        pts.push({ x: x, y: gh });
        return { x: x, y: gh, descend: descend, vx: vx, onPad: onPad, safe: safe, good: good, points: pts };
      }
    }
    return null;
  };

  // ---- Physics step + collision --------------------------------------------
  Game.prototype._physics = function (dt) {
    const l = this.lander;

    // Apply held throttle/rotate intent.
    this.cmdThrottle = U.clamp(
      this.cmdThrottle + this.input.throttleDelta() * V.throttleRate * dt, 0, 1
    );
    l.update(dt, { throttle: this.cmdThrottle, rotate: this.input.rotate() });

    this.met += dt;

    // Keep within world bounds horizontally before any terrain query, so
    // groundH, the phase label, the touchdown snap, and _evaluateLanding
    // (isOnPad / slopeAt) all sample the same x coordinate.
    l.x = U.clamp(l.x, 30, CONFIG.WORLD.width - 30);

    // Phase label by altitude.
    const groundH = this.terrain.heightAt(l.x);
    const alt = l.y - groundH;
    this.phaseLabel = alt > 500 ? "BRAKING" : alt > 150 ? "APPROACH" : "TERMINAL";

    // Ground contact.
    if (l.y <= groundH) {
      l.y = groundH;
      this._evaluateLanding();
    }
  };

  // ---- Landing evaluation & scoring ----------------------------------------
  Game.prototype._evaluateLanding = function () {
    const l = this.lander;
    const t = this.terrain;
    const lim = this.limits;
    const descend = -l.vy;
    const ax = Math.abs(l.vx);
    const tilt = Math.abs(U.deg(l.angle));
    const onPad = t.isOnPad(l.x);
    const slope = Math.abs(U.deg(t.slopeAt(l.x)));
    const distToCenter = Math.abs(l.x - t.padCenterX);

    l.landed = true;
    l.vx = 0; l.vy = 0; l.angVel = 0;
    this.cmdThrottle = 0;

    const tooFast = descend > lim.safeVy || ax > lim.safeVx;
    const tooTilted = tilt > lim.maxTilt;
    const badGround = !onPad && slope > 12;
    const crash = tooFast || tooTilted || badGround;

    let result;
    if (crash) {
      this.shake = 1;
      this._spawnDebris();
      this.audio.crash();
      const reasons = [];
      if (descend > lim.safeVy) reasons.push("excessive descent rate");
      if (ax > lim.safeVx) reasons.push("excessive lateral velocity");
      if (tooTilted) reasons.push("attitude beyond limits");
      if (badGround) reasons.push("touchdown on hazardous terrain");
      result = {
        success: false,
        grade: "MISSION FAILURE",
        title: "VEHICLE LOST",
        message:
          "Hard impact — " + reasons.join(", ") + ". The lander did not survive touchdown.",
        stats: this._stats(descend, ax, tilt, onPad),
        score: 0,
      };
    } else {
      this.shake = Math.min(0.5, descend / lim.safeVy * 0.4);
      const perfect =
        onPad && descend <= lim.perfectVy && ax <= lim.perfectVx && tilt <= lim.maxTilt * 0.4;

      // ----- Score -----
      const fuelFrac = l.fuel / l.fuel0;
      const softness = 1 - U.clamp(descend / lim.safeVy, 0, 1);
      const lateral = 1 - U.clamp(ax / lim.safeVx, 0, 1);
      const upright = 1 - U.clamp(tilt / lim.maxTilt, 0, 1);
      const accuracy = onPad ? 1 - U.clamp(distToCenter / t.padHalfWidth, 0, 1) : 0;
      const diffMult = { cadet: 1, commander: 1.35, ace: 1.8 }[this.diffKey];

      let score =
        1000 +
        fuelFrac * 1600 +
        softness * 700 +
        lateral * 500 +
        upright * 400 +
        (onPad ? 600 + accuracy * 600 : 0);
      if (perfect) score += 1200;
      score = Math.round(score * diffMult);

      this.audio.touchdown(softness);
      if (perfect) this.audio.chime();

      let grade, title, message;
      if (perfect) {
        grade = "★★★ PRECISION LANDING";
        title = "PERFECT TOUCHDOWN";
        message =
          "Flawless. Feather-soft contact dead-centre on the pad. Mission Control is on its feet.";
      } else if (onPad) {
        grade = "★★ ON-TARGET";
        title = "TOUCHDOWN";
        message =
          "Solid landing on the designated pad. The Artemis lander is safe on the lunar surface.";
      } else {
        grade = "★ SAFE — OFF TARGET";
        title = "LANDED OFF-PAD";
        message =
          "You touched down safely, but missed the landing pad by " +
          Math.round(distToCenter) + " m. The crew is fine — the cargo will need a longer walk.";
      }

      result = {
        success: true,
        grade, title, message,
        stats: this._stats(descend, ax, tilt, onPad),
        score,
      };
    }

    this.predict = null;
    result.record = Store.recordResult(this.diffKey, result, descend);

    this.result = result;
    this.phaseLabel = result.success ? "TOUCHDOWN" : "FAILURE";
    this.state = "ended";
    this.hud.update(this);
    if (this.callbacks.onEnd) this.callbacks.onEnd(result);
  };

  Game.prototype._stats = function (descend, ax, tilt, onPad) {
    return [
      { label: "DESCENT RATE", value: descend.toFixed(2) + " m/s" },
      { label: "LATERAL VEL", value: ax.toFixed(2) + " m/s" },
      { label: "TILT", value: tilt.toFixed(1) + "°" },
      { label: "FUEL LEFT", value: Math.round(this.lander.fuel) + " kg" },
      { label: "ON PAD", value: onPad ? "YES" : "NO" },
      { label: "MISSION TIME", value: U.formatMET(this.met) },
    ];
  };

  Game.prototype._spawnDebris = function () {
    const l = this.lander;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI;
      const spd = 30 + Math.random() * 120;
      this.renderer.dust.push({
        x: l.x + (Math.random() - 0.5) * 16,
        y: l.y + Math.random() * 30,
        vx: Math.cos(a) * spd * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(a) * spd,
        age: 0, max: 0.8 + Math.random() * 0.9,
        r: 1.5 + Math.random() * 3.5,
      });
    }
  };

  global.ARTEMIS.Game = Game;
})(window);
