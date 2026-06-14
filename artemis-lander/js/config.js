/* ============================================================
   ARTEMIS · Configuration & physical constants
   All physical values are in SI units (metres, seconds, kg, N).
   ============================================================ */
(function (global) {
  "use strict";

  const CONFIG = {
    // --- Physical constants -------------------------------------------------
    MOON_GRAVITY: 1.62,        // m/s^2 — lunar surface gravity
    G0: 9.80665,               // m/s^2 — standard gravity (for Isp -> exhaust velocity)

    // --- Vehicle (Artemis HLS-inspired, scaled for playability) ------------
    VEHICLE: {
      dryMass: 6200,           // kg — structure + payload, no propellant
      maxThrust: 45000,        // N  — descent engine at 100% throttle
      minThrottle: 0.10,       // engines that are lit cannot go below ~10%
      isp: 311,                // s  — specific impulse (LOX/LH2-class)
      throttleRate: 1.1,       // throttle units per second when holding W/S
      rcsTorque: 1.7,          // rad/s^2 — rotational authority of RCS
      rcsDamping: 0.4,         // passive angular damping (1/s)
      maxLandingTilt: 8,       // deg — survivable tilt at touchdown (Commander)
    },

    // --- Touchdown limits (Commander baseline; scaled per difficulty) ------
    LIMITS: {
      safeVy: 3.0,             // m/s — max vertical speed for a safe landing
      safeVx: 1.5,             // m/s — max lateral speed
      perfectVy: 1.2,          // m/s — "perfect" vertical speed threshold
      perfectVx: 0.6,          // m/s — "perfect" lateral threshold
    },

    // --- Initial flight state ----------------------------------------------
    START: {
      altitude: 1100,          // m — starting altitude above mean surface
      vy: -22,                 // m/s — initial descent rate (negative = down)
      vxRange: [6, 14],        // m/s — random initial lateral drift
      downrange: 720,          // m — horizontal offset from the landing pad
    },

    // --- World / rendering --------------------------------------------------
    WORLD: {
      width: 4200,             // m — total terrain span
      padHalfWidth: 26,        // m — half-width of the landing pad
      surfaceY: 0,             // m — datum for the surface
    },

    // --- Difficulty profiles (multipliers / overrides) ---------------------
    DIFFICULTY: {
      cadet: {
        label: "CADET",
        fuel: 5200,            // kg of propellant
        limitScale: 1.6,       // softer touchdown limits
        terrainRoughness: 0.55,
        padHalfWidth: 40,
        startVxRange: [3, 8],
        tilt: 14,
      },
      commander: {
        label: "COMMANDER",
        fuel: 3400,
        limitScale: 1.0,
        terrainRoughness: 1.0,
        padHalfWidth: 26,
        startVxRange: [6, 14],
        tilt: 8,
      },
      ace: {
        label: "ACE",
        fuel: 2350,
        limitScale: 0.7,
        terrainRoughness: 1.55,
        padHalfWidth: 18,
        startVxRange: [10, 20],
        tilt: 6,
      },
    },

    // --- NASA imagery (loaded by the user's browser; graceful fallback) -----
    // "Blue Marble 2012" is a true-colour VIIRS composite released by NASA and
    // is in the public domain. A trimmed copy is bundled locally so the real
    // photograph always shows (no CORS / hot-link / offline surprises); the
    // remote NASA image-library URLs below act as higher-resolution fallbacks.
    ASSETS: {
      earth: [
        "assets/earth-blue-marble.jpg",
        "https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e001788/GSFC_20171208_Archive_e001788~medium.jpg",
        "https://images-assets.nasa.gov/image/as17-148-22727/as17-148-22727~medium.jpg",
      ],
    },
  };

  global.ARTEMIS = global.ARTEMIS || {};
  global.ARTEMIS.CONFIG = CONFIG;
})(window);
