// Typography + title screen.
//
// Everything here is authored as string-row pixel data. Letterforms are stored as
// 6x7 masks that fill the 8x8 cell edge to edge (ink in columns 0-6 once the drop
// shadow is added, one clean gutter column at 7); a deterministic bevel pass turns
// each mask into an 8x8 sprite with a lit upper-left flank, a body tone, a shaded
// lower-right flank and a hard drop shadow. Doing the shading in one place is what
// keeps 47 glyphs looking like one typeface instead of 47 hand-shaded accidents —
// but only if the bevel understands the *form*, so it resolves 1px strokes against
// the glyph's own centre rather than blowing every diagonal out to pure white.

import { makeSprite, Anim } from '../../core/gfx.js';

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
// survives on any ground. White runs 190 / 232 / 255 luma inside the letter with
// the shadow down at 12; the lit tone is also the most common one, so a word
// still reads as white type with a cool bevel rather than grey type with a rim.
// Body must NOT equal the lit tone: a palette slot that renders the same colour
// as its neighbour is a slot that does not exist, and the whole bevel collapses
// to a flat cutout.
export const FONT_PAL_WHITE = ['#0b0b14', '#b4bed9', '#e2e8f7', '#ffffff'];

// For text over light tiles (sand, brick, sky). Same construction, inverted: a
// solid warm-brown mass whose three internal tones run 34 / 59 / 117 luma, with
// the drop shadow BELOW all of them at 18. Over #5c94fc sky (luma 143) or sand
// the whole letter is dark against light, so legibility comes from the mass and
// the bevel only has to survive close inspection — the previous ramp put a
// 160-luma tan highlight and a 57-luma shadow either side of a 37-luma body,
// which is a halo with the light coming from everywhere at once.
export const FONT_PAL_DARK = ['#1b1005', '#2e2010', '#4e3819', '#94703a'];

// ---------------------------------------------------------------------------
// Letterform masks — 6 wide, 7 tall, drawn at (0,0) of the 8x8 cell
// ---------------------------------------------------------------------------

const MASK_W = 6;
const MASK_H = 7;

