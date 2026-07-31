import { Entity, registerEntity } from '../entity.js';
import { makeSprite } from '../../core/gfx.js';
import * as ITEMS from '../../data/sprites/items.js';

// Compact 4x6 numerals authored here so a score pop never depends on HUD font layout.
const GLYPH_SRC = {
  '0': '.00./0..0/0..0/0..0/0..0/.00.',
  '1': '..0./.00./..0./..0./..0./.000',
  '2': '.00./0..0/...0/..0./.0../0000',
  '3': '000./...0/.00./...0/...0/000.',
  '4': '..0./.00./0.0./0000/..0./..0.',
  '5': '0000/0.../000./...0/0..0/.00.',
  '6': '.00./0.../000./0..0/0..0/.00.',
  '7': '0000/...0/..0./..0./.0../.0..',
  '8': '.00./0..0/.00./0..0/0..0/.00.',
  '9': '.00./0..0/0..0/.000/...0/.00.',
  U: '0..0/0..0/0..0/0..0/0..0/.00.',
  P: '000./0..0/0..0/000./0.../0...',
  '-': '..../..../0000/..../..../....',
  ' ': '..../..../..../..../..../....',
};

const GLYPH_W = 4;
const GLYPH_H = 6;
const KERN = 1;

function bakeSet(color, tag) {
  const out = {};
  for (const ch in GLYPH_SRC) {
    out[ch] = makeSprite(GLYPH_SRC[ch].split('/'), [color], { name: `pop-${tag}-${ch}` });
  }
  return out;
}

const INK = bakeSet('#ffffff', 'ink');
const SHADOW = bakeSet('#101010', 'shadow');

// items.js bakes the canonical score plates (100 … 8000 and 1UP). Use one when the
// value matches exactly; anything else falls back to the numerals authored above.
const SCORES = ITEMS.SCORES || null;
function plateFor(text) {
  if (!SCORES) return null;
  const s = SCORES[text];
  return s && typeof s.draw === 'function' ? s : null;
}

function glyph(set, ch) {
  return set[ch] || set[' '];
}

const RISE_PX = 24;
const LIFE = 40;

export default class ScorePop extends Entity {
  static type = 'scorepop';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.t = 0;
    this.life = opts.life || LIFE;
    this.text = String(
      opts.text != null ? opts.text : opts.value != null ? opts.value : opts.score != null ? opts.score : 100
    ).toUpperCase();
    this.w = this.text.length * (GLYPH_W + KERN) - KERN;
    this.h = GLYPH_H;
    this.originX = x;
    this.originY = y;
    this.vx = 0;
    this.vy = 0;
    this.tangible = false;
    this.autoCorpse = false;
    this.despawnOffscreen = false;
    this.plate = plateFor(this.text);
    if (this.plate) {
      this.w = this.plate.w;
      this.h = this.plate.h;
    }
    this.big = this.text === '1UP';
  }

  update() {
    this.t++;
    const k = Math.min(1, this.t / this.life);
    // Ease-out rise so the number pops away from the impact then settles.
    this.y = this.originY - RISE_PX * (1 - (1 - k) * (1 - k));
    if (this.t >= this.life) this.removed = true;
  }

  onPlayerTouch() {}
  onFireball() {
    return false;
  }
  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const left = Math.floor(this.originX - cam.x - this.w / 2);
    const top = Math.floor(this.y - cam.y);
    const remain = this.life - this.t;
    // Stepped alpha: NES-style flicker-out rather than a smooth blend.
    let alpha = 1;
    if (remain < 12) alpha = remain < 4 ? 0.25 : remain < 8 ? 0.55 : 0.8;
    if (this.big && (this.t >> 1) % 2 === 0 && remain > 12) alpha = 1;

    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    if (this.plate) {
      this.plate.draw(ctx, Math.floor(this.originX - cam.x - this.plate.w / 2), top);
      ctx.globalAlpha = prev;
      return;
    }
    let cx = left;
    for (const ch of this.text) {
      glyph(SHADOW, ch).draw(ctx, cx + 1, top + 1);
      cx += GLYPH_W + KERN;
    }
    cx = left;
    for (const ch of this.text) {
      glyph(INK, ch).draw(ctx, cx, top);
      cx += GLYPH_W + KERN;
    }
    ctx.globalAlpha = prev;
  }
}

registerEntity(ScorePop);
