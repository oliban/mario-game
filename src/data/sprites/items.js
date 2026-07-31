// items.js — collectibles, pickups and one-shot effects.
// Original pixel art. Faithful SMB silhouettes, every pixel authored here.
// Light source is UPPER-LEFT on every solid form.

import { makeSprite, Anim } from '../../core/gfx.js';
import { INK } from '../palette.js';

const OUT = INK.outline;

/* ------------------------------------------------------------------ *
 * MUSHROOMS
 * Shared geometry, two palettes — exactly how the NES did it.
 *   0 outline  1 cap shadow  2 cap mid  3 cap lit  4 cap rim
 *   5 spot shade  6 spot white  7 stem shade  8 stem mid  9 stem lit
 *   a cap specular
 * ------------------------------------------------------------------ */

// Cap: 1px red rim on BOTH shoulders (rows 6-8) so the spots never touch the
// outline, an 'a' specular arc walking the upper-left curve (rows 1-3), and a
// row-9 underside that bows instead of ruling a straight line. Every spot
// shadow (slot 5) is a 2px run or longer — a single pixel of shade reads as
// chipped stone rather than as the underside of a cream dot.
//
// A: cap lifted. A slot-1 band at row 10 is the cap's own shadow thrown across
// the top of the stem, so the dome visibly floats off it.
const MUSHROOM_UP = [
  '.....000000.....',
  '...0aa4333220...',
  '..0a4333332220..',
  '.0a433366222210.',
  '.04333666652210.',
  '0333336665522210',
  '0266653322666510',
  '0266652222666510',
  '0266552222266510',
  '0111122222211110',
  '0000111111110000',
  '...0998888770...',
  '...0900880070...',
  '...0900880070...',
  '...0788887770...',
  '...0000000000...',
];

// B: cap settled. The whole dome drops a row onto the stem (the shadow band is
// gone — the two forms are in contact), the crown spreads two pixels wider as
// it squashes, the stem loses a row underneath it and the eyes squint to a 1px
// slit. Nothing is a translation: the silhouette changes at the top AND the
// bottom, and the face changes with it.
const MUSHROOM_DOWN = [
  '................',
  '....00000000....',
  '...0aa4333220...',
  '..0a4333332220..',
  '.0a433366222210.',
  '.04333666652210.',
  '0333336665522210',
  '0266653322666510',
  '0266652222666510',
  '0266552222266510',
  '0111122222211110',
  '0000998888770000',
  '...0998888770...',
  '...0900880070...',
  '...0788887770...',
  '...0000000000...',
];

// Slot 5 is the shadow side of a cream spot, so it is a warm tint of the spot
// itself — a neutral grey was the only desaturated hue on an otherwise fully
// warm sprite and read as chipped stone at 1x.
const MUSH_SUPER_PAL = [
  OUT, '#6b1200', '#b52a10', '#e03a1c', '#ff8b7f',
  '#e8b8a8', '#ffffff', '#9c7038', '#f0cc90', '#fff4d8', '#ffd0c8',
];

const MUSH_1UP_PAL = [
  OUT, '#0b3400', '#077704', '#3caa14', '#85bc2f',
  '#c8dca0', '#ffffff', '#9c7038', '#f0cc90', '#fff4d8', '#cfef96',
];

const mushroom = (pal, name) =>
  new Anim(
    [
      makeSprite(MUSHROOM_UP, pal, { name: `${name}#0` }),
      makeSprite(MUSHROOM_DOWN, pal, { name: `${name}#1` }),
    ],
    8
  );

export const MUSHROOM_SUPER = { idle: mushroom(MUSH_SUPER_PAL, 'mushroom.super') };
export const MUSHROOM_1UP = { idle: mushroom(MUSH_1UP_PAL, 'mushroom.1up') };

/* ------------------------------------------------------------------ *
 * FIRE FLOWER — 4-frame palette cycle through the blossom ramp.
 *   0 outline  1 petal dark  2 petal mid  3 petal lit  4 petal spec
 *   5 face dark  6 face white  7 stem dark  8 stem mid  9 stem lit
 *   a bud accent
 * ------------------------------------------------------------------ */

// The crown is ONE dome (rows 0-1, no 12 o'clock notch — that notch turned the
// blossom into a pair of pointed ears). The petals are separated at 10 and 2
// o'clock instead, by the slot-0 grooves at row 2 cols 4 and 11. The white face
// plate is an octagon at rows 3-6 x cols 5-10 — half the blossom's width, so a
// 2px petal ring survives above, below and on both flanks — with 1x2 pupils at
// cols 6 and 9. Light upper-left: slot 4 walks the 10 o'clock rim.
const FLOWER_0 = [
  '.....000000.....',
  '....04333220....',
  '..040333322010..',
  '.04333555522210.',
  '0433356556522210',
  '0333256556522110',
  '.03322555521110.',
  '..022222211110..',
  '...021111110....',
  '....0000000.....',
  '..00..0980..00..',
  '.09980098008870.',
  '0988700980087770',
  '.0870.0980.0770.',
  '..00..0980..00..',
  '......0000......',
];

