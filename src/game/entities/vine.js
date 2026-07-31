import { Entity, registerEntity } from '../entity.js';
import { TILE } from '../../core/constants.js';
import * as ITEMS from '../../data/sprites/items.js';
import { spriteOf, sfx } from './mushroom.js';

const VINE_PAL = ['#0b3400', '#18a028', '#7cf07a'];

const VINE_SEG = [
  '..0120..',
  '..0120..',
  '.00120..',
  '011120..',
  '010120..',
  '..0120..',
  '..0120..',
  '..0120..',
  '..0120..',
  '..01200.',
  '..012110',
  '..01210.',
  '..0120..',
  '..0120..',
  '..0120..',
  '..0120..',
];

const VINE_TOP = [
  '...00...',
  '..0220..',
  '.022220.',
  '.021120.',
  '.011210.',
  '..0120..',
  '..0120..',
  '.00120..',
  '011120..',
  '010120..',
  '..0120..',
  '..0120..',
  '..0120..',
  '..0120..',
  '..0120..',
  '..0120..',
];

const SEG = spriteOf(ITEMS.VINE && ITEMS.VINE.body, VINE_SEG, VINE_PAL, { name: 'vine.body' });
const TOP = spriteOf(ITEMS.VINE && ITEMS.VINE.tip, VINE_TOP, VINE_PAL, { name: 'vine.tip' });

const GROW_FRAMES = 60;

export default class Vine extends Entity {
  static type = 'vine';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 8;
    this.h = 0;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    this.baseY = y;
    // Centred in the block it sprouts from.
    this.x = Math.floor(x / TILE) * TILE + 4;
    this.targetH = opts.height != null ? opts.height * TILE : 10 * TILE;
    this.growRate = this.targetH / (opts.growFrames || GROW_FRAMES);
    this.growing = true;
    this.climbable = true;
    this.tangible = false;
    this.persistent = true;
    this.autoCorpse = false;
    this.warp = opts.warp || null;
    this.y = y;
    sfx(world, 'sprout');
    if (typeof world.registerClimbable === 'function') world.registerClimbable(this);
  }

  update() {
    this.t++;
    if (this.growing) {
      this.h = Math.min(this.targetH, this.h + this.growRate);
      this.y = this.baseY - this.h;
      // Stop early against a ceiling so the vine never grows through solid tiles.
      if (this.world.solidAt(this.x + 4, this.y - 1)) {
        this.growing = false;
        this.h = this.baseY - (Math.floor((this.y - 1) / TILE) * TILE + TILE);
        this.y = this.baseY - this.h;
      }
      if (this.h >= this.targetH) {
        this.h = this.targetH;
        this.y = this.baseY - this.h;
        this.growing = false;
      }
    }
    if (this.x + this.w < this.world.cam.x - 64) this.removed = true;
  }

  // The player system asks this before latching on.
  canClimb(e) {
    if (this.h < 8) return false;
    return (
      e.x + e.w > this.x - 2 &&
      e.x < this.x + this.w + 2 &&
      e.y + e.h > this.y &&
      e.y < this.baseY
    );
  }

  climbX() {
    return this.x + this.w / 2;
  }

  onPlayerTouch(player) {
    if (this.h < 8 || !player) return;
    if (typeof player.grabVine === 'function' && this.canClimb(player)) player.grabVine(this);
  }

  onFireball() {
    return false;
  }

  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    if (this.h <= 0) return;
    const sx = Math.floor(this.x - cam.x);
    const bottom = Math.floor(this.baseY - cam.y);
    const top = Math.floor(this.y - cam.y);
    // Clip so the growing tip is revealed a pixel at a time.
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, top, this.w, bottom - top);
    ctx.clip();
    TOP.draw(ctx, sx, top);
    for (let yy = top + TOP.h; yy < bottom; yy += SEG.h) SEG.draw(ctx, sx, yy);
    ctx.restore();
  }
}

registerEntity(Vine);
