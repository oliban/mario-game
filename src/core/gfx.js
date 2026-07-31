const CHARS = '0123456789abcdef';
const registry = [];

function slotOf(ch) {
  if (ch === '.' || ch === ' ') return -1;
  const i = CHARS.indexOf(ch);
  if (i < 0) throw new Error(`gfx: bad pixel char ${JSON.stringify(ch)}`);
  return i;
}

function parseColor(css) {
  if (css == null) return [0, 0, 0, 0];
  let s = String(css).trim();
  if (s[0] === '#') {
    s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length === 6) s += 'ff';
    if (s.length !== 8) throw new Error(`gfx: bad hex color ${css}`);
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
      parseInt(s.slice(6, 8), 16),
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  throw new Error(`gfx: unsupported color ${css}`);
}

export class Sprite {
  constructor(rows, palette, opts = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`gfx: sprite "${opts.name || '?'}" has no rows`);
    }
    const w = rows[0].length;
    for (let i = 0; i < rows.length; i++) {
      if (typeof rows[i] !== 'string') {
        throw new Error(`gfx: sprite "${opts.name || '?'}" row ${i} is not a string`);
      }
      if (rows[i].length !== w) {
        throw new Error(
          `gfx: sprite "${opts.name || '?'}" row ${i} is ${rows[i].length} wide, expected ${w}`
        );
      }
    }
    this.name = opts.name || '';
    this.rows = rows;
    this.palette = palette;
    this.w = w;
    this.h = rows.length;
    this.ox = opts.ox || 0;
    this.oy = opts.oy || 0;
    this._canvas = null;
    this._flipX = null;
    this._flipY = null;
    this._flipXY = null;
    registry.push(this);
  }

  _bake() {
    const { w, h, rows, palette } = this;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: false });
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const lut = [];
    for (let i = 0; i < 16; i++) lut.push(parseColor(palette && palette[i]));
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const s = slotOf(row[x]);
        if (s < 0) continue;
        const c = lut[s];
        if (!c || c[3] === 0) {
          if (palette && palette[s] == null) {
            throw new Error(`gfx: sprite "${this.name}" uses slot ${s} but palette has no entry`);
          }
          if (c && c[3] === 0) continue;
        }
        const o = (y * w + x) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = c[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    this._canvas = cv;
    return cv;
  }

  get canvas() {
    return this._canvas || this._bake();
  }

  _mirror(fx, fy) {
    const src = this.canvas;
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.translate(fx ? this.w : 0, fy ? this.h : 0);
    c.scale(fx ? -1 : 1, fy ? -1 : 1);
    c.drawImage(src, 0, 0);
    return cv;
  }

  variant(flipX, flipY) {
    if (!flipX && !flipY) return this.canvas;
    if (flipX && !flipY) return (this._flipX ||= this._mirror(true, false));
    if (!flipX && flipY) return (this._flipY ||= this._mirror(false, true));
    return (this._flipXY ||= this._mirror(true, true));
  }

  draw(ctx, x, y, flipX = false, flipY = false) {
    ctx.drawImage(this.variant(flipX, flipY), x | 0, y | 0);
  }

  // Draw with the sprite's authored anchor offset applied. `flipX` mirrors the offset
  // around the hitbox so left/right-facing art stays aligned.
  drawAnchored(ctx, x, y, flipX = false, hitW = 0) {
    const ox = flipX ? hitW - this.w - this.ox : this.ox;
    ctx.drawImage(this.variant(flipX, false), (x + ox) | 0, (y + this.oy) | 0);
  }

  // Returns a new Sprite with a different palette (green/red Koopa, fire Mario, ...).
  recolor(palette, name) {
    return new Sprite(this.rows, palette, {
      name: name || this.name + ':recolor',
      ox: this.ox,
      oy: this.oy,
    });
  }

  // Uniformly shifted copy — used for flashing/invincibility frames.
  shift(fn, name) {
    const pal = this.palette.map((c) => (c == null ? c : fn(c)));
    return this.recolor(pal, name);
  }
}

export function makeSprite(rows, palette, opts) {
  return new Sprite(rows, palette, opts);
}

// Slice a tall strip of rows into N sprites of equal height (handy for sheets).
export function sliceRows(rows, frameH, palette, opts = {}) {
  const out = [];
  for (let i = 0; i * frameH < rows.length; i++) {
    out.push(new Sprite(rows.slice(i * frameH, (i + 1) * frameH), palette, {
      ...opts,
      name: `${opts.name || 'strip'}#${i}`,
    }));
  }
  return out;
}

export class Anim {
  constructor(frames, hold = 6, loop = true) {
    if (!frames.length) throw new Error('gfx: Anim with no frames');
    this.frames = frames;
    this.holds = Array.isArray(hold) ? hold.slice() : frames.map(() => hold);
    if (this.holds.length !== frames.length) {
      throw new Error('gfx: Anim hold array length must match frame count');
    }
    this.loop = loop;
    this.duration = this.holds.reduce((a, b) => a + b, 0);
    this._table = [];
    for (let i = 0; i < frames.length; i++) {
      for (let k = 0; k < this.holds[i]; k++) this._table.push(i);
    }
  }

  indexAt(tick) {
    const t = Math.max(0, Math.floor(tick));
    if (this.loop) return this._table[t % this.duration];
    return this._table[Math.min(t, this.duration - 1)];
  }

  frame(tick) {
    return this.frames[this.indexAt(tick)];
  }

  done(tick) {
    return !this.loop && tick >= this.duration;
  }

  static still(sprite) {
    return new Anim([sprite], 1, true);
  }
}

// Pre-bake every sprite created so far so the first frame never hitches.
export function bakeAll() {
  let n = 0;
  for (const s of registry) {
    if (!s._canvas) {
      s._bake();
      n++;
    }
  }
  return n;
}

export function spriteCount() {
  return registry.length;
}

// Build a solid-color 1x1 sprite. Only for internal fx (never for game art).
export function pixel(color) {
  return new Sprite(['0'], [color], { name: 'pixel' });
}
