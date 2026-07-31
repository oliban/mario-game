// Typography + title screen.
//
// Everything here is authored as string-row pixel data. Letterforms are stored as
// 6x7 masks that fill the 8x8 cell edge to edge (ink in columns 0-6 once the drop
// shadow is added, one clean gutter column at 7); a deterministic bevel pass turns
// each mask into an 8x8 sprite with a lit upper-left flank, a body tone, a shaded
// lower-right flank and a thin drop shadow along the outside of the right and
// bottom edges. Doing the shading in one place is what keeps 50 glyphs looking
// like one typeface instead of 50 hand-shaded accidents — but only if the bevel
// understands the *form*. Two rules do most of that work: nothing right of a
// glyph's own centre may take the lit tone, and the length ramp may darken freely
// but may never brighten a surface into the lit tone. Measured over all 50 glyphs
// the cell is 260 shadow / 279 shaded / 250 body / 221 lit pixels, no glyph
// carries the lit tone on its right-hand flank, and no shadow pixel falls inside
// a letter's own 6x7 box.

import { makeSprite, Sprite, Anim } from '../../core/gfx.js';

// ---------------------------------------------------------------------------
// A sprite that draws its animation instead of one dead frame
// ---------------------------------------------------------------------------
// The three things this module owns that the 1985 original never leaves still —
// the HUD coin, the title glint, the menu pointer — are drawn by hud.js and
// screens.js through the plain `sprite.draw(ctx, x, y)` call. Those files belong
// to other agents, so exporting an Anim beside the sprite does nothing: the Anim
// is never asked for a frame and the game still shows a frozen coin. The motion
// therefore lives inside the sprite.
//
// Everything a consumer can inspect — `rows`, `palette`, `w`, `h`, `canvas` —
// still describes frame 0, so the contact sheet, the validator and world.js
// measuring a glyph box all see exactly what they saw before. Only `variant()`,
// the single call `draw()` actually renders, advances with the clock.
const clock =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();
const T0 = clock();
const nowTick = () => ((clock() - T0) * 60.0988) / 1000;

class LiveSprite extends Sprite {
  constructor(anim, opts = {}) {
    super(anim.frames[0].rows, anim.frames[0].palette, opts);
    this.anim = anim;
  }

  variant(flipX, flipY) {
    return this.anim.frame(nowTick()).variant(flipX, flipY);
  }