const MASKS = {
  A: ['..##..', '.#..#.', '#....#', '######', '#....#', '#....#', '#....#'],
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

  // A plain open oval with one centred pip. At 8px there is no room for a
  // diagonal slash — it fills the counter and the score reads as six blobs.
  0: ['.####.', '#....#', '#....#', '#.##.#', '#....#', '#....#', '.####.'],
  1: ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  2: ['.####.', '#....#', '.....#', '...##.', '..#...', '.#....', '######'],
  3: ['#####.', '.....#', '.....#', '.####.', '.....#', '.....#', '#####.'],
  4: ['....#.', '...##.', '..#.#.', '.#..#.', '######', '....#.', '....#.'],
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
  // different marks, not one mark at two heights. The centre is TWO rows deep so
  // those pixels have vertical neighbours and the axis vote can resolve them to
  // body — a mark whose histogram is three white and three grey belongs to no
  // typeface, it is a sparkle.
  '×': ['......', '.#..#.', '..##..', '..##..', '.#..#.', '......', '......'],
  // 5-wide ring with a notch at the right of the middle row. The inner serif of
  // a real (c) is mud at 8px; the notch is what survives.
  '©': ['......', '.####.', '#....#', '#.##..', '#....#', '.####.', '......'],
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
//    ink pixels therefore adds a signed ramp: +RAMP at the end nearest the lamp
//    (top for a stem, left for a bar) falling to -RAMP at the far end. A corner
//    belongs to two runs and picks up both offsets, which cancel — so the corner
//    stays put and only the shafts either side of it ramp.
//
// 3. DIAGONAL CHAINS. Shading a diagonal from its immediate neighbours flickers
//    along a continuous stroke (N used to run 2,3,1,2 down its leg and X had a
//    pure white pixel at its bottom-left terminal, the point furthest from the
//    lamp). Instead every maximal diagonal stroke is traced first and toned by
//    POSITION along the chain — top third lit, middle body, bottom third shaded —
//    so it ramps once, monotonically, over its whole length. A chain pixel right
//    of the glyph's centre can never take the lit tone, which is what stops K's
//    right-hand arm terminal from out-lighting H's stem.
const RAMP = 1.5;

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
    // A stroke running down-right has both its flanks turned edge-on to an
    // upper-left lamp, so it grazes; a stroke running up-right presents one
    // flank square to it. That is why the leg of N and the leg of Z should not
    // be the same brightness even though both are 1px diagonals.
    const graze = dy === 1 ? 0.6 : 0;
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
        // A chain that spans the glyph's whole width IS the glyph (the slash,
        // Z's spine) and has no left-hand stem to out-light, so it keeps its
        // full ramp. A chain that is only part of the width is an ARM — K's
        // upper arm, A's legs — and an arm hanging off the right may not take
        // the lit tone, or a right-hand terminal ends up brighter than the stem
        // it grows out of. Because these chains are walked top-first and a
        // rising diagonal's top end is also its rightmost, the clamp can only
        // ever bite the bright end: the ramp stays monotonic.
        let lo = Infinity;
        let hi = -Infinity;
        let sumY = 0;
        for (const [qx, qy] of chain) {
          if (qx < lo) lo = qx;
          if (qx > hi) hi = qx;
          sumY += qy;
        }
        const isArm = hi - lo + 1 < 0.75 * (maxX - minX + 1);
        // How high the stroke sits in the glyph. Position along the chain alone
        // makes the top of EVERY diagonal lit, which drops a white pixel into
        // the bottom-left arm of an X — the point furthest from the lamp.
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
          const v = (i < L / 3 ? 1 : i < (2 * L) / 3 ? 0 : -1) + lift - graze;
          let t = v >= 0.5 ? '3' : v <= -0.5 ? '1' : '2';
          if (t === '3' && isArm && qx + 0.5 > cx) t = '2';
          chainTone.set(k, t);
        }
      }
    }
  }
  // Where two strokes cross (the waist of an X, the elbow of a K) the pixel is
  // interior to both, so it is body — never the lit end of one arm and the dark
  // end of the other at the same time.
  for (const [k, n] of claims) if (n > 1) chainTone.set(k, '2');

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
        row += chainTone.get(k);
        continue;
      }
      const up = on(x, y - 1);
      const down = on(x, y + 1);
      const left = on(x - 1, y);
      const right = on(x + 1, y);

      let tone = 0;
      if (!up && !down) tone += y + 0.5 < cy ? 1 : y + 0.5 > cy ? -1 : 0;
      else if (!up) tone += 1;
      else if (!down) tone -= 1;

      if (!left && !right) tone += x + 0.5 < cx ? 1 : x + 0.5 > cx ? -1 : 0;
      else if (!left) tone += 1;
      else if (!right) tone -= 1;

      const rh = runH[k];
      if (rh && rh[0] >= 4) tone += RAMP * (1 - (2 * rh[1]) / (rh[0] - 1));
      const rv = runV[k];
      if (rv && rv[0] >= 4) tone += RAMP * (1 - (2 * rv[1]) / (rv[0] - 1));

      row += tone > 0.5 ? '3' : tone < -0.5 ? '1' : '2';
    }
    out.push(row);
  }
  return out;
}

// 8x8 cell: shaded letterform at (0,0), hard drop shadow at (1,1). That puts ink
// in columns 0-6 and leaves column 7 as the sidebearing, so a string sits on its
// origin instead of 1px to the right of it and the rhythm is symmetric.
// The shadow is clipped to the exterior of the letter — without that, every
// counter (A B D O P Q R 0 4 6 8 9) silts up and the face turns into a blob.
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

export const COIN_PAL = ['#1a1008', '#7a4f00', '#b8891a', '#e8c74a', '#ffe9a0', '#ffffff'];

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
// That gives twelve drawings with no repeats, and the specular stays pinned to
// the upper-left through all of them because the lamp does not rotate with the
// coin.

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

