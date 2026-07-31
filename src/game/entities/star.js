import { Entity, registerEntity } from '../entity.js';
import { TILE } from '../../core/constants.js';
import * as ITEMS from '../../data/sprites/items.js';
import { animOf, fx, sfx, stepX, stepY } from './mushroom.js';

const STAR_ROWS = [
  '.......00.......',
  '......0330......',
  '......0330......',
  '.....033330.....',
  '0111133333311110',
  '0122223333322210',
  '.01222433422210.',
  '..012243342210..',
  '...0123333210...',
  '...0122222210...',
  '..01220..02210..',
  '..0120....0210..',
  '.0120......0210.',
  '.010........010.',
  '.00..........00.',
  '................',
];

function starPal(dark, mid, light) {
  return ['#1a1008', dark, mid, light, '#1a1008'];
}

const PALS = [
  starPal('#bd8b00', '#e4c020', '#ffe870'),
  starPal('#c03400', '#ef9a49', '#ffd08a'),
  starPal('#8a8a8a', '#e8e8e8', '#ffffff'),
  starPal('#c03400', '#ef9a49', '#ffd08a'),
];

const STAR_ANIM = animOf(
  ITEMS.STARMAN && ITEMS.STARMAN.idle,
  PALS.map(() => STAR_ROWS),
  PALS,
  { name: 'starman' },
  4
);

const SPEED = 1.25;
const BOUNCE_VY = -4.0;
const GRAVITY = 0.25;
const MAX_FALL = 5.0;

export default class Star extends Entity {
  static type = 'star';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.t = 0;
    this.isItem = true;
    this.bouncy = true;
    this.autoCorpse = false;
    this.facing = opts.dir === -1 ? -1 : 1;
    this.gravity = GRAVITY;
    this.maxFall = MAX_FALL;
    if (!opts.fromBlock) {
      this.vx = SPEED * this.facing;
      this.vy = BOUNCE_VY;
    } else {
      sfx(world, 'item-appear');
    }
  }

  onEmerged() {
    fx(this.world, 'powerupSparkle', this.x + 8, this.y + 8);
    if (this.world.solidAt(this.x + this.w + 1, this.y + 8)) this.facing = -1;
    this.vx = SPEED * this.facing;
    this.vy = BOUNCE_VY;
  }

  onBlockBump() {
    this.vy = BOUNCE_VY;
    this.grounded = false;
  }

  update() {
    this.t++;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    const push = stepX(this);
    if (push !== 0) {
      this.facing = push;
      this.vx = SPEED * this.facing;
    }
    const hit = stepY(this);
    if (hit === 1) {
      this.vy = BOUNCE_VY;
      this.grounded = false;
      fx(this.world, 'landingDust', this.x + 8, this.y + this.h, 0.6);
    } else if (hit === -1) {
      this.vy = 0.5;
    }
    if (this.t % 4 === 0) fx(this.world, 'starTrail', this.x + 8, this.y + 8);

    const lvl = this.world.level;
    if (this.y > ((lvl && lvl.height) || 15) * TILE + 64) this.removed = true;
    if (this.x + this.w < this.world.cam.x - 32) this.removed = true;
  }

  onPlayerTouch(player) {
    if (this.removed) return false;
    this.removed = true;
    const cx = this.x + 8;
    this.world.addScore(1000, cx, this.y);
    if (player && typeof player.powerUp === 'function') player.powerUp('star');
    fx(this.world, 'powerupSparkle', cx, this.y + 8);
    sfx(this.world, 'powerup');
    return true;
  }

  onStomp() {
    return false;
  }

  onFireball() {
    return false;
  }

  draw(ctx, cam) {
    const spr = STAR_ANIM.frame(this.t);
    const sx = Math.floor(this.x - cam.x + (this.w - spr.w) * 0.5);
    const sy = Math.floor(this.y - cam.y + (this.h - spr.h));
    if (!this.emerging) {
      spr.draw(ctx, sx, sy);
      return;
    }
    const blockTop = (this.emergeTarget != null ? this.emergeTarget : this.y - this.h) + this.h;
    const clipY = Math.floor(blockTop - cam.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx - 2, clipY - 80, spr.w + 4, 80);
    ctx.clip();
    spr.draw(ctx, sx, sy);
    ctx.restore();
  }
}

registerEntity(Star);
registerEntity('starman', Star);
