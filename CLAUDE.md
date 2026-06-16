# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained browser-game repo (no framework, no build step). The repo has been
reconcepted many times (LUMEN → PICNIC → FLOW → Monkey Breach) — **always read the current
files before assuming the theme.**

- **Root = `Monkey Breach`** (the active game): a Kingshot-style zoo-breach defense. Steer a
  zookeeper, stand on build pads to spend coins, net escaping monkeys (trap, never harm), and
  a wave-end truck carts the trapped ones home. The stealable **banana pile** is the core.
- **`crowd-control/`** = an archived earlier prototype (FLOW, a crowd-safety tycoon). Fully
  self-contained; don't touch it unless asked. Served at `/crowd-control/`.

## Commands

```bash
bun run serve         # static server on http://localhost:4173 (serves repo root; crowd-control at /crowd-control/)
# or: python3 -m http.server 4173   (run from repo root)

# "tests" = syntax-check each module (no test framework; bun is the parser of record):
bun build js/game.js --outdir /tmp/x      # repeat per file in js/; clean output == parses
```

There is no lint/test/build toolchain. The only dependency, **Three.js r128**, is vendored at
`js/vendor/three.min.js` (UMD global `THREE`). Scripts load as classic `<script>` tags in this
order — order matters because globals are shared: `three → util → config → render → game`.

## Architecture (the big picture)

Three layers, each its own file, wired by a single rAF loop in `game.js`:

- **`js/config.js`** — ALL tuning + content as one `CONFIG` object plus `PAD_LAYOUT`: monkey
  archetypes, `waveSpec(n)`, build-pad definitions (`CONFIG.pads`, each with `cost(lv)`/`stat(lv)`),
  the banana count, breach positions, field size. Start here to rebalance anything.
- **`js/render.js`** — the entire 3D scene (Three.js). A steep operator's-eye camera; procedural
  meshes for fence/breach, lane, banana pile, monkeys (netted bundles when trapped), hero, towers,
  and the truck. Also draws the dashed build pads and projects their HTML labels (`#padlabels`).
  Render is **read-only over sim state** — it never mutates game logic.
- **`js/game.js`** — the simulation + orchestration: hero movement (joystick + WASD), the
  stand-on-pad funding loop, monkey AI, nets, towers, the wave→truck→next-wave flow, economy, HUD,
  and win/lose. Owns all mutable state as plain objects/arrays.
- **`js/util.js`** — `U.*` math/easing/RNG helpers, `TAU`, and a tiny WebAudio `SFX` kit. Shared
  verbatim with the archived game.

**The loop contract** (same in both games): `loop()` → `dt = min(0.033, …)` → `update(dt)` (only
while playing) → render syncs from state → `renderer.render`. Keep sim deterministic and
render-agnostic so it can be stepped headlessly for testing (see below).

**Coordinate system:** world units are meters, origin at center. The sim is 2D on the ground
plane; sim `(x, y)` maps to 3D `(x, 0, y)`. In Monkey Breach the breach/spawn is at `-y` (top of
screen) and the banana pile is at `+y` (bottom).

**Build-pad pattern** (reused across games): pads are fixed ground positions with `level`/`invested`
(initialize both to 0 — forgetting `invested:0` yields `NaN` costs). Standing the hero within
`padReach` drains coins into the nearest pad until it builds/upgrades; `applyPad()` then rebuilds
the derived tower lists the sim reads (`rebuildTowers()` etc.). No free placement, no rotation.

**Monkey lifecycle:** `incoming → grab → fleeing → trapped`. A monkey grabs from the pile (or a
decoy), flees to the nearest breach; escaping with a real banana loses it permanently, but a
**trapped** carrier returns its banana when the truck loads it. The truck runs as a `phase==='truck'`
sub-state machine (`in → load → out`).

## Gotchas (these have bitten before — verify, don't assume)

- **`preview_eval` cannot see top-level `class`/`const` globals** (`Game`, `CONFIG`, …) reliably,
  even though they work in the page. To test, inject a real `<script>` that does the work and writes
  results to `window.__r`, then read `window.__r`. (`window.game` may resolve to the `<canvas id="game">`
  element, not the instance — check `instanceof`.)
- **The headless preview throttles `requestAnimationFrame`** when the tab isn't visible, so real-time
  movement won't show in screenshots. Verify gameplay by calling `game.update(1/60)` in a loop via an
  injected script, then screenshot a stepped state.
- **Three.js r128 has no `CapsuleGeometry`** — guard with `THREE.CapsuleGeometry ? new … : new CylinderGeometry(…)`.
- **Use `THREE.NoToneMapping`** — ACES tonemapping washed the cartoon colors out.
- The preview occasionally fails to start with `spawn …/disclaimer ENOENT`; it's transient — just call
  `preview_start` again, no config change needed.

## Conventions

Code is terse, single-file-per-layer, heavy use of one-liners and shared globals — match that
density rather than refactoring into modules/classes per concept. Put new balance/content in
`config.js`, new visuals in `render.js`, new behavior in `game.js`. Commit only when asked; this is
a private repo (`github.com/jamesfloydbiz/lumen-game`).