  // Recolouring has to carry every frame, not just the one baked into `rows`.
  // hud.js builds its coin flash out of `GLYPH.coin.shift(...)`, and a shifted
  // frame 0 spliced into the middle of a spin is a stutter you can see.
  recolor(palette, name) {
    const frames = this.anim.frames.map((f, i) =>
      f.recolor(palette, `${name || this.name + ':recolor'}#${i}`)
    );
    return new LiveSprite(new Anim(frames, this.anim.holds, this.anim.loop), {
      name: name || this.name + ':recolor',
      ox: this.ox,
      oy: this.oy,
    });
  }
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------
//  slot 0 = drop shadow      slot 1 = shaded (lower-right) edge
//  slot 2 = body             slot 3 = lit (upper-left) edge / specular
//
// Two rules govern both ramps.
//
// MONOTONIC: lit > body > shaded, and the drop shadow is never brighter than the
// form casting it. A shadow that out-lights its own letter is what turns a glyph
// into a concentric target with no light direction at all.
//
// TIGHT BODY, FAR SHADOW: the three tones INSIDE the letter have to sit close
// enough that a 1px stroke still reads as one mass at 8px — spread them and the
// stem turns to confetti — while the drop shadow sits far away so the silhouette
// survives on any ground. White runs 190 / 224 / 255 luma inside the letter with
// the shadow down at 12, and the three face tones are used in near-equal measure
// (279 / 248 / 223 px across the alphabet), so a word reads as one bright mass
// that turns, not as a light letter wearing a rim. Body must NOT equal the lit
// tone: a palette slot that renders the same colour as its neighbour is a slot
// that does not exist, and the whole bevel collapses to a flat cutout. Slot 2 was
// 38 units from white — under the threshold at which two ramp steps stop being
// two steps — and now sits 51 from it and 56 from the shaded tone.
export const FONT_PAL_WHITE = ['#0b0b14', '#b4bed9', '#d8e0f4', '#ffffff'];

// For text over light tiles (sand, brick, sky). Same construction, inverted.
//
// The previous ramp put slot 0 and slot 1 twenty-seven RGB units apart while those
// two slots carried 61% of the dark font's ink: three of its four tones spanned
// luma 18-59 against a 143-luma sky, so the letter was functionally 1-bit and
// every bowl — B D O P Q R and all six zeros of a score — closed into a lump with
// a tan rim. The steps here are 59 / 63 / 107 RGB units, luma 8 / 44 / 82 / 146,
// so the body sits far enough above its own shadow that a 1px counter still opens
// at 8px over sky.
export const FONT_PAL_DARK = ['#0d0703', '#3a2a12', '#6b4e22', '#b98c48'];

// ---------------------------------------------------------------------------
// Letterform masks — 6 wide, 7 tall, drawn at (0,0) of the 8x8 cell
// ---------------------------------------------------------------------------

const MASK_W = 6;
const MASK_H = 7;

const MASKS = {
  A: ['..##..', '.#..#.', '#....#', '######', '#....#', '#....#', '#....#'],

  // Swedish. The cell is only 7 rows tall, so the diacritic takes row 0 and the
  // letterform is compressed into the remaining six — the alternative is a mark
  // that collides with the crossbar and reads as noise at 8px.
  'Å': ['..##..', '..##..', '#....#', '######', '#....#', '#....#', '#....#'],
  'Ä': ['.#..#.', '..##..', '#....#', '######', '#....#', '#....#', '#....#'],
  'Ö': ['.#..#.', '.####.', '#....#', '#....#', '#....#', '#....#', '.####.'],
  B: ['#####.', '#....#', '#....#', '#####.', '#....#', '#....#', '#####.'],
  C: ['.####.', '#....#', '#.....', '#.....', '#.....', '#....#', '.####.'],
  D: ['#####.', '#....#', '#....#', '#....#', '#....#', '#....#', '#####.'],
  E: ['######', '#.....', '#.....', '#####.', '#.....', '#.....', '######'],
  F: ['######', '#.....', '#.....', '#####.', '#.....', '#.....', '#.....'],
  G: ['.####.', '#....#', '#.....', '#..###', '#....#', '#....#', '.####.'],
  H: ['#....#', '#....#', '#....#', '######', '#....#', '#....#', '#....#'],
  I: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '######'],
  J: ['..####', '.....#', '.....#', '.....#', '#....#', '#....#', '.####.'],
  K: ['#....#', '#...#.', '#..#..', '###...', '#..#..', '#...#.', '#....#'],
  L: ['#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '######'],
  // The inner V comes to a 2px point at row 3 instead of sitting on a solid bar.
  M: ['#....#', '##..##', '#.##.#', '#.##.#', '#....#', '#....#', '#....#'],
  // 1px diagonal, one step per row — same ink weight as H, not a chevron blob.
  N: ['#....#', '##...#', '#.#..#', '#..#.#', '#...##', '#....#', '#....#'],
  O: ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  P: ['#####.', '#....#', '#....#', '#####.', '#.....', '#.....', '#.....'],
  // Q's whole job is to not be an O. A tail tucked inside the ring's own
  // footprint is a smudge, not a tail, so the bowl narrows to 5 and the tail is
  // a 2px spur hanging off the OUTSIDE of the right stem at the baseline — the
  // one mark that changes the silhouette instead of the interior.
  Q: ['.###..', '#...#.', '#...#.', '#...#.', '#...#.', '#...##', '.#####'],
  R: ['#####.', '#....#', '#....#', '#####.', '#..#..', '#...#.', '#....#'],
  S: ['.####.', '#....#', '#.....', '.####.', '.....#', '#....#', '.####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  V: ['#....#', '#....#', '#....#', '#....#', '.#..#.', '.#..#.', '..##..'],
  // W was M reversed row for row: two full-height bars with an inner nub, same
  // silhouette, same flat bottom. Now the outer strokes step inward over the
  // last two rows and land on a 2-point foot at cols 1 and 4, so W is splayed at
  // the top and pointed at the bottom where M is a straight-sided box. The inner
  // peak is also 3 rows instead of 2, which gives it enough mass to read as the
  // middle stroke of a W rather than a tooth floating in a rectangle.
  W: ['#....#', '#....#', '#.##.#', '#.##.#', '#.##.#', '##..##', '.#..#.'],
  X: ['#....#', '#....#', '.#..#.', '..##..', '.#..#.', '#....#', '#....#'],
  Y: ['#....#', '#....#', '.#..#.', '..##..', '..##..', '..##..', '..##..'],
  Z: ['######', '....#.', '...#..', '..#...', '.#....', '#.....', '######'],

  // A plain open ring. The centred pip that used to sit in row 3 was a 2px mark
  // toned lit-beside-shaded — the palette's brightest and dimmest face tones
  // touching inside a 4px counter — and at HUD size a score line of it read as
  // six filled dots. 0 and O now differ by context, exactly as they do in 1985.
  0: ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  1: ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  2: ['.####.', '#....#', '.....#', '...##.', '..#...', '.#....', '######'],
  3: ['#####.', '.....#', '.....#', '.####.', '.....#', '.....#', '#####.'],
  // A 1px lower stem cannot carry tone: it rendered as one shaded pixel with the
  // drop shadow either side of it, '.000100.', and the leg of the 4 vanished at
  // HUD size. At 2px the stem carries two tones and survives. Widening the upper
  // diagonal to sit beside the stem also gives its three pixels the same pair of
  // axis votes, so the stroke now reads 3 / 3 / 3 instead of the old 3 / 2 / 3 / 2
  // — one tone the whole way down rather than a bright speck mid-stroke.
  4: ['...##.', '..###.', '.#.##.', '#..##.', '######', '...##.', '...##.'],
  5: ['######', '#.....', '#####.', '.....#', '.....#', '#....#', '.####.'],
  6: ['.####.', '#....#', '#.....', '#####.', '#....#', '#....#', '.####.'],
  7: ['######', '.....#', '....#.', '...#..', '..#...', '..#...', '..#...'],
  8: ['.####.', '#....#', '#....#', '.####.', '#....#', '#....#', '.####.'],
  9: ['.####.', '#....#', '#....#', '.#####', '.....#', '#....#', '.####.'],

  ' ': ['......', '......', '......', '......', '......', '......', '......'],
  '.': ['......', '......', '......', '......', '......', '..##..', '..##..'],
  ',': ['......', '......', '......', '......', '..##..', '..##..', '.##...'],
  "'": ['..##..', '..##..', '..#...', '......', '......', '......', '......'],
  '!': ['..##..', '..##..', '..##..', '..##..', '..##..', '......', '..##..'],
  '?': ['.####.', '#....#', '.....#', '...##.', '..##..', '......', '..##..'],
  '-': ['......', '......', '......', '.####.', '......', '......', '......'],
  // Lowercase x sits on the baseline and is a full 5 rows tall...
  x: ['......', '......', '#....#', '.#..#.', '..##..', '.#..#.', '#....#'],
  // ...the multiplication sign is a compact cross on the maths axis. Two
  // different marks, not one mark at two heights. All four of its diagonals are
  // two pixels long, too short for the chain tracer to touch, so its 2x2 centre
  // used to fall through to the pixel-local vote and come out white beside grey —
  // a mark whose histogram is three lit and three shaded belongs to no typeface,
  // it is a sparkle. The crossing clamp in shadeMask now resolves all four centre
  // pixels to body and the four arms ramp 3 / 2 / 2 / 1 around them.
  '×': ['......', '.#..#.', '..##..', '..##..', '.#..#.', '......', '......'],
  // A plain ring. The inner serif of a real (c) is mud at 8px, and the "notch"
  // that replaced it was worse: one lit pixel with a shaded one hard against it,
  // inside a counter the drop shadow was already silting. The ring on its own is
  // what reads as a copyright mark on the one line it appears on.
  '©': ['......', '.####.', '#....#', '#....#', '#....#', '.####.', '......'],
  ':': ['......', '..##..', '..##..', '......', '..##..', '..##..', '......'],
  // Seven rows across six columns cannot be a 45-degree line, so the old slash
  // doubled up at x=2 and broke into two diagonal segments with a bright speck
  // where the second one restarted. Six rows on the baseline is one clean stroke.
  '/': ['......', '.....#', '....#.', '...#..', '..#...', '.#....', '#.....'],
  '(': ['...##.', '..#...', '.#....', '.#....', '.#....', '..#...', '...##.'],
  ')': ['.##...', '...#..', '....#.', '....#.', '....#.', '...#..', '.##...'],
};

for (const k of Object.keys(MASKS)) {
  const m = MASKS[k];
  if (m.length !== MASK_H || m.some((r) => r.length !== MASK_W)) {
    throw new Error(`font: mask ${JSON.stringify(k)} is not ${MASK_W}x${MASK_H}`);
  }
}

// Light comes from the upper-left, and the bevel resolves in three passes: the
// axis vote decides which SURFACE a pixel is, a length ramp decides where along
// its STROKE it sits, and diagonals are shaded as whole strokes rather than
// pixel by pixel.
//
// 1. AXIS VOTE. Each pixel votes twice — once vertically, once horizontally. A
//    stroke that is 1px thick on an axis is resolved against the glyph's own
//    centre: the top bar of an E faces the lamp, its bottom bar faces away, the
//    left stem is lit and the right stem is shaded.
//
// 2. LENGTH RAMP. The vote alone is binary, so a 7px stem comes out as seven
//    identical #ffffff pixels and L reads as a white cutout with a grey edge
//    while O beside it carries a full four-step ramp. Any run of >= 4 collinear
//    ink pixels therefore adds a signed ramp: brightest at the end nearest the
//    lamp (top for a stem, left for a bar) falling to -RAMP at the far end. A
//    corner belongs to two runs and picks up both offsets, which cancel — so the
//    corner stays put and only the shafts either side of it ramp.
//
// 3. DIAGONAL CHAINS. Shading a diagonal from its immediate neighbours flickers
//    along a continuous stroke (N used to run 2,3,1,2 down its leg and X had a
//    pure white pixel at its bottom-left terminal, the point furthest from the
//    lamp). Instead every maximal diagonal stroke is traced first and toned by
//    DISTANCE FROM THE LAMP, x + y, over the chain's own span — so it ramps once,
//    monotonically, over its whole length, and a rising stroke, every pixel of
//    which is the same distance from an upper-left lamp, comes out as one flat
//    tone rather than lighting whichever end the tracer happened to start at.
//    A chain pixel right of the glyph's centre can never take the lit tone, which
//    is what stops K's right-hand arm terminal from out-lighting H's stem.
//
// The ramp is a MODULATION, never a verdict. At RAMP 1.5 it was larger than the
// axis vote it was supposed to decorate, so a +1.5 at the head of any run of four
// flipped right-flank pixels to pure white: the top of A's right leg came out the
// same #ffffff as the top of its left stem, and fourteen glyphs carried the
// brightest tone in the palette on their rightmost ink column while the file's own
// documentation promised the opposite. RAMP is now half the axis vote and its
// brightening contribution is capped at CLAMP, so it can shade along a surface but
// never reclassify one; darkening is left uncapped, because the far end of a
// stroke really does fall away. On top of that, nothing right of the glyph's own
// centre takes the lit tone, from any pass. Measured over all 50 glyphs: zero
// lit-tone pixels right of centre, zero on a rightmost ink column, and the
// per-glyph lit share compressed from 10-56% to 13-44%, with the mirror pair
// ( and ) now 11 points apart instead of 34.
const RAMP = 0.75;
const CLAMP = 0.45;

function shadeMask(mask) {
  const mw = mask[0].length;
  const mh = mask.length;
  const on = (x, y) => x >= 0 && y >= 0 && x < mw && y < mh && mask[y][x] === '#';

  let minX = mw;
  let maxX = -1;
  let minY = mh;
  let maxY = -1;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!on(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return mask.map((r) => '.'.repeat(r.length));

  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const key = (x, y) => y * mw + x;

  // --- pass 2 tables: maximal collinear runs, indexed from the lamp end -------
  const runH = new Array(mw * mh).fill(null);
  const runV = new Array(mw * mh).fill(null);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; ) {
      if (!on(x, y)) { x++; continue; }
      let e = x;
      while (on(e + 1, y)) e++;
      for (let k = x; k <= e; k++) runH[key(k, y)] = [e - x + 1, k - x];
      x = e + 1;
    }
  }
  for (let x = 0; x < mw; x++) {
    for (let y = 0; y < mh; ) {
      if (!on(x, y)) { y++; continue; }
      let e = y;
      while (on(x, e + 1)) e++;
      for (let k = y; k <= e; k++) runV[key(x, k)] = [e - y + 1, k - y];
      y = e + 1;
    }
  }

  // --- pass 3: trace diagonal strokes ---------------------------------------
  // A pixel with no orthogonal neighbour at all is unambiguously mid-diagonal.
  // Those form the core of a chain; the chain is then extended by one pixel at
  // each end (the shoulder where the diagonal lands on a stem) and by a terminal
  // cap (a lone pixel hanging off the end, like the foot of X's lower-left arm)
  // so the ramp covers the whole visible stroke and does not restart mid-way.
  const orthCount = (x, y) =>
    (on(x - 1, y) ? 1 : 0) + (on(x + 1, y) ? 1 : 0) + (on(x, y - 1) ? 1 : 0) + (on(x, y + 1) ? 1 : 0);
  const inkCount = (x, y) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && on(x + dx, y + dy)) n++;
      }
    }
    return n;
  };
  const core = (x, y) => on(x, y) && orthCount(x, y) === 0;
  // A lone pixel orthogonally stuck on the end of a chain — the cap of a terminal.
  const capOf = (x, y) => {
    const cand = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter((p) => on(p[0], p[1]));
    if (cand.length !== 1) return null;
    const [cxp, cyp] = cand[0];
    return inkCount(cxp, cyp) === 1 ? [cxp, cyp] : null;
  };

  const chainTone = new Map();
  const claims = new Map();
  const halfH = (maxY - minY + 1) / 2;
  for (const [dx, dy] of [[1, 1], [1, -1]]) {
    const seen = new Set();
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!core(x, y) || seen.has(key(x, y))) continue;
        if (core(x - dx, y - dy)) continue;
        const chain = [];
        let px = x;
        let py = y;
        while (core(px, py)) {
          seen.add(key(px, py));
          chain.push([px, py]);
          px += dx;
          py += dy;
        }
        // shoulders: the pixels the stroke lands on at either end
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (on(head[0] - dx, head[1] - dy)) chain.unshift([head[0] - dx, head[1] - dy]);
        if (on(tail[0] + dx, tail[1] + dy)) chain.push([tail[0] + dx, tail[1] + dy]);
        // terminal caps
        const h2 = capOf(chain[0][0], chain[0][1]);
        if (h2) chain.unshift(h2);
        const t2 = capOf(chain[chain.length - 1][0], chain[chain.length - 1][1]);
        if (t2) chain.push(t2);
        if (chain.length < 3) continue;
        chain.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        const L = chain.length;
        // A chain that is only part of the glyph's width is an ARM — K's upper
        // arm, A's legs — and an arm hanging off the right may not take the lit
        // tone, or a right-hand terminal ends up brighter than the stem it grows
        // out of.
        let lo = Infinity;
        let hi = -Infinity;
        let sumY = 0;
        // Distance from the lamp is x + y, not position along the stroke. Ramping
        // by position lights whichever end the walk happens to start at, and for a
        // rising diagonal that end is the RIGHTMOST pixel in the glyph — which is
        // how '/' and '(' ended up carrying pure white on their right edge in a
        // face whose own documentation says the right flank is shaded. Measured
        // properly, a 45-degree rising stroke has the same x + y at every pixel:
        // it lies along the wavefront, every point on it is equally lit, and it
        // comes out as one flat tone. A falling stroke runs from near the lamp to
        // far from it and ramps over its whole length, monotonically, once.
        let dlo = Infinity;
        let dhi = -Infinity;
        for (const [qx, qy] of chain) {
          if (qx < lo) lo = qx;
          if (qx > hi) hi = qx;
          sumY += qy;
          if (qx + qy < dlo) dlo = qx + qy;
          if (qx + qy > dhi) dhi = qx + qy;
        }
        const isArm = hi - lo + 1 < 0.75 * (maxX - minX + 1);
        // How high the stroke sits in the glyph. Distance alone makes the two
        // arms of an X identical; the upper one should be the brighter of them.
        const lift = Math.max(-1, Math.min(1, (2 * (cy - sumY / L)) / halfH));
        for (let i = 0; i < L; i++) {
          const [qx, qy] = chain[i];
          const k = key(qx, qy);
          // A shoulder sitting in a stem or bar 3px long or more is not a
          // diagonal pixel, it is the stroke the diagonal landed on. Toning it
          // from the chain punches a dark pixel into the top of A's left stem.
          const rhq = runH[k];
          const rvq = runV[k];
          if ((rhq && rhq[0] >= 3) || (rvq && rvq[0] >= 3)) continue;
          claims.set(k, (claims.get(k) || 0) + 1);
          const u = dhi > dlo ? (qx + qy - dlo) / (dhi - dlo) : 0.5;
          const v = 1 - 2 * u + lift;
          let t = v >= 0.5 ? '3' : v <= -0.5 ? '1' : '2';
          if (t === '3' && isArm && qx + 0.5 > cx) t = '2';
          chainTone.set(k, t);
        }
      }
    }
  }
  // Where two strokes cross (the waist of an X, the crossing of a lowercase x)
  // the pixel is interior to both, so it is body — never the lit end of one arm
  // and the dark end of the other at the same time.
  for (const [k, n] of claims) if (n > 1) chainTone.set(k, '2');
  // That rule only fires on chains long enough to be traced, and a compact mark
  // like × is four diagonals of length two — all of them discarded — so its
  // crossing fell through to the pixel-local vote and came out white beside grey,
  // which is a sparkle, not a glyph. A pixel that touches a free-running diagonal,
  // has ink on two or more sides and most of its neighbourhood filled is the place
  // two strokes meet: it is interior, so it is body. The diagonal test is what
  // keeps this off the T and I stem-to-bar junctions, which are not crossings and
  // do want the lit tone at the top.
  const nearCore = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && core(x + dx, y + dy)) return true;
      }
    }
    return false;
  };
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!on(x, y) || inkCount(x, y) < 4 || orthCount(x, y) < 2) continue;
      if (nearCore(x, y)) chainTone.set(key(x, y), '2');
    }
  }

  const out = [];
  for (let y = 0; y < mh; y++) {
    let row = '';
    for (let x = 0; x < mw; x++) {
      if (!on(x, y)) {
        row += '.';
        continue;
      }
      const k = key(x, y);
      if (chainTone.has(k)) {
        const t = chainTone.get(k);
        row += t === '3' && x + 0.5 > cx ? '2' : t;
        continue;
      }
      const up = on(x, y - 1);
      const down = on(x, y + 1);
      const left = on(x - 1, y);
      const right = on(x + 1, y);

      let vv = 0;
      if (!up && !down) vv = y + 0.5 < cy ? 1 : y + 0.5 > cy ? -1 : 0;
      else if (!up) vv = 1;
      else if (!down) vv = -1;

      let hv = 0;
      if (!left && !right) hv = x + 0.5 < cx ? 1 : x + 0.5 > cx ? -1 : 0;
      else if (!left) hv = 1;
      else if (!right) hv = -1;

      const rh = runH[k];
      const rv = runV[k];
      const r =
        (rh && rh[0] >= 4 ? RAMP * (1 - (2 * rh[1]) / (rh[0] - 1)) : 0) +
        (rv && rv[0] >= 4 ? RAMP * (1 - (2 * rv[1]) / (rv[0] - 1)) : 0);

      // The vote decides which SURFACE the pixel is; the ramp only shades ALONG
      // it. Brightening is capped at CLAMP, so the ramp can never promote a body
      // or a shaded surface to the lit tone — that is what put pure #ffffff on the
      // right flank of fourteen glyphs and a bright speck under the bottom-left
      // arc of every bowl. Darkening is left uncapped: a stroke running away from
      // the lamp really does fall off, and the far end of a bar should reach the
      // shaded tone.
      let tone = hv + vv + (r > 0 ? Math.min(r, CLAMP) : Math.max(r, -RAMP));
      // Nothing right of the glyph's own centre takes the lit tone. Without this
      // a 6px bar stays lit for five pixels and then drops straight to shaded,
      // and the inner shoulder of M — which has air above it and air to its left,
      // so it votes lit twice — flares white one pixel from the shaded right stem.
      if (x + 0.5 > cx) tone = Math.min(tone, 0.4);

      row += tone > 0.5 ? '3' : tone < -0.5 ? '1' : '2';
    }
    out.push(row);
  }
  return out;
}

