// Terrain tiles — 16x16, authored as string rows (see ARCHITECTURE.md §2 and §5).
// Slot legend used throughout this file:
//   0 outline / mortar   1 core shadow   2 midtone   3 lit tone   4 specular
//   5+ per-tile accents (glyph ink, recess floor, foam, ...)
// Light always comes from the UPPER LEFT.
//
// PALETTE POLICY (this is what keeps a level readable, so it is a rule, not taste):
//   * terrain ramps (EARTH / BRICK / STONE / QUARRY / TIMBER) use near-black
//     outlines and warm or neutral highlights;
//   * liquid ramps (WATER_PAL / LAVA_PAL) never use a black darkest slot — a
//     liquid has no outline, its slot 0 is depth — and they hold >= 55 RGB units
//     from every terrain ramp slot of the same index in the same theme, so a pool
//     can never disappear into the floor it is cut into;
//   * inside one theme the material ramps hold >= 45 RGB units from each other,
//     so breakable / solid / pass-through never read as the same stuff.

import { makeSprite, Anim } from '../core/gfx.js';
import { INK } from './palette.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Stamp individual pixels onto a row set: px(rows, [[x, y, ch], ...])
function px(rows, edits) {
  const out = rows.slice();
  for (const [x, y, ch] of edits) {
    const r = out[y];
    out[y] = r.slice(0, x) + ch + r.slice(x + 1);
  }
  return out;
}

// Stamp a small sub-bitmap ('.' = leave alone) at (ox, oy).
function stamp(rows, ox, oy, art) {
  const out = rows.slice();
  for (let y = 0; y < art.length; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= out.length) continue;
    let r = out[ty];
    for (let x = 0; x < art[y].length; x++) {
      const c = art[y][x];
      if (c === '.') continue;
      const tx = ox + x;
      if (tx < 0 || tx >= r.length) continue;
      r = r.slice(0, tx) + c + r.slice(tx + 1);
    }
    out[ty] = r;
  }
  return out;
}

const THEMES = ['overworld', 'underground', 'castle', 'water', 'athletic'];

// ---------------------------------------------------------------------------
// theme ramps — [outline, shadow, mid, lit, specular]
//
// underground: the cave is dark teal rock (EARTH), blue-slate brick (BRICK), warm
//   limestone (STONE) and pale mint quarry stone (QUARRY) — deliberately NOT the
//   same blue as the water running through it, which is why the old set failed.
// castle: ONE cold desaturated key. Charcoal masonry floor, oxblood brick, neutral
//   grey stone, pale warm-grey staircase, cold dressed ashlar wall. Nothing on a
//   castle screen is saturated except the lava and the green pipe — that contrast
//   is the whole mood, and it dies the moment the floor is cobalt and the stairs
//   are moss.
// water: the sea floor is wet sand / gold rock / sea-grey stone, i.e. warm, so
//   the blue body reads as liquid rather than as more terrain.
// ---------------------------------------------------------------------------

// VALUE TIERS (this is the rule that makes a level read at 1x in greyscale, see
// ARCHITECTURE.md §12). The three materials a player stands on, breaks and climbs
// must never share a value:
//
//   EARTH  (floor)     dark tier   — weighted mean tile luminance ~50-70
//   BRICK  (breakable) mid tier    — ~85-100
//   QUARRY (staircase) light tier  — ~130-150
//
// Every theme holds >= 30 luminance units between all three means, so desaturating
// the scene still shows a dark floor, a mid pillar and a bright staircase. Hue is
// what carries the theme; value is what carries the silhouette.

const EARTH = {
  overworld:   ['#1d0c04', '#4a2609', '#7a3f12', '#a8632a', '#c98f52'],
  underground: ['#03100d', '#0a3229', '#155448', '#2b8072', '#59a894'],
  castle:      ['#080809', '#232228', '#3c3a44', '#5c5866', '#8a8494'],
  water:       ['#14110a', '#3a3320', '#55492f', '#847354', '#a89474'],
  athletic:    ['#0d1806', '#22400c', '#345818', '#4e7a2c', '#84b055'],
};

const BRICK = {
  overworld:   ['#25120a', '#94360a', '#d87024', '#ffa856', '#ffdca8'],
  underground: ['#0e0d1a', '#3e4068', '#767cb0', '#aeb4dc', '#dcdcf0'],
  castle:      ['#26101a', '#7a3038', '#b85c5c', '#dc9a94', '#f4ccc4'],
  water:       ['#1c1408', '#7a4a10', '#b8801e', '#e8b84a', '#ffe49a'],
  athletic:    ['#1a1c08', '#5a4a10', '#a4821e', '#e2bc4a', '#f6e79a'],
};

// ASHLAR — the castle wall (indestructible). Deliberately a different MATERIAL from
// BRICK, not a different bond pattern on the same paint: cold dressed stone a full
// value step above the breakable brick in every theme, so "I can smash this" and
// "I cannot smash this" separate on value alone even in greyscale.
const ASHLAR = {
  overworld:   ['#191a1e', '#70757e', '#a3a8b2', '#c9ceda', '#f2f5fb'],
  underground: ['#100d18', '#787090', '#aca4c4', '#d2ccea', '#f6f2ff'],
  castle:      ['#0c0810', '#787482', '#aeaab8', '#d4d0de', '#f8f6ff'],
  water:       ['#101a1c', '#6a7c80', '#9cb0b4', '#c8dcdc', '#f0fafa'],
  athletic:    ['#141810', '#727c60', '#a6b090', '#d0dcbc', '#f4fadc'],
};

const STONE = {
  overworld:   ['#20191c', '#544a4a', '#948a86', '#c8c2bc', '#fff6ec'],
  underground: ['#1a1408', '#544628', '#8e7a52', '#c4b48c', '#f0e8c8'],
  castle:      ['#0a0a0c', '#2c2c30', '#4e4e4e', '#8f8f95', '#c8c8d0'],
  water:       ['#0e1e1e', '#2f5a52', '#5c9088', '#98c8bc', '#e8f4d8'],
  athletic:    ['#141a12', '#38503c', '#6c8470', '#a4c0a4', '#f0f6cc'],
};

// QUARRY — the staircase block only, and the LIGHT tier of every theme. A step is a
// lit horizontal surface catching the sky; a pyramid of them has to read as a bright
// mass standing on the dark floor, never as more floor stacked up.
const QUARRY = {
  overworld:   ['#2a2420', '#6e6258', '#a09284', '#ccc0b0', '#f2e8d8'],
  underground: ['#1c2824', '#526a62', '#809a8e', '#aac2b6', '#d8ecdc'],
  castle:      ['#332c30', '#6e646a', '#a09298', '#cac0c4', '#f2eaec'],
  water:       ['#1e2c30', '#5a7278', '#8ca4a8', '#b8ccd0', '#e4f4f4'],
  athletic:    ['#242a1a', '#66705a', '#98a488', '#c2ceb4', '#eef6dc'],
};

