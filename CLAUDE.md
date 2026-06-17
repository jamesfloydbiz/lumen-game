# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained browser-game repo (no framework, no build step). The repo has been
reconcepted many times (LUMEN → PICNIC → FLOW → Monkey Business) — **always read the current
files before assuming the theme.**

- **Root = `Monkey Business`** (the active game): an **open-world** zoo-breach defense + **free-form
  base builder**. A follow-cam tracks a roaming zookeeper across a **chunk-streamed** world. You
  **start with only the banana pile + keeper** (no base) and **build it out yourself** — pick a tool
  from the bottom tray, walk to a spot, tap **Build** to place it and pay **bananas**. **No plots, no grid.**
  **Bananas are the ONE resource — money AND lives** (the pile = your treasury); spend to build, monkeys
  steal them, lose at zero. Place towers, **banana farms** (passive income, but ONLY when chained to the
  pile by **Supply Lines** — logistics), and **paid wall blocks** (leave gaps for gates); upgrade by
  standing on a structure and tapping Upgrade. Net the monkeys (trap, never harm)
  that raid the pile; a wave-end truck carts trapped ones home, paying a bounty and returning any
  banana they grabbed. Monkeys come from **fixed themed spawn points** — Jungle (SW), then Mountains
  (NE), then the Zoo gate (E) — across **100 waves** (boss every 10th). Lose when the pile empties.
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

**Coordinate system:** world units are meters; the **core banana pile sits at the origin**. The
sim is 2D on the ground plane; sim `(x, y)` maps to 3D `(x, 0, y)`. The world is open — the hero
roams freely (clamped to `worldClamp`) and a follow-cam trails them.

**Free-form building (NO plots/grid).** You start with nothing built. `CONFIG.build` is the tool
catalogue (towers + `farm` + `wall`), each with `cost(lv)`/`stat(lv)`/`foot` (footprint radius) and
`max` levels. `game.tool` is the selected tool; `ghostPos()` snaps the hero's position to `CONFIG.snap`.
`canPlace(type,x,y)` checks afford + not in `coreClear` of the pile + not `inWater` + not `occupied`
(min spacing `snap*0.9`). `placeTool()` pays `cost(1)` and pushes to `game.structures` (towers/farm/etc.)
or `game.wallBlocks` (walls). `doUpgrade()` upgrades the structure within `hero.buildReach`. `rebuildDerived()`
rebuilds the lists the sim reads (`netTowers`/`decoys`/`cages`/`muds`/`farms`/`trainees`/`ecoRate`) from
`game.structures`. Render is stateless-ish: `syncStructures`/`syncWalls` create a mesh per item lazily
(rebuild when `s._dirty` after upgrade); `setGhost`/`clearGhost` draw the green/red placement preview.

**Progressive unlocks** (`CONFIG.startUnlocks` = net/farm/wall; `unlockByWave` = trainee/cage/decoy/mud):
`checkUnlocks()` in `nextWave` adds tools with a toast; the tray (`syncTray`) greys locked/unaffordable chips.

**Walls & water.** Wall blocks (`game.wallBlocks`, radius `CONFIG.build.wall.foot`) block **monkeys only**
via `collideWalls` (they seek the pile and slide around blocks to the gaps you leave); `def.climb` monkeys
(gorilla) ignore walls. **The keeper passes through his own walls** — do NOT collide the hero with walls,
or laying a wall line is impossible (you place one ahead, then get stuck on it). The stream (`CONFIG.water`)
isn't a wall: off the bridge it just **slows** the keeper to `CONFIG.waterSlow` (no push-out). Placement
sits `CONFIG.placeAhead` in front of the keeper (via `hero.face`, the travel heading) so you never build on
yourself. `collideWalls` handles degenerate `d==0` by pushing along an axis — keep it.

**Spawn points are fixed & themed** (`CONFIG.regions[*].sx/sy`, act-gated by `CONFIG.acts`): Jungle (SW),
Mountains (NE, wave 34), Zoo gate (E, wave 67). `spawn()` emits at the active region's point (+jitter);
monkeys flee back to their spawn point. `render.buildSpawnMarkers(frontiers)` plants a banner/arrow there.

**Monkey lifecycle:** `incoming → grab → fleeing → trapped`. A monkey grabs from the pile (or a
decoy), flees back out toward its spawn direction; escaping with a real banana loses it
permanently, but a **trapped** carrier returns its banana when the truck loads it. The truck runs
as a `phase==='truck'` sub-state machine (`in → load → out`), driving to the core from `-y`.

## Gotchas (these have bitten before — verify, don't assume)

- **`preview_eval` cannot see top-level `class`/`const` globals** (`Game`, `CONFIG`, …) reliably,
  even though they work in the page. To test, inject a real `<script>` that does the work and writes
  results to `window.__r`, then read `window.__r`. (`window.game` may resolve to the `<canvas id="game">`
  element, not the instance — check `instanceof`.)
- **The headless preview throttles `requestAnimationFrame`** when the tab isn't visible, so real-time
  movement won't show in screenshots. Verify gameplay by calling `game.update(1/60)` in a loop via an
  injected script, then screenshot a stepped state.
- **Three.js r128 has no `CapsuleGeometry`** — guard with `THREE.CapsuleGeometry ? new … : new CylinderGeometry(…)`.
- **Use `THREE.NoToneMapping`** — ACES tonemapping washed the cartoon colors out. Keep **fog far
  back** (~300–640) — a near fog plane greys the whole follow-cam frame into haze.
- **Build UI is the HTML tray** (`#build`/`#tray`/`#buildBtn`/`#upgradeBtn`), not in-world labels.
  `selectTool(type)` **toggles** (tapping the selected tool deselects) — when driving placement from a
  test, set `game.tool=type` directly instead, or repeated `selectTool` calls cancel each other out.
- **Headless screenshots:** because rAF is throttled when the tab is hidden, after you step the sim
  with `game.update(1/60)` in a loop, manually call the render syncs + `game.render.followCam(hero,1)`
  + `game.render.draw()` in the same eval before `preview_screenshot`, or you'll capture a stale frame.
- The preview occasionally fails to start with `spawn …/disclaimer ENOENT`; it's transient — just call
  `preview_start` again, no config change needed.

## Conventions

Code is terse, single-file-per-layer, heavy use of one-liners and shared globals — match that
density rather than refactoring into modules/classes per concept. Put new balance/content in
`config.js`, new visuals in `render.js`, new behavior in `game.js`. Commit only when asked; this is
a private repo (`github.com/jamesfloydbiz/lumen-game`).