// 8x8 cell: shaded letterform at (0,0), hard drop shadow at (1,1). That puts ink
// in columns 0-6 and leaves column 7 as the sidebearing, so a string sits on its
// origin instead of 1px to the right of it and the rhythm is symmetric.
//
// The shadow is confined to the strip OUTSIDE the 6x7 mask box — column 6 and row
// 7 only. A flood fill from the cell border is not enough on its own: the gap
// between E's arms, the crook of an F, the counter of a 4 and the two dots of a
// colon are all reachable from outside, so the shadow poured into them and the
// typeface came out 42% black by area with more than half of that black sitting
// inside the letters it was meant to sit behind. SMB 1985's HUD font has no
// shadow at all; this one keeps just the right/bottom rim that lets white type
// survive on a white cloud, and nothing that can close a counter.
function cellRows(mask) {
  const face = shadeMask(mask);
  const mw = mask[0].length;
  const mh = mask.length;
  const solid = [];
  for (let y = 0; y < 8; y++) solid.push(new Array(8).fill(false));
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (mask[y][x] === '#') solid[y][x] = true;
    }
  }

  const outside = [];
  for (let y = 0; y < 8; y++) outside.push(new Array(8).fill(false));
  const stack = [];
  for (let i = 0; i < 8; i++) {
    stack.push([i, 0], [i, 7], [0, i], [7, i]);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x > 7 || y > 7) continue;
    if (outside[y][x] || solid[y][x]) continue;
    outside[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const grid = [];
  for (let y = 0; y < 8; y++) grid.push(new Array(8).fill('.'));
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (mask[y][x] !== '#') continue;
      const sx = x + 1;
      const sy = y + 1;
      if (sx > 7 || sy > 7) continue;
      if (sx <= MASK_W - 1 && sy <= MASK_H - 1) continue;
      if (solid[sy][sx] || !outside[sy][sx]) continue;
      grid[sy][sx] = '0';
    }
  }
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const c = face[y][x];
      if (c !== '.') grid[y][x] = c;
    }
  }
  return grid.map((r) => r.join(''));
}

