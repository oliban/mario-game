import { Entity, registerEntity } from '../entity.js';
import { TILE } from '../../core/constants.js';
import * as ITEMS from '../../data/sprites/items.js';
import { animOf, fx, sfx } from './mushroom.js';
import { tileKey } from '../blocks.js';

// The BRICK BOMB — what the toolbelt throws.
//
// It is a player projectile like the fireball, but it is a TOOL, not a weapon:
// it passes over enemies without harming them and its whole purpose is the row
// of bricks it leaves behind.
//
// It is a real grenade. It arcs out of Mario's hand under gravity and goes off
// at the first of: touching a solid surface from any side, or its FUSE running
// out. Where it goes off is where the row forms — five bricks on the bomb's own
// tile row, starting at the bomb's own column, running the way it was thrown.
// That is the whole feature: land it on the ground and you get a step to jump
// onto; let the fuse expire over a pit or a lava lake and the row hangs in the
// air where the bomb was, which is the bridge.
//
// WIRING (player.js owns all of this, none of it lives here):
//   import BrickBomb, { BRICKBOMB_COST, brickRowTiles, throwBrickBomb } from '...';
//   if (runPressed && power === 'toolbelt' && coins >= BRICKBOMB_COST
//       && rowCanBuild() && BrickBomb.canSpawn(world)) {
//     const bomb = throwBrickBomb(world, this);
//     if (bomb) spendCoins(BRICKBOMB_COST);
//   }

// Coins per throw. The wiring imports this rather than keeping a second 50.
export const BRICKBOMB_COST = 50;

// Bricks in a row. There is no longer a "gap" constant: the gap between Mario
// and the row is whatever distance the bomb covered before it went off.
export const BRICK_ROW_LENGTH = 5;

// Bombs in flight at once.
export const BRICKBOMB_MAX = 2;

// ---------------------------------------------------------------------------
// Ballistics. Tuned by measurement, not by feel — the numbers below are what
// the flight actually produces, measured in the running game.
//
//   fuse 24 frames, unobstructed  ->  34 px travelled = 2.1 tiles
//   apex                          ->  22 px = 1.37 tiles above the launch point
//   at the bang                   ->  18 px below the launch point, which is
//                                     the thrower's own foot row, exactly
//   flat ground                   ->  lands on the floor, near end 2 tiles out
//
// The fuse and the speed are one setting, not two. The bomb has to still be
// FALLING PAST the feet line when the fuse blows, or the row forms a tile high
// and you have to jump to your own bridge; that takes ~23 frames under this
// gravity, which fixes the fuse, which leaves the speed to set the distance.
// At 1.75 the row started 2.6 tiles out and a three-tile lava gap in h-1 came
// out one tile short at the near end — bridged but not walkable. 1.4 puts the
// near end two tiles out, which spans that gap exactly.
export const BRICKBOMB_SPEED = 1.4;
export const BRICKBOMB_LAUNCH_VY = -4.5;
export const BRICKBOMB_GRAVITY = 0.42;
export const BRICKBOMB_MAX_FALL = 8;
export const BRICKBOMB_FUSE = 24;

// The bomb leaves the hand at a fixed height above the FEET, not at a fraction
// of the body. Big and small Mario are a whole tile apart in height, so a
// body-relative launch put the two arcs one tile apart at the far end — and one
// tile is the difference between a bridge you walk onto and one you have to
// jump to. One launch height, one arc, both sizes, ducking included.
const LAUNCH_ABOVE_FEET = 10;
const BOMB_W = 10;
const BOMB_H = 10;

// Frames between bricks as the row sweeps out.
const SWEEP_STEP = 3;

const BOMB_PAL = [
  '#12080a',
  '#2a2a38',
  '#4a4a60',
  '#8a8aa0',
  '#ffffff',
  '#8a4a14',
  '#ef9a49',
  '#ffd830',
];

const BOMB_A = [
  '.......76...',
  '......076...',
  '......50....',
  '.....50.....',
  '...00000....',
  '..0332220...',
  '.034322210..',
  '.033222110..',
  '.022221110..',
  '.022111110..',
  '..0211110...',
  '...00000....',
];