// 1: the left leaf cluster lifts a row and the right one droops a row while the
// blossom stays pinned. The two clusters move in OPPOSITE directions, so no
// translation of the sprite can cancel the change.
const FLOWER_1 = [
  '.....000000.....',
  '....04333220....',
  '..040333322010..',
  '.04333555522210.',
  '0433356556522210',
  '0333256556522110',
  '.03322555521110.',
  '..022222211110..',
  '...021111110....',
  '..000000000.....',
  '.099800980......',
  '0988700980..00..',
  '.0870.098008870.',
  '..00..0980087770',
  '......0980.0770.',
  '......0000..00..',
];

// 2: head only. The face plate slides a row down inside a fixed petal ring and
// the pupils ride to rows 5-6, so the blossom looks at its feet. Leaves rest.
const FLOWER_2 = [
  '.....000000.....',
  '....04333220....',
  '..040333322010..',
  '.04333333222210.',
  '0433335555222210',
  '0333256556522110',
  '.03325655651110.',
  '..022255551110..',
  '...021111110....',
  '....0000000.....',
  '..00..0980..00..',
  '.09980098008870.',
  '0988700980087770',
  '.0870.0980.0770.',
  '..00..0980..00..',
  '......0000......',
];

// 3: the mirror of frame 1 — right leaf up, left leaf down — and the head rolls
// a column right: the face plate and both pupils shift one column inside the
// ring and the slot-4 specular walks with them.
const FLOWER_3 = [
  '.....000000.....',
  '....03433220....',
  '..030433322010..',
  '.03433355552210.',
  '0343335655652210',
  '0333335655652110',
  '.03332255552110.',
  '..022222211110..',
  '...021111110....',
  '....0000000.00..',
  '......098008870.',
  '..00..0980087770',
  '.099800980.0770.',
  '0988700980..00..',
  '.0870.0980......',
  '..00..0000......',
];

const FLOWER_GEOM = [FLOWER_0, FLOWER_1, FLOWER_2, FLOWER_3];

const FLOWER_FACE = ['#ffffff', '#1a1008'];
const FLOWER_STEM = ['#14520a', '#0f7a08', '#55c753'];

const flowerPal = (d, m, l, s) => [
  OUT, d, m, l, s, FLOWER_FACE[0], FLOWER_FACE[1],
  FLOWER_STEM[0], FLOWER_STEM[1], FLOWER_STEM[2],
];

const FLOWER_CYCLE = [
  flowerPal('#7c1000', '#c02010', '#ff5030', '#ffb0a0'),
  flowerPal('#7c3800', '#c06000', '#ef9a49', '#ffd8a0'),
  flowerPal('#6d5c00', '#bdac2c', '#e4e594', '#ffffff'),
  flowerPal('#1c6a10', '#4aa81c', '#9ada38', '#e4f8a8'),
];

// Every frame carries its OWN geometry under the colour cycle — leaves that
// counter-rotate, a face that looks down, a head that rolls. Best-shift
// alignment between adjacent frames leaves 43/59/74/70 pixels standing, so the
// motion is in the drawing and not in the palette.
export const FIRE_FLOWER = {
  idle: new Anim(
    FLOWER_CYCLE.map((p, i) => makeSprite(FLOWER_GEOM[i], p, { name: `flower#${i}` })),
    6
  ),
};

/* ------------------------------------------------------------------ *
 * STARMAN — 5-point star. SMB1's star has no boots, so the lower points
 * taper to a pixel instead of wearing mud-brown shoes.
 *   0 outline  1 dark  2 mid  3 lit  4 spec  5 sclera  6 pupil
 * ------------------------------------------------------------------ */

// A: rested. Top point at full length, arms 1 row thick.
const STAR_ROWS_A = [
  '.......030......',
  '......04320.....',
  '......04320.....',
  '.....0433220....',
  '....043332210...',
  '0443333332222110',
  '.04333332222110.',
  '..033552255110..',
  '...0365226510...',
  '...0365226510...',
  '...0322222110...',
  '..0320....0210..',
  '.0320......0210.',
  '0320........0210',
  '.00..........00.',
  '................',
];

// B: squashed. The top point loses a pixel and that mass goes sideways —
// the side arms thicken to two full-width rows and the cheeks push out 1px.
const STAR_ROWS_B = [
  '................',
  '................',
  '.......030......',
  '......04320.....',
  '.....0433220....',
  '0443333332222110',
  '0433333322221110',
  '.03335522551110.',
  '...0365226510...',
  '...0365226510...',
  '...0322222110...',
  '.03320....02110.',
  '.0320......0210.',
  '0320........0210',
  '.00..........00.',
  '................',
];

const starPal = (d, m, l, s) => [OUT, d, m, l, s, '#ffffff', '#101820'];