export const MARIO_HEAD_PAL = [
  '#1a1008',
  '#8c1000',
  '#d02818',
  '#e8a05c',
  '#ffd8a0',
  '#4a2408',
];

// Six slots, every one of them load-bearing: crown (2) over cap shadow (1), a
// hard brim line across row 3, a skin block that turns from lit (4) to shaded (3)
// left to right, two 1px eyes and a 3px moustache in (5). The brim is what makes
// it a head at 8px — without it the cap and the face merge into a red mushroom —
// and the eyes sit a clear row above the moustache so the lower face reads as a
// moustache rather than a beard.
const MARIO_HEAD_ROWS = [
  '..0000..',
  '.022210.',
  '02222210',
  '01111110',
  '.0454530',
  '.0444330',
  '.0355530',
  '..0000..',
];

// Six slots, all of them carrying real area: outline, shadow red, red, light red,
// hot rim, white specular. No cream and no skin tone anywhere — the pointer must
// not share a palette family with a face.
export const CURSOR_PAL = [
  '#1a1008',
  '#7a1005',
  '#d02818',
  '#f0503c',
  '#ff9c80',
  '#ffffff',
];

// The pointer used to be a dome on a stalk, which is a mushroom, which is what
// GLYPH.marioHead already is — two 8x8 red-over-lighter icons doing two different
// jobs on the same screen. So it is a chevron now: a solid right-pointing wedge
// with a flat back, an outline all the way round, a white top flank and a dark
// red underside. At 8px there is nothing else it can be read as.
//
// The cycle is a pump along the pointer's own axis, not a translate. The wedge
// draws in (REST -> CONTRACT), then lances forward a pixel past its rest length
// (EXPAND) with the specular running all the way out to the tip, then recoils
// with fat shoulders and a dimming nose (RECOIL). Mass changes on six of the
// eight rows between the extremes and the highlight travels the length of the
// form, so it breathes instead of twitching sideways.

// Rest: back at x1, tip at x5. This is the sprite the menus draw statically.
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

export const GLYPH = {
  coin: coinA,
  // One revolution in 48 ticks. Twelve distinct drawings, no frame reused, and
  // the order walks the angle monotonically instead of ping-ponging back.
  coinAnim: new Anim(
    [
      coinA, // 0    obverse, face-on
      coinBor, // 35   obverse, rim right
      coinCor, // 60   obverse, rim right
      coinDr, // 90   edge-on
      coinCvr, // 120  reverse, rim right
      coinBvr, // 145  reverse, rim right
      coinA2, // 180  reverse, face-on
      coinBvl, // 215  reverse, rim left
      coinCvl, // 240  reverse, rim left
      coinDl, // 270  edge-on
      coinCol, // 300  obverse, rim left
      coinBol, // 325  obverse, rim left
    ],
    4
  ),
  marioHead: makeSprite(MARIO_HEAD_ROWS, MARIO_HEAD_PAL, { name: 'glyph.marioHead' }),
  cursor,
  cursorAnim: new Anim([cursor, cursorBig, cursorRecoil, cursorSmall], [16, 5, 5, 5]),
};

// ---------------------------------------------------------------------------
// SUPER MARIO title logo — 176 x 88
// ---------------------------------------------------------------------------
//  0 outline   1 extrude (underside)   8 extrude (right side)
//  2 deepest face edge  3 dark  4 mid  5 light  6 highlight  7 specular
//  9 outer keyline (lit)   a outer keyline (shaded)
//
// The keyline matters: a pure black outline vanishes on the black title
// background, and the whole word-mark loses its silhouette. The two extrude tones
// are lifted well clear of the outline — the extrude is a lit surface catching
// bounce, not a second shadow, or the letters just sit on a fat black shelf.