const PIPE = {
  overworld:   ['#0a3010', '#0a5a12', '#22a028', '#66d84e', '#c8f79a'],
  underground: ['#0a2810', '#0a4c14', '#1a8622', '#4fc040', '#b0ee88'],
  castle:      ['#0a1a10', '#204028', '#3a6a44', '#68a072', '#b4d8b8'],
  water:       ['#0a3010', '#0a5a12', '#1e9430', '#58c85a', '#b8ee9a'],
  athletic:    ['#12300a', '#1e6a10', '#3cae1e', '#82e04a', '#d8fa9a'],
};

// TIMBER — used blocks and the one-way platform. Always the lightest ramp in the
// theme: a platform you can jump through has to look like a different object from
// the terrain, before the player commits to the jump.
const TIMBER = {
  overworld:   ['#2a1404', '#8a5a2a', '#c89a5e', '#f0d0a0', '#fff6e0'],
  underground: ['#241008', '#8a5040', '#c88872', '#e8bcac', '#fff0e4'],
  castle:      ['#140c08', '#3a2416', '#61402a', '#916545', '#c49a72'],
  water:       ['#201608', '#8a6a3e', '#c8a878', '#f0dcb8', '#fff8e8'],
  athletic:    ['#2a2410', '#7a6a2a', '#b8a85e', '#e8dca0', '#fff8d8'],
};

// Gold for question blocks: kept close to gold in every theme so the block always
// reads as "special", only the outline picks up the theme. Slot 0 of the block is
// the theme outline, so these ramps start at the shadow tone.
const GOLD      = ['#8a4a06', '#d08a10', '#f6c93c', '#fff3b0'];
const GOLD_MID  = ['#7a3e04', '#b8760c', '#e0ad28', '#ffe58c'];
const GOLD_DIM  = ['#6c3404', '#a4670a', '#cf9a1e', '#f2d278'];
const GOLD_RISE = ['#82440a', '#c47e10', '#eabb32', '#fff0a0'];
const GLYPH = ['#3d1a00', '#fff6d2'];

const pal = (ramp, ...extra) => [...ramp, ...extra];

// ---------------------------------------------------------------------------
// GROUND — calm masonry: two courses of 7px slabs on a 1px mortar grid, running
// bond. Two variants ship (A/B) with the courses split at different columns and
// different wear, so a floor alternates on (tileX + tileY) & 1 instead of
// wallpapering one noise pattern across the whole level.
// ---------------------------------------------------------------------------

// One course: `grout` lists the mortar columns (wrapping, so slabs course across
// tile seams), `h` rows of slab followed by one mortar row.
function slabCourse(grout, h) {
  const isG = (x) => grout.includes(((x % 16) + 16) % 16);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      if (isG(x)) { s += '0'; continue; }
      const left = isG(x - 1);
      const right = isG(x + 1);
      if (y === 0) s += left ? '4' : '3';
      else if (y === h - 1) s += left ? '3' : '1';
      else s += left ? '3' : right ? '1' : '2';
    }
    rows.push(s);
  }
  rows.push('0000000000000000');
  return rows;
}

// GROUT RULE: exactly ONE vertical joint per course, and column 15 is never one of
// them. A joint on the last column is mortar on both sides of every tile seam, which
// draws a full-height near-black line every 16 pixels and exposes the tile grid as
// stripes across the whole floor. The four joints below (3 / 11 in variant A, 9 / 1
// in variant B) are all different columns and no column is a joint in two stacked
// courses of the same tile, so A beside B never lines two joints up either.
//
// Wear is always a PAIR of pixels on a slab edge or corner — a chip reads as
// damage, a lone pixel reads as dirt on the lens and repeats visibly.
const R_GROUND_A = px(
  [...slabCourse([3], 7), ...slabCourse([11], 7)],
  [
    [7, 0, '4'], [8, 0, '4'],       // chipped-bright top edge, top course only
    [12, 2, '1'], [12, 3, '1'],     // chip biting into the big slab's face
    [5, 4, '3'], [6, 4, '3'],       // rubbed-smooth patch
    [6, 8, '1'], [7, 8, '1'],       // chipped corner on the lower course
    [1, 10, '1'], [2, 10, '1'],
  ]
);

const R_GROUND_B = px(
  [...slabCourse([9], 7), ...slabCourse([1], 7)],
  [
    [2, 0, '4'], [3, 0, '4'],
    [13, 3, '1'], [13, 4, '1'],
    [5, 2, '3'], [6, 2, '3'],
    [8, 8, '1'], [9, 8, '1'],
    [4, 12, '1'], [5, 12, '1'],
  ]
);

// ---------------------------------------------------------------------------
// BRICK — 8x4 courses, half-brick offset, 1px mortar. Lit top row, lit left edge,
// shadowed bottom row, specular chip on one brick per course.
// ---------------------------------------------------------------------------

const R_BRICK = [
  '4333333033333330',
  '3222222032222220',
  '2111111021111110',
  '0000000000000000',
  '3330433333303333',
  '2220322222203222',
  '1110211111102111',
  '0000000000000000',
  '3333333043333330',
  '3222222032222220',
  '2111111021111110',
  '0000000000000000',
  '3330333333304333',
  '2220322222203222',
  '1110211111102111',
  '0000000000000000',
];

// ---------------------------------------------------------------------------
// QUESTION BLOCK — four drawn frames, not a palette flash:
//   A rest    — glyph at rest, corner gleam, specular at the left of the bevel
//   B bounce  — whole glyph 1px lower, hook shortened, specular travelled 4px
//   C pressed — glyph still low, bevel flattened, gleam at the right edge
//   D rebound — glyph 1px above rest, bottom edge lit as the block springs back
// ---------------------------------------------------------------------------

// The '?' as its own bitmap (slot 6 = glyph face, slot 5 = its ink shadow) so it
// can actually be moved and reshaped between frames.
const Q_GLYPH = [
  '.6666...',
  '665566..',
  '.55.665.',
  '...6655.',
  '..6655..',
  '..665...',
  '...55...',
  '..66....',
  '...55...',
];

// Struck: hook pulled in a pixel each side; the whole glyph rides a pixel lower.
const Q_GLYPH_SHORT = [
  '..66....',
  '.65566..',
  '.55.665.',
  '...6655.',
  '..6655..',
  '..665...',
  '...55...',
  '..66....',
  '...55...',
];

// Pressed: one stem row squeezed out, so the dot stays put and the hook squashes
// down onto it — 8 rows instead of 9.
const Q_GLYPH_SQUASH = [
  '..66....',
  '.65566..',
  '.55.665.',
  '...6655.',
  '..6655..',
  '...55...',
  '..66....',
  '...55...',
];

// Rebound: an extra stem row, so the glyph stretches upward off the dot — 10 rows.
const Q_GLYPH_TALL = [
  '.6666...',
  '665566..',
  '.55.665.',
  '...6655.',
  '..6655..',
  '..665...',
  '..665...',
  '...55...',
  '..66....',
  '...55...',
];

const Q_FACE = [
  '0000000000000000',
  '0444444444444410',
  '0403333333333010',
  '0433333333333210',
  '0432222222222210',
  '0432222222222210',
  '0432222222222210',
  '0432222222222210',
  '0432222222222210',
  '0432222222222210',
  '0422222222222110',
  '0422222222222110',
  '0421111111111110',
  '0401111111111010',
  '0111111111111110',
  '0000000000000000',
];