const STAR_CYCLE = [
  starPal('#8a6a00', '#d8a000', '#fbd000', '#fff8c0'),
  starPal('#9f4a00', '#e07818', '#ef9a49', '#ffe0a8'),
  starPal('#8f8f8f', '#d8d8d8', '#f4f4fc', '#ffffff'),
  starPal('#366d00', '#77b820', '#bdf03c', '#e8ffb0'),
];

// Geometry alternates under the colour cycle: 4-tick holds put the squash at
// 7.5 Hz, so the star visibly pulses rather than strobing in place.
export const STARMAN = {
  idle: new Anim(
    STAR_CYCLE.map((p, i) =>
      makeSprite(i & 1 ? STAR_ROWS_B : STAR_ROWS_A, p, { name: `starman#${i}` })
    ),
    4
  ),
};

/* ------------------------------------------------------------------ *
 * COIN — 4-frame spin: face, three-quarter, edge, three-quarter back.
 * The edge frame is one pixel taller than the rest so the coin reads as
 * stretching through the turn instead of just getting narrower.
 *   0 outline  1 gold shadow  2 gold mid  3 gold lit  4 gold spec
 * ------------------------------------------------------------------ */

const COIN_PAL = [OUT, '#7a5600', '#c08c00', '#f8c800', '#fff4b0'];

// Struck face: outer annulus, a 1px slot-1 ring, a solid slot-3 relief inside
// it. The only specular is the 2x1 run at row 3 cols 5-6 (plus its row-2 cap) —
// no isolated highlight pixels below row 4, so it reads as metal, not damage.
const COIN_FACE = [
  '................',
  '......0000......',
  '.....043320.....',
  '....04433210....',
  '....03111120....',
  '...0331331220...',
  '...0313333120...',
  '...0313333120...',
  '...0213333110...',
  '...0213333110...',
  '...0221331110...',
  '....02111110....',
  '....02211110....',
  '.....021110.....',
  '......0000......',
  '................',
];

const COIN_THREE = [
  '................',
  '......0000......',
  '.....043310.....',
  '....04333210....',
  '....04333210....',
  '....04331210....',
  '....04331210....',
  '....03331210....',
  '....03331210....',
  '....03231210....',
  '....02221110....',
  '....02221110....',
  '.....022110.....',
  '.....011110.....',
  '......0000......',
  '................',
];

const COIN_EDGE = [
  '......0000......',
  '......0430......',
  '......0430......',
  '......0330......',
  '......0330......',
  '......0310......',
  '......0310......',
  '......0310......',
  '......0210......',
  '......0210......',
  '......0210......',
  '......0110......',
  '......0110......',
  '......0110......',
  '......0110......',
  '......0000......',
];

// Coming out of the edge frame the coin shows its BACK: the rim's thickness is
// now visible as a lit band on the left, separated from the back plate by the
// slot-1 seam at col 7. Authored, not a flip — the ramp still runs bright-to-
// dark left-to-right, so the key light never leaves the upper-left.
const COIN_BACK = [
  '................',
  '......0000......',
  '.....043210.....',
  '....04312210....',
  '....04312210....',
  '...043312210....',
  '...043312210....',
  '...043312210....',
  '...033212110....',
  '...033212110....',
  '....03212110....',
  '....02211110....',
  '.....021110.....',
  '.....011110.....',
  '......0000......',
  '................',
];

export const COIN = {
  spin: new Anim(
    [
      makeSprite(COIN_FACE, COIN_PAL, { name: 'coin.face' }),
      makeSprite(COIN_THREE, COIN_PAL, { name: 'coin.three' }),
      makeSprite(COIN_EDGE, COIN_PAL, { name: 'coin.edge' }),
      makeSprite(COIN_BACK, COIN_PAL, { name: 'coin.back' }),
    ],
    [7, 4, 3, 4]
  ),
};

export const COIN_HUD = {
  idle: makeSprite(
    [
      '...00...',
      '..0430..',
      '.043320.',
      '.031320.',
      '.031320.',
      '.012210.',
      '..0110..',
      '...00...',
    ],
    COIN_PAL,
    { name: 'coin.hud' }
  ),
};

/* ------------------------------------------------------------------ *
 * FIREBALL — white-hot core orbiting inside a burning shell.
 *   0 outline  1 ember  2 red  3 orange  4 yellow  5 white-hot
 * ------------------------------------------------------------------ */

const FIRE_PAL = [
  OUT, '#8c1800', '#e04010', '#ff8020', '#ffd040', '#ffffff',
];

// Four AUTHORED frames, no flips. The white-hot core orbits UL -> UR -> LR ->
// LL, but the shell's yellow specular (slot 4) is pinned to the upper-left in
// every frame, so the key light never strobes side to side. The shell deforms
// too — the full-width band walks up the sprite and back down, so the ball
// tumbles instead of being a static bead with a moving decal.
const FB_A = [
  '..0000..',
  '.045530.',
  '04553210',
  '04553220',
  '03332210',
  '03222110',
  '.021110.',
  '..0000..',
];

