// The renderer owns two surfaces:
//
//   1. an offscreen 256x240 Canvas2D  — every system draws here through `renderer.ctx`
//   2. the display canvas #screen     — sized to an exact INTEGER multiple of 256x240
//
// `present()` uploads the 256x240 buffer to the WebGL2 post chain (see post.js) and
// composites it to the display canvas. If WebGL2 is unavailable or dies at any point we
// swap the element for a fresh one and fall back to Canvas2D `drawImage` with smoothing
// off, so the game always runs.
//
// Draw ordering follows ARCHITECTURE.md section 9. Two styles are supported and can be
// mixed freely:
//
//   renderer.draw(LAYER.ENTITIES, (ctx) => { ... })   queued, sorted by layer, run at flush
//   renderer.ctx.drawImage(...)                       immediate, lands beneath queued work
//
// Anything drawn immediately happens before the queue drains, so a system that draws
// straight to `ctx` is effectively on layer -1. Systems that care about interleaving
// should use the queue for everything.

import { SCREEN_W, SCREEN_H, LAYER } from '../core/constants.js';
import { SKY } from '../data/palette.js';
import { createPostChain, POST_PASSES, POST_PRESETS } from './post.js';

const LAYER_COUNT = 16;
const MAX_DEVICE_SCALE = 8;

// Approximate strengths used by the Canvas2D fallback so the presets still read
// differently when WebGL2 is missing.
const FALLBACK_LOOK = {
  pure: { bloom: 0, scan: 0, vignette: 0 },
  crisp: { bloom: 0.3, scan: 0.1, vignette: 0.15 },
  crt: { bloom: 0.5, scan: 0.26, vignette: 0.3 },
};

// A 3x5 pixel font, used only for the renderer's own toast/debug text so it never
// depends on another agent's font module.
const TINY_GLYPHS = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# .#.',
  V: '#.# #.# #.# .#. .#.',
  W: '#.# #.# ### ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  0: '.#. #.# #.# #.# .#.',
  1: '.#. ##. .#. .#. ###',
  2: '##. ..# .#. #.. ###',
  3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#',
  5: '### #.. ##. ..# ##.',
  6: '.## #.. ##. #.# .#.',
  7: '### ..# .#. .#. .#.',
  8: '.#. #.# .#. #.# .#.',
  9: '.#. #.# .## ..# ##.',
  '.': '... ... ... ... .#.',
  ',': '... ... ... .#. .#.',
  ':': '... .#. ... .#. ...',
  '-': '... ... ### ... ...',
  '+': '... .#. ### .#. ...',
  '/': '..# ..# .#. #.. #..',
  '!': '.#. .#. .#. ... .#.',
  '%': '#.# ..# .#. #.. #.#',
  ' ': '... ... ... ... ...',
};

const TINY = Object.create(null);
for (const k in TINY_GLYPHS) TINY[k] = TINY_GLYPHS[k].split(' ');

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function imageOf(src) {
  if (!src) return null;
  if (src.canvas) return src.canvas; // core/gfx Sprite
  return src;
}

export class Renderer {
  constructor(opts = {}) {
    this.opts = opts;
    this._inited = false;

    this.width = SCREEN_W;
    this.height = SCREEN_H;

    this.buffer = null;
    this._ctx = null;
    this.canvas = null;
    this.dctx = null;
    this.post = null;

    this.scale = 1;
    this.deviceScale = 1;
    this.backend = 'none';
    this.frames = 0;

    this._layers = [];
    for (let i = 0; i < LAYER_COUNT; i++) this._layers.push([]);
    this._queued = 0;

    this._preset = POST_PRESETS.includes(opts.preset) ? opts.preset : 'crisp';
    this._fallback = { ...FALLBACK_LOOK[this._preset] };
    this._overlay = null;
    this._glowA = null;
    this._glowB = null;
    this._glowC = null;

    this._fade = 0;
    this._fadeFrom = 0;
    this._fadeTo = 0;
    this._fadeTicks = 0;
    this._fadeT = 0;
    this._fadeResolve = null;
    this._fadeColor = '#000000';

    this._tint = null;
    this._flash = null;
    this._cycleT = 0;

    this._toast = null;
    this._explicitUpdate = false;
    this._onKey = null;
    this._onResize = null;
  }