// A: at rest — gleam sitting on the left of the top bevel, corner spark lit.
const R_QUESTION_A = stamp(
  px(Q_FACE, [
    [3, 2, '4'], [4, 2, '4'], [5, 2, '4'],   // travelling specular, phase 0
    [3, 3, '4'], [4, 3, '4'], [3, 4, '4'],   // corner gleam
  ]),
  5, 4, Q_GLYPH
);

// B: the block has been struck — glyph rides 1px down, hook shortened, gleam has
// travelled 4px to the middle of the bevel, corner gleam gone.
const R_QUESTION_B = stamp(
  px(Q_FACE, [
    [7, 2, '4'], [8, 2, '4'], [9, 2, '4'],
    [2, 4, '2'], [3, 4, '2'],                // top-left bevel loses a step
  ]),
  5, 5, Q_GLYPH_SHORT
);

// C: pressed down — bevel flattened (row 1 drops to lit, row 2 loses its
// specular corner), gleam exits at the right edge, glyph still low.
const R_QUESTION_C = stamp(
  px(Q_FACE, [
    [2, 1, '3'], [3, 1, '3'], [4, 1, '3'], [5, 1, '3'], [6, 1, '3'], [7, 1, '3'],
    [8, 1, '3'], [9, 1, '3'], [10, 1, '3'], [11, 1, '3'], [12, 1, '3'], [13, 1, '3'],
    [1, 2, '3'],                             // bevel flattens: row 1 lit, row 2 dim
    [11, 2, '4'], [12, 2, '4'], [13, 2, '4'],
    [2, 3, '2'], [3, 3, '2'],
    [1, 12, '3'],                            // bottom-left bevel takes the load
  ]),
  5, 5, Q_GLYPH_SQUASH
);

// D: rebound — glyph overshoots 1px above rest, the bottom of the block lights up
// as it springs back, and the gleam curls off the right shoulder.
const R_QUESTION_D = stamp(
  px(Q_FACE, [
    [12, 3, '4'], [13, 3, '4'],              // gleam curling off the right shoulder
    [3, 12, '2'], [4, 12, '2'], [5, 12, '2'], [6, 12, '2'], [7, 12, '2'],
    [8, 12, '2'], [9, 12, '2'], [10, 12, '2'], [11, 12, '2'], [12, 12, '2'],
    [3, 13, '3'], [4, 13, '3'], [5, 13, '3'], [6, 13, '3'], [7, 13, '3'],
    [8, 13, '3'], [9, 13, '3'], [10, 13, '3'], [11, 13, '3'], [12, 13, '3'],
  ]),
  5, 3, Q_GLYPH_TALL
);

// USED / EMPTY BLOCK — same frame, flat sunken face, no glyph.
const R_USED = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0433333333332210',
    '0432222222222210',
    '0432111111112210',
    '0432122222212210',
    '0432122222212210',
    '0432122222212110',
    '0432122222212110',
    '0432133333332110',
    '0432222222221110',
    '0432111111111110',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [
    [2, 2, '0'], [13, 2, '0'], [2, 13, '0'], [13, 13, '0'],
    [3, 3, '4'], [12, 12, '1'],
  ]
);

// ---------------------------------------------------------------------------
// SOLID STONE BLOCK — bevelled frame around a chiselled recess with an inset boss.
// ---------------------------------------------------------------------------

const R_STONE = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0433332222222210',
    '0433222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222221110',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [
    // granite grain: paired flecks, never single-pixel noise
    [6, 3, '5'], [7, 3, '5'], [10, 4, '3'], [11, 4, '3'],
    [4, 5, '5'], [5, 5, '5'], [3, 8, '3'], [4, 8, '3'],
    [9, 6, '5'], [10, 6, '5'], [6, 7, '3'], [7, 7, '3'],
    [11, 9, '5'], [12, 9, '5'], [8, 10, '3'], [9, 10, '3'],
    [4, 11, '5'], [5, 11, '5'], [11, 11, '3'], [12, 11, '3'],
    [2, 6, '3'], [3, 12, '3'],
  ]
);

// ---------------------------------------------------------------------------
// STAIRCASE BLOCK — quarry block: four bevelled sub-blocks in a 2x2 grid, grooves
// on the right/bottom edge so it courses seamlessly in every direction. Two of the
// four sub-blocks carry a 3px chamfer (slot 5) at their lit corner; the tone
// directly behind a chamfer steps down so it reads as a cut, not as a dead pixel.
// ---------------------------------------------------------------------------

const R_STAIR = [
  '5534444044444440',
  '5333333043333330',
  '3322222043222220',
  '4322222043222220',
  '4322222043222220',
  '4322221043222210',
  '3211111032111110',
  '0000000000000000',
  '4444444055344440',
  '4333333053333330',
  '4322222033222220',
  '4322222043222220',
  '4322222043222220',
  '4322221043222210',
  '3211111032111110',
  '0000000000000000',
];

// ---------------------------------------------------------------------------
// CASTLE BRICKWORK — tight grey ashlar, half-bond, pitted faces.
// ---------------------------------------------------------------------------

const R_CASTLE = px(
  [
    '4333333043333330',
    '3222221032222210',
    '3222221032222210',
    '3222221032222210',
    '3111111031111110',
    '0000000000000000',
    '4330433333304333',
    '3210322222103221',
    '3210322222103221',
    '3210322222103221',
    '3110311111103111',
    '0000000000000000',
    '4333304333304333',
    '3222103222103221',
    '3111103111103111',
    '0000000000000000',
  ],
  [
    [4, 2, '1'], [10, 3, '1'], [6, 8, '1'], [13, 7, '1'],
    [2, 13, '1'], [8, 13, '4'], [11, 1, '4'], [1, 8, '4'],
  ]
);

// ---------------------------------------------------------------------------
// PIPES — rim is a full 32px wide, the stem is 28px (2px inset each side), so the
// lip overhangs exactly like the NES original. Both halves carry the same
// cross-section: outline, specular, lit, a long midtone belly, shadow, then a
// rim-bounce highlight two pixels in from the far edge — that bounce is what makes
// a cylinder read as a tube instead of a plank.
// ---------------------------------------------------------------------------

//            0 1 2 3 4 5 6 7 8 9 A B C D E F
const PIPE_STEM_L = '..04332222222222';
const PIPE_STEM_R = '22222222111310..';
const PIPE_RIM_R  = '2222222221111310';

const R_PIPE_TL = [
  '0000000000000000',
  '0443333333333333',
  '0432222222222222',
  '0432222222222222',
  '0432222222222222',
  '0432222222222222',
  '0431111111111111',
  '0000000000000000',
  PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L,
  PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L,
];

const R_PIPE_TR = [
  '0000000000000000',
  '3333333333333310',
  PIPE_RIM_R, PIPE_RIM_R, PIPE_RIM_R, PIPE_RIM_R,
  '1111111111111310',
  '0000000000000000',
  PIPE_STEM_R, PIPE_STEM_R, PIPE_STEM_R, PIPE_STEM_R,
  PIPE_STEM_R, PIPE_STEM_R, PIPE_STEM_R, PIPE_STEM_R,
];