// Mass rides high; core has swung to the upper right (ringed in orange, not
// yellow — the only yellow stays at cols 1-2).
const FB_B = [
  '.000000.',
  '04433350',
  '04433550',
  '03333550',
  '03222330',
  '.021110.',
  '..0000..',
  '........',
];

// Stretched vertically — the shell fills all eight rows; core low-right.
const FB_C = [
  '..0000..',
  '.043210.',
  '04322110',
  '03222330',
  '03223550',
  '02333550',
  '02333330',
  '.000000.',
];

// Squashed — row 0 empties out and the shell settles a row; core low-left.
const FB_D = [
  '........',
  '..0000..',
  '.044320.',
  '04432210',
  '04553210',
  '04553310',
  '.033210.',
  '..0000..',
];

// The flash cools through the WHOLE ramp: white core, yellow, orange, red,
// then an ember (slot 1) perimeter inside the outline rather than jumping
// straight from orange to black.
const BURST_FLASH = [
  '................',
  '................',
  '................',
  '................',
  '.....013310.....',
  '....01344310....',
  '...0134554310...',
  '...0145555410...',
  '...0134454310...',
  '...0133343310...',
  '....01333210....',
  '.....012210.....',
  '................',
  '................',
  '................',
  '................',
];

const BURST_RING = [
  '................',
  '................',
  '......0110......',
  '....01233210....',
  '...0134224310...',
  '..0134....4310..',
  '..0145....5410..',
  '..0145....5410..',
  '..0145....5410..',
  '..0134....4310..',
  '...0134224310...',
  '....01233210....',
  '......0110......',
  '................',
  '................',
  '................',
];

// Eight comets thrown out of the centre. Each one runs white head -> orange ->
// red -> ember tail pointing back at the origin, and the four diagonals are
// drawn pointing OUTWARD on both sides instead of being copied unmirrored.
const BURST_SPARKS = [
  '.......55.......',
  '.53....44....35.',
  '..32...33...23..',
  '...21......12...',
  '................',
  '................',
  '................',
  '531..........135',
  '420..........024',
  '................',
  '................',
  '................',
  '...12......21...',
  '..23...22...32..',
  '.35....33....53.',
  '.......55.......',
];

export const FIREBALL = {
  spin: new Anim(
    [FB_A, FB_B, FB_C, FB_D].map((r, i) => makeSprite(r, FIRE_PAL, { name: `fireball#${i}` })),
    4
  ),
  burst: new Anim(
    [BURST_FLASH, BURST_RING, BURST_SPARKS].map((r, i) =>
      makeSprite(r, FIRE_PAL, { name: `fbBurst#${i}` })
    ),
    [3, 4, 5],
    false
  ),
};

/* ------------------------------------------------------------------ *
 * SCORE POPUPS — 3x5 numerals, 8px tall sprite, white ink with a
 * hard 1px drop shadow so they stay legible over sky and over black.
 *   0 shadow  1 white  2 lower-edge grey
 * ------------------------------------------------------------------ */

const SCORE_GLYPHS = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['.1.', '11.', '.1.', '.1.', '111'],
  '2': ['111', '..1', '111', '1..', '111'],
  '4': ['101', '101', '111', '..1', '..1'],
  '5': ['111', '1..', '111', '..1', '111'],
  '8': ['111', '101', '111', '101', '111'],
  U: ['101', '101', '101', '101', '111'],
  P: ['111', '101', '111', '1..', '1..'],
};

// Five slots: outline, a three-step vertical body ramp, and a pure-white
// specular. ARCHITECTURE.md §2 wants 2-3 body tones plus a highlight, not two
// tones and a recoloured foot.
//   0 outline  1 top face  2 mid  3 bottom edge  4 specular
const SCORE_PAL = [OUT, '#eef2ff', '#c8d2e8', '#98a4c0', '#ffffff'];

// Every glyph is shaded top-lit — rows 0-1 top face, rows 2-3 mid, row 4
// bottom edge — and the top-left lit pixel of each glyph carries the
// specular, so the numerals have a real ramp rather than a detached pale foot.
const SCORE_RAMP = ['1', '1', '2', '2', '3'];

