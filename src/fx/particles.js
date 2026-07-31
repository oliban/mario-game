// Particle system — the layer that makes every impact feel physical.
//
// Pooled and allocation-free at play time: 600 world particles + 64 screen-space ambient
// particles are built once, then recycled forever. Nothing in here allocates per frame,
// nothing calls Math.random, nothing is scaled by dt. One update() == one 1/60.0988 s tick,
// velocities are px/frame, accelerations px/frame^2, +Y is DOWN.
//
// World-space particles are drawn camera-relative on LAYER.PARTICLES. Ambient particles are
// screen-space (they never move with the camera) and are drawn behind the gameplay puffs.

import { SCREEN_W, SCREEN_H, TILE, LAYER, THEME } from '../core/constants.js';
import { makeSprite } from '../core/gfx.js';
import { rng } from '../core/rng.js';

export const PARTICLE_MAX = 600;
export const AMBIENT_MAX = 64;

// ---------------------------------------------------------------------------
// Scalar helpers, sine table, colour cache.
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

const SIN_N = 256;
const SIN = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN[i] = Math.sin((i / SIN_N) * Math.PI * 2);

// Phase is in table units: 256 == one full turn. Accepts fractional input.
function sinT(t) {
  let i = t | 0;
  i %= SIN_N;
  if (i < 0) i += SIN_N;
  return SIN[i];
}
function cosT(t) {
  return sinT(t + 64);
}

const ALPHA_STEPS = 8; // alpha is quantised so fades stay crunchy instead of mushy

const _rgb = new Map();
function hexRgb(hex) {
  let v = _rgb.get(hex);
  if (v) return v;
  let s = hex[0] === '#' ? hex.slice(1) : hex;
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16) >>> 0;
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgb.set(hex, v);
  return v;
}

const _rgba = new Map();
function rgbaOf(hex, step) {
  let arr = _rgba.get(hex);
  if (!arr) {
    const c = hexRgb(hex);
    arr = [];
    for (let i = 0; i <= ALPHA_STEPS; i++) {
      arr.push(`rgba(${c[0]},${c[1]},${c[2]},${(i / ALPHA_STEPS).toFixed(3)})`);
    }
    _rgba.set(hex, arr);
  }
  return arr[step];
}

function hexOf(r, g, b) {
  const h = ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  return `#${h}`;
}
function tintHex(hex, f) {
  const c = hexRgb(hex);
  return hexOf(
    Math.round(lerp(c[0], 255, f)),
    Math.round(lerp(c[1], 255, f)),
    Math.round(lerp(c[2], 255, f))
  );
}
function shadeHex(hex, f) {
  const c = hexRgb(hex);
  return hexOf(
    Math.round(c[0] * (1 - f)),
    Math.round(c[1] * (1 - f)),
    Math.round(c[2] * (1 - f))
  );
}

// A five step light->dark ramp derived from any base colour. Memoised so fireworks with an
// arbitrary colour never allocate twice.
const _ramps = new Map();
export function rampFromColor(hex) {
  let r = _ramps.get(hex);
  if (r) return r;
  r = [tintHex(hex, 0.75), tintHex(hex, 0.35), hex, shadeHex(hex, 0.35), shadeHex(hex, 0.65)];
  _ramps.set(hex, r);
  prewarm(r);
  return r;
}

// ---------------------------------------------------------------------------
// Colour ramps. Hues are lifted from the NES master palette so the fx read as one console.
// ---------------------------------------------------------------------------

export const RAMP = {
  dust: ['#fefeff', '#e8e8e0', '#b8b8b8', '#8a8a8a'],
  dustWarm: ['#fefeff', '#f8d5ac', '#d8b088', '#9f7a4a'],
  dustCool: ['#fefeff', '#bcdfff', '#8fa1ff', '#4051d0'],
  smoke: ['#d8d8d8', '#b8b8b8', '#8a8a8a', '#4e4e4e'],
  poof: ['#ffffff', '#e4e4e4', '#aeaeae', '#656565'],
  coin: ['#ffffff', '#e4e594', '#e4e594', '#bdac2c', '#8a7a12'],
  spark: ['#ffffff', '#fefeff', '#e4e594', '#ef9a49'],
  star: ['#ffffff', '#e4e594', '#cfef96', '#b5ebf2', '#ffcce5', '#f785fa'],
  fire: ['#ffffff', '#f8d5ac', '#ef9a49', '#bd3c30', '#710f07'],
  ember: ['#fefeff', '#f8d5ac', '#ef9a49', '#bd3c30', '#8a2408'],
  water: ['#ffffff', '#bcdfff', '#5db3ff', '#0f63b3'],
  foam: ['#ffffff', '#e8f4ff', '#bcdfff', '#8fa1ff'],
  mote: ['#fff4d8', '#f0e0b8', '#c8b48a'],
  moteCool: ['#d8e4f8', '#a8b8d8', '#7888a8'],
  brickO: ['#f8d5ac', '#ef9a49', '#9f4a00', '#5a1a00'],
  brickU: ['#b5ebf2', '#5db3ff', '#0f63b3', '#002d69'],
  brickC: ['#fefeff', '#b8b8b8', '#656565', '#1a1a1a'],
};

const CONFETTI_COLORS = [
  '#ff8b7f', '#e4e594', '#55c753', '#5db3ff',
  '#f785fa', '#ffcce5', '#fefeff', '#ef9a49',
];

const FIREWORK_COLORS = {
  red: '#ff8b7f',
  orange: '#ef9a49',
  gold: '#e4e594',
  yellow: '#e4e594',
  green: '#55c753',
  cyan: '#3ec2cd',
  blue: '#5db3ff',
  purple: '#c890ff',
  pink: '#ffcce5',
  white: '#fefeff',
};
const FIREWORK_CYCLE = ['#ff8b7f', '#e4e594', '#55c753', '#5db3ff', '#f785fa', '#fefeff'];

function prewarm(ramp) {
  for (let i = 0; i < ramp.length; i++) {
    for (let a = 0; a <= ALPHA_STEPS; a++) rgbaOf(ramp[i], a);
  }
}
for (const k in RAMP) prewarm(RAMP[k]);
// Three tones per colour: the lit face, the flat face and the edge as the paper spins.
// A full rampFromColor() would swing to near-black and read as a hole in the sky.
const CONFETTI_RAMPS = CONFETTI_COLORS.map((c) => {
  const r = [tintHex(c, 0.45), c, shadeHex(c, 0.35)];
  prewarm(r);
  return r;
});
for (const k in FIREWORK_COLORS) rampFromColor(FIREWORK_COLORS[k]);

// ---------------------------------------------------------------------------
// Per-theme fx colours. Brick debris, dust and crumbs all follow the level theme.
// ---------------------------------------------------------------------------