const R_PIPE_BL = new Array(16).fill(PIPE_STEM_L);
const R_PIPE_BR = new Array(16).fill(PIPE_STEM_R);

// Horizontal pipe: one shading band per row, shared by the left cap, the body and
// the right cap so any run of them courses seamlessly sideways. The bands step
// 4 -> 3 -> 2 -> 1 with dithered transitions, then a rim-bounce row two pixels
// above the bottom outline.
const PIPE_H_BODY = [
  '0000000000000000',
  '4444444444444444',
  '3333333333333333',
  '3332333233323332',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '2221222122212221',
  '1112111211121112',
  '1111111111111111',
  '1111111111111111',
  '3333333333333333',
  '1111111111111111',
  '0000000000000000',
];
// Band each row belongs to, used to pick the matching cross-section for the caps.
const PIPE_H_BAND = ['0', '4', '3', '3', '2', '2', '2', '2', '2', '2', '1', '1', '1', '3', '1', '0'];
// Cap cross-section for a given band: groove, four lip pixels, groove.
const PIPE_LIP = { 4: '4443', 3: '4432', 2: '3321', 1: '2210' };

const R_PIPE_SIDE_BODY = PIPE_H_BODY;

const R_PIPE_SIDE_L = PIPE_H_BODY.map((row, y) => {
  const b = PIPE_H_BAND[y];
  if (b === '0') return row;
  return `0${PIPE_LIP[b]}0${row.slice(6)}`;
});

const R_PIPE_SIDE_R = PIPE_H_BODY.map((row, y) => {
  const b = PIPE_H_BAND[y];
  if (b === '0') return row;
  return `${row.slice(0, 10)}0${PIPE_LIP[b]}0`;
});

// ---------------------------------------------------------------------------
// LAVA — 3 drawings, ping-ponged so the loop has a return path.
//   * the crest wave changes phase AND cap shape every frame;
//   * the dark crust plate drifts 2px right per frame and changes outline: one
//     plate, then a shorter plate, then two cracked plates;
//   * a bubble lives at column 6: it is born on the floor, rises as a 2x2 with a
//     bright crown, then bursts into a 3-wide spray with two torn voids;
//   * the bottom mottle differs in every frame.
// ---------------------------------------------------------------------------

const R_LAVA_A = [
  '4455444444554444',
  '3344333333443333',
  '3333433333334333',
  '2333322223333222',
  '2233222222332222',
  '2222222222222222',
  '2212222222122222',
  '1100222222211222',
  '1000222222100122',
  '1100222222100012',
  '2111222222111222',
  '2222233322221122',
  '2232234322222222',
  '2222222222223432',
  '1222222222223332',
  '1112111121111211',
];

const R_LAVA_B = [
  '4444455444444554',
  '3333344333333443',
  '3333334333333343',
  '3222233332222333',
  '2222223322222233',
  '2222322222223222',
  '2122222222122222',
  '2211001222221112',
  '2210001222210012',
  '2211115522221112',
  '2222234432222112',
  '2222234432222222',
  '2222233222223432',
  '2322222222222343',
  '3432222222222333',
  '1211112111211121',
];

const R_LAVA_C = [
  '5544444455444444',
  '4433333344333333',
  '3433333334333333',
  '2223333222233332',
  '2222332222223322',
  '2232222242222222',
  '2212355532221222',
  '2222104122222222',
  '2221112112222222',
  '2221001001222222',
  '2222112112111222',
  '2233222221001222',
  '2234322222111222',
  '2333222222222222',
  '1222222222222322',
  '1112211121112211',
];

// ---------------------------------------------------------------------------
// WATER
//
// Two rules govern this whole section, and both were learned the hard way:
//
// 1. DEPTH IS NOT IN THE TILE. Ramping light-at-the-top to dark-at-the-bottom
//    inside one 16x16 tile means stacking it draws a hard light/dark band every
//    16 pixels. The body tile below is therefore value-UNIFORM — every row has the
//    identical slot census — and the actual depth ramp lives in the palette
//    (waterDepthPal / T_WATER_BODY_DEPTH), which the renderer indexes by tileY.
//
// 2. ANIMATE THE LIGHT, NOT THE MATERIAL. Re-dithering the field between frames
//    flips half the pixels in the tile and makes a submerged screen strobe. The
//    dither is FIXED across all four frames; only the caustics move, 2px right and
//    1px up per frame, so a full cycle drifts them 8px and wraps. Frame-to-frame
//    delta is ~7%, which reads as current instead of as a fault in the TV.
// ---------------------------------------------------------------------------

// Ordered-Bayer water field, shared by the body tile and the sub-foam part of the
// surface tile so the two are literally the same material and the seam where row 15
// of the surface meets row 0 of the body cannot be seen. 25% dark sprinkle, 12.5%
// light sprinkle, 62.5% base; the two sprinkle phases are constructed so they can
// never collide, and both have a y-period that divides 16, so the field tiles in Y.
function waterField(x, y) {
  const c = (y * 2) % 4;                    // dark sprinkle phase (25%)
  const d = (c + 1 + 2 * (y % 4)) % 8;      // light sprinkle phase (12.5%)
  if (x % 4 === c) return 0;
  if (x % 8 === d) return 2;
  return 1;
}

// Three caustic diagonals. Frame f draws them at (+2f, -f), wrapping — one drawing,
// four positions, nothing else in the tile moves.
const CAUSTICS = [
  [[2, 1], [3, 2], [4, 3]],
  [[9, 5], [10, 6], [11, 7]],
  [[5, 10], [6, 11], [7, 12]],
];

function waterBody(phase) {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) s += String(waterField(x, y));
    rows.push(s);
  }
  const edits = [];
  for (const line of CAUSTICS) {
    for (const [x, y] of line) {
      edits.push([(x + phase * 2) & 15, (y - phase + 16) & 15, '3']);
    }
  }
  return px(rows, edits);
}

const R_WATER_BODY = [0, 1, 2, 3].map(waterBody);

// One wavelength per tile, so four 4px phase shifts carry the crest a full 16px and
// wrap. The renderer can also index by (tileX & 3) to put neighbouring tiles out of
// phase — that is what makes a pool read as one long travelling wave instead of
// every tile in the level flipping in unison with the crest at the same x.
const WAVE_H = [2, 3, 3, 4, 4, 4, 3, 3, 2, 1, 1, 0, 0, 0, 1, 1];

// Surface slots: 0 trough shadow, 1 deep sprinkle, 2 base, 3 lit sprinkle,
// 4 lit water under the foam, 5 foam. Field slots are shifted up one so that the
// same dither cell lands on the same colour as it does in the body tile.
function waterSurface(phase) {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const t = WAVE_H[((x - phase * 4) % 16 + 16) % 16];
      if (y < t) s += '.';
      else if (y < t + 2) s += '5';                 // foam cap
      else if (y === t + 2) s += '4';               // water lit through the crest
      else if (y === t + 3) s += '3';
      else if (t === 0 && y <= t + 5) s += '0';     // trough shadow under the cap
      else s += String(waterField(x, y) + 1);
    }
    rows.push(s);
  }
  return rows;
}