function scoreSprite(text) {
  const glyphs = [...text].map((c) => {
    const g = SCORE_GLYPHS[c];
    if (!g) throw new Error(`items: no score glyph for ${JSON.stringify(c)}`);
    return g;
  });
  // One spare column each side and two spare rows so the dark can be dilated
  // in all eight directions without clipping.
  const w = glyphs.length * 4 + 1;
  const h = 9;
  const grid = [];
  for (let y = 0; y < h; y++) grid.push(new Array(w).fill('.'));

  glyphs.forEach((g, gi) => {
    const gx = gi * 4 + 1;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        if (g[y][x] === '1') grid[y + 2][gx + x] = SCORE_RAMP[y];
      }
    }
    let placed = false;
    for (let y = 0; y < 5 && !placed; y++) {
      for (let x = 0; x < 3 && !placed; x++) {
        if (g[y][x] === '1') {
          grid[y + 2][gx + x] = '4';
          placed = true;
        }
      }
    }
  });

  // Full 8-neighbour dilation: the old loop only wrote below and below-right,
  // which left every numeral's right edge bare on a white background.
  const lit = grid.map((r) => r.slice());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (lit[y][x] === '.') continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (lit[ny][nx] === '.' && grid[ny][nx] === '.') grid[ny][nx] = '0';
        }
      }
    }
  }
  return makeSprite(grid.map((r) => r.join('')), SCORE_PAL, { name: `score.${text}` });
}

export const SCORES = {
  100: scoreSprite('100'),
  200: scoreSprite('200'),
  400: scoreSprite('400'),
  500: scoreSprite('500'),
  800: scoreSprite('800'),
  1000: scoreSprite('1000'),
  2000: scoreSprite('2000'),
  4000: scoreSprite('4000'),
  5000: scoreSprite('5000'),
  8000: scoreSprite('8000'),
  '1UP': scoreSprite('1UP'),
};

/* ------------------------------------------------------------------ *
 * SPRINGBOARD — 3 compression states. The coil count is constant (8
 * turns); only the pitch changes.
 *
 * All three frames are 16x32 with the base plate pinned to row 31 and the
 * slack padded in as transparent rows at the TOP, so a caller drawing
 * frames[n] at a fixed y sees the plate press DOWN under Mario instead of
 * the whole spring shrinking upward off the ground. One plate width (16)
 * across all three states, so nothing jumps wider on compression.
 *   0 outline  1 steel dark  2 steel mid  3 steel lit  4 steel spec
 *   5 coil dark  6 coil mid  7 coil lit  8 coil spec  9 coil far side
 * ------------------------------------------------------------------ */

const SPRING_PAL = [
  OUT, '#4e4e4e', '#8f8f8f', '#d0d0d8', '#ffffff',
  '#5a1a00', '#bd3c30', '#ef6a40', '#ff8b7f', '#7a2000',
];

// One turn = a lit wire crossing the front, then open rows where you see
// through the helix. The far side of the coil (slot 9) is a 3px stub that
// advances one column per open row through four phases, so the back of the
// wire genuinely descends left-to-right instead of toggling between two
// positions — a dashed centre line is what made this read as a ladder.
const SP_WIRE_A = '..088776665550..';
const SP_WIRE_B = '..077666555550..';
const SP_BACK = ['999...', '.999..', '..999.', '...999'];
const spGap = (i) => `..060${SP_BACK[((i % 4) + 4) % 4]}050..`;

// The step rows carry only the RIGHT end of the front wire, one row below the
// wire itself: the front of each turn visibly descends left-to-right instead
// of ruling a horizontal rung.
const SP_STEP_A = '..060.....6550..';
const SP_STEP_B = '..060.....5550..';

// One plate width for every state. Row 0 of the top plate is steel dark, not
// pure outline, so Mario's feet land on metal rather than on a black bar.
const SP_TOP = ['0111111111111110', '0444333322222110', '0222221111111110', '0000000000000000'];
const SP_BOT = ['0000000000000000', '0333322222111110', '0222111111111110', '0000000000000000'];

// Eight turns in every state — only the pitch changes, so the spring
// genuinely compresses instead of losing coils. `back` runs across the whole
// coil rather than resetting per turn, so the see-through rows only repeat
// every four turns at pitch 3 and every two at pitch 2.
function coil(pitch) {
  const rows = [];
  let back = 0;
  for (let t = 0; t < 8; t++) {
    if (pitch === 1) {
      // Fully compressed: turns alternate front-wire and see-through, so
      // slot 9 survives and the helix does not become a solid striped slab.
      rows.push(t & 1 ? spGap(back++) : SP_WIRE_A);
      continue;
    }
    rows.push(t & 1 ? SP_WIRE_B : SP_WIRE_A);
    if (pitch >= 3) rows.push(t & 1 ? SP_STEP_B : SP_STEP_A);
    for (let k = pitch >= 3 ? 2 : 1; k < pitch; k++) rows.push(spGap(back++));
  }
  return rows;
}

const SP_BLANK = '................';
const spring = (pitch) => {
  const body = [...SP_TOP, ...coil(pitch), ...SP_BOT];
  return [...Array(32 - body.length).fill(SP_BLANK), ...body];
};

export const SPRINGBOARD = {
  frames: [
    makeSprite(spring(3), SPRING_PAL, { name: 'spring.free' }),
    makeSprite(spring(2), SPRING_PAL, { name: 'spring.mid' }),
    makeSprite(spring(1), SPRING_PAL, { name: 'spring.low' }),
  ],
};