  /* ------------------------------------------------------------- lifecycle */

  init(opts) {
    if (this._inited) return this;
    if (opts) Object.assign(this.opts, opts);
    this._inited = true;

    this.buffer = document.createElement('canvas');
    this.buffer.width = SCREEN_W;
    this.buffer.height = SCREEN_H;
    this._ctx = this.buffer.getContext('2d', { alpha: false, willReadFrequently: false });
    this._ctx.imageSmoothingEnabled = false;
    this._ctx.fillStyle = '#000000';
    this._ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    this.canvas = this.opts.canvas || document.getElementById('screen');
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'screen';
      const host = document.getElementById('stage') || document.body;
      host.appendChild(this.canvas);
    }
    this.canvas.style.imageRendering = 'pixelated';

    this._layoutCanvas();
    this._initBackend();

    if (this.opts.keys !== false) {
      this._onKey = (e) => this._handleKey(e);
      window.addEventListener('keydown', this._onKey);
    }
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);

    return this;
  }

  _ensure() {
    if (!this._inited) this.init();
    return this;
  }

  _initBackend() {
    const res = createPostChain(this.canvas, { onLost: () => this._dropToCanvas2D(true) });
    if (res.chain) {
      this.post = res.chain;
      this.backend = 'webgl2';
      this.post.resize(this.canvas.width, this.canvas.height);
      this.post.setPreset(this._preset);
      return;
    }
    if (res.claimed) this._replaceCanvasElement();
    this.post = null;
    this.backend = 'canvas2d';
    this.dctx = this.canvas.getContext('2d', { alpha: false });
    if (this.dctx) this.dctx.imageSmoothingEnabled = false;
    this._overlay = null;
  }

  // The display canvas can only ever hold one context type. When WebGL2 is claimed and
  // then fails we swap in a pristine element so Canvas2D is still possible.
  _replaceCanvasElement() {
    const old = this.canvas;
    const next = document.createElement('canvas');
    next.id = old.id;
    next.className = old.className;
    const style = old.getAttribute('style');
    if (style) next.setAttribute('style', style);
    next.width = old.width;
    next.height = old.height;
    if (old.parentNode) old.parentNode.replaceChild(next, old);
    else document.body.appendChild(next);
    this.canvas = next;
    this.canvas.style.imageRendering = 'pixelated';
    this._applyCanvasSize();
  }

  _dropToCanvas2D(replace) {
    if (this.backend === 'canvas2d') return;
    if (this.post) {
      try {
        this.post.dispose();
      } catch (e) {
        /* ignore */
      }
      this.post = null;
    }
    if (replace !== false) this._replaceCanvasElement();
    this.backend = 'canvas2d';
    this.dctx = this.canvas.getContext('2d', { alpha: false });
    if (this.dctx) this.dctx.imageSmoothingEnabled = false;
    this._overlay = null;
  }

  dispose() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onResize);
    }
    if (this.post) this.post.dispose();
    this.post = null;
    this._inited = false;
  }

  /* ---------------------------------------------------------------- sizing */

  get ctx() {
    this._ensure();
    return this._ctx;
  }

  get preset() {
    return this._preset;
  }

  _headless() {
    if (typeof document !== 'undefined' && document.body && document.body.classList.contains('headless')) {
      return true;
    }
    return typeof location !== 'undefined' && /(?:^|[?&])headless(?:=|&|$)/.test(location.search);
  }

  _computeScale() {
    const forced = this.opts.scale || this._queryScale();
    const headless = this._headless();
    const mx = this.opts.marginX != null ? this.opts.marginX : headless ? 0 : 48;
    const my = this.opts.marginY != null ? this.opts.marginY : headless ? 0 : 84;

    const availW = Math.max(SCREEN_W, (window.innerWidth || SCREEN_W) - mx);
    const availH = Math.max(SCREEN_H, (window.innerHeight || SCREEN_H) - my);

    let css = forced
      ? Math.max(1, forced | 0)
      : Math.max(1, Math.min(Math.floor(availW / SCREEN_W), Math.floor(availH / SCREEN_H)));
    if (this.opts.maxScale) css = Math.min(css, this.opts.maxScale);

    let dpr = Math.max(1, Math.min(3, Math.floor(window.devicePixelRatio || 1)));
    while (css * dpr > MAX_DEVICE_SCALE && dpr > 1) dpr--;

    return { css, dpr };
  }

  _queryScale() {
    if (typeof location === 'undefined') return 0;
    const m = /(?:^|[?&])scale=(\d+)/.exec(location.search);
    return m ? parseInt(m[1], 10) : 0;
  }

  _layoutCanvas() {
    const { css, dpr } = this._computeScale();
    this.scale = css;
    this.deviceScale = css * dpr;
    this._applyCanvasSize();
  }

  _applyCanvasSize() {
    const cssW = SCREEN_W * this.scale;
    const cssH = SCREEN_H * this.scale;
    const devW = SCREEN_W * this.deviceScale;
    const devH = SCREEN_H * this.deviceScale;
    if (this.canvas.width !== devW || this.canvas.height !== devH) {
      this.canvas.width = devW;
      this.canvas.height = devH;
      if (this.dctx) this.dctx.imageSmoothingEnabled = false;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  resize() {
    if (!this._inited) return;
    const prev = this.deviceScale;
    this._layoutCanvas();
    if (this.post) this.post.resize(this.canvas.width, this.canvas.height);
    if (prev !== this.deviceScale) this._overlay = null;
  }

  /* ------------------------------------------------------------ frame setup */

  // sky: a CSS color, a THEME name resolved through palette.SKY, a
  // { top, bottom, y0, y1 } gradient descriptor, or null to skip the clear.
  beginFrame(sky = '#000000') {
    this._ensure();
    const ctx = this._ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'none';
    for (let i = 0; i < this._layers.length; i++) {
      const bucket = this._layers[i];
      if (bucket) bucket.length = 0;
    }
    this._queued = 0;
    if (sky !== null && sky !== undefined) this.clear(sky);
    return ctx;
  }

  clear(sky) {
    const ctx = this._ctx;
    if (typeof sky === 'object') {
      const y0 = sky.y0 || 0;
      const y1 = sky.y1 != null ? sky.y1 : SCREEN_H;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, sky.top || '#000000');
      g.addColorStop(1, sky.bottom || sky.top || '#000000');
      ctx.fillStyle = g;
      if (y0 > 0) {
        ctx.fillStyle = sky.top || '#000000';
        ctx.fillRect(0, 0, SCREEN_W, y0);
        ctx.fillStyle = g;
      }
      ctx.fillRect(0, y0, SCREEN_W, SCREEN_H - y0);
      return;
    }
    ctx.fillStyle = (typeof sky === 'string' && SKY[sky]) || sky || '#000000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  skyColor(theme) {
    return SKY[theme] || SKY.overworld;
  }

  /* ------------------------------------------------------------ layer queue */

  // Queue `fn(ctx, renderer)` on a layer from constants.LAYER. Callbacks run in layer
  // order, and in submission order within a layer, each wrapped in save()/restore().
  draw(layer, fn) {
    this._ensure();
    if (typeof fn !== 'function') return this;
    const idx = Math.max(0, layer | 0);
    const bucket = this._layers[idx] || (this._layers[idx] = []);
    bucket.push(fn);
    this._queued++;
    return this;
  }

  flush() {
    const ctx = this._ctx;
    if (!ctx) return this;
    try {
      for (let i = 0; i < this._layers.length; i++) {
        const bucket = this._layers[i];
        if (!bucket || !bucket.length) continue;
        for (let k = 0; k < bucket.length; k++) {
          ctx.save();
          try {
            bucket[k](ctx, this);
          } finally {
            ctx.restore();
          }
        }
        bucket.length = 0;
      }
    } finally {
      this._queued = 0;
    }
    return this;
  }

  /* --------------------------------------------------------------- parallax */

  // Draw a horizontally tiling strip at a fraction of the camera scroll.
  //   image  : Sprite | HTMLCanvasElement | HTMLImageElement
  //   camX   : camera x in world pixels
  //   mult   : scroll multiplier (0 = locked to screen, 1 = locked to world)
  //   y      : destination top in buffer pixels
  //   opts   : { alpha, offset, sy, sh, tileW, gap }
  parallax(image, camX, mult = 0.5, y = 0, opts = {}) {
    const img = imageOf(image);
    if (!img || !img.width) return this;
    const ctx = this._ctx;
    const tileW = (opts.tileW || img.width) + (opts.gap || 0);
    const sy = opts.sy || 0;
    const sh = opts.sh || img.height - sy;
    const shift = camX * mult + (opts.offset || 0);
    let ox = -(((shift % tileW) + tileW) % tileW);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha != null) ctx.globalAlpha = clamp01(opts.alpha);
    for (let x = Math.floor(ox); x < SCREEN_W; x += tileW) {
      ctx.drawImage(img, 0, sy, opts.tileW || img.width, sh, x, y | 0, opts.tileW || img.width, sh);
    }
    ctx.restore();
    return this;
  }

  // Same, but queued onto a layer.
  parallaxLayer(layer, image, camX, mult, y, opts) {
    return this.draw(layer, () => this.parallax(image, camX, mult, y, opts));
  }

  // Repeat a per-column painter across the screen at a scroll multiplier. Useful for
  // procedural backdrops (hills, fences) that are cheaper to draw than to bake.
  parallaxStrip(camX, mult, tileW, paint) {
    const ctx = this._ctx;
    const shift = camX * mult;
    const start = Math.floor(shift / tileW) - 1;
    const end = start + Math.ceil(SCREEN_W / tileW) + 2;
    for (let i = start; i < end; i++) {
      const x = Math.floor(i * tileW - shift);
      ctx.save();
      try {
        paint(ctx, x, i);
      } finally {
        ctx.restore();
      }
    }
    return this;
  }

  /* --------------------------------------------------- palette flash / fade */

  // Persistent full-screen colour modulation. amount 0 clears it.
  //   mode: 'screen' | 'lighter' | 'multiply' | 'overlay' | 'difference' | 'source-over'
  setTint(color, amount = 0.25, mode = 'screen') {
    this._ensure();
    if (!color || amount <= 0) {
      this._tint = null;
      return this;
    }
    this._tint = { color, amount: clamp01(amount), mode, cycle: null, hold: 1 };
    return this;
  }

  // Cycling palette flash — this is the star. Call once when the power-up starts and
  // clearTint() when it ends; the cycle advances on update()/present().
  tintCycle(colors, hold = 4, amount = 0.3, mode = 'screen') {
    this._ensure();
    if (!colors || !colors.length) {
      this._tint = null;
      return this;
    }
    this._tint = {
      color: colors[0],
      amount: clamp01(amount),
      mode,
      cycle: colors.slice(),
      hold: Math.max(1, hold | 0),
    };
    this._cycleT = 0;
    return this;
  }

  clearTint() {
    this._tint = null;
    return this;
  }

  // One-shot decaying flash — Bowser's hit frames, block shatter, a lightning pop.
  flash(color = '#ffffff', ticks = 6, amount = 0.8, mode = 'screen') {
    this._ensure();
    this._flash = {
      color,
      amount: clamp01(amount),
      mode,
      ticks: Math.max(1, ticks | 0),
      t: 0,
    };
    return this;
  }

  clearFlash() {
    this._flash = null;
    return this;
  }

  get fade() {
    return this._fade;
  }

  get fading() {
    return this._fadeTicks > 0;
  }

  setFade(v, color) {
    this._ensure();
    this._resolveFade();
    this._fade = clamp01(v);
    this._fadeTicks = 0;
    if (color) this._fadeColor = color;
    return this;
  }

  // Animate the global fade. Resolves once the target is reached, so level
  // transitions can `await renderer.fadeOut(24)`.
  fadeTo(target, ticks = 24, color) {
    this._ensure();
    this._resolveFade();
    if (color) this._fadeColor = color;
    const t = Math.max(0, ticks | 0);
    this._fadeFrom = this._fade;
    this._fadeTo = clamp01(target);
    this._fadeT = 0;
    if (t === 0) {
      this._fade = this._fadeTo;
      this._fadeTicks = 0;
      return Promise.resolve();
    }
    this._fadeTicks = t;
    return new Promise((res) => {
      this._fadeResolve = res;
    });
  }

  fadeOut(ticks = 24, color) {
    return this.fadeTo(1, ticks, color);
  }

  fadeIn(ticks = 24, color) {
    return this.fadeTo(0, ticks, color);
  }

  _resolveFade() {
    const r = this._fadeResolve;
    this._fadeResolve = null;
    if (r) r();
  }

  /* ------------------------------------------------------------------ toast */

  toast(text, ticks = 100) {
    this._ensure();
    this._toast = { text: String(text), ticks: Math.max(1, ticks | 0), t: 0 };
    return this;
  }

  tinyTextWidth(text) {
    return Math.max(0, String(text).length * 4 - 1);
  }

  tinyText(ctx, text, x, y, color = '#ffffff') {
    ctx.fillStyle = color;
    let cx = x | 0;
    const s = String(text).toUpperCase();
    for (let i = 0; i < s.length; i++) {
      const g = TINY[s[i]];
      if (g) {
        for (let r = 0; r < 5; r++) {
          const row = g[r];
          for (let c = 0; c < 3; c++) {
            if (row[c] === '#') ctx.fillRect(cx + c, (y | 0) + r, 1, 1);
          }
        }
      }
      cx += 4;
    }
    return cx - (x | 0);
  }

  _drawToast() {
    const t = this._toast;
    if (!t) return;
    const ctx = this._ctx;
    const fadeIn = Math.min(1, t.t / 6);
    const fadeOut = Math.min(1, (t.ticks - t.t) / 12);
    const a = clamp01(Math.min(fadeIn, fadeOut));
    if (a <= 0) return;
    const w = this.tinyTextWidth(t.text);
    const bx = Math.floor((SCREEN_W - w) / 2) - 4;
    const by = SCREEN_H - 16;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,8,14,0.82)';
    ctx.fillRect(bx, by, w + 8, 11);
    ctx.fillStyle = 'rgba(120,160,255,0.55)';
    ctx.fillRect(bx, by, w + 8, 1);
    ctx.fillRect(bx, by + 10, w + 8, 1);
    this.tinyText(ctx, t.text, bx + 4, by + 3, '#dfe8ff');
    ctx.restore();
  }

  /* ------------------------------------------------------------ post control */

  setPreset(name) {
    this._ensure();
    if (!POST_PRESETS.includes(name)) return false;
    this._preset = name;
    this._fallback = { ...FALLBACK_LOOK[name] };
    this._overlay = null;
    if (this.post) this.post.setPreset(name);
    return true;
  }

  cyclePreset() {
    const i = POST_PRESETS.indexOf(this._preset);
    const next = POST_PRESETS[(i + 1) % POST_PRESETS.length];
    this.setPreset(next);
    this.toast(`FILTER ${next}`, 96);
    return next;
  }

  // Debug API hook: renderer.setPost('bloom', false). Also accepts a preset name.
  setPost(name, on = true) {
    this._ensure();
    if (POST_PRESETS.includes(name)) {
      if (on === false) return false;
      return this.setPreset(name);
    }
    if (name === 'preset' && typeof on === 'string') return this.setPreset(on);

    let ok = false;
    if (this.post) ok = this.post.setPass(name, on);
    const key = String(name).toLowerCase();
    if (key === 'bloom') {
      this._fallback.bloom = on ? FALLBACK_LOOK[this._preset].bloom : 0;
      ok = true;
    } else if (key === 'scanlines' || key === 'scanline' || key === 'scan') {
      this._fallback.scan = on ? FALLBACK_LOOK[this._preset].scan : 0;
      this._overlay = null;
      ok = true;
    } else if (key === 'vignette' || key === 'vig') {
      this._fallback.vignette = on ? FALLBACK_LOOK[this._preset].vignette : 0;
      this._overlay = null;
      ok = true;
    }
    return ok;
  }

  getPost(name) {
    return this.post ? this.post.getPass(name) : false;
  }

  setPostParam(name, value) {
    return this.post ? this.post.setParam(name, value) : false;
  }

  postInfo() {
    this._ensure();
    if (this.post) return this.post.info();
    return {
      backend: this.backend,
      preset: this._preset,
      passes: Object.fromEntries(POST_PASSES.map((p) => [p, false])),
      params: { ...this._fallback },
      size: [this.canvas ? this.canvas.width : 0, this.canvas ? this.canvas.height : 0],
      scale: this.deviceScale,
      frames: this.frames,
    };
  }

  get stats() {
    return {
      backend: this.backend,
      preset: this._preset,
      scale: this.scale,
      deviceScale: this.deviceScale,
      frames: this.frames,
    };
  }

  _handleKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code !== 'KeyF') return;
    this.cyclePreset();
  }

  /* --------------------------------------------------------------- ticking */

  // Advance renderer-owned timers by n fixed steps. Optional: if a game never calls
  // this, present() advances them once per presented frame instead.
  update(n = 1) {
    this._explicitUpdate = true;
    this._advance(n);
    return this;
  }

  _advance(n) {
    if (n <= 0) return;
    if (this._fadeTicks > 0) {
      this._fadeT += n;
      const k = Math.min(1, this._fadeT / this._fadeTicks);
      this._fade = this._fadeFrom + (this._fadeTo - this._fadeFrom) * k;
      if (k >= 1) {
        this._fade = this._fadeTo;
        this._fadeTicks = 0;
        this._resolveFade();
      }
    }
    if (this._flash) {
      this._flash.t += n;
      if (this._flash.t >= this._flash.ticks) this._flash = null;
    }
    if (this._tint && this._tint.cycle) {
      this._cycleT += n;
      const c = this._tint.cycle;
      this._tint.color = c[Math.floor(this._cycleT / this._tint.hold) % c.length];
    }
    if (this._toast) {
      this._toast.t += n;
      if (this._toast.t >= this._toast.ticks) this._toast = null;
    }
  }

  /* --------------------------------------------------------------- present */

  _composeOverlays() {
    const ctx = this._ctx;
    const tint = this._tint;
    const flash = this._flash;
    const fade = this._fade;
    if (!tint && !flash && fade <= 0 && !this._toast) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';

    if (tint && tint.amount > 0) {
      ctx.globalCompositeOperation = tint.mode;
      ctx.globalAlpha = tint.amount;
      ctx.fillStyle = tint.color;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    if (flash) {
      const k = 1 - flash.t / flash.ticks;
      ctx.globalCompositeOperation = flash.mode;
      ctx.globalAlpha = clamp01(flash.amount * k);
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    if (fade > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp01(fade);
      ctx.fillStyle = this._fadeColor;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this._drawToast();
    ctx.restore();
  }

  present() {
    this._ensure();
    if (this._queued) this.flush();
    this._composeOverlays();
    if (!this._explicitUpdate) this._advance(1);

    if (this.post && !this.post.dead) {
      let ok = false;
      try {
        ok = this.post.render(this.buffer);
      } catch (e) {
        console.warn(`[renderer] post chain failed (${e && e.message}) — falling back to Canvas2D`);
        ok = false;
      }
      if (!ok) {
        this._dropToCanvas2D(true);
        this._present2d();
      }
    } else {
      if (this.backend !== 'canvas2d') this._dropToCanvas2D(true);
      this._present2d();
    }
    this.frames++;
    return this;
  }

  /* ------------------------------------------------- Canvas2D fallback path */

  _present2d() {
    const dctx = this.dctx;
    if (!dctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.globalAlpha = 1;
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(this.buffer, 0, 0, w, h);

    const look = this._fallback;
    if (look.bloom > 0) {
      const glow = this._bloom2d();
      if (glow) {
        dctx.globalCompositeOperation = 'lighter';
        dctx.globalAlpha = clamp01(look.bloom);
        dctx.imageSmoothingEnabled = true;
        dctx.drawImage(glow, 0, 0, w, h);
        dctx.imageSmoothingEnabled = false;
        dctx.globalAlpha = 1;
        dctx.globalCompositeOperation = 'source-over';
      }
    }

    if (look.scan > 0 || look.vignette > 0) {
      const ov = this._build2dOverlay(w, h);
      if (ov) {
        dctx.globalCompositeOperation = 'multiply';
        dctx.drawImage(ov, 0, 0);
        dctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  // Cheap luminance-keyed bright pass for the fallback path:
  //   A = quarter-res copy of the frame
  //   B = grayscale luminance of A  (white backdrop + 'luminosity' blend)
  //   C = A * B^4  — only genuinely bright things (coins, fireballs, the star) survive,
  //       and a saturated blue sky does not.
  // The upscale back to display size supplies the blur.
  _bloom2d() {
    const bw = 64;
    const bh = 60;
    if (!this._glowA) {
      this._glowA = document.createElement('canvas');
      this._glowB = document.createElement('canvas');
      this._glowC = document.createElement('canvas');
      for (const cv of [this._glowA, this._glowB, this._glowC]) {
        cv.width = bw;
        cv.height = bh;
      }
    }
    const a = this._glowA.getContext('2d');
    const b = this._glowB.getContext('2d');
    const c = this._glowC.getContext('2d');
    if (!a || !b || !c) return null;

    a.globalCompositeOperation = 'source-over';
    a.globalAlpha = 1;
    a.imageSmoothingEnabled = true;
    a.clearRect(0, 0, bw, bh);
    a.drawImage(this.buffer, 0, 0, bw, bh);

    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#ffffff';
    b.fillRect(0, 0, bw, bh);
    b.globalCompositeOperation = 'luminosity';
    b.drawImage(this._glowA, 0, 0);
    b.globalCompositeOperation = 'source-over';

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, bw, bh);
    c.drawImage(this._glowA, 0, 0);
    c.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 4; i++) c.drawImage(this._glowB, 0, 0);
    c.globalCompositeOperation = 'source-over';
    return this._glowC;
  }

  _build2dOverlay(w, h) {
    if (this._overlay && this._overlay.width === w && this._overlay.height === h) {
      return this._overlay;
    }
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);

    const look = this._fallback;
    const s = this.deviceScale;
    if (look.scan > 0 && s >= 2) {
      const amt = look.scan;
      for (let y = 0; y < h; y++) {
        const ph = ((y + 0.5) / s) % 1;
        const wv = Math.sin(Math.PI * ph);
        const beam = 0.34 + 0.66 * wv * wv;
        const mul = (1 - amt) + amt * beam;
        const a = clamp01(1 - mul / (1 - 0.33 * amt));
        if (a <= 0.002) continue;
        c.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
        c.fillRect(0, y, w, 1);
      }
    }
    if (look.vignette > 0) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${clamp01(look.vignette).toFixed(3)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    this._overlay = cv;
    return cv;
  }

  /* ------------------------------------------------------------------ misc */

  // Data URL of the presented frame. Handy for the automated visual critic.
  snapshot(type = 'image/png') {
    this._ensure();
    return this.canvas.toDataURL(type);
  }
}

export function createRenderer(opts) {
  return new Renderer(opts).init();
}

export const renderer = new Renderer();
export { LAYER, POST_PASSES, POST_PRESETS };
export default renderer;
