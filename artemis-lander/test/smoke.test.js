import test from "node:test";
import assert from "node:assert/strict";
import { ARTEMIS, freshGame } from "./harness.js";

test("harness loads the full ARTEMIS namespace", () => {
  for (const k of ["CONFIG", "U", "Store", "AudioFX", "Terrain", "Lander", "Renderer", "Telemetry", "HUD", "Input", "Game"]) {
    assert.ok(ARTEMIS[k], `ARTEMIS.${k} should be defined`);
  }
});

test("a Game can be constructed and started without throwing", () => {
  const g = freshGame();
  assert.equal(g.state, "menu");
  g.start("commander");
  assert.equal(g.state, "flying");
  assert.ok(g.lander && g.terrain && g.limits);
});
