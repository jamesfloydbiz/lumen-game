# Monkey Breach

A bright, chunky **zoo-breach defense** for the browser, built on the Kingshot ad loop:
move a character, stand on cost-pads to build, survive the wave. The twist — your core
is a **stealable banana pile**, your weapon is a **net** (you trap, never harm), and at
the end of each wave a **zoo truck** carts the trapped monkeys back behind the fence.

> 3D, no build step. Three.js is vendored locally — just `<script>` tags and a `<canvas>`.

## Play

```bash
bun run serve        # → http://localhost:4173   (Monkey Breach is the root game)
```

- **Move** the zookeeper with `WASD` / arrows, or drag for a floating joystick.
- **Auto-net** — you fire nets at the nearest monkey automatically; a netted monkey is trapped in place.
- **Build** — stand on a glowing pad and your coins pour in until it builds/upgrades.
- **Earn** — every monkey the truck carts home pays a coin bounty.

## The loop

Monkeys pour through the fence **breach**, run to the **banana pile**, grab a banana and
flee back out. A banana that escapes is gone for good; a **carrier you trap** gets its
banana returned when the truck loads it. Lose all your bananas → game over.

**Build pads (the towers):**
- **Net Tower** — auto-fires nets down its lane.
- **Banana Decoy** — a fake pile; monkeys grab it and flee empty-handed (bend the flow).
- **Cage Trap** — auto-catches monkeys that cross it (cover a lane you can't stand in).
- **Mud Patch** — slows monkeys crossing it, so more nets land.
- **Fence Patch** — seals a breach briefly.

Waves escalate: faster grab-and-flee monkeys, a 2-net **Alpha**, decoy-proof **Bold**
monkeys, and **2 → 3 simultaneous breaches** so you can't personally cover everything —
you win by building a board that covers itself.

## Structure

```
index.html · css/style.css        shell + bright zoo HUD/overlays
js/vendor/three.min.js            Three.js r128 (vendored)
js/util.js                        math/easing/RNG + tiny WebAudio SFX
js/config.js                      ALL tuning: monkeys, waves, pads, layout
js/render.js                      the 3D scene (fence, lane, pile, monkeys, towers, truck)
js/game.js                        sim + loop: monkeys, nets, pads, truck, economy
serve.mjs                         tiny static server (Bun)

crowd-control/                    archived earlier prototype (FLOW — crowd-safety tycoon)
```
