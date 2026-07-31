import { Entity, registerEntity } from '../entity.js';
import { makeSprite } from '../../core/gfx.js';
import { TILE } from '../../core/constants.js';
import * as ITEMS from '../../data/sprites/items.js';

const SHARD_ROWS = [
  '33333330',
  '32222210',
  '32222210',
  '31111110',
  '00000000',
  '32222210',
  '31111110',
  '00000000',
];

const THEME_PAL = {
  overworld: ['#7a2800', '#a04a00', '#c85a10', '#e8944c'],
  athletic: ['#7a2800', '#a04a00', '#c85a10', '#e8944c'],
  underground: ['#003840', '#00727d', '#3ec2cd', '#b5ebf2'],
  water: ['#002d69', '#0f63b3', '#5db3ff', '#bcdfff'],
  castle: ['#2b2b2b', '#4e4e4e', '#8a8a8a', '#d8d8d8'],
};

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

const ROTS = [SHARD_ROWS];
for (let i = 0; i < 3; i++) ROTS.push(rot90(ROTS[i]));

// items.js ships one tumble animation; it is the right look for the overworld
// brick. Other themes get the same shard recoloured to the local tileset.
const SHARED = ITEMS.DEBRIS && ITEMS.DEBRIS.tumble ? ITEMS.DEBRIS.tumble.frames : null;

const SHEETS = {};
function shardFrames(theme) {
  const key = THEME_PAL[theme] ? theme : 'overworld';
  if (!SHEETS[key]) {
    if (SHARED && (key === 'overworld' || key === 'athletic')) SHEETS[key] = SHARED;
    else {
      SHEETS[key] = ROTS.map((rows, i) =>
        makeSprite(rows, THEME_PAL[key], { name: `shard-${key}-${i}` })
      );
    }
  }
  return SHEETS[key];
}

const GRAVITY = 0.35;
const MAX_FALL = 8.0;

// Four symmetric chunks: the top pair is thrown higher than the bottom pair.
const PIECES = [
  { dx: 0, dy: 0, vx: -1.25, vy: -6.0, spin: -1 },
  { dx: 8, dy: 0, vx: 1.25, vy: -6.0, spin: 1 },
  { dx: 0, dy: 8, vx: -1.25, vy: -3.5, spin: -1 },
  { dx: 8, dy: 8, vx: 1.25, vy: -3.5, spin: 1 },
];

export default class Debris extends Entity {
  static type = 'debris';

  // Spawn the whole four-chunk burst from the top-left of a 16x16 block.
  static burst(world, x, y, opts = {}) {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(world.spawn('debris', x, y, { ...opts, piece: i }));
    return out;
  }

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 8;
    this.h = 8;
    this.t = 0;
    this.theme = opts.theme || world.theme || (world.level && world.level.theme) || 'overworld';
    this.frames = shardFrames(this.theme);
    this.tangible = false;
    this.autoCorpse = false;
    this.despawnOffscreen = false;

    if (opts.piece == null) {
      // Bare spawn: become chunk 0 and emit the remaining three.
      this.piece = 0;
      for (let i = 1; i < 4; i++) world.spawn('debris', x, y, { ...opts, piece: i });
    } else {
      this.piece = opts.piece | 0;
    }

    const p = PIECES[this.piece & 3];
    this.x = x + p.dx;
    this.y = y + p.dy;
    this.vx = typeof opts.vx === 'number' ? opts.vx : p.vx;
    this.vy = typeof opts.vy === 'number' ? opts.vy : p.vy;
    this.spin = p.spin;
    this.rot = (this.piece * 1.0) | 0;
  }

  update() {
    this.t++;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    this.x += this.vx;
    this.y += this.vy;
    const floor = (this.world.level ? this.world.level.height : 15) * TILE;
    if (this.y > floor + 48) this.removed = true;
    if (this.x + this.w < this.world.cam.x - 48) this.removed = true;
  }

  onPlayerTouch() {}
  onFireball() {
    return false;
  }
  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const n = this.frames.length;
    const step = Math.floor(this.t / 3) * this.spin + this.rot;
    const spr = this.frames[(((step % n) + n) % n)];
    spr.draw(
      ctx,
      Math.floor(this.x - cam.x + (this.w - spr.w) * 0.5),
      Math.floor(this.y - cam.y + (this.h - spr.h) * 0.5)
    );
  }
}

registerEntity(Debris);