function glyphSprite(mask, pal, name) {
  return makeSprite(cellRows(mask), pal, { name });
}

const KEYS = Object.keys(MASKS);

export const FONT = {};
export const FONT_DARK = {};
for (const k of KEYS) {
  FONT[k] = glyphSprite(MASKS[k], FONT_PAL_WHITE, `font.${k}`);
  FONT_DARK[k] = FONT[k].recolor(FONT_PAL_DARK, `fontDark.${k}`);
}

export function text(str, dark = false) {
  const map = dark ? FONT_DARK : FONT;
  const out = [];
  const s = str == null ? '' : String(str);
  for (const ch of s) {
    let g = Object.prototype.hasOwnProperty.call(map, ch) ? map[ch] : undefined;
    if (!g) {
      const up = ch.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(map, up)) g = map[up];
    }
    out.push(g || map[' ']);
  }
  return out;
}

// ---------------------------------------------------------------------------
// HUD glyphs
// ---------------------------------------------------------------------------

// The three HUD icons — coin, Mario head, menu pointer — appear on the same
// screens, so they are held at least 45 RGB units apart at every matching ramp
// index. Only slot 0 is shared, and deliberately: INK.outline is the project's
// common occlusion colour and every module outlines with it. The coin's top rim
// used to be #ffe9a0, 17 units from Mario's lit skin — pale gold and pale skin
// are the same colour at 8px, and the two icons sit four characters apart in the
// status bar.
export const COIN_PAL = ['#1a1008', '#7a4f00', '#b8891a', '#e8c74a', '#ffe98c', '#ffffff'];

// The HUD coin turns a full 360 on its vertical axis. A cycle that goes wide ->
// narrow -> wide again through the SAME drawings is not a spin, it is a squeeze:
// the disc has to pass edge-on, show its reverse face, and come back. So every
// frame is keyed on three things that actually change with the angle:
//
//   * silhouette width  — 6px face-on, 4px, 3px, 2px edge-on;
//   * which face is toward us — the struck bar sits RIGHT of the face centre on
//     the obverse and LEFT of it on the reverse, so frame 6 is unmistakably the
//     back of the coin and not frame 0 again;
//   * which side the milled RIM is on — the thickness of the disc swings from
//     the right of the silhouette (0-180) to the left (180-360). A rim on the
//     right is turned away from the lamp so it is slot 1; a rim on the left
//     faces the lamp so it is slot 3.
//
// That gives twelve drawings with no repeats. The specular never moves off the
// upper-left, because the lamp does not rotate with the coin — but it does go out
// on the four frames where the face has swung past it and is grazing (C_VR, C_VL
// and both edge-on frames), which is the difference between a disc turning under
// a light and a disc with a sticker on it.

// --- 0 degrees: obverse, face-on. Struck bar right of centre at x4. -----------
const COIN_A = [
  '..0000..',
  '.045430.',
  '04531330',
  '04321330',
  '04321320',
  '04321220',
  '.022110.',
  '..0000..',
];

// --- 180 degrees: reverse, face-on. Same disc, struck bar mirrored to x3. -----
const COIN_A2 = [
  '..0000..',
  '.045430.',
  '04513330',
  '04313320',
  '04313220',
  '03312220',
  '.021210.',
  '..0000..',
];

// --- ~35 degrees: obverse, rim swung to the right (in shadow, slot 1). --------
const COIN_B_OR = [
  '..00000.',
  '..05420.',
  '.0431320',
  '.0431310',
  '.0421210',
  '.0321210',
  '..02210.',
  '..00000.',
];

// --- ~145 degrees: reverse, rim still right. Struck bar has crossed to x3. ----
const COIN_B_VR = [
  '..00000.',
  '..05420.',
  '.0413320',
  '.0413310',
  '.0413210',
  '.0312210',
  '..02210.',
  '..00000.',
];

// --- ~215 degrees: reverse, rim has swung to the left and now catches light. --
const COIN_B_VL = [
  '.00000..',
  '.03540..',
  '0341330.',
  '0341320.',
  '0231220.',
  '0231210.',
  '.02210..',
  '.00000..',
];

// --- ~325 degrees: obverse again, rim still left. Struck bar back at x4. ------
const COIN_B_OL = [
  '.00000..',
  '.03540..',
  '0343130.',
  '0343120.',
  '0232120.',
  '0232110.',
  '.02210..',
  '.00000..',
];

// --- 3px frames. The face is too foreshortened to carry the struck bar, so the
// cue here is brightness: swinging toward edge-on the face still catches the
// lamp, swinging away from it the face is grazing and goes dim.
const COIN_C_OR = [
  '..00000.',
  '..05320.',
  '..04320.',
  '..04310.',
  '..03210.',
  '..03210.',
  '..02110.',
  '..00000.',
];

const COIN_C_VR = [
  '..00000.',
  '..04310.',
  '..03310.',
  '..03210.',
  '..02210.',
  '..02110.',
  '..01110.',
  '..00000.',
];

const COIN_C_VL = [
  '..00000.',
  '..03410.',
  '..03310.',
  '..03210.',
  '..02210.',
  '..02110.',
  '..01110.',
  '..00000.',
];