const R_WATER_SURF = [0, 1, 2, 3].map(waterSurface);

// Depth lives here, not in the bitmap: each step slides the 4-colour window one
// notch down the 6-colour WATER_PAL, so a deep tile is the same drawing lit less.
const waterDepthPal = (theme, d) => WATER_PAL[theme].slice(2 - d, 6 - d);

const R_WATER_SURF_A = [
  '.5555...........',
  '5444455.......55',
  '433334455...5544',
  '3222233445554433',
  '2222222334443322',
  '2222222223332222',
  '2222222222222222',
  '2222222222222222',
  '2332222223322222',
  '2223222222232222',
  '2222212222222122',
  '2222222222222222',
  '2222233222222332',
  '2222222322222223',
  '2222222222222222',
  '2222222222222222',
];

const R_WATER_SURF_B = [
  '.......555......',
  '......544455....',
  '5...554333445555',
  '4555443222334444',
  '3444332222223333',
  '2333222222222222',
  '2222233222222332',
  '2222222322222223',
  '2222222222222222',
  '2212222222122222',
  '2332222223322222',
  '2223222222232222',
  '2222222222222222',
  '2222222222222222',
  '2222233222222332',
  '2222222322222223',
];

// The depth ramp is dithered, not banded: solid bands would stripe every 16px
// when a pool is stacked. Lit dither at the top, deep dither at the bottom, and
// row 15 is still 25% midtone so the wrap into the next tile stays soft.
const R_WATER_BODY_A = px(
  [
    '2323232323232323',
    '3232323232323232',
    '2322232223222322',
    '2232223222322232',
    '2223222322232223',
    '2222222222222222',
    '2222222222222222',
    '2221222122212221',
    '2212221222122212',
    '2122212221222122',
    '2121212121212121',
    '1212121212121212',
    '1112111211121112',
    '1121112111211121',
    '1211121112111211',
    '1112111211121112',
  ],
  [
    // caustics — light chasing down through the column, dimming with depth
    [2, 1, '4'], [3, 2, '4'], [4, 3, '4'],
    [9, 5, '4'], [10, 6, '4'], [11, 7, '4'],
    [5, 10, '3'], [6, 11, '3'], [7, 12, '3'],
    // paired depth motes
    [3, 13, '0'], [4, 13, '0'], [10, 14, '0'], [11, 14, '0'],
    [6, 14, '2'], [7, 14, '2'], [12, 11, '2'], [13, 11, '2'],
    [1, 6, '3'], [2, 6, '3'], [13, 5, '3'], [14, 5, '3'],
  ]
);

const R_WATER_BODY_B = px(
  [
    '3232323232323232',
    '2323232323232323',
    '2232223222322232',
    '2223222322232223',
    '2322232223222322',
    '2222222222222222',
    '2222222222222222',
    '2122212221222122',
    '2221222122212221',
    '2212221222122212',
    '1212121212121212',
    '2121212121212121',
    '1211121112111211',
    '1112111211121112',
    '1121112111211121',
    '1211121112111211',
  ],
  [
    // same caustics, 4px right and 1px up
    [6, 0, '4'], [7, 1, '4'], [8, 2, '4'],
    [13, 4, '4'], [14, 5, '4'], [15, 6, '4'],
    [9, 9, '3'], [10, 10, '3'], [11, 11, '3'],
    // motes drift too
    [4, 12, '0'], [5, 12, '0'], [11, 13, '0'], [12, 13, '0'],
    [7, 15, '2'], [8, 15, '2'], [13, 10, '2'], [14, 10, '2'],
    [2, 5, '3'], [3, 5, '3'], [14, 6, '3'], [15, 6, '3'],
  ]
);

// ---------------------------------------------------------------------------
// FLAGPOLE
// ---------------------------------------------------------------------------

const POLE_ROW = '......04310.....';
const R_FLAG_POLE = new Array(16).fill(POLE_ROW);

const R_FLAG_BALL = [
  '................',
  '......0000......',
  '....03332220....',
  '...0344332220...',
  '...0344332210...',
  '..033332222110..',
  '..033222221110..',
  '..022222111110..',
  '..022211111120..',
  '...0221111120...',
  '...0211111220...',
  '....01111220....',
  '......0000......',
  POLE_ROW, POLE_ROW, POLE_ROW,
];

// ---------------------------------------------------------------------------
// CORAL — brain-coral ridges. Ridge pitch 4px vertical, undulation period 8px
// horizontal, so it courses in both axes with no seam.
// ---------------------------------------------------------------------------

const R_CORAL = px(
  [
    '0043330000433300',
    '0422223004222230',
    '4222222303222210',
    '3222222100311100',
    '3222222100000000',
    '0322221004333330',
    '0031110042222223',
    '0000000032222221',
    '0043330032222221',
    '0422223003111110',
    '4222222300000000',
    '3222222100433300',
    '3222222104222230',
    '0322221003222210',
    '0031110000311100',
    '0000000000000000',
  ],
  [
    [1, 1, '5'], [9, 1, '5'], [8, 6, '5'], [1, 9, '5'], [10, 12, '5'],
    [4, 3, '1'], [2, 4, '1'], [11, 2, '1'], [11, 7, '1'], [4, 11, '1'], [12, 13, '1'],
    [5, 2, '3'], [3, 10, '3'], [13, 6, '3'], [5, 3, '1'], [12, 8, '1'], [5, 12, '1'],
  ]
);

// ---------------------------------------------------------------------------
// ONE-WAY PLATFORM — planked lift, 8px deep, open underneath. The cap is
// scalloped and two tie-rods hang below the deck: from a distance the broken
// outline is the only thing telling the player they can pass through it.
// ---------------------------------------------------------------------------

const R_PLATFORM = [
  '0033330000333300',
  '4444444444444444',
  '3333333333333333',
  '2421222224212222',
  '2121222221212222',
  '2221222222212222',
  '1111111111111111',
  '1110111111101111',
  '0001100000011000',
  '....1......1....',
  '....0......0....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// ---------------------------------------------------------------------------
// CANNON — blaster barrel with a bored muzzle, and a plated pedestal that stacks.
// ---------------------------------------------------------------------------

const R_CANNON_BARREL = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0432224444222210',
    '0432240000122210',
    '0432405555012210',
    '0434055555501210',
    '0434055555501210',
    '0432055555501210',
    '0432055551101210',
    '0432201111012210',
    '0432220000222210',
    '0432222222222210',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [[2, 4, '3'], [13, 11, '2'], [3, 12, '3']]
);

const R_CANNON_BASE = px(
  [
    '0400000000000010',
    '0443333333322110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222221110',
    '0432111111111110',
    '0400000000000010',
    '0443333333322110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222222110',
    '0432222222221110',
    '0432111111111110',
  ],
  [[4, 3, '4'], [11, 3, '4'], [4, 4, '1'], [11, 4, '1'],
   [4, 11, '4'], [11, 11, '4'], [4, 12, '1'], [11, 12, '1']]
);

// ---------------------------------------------------------------------------
// VINE BLOCK — solid block with the beanstalk coiled in its mouth.
// ---------------------------------------------------------------------------

