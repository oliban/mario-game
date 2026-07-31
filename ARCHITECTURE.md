# SUPER MARIO — Architecture Contract

**READ THIS FULLY BEFORE WRITING ANY CODE.** Every agent builds against this contract.
Deviating breaks integration for everyone else.

---

## 0. Ground rules

- **Tech**: Vanilla ES modules. NO build step. NO npm dependencies. NO TypeScript.
  Every file is a `.js` ES module loaded natively by the browser via `<script type="module">`.
- **Target**: Chrome/Safari latest on macOS. WebGL2 + Canvas2D + Web Audio.
- **Original assets only.** All pixel art and music must be authored from scratch in this
  repo as code. Never fetch, embed, or reproduce Nintendo's actual ROM art or audio data.
  We are building a homage: faithful *silhouettes and feel*, original *pixels and notes*.
- **You own only the files assigned to you.** Never edit a file owned by another agent.
  If you need something that doesn't exist yet, code against the contract below and assume
  it will exist.
- Use `//` comments sparingly — only where intent is non-obvious.

---

## 1. Coordinate system & units

```
Internal resolution: 256 x 240 px  (NES NTSC framebuffer)
Tile size:           16 x 16 px    (SMB metatile)
Screen tiles:        16 wide x 15 tall
Frame rate:          60.0988 Hz (NES NTSC). Fixed timestep. DT = 1/60.0988
```

- World origin is **top-left**. **+X is right, +Y is DOWN.**
- All positions/velocities are **floating point pixels** and **pixels per frame**
  (NOT per second). A velocity of `2.5` means 2.5 px each 1/60.0988 s tick.
- Accelerations are **pixels per frame squared**.
- Render rounds down: `Math.floor(x - camera.x)`.
- Entity `x, y` is the **top-left of its hitbox**, never the sprite corner.
  Sprites are drawn with an explicit per-animation offset.

---

## 2. Sprite format

A sprite is authored as an array of equal-length strings, one per pixel row.

```js
//  '.'      = transparent
//  '0'-'9'  = palette slot 0..9
//  'a'-'f'  = palette slot 10..15

export const GOOMBA_PAL = ['#000000', '#8b3a10', '#e39b52', '#ffffff'];

export const GOOMBA_WALK_A = [
  '....000000....',
  '..0011111100..',
  '.001111111100.',
  // ...
];
```

Build a drawable with `makeSprite(rows, palette)` from `src/core/gfx.js`.

**Palette discipline** — this is what makes it look expensive:
- Faithful NES *silhouettes*, but richer shading than 3 colors. Use 4–10 slots per sprite.
- Every sprite gets: a dark outline/occlusion color, 2–3 body tones (shadow / mid / light),
  and one specular highlight. Light comes from the **upper-left**.
- Anti-aliasing is FORBIDDEN. Hard pixel edges only. No 50% alpha pixels.
- Prefer hues from `NES` in `src/data/palette.js` or close neighbours, so the whole game
  reads as one coherent console palette rather than a pile of unrelated art.

## 3. Animation format

```js
import { makeSprite, Anim } from '../../core/gfx.js';

// Anim(frames, holdFrames, loop)
//   frames     : Sprite[]
//   holdFrames : number  (ticks per frame) OR number[] (per-frame ticks)
//   loop       : boolean, default true
export const GOOMBA_ANIM = new Anim([a, b], 8);
```

`Anim` API used by systems:
- `anim.frame(tick)` → `Sprite`
- `anim.duration` → total ticks
- `anim.done(tick)` → bool (non-looping only)

## 4. Sprite draw API

```js
sprite.draw(ctx, x, y, flipX = false, flipY = false)
```
`x, y` are screen-space top-left of the sprite image, already camera-adjusted, already
floored by the caller. `Sprite` exposes `.w`, `.h`.

---

## 5. Tiles

Tiles are 16x16 and authored the same way as sprites. Each tile has an entry in the
tile table with its collision class.