const THEME_FX = {
  [THEME.OVERWORLD]: { chunk: ['#f8d5ac', '#ef9a49', '#9f4a00'], dust: RAMP.dustWarm, crumb: RAMP.brickO },
  [THEME.ATHLETIC]: { chunk: ['#f8d5ac', '#ef9a49', '#9f4a00'], dust: RAMP.dustWarm, crumb: RAMP.brickO },
  [THEME.UNDERGROUND]: { chunk: ['#b5ebf2', '#3ec2cd', '#0f63b3'], dust: RAMP.dustCool, crumb: RAMP.brickU },
  [THEME.WATER]: { chunk: ['#b5ebf2', '#5db3ff', '#0f63b3'], dust: RAMP.foam, crumb: RAMP.brickU },
  [THEME.CASTLE]: { chunk: ['#fefeff', '#b8b8b8', '#656565'], dust: RAMP.dust, crumb: RAMP.brickC },
};
function fxTheme(name) {
  return THEME_FX[name] || THEME_FX[THEME.OVERWORLD];
}

// ---------------------------------------------------------------------------
// Brick chunk art. Three tumble poses, baked once per theme, mirrored for free by Sprite.
// Slots: 0 = lit face (upper-left), 1 = body, 2 = occluded edge.
// ---------------------------------------------------------------------------

const CHUNK_ROWS = [
  ['.00.', '0112', '1122', '.12.'],
  ['.00.', '.012', '.112', '.12.'],
  ['..0.', '.01.', '.12.', '..2.'],
];