/* ------------------------------------------------------------------ *
 * CASTLE AXE — 3-frame specular sweep across the steel.
 *   0 outline  1 steel dark  2 steel mid  3 steel lit  4 steel spec
 *   5 haft dark  6 haft mid  7 haft lit
 * ------------------------------------------------------------------ */

// The haft's darkest tone stays well clear of black — the axe only ever
// appears against the castle's black sky.
const AXE_PAL = [
  OUT, '#4e4e4e', '#8f8f8f', '#d0d0d8', '#ffffff',
  '#5f3a12', '#8a5a20', '#c08a44',
];

// Single-bit head. The cutting edge is a double bevel that converges to a
// SINGLE pixel at row 4 col 2 — no flat vertical face, so it reads as an axe
// and not a mallet. Nothing sits above the head's top outline (the old row-0
// haft nub is gone) and the whole form is centred: bbox cols 2..13.
//   a..g are the steel interiors, top to bottom.
const axeHead = (a, b, c, d, e, f, g) => [
  '.......0000000..',
  `......0${a}0..`,
  `.....0${b}0..`,
  `...0${c}0..`,
  `..0${d}0..`,
  `...0${e}0..`,
  `.....0${f}0..`,
  `......0${g}0..`,
  '.......0000000..',
];

const AXE_BLANK = '................';

// The haft is anchored at the bottom of the cell, so when the head drops a
// pixel the visible haft shortens — the axe presses down on its pedestal
// instead of sliding along its own handle.
function axeHaft(n, lean) {
  const pad = lean ? '.........' : '........';
  const tail = lean ? '..' : '...';
  const rows = [];
  const lit = Math.ceil((n - 1) / 2);
  for (let i = 0; i < n - 1; i++) rows.push(pad + (i < lit ? '07650' : '06550') + tail);
  rows.push(pad + '00000' + tail);
  return rows;
}

const axeFrame = (drop, lean, tones) => [
  ...Array(drop).fill(AXE_BLANK),
  ...axeHead(...tones),
  ...axeHaft(7 - drop, lean),
];

// Three poses, not three paint jobs: the head rocks 1px per frame and the haft
// leans a pixel right at the bottom of the rock. The specular stays on the
// upper-left bevel throughout — only the lit/mid boundary travels.
const AXE_FRAMES = [
  axeFrame(0, false, ['443322', '4443322', '444333221', '4443322211', '333322211', '3322211', '222111']),
  axeFrame(1, false, ['433222', '4433222', '443332221', '4433322211', '344332211', '3433221', '233211']),
  axeFrame(2, true, ['433222', '4332221', '433322211', '4333222111', '344333221', '3443321', '234321']),
];

export const AXE = {
  idle: new Anim(
    AXE_FRAMES.map((r, i) => makeSprite(r, AXE_PAL, { name: `axe#${i}` })),
    5
  ),
};

/* ------------------------------------------------------------------ *
 * VINE — repeating body segment plus a growing tip with a curled bud.
 *   0 outline  1 stalk dark  2 stalk shade  3 stalk mid  4 stalk lit
 *   5 leaf dark  6 leaf mid  7 leaf lit
 * ------------------------------------------------------------------ */

const VINE_PAL = [
  OUT, '#0d5209', '#187f0e', '#2ba018', '#66c828',
  '#155008', '#2d8f10', '#77c828', '#b8ec70',
];

// The stalk does not run as one ruled bar: it jogs a pixel right at rows 6-8,
// back at row 9 and a pixel left at rows 13-15, and carries a knuckle at row 7,
// so a stacked vine snakes instead of extruding like a pipe.
const VINE_BODY_A = [
  '.....0843210....',
  '...000843210....',
  '..0760843210....',
  '.07660843210....',
  '076650843210....',
  '.00550843210....',
  '......0843210...',
  '.....08443210...',
  '......0843210...',
  '.....0843210000.',
  '.....08432106670',
  '.....08432105670',
  '.....0843210550.',
  '....0843210.....',
  '....0843210.....',
  '....0843210.....',
];

// Sway frame: the whole segment rides up one row (it tiles seamlessly, so the
// jog pattern and both leaves rise together) and the stalk's own gradient rolls
// one step right, as if the vine had twisted slightly on its axis.
const VINE_BODY_B = [...VINE_BODY_A.slice(1), VINE_BODY_A[0]].map((r) =>
  r.split('08443210').join('01844320').split('0843210').join('0184320')
);

// The tip carries ONE small curled bud on the left (cols 2-4, rows 10-12) —
// three rows, its own 7/6/5 curl — and no copy of the body's leaf clusters.
const VINE_TIP_A = [
  '........000.....',
  '.......08410....',
  '......084310....',
  '.....08443210...',
  '....0844332110..',
  '...08443322110..',
  '...0843322110...',
  '....08332110....',
  '.....0843210....',
  '...000843210....',
  '..0770843210....',
  '..0660843210....',
  '..0550843210....',
  '...000843210....',
  '.....08432110...',
  '......0843210...',
];

