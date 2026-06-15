# LUMEN — Keeper of the Last Light

A minimalist, glow-on-indigo **wave-defense tycoon** for the browser. You are a
luminous **Keeper** defending the **Heartlight** from the encroaching **Dusk**.
Move through the dark, shatter Dusk creatures into **motes** of light, and pour
those motes into glowing build-pads to grow Spires, Light Barriers, a Wisp army,
and your own power — across **100 escalating waves**.

It's a cleaner, stranger cousin of the "knights vs. conquerors" survival-tycoon
format: same core loop (move → kill → collect → build → survive), reimagined with
an Apple-keynote aesthetic — deep indigo, soft bloom, frosted glass, no clutter.

> Zero dependencies. Zero build step. It's three `<script>` tags and a `<canvas>`.

---

## Play

Open `index.html` in any modern browser. That's it.

To serve it locally (so everything loads over `http://`):

```bash
bun run serve        # → http://localhost:4173
# or, with Python:
python3 -m http.server 4173   # run from inside this folder
```

### Controls
- **Move:** `WASD` / arrow keys, or drag anywhere (touch / mouse) for a floating joystick.
- **Attack:** automatic — the Keeper fires at the nearest Dusk in range.
- **Build:** stand on a glowing pad; your motes pour in until it builds or upgrades.
- **Pause:** `Esc` or the pause button (sound toggle lives in the pause menu).

---

## The loop

1. **Shatter the Dusk.** Enemies stream in from the edge toward the Heartlight.
   Kill them and they burst into motes (gold).
2. **Gather light.** Walk near motes to draw them in (upgrade *Draw* to pull from farther).
3. **Pour it into the base.** Build-pads ring the Heartlight:
   - **Spire** — auto-firing light tower (6 slots, 6 levels each)
   - **Wisp** / **Attune** — an orbiting army that fires with you, and its power
   - **Barrier** — a regenerating Light Barrier ring that blocks and absorbs the Dusk
   - **Focus / Cadence / Swiftness / Draw** — Keeper damage, fire-rate, speed, pickup
   - **Core / Mend** — Heartlight max HP and regeneration
   - **Nova** — a periodic shockwave from the Heartlight that clears the field
4. **Unlock more.** New pads and bigger tiers open up as you progress and build.
5. **Survive to 100.** Difficulty scales every wave; a **boss** arrives every 10th.

Win by carrying the Heartlight through wave 100.

---

## Tuning

All balance lives in [`js/config.js`](js/config.js) — enemy stats, the per-wave
scaling curves (`hpMul`, `dmgMul`, `bountyMul`, `waveCount`, boss HP), and every
build blueprint's cost/stat tables. The numbers are set so a competent player
out-scales the Dusk around the mid-game and can push a near-max base + 10-Wisp
army through the final boss. Nudge the curves there to make it harder or softer.

## Structure

```
index.html      # shell + HUD/overlay markup
css/style.css   # the whole look (glass, glow, type)
js/util.js      # math, easing, RNG, tiny WebAudio SFX
js/config.js    # ALL balance + the build blueprints + pad layout
js/game.js      # entities, economy, waves, rendering, input, UI
serve.mjs       # optional tiny static server (Bun)
```

Built as a self-contained study — kept deliberately separate from everything else.