const R_VINE_BLOCK = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0432222222222210',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [
    // mouth the beanstalk climbs out of
    [5, 11, '0'], [6, 11, '0'], [7, 11, '0'], [8, 11, '0'], [9, 11, '0'], [10, 11, '0'],
    [5, 12, '0'], [6, 12, '5'], [7, 12, '5'], [8, 12, '5'], [9, 12, '5'], [10, 12, '0'],
    // stem, curving left then back
    [7, 11, '7'], [8, 11, '6'],
    [7, 10, '7'], [8, 10, '6'], [6, 10, '8'],
    [7, 9, '7'], [8, 9, '6'],
    [7, 8, '7'], [8, 8, '6'],
    [6, 7, '7'], [7, 7, '6'],
    [6, 6, '7'], [7, 6, '6'], [5, 6, '8'],
    [7, 5, '7'], [8, 5, '6'],
    [7, 4, '7'], [8, 4, '6'], [6, 4, '8'],
    [8, 3, '7'], [9, 3, '6'],
    [9, 2, '7'], [10, 2, '6'],
    // left leaf
    [3, 8, '7'], [4, 8, '8'], [5, 8, '7'], [3, 9, '6'], [4, 9, '6'], [5, 9, '6'],
    // right leaf
    [9, 5, '7'], [10, 5, '8'], [11, 5, '7'], [10, 6, '6'], [11, 6, '6'], [12, 5, '6'],
  ]
);

// ---------------------------------------------------------------------------
// non-ramp palettes — one entry per theme, because a tile that ships identical in
// all five themes is a tile nobody drew for four of them.
// ---------------------------------------------------------------------------

// [depth, deep body, mid body, lit body, caustic, foam]
const WATER_PAL = {
  overworld:   ['#052a55', '#0f5a86', '#2088c0', '#4fc0e8', '#b5ebf2', '#ffffff'],
  underground: ['#052a55', '#083f78', '#0a4a90', '#2f8ad0', '#9fd6f2', '#ffffff'],
  castle:      ['#083440', '#0a5a44', '#12806a', '#2fbc94', '#a0eec0', '#e8fff8'],
  water:       ['#052a55', '#0d5090', '#1c74cc', '#4fa8ec', '#bcdfff', '#ffffff'],
  athletic:    ['#062c50', '#12629a', '#2f94cc', '#63cbe8', '#c2eff4', '#ffffff'],
};

// [crust, dark, body, lit, hot, crest]. Lava's darkest tone is a blood red, never
// a brown-black: a crust plate has to stay legible as lava when the tile sits
// right next to brown ground or brick.
const LAVA_PAL = {
  overworld:   ['#6a0800', '#b00c00', '#e63000', '#ff6a00', '#ffb028', '#ffe89a'],
  underground: ['#620a08', '#8e1000', '#bc2000', '#dc5606', '#f28c1c', '#ffc25e'],
  castle:      ['#700600', '#c41800', '#f43c00', '#ff9020', '#ffd468', '#fff6d2'],
  water:       ['#5a0a14', '#a80c22', '#d6241c', '#f4661c', '#ffa63c', '#ffe0a0'],
  athletic:    ['#6a1000', '#c02c00', '#ee5200', '#ff9c22', '#ffd450', '#fff8c4'],
};

const FLAG_PAL = {
  overworld:   ['#0a2a0a', '#1c5c1e', '#2f8c2c', '#63c948', '#c8f79a'],
  underground: ['#04201c', '#0d5040', '#1c8a68', '#4fc8a0', '#b8f0dc'],
  castle:      ['#0c0a14', '#2c2840', '#4c4870', '#8080a8', '#c0c0d8'],
  water:       ['#04221e', '#0d5a54', '#1a9088', '#4fccc0', '#bcf2ec'],
  athletic:    ['#182808', '#3c6410', '#6aa020', '#a8d848', '#e8f6a0'],
};

// Coral is a different mineral in every place it grows: warm rock above ground,
// cave teal below, ash in the castle, NES coral pink in the sea, moss in the sky.
const CORAL_PAL = {
  overworld:   ['#2a1010', '#6e2418', '#a8442c', '#dc7a52', '#f8c49a', '#fff2e0'],
  underground: ['#1a0a20', '#4a1650', '#7e2a86', '#b85ac0', '#e8a8e8', '#ffffff'],
  castle:      ['#120c10', '#3a2830', '#5e4650', '#8e7480', '#c4b0b8', '#ffffff'],
  water:       ['#2e0c22', '#6e2046', '#c03470', '#ff83c0', '#ffcce5', '#ffffff'],
  athletic:    ['#0e2010', '#245020', '#3f8030', '#78b850', '#c8e896', '#ffffff'],
};

const STONE_DEEP = {
  overworld: '#33313a', underground: '#2c2210', castle: '#1b1b1f',
  water: '#0e2c36', athletic: '#26302c',
};
// Chamfer highlight on the staircase block — warm and tied to QUARRY, never a
// bare #ffffff dropped on a coloured face.
const QUARRY_LIT = {
  overworld: '#fff2dc', underground: '#e0f0d4', castle: '#fdf8fa',
  water: '#e8fce8', athletic: '#f6ffe0',
};

// SPENT GOLD — the used block. Reads as the SAME block as the question block (same
// gold family, same bevel) but drained of light: peak luminance ~139 against the
// live block's ~241. A consumed block must recede, so it is never built on TIMBER,
// which is the lightest ramp in the theme and would drag the eye to a dead tile.
const GOLD_SPENT = ['#4a3208', '#6e4c10', '#8f6a1e', '#ab8a3c'];

// The muzzle bore: a bored hole, not a black sticker. Slot 5 is the black core,
// slot 6 the machined bevel catching the upper-left light, slot 7 the depth the
// light never reaches — without those two the ring and the interior merge.
const BORE = INK.black;
const BORE_RIM = '#6a6470';
const BORE_DEEP = '#101018';
const VINE_INK = [INK.outline, '#1c5c14', '#3fa02a', '#8ada54'];

// ---------------------------------------------------------------------------
// tile ids
// ---------------------------------------------------------------------------

export const TID = {
  AIR: 0, GROUND: 1, BRICK: 2, Q_COIN: 3, Q_ITEM: 4, Q_1UP: 5, Q_HIDDEN: 6,
  USED: 7, STONE: 8, STAIR: 9,
  PIPE_TL: 10, PIPE_TR: 11, PIPE_BL: 12, PIPE_BR: 13,
  PIPE_SIDE_L: 14, PIPE_SIDE_R: 15, PIPE_SIDE_BODY: 16,
  LAVA: 17, WATER_SURF: 18, WATER_BODY: 19,
  FLAG_POLE: 20, FLAG_BALL: 21, CASTLE_BRICK: 22, CORAL: 23, PLATFORM: 24,
  CANNON_BARREL: 25, CANNON_BASE: 26, VINE_BLOCK: 27,
  COIN: 28, AXE: 29, TREE: 30, BUSH: 31, HILL: 32, CLOUD: 33,
  ANCHOR_PLATFORM: 34, ANCHOR_FIREBAR: 35,
};