const _chunkSets = new Map();
function chunkSet(themeName) {
  let set = _chunkSets.get(themeName);
  if (set) return set;
  const pal = fxTheme(themeName).chunk;
  set = CHUNK_ROWS.map((rows, i) =>
    makeSprite(rows, pal, { name: `chunk:${themeName}:${i}` })
  );
  _chunkSets.set(themeName, set);
  return set;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const S = {
  RECT: 0,
  POINT: 1,
  MOTE: 2,
  RING: 3,
  CHUNK: 4,
  STREAK: 5,
  CONFETTI: 6,
  BUBBLE: 7,
  SPRITE: 8,
};

class Particle {
  constructor(index) {
    this.i = index;
    this.alive = false;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.dragX = 1;
    this.dragY = 1;
    this.age = 0;
    this.life = 30;
    this.size0 = 1;
    this.size1 = 1;
    this.alpha0 = 1;
    this.alpha1 = 0;
    this.hold = 0.35; // fraction of life held at alpha0 before the fade starts
    this.ramp = RAMP.dust;
    this.cycle = 0; // >0: step the ramp every N frames instead of over life
    this.rampOff = 0;
    this.shape = S.RECT;
    this.add = false;
    this.sprite = null;
    this.frames = null;
    this.spin = 0;
    this.flipX = false;
    this.swayAmp = 0;
    this.swayFreq = 0;
    this.swayPhase = 0;
    this.screen = false;
    this.prio = 1;
    this.trail = 0;
    this.trailEvery = 3;
    this.trailRamp = null;
    this.pop = 0;
    this.collide = false;
    this.bounce = 0;
    this.rest = false;
    this.len = 0;
    return this;
  }
}

const ZERO_CAM = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// The system
// ---------------------------------------------------------------------------

export class ParticleSystem {
  constructor(opts = {}) {
    this.layer = LAYER.PARTICLES;
    this.capacity = opts.max || PARTICLE_MAX;
    this.ambientCapacity = opts.ambientMax || AMBIENT_MAX;

    this.pool = new Array(this.capacity);
    this._free = new Int32Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.pool[i] = new Particle(i);
      this._free[i] = this.capacity - 1 - i;
    }
    this._freeTop = this.capacity;
    this._steal = 0;
    this.live = 0;

    this.amb = new Array(this.ambientCapacity);
    for (let i = 0; i < this.ambientCapacity; i++) {
      this.amb[i] = new Particle(i);
      this.amb[i].screen = true;
    }
    this.ambLive = 0;
    this._ambCursor = 0;
    this.ambientTheme = null;
    this.ambientTarget = 0;
    this.ambientDensity = 1;

    this.world = opts.world || null;
    this.theme = opts.theme || THEME.OVERWORLD;
    this.density = 1; // global count multiplier, drop below 1 for weak hardware
    this.enabled = true;
    this.tick = 0;
    this.cam = null;
    this._camx = 0;
    this._camy = 0;
    this._hasCam = false;
    this._fillHex = null;
    this._fillStep = -1;
    this._fw = 0;

    if (opts.world) this.attach(opts.world);
    ParticleSystem.active = this;
  }

  attach(world) {
    this.world = world || null;
    if (world && world.cam) this.cam = world.cam;
    return this;
  }

  /** Theme drives brick debris colours and the tint of landing dust. */
  setTheme(name) {
    if (name) this.theme = name;
    return this;
  }

  get count() {
    return this.live + this.ambLive;
  }

  /**
   * Dark themes get additive sparks — they bloom beautifully against black. On a bright
   * daylight sky 'lighter' washes every hue to white, so overworld levels blend normally
   * and let the colour ramp carry the brightness instead.
   */
  get _dark() {
    return (
      this.theme === THEME.UNDERGROUND ||
      this.theme === THEME.CASTLE ||
      this.theme === THEME.WATER
    );
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].alive = false;
    this._freeTop = this.capacity;
    for (let i = 0; i < this.capacity; i++) this._free[i] = this.capacity - 1 - i;
    this.live = 0;
    return this;
  }

  clearAmbient() {
    for (let i = 0; i < this.ambientCapacity; i++) this.amb[i].alive = false;
    this.ambLive = 0;
    return this;
  }

  clearAll() {
    return this.clear().clearAmbient();
  }

  stats() {
    return {
      particles: this.live,
      ambient: this.ambLive,
      capacity: this.capacity,
      theme: this.theme,
      ambientTheme: this.ambientTheme,
    };
  }

  // -- pool ----------------------------------------------------------------

  _room(n) {
    return this._freeTop >= n;
  }

  /**
   * Take a particle from the pool. When the pool is dry the least important particle from a
   * small rolling sample is recycled, so a big burst degrades gracefully instead of vanishing.
   */
  _alloc(prio = 1) {
    if (!this.enabled) return null;
    let idx;
    if (this._freeTop > 0) {
      idx = this._free[--this._freeTop];
      const p = this.pool[idx];
      p.reset();
      p.alive = true;
      p.prio = prio;
      this.live++;
      return p;
    }
    let best = -1;
    let bestScore = Infinity;
    const n = this.capacity;
    for (let k = 0; k < 12; k++) {
      const j = (this._steal + k) % n;
      const q = this.pool[j];
      if (!q.alive) {
        best = j;
        break;
      }
      const score = q.prio * 4096 + (q.life - q.age);
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    this._steal = (this._steal + 12) % n;
    if (best < 0) return null;
    const p = this.pool[best];
    const wasAlive = p.alive;
    p.reset();
    p.alive = true;
    p.prio = prio;
    if (!wasAlive) this.live++;
    return p;
  }

  _release(p) {
    if (!p.alive) return;
    p.alive = false;
    if (this._freeTop < this.capacity) this._free[this._freeTop++] = p.i;
    this.live--;
  }

  // -- generic public emitters ---------------------------------------------

  /**
   * Fire a single particle from a plain options object. Convenience for other systems;
   * the named emitters below never go through here so they stay allocation free.
   */
  emit(o) {
    const p = this._alloc(o.prio == null ? 1 : o.prio);
    if (!p) return null;
    p.x = o.x || 0;
    p.y = o.y || 0;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.ax = o.ax || 0;
    p.ay = o.ay || 0;
    if (o.drag != null) p.dragX = p.dragY = o.drag;
    if (o.dragX != null) p.dragX = o.dragX;
    if (o.dragY != null) p.dragY = o.dragY;
    p.life = Math.max(1, o.life == null ? 30 : o.life);
    p.size0 = o.size == null ? (o.size0 == null ? 1 : o.size0) : o.size;
    p.size1 = o.size1 == null ? p.size0 : o.size1;
    if (o.alpha != null) p.alpha0 = o.alpha;
    if (o.alpha0 != null) p.alpha0 = o.alpha0;
    if (o.alpha1 != null) p.alpha1 = o.alpha1;
    if (o.hold != null) p.hold = o.hold;
    if (o.ramp) p.ramp = o.ramp;
    else if (o.color) p.ramp = rampFromColor(o.color);
    if (o.cycle) p.cycle = o.cycle;
    if (o.rampOff) p.rampOff = o.rampOff;
    p.add = !!o.additive;
    if (o.sprite) {
      p.sprite = o.sprite;
      p.shape = S.SPRITE;
    }
    if (o.shape != null) p.shape = o.shape;
    if (o.swayAmp) {
      p.swayAmp = o.swayAmp;
      p.swayFreq = o.swayFreq || 3;
      p.swayPhase = o.swayPhase == null ? rng.range(0, SIN_N) : o.swayPhase;
    }
    p.collide = !!o.collide;
    p.bounce = o.bounce == null ? 0.3 : o.bounce;
    p.screen = !!o.screen;
    p.flipX = !!o.flipX;
    return p;
  }

  /** Radial burst helper: n particles evenly spread with jitter. */
  burst(o) {
    const n = Math.max(1, Math.round((o.count || 8) * this.density));
    const step = SIN_N / n;
    const spd0 = o.speed0 == null ? 0.6 : o.speed0;
    const spd1 = o.speed1 == null ? 1.6 : o.speed1;
    for (let i = 0; i < n; i++) {
      const a = i * step + rng.range(-step * 0.4, step * 0.4) + (o.angle || 0);
      const s = rng.range(spd0, spd1);
      const p = this.emit(o);
      if (!p) return;
      p.vx = cosT(a) * s;
      p.vy = sinT(a) * s * (o.squash == null ? 1 : o.squash);
      p.life = Math.round(rng.range(o.life0 || o.life || 20, o.life1 || o.life || 30));
    }
  }

  // -- update ---------------------------------------------------------------

  update(cam) {
    if (cam && typeof cam === 'object' && cam.x !== undefined) this.cam = cam;
    else if (!this.cam && this.world && this.world.cam) this.cam = this.world.cam;
    if (this.cam) {
      this._camx = this.cam.x;
      this._camy = this.cam.y;
      this._hasCam = true;
    }
    this.tick++;

    const pool = this.pool;
    for (let i = 0; i < this.capacity; i++) {
      const p = pool[i];
      if (p.alive) this._step(p);
    }
    this._updateAmbient();
  }

  _step(p) {
    if (p.rest) {
      p.age++;
      if (p.age >= p.life) this._release(p);
      return;
    }
    p.vx = p.vx * p.dragX + p.ax;
    p.vy = p.vy * p.dragY + p.ay;
    p.x += p.vx;
    p.y += p.vy;
    if (p.collide) this._collide(p);
    p.age++;

    if (p.trail && p.age % p.trailEvery === 0 && this._room(64)) this._trailDot(p);

    if (p.age >= p.life) {
      if (p.pop) this._popBurst(p);
      this._release(p);
      return;
    }
    if (!p.screen && this._hasCam) {
      const dx = p.x - this._camx;
      const dy = p.y - this._camy;
      if (dx < -80 || dx > SCREEN_W + 80 || dy < -200 || dy > SCREEN_H + 120) this._release(p);
    }
  }

  _collide(p) {
    const w = this.world;
    if (!w || !w.solidAt) return;
    if (p.vy > 0 && w.solidAt(p.x, p.y + 1)) {
      p.y = Math.floor((p.y + 1) / TILE) * TILE - 0.01;
      p.vy = -p.vy * p.bounce;
      p.vx *= 0.55;
      if (p.vy > -0.32) {
        p.vy = 0;
        p.vx = 0;
        p.ay = 0;
        p.rest = true;
        p.swayAmp = 0;
      }
    }
  }

  _trailDot(p) {
    const q = this._alloc(0);
    if (!q) return;
    q.x = p.x;
    q.y = p.y;
    q.vx = p.vx * 0.12;
    q.vy = p.vy * 0.12;
    q.dragX = 0.86;
    q.dragY = 0.86;
    q.life = 9 + rng.int(0, 6);
    q.size0 = 1;
    q.size1 = 1;
    q.shape = S.POINT;
    q.add = p.add;
    q.ramp = p.trailRamp || p.ramp;
    q.alpha0 = 0.7;
    q.alpha1 = 0;
    q.hold = 0.1;
  }

  _popBurst(p) {
    for (let i = 0; i < 3; i++) {
      const q = this._alloc(0);
      if (!q) return;
      const a = rng.range(0, SIN_N);
      q.x = p.x;
      q.y = p.y;
      q.vx = cosT(a) * 0.35;
      q.vy = sinT(a) * 0.35 - 0.1;
      q.dragX = 0.9;
      q.dragY = 0.9;
      q.life = 6 + rng.int(0, 4);
      q.shape = S.POINT;
      q.ramp = RAMP.foam;
      q.alpha0 = 0.8;
      q.hold = 0.1;
    }
  }

  // -- draw -----------------------------------------------------------------

  draw(ctx, cam) {
    let c = ZERO_CAM;
    if (cam && cam.x !== undefined) {
      c = cam;
      this.cam = cam;
      this._camx = cam.x;
      this._camy = cam.y;
      this._hasCam = true;
    } else if (this.cam) {
      c = this.cam;
    }
    const camx = c.x;
    const camy = c.y;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this._fillHex = null;
    this._fillStep = -1;

    // Ambient normal pass first — it sits behind the gameplay puffs.
    for (let i = 0; i < this.ambientCapacity; i++) {
      const p = this.amb[i];
      if (p.alive && !p.add) this._drawOne(ctx, p, 0, 0);
    }
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (p.alive && !p.add) this._drawOne(ctx, p, camx, camy);
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.ambientCapacity; i++) {
      const p = this.amb[i];
      if (p.alive && p.add) this._drawOne(ctx, p, 0, 0);
    }
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (p.alive && p.add) this._drawOne(ctx, p, camx, camy);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _setFill(ctx, hex, step) {
    if (hex === this._fillHex && step === this._fillStep) return;
    this._fillHex = hex;
    this._fillStep = step;
    ctx.fillStyle = rgbaOf(hex, step);
  }

  _drawOne(ctx, p, camx, camy) {
    const t = p.life > 1 ? p.age / p.life : 1;

    let a = p.alpha0;
    if (t > p.hold) {
      const k = p.hold >= 1 ? 1 : (t - p.hold) / (1 - p.hold);
      a = lerp(p.alpha0, p.alpha1, k > 1 ? 1 : k);
    }
    let step = Math.round(a * ALPHA_STEPS);
    if (step <= 0) return;
    if (step > ALPHA_STEPS) step = ALPHA_STEPS;

    const n = p.ramp.length;
    let ci;
    if (p.cycle) {
      ci = (((p.age / p.cycle) | 0) + p.rampOff) % n;
      if (ci < 0) ci += n;
    } else {
      ci = (t * n) | 0;
      if (ci >= n) ci = n - 1;
      if (ci < 0) ci = 0;
    }
    const hex = p.ramp[ci];

    let wx = p.x;
    if (p.swayAmp) wx += sinT(p.age * p.swayFreq + p.swayPhase) * p.swayAmp;
    const sx = Math.floor(wx - camx);
    const sy = Math.floor(p.y - camy);
    if (sx < -32 || sx > SCREEN_W + 32 || sy < -32 || sy > SCREEN_H + 32) return;

    const size = lerp(p.size0, p.size1, t);

    switch (p.shape) {
      case S.POINT: {
        this._setFill(ctx, hex, step);
        ctx.fillRect(sx, sy, 1, 1);
        break;
      }
      case S.RECT: {
        let s = Math.round(size);
        if (s < 1) return;
        this._setFill(ctx, hex, step);
        const h = s >> 1;
        ctx.fillRect(sx - h, sy - h, s, s);
        break;
      }
      case S.MOTE: {
        this._setFill(ctx, hex, step);
        ctx.fillRect(sx, sy, 1, 1);
        if (size >= 2) {
          // lit from the upper-left: bright pixel, then a dimmer body pixel below-right
          const dim = p.ramp[Math.min(n - 1, ci + 1)];
          this._setFill(ctx, dim, step);
          ctx.fillRect(sx + 1, sy, 1, 1);
          ctx.fillRect(sx, sy + 1, 1, 1);
          const dark = p.ramp[Math.min(n - 1, ci + 2)];
          this._setFill(ctx, dark, step > 1 ? step - 1 : step);
          ctx.fillRect(sx + 1, sy + 1, 1, 1);
        }
        break;
      }
      case S.RING: {
        this._setFill(ctx, hex, step);
        this._circle(ctx, sx, sy, Math.round(size));
        break;
      }
      case S.BUBBLE: {
        const r = Math.round(size);
        this._setFill(ctx, hex, step);
        if (r <= 1) {
          ctx.fillRect(sx, sy - 1, 1, 1);
          ctx.fillRect(sx - 1, sy, 1, 1);
          ctx.fillRect(sx + 1, sy, 1, 1);
          ctx.fillRect(sx, sy + 1, 1, 1);
        } else {
          this._circle(ctx, sx, sy, r);
          this._setFill(ctx, p.ramp[0], step);
          ctx.fillRect(sx - r + 1, sy - r + 1, 1, 1);
        }
        break;
      }
      case S.CHUNK: {
        const frames = p.frames;
        if (!frames) return;
        const f = p.spin ? ((p.age / p.spin) | 0) : 0;
        const idx = f & 3;
        const spr = frames[idx === 3 ? 1 : idx];
        ctx.globalAlpha = step / ALPHA_STEPS;
        spr.draw(ctx, sx - 2, sy - 2, idx === 3 ? !p.flipX : p.flipX, false);
        ctx.globalAlpha = 1;
        break;
      }
      case S.STREAK: {
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const len = Math.min(p.len || 5, Math.round(sp * 2.2));
        const hs = Math.max(1, Math.round(size));
        this._setFill(ctx, hex, step);
        ctx.fillRect(sx - (hs >> 1), sy - (hs >> 1), hs, hs);
        if (len > 0 && sp > 0.05) {
          const ux = -p.vx / sp;
          const uy = -p.vy / sp;
          const tail = p.ramp[Math.min(n - 1, ci + 1)];
          this._setFill(ctx, tail, step > 2 ? step - 2 : 1);
          for (let k = 1; k <= len; k++) {
            ctx.fillRect(sx + Math.round(ux * k), sy + Math.round(uy * k), 1, 1);
          }
        }
        break;
      }
      case S.CONFETTI: {
        const s = Math.max(1, Math.round(size));
        const w = 1 + Math.round(Math.abs(sinT(p.age * p.swayFreq + p.swayPhase)) * (s - 1));
        const face = cosT(p.age * p.swayFreq + p.swayPhase) >= 0 ? ci : Math.min(n - 1, ci + 2);
        this._setFill(ctx, p.ramp[face], step);
        ctx.fillRect(sx - (w >> 1), sy - (s >> 1), w, s);
        break;
      }
      case S.SPRITE: {
        const spr = p.sprite;
        if (!spr) return;
        ctx.globalAlpha = step / ALPHA_STEPS;
        spr.draw(ctx, sx - (spr.w >> 1), sy - (spr.h >> 1), p.flipX, false);
        ctx.globalAlpha = 1;
        break;
      }
      default:
        break;
    }
  }

  /** Hard-edged midpoint circle, one 1x1 rect per plotted pixel. No anti-aliasing. */
  _circle(ctx, cx, cy, r) {
    if (r < 1) {
      ctx.fillRect(cx, cy, 1, 1);
      return;
    }
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      ctx.fillRect(cx + x, cy + y, 1, 1);
      ctx.fillRect(cx + y, cy + x, 1, 1);
      ctx.fillRect(cx - y, cy + x, 1, 1);
      ctx.fillRect(cx - x, cy + y, 1, 1);
      ctx.fillRect(cx - x, cy - y, 1, 1);
      ctx.fillRect(cx - y, cy - x, 1, 1);
      ctx.fillRect(cx + y, cy - x, 1, 1);
      ctx.fillRect(cx + x, cy - y, 1, 1);
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  // =========================================================================
  // NAMED EMITTERS
  // =========================================================================

  /**
   * Feet hitting the ground. `x,y` is the contact point (feet centre, top of the ground).
   * `strength` is ~1 for a normal landing; raw fall velocities (px/frame) are auto-normalised.
   */
  landingDust(x, y, strength = 1) {
    let s = strength == null ? 1 : strength;
    if (s > 3) s /= 3; // caller passed a fall speed rather than a 0..2 strength
    s = clamp(s, 0.2, 2);
    const dust = fxTheme(this.theme).dust;
    const n = Math.round((4 + 4 * s) * this.density);

    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) return;
      const dir = i & 1 ? 1 : -1;
      const sp = rng.range(0.35, 1.05) * s;
      p.x = x + dir * rng.range(1, 4);
      p.y = y - rng.range(0, 2);
      p.vx = dir * sp;
      p.vy = -rng.range(0.1, 0.55) * s;
      p.ay = 0.035;
      p.dragX = 0.9;
      p.dragY = 0.92;
      p.ramp = dust;
      p.life = Math.round(rng.range(13, 22));
      p.alpha0 = 0.85;
      p.alpha1 = 0;
      p.hold = 0.3;
      if (i % 5 === 4) {
        p.shape = S.POINT;
        p.size0 = 1;
        p.size1 = 1;
        p.vy -= 0.5 * s;
        p.ay = 0.09;
      } else {
        p.shape = S.RECT;
        p.size0 = 1;
        p.size1 = rng.range(3, 5) * (0.7 + 0.3 * s);
      }
    }

    if (s >= 1.25) {
      const r = this._alloc(2);
      if (r) {
        r.x = x;
        r.y = y - 1;
        r.shape = S.RING;
        r.size0 = 2;
        r.size1 = 5 + 4 * s;
        r.life = 9 + Math.round(s * 3);
        r.ramp = dust;
        r.alpha0 = 0.6;
        r.alpha1 = 0;
        r.hold = 0.1;
      }
    }
  }

  /** Trailing puffs behind a skidding Mario. `dir` is the direction of travel (1 | -1). */
  skidDust(x, y, dir = 1) {
    const d = dir < 0 ? -1 : 1;
    const dust = fxTheme(this.theme).dust;
    const n = rng.chance(0.55) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) return;
      p.x = x - d * rng.range(0, 3);
      p.y = y - rng.range(0, 3);
      p.vx = -d * rng.range(0.3, 0.85);
      p.vy = -rng.range(0.1, 0.45);
      p.ay = 0.03;
      p.dragX = 0.93;
      p.dragY = 0.93;
      p.shape = S.RECT;
      p.size0 = 1;
      p.size1 = rng.range(3.5, 5.5);
      p.ramp = dust;
      p.life = Math.round(rng.range(18, 30));
      p.alpha0 = 0.8;
      p.alpha1 = 0;
      p.hold = 0.25;
      p.swayAmp = rng.range(0.4, 1.1);
      p.swayFreq = rng.range(3, 6);
      p.swayPhase = rng.range(0, SIN_N);
    }
  }

  /** Occasional kick-up at full run speed. `dir` is the facing (1 | -1). */
  runDust(x, y, dir = 1) {
    const d = dir < 0 ? -1 : 1;
    const p = this._alloc(0);
    if (!p) return;
    p.x = x - d * rng.range(0, 2);
    p.y = y - rng.range(0, 2);
    p.vx = -d * rng.range(0.15, 0.45);
    p.vy = -rng.range(0.05, 0.3);
    p.ay = 0.025;
    p.dragX = 0.94;
    p.dragY = 0.94;
    p.shape = S.RECT;
    p.size0 = 1;
    p.size1 = rng.range(1.8, 2.8);
    p.ramp = fxTheme(this.theme).dust;
    p.life = Math.round(rng.range(10, 17));
    p.alpha0 = 0.5;
    p.alpha1 = 0;
    p.hold = 0.2;
  }

  /**
   * A brick coming apart. `x,y` is the CENTRE of the 16x16 block, in world pixels.
   * Four tumbling chunks plus crumbs plus a dust cloud in the theme's colours.
   */
  brickShatter(x, y, theme) {
    const th = theme || this.theme;
    const fx = fxTheme(th);
    const frames = chunkSet(THEME_FX[th] ? th : THEME.OVERWORLD);

    for (let i = 0; i < 4; i++) {
      const p = this._alloc(3);
      if (!p) break;
      const left = i & 1 ? -1 : 1;
      const top = i < 2;
      p.x = x + left * 4;
      p.y = y + (top ? -4 : 3);
      p.vx = left * rng.range(0.85, 1.5);
      p.vy = top ? -rng.range(2.9, 3.6) : -rng.range(1.7, 2.4);
      p.ay = 0.28;
      p.shape = S.CHUNK;
      p.frames = frames;
      p.spin = rng.int(3, 6);
      p.flipX = left < 0;
      p.life = 110;
      p.alpha0 = 1;
      p.alpha1 = 1;
      p.hold = 1;
      p.prio = 3;
    }

    const crumbs = Math.round(8 * this.density);
    for (let i = 0; i < crumbs; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const a = rng.range(0, SIN_N);
      const sp = rng.range(0.7, 2.2);
      p.x = x + rng.range(-6, 6);
      p.y = y + rng.range(-6, 6);
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp - 0.8;
      p.ay = 0.24;
      p.dragX = 0.99;
      p.shape = S.RECT;
      p.size0 = rng.chance(0.4) ? 2 : 1;
      p.size1 = p.size0;
      p.ramp = fx.crumb;
      p.life = Math.round(rng.range(26, 46));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.75;
    }

    const puffs = Math.round(12 * this.density);
    for (let i = 0; i < puffs; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const a = rng.range(0, SIN_N);
      const sp = rng.range(0.25, 1.15);
      p.x = x + rng.range(-7, 7);
      p.y = y + rng.range(-7, 7);
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp * 0.7 - 0.15;
      p.dragX = 0.9;
      p.dragY = 0.9;
      p.ay = -0.008;
      p.shape = S.RECT;
      p.size0 = rng.range(1, 2);
      p.size1 = rng.range(4, 6.5);
      p.ramp = fx.dust;
      p.life = Math.round(rng.range(18, 32));
      p.alpha0 = 0.8;
      p.alpha1 = 0;
      p.hold = 0.2;
    }
  }

  /** Bright yellow-white points with a slow fade — coin collect, block bump payout. */
  coinSparkle(x, y) {
    const flash = this._alloc(2);
    if (flash) {
      flash.x = x;
      flash.y = y;
      flash.shape = S.RECT;
      flash.size0 = 6;
      flash.size1 = 0;
      flash.life = 5;
      flash.ramp = RAMP.coin;
      flash.add = true;
      flash.alpha0 = 0.9;
      flash.alpha1 = 0;
      flash.hold = 0;
    }
    const n = Math.round(10 * this.density);
    const step = SIN_N / n;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) return;
      const a = i * step + rng.range(-step * 0.45, step * 0.45);
      const sp = rng.range(0.5, 1.7);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp - 0.25;
      p.ay = 0.022;
      p.dragX = 0.9;
      p.dragY = 0.9;
      p.shape = rng.chance(0.7) ? S.RECT : S.POINT;
      p.size0 = rng.chance(0.3) ? 3 : 2;
      p.size1 = 1;
      p.ramp = RAMP.coin;
      p.add = this._dark;
      p.life = Math.round(rng.range(20, 36));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.45;
    }
  }

  /** Colour-cycling sparkles trailing invincible Mario. Call every frame or two. */
  starTrail(x, y) {
    const n = rng.chance(0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(0);
      if (!p) return;
      p.x = x + rng.range(-6, 6);
      p.y = y + rng.range(-8, 8);
      p.vx = rng.range(-0.25, 0.25);
      p.vy = rng.range(-0.3, 0.1);
      p.dragX = 0.95;
      p.dragY = 0.95;
      p.shape = rng.chance(0.35) ? S.POINT : S.RECT;
      p.size0 = 2;
      p.size1 = 0;
      p.ramp = RAMP.star;
      p.cycle = 2;
      p.rampOff = (this.tick >> 1) + i;
      p.add = this._dark;
      p.life = Math.round(rng.range(16, 28));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.5;
    }
  }

  /** A fireball hitting something: white core, orange embers, then grey smoke. */
  fireballBurst(x, y) {
    const flash = this._alloc(2);
    if (flash) {
      flash.x = x;
      flash.y = y;
      flash.shape = S.RECT;
      flash.size0 = 8;
      flash.size1 = 1;
      flash.life = 6;
      flash.ramp = RAMP.fire;
      flash.add = true;
      flash.alpha0 = 1;
      flash.alpha1 = 0;
      flash.hold = 0.1;
    }
    const n = Math.round(10 * this.density);
    const step = SIN_N / n;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const a = i * step + rng.range(-step * 0.4, step * 0.4);
      const sp = rng.range(0.6, 1.9);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp * 0.85 - 0.2;
      p.ay = 0.05;
      p.dragX = 0.88;
      p.dragY = 0.88;
      p.shape = S.RECT;
      p.size0 = rng.range(2.5, 4);
      p.size1 = 1;
      p.ramp = RAMP.fire;
      p.add = this._dark;
      p.life = Math.round(rng.range(12, 24));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.4;
    }
    const smoke = Math.round(6 * this.density);
    for (let i = 0; i < smoke; i++) {
      const p = this._alloc(0);
      if (!p) break;
      p.x = x + rng.range(-4, 4);
      p.y = y + rng.range(-4, 2);
      p.vx = rng.range(-0.35, 0.35);
      p.vy = -rng.range(0.12, 0.5);
      p.dragX = 0.94;
      p.dragY = 0.94;
      p.shape = S.RECT;
      p.size0 = 1;
      p.size1 = rng.range(4, 6);
      p.ramp = RAMP.smoke;
      p.life = Math.round(rng.range(26, 42));
      p.alpha0 = 0.55;
      p.alpha1 = 0;
      p.hold = 0.2;
      p.swayAmp = rng.range(0.5, 1.6);
      p.swayFreq = rng.range(2, 4);
      p.swayPhase = rng.range(0, SIN_N);
    }
  }

  /** The puff left behind when an enemy is removed. */
  enemyPoof(x, y) {
    const n = Math.round(8 * this.density);
    const step = SIN_N / n;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const a = i * step + rng.range(-step * 0.4, step * 0.4);
      const sp = rng.range(0.35, 1.1);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp * 0.7 - 0.28;
      p.dragX = 0.9;
      p.dragY = 0.9;
      p.shape = S.RECT;
      p.size0 = rng.range(1, 2);
      p.size1 = rng.range(4, 6);
      p.ramp = RAMP.poof;
      p.life = Math.round(rng.range(16, 28));
      p.alpha0 = 0.85;
      p.alpha1 = 0;
      p.hold = 0.25;
    }
    for (let i = 0; i < 5; i++) {
      const p = this._alloc(0);
      if (!p) break;
      const a = rng.range(0, SIN_N);
      const sp = rng.range(0.8, 1.9);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp - 0.4;
      p.ay = 0.07;
      p.dragX = 0.93;
      p.dragY = 0.93;
      p.shape = rng.chance(0.4) ? S.RECT : S.POINT;
      p.size0 = 2;
      p.size1 = 1;
      p.ramp = RAMP.spark;
      p.add = this._dark;
      p.life = Math.round(rng.range(10, 20));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.4;
    }
  }

  /** Water entry: droplets, foam and two expanding rings. `y` is the surface line. */
  splash(x, y) {
    const n = Math.round(12 * this.density);
    for (let i = 0; i < n; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const dir = i & 1 ? 1 : -1;
      p.x = x + dir * rng.range(0, 5);
      p.y = y - rng.range(0, 3);
      p.vx = dir * rng.range(0.3, 1.5);
      p.vy = -rng.range(1.1, 2.5);
      p.ay = 0.22;
      p.dragX = 0.995;
      p.shape = rng.chance(0.3) ? S.RECT : S.POINT;
      p.size0 = 2;
      p.size1 = 1;
      p.ramp = RAMP.water;
      p.life = Math.round(rng.range(20, 40));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.6;
    }
    for (let i = 0; i < 2; i++) {
      const r = this._alloc(2);
      if (!r) break;
      r.x = x;
      r.y = y;
      r.shape = S.RING;
      r.size0 = 1 + i * 2;
      r.size1 = 7 + i * 6;
      r.life = 14 + i * 8;
      r.ramp = RAMP.foam;
      r.alpha0 = 0.75 - i * 0.2;
      r.alpha1 = 0;
      r.hold = 0.15;
    }
    const foam = Math.round(6 * this.density);
    for (let i = 0; i < foam; i++) {
      const p = this._alloc(0);
      if (!p) break;
      p.x = x + rng.range(-8, 8);
      p.y = y + rng.range(-2, 1);
      p.vx = rng.range(-0.4, 0.4);
      p.vy = -rng.range(0.05, 0.3);
      p.dragX = 0.9;
      p.dragY = 0.9;
      p.shape = S.RECT;
      p.size0 = 1;
      p.size1 = rng.range(2.5, 4);
      p.ramp = RAMP.foam;
      p.life = Math.round(rng.range(14, 24));
      p.alpha0 = 0.8;
      p.alpha1 = 0;
      p.hold = 0.2;
    }
  }

  /** One slow rising underwater bubble. `big` makes it a two pixel radius bubble. */
  bubble(x, y, big = false) {
    const p = this._alloc(0);
    if (!p) return;
    const r = big || rng.chance(0.3) ? 2 : 1;
    p.x = x + rng.range(-1.5, 1.5);
    p.y = y;
    p.vy = -rng.range(0.25, 0.5);
    p.dragY = 1;
    p.shape = S.BUBBLE;
    p.size0 = r;
    p.size1 = r + 0.4;
    p.ramp = RAMP.foam;
    p.life = Math.round(rng.range(70, 150));
    p.alpha0 = 0.85;
    p.alpha1 = 0;
    p.hold = 0.85;
    p.swayAmp = rng.range(1.5, 3.5);
    p.swayFreq = rng.range(2.5, 5);
    p.swayPhase = rng.range(0, SIN_N);
    p.pop = 1;
  }

  /** An ember lifting off lava. Castle levels call this continuously along the lava line. */
  lavaSpark(x, y) {
    const p = this._alloc(0);
    if (!p) return;
    const blob = rng.chance(0.18);
    p.x = x;
    p.y = y;
    p.vx = rng.range(-0.12, 0.12);
    p.vy = blob ? -rng.range(1.3, 2.0) : -rng.range(0.35, 0.95);
    p.ax = rng.range(-0.006, 0.006);
    p.ay = blob ? 0.06 : -0.004;
    p.dragY = 0.99;
    const fat = blob || rng.chance(0.35);
    p.shape = fat ? S.RECT : S.POINT;
    p.size0 = blob ? 3 : fat ? 2 : 1;
    p.size1 = 1;
    p.ramp = RAMP.ember;
    p.cycle = 4;
    p.rampOff = rng.int(0, 4);
    p.add = true;
    p.life = Math.round(blob ? rng.range(38, 60) : rng.range(30, 70));
    p.alpha0 = 1;
    p.alpha1 = 0;
    p.hold = 0.45;
    p.swayAmp = rng.range(1, 3);
    p.swayFreq = rng.range(1.5, 3.5);
    p.swayPhase = rng.range(0, SIN_N);
  }

  /**
   * A radial burst with trailing sparks. `color` may be a hex string, one of the named
   * colours (red, gold, green, blue, purple, white...) or omitted to cycle through a set.
   */
  firework(x, y, color) {
    let hex;
    if (typeof color === 'string') hex = FIREWORK_COLORS[color] || (color[0] === '#' ? color : null);
    if (!hex) hex = FIREWORK_CYCLE[this._fwIndex() % FIREWORK_CYCLE.length];
    const ramp = rampFromColor(hex);

    const flash = this._alloc(3);
    if (flash) {
      flash.x = x;
      flash.y = y;
      flash.shape = S.RECT;
      flash.size0 = 10;
      flash.size1 = 0;
      flash.life = 7;
      flash.ramp = RAMP.spark;
      flash.add = true;
      flash.alpha0 = 1;
      flash.alpha1 = 0;
      flash.hold = 0;
    }

    const n = Math.round(28 * this.density);
    const step = SIN_N / n;
    for (let i = 0; i < n; i++) {
      const p = this._alloc(2);
      if (!p) break;
      const a = i * step + rng.range(-step * 0.35, step * 0.35);
      const sp = rng.range(1.1, 2.3);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp;
      p.ay = 0.035;
      p.dragX = 0.92;
      p.dragY = 0.92;
      p.shape = S.STREAK;
      p.len = 5;
      p.size0 = 2;
      p.size1 = 1;
      p.ramp = ramp;
      p.add = this._dark;
      p.life = Math.round(rng.range(26, 46));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.5;
      if (i % 3 === 0) {
        p.trail = 1;
        p.trailEvery = 4;
        p.trailRamp = ramp;
      }
    }
    const inner = Math.round(8 * this.density);
    for (let i = 0; i < inner; i++) {
      const p = this._alloc(1);
      if (!p) break;
      const a = rng.range(0, SIN_N);
      const sp = rng.range(0.3, 1.0);
      p.x = x;
      p.y = y;
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp;
      p.ay = 0.03;
      p.dragX = 0.9;
      p.dragY = 0.9;
      p.shape = rng.chance(0.5) ? S.RECT : S.POINT;
      p.size0 = 2;
      p.size1 = 1;
      p.ramp = RAMP.spark;
      p.add = this._dark;
      p.life = Math.round(rng.range(18, 34));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.4;
    }
  }

  _fwIndex() {
    this._fw = (this._fw || 0) + 1;
    return this._fw;
  }

  /** Shimmer orbiting a power-up as it rises out of a block. Call every frame. */
  powerupSparkle(x, y) {
    for (let i = 0; i < 2; i++) {
      const p = this._alloc(0);
      if (!p) return;
      const a = this.tick * 9 + i * 128 + rng.range(-12, 12);
      const r = rng.range(7, 12);
      p.x = x + cosT(a) * r;
      p.y = y + sinT(a) * r * 0.75;
      p.vx = cosT(a) * 0.12;
      p.vy = sinT(a) * 0.1 - 0.18;
      p.dragX = 0.94;
      p.dragY = 0.96;
      p.shape = rng.chance(0.4) ? S.POINT : S.RECT;
      p.size0 = 3;
      p.size1 = 0;
      p.ramp = RAMP.spark;
      p.cycle = 3;
      p.rampOff = i;
      p.add = this._dark;
      p.life = Math.round(rng.range(14, 24));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.45;
    }
  }

  /** Level complete. A wide upward fan of fluttering paper that settles on the ground. */
  flagConfetti(x, y) {
    const n = Math.round(40 * this.density);
    for (let i = 0; i < n; i++) {
      const p = this._alloc(2);
      if (!p) return;
      const a = 142 + (i / n) * 100 + rng.range(-6, 6); // ~200..340 degrees: a wide upward fan
      const sp = rng.range(1.2, 3.2);
      p.x = x + rng.range(-4, 4);
      p.y = y + rng.range(-4, 4);
      p.vx = cosT(a) * sp;
      p.vy = sinT(a) * sp;
      p.ay = 0.09;
      p.dragX = 0.995;
      p.dragY = 0.995;
      p.shape = S.CONFETTI;
      p.size0 = rng.int(2, 4);
      p.size1 = p.size0;
      p.ramp = CONFETTI_RAMPS[rng.int(0, CONFETTI_RAMPS.length - 1)];
      p.life = Math.round(rng.range(100, 190));
      p.alpha0 = 1;
      p.alpha1 = 0;
      p.hold = 0.8;
      p.swayAmp = rng.range(2, 5);
      p.swayFreq = rng.range(4, 9);
      p.swayPhase = rng.range(0, SIN_N);
      p.collide = true;
      p.bounce = 0.25;
    }
  }

  // =========================================================================
  // AMBIENT LAYER — screen space, per theme, deliberately subtle.
  // =========================================================================

  /**
   * Enable the drifting screen-space layer for a theme:
   *   overworld / athletic -> dust motes lit from the upper left
   *   underground          -> cooler, sparser cave dust
   *   castle               -> slow falling embers
   *   water                -> rising bubbles
   * Pass null (or 'none') to switch it off. `opts` may be a density number or { density }.
   */
  setAmbient(theme, opts) {
    const density = typeof opts === 'number' ? opts : opts && opts.density != null ? opts.density : 1;
    this.ambientDensity = clamp(density, 0, 2);
    const next = theme === 'none' ? null : theme || null;
    const changed = next !== this.ambientTheme;
    this.ambientTheme = next;
    if (!next) {
      this.ambientTarget = 0;
      if (changed) this.clearAmbient();
      return this;
    }
    const base =
      next === THEME.CASTLE ? 22 : next === THEME.WATER ? 18 : next === THEME.UNDERGROUND ? 24 : 34;
    this.ambientTarget = Math.min(
      this.ambientCapacity,
      Math.round(base * this.ambientDensity * this.density)
    );
    if (!changed) return this;
    this.clearAmbient();
    for (let i = 0; i < this.ambientTarget; i++) this._spawnAmbient(true);
    return this;
  }

  /** Alias so callers can read `particles.ambient('castle')`. */
  ambient(theme, opts) {
    return this.setAmbient(theme, opts);
  }

  _ambSlot() {
    for (let k = 0; k < this.ambientCapacity; k++) {
      const j = (this._ambCursor + k) % this.ambientCapacity;
      const p = this.amb[j];
      if (!p.alive) {
        this._ambCursor = (j + 1) % this.ambientCapacity;
        p.reset();
        p.alive = true;
        p.screen = true;
        this.ambLive++;
        return p;
      }
    }
    return null;
  }

  _spawnAmbient(seed) {
    const th = this.ambientTheme;
    if (!th) return;
    const p = this._ambSlot();
    if (!p) return;
    p.swayPhase = rng.range(0, SIN_N);

    if (th === THEME.CASTLE) {
      p.x = rng.range(-4, SCREEN_W + 4);
      p.y = seed ? rng.range(0, SCREEN_H) : rng.range(-14, -2);
      p.vx = rng.range(-0.08, 0.08);
      p.vy = rng.range(0.08, 0.3);
      p.dragY = 1;
      if (rng.chance(0.3)) {
        p.shape = S.RECT;
        p.size0 = 2;
        p.size1 = 1;
      } else {
        p.shape = S.POINT;
      }
      p.ramp = RAMP.ember;
      p.cycle = 6;
      p.rampOff = rng.int(0, 4);
      p.add = true;
      p.life = Math.round(rng.range(240, 620));
      p.alpha0 = rng.range(0.4, 0.85);
      p.alpha1 = 0;
      p.hold = 0.75;
      p.swayAmp = rng.range(2, 5);
      p.swayFreq = rng.range(1, 2.5);
      return;
    }

    if (th === THEME.WATER) {
      p.x = rng.range(0, SCREEN_W);
      p.y = seed ? rng.range(0, SCREEN_H) : SCREEN_H + rng.range(2, 20);
      p.vy = -rng.range(0.18, 0.45);
      p.shape = S.BUBBLE;
      const r = rng.chance(0.35) ? 2 : 1;
      p.size0 = r;
      p.size1 = r + 0.3;
      p.ramp = RAMP.foam;
      p.life = Math.round(rng.range(300, 700));
      p.alpha0 = rng.range(0.35, 0.6);
      p.alpha1 = 0;
      p.hold = 0.85;
      p.swayAmp = rng.range(2, 6);
      p.swayFreq = rng.range(1.5, 3.5);
      return;
    }

    const cave = th === THEME.UNDERGROUND;
    p.x = seed ? rng.range(0, SCREEN_W) : rng.range(-16, SCREEN_W * 0.3);
    p.y = seed ? rng.range(0, SCREEN_H) : rng.range(-12, SCREEN_H * 0.6);
    p.vx = rng.range(0.05, 0.26);
    p.vy = rng.range(0.015, 0.1);
    p.shape = S.MOTE;
    p.size0 = rng.chance(0.35) ? 2 : 1;
    p.size1 = p.size0;
    p.ramp = cave ? RAMP.moteCool : RAMP.mote;
    p.cycle = rng.chance(0.25) ? rng.int(14, 28) : 0;
    p.rampOff = rng.int(0, 2);
    p.life = Math.round(rng.range(300, 800));
    p.alpha0 = cave ? rng.range(0.18, 0.4) : rng.range(0.25, 0.55);
    p.alpha1 = 0;
    p.hold = 0.7;
    p.swayAmp = rng.range(1.5, 4.5);
    p.swayFreq = rng.range(0.5, 1.6);
  }

  _updateAmbient() {
    let alive = 0;
    for (let i = 0; i < this.ambientCapacity; i++) {
      const p = this.amb[i];
      if (!p.alive) continue;
      p.vx = p.vx * p.dragX + p.ax;
      p.vy = p.vy * p.dragY + p.ay;
      p.x += p.vx;
      p.y += p.vy;
      p.age++;
      const off =
        p.x < -20 || p.x > SCREEN_W + 20 || p.y < -24 || p.y > SCREEN_H + 24;
      if (p.age >= p.life || off) {
        p.alive = false;
        this.ambLive--;
        continue;
      }
      alive++;
    }
    if (!this.ambientTheme) return;
    // Refill at most two per tick so a wave of deaths never pops back in all at once.
    let budget = 2;
    while (alive < this.ambientTarget && budget-- > 0) {
      this._spawnAmbient(false);
      alive++;
    }
  }
}