const BOMB_B = [
  '.......67...',
  '......067...',
  '......50....',
  '.....50.....',
  '...00000....',
  '..0332220...',
  '.033222210..',
  '.034222110..',
  '.022221110..',
  '.022111110..',
  '..0211110...',
  '...00000....',
];

const AUTHORED =
  (ITEMS.BRICK_BOMB && (ITEMS.BRICK_BOMB.fly || ITEMS.BRICK_BOMB.idle)) ||
  (ITEMS.TOOLBELT && ITEMS.TOOLBELT.bomb) ||
  ITEMS.BRICK_BOMB;

const BOMB_ANIM = animOf(AUTHORED, [BOMB_A, BOMB_B], BOMB_PAL, { name: 'brickbomb' }, 4);

function num(v, d) {
  return typeof v === 'number' && isFinite(v) ? v : d;
}

// ---------------------------------------------------------------------------
// Flight. The live bomb and the dry-run prediction MUST agree exactly, so both
// go through these two functions and neither keeps a copy of the maths. `s` is
// anything carrying x, y, vx, vy, w, h — the entity itself, or a plain object.
// ---------------------------------------------------------------------------

export function launchState(thrower, dir) {
  const d = dir === -1 ? -1 : 1;
  const feet = thrower.y + thrower.h;
  return {
    w: BOMB_W,
    h: BOMB_H,
    x: thrower.x + thrower.w * 0.5 + d * 6 - BOMB_W * 0.5,
    y: feet - LAUNCH_ABOVE_FEET - BOMB_H * 0.5,
    vx: BRICKBOMB_SPEED * d,
    vy: BRICKBOMB_LAUNCH_VY,
  };
}

// One tick of flight. Returns true when the bomb struck a solid — from any
// side, which includes landing on top of one. `s` is left resolved against the
// surface it hit, so its tile row and column are the ones the row forms on.
export function stepBomb(world, s) {
  s.vy = Math.min(s.vy + BRICKBOMB_GRAVITY, BRICKBOMB_MAX_FALL);

  s.x += s.vx;
  const yt = s.y + 1;
  const yb = s.y + s.h - 1;
  if (s.vx > 0 && (world.solidAt(s.x + s.w, yt) || world.solidAt(s.x + s.w, yb))) {
    s.x = Math.floor((s.x + s.w) / TILE) * TILE - s.w;
    return true;
  }
  if (s.vx < 0 && (world.solidAt(s.x, yt) || world.solidAt(s.x, yb))) {
    s.x = (Math.floor(s.x / TILE) + 1) * TILE;
    return true;
  }

  s.y += s.vy;
  const xl = s.x + 1;
  const xr = s.x + s.w - 1;
  if (s.vy > 0) {
    const by = s.y + s.h;
    if (world.solidAt(xl, by, 'down') || world.solidAt(xr, by, 'down')) {
      s.y = Math.floor(by / TILE) * TILE - s.h;
      return true;
    }
  } else if (s.vy < 0) {
    if (world.solidAt(xl, s.y) || world.solidAt(xr, s.y)) {
      s.y = (Math.floor(s.y / TILE) + 1) * TILE;
      return true;
    }
  }
  return false;
}

// Fly the whole throw without spawning anything and without touching the world.
// Returns the resolved end state.
export function simulateThrow(world, thrower, dir) {
  const s = launchState(thrower, dir);
  for (let i = 0; i < BRICKBOMB_FUSE; i++) {
    if (stepBomb(world, s)) break;
  }
  return s;
}