const COIN_C_OL = [
  '..00000.',
  '..04520.',
  '..04320.',
  '..03320.',
  '..03210.',
  '..03210.',
  '..02110.',
  '..00000.',
];

// --- 90 / 270 degrees: edge-on. Two pixels of milled rim, nothing else. The top
// pixel is slot 1 so the edge reads as a struck chamfer catching nothing, not as
// a bright sliver of face. At 270 the lit and dark columns have traded places,
// which is the pixel-art shorthand for the disc having turned through.
const COIN_D_R = [
  '..0000..',
  '..0110..',
  '..0410..',
  '..0410..',
  '..0410..',
  '..0310..',
  '..0210..',
  '..0000..',
];

const COIN_D_L = [
  '..0000..',
  '..0110..',
  '..0140..',
  '..0140..',
  '..0140..',
  '..0130..',
  '..0120..',
  '..0000..',
];

// Skin pulled warmer and out of the cream band so the face never reads as the
// same material as the coin beside it in the status bar. Slot 6 is the cap's lit
// crown: without it the cap was 8px of one red over 8px of another, which is a
// two-tone form — the exact failure this file calls out everywhere else — sitting
// four characters from a coin that spins through twelve drawings.
export const MARIO_HEAD_PAL = [
  '#1a1008',
  '#8c1000',
  '#d02818',
  '#d8884c',
  '#f8c078',
  '#4a2408',
  '#f05a3c',
];

// Seven slots, every one of them load-bearing: a lit crown (6) over the cap body
// (2) over cap shadow (1), a hard brim line across row 3, a skin block that turns
// from lit (4) through mid to shaded (3) as the face rounds away, two 1px eyes and
// a 3px moustache in (5). The brim is what makes it a head at 8px — without it the
// cap and the face merge into a red mushroom — and the eyes sit a clear row above
// the moustache so the lower face reads as a moustache rather than a beard.
const MARIO_HEAD_ROWS = [
  '..0000..',
  '.066210.',
  '02622210',
  '01111110',
  '.0454530',
  '.0443330',
  '.0355530',
  '..0000..',
];

// Blink. The head is drawn once a frame at a fixed spot in the status bar and on
// the game-over screen, so a still drawing is a still drawing forever; the two
// icons either side of it move. Closing the eyes for four ticks every three and a
// half seconds is the smallest honest motion a face can have — the lids come down
// to the skin tone, the moustache and cap do not move, and at 8px that is the
// whole blink.
const MARIO_HEAD_BLINK = [
  '..0000..',
  '.066210.',
  '02622210',
  '01111110',
  '.0444430',
  '.0443330',
  '.0355530',
  '..0000..',
];

// Half-lidded — the pupils drop to the shaded skin tone — for one tick either
// side of the close, so the eye does not pop open in a single step.
const MARIO_HEAD_HALF = [
  '..0000..',
  '.066210.',
  '02622210',
  '01111110',
  '.0434330',
  '.0443330',
  '.0355530',
  '..0000..',
];

// Six slots, all of them carrying real area: outline, deep amber, amber, hot
// orange, hot rim, white specular.
//
// The pointer used to be built from Mario's own reds — slot 2 was #d02818, the
// exact hex of his cap, and slot 1 sat 19 units from his cap shadow. Two objects
// on one screen made of the same paint are one object as far as the eye is
// concerned, and the player then has to learn twice which of the two red things
// means "you are here". Amber is chrome, not costume: it belongs to the UI, it
// is 52+ units clear of the head at every ramp index and 50+ clear of the coin,
// and against white menu type on black it is the loudest thing on the screen.
// Slot 4 used to sit 37 units from slot 3 — two adjacent ramp steps a viewer
// cannot tell apart are one step with a wasted palette entry between them, and
// the pointer is 8px across, so it could least afford it. The ramp now steps
// 18 / 85 / 138 / 171 / 205 / 255 in luma with no neighbour pair under 40.
export const CURSOR_PAL = [
  '#1a1008',
  '#a83c00',
  '#f07000',
  '#ff9c20',
  '#ffc85c',
  '#ffffff',
];

// The pointer used to be a dome on a stalk, which is a mushroom, which is what
// GLYPH.marioHead already is — two 8x8 red-over-lighter icons doing two different
// jobs on the same screen. So it is a chevron now: a solid right-pointing wedge
// with a flat back, an outline all the way round, a white top flank and a deep
// amber underside. At 8px there is nothing else it can be read as.
//
// The cycle is a pump along the pointer's own axis, not a translate. The wedge
// draws in (REST -> CONTRACT), then lances forward a pixel past its rest length
// (EXPAND) with the specular running all the way out to the tip, then recoils
// with fat shoulders and a dimming nose (RECOIL). Mass changes on six of the
// eight rows between the extremes and the highlight travels the length of the
// form, so it breathes instead of twitching sideways.

// Rest: back at x1, tip at x5. This is frame 0, and therefore the drawing every
// consumer that inspects `rows` or `canvas` sees.
const CURSOR_ROWS = [
  '0550....',
  '05450...',
  '043340..',
  '0432230.',
  '0322220.',
  '032110..',
  '02110...',
  '0110....',
];

// Expanded: back at x1, tip out at x6, shoulders pinched, specular lanced to the
// point.
const CURSOR_BIG = [
  '0550....',
  '054450..',
  '0433350.',
  '04322350',
  '03222220',
  '0321110.',
  '021110..',
  '0110....',
];

// Recoil: same reach as rest but the mass has slumped back into the shoulders and
// the nose has gone to shadow — the frame that sells the return stroke.
const CURSOR_RECOIL = [
  '0440....',
  '043340..',
  '043230..',
  '0322220.',
  '0322110.',
  '021110..',
  '021110..',
  '0110....',
];

// Contracted: the whole wedge pulls back a pixel (back at x2, tip at x5) and goes
// dim — the bottom of the breath.
const CURSOR_SMALL = [
  '.040....',
  '.0340...',
  '.03230..',
  '.032220.',
  '.022220.',
  '.02110..',
  '.0110...',
  '.010....',
];

const coinA = makeSprite(COIN_A, COIN_PAL, { name: 'glyph.coin' });
const coinA2 = makeSprite(COIN_A2, COIN_PAL, { name: 'glyph.coin.rev' });
const coinBor = makeSprite(COIN_B_OR, COIN_PAL, { name: 'glyph.coin.b1' });
const coinCor = makeSprite(COIN_C_OR, COIN_PAL, { name: 'glyph.coin.c1' });
const coinDr = makeSprite(COIN_D_R, COIN_PAL, { name: 'glyph.coin.edge1' });
const coinCvr = makeSprite(COIN_C_VR, COIN_PAL, { name: 'glyph.coin.c2' });
const coinBvr = makeSprite(COIN_B_VR, COIN_PAL, { name: 'glyph.coin.b2' });
const coinBvl = makeSprite(COIN_B_VL, COIN_PAL, { name: 'glyph.coin.b3' });
const coinCvl = makeSprite(COIN_C_VL, COIN_PAL, { name: 'glyph.coin.c3' });
const coinDl = makeSprite(COIN_D_L, COIN_PAL, { name: 'glyph.coin.edge2' });
const coinCol = makeSprite(COIN_C_OL, COIN_PAL, { name: 'glyph.coin.c4' });
const coinBol = makeSprite(COIN_B_OL, COIN_PAL, { name: 'glyph.coin.b4' });

const cursor = makeSprite(CURSOR_ROWS, CURSOR_PAL, { name: 'glyph.cursor' });
const cursorBig = makeSprite(CURSOR_BIG, CURSOR_PAL, { name: 'glyph.cursor.big' });
const cursorRecoil = makeSprite(CURSOR_RECOIL, CURSOR_PAL, {
  name: 'glyph.cursor.recoil',
});
const cursorSmall = makeSprite(CURSOR_SMALL, CURSOR_PAL, {
  name: 'glyph.cursor.small',
});

