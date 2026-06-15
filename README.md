# PICNIC — Hold the Line

A bright, **3D** wave-defense tycoon for the browser. It's a perfect afternoon —
until the ants show up. You're the **ladybug** on cake duty: zap the swarm,
gather the **crumbs** they drop, and pour those crumbs into glowing pads around
the blanket to build **Sprinklers**, a **Salt Line** wall, a **Firefly** swarm,
and your own power — surviving **100 escalating waves** of ants, beetles, wasps,
and the occasional **Hornet** boss.

Same core loop as the classic "knights-vs-conquerors" survival-tycoon (move →
squish → collect → build → survive), reskinned to something everyone knows: a
picnic you refuse to surrender. Rendered in real 3D with soft sunlight, shadows,
and a checkered-blanket arena.

> No build step. Three.js is vendored locally, so it's just `<script>` tags + a `<canvas>`.

---

## Play

Serve the folder over `http://` and open it:

```bash
bun run serve        # → http://localhost:4173
# or, with Python, from inside this folder:
python3 -m http.server 4173
```

(3D loads via local `js/vendor/three.min.js`, so an offline static server is all you need.)

### Controls
- **Move:** `WASD` / arrow keys, or drag anywhere (touch / mouse) for a floating joystick.
- **Attack:** automatic — the ladybug zaps the nearest bug in range.
- **Build:** stand on a glowing pad; your crumbs pour in until it builds or upgrades.
- **Pause:** `Esc` or the pause button (sound toggle lives in the pause menu).

---

## The loop

1. **Squish bugs.** Ants, scouts, beetles and wasps stream in from the grass toward the cake.
   Kill them and they pop into crumbs (currency).
2. **Gather crumbs.** Walk near them to draw them in (upgrade *Forage* to pull from farther).
3. **Build the fortress.** Pads ring the cake with wide walking lanes between them:
   - **Sprinkler** — auto-firing turret (6 slots, 6 levels each)
   - **Firefly** / **Glow** — an orbiting swarm that fires with you, and its power
   - **Salt Line** — a regenerating wall ring the bugs must chew through
   - **Sting / Buzz / Wings / Forage** — your damage, fire-rate, speed, pickup range
   - **Tier / Frosting** — the cake's max HP and regeneration
   - **Bug Spray** — a periodic shockwave that clears the blanket
4. **Unlock more.** New pads and bigger tiers open up as you progress.
5. **Survive to 100.** Difficulty scales every wave; a boss **Hornet** arrives every 10th.

Win by carrying the cake through wave 100.

---

## Tuning

All balance lives in [`js/config.js`](js/config.js) — pest stats, the per-wave
scaling curves (`hpMul`, `dmgMul`, `bountyMul`, `waveCount`, boss HP), the pad
layout, and every build blueprint's cost/stat tables. The curve is tuned so a
competent player out-scales the swarm in the mid-game and pushes a near-max base
+ 10-Firefly swarm through the final boss (verified end-to-end with headless
auto-play sims).

## Structure

```
index.html        # shell + HUD/overlay markup + projected pad labels
css/style.css     # the whole look (sunny glass UI, type)
js/vendor/three.min.js  # Three.js r128 (vendored, UMD global)
js/util.js        # math, easing, RNG, tiny WebAudio SFX
js/config.js      # ALL balance + build blueprints + pad layout
js/game.js        # simulation (waves/economy/combat/build) + the 3D renderer
serve.mjs         # optional tiny static server (Bun)
```

The deterministic simulation is renderer-agnostic; `game.js` maps sim coords
`(x, y)` onto the ground plane `(x, z)` and drives a Three.js scene over it.

Built as a self-contained study — kept deliberately separate from everything else.