// ---------------------------------------------------------------------------
// build one full tile set for a theme
// ---------------------------------------------------------------------------

function buildTheme(theme) {
  const earth = EARTH[theme];
  const brick = BRICK[theme];
  const stone = STONE[theme];
  const quarry = QUARRY[theme];
  const pipe = PIPE[theme];
  const timber = TIMBER[theme];
  const water = WATER_PAL[theme];
  const lava = LAVA_PAL[theme];
  const S = (rows, palette, name) => makeSprite(rows, palette, { name: `${theme}:${name}` });
  // Question block: slot 0 is the theme outline, 1-4 are the gold ramp, 5-6 glyph.
  const qp = (ramp) => [earth[0], ramp[0], ramp[1], ramp[2], ramp[3], GLYPH[0], GLYPH[1]];

  const qa = S(R_QUESTION_A, qp(GOLD), 'question-rest');
  const qb = S(R_QUESTION_B, qp(GOLD_MID), 'question-bounce');
  const qc = S(R_QUESTION_C, qp(GOLD_DIM), 'question-pressed');
  const qd = S(R_QUESTION_D, qp(GOLD_RISE), 'question-rebound');
  const lavaA = S(R_LAVA_A, lava, 'lava-a');
  const lavaB = S(R_LAVA_B, lava, 'lava-b');
  const lavaC = S(R_LAVA_C, lava, 'lava-c');
  const surfA = S(R_WATER_SURF_A, water, 'water-surface-a');
  const surfB = S(R_WATER_SURF_B, water, 'water-surface-b');
  const bodyA = S(R_WATER_BODY_A, water, 'water-body-a');
  const bodyB = S(R_WATER_BODY_B, water, 'water-body-b');
  const groundA = S(R_GROUND_A, earth, 'ground-a');
  const groundB = S(R_GROUND_B, earth, 'ground-b');

  const anims = {
    question: new Anim([qa, qb, qc, qd], [10, 6, 8, 6]),
    lava: new Anim([lavaA, lavaB, lavaC, lavaB], [8, 6, 8, 6]),
    water: new Anim([surfA, surfB], 10),
    waterBody: new Anim([bodyA, bodyB], 10),
  };

  const t = {};
  t[TID.GROUND] = groundA;
  t[TID.BRICK] = S(R_BRICK, brick, 'brick');
  t[TID.Q_COIN] = qa;
  t[TID.Q_ITEM] = qa;
  t[TID.USED] = S(R_USED, [earth[0], ...GOLD_SPENT], 'used');
  t[TID.STONE] = S(R_STONE, pal(stone, STONE_DEEP[theme]), 'stone');
  t[TID.STAIR] = S(R_STAIR, pal(quarry, QUARRY_LIT[theme]), 'stair');
  t[TID.PIPE_TL] = S(R_PIPE_TL, pipe, 'pipe-tl');
  t[TID.PIPE_TR] = S(R_PIPE_TR, pipe, 'pipe-tr');
  t[TID.PIPE_BL] = S(R_PIPE_BL, pipe, 'pipe-bl');
  t[TID.PIPE_BR] = S(R_PIPE_BR, pipe, 'pipe-br');
  t[TID.PIPE_SIDE_L] = S(R_PIPE_SIDE_L, pipe, 'pipe-side-l');
  t[TID.PIPE_SIDE_R] = S(R_PIPE_SIDE_R, pipe, 'pipe-side-r');
  t[TID.PIPE_SIDE_BODY] = S(R_PIPE_SIDE_BODY, pipe, 'pipe-side-body');
  t[TID.LAVA] = lavaA;
  t[TID.WATER_SURF] = surfA;
  t[TID.WATER_BODY] = bodyA;
  t[TID.FLAG_POLE] = S(R_FLAG_POLE, FLAG_PAL[theme], 'flagpole');
  t[TID.FLAG_BALL] = S(R_FLAG_BALL, FLAG_PAL[theme], 'flagball');
  t[TID.CASTLE_BRICK] = S(R_CASTLE, ASHLAR[theme], 'castle-brick');
  t[TID.CORAL] = S(R_CORAL, CORAL_PAL[theme], 'coral');
  t[TID.PLATFORM] = S(R_PLATFORM, timber, 'platform');
  t[TID.CANNON_BARREL] = S(R_CANNON_BARREL, pal(stone, BORE), 'cannon-barrel');
  t[TID.CANNON_BASE] = S(R_CANNON_BASE, stone, 'cannon-base');
  t[TID.VINE_BLOCK] = S(R_VINE_BLOCK, pal(brick, ...VINE_INK), 'vine-block');

  return {
    tiles: t,
    anims,
    ground: [groundA, groundB],
    frames: { qa, qb, qc, qd, lavaA, lavaB, lavaC, surfA, surfB, bodyA, bodyB },
  };
}

const BUILT = {};
for (const th of THEMES) BUILT[th] = buildTheme(th);

// THEME_TILES[theme][tileId] -> Sprite
export const THEME_TILES = {
  overworld: BUILT.overworld.tiles,
  underground: BUILT.underground.tiles,
  castle: BUILT.castle.tiles,
  water: BUILT.water.tiles,
  athletic: BUILT.athletic.tiles,
};

// THEME_ANIMS[theme].question | .lava | .water | .waterBody -> Anim
export const THEME_ANIMS = {
  overworld: BUILT.overworld.anims,
  underground: BUILT.underground.anims,
  castle: BUILT.castle.anims,
  water: BUILT.water.anims,
  athletic: BUILT.athletic.anims,
};

// THEME_GROUND[theme] -> [variantA, variantB]. Pick with (tileX + tileY) & 1 (or
// groundVariant() below) so a floor stops repeating one stamp across the screen.
export const THEME_GROUND = {
  overworld: BUILT.overworld.ground,
  underground: BUILT.underground.ground,
  castle: BUILT.castle.ground,
  water: BUILT.water.ground,
  athletic: BUILT.athletic.ground,
};

export const groundVariant = (theme, tileX = 0, tileY = 0) =>
  (THEME_GROUND[theme] || THEME_GROUND.overworld)[(tileX + tileY) & 1];

// ---------------------------------------------------------------------------
// named exports (overworld set is the canonical one)
// ---------------------------------------------------------------------------

const OW = BUILT.overworld.tiles;
const OWF = BUILT.overworld.frames;