// One revolution in 44 ticks. Twelve distinct drawings, no frame reused, and the
// order walks the angle monotonically instead of ping-ponging back.
//
// The holds are NOT uniform. A disc turning at a constant rate changes its
// apparent width fastest as it passes edge-on, so an even hold parks the coin on
// a 2px sliver for as long as it shows its face — the HUD then reads as a gold
// splinter one frame in six. Face-on gets 6 ticks, the edge frames 2.
const coinAnim = new Anim(
  [
    coinA, //   0  obverse, face-on
    coinBor, //  35  obverse, rim right
    coinCor, //  60  obverse, rim right
    coinDr, //   90  edge-on
    coinCvr, // 120  reverse, rim right
    coinBvr, // 145  reverse, rim right
    coinA2, //  180  reverse, face-on
    coinBvl, // 215  reverse, rim left
    coinCvl, // 240  reverse, rim left
    coinDl, //  270  edge-on
    coinCol, // 300  obverse, rim left
    coinBol, // 325  obverse, rim left
  ],
  [6, 4, 3, 2, 3, 4, 6, 4, 3, 2, 3, 4]
);

const cursorAnim = new Anim([cursor, cursorBig, cursorRecoil, cursorSmall], [16, 5, 5, 5]);

const head = makeSprite(MARIO_HEAD_ROWS, MARIO_HEAD_PAL, { name: 'glyph.marioHead' });
const headHalf = makeSprite(MARIO_HEAD_HALF, MARIO_HEAD_PAL, { name: 'glyph.marioHead.half' });
const headShut = makeSprite(MARIO_HEAD_BLINK, MARIO_HEAD_PAL, { name: 'glyph.marioHead.blink' });

// 210 ticks open, then down-shut-up in six. Frame 0 is the resting drawing, so
// anything that inspects `rows` still sees the head with its eyes open.
const headAnim = new Anim([head, headHalf, headShut, headHalf], [210, 1, 4, 1]);

export const GLYPH = {
  // Live: hud.js draws GLYPH.coin once a frame at a fixed spot, so the spin has
  // to come from the sprite or it never happens at all.
  coin: new LiveSprite(coinAnim, { name: 'glyph.coin' }),
  coinAnim,
  // Same reason. The status bar draws this beside a spinning coin and a pulsing
  // score; a face that never moves is the one dead thing on the row.
  marioHead: new LiveSprite(headAnim, { name: 'glyph.marioHead' }),
  marioHeadAnim: headAnim,
  // Live for the same reason: screens.js draws GLYPH.cursor, never cursorAnim.
  cursor: new LiveSprite(cursorAnim, { name: 'glyph.cursor' }),
  cursorAnim,
};

// ---------------------------------------------------------------------------
// SUPER MARIO title logo — 176 x 88
// ---------------------------------------------------------------------------
//  0 outline   1 extrude (underside)   8 extrude (right side)
//  2 deepest face edge  3 dark  4 mid  5 light  6 highlight  7 specular
//  9 outer keyline (lit)   a outer keyline (shaded)
//
// The keyline matters: a pure black outline vanishes on the black title
// background, and the whole word-mark loses its silhouette.
//
// The extrude is a solid slab seen from outside, so its two visible faces must
// not be the same paint. They used to be: the underside, the deepest face edge
// and the right side sat 32, 23 and 37 units apart — three declared surfaces
// carrying 17% of the wordmark as one undifferentiated maroon lump. The underside
// is now genuinely a shadow (luma 25) and the right side a surface catching
// bounce (luma 78), 93 units apart, with the deepest face edge between them at
// luma 46. Measured over the resting frame, no two slots that actually touch
// anywhere in the wordmark are closer than 43 units, and 43 is the deliberate
// step between the two brightest tones of the red face.
export const LOGO_PAL = [
  '#000000',
  '#3c0c04',
  '#7a1005',
  '#a81c0c',
  '#d02818',
  '#f05a3c',
  '#ff9c80',
  '#ffffff',
  '#8a3a18',
  '#ffe9b8',
  '#a86028',
];

const BIG = {
  M: [
    '######...######',
    '######...######',
    '######...######',
    '###.###.###.###',
    '###.###.###.###',
    '###.###.###.###',
    '###..#####..###',
    '###..#####..###',
    '###..#####..###',
    '###...###...###',
    '###...###...###',
    '###...###...###',
    '###....#....###',
    '###....#....###',
    '###....#....###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '####.......####',
    '####.......####',
  ],
  // The apex counter has to be at least 5px wide in the mask or the 2px outline
  // closes it and A's hole disappears. The legs therefore splay one step every
  // two rows, and the crossbar is widened to x1..x13 so the outer edge steps
  // monotonically outward all the way down — a crossbar narrower than the rows
  // above it puts a notch in the silhouette.
  A: [
    '......###......',
    '.....#####.....',
    '.....#####.....',
    '....###.###....',
    '....###.###....',
    '...###...###...',
    '...###...###...',
    '..###.....###..',
    '..###.....###..',
    '.###.......###.',
    '.###.......###.',
    '.#############.',
    '.#############.',
    '.#############.',
    '.###.......###.',
    '.###.......###.',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
  ],
  R: [
    '###########....',
    '#############..',
    '###.......#####',
    '###........####',
    '###........####',
    '###........####',
    '###.......#####',
    '#############..',
    '###########....',
    // The leg starts at its final 4px width directly under the bowl. Flaring to
    // 6px for one row and then dropping back to 4 puts a 1px notch exactly where
    // the bowl hands over to the leg.
    '###...####.....',
    '###...####.....',
    '###...####.....',
    '###....####....',
    '###....####....',
    '###.....####...',
    '###.....####...',
    '###......####..',
    '###......####..',
    '###.......####.',
    '###.......####.',
    '###........####',
  ],
  I: [
    '.#############.',
    '.#############.',
    '.#############.',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '......###......',
    '.#############.',
    '.#############.',
    '.#############.',
  ],
  O: [
    '....#######....',
    '..###########..',
    '.#############.',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '###.........###',
    '.#############.',
    '..###########..',
    '....#######....',
  ],
};

const SMALL = {
  // The apertures have to clear the outline AND the keyline on both sides. The
  // old S ran its spine diagonally from corner to corner, so each throat tapered
  // to 3 mask px and then to 2 — the two 1px outlines plus the keyline ate the
  // whole gap and the throat rendered as a cream slot stabbed through the
  // letter. Squaring the spine into a straight middle band opens both apertures
  // to a blunt 8 mask px that runs clean out of the side of the glyph.
  S: [
    '..#######..',
    '.#########.',
    '###.....###',
    '###........',
    '###........',
    '.#########.',
    '..#######..',
    '.#########.',
    '........###',
    '........###',
    '###.....###',
    '.#########.',
    '..#######..',
  ],
  U: [
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '###.....###',
    '.#########.',
    '..#######..',
  ],
  P: [
    '#########..',
    '##########.',
    '###....####',
    '###.....###',
    '###.....###',
    '###....####',
    '##########.',
    '#########..',
    '###........',
    '###........',
    '###........',
    '###........',
    '###........',
  ],
  E: [
    '###########',
    '###########',
    '###........',
    '###........',
    '###........',
    '#########..',
    '#########..',
    '###........',
    '###........',
    '###........',
    '###........',
    '###########',
    '###########',
  ],
  R: [
    '#########..',
    '##########.',
    '###....####',
    '###.....###',
    '###.....###',
    '###....####',
    '##########.',
    '#########..',
    '###..###...',
    '###...###..',
    '###....###.',
    '###.....###',
    '###.....###',
  ],
};

const LOGO_W = 176;
const LOGO_H = 88;
const EXTRUDE = 2;
const LOGO_SCALE = 2;

// Room the silhouette needs on each side: outline + keyline on the left, and on
// the right the extrude as well.
const MARGIN_L = 2;
const MARGIN_R = EXTRUDE + 2;

// Optical gutters. A letter grows by EXTRUDE + outline + keyline to its right, so
// the advance has to clear all of that before the next letter starts or the word
// fuses into one red brick.
const SUPER_GAP = 8;
const MARIO_GAP = 5;
const SUPER_Y = 4;
const MARIO_Y = 40;

