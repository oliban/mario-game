import { Entity, registerEntity } from '../entity.js';
import { TILE, SCREEN_W } from '../../core/constants.js';
import * as ENEMIES_B from '../../data/sprites/enemies-b.js';
import { animOf, sfx } from './mushroom.js';

const HAMMER_PAL = [
  '#1a1008', '#6d3a10', '#a0632a', '#4e4e4e', '#8a8a8a', '#d8d8d8',
];

const HAMMER_ROWS = [
  '.0000000000.....',
  '.0555555540.....',
  '.0544444430.....',
  '.0544444430.....',
  '.0433333330.....',
  '.0000000000.....',
  '.......0120.....',
  '.......0120.....',
  '........0120....',
  '........0120....',
  '.........0120...',
  '.........0120...',
  '..........0120..',
  '..........0120..',
  '..........0000..',
  '................',
];

// Rotate a square char matrix 90 degrees clockwise so one authored hammer yields a spin.
function rot90(rows) {
  const n = rows.length;
  const out = [];
  for (let y = 0; y < n; y++) {
    let s = '';
    for (let x = 0; x < n; x++) s += rows[n - 1 - x][y];
    out.push(s);
  }
  return out;
}

const R0 = HAMMER_ROWS;
const R1 = rot90(R0);
const R2 = rot90(R1);
const R3 = rot90(R2);

export const HAMMER_ANIM = animOf(
  ENEMIES_B.HAMMER && ENEMIES_B.HAMMER.spin,
  [R0, R1, R2, R3],
  HAMMER_PAL,
  { name: 'hammer' },
  3
);

const GRAVITY = 0.28;
const MAX_FALL = 6.0;

export default class Hammer extends Entity {
  static type = 'hammer';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 10;
    this.h = 10;
    this.t = 0;
    this.facing = opts.dir === -1 ? -1 : 1;
    this.vx = typeof opts.vx === 'number' ? opts.vx : 1.5 * this.facing;
    this.vy = typeof opts.vy === 'number' ? opts.vy : -5.0;
    this.spin = this.facing >= 0 ? 1 : -1;
    this.hostile = true;
    this.autoCorpse = false;
    this.despawnOffscreen = false;
    this.held = !!opts.held;
    // A thrown hammer spawns roughly a tile ABOVE the Hammer Bro's head, which is
    // exactly where a player descending to stomp him passes through. Without a
    // short grace the bro is effectively unstompable while armed: you land on his
    // head and die to a hammer that has not visibly left his hand yet.
    this.spawnGrace = opts.held ? 0 : 8;
    this.holder = opts.holder || null;
    if (!this.held) sfx(world, 'shoot');
  }

  // The Hammer Bro parks the hammer above its head before the throw.
  hold(x, y) {
    this.held = true;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  release(vx, vy) {
    this.held = false;
    this.holder = null;
    this.vx = typeof vx === 'number' ? vx : 1.5 * this.facing;
    this.vy = typeof vy === 'number' ? vy : -5.0;
    // Same reason as the constructor: give it a few frames to clear the thrower's
    // head so a descending stomp is not an automatic hit.
    this.spawnGrace = 8;
    sfx(this.world, 'shoot');
  }

  update() {
    this.t++;
    if (this.spawnGrace > 0) this.spawnGrace--;
    if (this.held) {
      if (this.holder) {
        this.x = this.holder.x + (this.holder.facing < 0 ? -6 : this.holder.w - 4);
        this.y = this.holder.y - 12;
      }
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    this.x += this.vx;
    this.y += this.vy;

    const cam = this.world.cam;
    const floor = this.world.level ? this.world.level.height * TILE : 240;
    if (this.y > floor + 32) this.removed = true;
    if (this.x + this.w < cam.x - 32 || this.x > cam.x + SCREEN_W + 48) this.removed = true;
  }

  onPlayerTouch(player) {
    if (this.held || this.removed) return;
    if (this.spawnGrace > 0) return;
    if (player && typeof player.hurt === 'function') player.hurt(this);
    else if (player && typeof player.damage === 'function') player.damage(this);
  }

  onFireball() {
    return false;
  }

  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const sx = Math.floor(this.x - cam.x);
    const sy = Math.floor(this.y - cam.y);
    const n = HAMMER_ANIM.frames.length;
    const step = Math.floor(this.t / 3);
    const idx = this.held ? 0 : ((((this.spin > 0 ? step : -step) % n) + n) % n);
    const spr = HAMMER_ANIM.frames[idx];
    spr.draw(ctx, sx + 5 - (spr.w >> 1), sy + 5 - (spr.h >> 1));
  }
}

registerEntity(Hammer);
