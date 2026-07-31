import { Entity, registerEntity } from '../entity.js';
import { SCREEN_W } from '../../core/constants.js';
import rng from '../../core/rng.js';
import * as ENEMIES_B from '../../data/sprites/enemies-b.js';
import { fx, spriteOf } from './mushroom.js';

const BALL_ROWS = [
  '..0000..',
  '.033330.',
  '03344330',
  '03444430',
  '03444430',
  '03344330',
  '.033330.',
  '..0000..',
];

const PAL_A = ['#6d1000', '#a01018', '#c03400', '#ef9a49', '#ffe870'];
const PAL_B = ['#6d1000', '#a01018', '#e85018', '#ffb020', '#fffbd0'];

const AUTHORED = ENEMIES_B.FIREBAR && ENEMIES_B.FIREBAR.ball;
const BALLS = [
  spriteOf(AUTHORED, BALL_ROWS, PAL_A, { name: 'firebar.a' }),
  spriteOf(null, BALL_ROWS, PAL_B, { name: 'firebar.b' }),
];
// With authored art there is no second palette to flicker between; mirror instead.
const FLICKER = !AUTHORED;

// One full revolution every 256 ticks, matching the original's lazy sweep.
export const FIREBAR_RATE = (Math.PI * 2) / 256;
const SPACING = 16;

export default class FireBar extends Entity {
  static type = 'firebar';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    // Hub of the rotation, at the centre of the anchor tile. NOT `cx`/`cy` —
    // Entity exposes those as getters with no setters, and ES modules are
    // strict mode, so assigning them throws and the spawn is lost.
    this.hubX = x + 8;
    this.hubY = y + 8;
    this.count = opts.count != null ? opts.count : opts.half ? 3 : 6;
    this.dir = opts.dir === -1 || opts.ccw ? -1 : 1;
    this.rate = FIREBAR_RATE * (opts.speed != null ? opts.speed : 1);
    this.angle = (opts.angle != null ? opts.angle : 0) * (Math.PI / 180);
    this.hostile = true;
    this.tangible = false;
    this.persistent = true;
    this.autoCorpse = false;
    this.reach = (this.count - 1) * SPACING + 8;
    this._px = new Float32Array(this.count);
    this._py = new Float32Array(this.count);
    this.computePositions();
  }

  computePositions() {
    const ca = Math.cos(this.angle);
    const sa = Math.sin(this.angle);
    for (let i = 0; i < this.count; i++) {
      const r = i * SPACING;
      this._px[i] = this.hubX + ca * r;
      this._py[i] = this.hubY + sa * r;
    }
  }

  onScreenish() {
    const camX = this.world.cam.x;
    return this.hubX + this.reach > camX - 16 && this.hubX - this.reach < camX + SCREEN_W + 16;
  }

  update() {
    this.t++;
    this.angle += this.rate * this.dir;
    if (this.angle > Math.PI * 4) this.angle -= Math.PI * 4;
    if (this.angle < -Math.PI * 4) this.angle += Math.PI * 4;
    this.computePositions();
    if (!this.onScreenish()) return;

    const p = this.world.player;
    if (p && !p.dead && p.invulnerable !== true) {
      for (let i = 0; i < this.count; i++) {
        const bx = this._px[i] - 4;
        const by = this._py[i] - 4;
        if (bx < p.x + p.w && bx + 8 > p.x && by < p.y + p.h && by + 8 > p.y) {
          if (typeof p.hurt === 'function') p.hurt(this);
          else if (typeof p.damage === 'function') p.damage(this);
          break;
        }
      }
    }

    if (this.t % 6 === 0 && this.count > 1) {
      const i = this.count - 1;
      fx(this.world, 'starTrail', this._px[i] + rng.range(-1.5, 1.5), this._py[i] + rng.range(-1.5, 1.5));
    }
  }

  onPlayerTouch() {}
  onFireball() {
    return false;
  }
  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    if (!this.onScreenish()) return;
    for (let i = this.count - 1; i >= 0; i--) {
      const spr = FLICKER ? BALLS[((this.t >> 2) + i) & 1] : BALLS[0];
      const flip = (((this.t >> 3) + i) & 1) === 1;
      spr.draw(
        ctx,
        Math.floor(this._px[i] - cam.x) - (spr.w >> 1),
        Math.floor(this._py[i] - cam.y) - (spr.h >> 1),
        flip,
        false
      );
    }
  }
}

registerEntity(FireBar);