function blank(w, h) {
  const a = [];
  for (let y = 0; y < h; y++) a.push(new Uint8Array(w));
  return a;
}

function inkSpan(mask) {
  let a = Infinity;
  let b = -Infinity;
  for (const row of mask) {
    const i = row.indexOf('#');
    if (i < 0) continue;
    const j = row.lastIndexOf('#');
    if (i < a) a = i;
    if (j > b) b = j;
  }
  return [a, b];
}

// Pack a word by each letter's real ink, not by a fixed advance, so the gutter is
// the same everywhere regardless of how wide the individual glyph is drawn.
function layoutWord(set, word, gap) {
  const spans = [];
  let ink = 0;
  for (const ch of word) {
    const span = inkSpan(set[ch]);
    spans.push(span);
    ink += (span[1] - span[0] + 1) * LOGO_SCALE;
  }
  const total = ink + gap * (word.length - 1);
  const avail = LOGO_W - MARGIN_L - MARGIN_R;
  if (total > avail) throw new Error(`font: "${word}" is ${total}px, only ${avail}px fit`);
  let pen = MARGIN_L + Math.floor((avail - total) / 2);
  const xs = [];
  for (let i = 0; i < word.length; i++) {
    xs.push(pen - spans[i][0] * LOGO_SCALE);
    pen += (spans[i][1] - spans[i][0] + 1) * LOGO_SCALE + gap;
  }
  return xs;
}

// Returns one box per letter so the glint pass can treat a letter as a letter
// rather than as a field of pixels.
function stampWord(grid, set, word, xs, y0) {
  const boxes = [];
  for (let i = 0; i < word.length; i++) {
    const mask = set[word[i]];
    const ox = xs[i];
    let x0 = LOGO_W;
    let x1 = -1;
    for (let my = 0; my < mask.length; my++) {
      for (let mx = 0; mx < mask[my].length; mx++) {
        if (mask[my][mx] !== '#') continue;
        for (let dy = 0; dy < LOGO_SCALE; dy++) {
          for (let dx = 0; dx < LOGO_SCALE; dx++) {
            const px = ox + mx * LOGO_SCALE + dx;
            const py = y0 + my * LOGO_SCALE + dy;
            if (px >= 0 && py >= 0 && px < LOGO_W && py < LOGO_H) {
              grid[py][px] = 1;
              if (px < x0) x0 = px;
              if (px > x1) x1 = px;
            }
          }
        }
      }
    }
    if (x1 >= x0) boxes.push({ x0, x1, y0, y1: y0 + mask.length * LOGO_SCALE - 1 });
  }
  return boxes;
}

const SUPER_X = layoutWord(SMALL, 'SUPER', SUPER_GAP);
const MARIO_X = layoutWord(BIG, 'MARIO', MARIO_GAP);

// The shine is a leaning band, so what matters is not x but x + y*0.5. Measure
// that quantity across the real face pixels once, here, instead of guessing a
// start and end — a guessed range spends its first and last frames rendering the
// resting logo, which is how a "sweep" ends up opening with two byte-identical
// frames.
const SHINE_BAND = (() => {
  const g = blank(LOGO_W, LOGO_H);
  stampWord(g, SMALL, 'SUPER', SUPER_X, SUPER_Y);
  stampWord(g, BIG, 'MARIO', MARIO_X, MARIO_Y);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!g[y][x]) continue;
      const v = x + y * 0.5;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return [lo, hi];
})();

// `sweep` is the x of a diagonal shine band travelling across the faces; null
// builds the resting logo.
function buildLogoRows(sweep = null) {
  const face = blank(LOGO_W, LOGO_H);
  stampWord(face, SMALL, 'SUPER', SUPER_X, SUPER_Y);
  stampWord(face, BIG, 'MARIO', MARIO_X, MARIO_Y);

  const F = (x, y) =>
    x >= 0 && y >= 0 && x < LOGO_W && y < LOGO_H && face[y][x] === 1;

  const ext = blank(LOGO_W, LOGO_H);
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!face[y][x]) continue;
      for (let k = 1; k <= EXTRUDE; k++) {
        const px = x + k;
        const py = y + k;
        if (px < LOGO_W && py < LOGO_H && !face[py][px]) ext[py][px] = 1;
      }
    }
  }

  const solid = (x, y) =>
    x >= 0 && y >= 0 && x < LOGO_W && y < LOGO_H && (face[y][x] === 1 || ext[y][x] === 1);

  // Everything the outside air can touch. A counter (the bowl of P, the hole in
  // O, the crook of an A) is enclosed and never appears here, which is what stops
  // highlights from being dropped inside enclosed shapes.
  const reachable = [];
  for (let y = 0; y < LOGO_H; y++) reachable.push(new Uint8Array(LOGO_W));
  const air = [];
  for (let i = 0; i < LOGO_W; i++) air.push([i, 0], [i, LOGO_H - 1]);
  for (let i = 0; i < LOGO_H; i++) air.push([0, i], [LOGO_W - 1, i]);
  while (air.length) {
    const [x, y] = air.pop();
    if (x < 0 || y < 0 || x >= LOGO_W || y >= LOGO_H) continue;
    if (reachable[y][x] || solid(x, y)) continue;
    reachable[y][x] = 1;
    air.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const open = (x, y) =>
    x >= 0 && y >= 0 && x < LOGO_W && y < LOGO_H && reachable[y][x] === 1;

  // Consecutive face pixels walking in (dx, dy) before leaving the letter.
  const run = (x, y, dx, dy) => {
    let n = 0;
    while (n < 8 && F(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };

  const get = (grid, x, y) =>
    x >= 0 && y >= 0 && x < LOGO_W && y < LOGO_H && grid[y][x] === 1;
  const near = (grid, x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (get(grid, x + dx, y + dy)) return true;
      }
    }
    return false;
  };

  // The specular traces the wordmark's upper-left contour.
  //
  // It used to be one 2x2 block per letter, dropped at that letter's topmost-then-
  // leftmost pixel. Ten letters, ten identical squares, forty pixels — 0.26% of
  // the image — five of them sitting at y=4 and five at y=40, which is to say the
  // same badge stamped at the same height on the curve of an S, the round of an O,
  // the point of an A and the flat top of an I. The brightest slot in the palette
  // was decoration, not light.
  //
  // Now: a face pixel with air above it AND air to its left is where the lamp
  // first touches the form. Every such pixel seeds a walk along the contour it
  // belongs to — following the letter's own edge, whichever way it runs — and the
  // walk lays down two pixels of specular and three of falloff. That finds 26
  // places on the wordmark instead of 10, and they are where the form actually
  // turns: the big O's highlight steps down and left around its bowl (148,40 ->
  // 144,42 -> 142,44 -> 140,46), the A's starts on the apex and chases the left
  // leg down six steps to y=58, the S's staircases down its top-left
  // shoulder, U and M get one on each of their two uprights rather than one for
  // the letter, and the ledges that open up where the M's feet and the I's bottom
  // bar flare out get one too, because those face the lamp as squarely as the top
  // of the letter does.
  const glint = [];
  for (let y = 0; y < LOGO_H; y++) glint.push(new Uint8Array(LOGO_W));
  const rim = (x, y) => F(x, y) && !F(x - 1, y) && !F(x, y - 1);
  const litEdge = (x, y) => F(x, y) && (!F(x - 1, y) || !F(x, y - 1)) && (open(x - 1, y) || open(x, y - 1));
  const walked = new Set();
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (!rim(x, y) || !open(x - 1, y - 1) || walked.has(y * LOGO_W + x)) continue;
      let px = x;
      let py = y;
      for (let n = 0; n < 5; n++) {
        if (!litEdge(px, py) || walked.has(py * LOGO_W + px)) break;
        walked.add(py * LOGO_W + px);
        glint[py][px] = n < 2 ? 7 : 6;
        // Follow the edge: right along a top run, down along a left run, and
        // diagonally out where the contour turns — which is how a curve gets a
        // curved highlight instead of a horizontal dash.
        if (litEdge(px + 1, py) && !F(px + 1, py - 1)) px += 1;
        else if (litEdge(px, py + 1) && !F(px - 1, py + 1)) py += 1;
        else if (litEdge(px + 1, py + 1)) { px += 1; py += 1; }
        else break;
      }
    }
  }

  const outline = blank(LOGO_W, LOGO_H);
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) {
      if (solid(x, y)) continue;
      for (let dy = -1; dy <= 1 && !outline[y][x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (solid(x + dx, y + dy)) {
            outline[y][x] = 1;
            break;
          }
        }
      }
    }
  }

  const rows = [];
  for (let y = 0; y < LOGO_H; y++) {
    let row = '';
    for (let x = 0; x < LOGO_W; x++) {
      if (face[y][x]) {
        // Tone by the shorter of the two AXIS-ALIGNED runs. Measuring along the
        // diagonal instead puts a 45-degree streak across every vertical stem —
        // it reads as a scratch, not a bevel. With this measure a stem ramps
        // left-to-right, a bar ramps top-to-bottom, and a true 45-degree stroke
        // still gets a symmetric ramp because both runs match along it.
        const litL = run(x, y, -1, 0);
        const litU = run(x, y, 0, -1);
        const lit = Math.min(litL, litU);
        const away = Math.min(run(x, y, 1, 0), run(x, y, 0, 1));
        // "There is nothing above me / nothing to my left" is not the same as
        // "I face the lamp". The inner-left edge of the right stem of O, U, P and
        // M has nothing to its left either — but what is to its left is the
        // COUNTER, an enclosed hole facing away from the light. Highlighting it
        // gives O two competing highlights and flattens the letter into a ribbon,
        // so the empty side has to be air that reaches the outside world.
        const exteriorLit = open(x - 1, y) || open(x, y - 1);
        // Second-order highlight, one pixel further in. `lit === 1` means the
        // single face pixel between us and the edge, so the air test has to look
        // two steps out — testing one step can never be true here, which is how
        // slot 5 quietly became a palette entry that nothing used.
        const exteriorLit2 =
          (litL === 1 && open(x - 2, y)) || (litU === 1 && open(x, y - 2));
        // Resting tone first, ALWAYS. The shine is a light passing over a solid
        // object, so it may only lift tones that already belong to the lit body
        // of the form (4, 5, 6). Promoting every pixel it touches — including
        // the slot-2/slot-3 edges that carry the letter's silhouette — melts the
        // wordmark into a white slab for the duration of the pass.
        let tone;
        if (away === 0) tone = '2';
        else if (away === 1) tone = '3';
        else if (glint[y][x]) tone = String(glint[y][x]);
        else if (lit === 0 && exteriorLit) tone = '6';
        else if (lit === 1 && exteriorLit2) tone = '5';
        else tone = '4';
        if (sweep != null && (tone === '4' || tone === '5' || tone === '6')) {
          const d = Math.abs(x - sweep + y * 0.5);
          if (d < 6) tone = '7';
          else if (d < 11) tone = '6';
        }
        row += tone;
        continue;
      }
      if (ext[y][x]) {
        let under = false;
        for (let k = 1; k <= EXTRUDE + 1 && !under; k++) under = F(x, y - k);
        row += under ? '1' : '8';
        continue;
      }
      if (outline[y][x]) {
        row += '0';
        continue;
      }
      // The keyline is an OUTER glow — it exists so the silhouette survives on a
      // black title card. Inside a counter there is no silhouette to protect, and
      // stamping it there fills the bowls of P and R and the triangle of A with
      // cream. Guard it with the same air test the specular uses: an enclosed
      // pixel falls through to transparent and the counter stays a clean black
      // hole.
      if (!near(outline, x, y) || !open(x, y)) {
        row += '.';
        continue;
      }
      // Outer keyline picks up the same upper-left light as the faces do.
      const lifted =
        get(outline, x + 1, y) ||
        get(outline, x, y + 1) ||
        get(outline, x + 1, y + 1);
      row += lifted ? '9' : 'a';
    }
    rows.push(row);
  }
  return rows;
}

