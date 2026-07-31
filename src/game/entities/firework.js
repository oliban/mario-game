import { Entity, registerEntity } from '../entity.js';
import { makeSprite, Anim } from '../../core/gfx.js';
import { SCREEN_W, SCREEN_H } from '../../core/constants.js';
import rng from '../../core/rng.js';
import * as ITEMS from '../../data/sprites/items.js';
import { fx, sfx } from './mushroom.js';

// Shells are composed from discs, rings and rays on a 16x16 grid: generated once,
// hard-edged, no anti-aliasing.
function shell(spec) {
  const g = [];
  for (let y = 0; y < 16; y++) g.push(new Array(16).fill('.'));
  const cx = 7.5;
  const cy = 7.5;
  if (spec.disc) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - cx, y - cy);
        for (const [r, ch] of spec.disc) {
          if (d <= r) {
            g[y][x] = ch;
            break;
          }
        }
      }
    }
  }
  if (spec.ring) {
    const [r, th, ch] = spec.ring;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (Math.abs(Math.hypot(x - cx, y - cy) - r) <= th) g[y][x] = ch;
      }
    }
  }
  if (spec.rays) {
    const { n, from, to, ch, phase = 0 } = spec.rays;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + phase;
      for (let d = from; d <= to; d += 0.5) {
        const xi = Math.round(cx + Math.cos(a) * d);
        const yi = Math.round(cy + Math.sin(a) * d);
        if (xi >= 0 && xi < 16 && yi >= 0 && yi < 16) g[yi][xi] = ch;
      }
    }
  }
  return g.map((r) => r.join(''));
}

const SHELLS = [
  shell({ disc: [[1.6, '4'], [2.8, '3']] }),
  shell({
    disc: [[2, '4'], [3.6, '3'], [5, '2']],
    rays: { n: 8, from: 4.5, to: 6.5, ch: '2' },
  }),
  shell({
    disc: [[1.2, '3'], [2.4, '2']],
    ring: [5.8, 1.0, '2'],
    rays: { n: 8, from: 6, to: 7.4, ch: '1', phase: Math.PI / 8 },
  }),
  shell({ rays: { n: 8, from: 6, to: 7.4, ch: '1' }, ring: [3.2, 0.6, '1'] }),
];

const PALETTES = [
  ['#1a1008', '#a01018', '#e85018', '#ffd830', '#fffbd0'],
  ['#1a1008', '#0f63b3', '#5db3ff', '#bcdfff', '#ffffff'],
  ['#1a1008', '#077704', '#55c753', '#bdf4ab', '#ffffff'],
];

const AUTHORED = ITEMS.FIREWORK && ITEMS.FIREWORK.burst instanceof Anim ? ITEMS.FIREWORK.burst : null;
const ANIMS = AUTHORED
  ? [AUTHORED, AUTHORED, AUTHORED]
  : PALETTES.map(
      (pal, pi) =>
        new Anim(
          SHELLS.map((rows, i) => makeSprite(rows, pal, { name: `firework${pi}-${i}` })),
          [3, 4, 5, 6],
          false
        )
    );

const FLASH_ALPHA = [0.34, 0.2, 0.09];

export default class Firework extends Entity {
  static type = 'firework';

  // SMB awards one, three or six shells based on the final digit of the clock.
  static countForTime(time) {
    const d = Math.abs(Math.floor(time || 0)) % 10;
    return d === 1 ? 1 : d === 3 ? 3 : d === 6 ? 6 : 0;
  }

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    this.tangible = false;
    this.persistent = true;
    this.autoCorpse = false;
    this.anim = ANIMS[opts.palette != null ? opts.palette % ANIMS.length : rng.int(0, ANIMS.length - 1)];
    this.value = opts.value != null ? opts.value : 500;
    sfx(world, 'rocket');
    if (this.value > 0) world.addScore(this.value, x + 8, y);
    if (typeof world.flash === 'function') world.flash('#ffffff', 3);
    fx(world, 'fireballBurst', x + 8, y + 8);
  }

  update() {
    this.t++;
    if (this.anim.done(this.t)) this.removed = true;
  }

  onPlayerTouch() {}
  onFireball() {
    return false;
  }
  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    if (this.t < FLASH_ALPHA.length) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * FLASH_ALPHA[this.t];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.globalAlpha = prev;
    }
    this.anim
      .frame(this.t)
      .draw(ctx, Math.floor(this.x - cam.x), Math.floor(this.y - cam.y));
  }
}

const SPREAD = [
  [-44, -60],
  [40, -68],
  [-8, -84],
  [-56, -36],
  [56, -44],
  [12, -52],
];

// Schedules the end-of-level volley; spawn one of these once the castle is reached.
export class FireworkShow extends Entity {
  static type = 'fireworks';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 1;
    this.h = 1;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    this.tangible = false;
    this.persistent = true;
    this.autoCorpse = false;
    this.count = opts.count != null ? opts.count : Firework.countForTime(opts.time != null ? opts.time : world.time);
    this.interval = opts.interval != null ? opts.interval : 26;
    this.delay = opts.delay != null ? opts.delay : 24;
    this.fired = 0;
    this.value = opts.value != null ? opts.value : 500;
    if (this.count <= 0) this.removed = true;
  }

  update() {
    this.t++;
    if (this.fired < this.count && this.t >= this.delay + this.fired * this.interval) {
      const [ox, oy] = SPREAD[this.fired % SPREAD.length];
      const jx = Math.round(rng.range(-6, 6));
      const jy = Math.round(rng.range(-4, 4));
      this.world.spawn('firework', this.x + ox + jx, this.y + oy + jy, {
        palette: rng.int(0, PALETTES.length - 1),
        value: this.value,
      });
      this.fired++;
    }
    if (this.fired >= this.count && this.t >= this.delay + this.count * this.interval + 20) {
      this.removed = true;
      if (typeof this.world.onFireworksDone === 'function') this.world.onFireworksDone();
    }
  }

  onPlayerTouch() {}
  onFireball() {
    return false;
  }
  onStomp() {
    return false;
  }

  draw() {}
}

registerEntity(Firework);
registerEntity(FireworkShow);
