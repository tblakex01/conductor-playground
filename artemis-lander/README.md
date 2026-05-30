# ARTEMIS · Lunar Descent Simulator

A fully interactive Moon-landing simulator built with vanilla **HTML, CSS, and
JavaScript** — no frameworks, no build step. Pilot a NASA Artemis-inspired Human
Landing System down to the lunar South Pole using realistic Newtonian physics,
a finite propellant budget, and a mission-control-style guidance display.

![Artemis Lunar Descent Simulator](assets/preview.png)

## Features

- **Realistic physics** — true lunar gravity (1.62 m/s²), thrust acting along the
  vehicle's body axis, RCS attitude control with angular damping, and a
  mass-varying rocket equation (burning propellant lightens the vehicle and
  raises acceleration). Fixed-step integration at 120 Hz for stability.
- **Fuel constraints** — propellant is consumed via the Tsiolkovsky relation
  (`ṁ = thrust / (Isp·g₀)`). Run dry and you become a free-falling brick.
- **Guidance system UI** — live altitude, descent rate, lateral velocity,
  downrange distance, attitude, propellant and throttle gauges, vehicle mass,
  an attitude director indicator (artificial horizon), a flight-director
  velocity vector, and a caution-&-warning panel with a master alarm.
- **Three mission profiles** — *Cadet*, *Commander*, and *Ace* vary fuel,
  terrain roughness, pad size, and touchdown limits.
- **Procedural lunar terrain** — fractal height field with a guaranteed flat,
  beacon-lit landing pad, craters, and hazardous slopes off-target.
- **Cinematic rendering** — auto-zooming camera, twinkling starfield, the Earth
  rendered from NASA's public-domain *Blue Marble / Apollo 17* photograph (with
  a procedural fallback), throttle-driven engine plume, RCS puffs, regolith dust
  on approach, and a debris-and-shake crash effect.
- **Scoring** — graded on softness, accuracy, attitude, and remaining fuel,
  multiplied by difficulty. Land dead-centre and feather-soft for a *Precision
  Landing*.
- **Procedural sound** — a throttle-driven engine rumble, RCS cold-gas puffs, a
  master-alarm beep, touchdown thud, crash boom, and a precision-landing chime,
  all synthesised at runtime with the Web Audio API (no audio files). Toggle
  with `M`.
- **Predicted touchdown indicator** — the guidance system forward-integrates
  your current trajectory and paints a colour-coded impact marker (green / amber
  / red) with the predicted descent rate and a dotted approach arc. Toggle `G`.
- **Live telemetry graph** — a mission-control strip chart of altitude and
  descent rate against the safe-landing limit, updating in real time. Toggle `B`.
- **Flight-path trail & post-landing review** — a fading breadcrumb trail tracks
  your descent; on touchdown the full path is redrawn over the terrain, coloured
  by speed, so you can study your approach. Toggle `T`.
- **Personal bests** — best score and landing record are saved per difficulty
  (localStorage) and shown on the briefing screen, with a *New Personal Best*
  banner on the results card.
- **Keyboard and touch controls** — on-screen buttons appear automatically on
  touch devices.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle up (main descent engine) |
| `S` / `↓` | Throttle down |
| `A` / `←` | Rotate left (RCS) |
| `D` / `→` | Rotate right (RCS) |
| `Space` | Cut throttle (abort burn) |
| `0`–`9` | Set throttle to 0–90% |
| `P` / `Esc` | Pause |
| `R` | Restart mission |
| `M` | Sound on / off |
| `G` | Predicted touchdown indicator |
| `B` | Telemetry graph |
| `T` | Flight-path trail |

## Running it

It's a static site — just open `index.html` in any modern browser, or serve the
folder:

```bash
cd artemis-lander
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How to land

1. **Kill your descent rate early.** Gravity is gentle but relentless and there
   is no atmosphere to help you.
2. **Null out lateral velocity** by tilting slightly toward the pad, then
   rotating back to vertical before touchdown.
3. **Watch the propellant gauge** — the caution panel will warn you before it's
   too late.
4. Aim for the cyan target cross between the green beacon lights. Touch down
   under the velocity and tilt limits shown on the briefing screen.

## Project layout

```
artemis-lander/
├── index.html        # markup + HUD/screens
├── css/styles.css    # mission-control styling
└── js/
    ├── config.js     # physical constants, vehicle, difficulty profiles
    ├── utils.js      # math helpers, seeded RNG, image loader
    ├── storage.js    # localStorage: HUD prefs + per-difficulty records
    ├── audio.js      # Web Audio procedural sound effects
    ├── terrain.js    # procedural lunar terrain + queries
    ├── physics.js    # rigid-body lander integration
    ├── renderer.js   # canvas: sky, Earth, terrain, lander, particles,
    │                 #   flight-path trail, predicted-touchdown marker
    ├── telemetry.js  # real-time altitude / descent-rate strip chart
    ├── hud.js        # telemetry + caution/warning binding
    ├── input.js      # keyboard + touch
    ├── game.js       # loop, collision, landing eval, scoring, prediction
    └── main.js       # bootstrap / screen wiring / HUD toggles
```

## Credits

Earth imagery: NASA (public domain) — *The Blue Marble*, Apollo 17.
Built as a self-contained physics demo; not affiliated with NASA.
