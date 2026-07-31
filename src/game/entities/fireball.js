import { Entity, registerEntity } from '../entity.js';
import { TILE, SCREEN_W } from '../../core/constants.js';
import { PHYS } from '../physics.js';
import * as ITEMS from '../../data/sprites/items.js';
import { animOf, fx, sfx } from './mushroom.js';

export const FIREBALL_SPEED = PHYS.fireballSpeed;
export const FIREBALL_BOUNCE = PHYS.fireballBounce;
export const FIREBALL_GRAVITY = PHYS.fireballGravity;
export const FIREBALL_MAX_FALL = (PHYS.fireball && PHYS.fireball.maxFall) || PHYS.maxFallSpeed;
export const FIREBALL_MAX = 2;

const FB_PAL = ['#1a1008', '#a01018', '#e85018', '#ffb020', '#fff4c0'];

const FB_ROWS = [
  '..0000..',
  '.034430.',
  '03444430',
  '03442230',
  '03422130',
  '03221130',
  '.021110.',
  '..0000..',
];

const EXP_PAL = ['#1a1008', '#a01018', '#ef9a49', '#ffd830', '#ffffff'];

const EXP_A = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '......0440......',
  '.....044440.....',
  '.....044440.....',
  '......0440......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const EXP_B = [
  '................',
  '................',
  '................',
  '......0330......',
  '....03444430....',
  '...0344444430...',
  '..034444444430..',
  '..034444444430..',
  '..034444444430..',
  '...0344444430...',
  '....03444430....',
  '......0330......',
  '................',
  '................',
  '................',
  '................',
];

const EXP_C = [
  '................',
  '.......22.......',
  '................',
  '...2........2...',
  '................',
  '.2............2.',
  '................',
  '2..............2',
  '................',
  '.2............2.',
  '................',
  '...2........2...',
  '................',
  '.......22.......',
  '................',
  '................',
];

// One authored swirl mirrored into four orientations gives the spin without
// four hand-drawn frames drifting apart.
const SPIN = [
  [false, false],
  [true, false],
  [true, true],
  [false, true],
];

const BALL_ANIM = animOf(
  ITEMS.FIREBALL && ITEMS.FIREBALL.spin,
  [FB_ROWS],
  FB_PAL,
  { name: 'fireball' },
  4
);
export const FIREBALL_POP_ANIM = animOf(
  ITEMS.FIREBALL && ITEMS.FIREBALL.burst,
  [EXP_A, EXP_B, EXP_C],
  EXP_PAL,
  { name: 'fireball.burst' },
  4,
  false
);
const USING_OWN_BALL = !(ITEMS.FIREBALL && ITEMS.FIREBALL.spin);

export default class Fireball extends Entity {
  static type = 'fireball';
  static MAX = FIREBALL_MAX;

  static count(world) {
    let n = 0;
    const list = (world && world.entities) || [];
    for (const e of list) if (e instanceof Fireball && !e.removed && !e.exploding) n++;
    return n;
  }