// The shoot leans a pixel left and the bud's curl rolls, so a growing vine
// waves its tip instead of extruding a fixed knob.
const VINE_TIP_B = [
  '.......000......',
  '......08410.....',
  '.....084310.....',
  '....08443210....',
  '...0844332110...',
  '..08443322110...',
  '..0843322110....',
  '...08332110.....',
  '.....0843210....',
  '...000843210....',
  '..0660843210....',
  '..0770843210....',
  '..0550843210....',
  '...000843210....',
  '.....08432110...',
  '......0843210...',
];

export const VINE = {
  tip: new Anim(
    [VINE_TIP_A, VINE_TIP_B].map((r, i) => makeSprite(r, VINE_PAL, { name: `vine.tip#${i}` })),
    12
  ),
  body: new Anim(
    [VINE_BODY_A, VINE_BODY_B].map((r, i) => makeSprite(r, VINE_PAL, { name: `vine.body#${i}` })),
    12
  ),
};

/* ------------------------------------------------------------------ *
 * LIFT — 48x8 riveted plank. Three plank sections, seams at the joins,
 * one rivet per section catching the upper-left light.
 *   0 outline  1 dark  2 mid  3 lit  4 spec  5 rivet shadow  6 rivet spec
 * ------------------------------------------------------------------ */

const LIFT_PAL = [
  OUT, '#7a3a00', '#b06000', '#e08c30', '#ffc880', '#3a1c08', '#ffffff',
];

const SEAM = '51';

// Rivets sit at index 5 of every 14-char section, i.e. absolute x = 6, 22, 38:
// 16px apart with a matching 6px margin at each end, so the run reads as a
// deliberate row instead of drifting right. Each stud is 3px of dome — two
// specular pixels and a lit pixel over a 3px shadow — so slot 6 earns its slot.
// Row 0 is the plank's own dark tone rather than solid outline: Mario lands on
// wood, not on a black bar.
const LIFT_ROWS = [
  '0' + '1'.repeat(46) + '0',
  '0' + '34444444444444' + SEAM + '44444444444444' + SEAM + '44444444444443' + '0',
  '0' + '23333333333333' + SEAM + '33333333333333' + SEAM + '33333333333332' + '0',
  '0' + '23333664333333' + SEAM + '33333664333333' + SEAM + '33333664333332' + '0',
  '0' + '22222511222222' + SEAM + '22222511222222' + SEAM + '22222511222222' + '0',
  '0' + '12222222222222' + SEAM + '22222222222222' + SEAM + '22222222222221' + '0',
  '0' + '11111111111111' + SEAM + '11111111111111' + SEAM + '11111111111111' + '0',
  '0000000000000000' + '0000000000000000' + '0000000000000000',
];

// Balance-lift hardware for the '@' anchors in 1-3 / 4-3. The cord is 4px so it
// can carry an outline on BOTH sides plus three tan tones — a 2px cord cannot.
// The lit strand crosses from the left pair to the right pair every 4 rows, so
// it reads as braided rather than as a ruled line.
const LIFT_ROPE_TWIST = ['0430', '0420', '0310', '0210', '0340', '0240', '0130', '0120'];
const LIFT_ROPE = [...LIFT_ROPE_TWIST, ...LIFT_ROPE_TWIST];

const LIFT_PULLEY = [
  '..0000..',
  '.044320.',
  '04432210',
  '04355210',
  '03255210',
  '03222110',
  '.021110.',
  '..0000..',
];

export const LIFT = {
  platform: makeSprite(LIFT_ROWS, LIFT_PAL, { name: 'lift.platform' }),
  // Trimmed slices of the plank ramp — the rope needs no rivet tones and the
  // pulley no rivet specular, so neither ships a slot it never paints.
  rope: makeSprite(LIFT_ROPE, LIFT_PAL.slice(0, 5), { name: 'lift.rope' }),
  pulley: makeSprite(LIFT_PULLEY, LIFT_PAL.slice(0, 6), { name: 'lift.pulley' }),
};

/* ------------------------------------------------------------------ *
 * BRICK DEBRIS — one chunk tumbling. The silhouette changes every
 * frame; the light stays pinned to the upper-left.
 *   0 outline  1 dark  2 mid  3 lit  4 spec
 * ------------------------------------------------------------------ */

const DEBRIS_PAL = [OUT, '#5a1a00', '#9f4a00', '#c86818', '#ef9a49'];

const DEBRIS_FRAMES = [
  [
    '0000000.',
    '04443320',
    '04433210',
    '.0433210',
    '..043210',
    '...04310',
    '....0410',
    '.....000',
  ],
  [
    '.000000.',
    '04433210',
    '04332210',
    '0433210.',
    '.033210.',
    '.03210..',
    '..0210..',
    '..000...',
  ],
  [
    '........',
    '.000000.',
    '04443320',
    '04433210',
    '03332210',
    '.0322110',
    '..00000.',
    '........',
  ],
  [
    '..000...',
    '.04430..',
    '.044320.',
    '.043210.',
    '.033210.',
    '.032110.',
    '.021110.',
    '..0000..',
  ],
];