export const LOGO_PAL = [
  '#000000',
  '#5a1408',
  '#7a1005',
  '#a81c0c',
  '#d02818',
  '#f05a3c',
  '#ff9c80',
  '#ffffff',
  '#7a2410',
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

function stampWord(grid, set, word, xs, y0) {
  for (let i = 0; i < word.length; i++) {
    const mask = set[word[i]];
    const ox = xs[i];
    for (let my = 0; my < mask.length; my++) {
      for (let mx = 0; mx < mask[my].length; mx++) {
        if (mask[my][mx] !== '#') continue;
        for (let dy = 0; dy < LOGO_SCALE; dy++) {
          for (let dx = 0; dx < LOGO_SCALE; dx++) {
            const px = ox + mx * LOGO_SCALE + dx;
            const py = y0 + my * LOGO_SCALE + dy;
            if (px >= 0 && py >= 0 && px < LOGO_W && py < LOGO_H) grid[py][px] = 1;
          }
        }
      }
    }
  }
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
        const up = F(x, y - 1);
        const left = F(x - 1, y);
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
        // Specular only on a convex corner that is open to the sky: the pixel
        // diagonally up-left must connect to outside air (so counters can never
        // fire) and the stroke must be thick enough to carry a highlight.
        const spec =
          !up &&
          !left &&
          !F(x + 1, y - 1) &&
          !F(x + 2, y - 1) &&
          !F(x - 1, y + 1) &&
          !F(x - 1, y + 2) &&
          open(x - 1, y - 1) &&
          run(x, y, 1, 1) >= 3;
        // Resting tone first, ALWAYS. The shine is a light passing over a solid
        // object, so it may only lift tones that already belong to the lit body
        // of the form (4, 5, 6). Promoting every pixel it touches — including
        // the slot-2/slot-3 edges that carry the letter's silhouette — melts the
        // wordmark into a white slab for the duration of the pass.
        let tone;
        if (away === 0) tone = '2';
        else if (away === 1) tone = '3';
        else if (spec) tone = '7';
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

// A glint crosses the wordmark once every ~2.6s: 150 ticks of rest, then a
// leaning band travelling left to right.
//
// The band is ~12px wide (d < 6 for the specular core, d < 11 for the falloff),
// so the steps have to be SHORTER than the band or the glint teleports its own
// width between frames and reads as a row of disconnected flashes. 8px steps
// against a 12px core give four pixels of overlap every frame, which is what
// makes it travel instead of strobe.
//
// The sweep runs from one band-width before the first ink to one past the last,
// measured off SHINE_BAND rather than guessed. Then every candidate is compared
// against the resting logo AND against its predecessor, and anything that comes
// out identical is dropped: a "sweep" whose opening frames are byte-for-byte the
// resting logo is not an animation, it is padding, and no amount of arithmetic
// in the range calculation can be trusted to prove it never happens.
const SHINE_HALF = 11;
const SHINE_STEP = 8;

const shineRows = [LOGO_REST_ROWS];
for (let s = SHINE_BAND[0] - SHINE_HALF; s <= SHINE_BAND[1] + SHINE_HALF; s += SHINE_STEP) {
  const rows = buildLogoRows(s);
  const sig = rows.join('\n');
  if (sig === LOGO_REST_ROWS.join('\n')) continue;
  if (sig === shineRows[shineRows.length - 1].join('\n')) continue;
  shineRows.push(rows);
}

const logoSprite = makeSprite(LOGO_REST_ROWS, LOGO_PAL, { name: 'logo.superMario' });
const shineFrames = [logoSprite];
for (let i = 1; i < shineRows.length; i++) {
  shineFrames.push(makeSprite(shineRows[i], LOGO_PAL, { name: `logo.shine#${i - 1}` }));
}

export const LOGO = {
  sprite: logoSprite,
  shine: new Anim(shineFrames, [150, ...new Array(shineFrames.length - 1).fill(2)]),
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
  // The title screen ground is black, so the menu line is drawn in the white
  // ramp. FONT_DARK is for text over light tiles (sand, brick, sky) and is
  // sampled by the FONT_DARK sheet itself — demoing it on black is what hid the
  // inverted-shadow bug in the first place.
  dark: text('PUSH START BUTTON'),
};