```js
// src/data/tiles.js
export const TILES = {
  0:  { name: 'air',        solid: false, sprite: null },
  1:  { name: 'ground',     solid: true,  sprite: T_GROUND },
  2:  { name: 'brick',      solid: true,  sprite: T_BRICK,   breakable: true },
  ...
};
```

Collision classes:
- `solid: true`  — blocks from all four directions
- `platform: true` — blocks only from above (falling onto it), pass-through otherwise
- `breakable: true` — big Mario shatters it, small Mario bumps it
- `question: true` — bump spawns contents
- `climb: true` — flagpole / vine
- `harm: 'lava' | 'pit'` — instant death
- `liquid: true` — swim physics

---

## 6. Level format

```js
// src/data/levels/1-1.js
export default {
  id: '1-1',
  name: 'WORLD 1-1',
  time: 400,
  theme: 'overworld',        // overworld | underground | castle | water | athletic
  music: 'overworld',
  width: 212,                // in tiles
  height: 15,                // in tiles (always 15)
  spawn: { x: 2.5, y: 11 },  // tile coords
  // 15 strings, each `width` chars, top row first. See LEGEND below.
  tiles: [ '....', ... ],
  entities: [
    { type: 'goomba', x: 22, y: 11 },        // tile coords, bottom-aligned
    { type: 'koopa',  x: 40, y: 11, variant: 'green' },
  ],
  warps: [
    { from: { x: 57, y: 10 }, dir: 'down', to: { area: '1-1b', x: 2, y: 2 } },
  ],
  areas: { '1-1b': { /* same shape, sub-area for pipe bonus rooms */ } },
  flagpole: { x: 198 },
  castle:   { x: 202 },
};
```

### LEGEND (tile chars used in `tiles`)

```
 .  air                        #  ground/floor block
 =  brick                      ?  question block (coin)
 M  question block (mushroom/flower)
 1  question block (1-up, invisible)
 C  hidden coin block          o  free-standing coin
 B  solid stone block          S  staircase block
 [  pipe top-left    ]  pipe top-right
 {  pipe body-left   }  pipe body-right
 <  pipe side-left   >  pipe side-right (horizontal pipes)
 L  lava/water hazard          ~  water surface     _  water body
 |  flagpole shaft   ^  flagpole ball
 X  castle brick               a  axe (castle end)
 t  tree/decor (non-solid)     b  bush decor        h  hill decor
 c  cloud decor                g  coral (underwater, solid)
 P  platform (one-way)         @  moving-platform anchor
 F  fire bar anchor            v  vine block
```

Decor chars (`t b h c`) are **non-solid** and are drawn on the background layer.

---

## 7. Entity contract

Every entity module default-exports a class:

```js
export default class Goomba extends Entity {
  static type = 'goomba';
  constructor(world, x, y, opts) { super(world, x, y); }
  update() {}                          // one 60Hz tick
  draw(ctx, cam) {}
  onStomp(player) { return true; }     // return true if stomp was absorbed
  onFireball(fb) { return true; }
  onShell(shell) {}
  onPlayerTouch(player) {}
}
```

`Entity` base (in `src/game/entity.js`) provides:
`x, y, w, h, vx, vy, facing (1|-1), grounded, dead, removed, tick, world`
and helpers `moveAndCollide()`, `onScreen(cam)`, `hits(other)`, `kill(style)`.

Entities are registered by `static type` in `src/game/entities/index.js`.

---

## 8. World / systems interfaces

```js
world.player                 // Player instance
world.cam                    // { x, y }
world.level                  // active level object
world.tileAt(tx, ty)         // -> tile record
world.solidAt(px, py)        // -> bool, pixel coords
world.bumpBlock(tx, ty, by)  // block bump from below
world.breakBlock(tx, ty)
world.spawn(type, x, y, opts)   // pixel coords
world.particles              // ParticleSystem
world.addScore(n, x, y)      // shows floating score popup
world.freeze(ticks)          // hit-stop
world.shake(mag, ticks)      // screen shake
world.time                   // remaining game time
Audio.sfx(name)              // fire and forget
Audio.music(name)            // 'overworld' | 'underground' | ... | null to stop
```

