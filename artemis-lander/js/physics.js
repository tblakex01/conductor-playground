/* ============================================================
   ARTEMIS · Lander rigid-body physics
   Semi-implicit Euler integration with mass-varying thrust,
   propellant depletion, and RCS attitude control.
   ============================================================ */
(function (global) {
  "use strict";

  const { CONFIG } = global.ARTEMIS;
  const V = CONFIG.VEHICLE;

  function Lander(state) {
    this.x = state.x;             // world x (m)
    this.y = state.y;             // altitude of landing feet above datum (m)
    this.vx = state.vx;           // m/s (right +)
    this.vy = state.vy;           // m/s (up +)
    this.angle = state.angle || 0;// tilt from vertical (rad, right-lean +)
    this.angVel = 0;              // rad/s
    this.fuel0 = state.fuel;      // initial propellant (kg)
    this.fuel = state.fuel;       // current propellant (kg)
    this.throttle = 0;            // commanded throttle 0..1
    this.effThrottle = 0;         // applied throttle after min-throttle clamp
    this.thrust = 0;              // current thrust (N)
    this.landed = false;
    this.exhaustVel = V.isp * CONFIG.G0;  // m/s
  }

  Lander.prototype.mass = function () {
    return V.dryMass + this.fuel;
  };

  // Integrate one timestep.
  //   input.throttle : commanded throttle 0..1
  //   input.rotate   : -1 (left) .. +1 (right)
  // Returns acceleration magnitude (m/s^2) for HUD display.
  Lander.prototype.update = function (dt, input) {
    if (this.landed) return 0;

    // --- Propellant & thrust ------------------------------------------------
    this.throttle = input.throttle;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.effThrottle = 0;
      this.thrust = 0;
    } else if (this.throttle <= 0.001) {
      this.effThrottle = 0;
      this.thrust = 0;
    } else {
      // A lit engine cannot throttle below its minimum.
      this.effThrottle = Math.max(V.minThrottle, Math.min(1, this.throttle));
      this.thrust = this.effThrottle * V.maxThrust;
    }

    // Burn propellant (constant exhaust velocity rocket equation).
    if (this.thrust > 0) {
      const mdot = this.thrust / this.exhaustVel; // kg/s
      this.fuel = Math.max(0, this.fuel - mdot * dt);
      if (this.fuel === 0) this.thrust = 0;       // ran dry mid-step
    }

    const m = this.mass();

    // --- Attitude (RCS) -----------------------------------------------------
    const rot = input.rotate || 0;
    this.angVel += rot * V.rcsTorque * dt;
    this.angVel -= this.angVel * V.rcsDamping * dt; // passive damping
    this.angle += this.angVel * dt;

    // --- Translation --------------------------------------------------------
    // Thrust acts along the body "up" axis; gravity acts straight down.
    const ax = (this.thrust / m) * Math.sin(this.angle);
    const ay = (this.thrust / m) * Math.cos(this.angle) - CONFIG.MOON_GRAVITY;

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    return Math.hypot(ax, ay + CONFIG.MOON_GRAVITY); // thrust-only accel
  };

  global.ARTEMIS.Lander = Lander;
})(window);