ParticleSystem.active = null;

export const particles = new ParticleSystem();
export default particles;

// Free-function forwarders. They always target the most recently constructed system, so a
// world that does `this.particles = new ParticleSystem()` still routes here correctly.
export function system() {
  return ParticleSystem.active || particles;
}

export const landingDust = (x, y, s) => system().landingDust(x, y, s);
export const skidDust = (x, y, d) => system().skidDust(x, y, d);
export const runDust = (x, y, d) => system().runDust(x, y, d);
export const brickShatter = (x, y, t) => system().brickShatter(x, y, t);
export const coinSparkle = (x, y) => system().coinSparkle(x, y);
export const starTrail = (x, y) => system().starTrail(x, y);
export const fireballBurst = (x, y) => system().fireballBurst(x, y);
export const enemyPoof = (x, y) => system().enemyPoof(x, y);
export const splash = (x, y) => system().splash(x, y);
export const bubble = (x, y, big) => system().bubble(x, y, big);
export const lavaSpark = (x, y) => system().lavaSpark(x, y);
export const firework = (x, y, c) => system().firework(x, y, c);
export const powerupSparkle = (x, y) => system().powerupSparkle(x, y);
export const flagConfetti = (x, y) => system().flagConfetti(x, y);
export const setAmbient = (t, o) => system().setAmbient(t, o);
export const SHAPE = S;