---

## 9. Render layers (draw order, back to front)

```
0  sky / gradient
1  parallax far   (mountains, distant clouds)
2  parallax near  (hills, bushes, fence)
3  background tiles (decor)
4  entities behind pipes (piranha plants emerging)
5  solid tiles
6  entities
7  player
8  particles / debris / coin sparkle
9  foreground overlay (water surface, fog, vignette)
10 HUD
```

Systems draw into the **256x240 Canvas2D buffer** exposed as `renderer.ctx`.
After the frame is composed, `renderer.present()` runs the WebGL2 post chain.

---

## 10. Debug API (required for the automated visual critic)

`src/main.js` must expose:

```js
window.__GAME = {
  world, renderer, audio,
  ready,                        // Promise, resolves once every sprite is baked and audio is built
  loadLevel(id, areaId),        // async; swaps the active level and settles the camera
  teleport(tileX, tileY),       // moves the player AND snaps the camera, in tile coords
  setPower('small' | 'big' | 'fire' | 'star'),
  hold({ left, right, up, down, jump, run, start }),  // scripted input, persists across ticks
  release(),                    // return control to the keyboard
  tick(n = 1),                  // advance n fixed steps and render, ignoring rAF
  pause(), resume(),
  showTitle(),                  // async; enters the title screen state
  setPreset('pure'|'crisp'|'crt'),
  setPost(name, on),            // toggle an individual post pass
  stats(),                      // { fps, entities, particles, tick, playerState, vx, vy }
};
```

This is how screenshots are captured deterministically. Do not remove it.

---

## 11. File ownership map

```
index.html                       core
src/core/constants.js            core
src/core/gfx.js                  core
src/core/input.js                core
src/core/loop.js                 core
src/core/rng.js                  core
src/data/palette.js              core
tools/shot.mjs                   core

src/data/sprites/mario.js        agent: art-mario
src/data/sprites/enemies-a.js    agent: art-enemies-a
src/data/sprites/enemies-b.js    agent: art-enemies-b
src/data/sprites/boss.js         agent: art-boss
src/data/sprites/items.js        agent: art-items
src/data/sprites/font.js         agent: art-font
src/data/tiles.js                agent: art-tiles
src/data/scenery.js              agent: art-scenery

src/data/levels/*.js             agent: level-design

src/game/physics.js              agent: sys-physics
src/game/player.js               agent: sys-player
src/game/entity.js               agent: sys-entity
src/game/entities/*.js           agent: sys-enemies
src/game/world.js                agent: sys-world
src/game/blocks.js               agent: sys-world
src/game/camera.js               agent: sys-world
src/fx/particles.js              agent: sys-fx
src/render/renderer.js           agent: sys-render
src/render/post.js               agent: sys-render
src/audio/engine.js              agent: sys-audio
src/audio/music.js               agent: sys-audio
src/audio/sfx.js                 agent: sys-audio
src/ui/hud.js                    agent: sys-ui
src/ui/screens.js                agent: sys-ui
src/main.js                      core (integration)
```

---

## 12. Quality bar

The finished game is compared **side by side, blind, against Super Mario Bros. (NES, 1985)**
by a hostile critic. "Close enough" fails. Specifically:

- Animation must have **weight**: squash on landing, anticipation before a jump,
  follow-through on skids, secondary motion on Bowser's tail and Mario's cape of dust.
- Every impact needs feedback: particles, a sound, a 1–3 frame freeze, or a shake.
- Nothing may be static: clouds drift, water undulates, flags ripple, lava bubbles,
  question blocks pulse, coins spin, torches flicker.
- Silhouettes must read instantly at 1x zoom with no color.
- No placeholder art. No solid-color rectangles. Ever.