const LOGO_REST_ROWS = buildLogoRows();

// A glint crosses the wordmark once every 196 ticks — 3.3s: 150 ticks of rest,
// then a leaning band travelling left to right over 23 frames of 2 ticks each.
//
// The band is ~12px wide (d < 6 for the specular core, d < 11 for the falloff),
// so the steps have to be SHORTER than the band or the glint teleports its own
// width between frames and reads as a row of disconnected flashes. 8px steps
// against a 12px core give four pixels of overlap every frame, which is what
// makes it travel instead of strobe.
//
// The sweep runs from one band-width before the first ink to one past the last,
// measured off SHINE_BAND rather than guessed. Then every candidate is compared
// against the resting logo AND against its predecessor, and anything too close to
// either is dropped.
//
// "Too close" used to mean byte-identical, which is a test almost nothing fails.
// It let through a first frame differing from rest by 42 pixels of 15488 — 0.27%
// — and a last frame differing from rest by 56, in a sweep whose interior steps
// run 1.7 to 3.4% each. Both got two ticks, about 33ms, of a drawing the eye
// cannot separate from the resting logo: two of twenty-six authored frames that
// cost memory and bought nothing. The threshold is now 0.8% of the image — about
// 124 pixels — which drops both. What is left is 24 frames whose smallest step is
// 1.0% and whose wrap back to rest is 1.0%, so every frame you can see arrive.
const SHINE_HALF = 11;
const SHINE_STEP = 8;
const SHINE_MIN_DELTA = 0.008 * LOGO_W * LOGO_H;

function rowsDiff(a, b) {
  let n = 0;
  for (let y = 0; y < LOGO_H; y++) {
    for (let x = 0; x < LOGO_W; x++) if (a[y][x] !== b[y][x]) n++;
  }
  return n;
}

const shineRows = [LOGO_REST_ROWS];
for (let s = SHINE_BAND[0] - SHINE_HALF; s <= SHINE_BAND[1] + SHINE_HALF; s += SHINE_STEP) {
  const rows = buildLogoRows(s);
  if (rowsDiff(rows, LOGO_REST_ROWS) < SHINE_MIN_DELTA) continue;
  if (rowsDiff(rows, shineRows[shineRows.length - 1]) < SHINE_MIN_DELTA) continue;
  shineRows.push(rows);
}

const shineFrames = [makeSprite(LOGO_REST_ROWS, LOGO_PAL, { name: 'logo.superMario.rest' })];
for (let i = 1; i < shineRows.length; i++) {
  shineFrames.push(makeSprite(shineRows[i], LOGO_PAL, { name: `logo.shine#${i - 1}` }));
}

const shine = new Anim(shineFrames, [150, ...new Array(shineFrames.length - 1).fill(2)]);

export const LOGO = {
  // Live: screens.js draws LOGO.sprite, so the glint has to ride on the sprite.
  // 150 ticks of rest then a 46-tick sweep — the wordmark is at rest more than
  // three quarters of the time, which is what makes the pass read as an event
  // rather than as a strobing background effect.
  sprite: new LiveSprite(shine, { name: 'logo.superMario' }),
  shine,
};

// ---------------------------------------------------------------------------
// Prebuilt HUD / menu word runs
// ---------------------------------------------------------------------------

export const LABELS = {
  mario: text('MARIO'),
  world: text('WORLD'),
  time: text('TIME'),
  score: text('SCORE'),
  top: text('TOP'),
  lives: text('LIVES'),
  gameOver: text('GAME OVER'),
  timeUp: text('TIME UP'),
  pushStart: text('PUSH START BUTTON'),
  copyright: text('©2026 HOMAGE WORKS'),
};

export const SAMPLE = {
  upper: text('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  digits: text('0123456789'),
  punct: text(" .,'!?-x×©:/()"),
  hud: text('MARIO 000000  WORLD 1-1  TIME 400'),
  // The dark ramp gets its own HUD line so the sheet exercises the one thing it
  // is for — a full string of it over a light ground. Sampling the dark font in
  // white ink is what hid the inverted drop shadow for two review rounds.
  dark: text('MARIO 000000  WORLD 1-1  TIME 400', true),
  darkUpper: text('ABCDEFGHIJKLMNOPQRSTUVWXYZ', true),
  light: text('PUSH START BUTTON'),
};