export const T_GROUND = OW[TID.GROUND];
export const T_GROUND_A = BUILT.overworld.ground[0];
export const T_GROUND_B = BUILT.overworld.ground[1];
export const GROUND_VARIANTS = BUILT.overworld.ground;
export const T_BRICK = OW[TID.BRICK];
export const T_QUESTION_A = OWF.qa;
export const T_QUESTION_B = OWF.qb;
export const T_QUESTION_C = OWF.qc;
export const T_QUESTION_D = OWF.qd;
export const T_QUESTION = OWF.qa;
export const T_QUESTION_ANIM = BUILT.overworld.anims.question;
export const T_USED = OW[TID.USED];
export const T_QUESTION_USED = OW[TID.USED];
export const T_STONE = OW[TID.STONE];
export const T_STAIR = OW[TID.STAIR];
export const T_PIPE_TL = OW[TID.PIPE_TL];
export const T_PIPE_TR = OW[TID.PIPE_TR];
export const T_PIPE_BL = OW[TID.PIPE_BL];
export const T_PIPE_BR = OW[TID.PIPE_BR];
export const T_PIPE_SIDE_L = OW[TID.PIPE_SIDE_L];
export const T_PIPE_SIDE_R = OW[TID.PIPE_SIDE_R];
export const T_PIPE_SIDE_BODY = OW[TID.PIPE_SIDE_BODY];
export const T_LAVA_A = OWF.lavaA;
export const T_LAVA_B = OWF.lavaB;
export const T_LAVA_C = OWF.lavaC;
export const T_LAVA = OWF.lavaA;
export const T_LAVA_ANIM = BUILT.overworld.anims.lava;
export const T_WATER_SURF_A = OWF.surfA;
export const T_WATER_SURF_B = OWF.surfB;
export const T_WATER_SURF = OWF.surfA;
export const T_WATER_ANIM = BUILT.overworld.anims.water;
export const T_WATER_BODY_A = OWF.bodyA;
export const T_WATER_BODY_B = OWF.bodyB;
export const T_WATER_BODY = OWF.bodyA;
export const T_WATER_BODY_ANIM = BUILT.overworld.anims.waterBody;
export const T_FLAG_POLE = OW[TID.FLAG_POLE];
export const T_FLAG_BALL = OW[TID.FLAG_BALL];
export const T_CASTLE_BRICK = OW[TID.CASTLE_BRICK];
export const T_CORAL = OW[TID.CORAL];
export const T_PLATFORM = OW[TID.PLATFORM];
export const T_CANNON_BARREL = OW[TID.CANNON_BARREL];
export const T_CANNON_BASE = OW[TID.CANNON_BASE];
export const T_VINE_BLOCK = OW[TID.VINE_BLOCK];

// ---------------------------------------------------------------------------
// tile table
// ---------------------------------------------------------------------------

export const TILES = {
  0: { name: 'air', solid: false, sprite: null },
  1: { name: 'ground', solid: true, sprite: T_GROUND, variants: GROUND_VARIANTS },
  2: { name: 'brick', solid: true, sprite: T_BRICK, breakable: true },
  3: {
    name: 'question', solid: true, sprite: T_QUESTION, question: true,
    animated: T_QUESTION_ANIM, contains: 'coin', becomes: 7,
  },
  4: {
    name: 'question-item', solid: true, sprite: T_QUESTION, question: true,
    animated: T_QUESTION_ANIM, contains: 'mushroom', becomes: 7,
  },
  5: {
    name: 'question-1up', solid: true, sprite: null, question: true,
    hidden: true, contains: '1up', becomes: 7,
  },
  6: {
    name: 'hidden-coin', solid: true, sprite: null, question: true,
    hidden: true, contains: 'coin', becomes: 7,
  },
  7: { name: 'used', solid: true, sprite: T_USED },
  8: { name: 'stone', solid: true, sprite: T_STONE },
  9: { name: 'stair', solid: true, sprite: T_STAIR },
  10: { name: 'pipe-tl', solid: true, sprite: T_PIPE_TL, pipe: 'tl' },
  11: { name: 'pipe-tr', solid: true, sprite: T_PIPE_TR, pipe: 'tr' },
  12: { name: 'pipe-bl', solid: true, sprite: T_PIPE_BL, pipe: 'bl' },
  13: { name: 'pipe-br', solid: true, sprite: T_PIPE_BR, pipe: 'br' },
  14: { name: 'pipe-side-l', solid: true, sprite: T_PIPE_SIDE_L, pipe: 'left' },
  15: { name: 'pipe-side-r', solid: true, sprite: T_PIPE_SIDE_R, pipe: 'right' },
  16: { name: 'pipe-side-body', solid: true, sprite: T_PIPE_SIDE_BODY, pipe: 'body' },
  17: {
    name: 'lava', solid: false, sprite: T_LAVA, harm: 'lava', animated: T_LAVA_ANIM,
  },
  18: {
    name: 'water-surface', solid: false, sprite: T_WATER_SURF, liquid: true,
    animated: T_WATER_ANIM,
  },
  19: {
    name: 'water', solid: false, sprite: T_WATER_BODY, liquid: true,
    animated: T_WATER_BODY_ANIM,
  },
  20: { name: 'flagpole', solid: false, sprite: T_FLAG_POLE, climb: true },
  21: { name: 'flagball', solid: false, sprite: T_FLAG_BALL, climb: true },
  22: { name: 'castle-brick', solid: true, sprite: T_CASTLE_BRICK },
  23: { name: 'coral', solid: true, sprite: T_CORAL },
  24: { name: 'platform', solid: false, platform: true, sprite: T_PLATFORM },
  25: { name: 'cannon-barrel', solid: true, sprite: T_CANNON_BARREL, cannon: 'barrel' },
  26: { name: 'cannon-base', solid: true, sprite: T_CANNON_BASE, cannon: 'base' },
  27: {
    name: 'vine-block', solid: true, sprite: T_VINE_BLOCK, question: true,
    contains: 'vine', becomes: 7,
  },
  28: { name: 'coin', solid: false, sprite: null, coin: true },
  29: { name: 'axe', solid: false, sprite: null, decor: true },
  30: { name: 'tree', solid: false, sprite: null, decor: true },
  31: { name: 'bush', solid: false, sprite: null, decor: true },
  32: { name: 'hill', solid: false, sprite: null, decor: true },
  33: { name: 'cloud', solid: false, sprite: null, decor: true },
  34: { name: 'anchor-platform', solid: false, sprite: null, anchor: 'platform' },
  35: { name: 'anchor-firebar', solid: false, sprite: null, anchor: 'firebar' },
};

// Every LEGEND char from ARCHITECTURE.md §6, plus three extensions:
// 'K'/'k' cannon barrel/base and '-' horizontal pipe body.
export const CHAR_TO_TILE = {
  '.': 0, ' ': 0,
  '#': 1, '=': 2,
  '?': 3, 'M': 4, '1': 5, 'C': 6, 'o': 28,
  'B': 8, 'S': 9,
  '[': 10, ']': 11, '{': 12, '}': 13, '<': 14, '>': 15, '-': 16,
  'L': 17, '~': 18, '_': 19,
  '|': 20, '^': 21,
  'X': 22, 'a': 29,
  't': 30, 'b': 31, 'h': 32, 'c': 33,
  'g': 23, 'P': 24, '@': 34, 'F': 35, 'v': 27,
  'K': 25, 'k': 26,
};

export const tileForChar = (ch) => TILES[CHAR_TO_TILE[ch] ?? 0];

// spriteFor(theme, id) is the plain lookup; pass tile coords as well and the
// ground tile returns its alternating variant.
export const spriteFor = (theme, id, tileX, tileY) => {
  const set = THEME_TILES[theme] || THEME_TILES.overworld;
  if (id === TID.GROUND && tileX != null) return groundVariant(theme, tileX, tileY || 0);
  return set[id] || null;
};
