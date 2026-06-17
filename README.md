# Monkey Business

A bright, chunky **open-world zoo-breach defense + base builder** for the browser. A follow-cam
trails your roaming zookeeper across a streaming world. Your core is a **stealable banana pile**,
your weapon is a **net** (you trap, never harm), and at the end of each wave a **zoo truck** carts
the trapped monkeys home. **Claim the wild, build a walled base, survive 100 waves.**

> 3D, no build step. Three.js is vendored locally — just `<script>` tags and a `<canvas>`.

## Play

```bash
bun run serve        # → http://localhost:4173   (Monkey Business is the root game)
```

- **Roam** the zookeeper with `WASD` / arrows, or drag for a floating joystick — the camera follows.
- **Build** — there's no grid: pick a tool from the tray, walk to a spot, tap **Build** to place it ahead of
  you. Pay in **bananas**. Stand on a structure to **Upgrade** it.
- **Bananas are everything** — they're your **money AND your lives** (the pile). Spend them to build, and
  monkeys steal them. Lose at zero.
- **Logistics** — **Banana Farms** only produce when a chain of **Supply Lines** links them back to the pile.
- **Auto-net** — you (and your towers and keepers) fire nets at the nearest monkey automatically.

## The loop

Monkeys emerge from **fixed spawn points** (jungle, then mountains, then the zoo), race to the **banana
pile** at the world's heart, grab a banana and flee. A banana that escapes is gone; a **carrier you trap**
gets its banana returned when the truck loads it, plus a bounty. Lose all your bananas → game over.

**Towers & buildings (place freely, pay in bananas):**
- **Net Tower** — auto-fires nets at the nearest raider.
- **Wall** / **Supply Line** — paid blocks: wall in the pile (gaps are gates); chain supply to power farms.
- **Trainee Keeper** — hires roaming keepers who patrol and net monkeys (more per level).
- **Banana Farm** — grows bananas — **only when connected to the pile by Supply Lines**.
- **Banana Decoy** — a fake pile; monkeys grab it and flee empty-handed (bend the flow).
- **Cage Trap** — snaps shut on monkeys that wander across it.
- **Mud Patch** — slows monkeys crossing it, so more nets land.

Waves escalate across **100 levels**: faster monkeys, a 2-net **Alpha**, decoy-proof **Bold**
monkeys, a **Silverback boss every 10th wave**, and more open sides the deeper you go. You can't
personally cover everything — you win by claiming ground and building a base that covers itself.

## Structure

```
index.html · css/style.css        shell + bright zoo HUD/overlays
js/vendor/three.min.js            Three.js r128 (vendored)
js/util.js                        math/easing/RNG + tiny WebAudio SFX
js/config.js                      ALL tuning: world/chunks, plots, monkeys, 100-wave spec, pads
js/render.js                      the 3D scene: follow-cam, chunk streaming, plot tiles + walls,
                                  pile, monkeys, towers, keepers, truck, cartoon lighting
js/game.js                        sim + loop: roam, plot claiming, farm eco, trainees, monkeys,
                                  nets, towers, truck, economy, 100-wave flow
serve.mjs                         tiny static server (Bun)

crowd-control/                    archived earlier prototype (FLOW — crowd-safety tycoon)
```