// The tile the row starts on, from a bomb (or a simulated bomb) at rest. The
// CENTRE decides, not an edge: a bomb resting on the ground has its bottom
// exactly on the tile boundary, and a floor()ed edge would name the floor tile
// it is standing on rather than the empty tile it is standing in.
export function rowOriginOf(s) {
  return {
    tx: Math.floor((s.x + s.w * 0.5) / TILE),
    ty: Math.floor((s.y + s.h * 0.5) / TILE),
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

// Every body a brick must not be conjured inside. world.players exists in
// co-op; world.player alone otherwise.
function bodiesOf(world) {
  const out = [];
  if (!world) return out;
  const roster = Array.isArray(world.players) && world.players.length ? world.players : [];
  for (const p of roster) if (p) out.push(p);
  if (world.player && out.indexOf(world.player) < 0) out.push(world.player);
  const list = world.entities || [];
  for (const e of list) {
    if (!e || e.removed || e.dead) continue;
    if (e.tangible === false) continue;
    if (e.isFireball || e.isBrickBomb) continue;
    if (out.indexOf(e) < 0) out.push(e);
  }
  return out;
}

// A brick may go here only if the tile is inside the level, is AIR, and no body
// is standing in it. Everything else — a pipe, a block, ground, lava, water, a
// coin, decor — is left exactly as it was. `ignore` is the bomb itself.
export function canPlaceBrickAt(world, tx, ty, ignore) {
  if (!world) return false;
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return false;
  const rec = world.recAt(tx, ty);
  if (!rec || rec.name !== 'air') return false;
  if (rec.solid || rec.platform || rec.harm || rec.liquid) return false;
  const px = tx * TILE;
  const py = ty * TILE;
  for (const b of bodiesOf(world)) {
    if (b === ignore) continue;
    if (b.x < px + TILE && b.x + b.w > px && b.y < py + TILE && b.y + b.h > py) return false;
  }
  return true;
}

// The five tiles a throw would fill, in build order — WITHOUT throwing. The row
// position is not known until the bomb goes off, but it is perfectly
// predictable: this flies the same arc through the same stepBomb() the live
// bomb uses. That is what lets the wiring refuse a throw that would build
// nothing BEFORE it charges 50 coins.
export function brickRowTiles(world, thrower, dir) {
  const d = dir === -1 ? -1 : 1;
  const out = [];
  if (!world || !thrower) return out;
  const { tx, ty } = rowOriginOf(simulateThrow(world, thrower, d));
  for (let i = 0; i < BRICK_ROW_LENGTH; i++) out.push({ tx: tx + d * i, ty });
  return out;
}

// The one call the wiring needs. Returns the entity, or null if the throw was
// refused (too many bombs already in flight).
export function throwBrickBomb(world, thrower, opts) {
  if (!world || !thrower) return null;
  if (!BrickBomb.canSpawn(world)) return null;
  const dir = (opts && opts.dir) || (thrower.facing === -1 ? -1 : 1);
  return world.spawn('brickbomb', thrower.x, thrower.y, {
    cost: BRICKBOMB_COST,
    ...(opts || {}),
    dir,
    owner: thrower,
  });
}

export default class BrickBomb extends Entity {
  static type = 'brickbomb';
  static MAX = BRICKBOMB_MAX;
  static COST = BRICKBOMB_COST;

  static count(world) {
    let n = 0;
    const list = (world && world.entities) || [];
    for (const e of list) if (e instanceof BrickBomb && !e.removed && !e.landed) n++;
    return n;
  }

  static canSpawn(world) {
    return BrickBomb.count(world) < BRICKBOMB_MAX;
  }

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = BOMB_W;
    this.h = BOMB_H;
    this.t = 0;
    this.isBrickBomb = true;
    this.friendly = true;
    this.tangible = false;
    this.autoCorpse = false;
    this.despawnOffscreen = false;
    this.facing = opts.dir === -1 ? -1 : 1;

    const owner = opts.owner || world.player;
    this.owner = owner || null;

    // What the throw was charged, so a throw that builds nothing can hand it
    // back. Only throwBrickBomb() sets this; a bare world.spawn('brickbomb')
    // from a level or a probe is free and refunds nothing.
    this.cost = num(opts.cost, 0);
    this.refunded = false;

    const src = owner || { x, y, w: 16, h: 16 };
    const s = launchState(src, this.facing);
    this.x = s.x;
    this.y = s.y;
    this.vx = s.vx;
    this.vy = s.vy;

    this.fuse = num(opts.fuse, BRICKBOMB_FUSE);
    this.landed = false;
    this.rowY = 0;
    this.firstTx = 0;
    this.sweep = 0;
    this.placed = 0;
    this.builtCount = 0;

    if (BrickBomb.count(world) >= BRICKBOMB_MAX) this.removed = true;
    else sfx(world, 'kick');
  }

  placeBrick(tx, ty) {
    const w = this.world;
    if (!canPlaceBrickAt(w, tx, ty, this)) return false;
    w.setTile(tx, ty, '=');
    // A tile that once held a bumped or emptied block may still carry that
    // block's state; the fresh brick must start clean or it would refuse to
    // shatter. shatter() clears the same entry (blocks.js:540).
    const bs = w.blocks;
    if (bs && bs.state && typeof bs.state.delete === 'function') bs.state.delete(tileKey(tx, ty));
    if (bs && bs.bumps && typeof bs.bumps.delete === 'function') bs.bumps.delete(tileKey(tx, ty));
    fx(w, 'landingDust', tx * TILE + TILE * 0.5, ty * TILE + TILE, 0.8);
    sfx(w, 'bump');
    this.builtCount++;
    return true;
  }

  // The wiring pre-checks with brickRowTiles() and only charges for a throw
  // that had somewhere to build. That test reads TILES; bodies are the bomb's
  // business and can still eat the whole row — five tiles, every one occupied —
  // between the press and the bang. Rare, but it is the one remaining case that
  // would take 50 coins for nothing, so the money goes back.
  _refund() {
    const w = this.world;
    if (!w || !this.cost || this.refunded) return;
    this.refunded = true;
    // Harry mode's addCoin is a plain wallet add: no 100-coin reset, no 1-up,
    // no coin sound. Outside Harry mode there is no toolbelt, but a direct
    // write keeps a stray refund from paying out a free life.
    if (w.harryMode === true && typeof w.addCoin === 'function') w.addCoin(this.cost);
    else w.coins = (w.coins | 0) + this.cost;
  }

  detonate() {
    if (this.landed) return;
    this.landed = true;
    this.vx = 0;
    this.vy = 0;
    const o = rowOriginOf(this);
    this.firstTx = o.tx;
    this.rowY = o.ty;
    this.sweep = 0;
    this.placed = 0;
    fx(this.world, 'fireballBurst', this.x + this.w * 0.5, this.y + this.h * 0.5);
    sfx(this.world, 'brick-break');
    if (this.world && typeof this.world.shake === 'function') this.world.shake(1.2, 6);
  }

  update() {
    this.t++;

    if (this.landed) {
      // Sweep the row out one brick at a time, away from the thrower.
      if (this.placed >= BRICK_ROW_LENGTH) {
        if (this.builtCount === 0) this._refund();
        this.removed = true;
        return;
      }
      if (this.sweep % SWEEP_STEP === 0) {
        this.placeBrick(this.firstTx + this.facing * this.placed, this.rowY);
        this.placed++;
      }
      this.sweep++;
      return;
    }

    const w = this.world;
    if (stepBomb(w, this)) {
      this.detonate();
      return;
    }

    this.fuse--;
    if (this.fuse <= 0) {
      this.detonate();
      return;
    }

    // Nothing below the level to land on: go off where it is and let the AIR
    // test decide what, if anything, survives.
    const lvl = w && w.level;
    if (this.y > ((lvl && lvl.height) || 15) * TILE + 64) this.detonate();
  }

  // Inert to everything. It is a tool, not a weapon.
  onPlayerTouch() {
    return false;
  }

  onStomp() {
    return false;
  }

  onFireball() {
    return false;
  }

  kill() {
    this.removed = true;
  }

  draw(ctx, cam) {
    if (this.landed) return;
    const spr = BOMB_ANIM.frame(this.t);
    const sx = Math.floor(this.x - cam.x + (this.w - spr.w) * 0.5);
    const sy = Math.floor(this.y - cam.y + (this.h - spr.h) * 0.5);
    spr.draw(ctx, sx, sy, this.facing === -1);
  }
}

registerEntity(BrickBomb);
registerEntity('brick-bomb', BrickBomb);
registerEntity('bomb', BrickBomb);