  static canSpawn(world) {
    return Fireball.count(world) < FIREBALL_MAX;
  }

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 8;
    this.h = 8;
    this.t = 0;
    this.facing = opts.dir === -1 ? -1 : 1;
    this.vx = FIREBALL_SPEED * this.facing;
    this.vy = typeof opts.vy === 'number' ? opts.vy : 1.0;
    this.exploding = false;
    this.popTick = 0;
    this.friendly = true;
    this.isFireball = true;
    this.autoCorpse = false;
    this.despawnOffscreen = false;
    this.owner = opts.owner || world.player;
    if (Fireball.count(world) >= FIREBALL_MAX) this.removed = true;
    else sfx(world, 'fire');
  }

  // Returns true if the ball was consumed this frame.
  _hitEnemies() {
    const list = (this.world && this.world.entities) || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e === this || e.removed || e.dead) continue;
      if (e.friendly || e.isItem || e.isFireball || e === this.owner) continue;
      if (typeof e.onFireball !== 'function') continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) {
        continue;
      }
      let killed = false;
      try {
        killed = e.onFireball(this) !== false;
      } catch (err) {
        killed = false;
      }
      if (killed && this.world && typeof this.world.addScore === 'function') {
        this.world.addScore(e.fireScore || 100, e.x, e.y);
      }
      this.explode();
      return true;
    }
    return false;
  }

  explode(silent = false) {
    if (this.exploding) return;
    this.exploding = true;
    this.popTick = 0;
    this.vx = 0;
    this.vy = 0;
    this.tangible = false;
    if (!silent) sfx(this.world, 'block-bump');
    fx(this.world, 'fireballBurst', this.x + 4, this.y + 4);
  }

  // Called by the collision system when this fireball connects with an enemy.
  onEnemyHit() {
    this.explode(true);
  }

  onHit() {
    this.explode(true);
  }

  kill() {
    this.explode(true);
  }

  update() {
    this.t++;
    if (this.exploding) {
      this.popTick++;
      if (FIREBALL_POP_ANIM.done(this.popTick)) this.removed = true;
      return;
    }

    const w = this.world;
    this.vy = Math.min(this.vy + FIREBALL_GRAVITY, FIREBALL_MAX_FALL);

    this.x += this.vx;
    const yt = this.y + 1;
    const yb = this.y + this.h - 1;
    if (this.vx > 0 && (w.solidAt(this.x + this.w, yt) || w.solidAt(this.x + this.w, yb))) {
      this.x = Math.floor((this.x + this.w) / TILE) * TILE - this.w;
      this.explode();
      return;
    }
    if (this.vx < 0 && (w.solidAt(this.x, yt) || w.solidAt(this.x, yb))) {
      this.x = (Math.floor(this.x / TILE) + 1) * TILE;
      this.explode();
      return;
    }

    this.y += this.vy;
    const xl = this.x + 1;
    const xr = this.x + this.w - 1;
    if (this.vy > 0) {
      const by = this.y + this.h;
      if (w.solidAt(xl, by, 'down') || w.solidAt(xr, by, 'down')) {
        this.y = Math.floor(by / TILE) * TILE - this.h;
        this.vy = FIREBALL_BOUNCE;
        this.grounded = true;
      }
    } else if (this.vy < 0) {
      if (w.solidAt(xl, this.y) || w.solidAt(xr, this.y)) {
        this.y = (Math.floor(this.y / TILE) + 1) * TILE;
        this.vy = 0.5;
      }
    }

    // Every enemy implements onFireball(), but nothing was ever calling it — the
    // projectile owns detecting what it hits, so the scan belongs here. A handler
    // returning false (Buzzy Beetle's fireproof shell, a Podoboo) still stops the
    // ball, it just does not kill.
    if (this._hitEnemies()) return;

    const cam = w.cam;
    if (this.x + this.w < cam.x - 8 || this.x > cam.x + SCREEN_W + 8) this.removed = true;
    const lvl = w.level;
    if (this.y > ((lvl && lvl.height) || 15) * TILE + 32) this.removed = true;
  }

  onPlayerTouch() {
    return false;
  }

  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const sx = Math.floor(this.x - cam.x);
    const sy = Math.floor(this.y - cam.y);
    if (this.exploding) {
      const spr = FIREBALL_POP_ANIM.frame(this.popTick);
      spr.draw(ctx, sx + 4 - (spr.w >> 1), sy + 4 - (spr.h >> 1));
      return;
    }
    const spr = BALL_ANIM.frame(this.t);
    const ox = sx + 4 - (spr.w >> 1);
    const oy = sy + 4 - (spr.h >> 1);
    if (USING_OWN_BALL) {
      const [fx2, fy2] = SPIN[(this.t >> 1) & 3];
      spr.draw(ctx, ox, oy, fx2, fy2);
    } else {
      spr.draw(ctx, ox, oy);
    }
  }
}

registerEntity(Fireball);