export const DEBRIS = {
  tumble: new Anim(
    DEBRIS_FRAMES.map((r, i) => makeSprite(r, DEBRIS_PAL, { name: `debris#${i}` })),
    4
  ),
};

/* ------------------------------------------------------------------ *
 * BUBBLE — a HOLLOW film, not a disc. Everything inside the meniscus is
 * transparent so the water behind actually shows through; the only solid
 * pixels are the 1px rim and the specular where the light catches the film.
 * Three frames wobble the rim as it rises.
 *   0 outline  1 film shadow  2 rim shade  3 rim lit  4 spec
 * ------------------------------------------------------------------ */

const BUBBLE_PAL = ['#0a1a4a', '#2a5aa8', '#5f9ae8', '#a8d4ff', '#ffffff'];

const BUBBLE_A = [
  '..0000..',
  '.034420.',
  '034..220',
  '03....20',
  '03....10',
  '02....10',
  '.02..10.',
  '..0000..',
];

// Pinched: the rim pulls in a pixel at rows 3-4 and the highlight slides down
// to the shoulder.
const BUBBLE_B = [
  '..0000..',
  '.034220.',
  '034..210',
  '.03..20.',
  '.03..10.',
  '02....10',
  '.02..10.',
  '..0000..',
];

// Stretched: the crown narrows to a 2px cap and the specular rides to the
// top of the film, the way a bubble pulls into a teardrop as it rises.
const BUBBLE_C = [
  '...00...',
  '..0440..',
  '.03..20.',
  '03....20',
  '03....10',
  '02....10',
  '.02..10.',
  '..0000..',
];

export const BUBBLE = {
  idle: new Anim(
    [BUBBLE_A, BUBBLE_B, BUBBLE_C].map((r, i) =>
      makeSprite(r, BUBBLE_PAL, { name: `bubble#${i}` })
    ),
    8
  ),
};

/* ------------------------------------------------------------------ *
 * FIREWORK — 8-spoke burst that expands then breaks apart.
 *   0 unused outline  1 ember  2 red  3 orange  4 yellow  5 white
 * ------------------------------------------------------------------ */

// A firework is additive light — it has no black outline. Slot 0 is therefore
// the coolest ember, not OUT, and every one of the six tones is used.
//   0 ember dark  1 ember  2 red  3 orange  4 yellow  5 white
const FW_PAL = ['#5a0c00', '#8c1800', '#e04010', '#ff8020', '#ffd040', '#ffffff'];

// A: detonation. Tight core, eight short spokes. Each spoke ramps 4 -> 3 -> 2
// -> 1 -> 0 outward, so its OUTERMOST pixel is the darkest ember: against the
// '#5c94fc' overworld sky every arm has a dark leading edge and stops crawling.
const FW_A = [
  '................',
  '.0.....00.....0.',
  '..1....11....1..',
  '...2...22...2...',
  '....3..33..3....',
  '.......44.......',
  '......4554......',
  '0123455555543210',
  '0123455555543210',
  '......4554......',
  '.......44.......',
  '....3..33..3....',
  '...2...22...2...',
  '..1....11....1..',
  '.0.....00.....0.',
  '................',
];

// B: full expansion. Every spoke has doubled in length and each diagonal now
// carries a dark ember strand along its OUTER flank, so no arm is a bare 1px
// diagonal of '#e04010' any more.
const FW_B = [
  '01.....00.....10',
  '.02....11....20.',
  '..02...22...20..',
  '...03..33..30...',
  '....03.44.30....',
  '.....344443.....',
  '......4554......',
  '0123445555443210',
  '0123445555443210',
  '......4554......',
  '.....344443.....',
  '....03.44.30....',
  '...03..33..30...',
  '..02...22...20..',
  '.02....11....20.',
  '01.....00.....10',
];

// C: dissipation. The diagonals have flown outward until they are clear of the
// centre — every cluster sits further out than its FW_B counterpart, the core
// and the inner half of every arm are gone, and the four LOWER clusters sit one
// row BELOW their mirrored position because they are falling.
const FW_C = [
  '................',
  '55.....55.....55',
  '44.....44.....44',
  '22.....22.....22',
  '11.....11.....11',
  '00.....00.....00',
  '................',
  '54210......01245',
  '54210......01245',
  '................',
  '................',
  '00.....00.....00',
  '11.....11.....11',
  '22.....22.....22',
  '44.....44.....44',
  '55.....55.....55',
];

export const FIREWORK = {
  burst: new Anim(
    [FW_A, FW_B, FW_C].map((r, i) => makeSprite(r, FW_PAL, { name: `firework#${i}` })),
    [4, 6, 6],
    false
  ),
};

