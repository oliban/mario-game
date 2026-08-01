import { Entity, registerEntity } from '../entity.js';
import { makeSprite } from '../../core/gfx.js';
import { TILE } from '../../core/constants.js';
import input, { BTN } from '../../core/input.js';
import * as ITEMS from '../../data/sprites/items.js';
import { PHYS } from '../physics.js';
import { fx, sfx } from './mushroom.js';
import { playersOf } from './index.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Launch speeds are derived from the gravity Mario actually rises under, so the
// advertised heights (4 tiles / 8 tiles) hold whatever the jump table says.
const ROW = (PHYS.jumpTable && PHYS.jumpTable[0]) || null;
const RISE_G = num(ROW && ROW.gHold, 0.125);
export const SPRING_LAUNCH = -Math.sqrt(2 * RISE_G * 4 * TILE);
export const SPRING_LAUNCH_HELD = -Math.sqrt(2 * RISE_G * 8 * TILE);

const SPRING_PAL = ['#1a1008', '#0d5c14', '#18a028', '#7cf07a'];

const PLATE = ['0000000000000000', '0333333333333330', '0322222222222210', '0000000000000000'];
const BASE = ['0000000000000000', '0322222222222210', '0311111111111110', '0000000000000000'];
const COIL_OPEN = ['...0........0...', '...0222222220...', '...0111111110...', '...0........0...'];
const COIL_TIGHT = ['...0222222220...', '...0111111110...'];

function build(units, tight) {
  const rows = PLATE.slice();
  for (let i = 0; i < units; i++) rows.push(...(tight ? COIL_TIGHT : COIL_OPEN));
  rows.push(...BASE);
  return rows;
}

const AUTHORED =
  ITEMS.SPRINGBOARD && Array.isArray(ITEMS.SPRINGBOARD.frames) && ITEMS.SPRINGBOARD.frames.length
    ? ITEMS.SPRINGBOARD.frames
    : null;

const SPRITES = AUTHORED || [
  makeSprite(build(6, false), SPRING_PAL, { name: 'spring.free' }),
  makeSprite(build(4, false), SPRING_PAL, { name: 'spring.mid' }),
  makeSprite(build(4, true), SPRING_PAL, { name: 'spring.tight' }),
];

const FULL_H = 32;
const MID_H = 24;
const LOW_H = 16;
const HEIGHTS = [FULL_H, MID_H, LOW_H, LOW_H];

export default class SpringBoard extends Entity {
  static type = 'springboard';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = FULL_H;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    this.baseline = y + FULL_H;
    this.stage = 0;
    this.phase = 'idle';
    this.phaseT = 0;
    this.rider = null;
    this.isPlatform = true;
    this.oneWay = true;
    this.tangible = true;
    this.persistent = true;
    this.autoCorpse = false;
    this.boost = false;
    this.strength = num(opts.strength, 1);
  }

  setStage(s) {
    this.stage = Math.max(0, Math.min(3, s));
    this.h = HEIGHTS[this.stage];
    this.y = this.baseline - this.h;
  }

  standing(e) {
    if (!e || e.removed) return false;
    if (e.x + e.w <= this.x + 1 || e.x >= this.x + this.w - 1) return false;
    const feet = e.y + e.h;
    return feet >= this.y - 3 && feet <= this.y + 6 + Math.max(0, e.vy);
  }

  snap(e) {
    e.y = this.y - e.h;
    if (e.vy > 0) e.vy = 0;
    e.grounded = true;
    e.onPlatform = this;
  }

  // Whoever is actually on the board drives it. The spring is a single-occupant
  // state machine, so it picks one player rather than tracking both.
  _occupant() {
    for (const p of playersOf(this.world)) if (this.standing(p)) return p;
    return this.world.player;
  }

  update() {
    this.t++;
    // The rider is LATCHED when the board starts compressing. Re-testing
    // standing() each frame loses him: compressing moves the plate down, his
    // feet fall outside the band, snap() stops being called and he drops off
    // the board before it can ever launch him.
    if (this.phase !== 'idle' && (!this.rider || this.rider.removed || this.rider.dead)) {
      this.rider = null;
      this.phase = 'idle';
      this.phaseT = 0;
    }
    const player = this.phase === 'idle' ? this._occupant() : this.rider;
    const on = this.phase === 'idle' ? this.standing(player) : !!player;

    switch (this.phase) {
      case 'idle': {
        this.setStage(0);
        if (on && player.vy >= 0) {
          this.rider = player;
          this.phase = 'compress';
          this.phaseT = 0;
        }
        break;
      }
      case 'compress': {
        this.phaseT++;
        this.setStage(Math.min(3, this.phaseT));
        if (on) this.snap(player);
        if (this.phaseT >= 3) {
          this.phase = 'release';
          this.phaseT = 0;
          // Read the pad of whoever is on the board, not always player one's.
          this.boost = (player && player.pad ? player.pad : input).down(BTN.JUMP);
        }
        break;
      }
      case 'release': {
        this.phaseT++;
        this.boost = this.boost || (player && player.pad ? player.pad : input).down(BTN.JUMP);
        this.setStage(Math.max(0, 3 - this.phaseT));
        if (this.phaseT >= 3) {
          this.setStage(0);
          // Launch the latched rider, not whoever happens to test as standing:
          // the plate has just sprung back up and he is a few pixels clear of it.
          if (player) this.launch(player);
          this.rider = null;
          this.phase = 'idle';
          this.phaseT = 0;
          this.boost = false;
        } else if (player) {
          this.snap(player);
        }
        break;
      }
      default:
        break;
    }
  }

  launch(player) {
    const held = this.boost || (player && player.pad ? player.pad : input).down(BTN.JUMP);
    const v = (held ? SPRING_LAUNCH_HELD : SPRING_LAUNCH) * this.strength;
    player.y = this.y - player.h - 1;
    player.onPlatform = null;
    if (typeof player.bounce === 'function') player.bounce(v);
    else {
      player.vy = v;
      player.grounded = false;
    }
    sfx(this.world, held ? 'jump-super' : 'jump');
    fx(this.world, 'landingDust', this.x + 8, this.baseline - 2, 0.8);
  }

  onPlayerTouch(player) {
    if (this.standing(player) && player.vy >= 0) this.snap(player);
  }

  onFireball() {
    return false;
  }

  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const spr = SPRITES[Math.min(SPRITES.length - 1, this.stage === 0 ? 0 : this.stage === 1 ? 1 : 2)];
    const sx = Math.floor(this.x - cam.x);
    const sy = Math.floor(this.baseline - cam.y) - spr.h;
    spr.draw(ctx, sx, sy);
  }
}

registerEntity(SpringBoard);
