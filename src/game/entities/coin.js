import { Entity, registerEntity } from '../entity.js';
import { Anim } from '../../core/gfx.js';
import * as ITEMS from '../../data/sprites/items.js';
import { animOf, fx, sfx } from './mushroom.js';

const COIN_PAL = ['#1a1008', '#8a5c00', '#c89000', '#ffd830', '#fff4b0'];

const COIN_A = [
  '................',
  '......0000......',
  '....00333300....',
  '...0333433330...',
  '..033342233330..',
  '..033341223330..',
  '..033341223330..',
  '..033341223330..',
  '..033321222330..',
  '..033321112220..',
  '..032221111220..',
  '...0222111220...',
  '....00222200....',
  '......0000......',
  '................',
  '................',
];

const COIN_B = [
  '................',
  '.......00.......',
  '......0430......',
  '.....033330.....',
  '.....032230.....',
  '.....032130.....',
  '.....032130.....',
  '.....032130.....',
  '.....032130.....',
  '.....032120.....',
  '.....032120.....',
  '.....022110.....',
  '......0210......',
  '.......00.......',
  '................',
  '................',
];

const COIN_C = [
  '................',
  '.......00.......',
  '.......30.......',
  '.......30.......',
  '.......30.......',
  '.......30.......',
  '.......20.......',
  '.......20.......',
  '.......20.......',
  '.......20.......',
  '.......10.......',
  '.......10.......',
  '.......10.......',
  '.......00.......',
  '................',
  '................',
];

export const COIN_ANIM = animOf(
  ITEMS.COIN && ITEMS.COIN.spin,
  [COIN_A, COIN_B, COIN_C, COIN_B],
  COIN_PAL,
  { name: 'coin' },
  2
);

// The free-standing coin holds its full face longer than the block coin's fast spin.
export const COIN_IDLE_ANIM = new Anim(
  COIN_ANIM.frames,
  COIN_ANIM.frames.map((_, i) => (i === 0 ? 14 : 4))
);

const POP_VY = -5.5;
const POP_GRAVITY = 0.1875;

export default class Coin extends Entity {
  static type = 'coin';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.t = 0;
    this.mode = opts.mode || (opts.idle ? 'idle' : 'bump');
    this.startY = y;
    this.autoCorpse = false;
    this.despawnOffscreen = this.mode === 'idle';
    this.vy = this.mode === 'bump' ? POP_VY : 0;
    this.tangible = this.mode === 'idle';
    if (this.mode === 'bump' && opts.award !== false) this.pay();
  }

  pay() {
    sfx(this.world, 'coin');
    this.world.addCoin(1);
    this.world.addScore(200, this.x + 8, this.y - 4);
  }

  update() {
    this.t++;
    if (this.mode === 'idle') {
      if (this.x + this.w < this.world.cam.x - 32) this.removed = true;
      return;
    }
    this.vy += POP_GRAVITY;
    this.y += this.vy;
    if (this.vy > 0 && this.y >= this.startY) {
      this.y = this.startY;
      this.burst();
    }
  }

  burst() {
    this.removed = true;
    fx(this.world, 'coinSparkle', this.x + 8, this.y + 4);
  }

  onPlayerTouch() {
    if (this.mode !== 'idle' || this.removed) return false;
    this.pay();
    this.burst();
    return true;
  }

  onStomp() {
    return false;
  }

  onFireball() {
    return false;
  }

  draw(ctx, cam) {
    const anim = this.mode === 'idle' ? COIN_IDLE_ANIM : COIN_ANIM;
    const spr = anim.frame(this.t);
    spr.draw(
      ctx,
      Math.floor(this.x - cam.x + (this.w - spr.w) * 0.5),
      Math.floor(this.y - cam.y + (this.h - spr.h) * 0.5)
    );
  }
}

registerEntity(Coin);
