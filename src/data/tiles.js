// Terrain tiles — 16x16, authored as string rows (see ARCHITECTURE.md §2 and §5).
// Slot legend used throughout this file:
//   0 outline / mortar   1 core shadow   2 midtone   3 lit tone   4 specular
//   5+ per-tile accents (glyph ink, recess floor, foam, ...)
// Light always comes from the UPPER LEFT.
//
// PALETTE POLICY. Every clause below is ASSERTED at the bottom of this file
// (see assertPalette) and the module throws on boot if one of them stops holding.
// The previous set stated most of these in a comment and missed by up to 30 units.
//   * terrain ramps (EARTH / BRICK / ASHLAR / STONE / QUARRY / TIMBER) use
//     near-black outlines and keep chroma all the way into the specular;
//   * liquid ramps (WATER_PAL / LAVA_PAL) never use a black darkest slot — a
//     liquid has no outline, its slot 0 is depth — and hold >= 55 mean RGB over
//     their four body tones from every terrain ramp in the same theme, so a pool
//     can never disappear into the floor it is cut into. This is a mean, not a
//     per-slot floor: a fired-clay brick and molten rock legitimately share the
//     same dark red at the bottom of the ramp and separate everywhere above it;
//   * inside one theme the six material ramps hold >= 45 RGB units from each
//     other, averaged over slots 1-4, so breakable / solid / pass-through never
//     read as the same stuff. Slot 0 is exempt: every terrain outline is
//     deliberately near-black and shared;
//   * ACROSS themes, one material holds >= 35 by the same measure between every
//     pair of themes. Seven units of separation is a tile shipped twice;
//   * the breakable brick holds >= 45 from the GOLD question-block ramp, and the
//     spent block holds >= 40 from the floor it sits above, in every theme;
//   * every declared slot is used by at least one pixel of every sprite built on
//     it. A slot nobody reaches means the form was never fully shaded.
//
// ANIMATION POLICY (asserted by assertAnimation at the bottom of this file):
//   * a frame is not allowed to be its neighbour nudged sideways. Where a tile
//     genuinely flows, TWO fields move at DIFFERENT velocities — the lava's melt
//     drifts (+2, 0) while its crust drifts (-2, +2); the water's caustics run
//     (+2, -1) against a counter-set at (-2, +1) — so aligning two frames by
//     either velocity leaves the other field as residual and no single shift can
//     reproduce the loop. Both loops close on themselves with no seam;
//   * >= 12% of the tile changes every frame and <= 72% of it is allowed to stay
//     byte-identical across the whole loop. The water body used to be 86% static
//     with a 7% delta, which is a cycle in name only;
//   * idle loops never move a form the player reads as static geometry. The
//     question block's '?' is byte-identical across its four idle frames; only the
//     light on the bevel travels. The squash-and-stretch set is a separate,
//     non-looping BUMP animation that world.bumpBlock plays on a hit.
//
// TILING POLICY. Every tile here is drawn many times on one screen from ONE
// sprite, so a tile is not a picture, it is a texture:
//   * no isolated high-contrast landmark. The last lava tile stamped a 4x3 cream
//     bubble crown at a fixed coordinate and a 6x4 pool drew 24 copies of it on a
//     perfect 16px lattice. The bubbles now live on the surface tile, where a pool
//     only ever draws one row of them;
//   * features cross the tile edge. Every generated field in this file (lava melt,
//     lava crust, staircase pitching, coral growth) is built from wrapping value
//     noise or from harmonics whose periods divide 16, so nothing stops at a seam;
//   * where a tile is genuinely a discrete OBJECT rather than a texture — the
//     staircase stone, the brick — it gets a joint all the way round instead, so
//     the repeat reads as "these are separate blocks" rather than as a grille.
//
// READ THIS BEFORE ADDING PER-TILE WEAR. Everything below that takes a tile
// COORDINATE is currently dead: spriteFor, animatedSpriteFor, groundVariant,
// stairVariant, waterPhase, lavaPhase, lavaSurfPhase, THEME_GROUND, THEME_STAIR
// and the `variants` / `capTop` fields on the TILES records have no caller
// anywhere in src/. world.js resolves ONE sprite per tile record in _makeRec and
// draws it with `tileSprite(rec, tick)` in drawTiles — a tick, never an x or a y.
// So variant B of the ground and variant B of the staircase have never appeared
// on screen, a pool of lava draws the same frame in every cell, and the lava
// waterline and the lit stair tread are unreachable.
//
// The practical consequence for art in this file: a hand-placed chip, gleam or
// blotch at a fixed coordinate is printed at that coordinate in EVERY instance of
// the tile on screen, and "the variant next to it has different ones" is not a
// defence, because the variant is never drawn. Ground alone is 16,585 of the
// ~24,000 non-air cells in the 32 shipped levels. Until world.js passes tile
// coordinates through to spriteFor, the only textures that survive repetition are
// the ones with no landmark in them at all — see R_GROUND_A and ashlarRows below,
// both of which had their fixed damage removed for exactly this reason.

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

// Wrapping value noise. A sum of sines alone is not a texture, it is corduroy;
// these two give the tiles that need to look like MATERIAL (molten rock, a
// pick-dressed stone face) an irregular field that still tiles seamlessly in both
// axes, because the lattice lookup wraps.
function hash2(i, j, seed) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// `cx`/`cy` lattice cells across the 16px tile; returns roughly -1..1. Separate
// axes so a field can be stretched — coral grows upward, so its cells are twice as
// tall as they are wide.
function vnoise(x, y, cx, seed, cy = cx) {
  const sx0 = 16 / cx;
  const sy0 = 16 / cy;
  const gx = Math.floor(x / sx0);
  const gy = Math.floor(y / sy0);
  const fx = x / sx0 - gx;
  const fy = y / sy0 - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i, j) => hash2(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, seed);
  const a = w(gx, gy);
  const b = w(gx + 1, gy);
  const c = w(gx, gy + 1);
  const d = w(gx + 1, gy + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return (top + (bot - top) * sy) * 2 - 1;
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
// ARCHITECTURE.md §12), measured as weighted mean luminance over the finished 16x16
// tile rather than over the ramp, because a tile's value is what the eye gets:
//
//   EARTH  (floor)        dark tier    58-62
//   USED   (spent block)  mid tier     83-84,   >= 20 above the floor
//   BRICK  (breakable)    mid tier     87-92
//   STONE  (solid block)  upper tier   96-111
//   QUARRY (staircase)    light tier   115-126, >= 40 above the floor
//   ASHLAR (unbreakable)  light tier   117-123, >= 25 above BRICK
//   TIMBER (pass-through) top tier     133-146
//
// The ASHLAR/BRICK gap is the one that decides whether a player can tell a wall
// they can open from a wall they cannot before they waste a jump on it; the last
// set shipped castle at a two-unit gap and water inverted. The staircase gap is
// the other one that matters, and it is a FLOOR, not a ceiling: the last set put
// the 1-1 steps at 148 against a floor of 64 and they became the brightest object
// on the screen, brighter than the clouds and brighter than Mario.

// HUE PLAN. Every ramp is a different hue in every theme, and every theme gives
// each of its six materials a different hue, so no two tiles anywhere in the game
// are the same paint. Measured (mean Euclidean RGB over slots 1-4):
//   * within one theme, all fifteen material pairs hold >= 45;
//   * for one material, all ten theme pairs hold >= 35.
// Both gates are asserted by the checks at the bottom of this file, because the
// last set claimed them in a comment and missed by 30 units.
const EARTH = {
  overworld:   ['#100400', '#281004', '#70380e', '#b86e22', '#d49a54'],
  underground: ['#020e0a', '#0a221a', '#1e5e48', '#3c9e7a', '#6abea0'],
  castle:      ['#06060a', '#1c1c2c', '#40405e', '#6e6e92', '#9a9ab6'],
  water:       ['#0a0806', '#201c16', '#524638', '#887662', '#ac9e8c'],
  athletic:    ['#040e02', '#0e220a', '#2a601c', '#4aa23a', '#76c268'],
};

// BRICK — the one thing the player is allowed to smash, so it is the one warm,
// saturated masonry in every theme and it is never gold: a wall of gold brick eats
// the question block's "this one is special" the moment they share a screen.
// Measured against the GOLD ramp: 62 / 80 / 92 / 72 / 143.
const BRICK = {
  overworld:   ['#26100a', '#a02a06', '#ee5814', '#ff9254', '#ffc49a'],
  underground: ['#140806', '#7a3a24', '#b46844', '#d89a70', '#f0c8a0'],
  castle:      ['#2a0818', '#84264e', '#c8467e', '#e08aa8', '#f4c0d0'],
  water:       ['#1a0202', '#96221c', '#f45240', '#ffa69a', '#ffdad2'],
  athletic:    ['#18061c', '#742a7e', '#b854c0', '#d894dc', '#f0c6f4'],
};

// ASHLAR — the castle wall (indestructible). Deliberately a different MATERIAL from
// BRICK, not a different bond pattern on the same paint: cold dressed stone that
// sits a full value tier ABOVE the breakable brick, so "I can smash this" /
// "I cannot smash this" separate in greyscale. Measured tile-luminance gap to BRICK
// in the five themes: 30 / 30 / 31 / 29 / 29. Every ashlar is a cold cast, and no
// two themes use the same cold: cobalt above ground, cold grey in the cave,
// blue-violet in the fortress, magenta-violet under water, teal in the sky.
const ASHLAR = {
  overworld:   ['#02060e', '#3a68c6', '#84a4e2', '#c0d2f4', '#e8f0fc'],
  underground: ['#141e24', '#4a6272', '#88a0b2', '#c2d2dc', '#e8f2f8'],
  castle:      ['#1c1028', '#7a58aa', '#ac8ad4', '#d0bcee', '#ecdeff'],
  water:       ['#10040e', '#b442a2', '#dc80cc', '#f2b8e8', '#ffe4fa'],
  athletic:    ['#04322c', '#1e8670', '#38ccac', '#74f2d4', '#b4ffe8'],
};

const STONE = {
  overworld:   ['#0e080c', '#6a4458', '#9e768c', '#cab0be', '#f4e0ea'],
  underground: ['#160e20', '#5c3e7a', '#8c64ac', '#b496ce', '#dacaea'],
  castle:      ['#1c1410', '#5e4438', '#8e6c58', '#b89484', '#dcc0b0'],
  water:       ['#06080c', '#465a76', '#6e84a2', '#9caec4', '#c2d2e4'],
  athletic:    ['#121c10', '#344832', '#5c7e56', '#8aac84', '#b6d0b0'],
};

// QUARRY — the staircase block only, and the LIGHT tier of every theme. Above
// ground it is CUT SANDSTONE, because the 1-1 staircase in the original is warm
// brown masonry and the old near-white #95a0ac/#f0f4fa read as a concrete breeze
// block: at weighted tile luminance 148 against a floor of 64 it was the brightest
// object on the screen, brighter than the clouds and brighter than Mario. It now
// sits at 121 — still 55 clear of the floor, so a pyramid of steps still reads as a
// bright mass on a dark floor, but in the same family as the ground it stands on.
const QUARRY = {
  overworld:   ['#221a14', '#6a5038', '#9c7c5c', '#c8a884', '#f0dcbc'],
  underground: ['#0c160e', '#3e7c56', '#66ac80', '#98cca8', '#c8ecd4'],
  castle:      ['#14140c', '#6e6c48', '#9c9a7c', '#c4c4b2', '#dcdcd0'],
  water:       ['#1c0a10', '#8a4450', '#b87280', '#d6a4ac', '#f8d0d4'],
  athletic:    ['#0a0e10', '#466472', '#729aa8', '#a6c6d2', '#d2e8f0'],
};

const PIPE = {
  overworld:   ['#0a3010', '#0a5a12', '#22a028', '#66d84e', '#c8f79a'],
  underground: ['#062010', '#0e4a2c', '#1a8452', '#3cc078', '#9cecb4'],
  castle:      ['#0a1a10', '#204028', '#3a6a44', '#68a072', '#b4d8b8'],
  water:       ['#04281c', '#0a6650', '#12a07c', '#48d0a0', '#a8f0cc'],
  athletic:    ['#123008', '#2c7010', '#54b420', '#92e04c', '#daf89a'],
};

// TIMBER — the one-way platform, and nothing else. Always the lightest ramp in the
// theme: a platform you can jump THROUGH has to look like a different object from
// the terrain before the player commits to the jump, and the cheapest way to say
// "this is not masonry" is to be the brightest thing on the screen. Five different
// woods, because a plank that ships identical in all five themes is a plank nobody
// drew for four of them: oak above ground, moss-stained in the cave, cold sea-grey
// driftwood in the fortress, bleached straw under water, and the red-capped
// mushroom stalk in the sky.
const TIMBER = {
  overworld:   ['#301806', '#aa6428', '#d69c64', '#ecc6a0', '#fff2d4'],
  underground: ['#0a0e04', '#56762c', '#8ebe5a', '#bedea0', '#f0ffdc'],
  castle:      ['#040a0c', '#426e88', '#7eaabe', '#bcd6e0', '#f0ffff'],
  water:       ['#101008', '#828444', '#b2b27c', '#d2d2b2', '#f0f0e4'],
  athletic:    ['#16080e', '#86405a', '#c2869c', '#eaccda', '#fff8ff'],
};

// Gold for question blocks: kept close to gold in every theme so the block always
// reads as "special", only the outline picks up the theme. Slot 0 of the block is
// the theme outline, so these ramps start at the shadow tone. The shadow tone is
// olive-gold rather than the old red-brown #8a4a06 — that one sat 31 units from the
// overworld brick, which is inside the "one blob" threshold for the two tiles that
// share more screen than any other pair in the game.
const GOLD      = ['#7e5804', '#c08c0e', '#f0c832', '#fff2ac'];
const GOLD_MID  = ['#6e4c04', '#a8780c', '#d8b028', '#ffe894'];
const GOLD_DIM  = ['#5e4004', '#90660a', '#b8961e', '#f0d47c'];
const GOLD_RISE = ['#785206', '#b48410', '#e4bc2c', '#fff0a4'];
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
// NO HAND-PLACED WEAR. This tile used to carry five chips at fixed coordinates,
// justified by the variant next to it carrying five different ones. That
// justification does not survive contact with the renderer: world.js resolves one
// sprite per tile RECORD and never passes a tile coordinate, so THEME_GROUND /
// groundVariant / spriteFor are not called by the game at all and variant B has
// never been drawn on screen. Ground is 16,585 of the ~24,000 non-air cells in the
// 32 shipped levels, so those five chips were printed, identically, on a perfect
// 16-pixel lattice across every floor and every castle wall in the game — a
// screenshot of a 1-2 floor is a grid of the same five marks repeating.
//
// What is left is the bond and nothing else. The joints sit 8 columns apart
// (3 and 11) and the courses are 8 rows tall, so the tile's own content has an
// EIGHT-pixel period in both axes and there is no 16-pixel feature for the eye to
// lock a grid onto. A clean half-bond repeated is masonry; a half-bond plus a
// recognisable blotch repeated is one drawing printed forty times, and with no
// working variant mechanism the only honest move is to remove the blotch.
const R_GROUND_A = [...slabCourse([3], 7), ...slabCourse([11], 7)];

const R_GROUND_B = [...slabCourse([9], 7), ...slabCourse([1], 7)];

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
// QUESTION BLOCK — TWO animations, because a block has two behaviours and playing
// the hit reaction forever is what made a row of untouched blocks judder in
// lockstep like a rendering fault.
//
//   IDLE (looping, TILES[n].animated): the glyph never moves. A specular sweep
//   travels diagonally across the polished face — 5px of arc per frame, a full
//   crossing every four frames — lifting whatever tone it passes over by one step.
//   ~50 pixels change per frame, so it is real motion, but not one of them is on
//   the '?' itself, so nothing about the block's shape twitches.
//
//   BUMP (one-shot, TILES[n].bump): struck -> pressed -> rebound -> rest, with the
//   glyph squashing 9 rows to 8 and stretching to 10, the bevel flattening under
//   the load and the bottom edge lighting as the block springs back. This is the
//   set that used to run as the idle loop.
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

// The sweep. `phase` slides a 3px-wide diagonal band of light across the face; the
// band lifts body tones one notch and leaves the outline, the glyph and anything
// already at specular alone. Period 20 over four 5px steps, so frame 3 hands back
// to frame 0 with the band exactly where it started — a loop with no seam.
const Q_LIFT = { 1: '2', 2: '3', 3: '4', 4: '4' };
function questionIdle(phase) {
  const base = stamp(Q_FACE, 5, 4, Q_GLYPH);
  return base.map((row, y) => {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const c = row[x];
      const d = (x + y - phase * 5 + 40) % 20;
      s += d < 3 && Q_LIFT[c] ? Q_LIFT[c] : c;
    }
    return s;
  });
}

const R_QUESTION_A = questionIdle(0);
const R_QUESTION_B = questionIdle(1);
const R_QUESTION_C = questionIdle(2);
const R_QUESTION_D = questionIdle(3);

// Struck: glyph rides a pixel lower with its hook pulled in, and the top-left bevel
// loses a step as the corner takes the blow.
const R_QUESTION_HIT = stamp(
  px(Q_FACE, [
    [7, 2, '4'], [8, 2, '4'], [9, 2, '4'],
    [2, 4, '2'], [3, 4, '2'],
  ]),
  5, 5, Q_GLYPH_SHORT
);

// Pressed: bevel flattened (row 1 drops to lit, row 2 loses its specular corner),
// gleam squeezed out to the right edge, glyph squashed to eight rows.
const R_QUESTION_PRESS = stamp(
  px(Q_FACE, [
    [2, 1, '3'], [3, 1, '3'], [4, 1, '3'], [5, 1, '3'], [6, 1, '3'], [7, 1, '3'],
    [8, 1, '3'], [9, 1, '3'], [10, 1, '3'], [11, 1, '3'], [12, 1, '3'], [13, 1, '3'],
    [1, 2, '3'],
    [11, 2, '4'], [12, 2, '4'], [13, 2, '4'],
    [2, 3, '2'], [3, 3, '2'],
    [1, 12, '3'],
  ]),
  5, 5, Q_GLYPH_SQUASH
);

// Rebound: glyph overshoots a pixel above rest and stretches to ten rows, and the
// bottom of the block lights as it springs back off the fist.
const R_QUESTION_RISE = stamp(
  px(Q_FACE, [
    [12, 3, '4'], [13, 3, '4'],
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

// A carved block, not a speckled pad. The bevelled frame holds an ENGRAVED recess —
// shadow along its top and left lip, lit along its bottom and right, which is the
// signature of a cut sinking into the surface rather than a boss standing off it.
// That inner frame is what tells this apart from the staircase's four flat cells at
// a glance, before colour is involved at all.
const R_STONE = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0433332222222210',
    '0433211111111210',
    '0432212222223210',
    '0432212222223210',
    '0432212222223210',
    '0432212222223210',
    '0432212222223210',
    '0432212222223210',
    '0432212222223210',
    '0432233333333210',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [
    // Damage on the cut, not noise in the middle of it: a deep pit hugging the top
    // lip of the recess and a lit chip hugging the bottom one. Flecks floating in
    // the centre of the panel stop reading as granite and start reading as a glyph.
    [5, 5, '5'], [6, 5, '5'],
    [10, 11, '3'], [11, 11, '3'],
  ]
);

// ---------------------------------------------------------------------------
// STAIRCASE BLOCK — ONE dressed block per tile.
//
// The last one was a 7x7 face stamped four times behind a 2px near-black cross,
// and a measurement of the shipped tile found exactly one distinct quadrant: 160
// copies of a single small drawing built the whole 1-1 staircase, and the mortar
// cross read louder than the pyramid, so the mass came apart into a lattice of
// 8x8 cells. A staircase is a stack of BLOCKS, not a wall of tiles.
//
// So: one 16x16 stone, extruded. A dark joint runs all the way round it, a two-step
// arris catches the sky along the top and left, a two-step shadow falls down the
// bottom and right, and the corners are notched — that frame alone is what makes a
// stack read as blocks stacked rather than as a wall with a grid drawn on it. The
// joint stays slot 0 rather than dropping to slot 1: one dark line every SIXTEEN
// pixels around a real object is masonry, and it is a different thing from the old
// two-pixel cross every EIGHT pixels through the middle of one. What stops the tile
// from reading as the used block, which has the same frame, is the FACE — the half
// nearer the light sits a step brighter with a dithered turn, and the whole thing
// is pick-dressed with wrapping value noise, so it is rough cut stone rather than
// the smooth pressed panel of a spent question block.
//
// The palette matters as much as the drawing here. Above ground this is cut
// SANDSTONE now: the old near-white #95a0ac / #f0f4fa read as a poured concrete
// breeze block, and at weighted tile luminance 148 against a floor of 64 the 1-1
// staircase was the brightest object on the screen — brighter than the clouds,
// brighter than Mario. Shown beside the real 1-1, a player picked the original as
// "Mario" without hesitating.
// ---------------------------------------------------------------------------

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// The frame is fixed; `seed` re-rolls the pitching so two variants are two stones
// and not one stone printed twice.
function stairFace(seed) {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      // joint all the way round, with the four corners notched off so the block
      // reads as a dressed stone rather than as a square hole in a grid
      const notch = (x === 1 || x === 14) && (y === 1 || y === 14);
      if (x === 0 || y === 0 || x === 15 || y === 15 || notch) { s += '0'; continue; }
      if (x === 14 || y === 14) { s += '1'; continue; }
      if (x === 1 || y === 1) { s += '4'; continue; }
      if (x === 13 || y === 13) { s += '1'; continue; }
      if (x === 2 || y === 2) { s += '3'; continue; }
      // The face is not flat: the half of it nearer the light sits a whole step
      // brighter, with the boundary dithered so the turn is a turn and not a fold.
      // Pitching then rides on top — threshold set high on purpose so only about a
      // tenth of the face moves off its base tone, because a recognisable blotch
      // printed forty times up a staircase is worse than no texture at all.
      const lit = x + y + (BAYER4[y & 3][x & 3] / 15 - 0.5) * 3.4 < 14;
      const n = vnoise(x, y, 8, seed) + 0.55 * vnoise(x, y, 16, seed + 7);
      const tone = n > 1.02 ? 1 : n < -1.02 ? -1 : 0;
      s += String(Math.max(1, Math.min(4, (lit ? 3 : 2) + tone)));
    }
    rows.push(s);
  }
  return rows;
}

// Three pixels of chamfer at the corner the light hits, with the tone directly
// behind each stepped down so the cut reads as a cut and not as a dead pixel.
const STAIR_CHAMFER = ['553', '53.', '3..'];

// Wear is always a PAIR: a lone pixel reads as dirt on the lens and, on a tile this
// repetitive, repeats visibly.
const R_STAIR_A = px(stamp(stairFace(3), 1, 1, STAIR_CHAMFER), [
  [7, 3, '1'], [8, 3, '1'],
  [11, 6, '3'], [12, 6, '3'],
  [4, 10, '3'], [5, 10, '3'],
  [9, 11, '1'], [10, 11, '1'],
]);

// Variant B re-rolls the pitching, moves the chamfer to the far end of the arris
// and takes its wear out of the other side of the face.
const R_STAIR_B = px(stamp(stairFace(29), 11, 1, ['355', '.35', '..3']), [
  [4, 4, '3'], [5, 4, '3'],
  [9, 5, '1'], [10, 5, '1'],
  [3, 9, '1'], [4, 9, '1'],
  [10, 12, '3'], [11, 12, '3'],
]);


// The capped top step. Without this a staircase is a wall: no lit horizontal
// surface anywhere, so the eye never finds a tread. The cap runs edge to edge with
// no joint, so a run of them draws one unbroken lip along the top of the flight.
const R_STAIR_TOP = [
  '5555555555555555',
  '4444444444444444',
  '0444444444444410',
  ...R_STAIR_A.slice(3),
];

// ---------------------------------------------------------------------------
// CASTLE BRICKWORK — dressed ashlar: ONE big stone per course per tile, laid in
// half-bond so the perpend zigzags col 15 / col 7 / col 15 / col 7 down the wall.
//
// This is the tile that fails the tiling policy hardest when it fails, because a
// castle screen is nothing BUT this tile: 1-4 draws a twenty-by-twelve wall of it.
// The version before this one broke both clauses at the top of the file.
//
//   * it carried EIGHT hand-placed pits and gleams at fixed coordinates, so that
//     wall drew 240 copies of the same eight flecks on a perfect 16px lattice —
//     the loudest thing in the fortress was the tile grid;
//   * its three courses were 6 / 6 / 4 rows tall, so the vertical rhythm only
//     closed after a full 16 pixels and the change of course height marked every
//     horizontal seam.
//
// Now the courses are four rows each and the bond alternates every course, so the
// masonry pattern closes after EIGHT rows: there is no 16-pixel feature left in
// the tile for the eye to lock a grid onto. What was hand-placed damage is now
// wrapping value noise — the same field the staircase is pick-dressed with — which
// crosses every seam instead of stopping at one, and is a step of the ramp rather
// than a high-contrast fleck, so it reads as dressed stone and not as polka dots.
//
// The stone is 16px wide against the breakable brick's 8, which is what keeps
// "castle wall" and "smashable brick" two materials and not one drawing in two
// palettes — the two tiles used to differ almost entirely by paint.
// ---------------------------------------------------------------------------

function ashlarRows() {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    const ry = y & 3;
    // half-bond: the perpend sits at col 15 on even courses and col 7 on odd ones
    const joint = (y >> 2) & 1 ? 7 : 15;
    let s = '';
    for (let x = 0; x < 16; x++) {
      if (ry === 3 || x === joint) { s += '0'; continue; }   // bed joint / perpend
      // the arris just past the joint is the edge of the next stone, so it catches
      // the key light — that one lit column per course is what says "these are
      // separate blocks" without drawing a grid
      // The arris is structure, so the weathering is not allowed to eat it.
      // Two columns wide on the top row, one below: the lit corner of a dressed
      // stone is a chamfer, and a one-pixel specular that appears four times in
      // 256 is a top-of-ramp the eye never reaches.
      const off = (x - joint - 1 + 16) % 16;
      if (off === 0) { s += ry === 0 ? '4' : '3'; continue; }
      if (off === 1 && ry === 0) { s += '4'; continue; }
      // The face turns over three rows: a lit top edge, then the body. It does NOT
      // drop to shadow on the third row — that dropped the whole tile to 24
      // luminance units above the breakable brick, one short of the gap that lets a
      // player tell a wall they can open from a wall they cannot before they waste
      // a jump on it.
      const base = ry === 0 ? 3 : 2;
      // Pick-dressing only ever takes a pixel DOWN. Noise allowed to brighten as
      // well puts a scatter of specular flecks on the face, and a fleck at a fixed
      // coordinate is the exact fault this rewrite exists to remove — it does not
      // matter that noise chose the coordinate rather than a hand, it is still the
      // same coordinate in all 240 tiles of a 1-4 wall. Darkening only reads as
      // weathering, which is what a dressed face actually does.
      //
      // How far the noise has to dip depends on the row: the foot of a course
      // collects the grime and the cast shadow of the stone above it, the top edge
      // almost none. That gives each course a BROKEN dark line along its bottom
      // instead of a hard stripe, which is the difference between weathered
      // masonry and a ruled grid.
      const bite = ry === 2 ? -0.15 : ry === 1 ? -0.8 : -1.15;
      const n = vnoise(x, y, 8, 53) + 0.6 * vnoise(x, y, 16, 97);
      s += String(n < bite ? base - 1 : base);
    }
    rows.push(s);
  }
  return rows;
}

const R_CASTLE = ashlarRows();

// ---------------------------------------------------------------------------
// PIPES — rim is a full 32px wide, the stem is 28px (2px inset each side), so the
// lip overhangs exactly like the NES original. Both halves carry the same
// cross-section: outline, specular, lit, a long midtone belly, shadow, then a
// rim-bounce highlight two pixels in from the far edge — that bounce is what makes
// a cylinder read as a tube instead of a plank.
// ---------------------------------------------------------------------------

// The 28px stem cross-section, written out across the tile seam. No single tone may
// own more than 45% of it or the tube goes flat, and the mid->shadow handover is a
// 6-column ordered dither rather than a step, because a hard edge there reads as a
// painted stripe instead of a surface turning away from the light:
//
//   col 2 outline | 3-4 specular | 5-7 lit | 8-14 mid | 15-19 dither | 20-26 shadow
//   | 27 rim bounce | 28 shadow | 29 outline
//
// Counts: mid 9/28, shadow 11/28 — nothing above 40%.
//            0 1 2 3 4 5 6 7 8 9 A B C D E F
const PIPE_STEM_L = '..04433322222221';
const PIPE_STEM_R = '21211111111340..';
// Same section stretched over the 32px lip: the far edge climbs back out of shadow
// through slot 3 into a one-pixel slot-4 rim light hard against the outline, which
// is where a rim light actually sits on a cylinder — at the silhouette, not inset.
const PIPE_RIM_L  = '0443332222222222';
const PIPE_RIM_R  = '2121211111111340';

const R_PIPE_TL = [
  '0000000000000000',
  '0443333333333333',
  PIPE_RIM_L, PIPE_RIM_L, PIPE_RIM_L, PIPE_RIM_L,
  '0431111111111111',
  '0000000000000000',
  PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L,
  PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L, PIPE_STEM_L,
];

const R_PIPE_TR = [
  '0000000000000000',
  '3333333333333340',
  PIPE_RIM_R, PIPE_RIM_R, PIPE_RIM_R, PIPE_RIM_R,
  '1111111111111340',
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
// LAVA — a pool is one continuous molten field, and the ONLY way to draw that
// with a single repeated 16x16 tile is to make the tile a seamless texture with
// no landmark in it.
//
// The last set failed exactly there. It stamped a 4x4 cream bubble crown and two
// dark-red crust rosettes at fixed coordinates, so a 6x4 pool drew 24 copies of
// the same bright blob on a perfect 16px lattice — the tile grid was the loudest
// thing in the fortress. It was also thresholded so far up the ramp that 80% of
// the pixels were the top two body tones: a lit orange rectangle, weighted
// luminance 111 on a screen whose floor is 58.
//
// This one has no stamps in the body at all. Two INDEPENDENT fields do all the
// drawing, each one low harmonic (which gives the flow a direction) plus three
// octaves of wrapping value noise (which gives it irregularity — a sum of sines on
// its own came out as a regular diagonal weave of orange dashes that read as
// knitwear):
//
//   * MELT: the live channels. Translates +2px in x per frame, closing after eight;
//   * CRUST: the cooled plates riding on it, travelling (-2, +2) per frame — a
//     different velocity vector, so aligning two frames by the melt's shift leaves
//     the whole crust network as residual and aligning by the crust's leaves the
//     whole melt. The motion cannot be reproduced by sliding one frame over
//     another, which is the test this file's animation policy actually asks for.
//     Measured: 64% of the tile changes per frame, and the best single-shift
//     alignment of two adjacent frames still leaves 27% unexplained;
//   * where the crust is thick the pixel is cooled skin (slots 0-1); everywhere
//     else the melt picks deep / body / lit / hot, weighted DOWN so the pool is
//     dark rock with glowing veins through it. Both fields wrap, so nothing stops
//     at a seam, and the tile is now 74% slots 0-2 at weighted luminance 77.
//
// The bubbles moved to the SURFACE tile, where a pool only ever draws one row of
// them, and their column changes every frame through BUB_X so a waterline never
// grows two in the same place inside one loop.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
// SIXTEEN frames, not eight, and the drift is 1px per frame rather than 2.
//
// The fields are 16px periodic, so a loop of N frames drifting d pixels a frame only
// closes when N*d is a multiple of 16 — on EVERY axis the field is sampled on. At
// N = 8 that forced d into {0, 2, 4, 6, 8}, and d = 0 makes the crust identical in
// every frame and therefore in every tile, which puts the 16px lattice straight back.
// So 2px was the slowest legal non-zero drift and the pool had no choice but to lurch.
// N = 16 makes d = 1 legal: melt 16*1 = 16, crust 16*1 = 16 on both axes.
//
// Measured, per-frame slot churn over the loop:  8 frames @ 2px = 66.7%
//                                               16 frames @ 1px = 52.8%
//
// It also fixes a defect that had nothing to do with churn. The surface crest is
// indexed (x - CREST_DRIFT*f) mod 16, so IT has to close too, and at N = 8 with the
// old 3px crest drift 3*8 = 24 = 8 (mod 16): the waterline jumped eight pixels every
// time the loop wrapped. Nothing in the animation policy caught it because the policy
// compares adjacent frames, and frame 7 -> frame 0 is exactly the seam it skipped.
const LAVA_FRAMES = 16;
// Melt 1px/frame, crust 1px/frame on a different vector, crest 2px/frame — so the
// skin still visibly slides over the flow (2:1, where it used to be 3:2) and all three
// close on the sixteenth frame.
const LAVA_DRIFT = 1;
const CREST_DRIFT = 2;

// ONE low harmonic supplies the direction of flow; two octaves of wrapping value
// noise supply the irregularity. The first cut of this tile was four harmonics and
// nothing else, and it came out as a regular diagonal weave of orange dashes that
// read as knitwear.
const swirl = (x, y, fx, fy, ph) => Math.sin((TAU * fx * x) / 16 + (TAU * fy * y) / 16 + ph);

// The melt: the channels of live rock. Drifts +2px in x per frame.
function meltAt(x, y) {
  return (
    0.50 * swirl(x, y, 1, 2, 0.7) +
    0.92 * vnoise(x, y, 4, 11) +
    0.62 * vnoise(x, y, 8, 23) +
    0.30 * vnoise(x, y, 16, 37)
  );
}
// The crust: cooled plates floating on it. Drifts (-2, +2) per frame — a different
// velocity vector, so no single shift can align two frames.
function crustAt(x, y) {
  return (
    0.42 * swirl(x, y, 2, -1, 1.1) +
    0.98 * vnoise(x, y, 4, 47) +
    0.60 * vnoise(x, y, 8, 71) +
    0.26 * vnoise(x, y, 16, 91)
  );
}

// Body-dominant thresholds. Slot 4 is a vein core and slot 5 a pinprick; push
// these down and the tile turns back into cream carpet.
function lavaFlow(f) {
  const rows = [];
  const hot = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const c = crustAt(x + LAVA_DRIFT * f, y - LAVA_DRIFT * f);
      if (c > 0.86) { s += '0'; continue; }          // cooled plate, cold heart
      if (c > 0.34) { s += '1'; continue; }          // its dark-red skin
      const m = meltAt(x - LAVA_DRIFT * f, y);
      if (m > 0.80) {
        s += '4';
        // Candidates for the white-hot core, but NEVER on the border ring. The
        // fields themselves wrap exactly — vnoise's lattice lookup is taken mod cx
        // and swirl's harmonics have periods that divide 16, so meltAt(16, y) and
        // crustAt(16, y) equal their values at x = 0 to floating-point epsilon, and
        // measurement confirms most frames join as cleanly as their own interiors.
        // What did NOT wrap was this: slot 5 is the brightest colour in the ramp by
        // a distance, and ranking picked pixels anywhere in the tile, so a frame
        // that happened to put one on column 15 or column 0 planted a ~130-unit
        // colour step on the join. Frames 5 and 6 each did exactly that (seam ratio
        // 1.97 and 1.67 against ~1.0 for the frames that did not), and a lake draws
        // that same bright pixel down every tile column in the level. Excluding the
        // border ring costs nothing — the hottest interior pixel is just as hot.
        if (x > 0 && x < 15 && y > 0 && y < 15) hot.push([x, y, m]);
      }
      else if (m > 0.34) s += '3';
      else if (m > -0.34) s += '2';
      else s += '1';
    }
    rows.push(s);
  }
  // The three hottest pixels of the frame go white-hot. Picking them by value
  // rather than by threshold guarantees the top of the ramp is reached in EVERY
  // frame — a threshold that misses leaves a declared slot unused — and puts the
  // core where the flow is actually hottest instead of where a stamp was parked.
  hot.sort((a, b) => b[2] - a[2]);
  return px(rows, hot.slice(0, 3).map(([x, y]) => [x, y, '5']));
}

// Like stamp(), but the art wraps around the right edge — a bubble has to be able
// to leave the tile and come back or a pool shows where one tile ends.
function stampWrap(rows, ox, oy, art) {
  const out = stamp(rows, ox, oy, art);
  return ox + art[0].length > 16 ? stamp(out, ox - 16, oy, art) : out;
}

// NO STAMPED EVENT IN THE BODY TILE. The last set put a 4x3 cream bubble crown in
// every lava tile, and a bright cluster at a fixed coordinate is precisely how a
// 16x16 texture betrays its grid: a 6x4 pool drew 24 of them on a perfect lattice.
// Moving the crown to a different column each frame (BUB_X below) fixes the loop
// but not the lattice, because every tile on screen draws the same frame at the
// same tick — there is no per-tile phase to hide behind. The churn of two
// counter-moving fields is the motion; the bubbles belong on the surface tile,
// where a pool only ever draws one row of them.
const BUB_BORN = ['.5.', '444'];
const BUB_RISE = ['.44.', '4554', '.44.'];
const BUB_HIGH = ['.55.', '5445', '.44.'];
const BUB_POP = ['5.5', '.0.'];
const BUBBLE = [[BUB_BORN, 11], [BUB_RISE, 8], [BUB_HIGH, 5], [BUB_POP, 3]];
// A different column every frame of the eight, and never the same one twice, so a
// waterline never grows two bubbles in the same place inside one loop.
const BUB_X = [3, 11, 6, 14, 9, 1, 12, 5, 8, 2, 13, 0, 10, 4, 15, 7];

const lavaFrame = (f) => lavaFlow(f);


const R_LAVA = [];
for (let f = 0; f < LAVA_FRAMES; f++) R_LAVA.push(lavaFrame(f));

// A pool needs a waterline. Same body, but the top rows are replaced by a crest
// that travels 3px per frame against the 2px of the melt underneath it, so the
// skin visibly slides over the flow rather than riding on it.
const LAVA_CREST = [1, 1, 0, 0, 0, 1, 1, 2, 2, 2, 2, 1, 1, 0, 0, 1];

function lavaSurface(f) {
  const [art, by] = BUBBLE[f & 3];
  const body = stampWrap(lavaFrame(f), BUB_X[f], by, art);
  return body.map((row, y) => {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const t = LAVA_CREST[(((x - f * CREST_DRIFT) % 16) + 16) % 16];
      if (y < t) s += '.';
      else if (y === t) s += '5';
      else if (y === t + 1) s += '4';
      else if (y === t + 2) s += '3';
      else s += row[x];
    }
    return s;
  });
}

const R_LAVA_SURF = [];
for (let f = 0; f < LAVA_FRAMES; f++) R_LAVA_SURF.push(lavaSurface(f));


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
//    flips half the pixels in the tile and makes a submerged screen strobe, so the
//    Bayer field is FIXED across all four frames and only the light on it travels.
//    The first version of that rule was applied too literally: ONE nine-pixel
//    caustic set moved and 221 of 256 pixels were byte-identical across the entire
//    loop — 86% of a tile that covers a whole submerged screen never moved at all,
//    and a 7% per-frame delta is a cycle in name only.
//
//    So the light now has TWO frequencies that do not share a velocity. The primary
//    caustics travel (+2, -1) per frame; a second set eight pixels away travels
//    (-1, +1); and a bubble drifts up the right-hand side on a four-frame climb.
//    Aligning two frames by either caustic velocity still leaves the other set and
//    the bubble as residual, so the motion is not one drawing slid sideways.
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

// Primary caustic diagonals, travelling (+2, -1) per frame and wrapping.
const CAUSTICS = [
  [[2, 1], [3, 2], [4, 3]],
  [[9, 5], [10, 6], [11, 7]],
  [[5, 10], [6, 11], [7, 12]],
];

// The counter-set: the same dashes, rolled across the tile, travelling (-2, +1) —
// the opposite way at the same speed. Two velocities is the whole point, because
// one set on its own is a drawing being slid and a slid drawing is a fake cycle.
// They lean the SAME way as the primary set: a second family of diagonals at the
// other angle turned the tile into fishnet.
const CAUSTICS_B = [
  [[12, 0], [13, 1], [14, 2]],
  [[1, 6], [2, 7], [3, 8]],
  [[6, 13], [7, 14], [8, 15]],
];

// A bubble climbing the right-hand side, two pixels tall, one column of drift per
// frame so it never traces the same line twice inside the loop.
// SIXTEEN phases, not four, and NOT because the body needed more animation.
//
// The tile is 16px periodic, so every field drifting across it has to satisfy
// N*d = 0 (mod 16) or the loop does not close. Over four frames:
//
//   CAUSTICS    x +2/frame -> 4x2  =  8 (mod 16) = 8   DOES NOT CLOSE
//   CAUSTICS    y -1/frame -> 4x-1 = -4 (mod 16) = 12  DOES NOT CLOSE
//   CAUSTICS_B  x -2/frame -> 8                        DOES NOT CLOSE
//   CAUSTICS_B  y +1/frame -> 4                        DOES NOT CLOSE
//   light shaft x -4/frame -> 4x-4 = -16 (mod 16) = 0  closes
//
// So both caustic sets jumped 8px sideways and 4px vertically every time the loop
// wrapped, on the tile that covers a whole submerged screen, in all five themes. Only
// the shaft was correct. It had been doing that since the tile was written.
//
// The fix is the FRAME COUNT, not the drifts, and that is deliberate: x needs a
// multiple of 8 frames and y a multiple of 16, so 16 is the smallest count that closes
// with the drifts untouched. Changing the drifts instead would have meant 4px/frame on
// both axes — double the horizontal speed and quadruple the vertical — which turns the
// caustics from a 2:1 lean into 45-degree streaks. This way frames 0-3 are BYTE-
// IDENTICAL to the four that shipped before; the other twelve simply finish the cycle
// the old set never completed. Nothing about how the water looks moment to moment
// changes, and the jump is gone.
//
// A bubble climbing the right-hand side, two pixels tall, one column of drift per
// frame so it never traces the same line twice inside the loop. Generated rather than
// listed so it cannot fall out of step with the frame count again — and the formula
// reproduces the original four exactly.
const WATER_PHASES = 16;
const WATER_BUBBLE = Array.from({ length: WATER_PHASES }, (_, f) => [13 - (f & 1), (12 - 4 * f) & 15]);

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
  for (const line of CAUSTICS_B) {
    for (const [x, y] of line) {
      edits.push([(x - phase * 2 + 16) & 15, (y + phase) & 15, '3']);
    }
  }
  const [bx, by] = WATER_BUBBLE[phase];
  edits.push([bx, by, '2'], [bx, (by + 1) & 15, '2'], [(bx + 1) & 15, by, '0']);
  const out = px(rows, edits);
  // A shaft of light raking through the water, parallel to the caustics: a 2px band
  // travelling 4px per frame, wrapping after four in x AND in y. It lifts the base
  // tone one notch and leaves the dark sprinkle and the caustics alone, so it is
  // the LIGHT moving over the material and not the material being re-rolled — but
  // it touches thirty-odd pixels, which is what finally gives the body tile a cycle
  // a player can see. Every row gets exactly two band pixels, so the tile is still
  // value-uniform row by row and a column of them still stacks without banding.
  return out.map((row, y) => {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const d = (((x - y - 4 * phase) % 16) + 16) % 16;
      s += d < 2 && row[x] === '1' ? '2' : row[x];
    }
    return s;
  });
}

const R_WATER_BODY = Array.from({ length: WATER_PHASES }, (_, i) => waterBody(i));

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
      // The shadow a crest throws into the water behind it: one pixel tall, only
      // under the two highest columns. As a 3x2 block it punched a hole in the wave.
      else if (y === t + 4 && t <= 1) s += t === 0 ? '0' : '1';
      else s += String(waterField(x, y) + 1);
    }
    rows.push(s);
  }
  return rows;
}

const R_WATER_SURF = [0, 1, 2, 3].map(waterSurface);

// Depth lives here, not in the bitmap: each step slides the 4-colour window one
// notch down the 7-colour WATER_PAL, so a deep tile is the same drawing lit less.
// Step 0 is the window the surface tile's own sub-foam field uses, which is why the
// seam under a crest is invisible; steps 1 and 2 are the same drawing further down.
const waterDepthPal = (theme, d) => WATER_PAL[theme].slice(2 - d, 6 - d);
const waterSurfPal = (theme) => WATER_PAL[theme].slice(1);


// ---------------------------------------------------------------------------
// FLAGPOLE
// ---------------------------------------------------------------------------

// The shaft is a 4px cylinder with an outline on BOTH sides — a pole read against
// open sky needs a dark edge either side or the sky eats it — and it carries the
// full ramp across those four columns (spec, lit, mid, shadow). Skipping the
// midtone, as the old 3px shaft did, turned a round mast into a folded ribbon.
const POLE_ROW = '.....043210.....';
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
// CORAL — staghorn.
//
// The last cut solved the wrong problem. It fixed an earlier tile that was 92
// pixels of pure black by filling the whole cell with midtone, and ended up 196 of
// 256 pixels (77%) in two ADJACENT midtones with six pixels of highlight in the
// entire tile. At 1x that is not staghorn coral, it is a square of brown gravel:
// no value range means no form, and the stalks the comment described could not be
// seen at all.
//
// This one widens the range instead of adding more midtone wander. The gap between
// branches is slot 0 — that gap is a shaded crevice, so it should be the darkest
// thing in the tile — and every branch is read out as a CROSS-SECTION rather than
// by looking at whether the pixel next door is empty: lit arris, core, shadow
// flank, crevice, straight across. That is what puts the whole ramp on every
// stalk. Measured: no slot above 39% of the tile and 47 pixels across slots 3-5,
// against 77% in two adjacent midtones and six highlight pixels before.
//
// Coral is SOLID terrain, so the silhouette is the whole cell; the structure lives
// inside it.
// ---------------------------------------------------------------------------

// The branches are wavy DIAGONALS on an 8px pitch — 8 divides 16, so the pattern
// wraps and a wall of coral grows through every seam — and the offset of each is
// perturbed by wrapping noise so no two are the same width or take the same wander.
// Three hand-placed stalks at fixed columns were tried first and produced a regular
// weave: a basket, not a reef, because every branch was the same width and every
// gap the same gap.
const coralWave = (x, y) => 2.7 * vnoise(x, y, 4, 7, 4) + 1.15 * vnoise(x, y, 8, 23, 8);

function coralRows() {
  const rows = [];
  const cand = [];
  for (let y = 0; y < 16; y++) {
    let s = '';
    for (let x = 0; x < 16; x++) {
      const p = (((x + y + coralWave(x, y)) % 8) + 8) % 8;
      if (p < 0.95) s += '3';                    // arris facing the light
      else if (p < 3.5) s += '2';                // core of the branch
      else if (p < 4.9) s += '1';                // flank turning away
      else s += '0';                             // crevice between branches
      if (p > 1.1 && p < 3.0 && y > 1 && y < 14) cand.push([x, y, hash2(x, y, 313)]);
    }
    rows.push(s);
  }
  // Five polyp clusters on the lit shoulders of the branches: a 3px slot-4 cap
  // with a slot-5 wet pip in the middle of each. Choosing them by rank rather than
  // by a threshold guarantees the top of the ramp is reached — a coral tile whose
  // brightest tone appears six times in 256 pixels has no highlight at all.
  const caps = [];
  cand.sort((a, b) => a[2] - b[2]);
  const taken = [];
  for (const [x, y] of cand) {
    if (caps.length >= 15) break;
    if (taken.some(([tx, ty]) => Math.abs(tx - x) < 4 && Math.abs(ty - y) < 3)) continue;
    taken.push([x, y]);
    caps.push([(x + 15) % 16, y, '4'], [x, y, '5'], [(x + 1) % 16, y, '4']);
  }
  return px(rows, caps);
}

const R_CORAL = coralRows();

// ---------------------------------------------------------------------------
// ONE-WAY PLATFORM — planked lift, 8px deep, open underneath. The cap is
// scalloped and two tie-rods hang below the deck: from a distance the broken
// outline is the only thing telling the player they can pass through it.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CLOUD BLOCK — the floor of coin heaven, and its bricks too. In the original
// this is metatile $88, "cloud level terrain", with four CHR tiles of its own
// ($b0-$b3) — not the brick in another palette, which is why nothing we already
// had could stand in for it. BrickMetatiles' fifth entry is $88 as well, chosen
// when CloudTypeOverride is set, so in those areas the floor AND every row of
// bricks are this one tile. It is the only thing in the room.
//
// Solid, and deliberately drawn as solid: puffed lobes along the top and a flat
// shadowed underside, so it reads as something you stand ON rather than
// something you pass through. The one-way platform is the tile that has to look
// permeable, and it does that with a broken outline; this must not borrow it.
// ---------------------------------------------------------------------------

const CLOUD_PAL = ['#3050a0', '#6a90d8', '#b8d4f4', '#e8f4ff', '#ffffff'];

const R_CLOUD_BLOCK = [
  '..333..3333..33.',
  '.34443344444.344',
  '3444444444444444',
  '4444444444444444',
  '4444444444444444',
  '3444444444444444',
  '3344444444444444',
  '2334444444444444',
  '2223344444444443',
  '2222233444444332',
  '1222222333443322',
  '1122222222222222',
  '0112222222222221',
  '0011122222222111',
  '0001111111111110',
  '0000000000000000',
];

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

// The muzzle is a BORED HOLE, not a black sticker. Slot 5 is the black core, slot 6
// a machined rim-light on the upper-left inner edge where the bevel catches the key,
// slot 7 the depth on the lower-right that the light never reaches. The aperture is
// mirror-symmetric about y = 7: rows 4/10 and 5/9 carry the same silhouette, so the
// hole is round instead of pear-shaped, which is what the old asymmetric outline
// made it.
const R_CANNON_BARREL = px(
  [
    '0000000000000000',
    '0444444444444410',
    '0433333333333210',
    '0432244444422210',
    '0432460000642210',
    '0432605555506210',
    '0434055557501210',
    '0434055577501210',
    '0434055577501210',
    '0432055777501210',
    '0432605555706210',
    '0432460000642210',
    '0432244444422210',
    '0421111111111110',
    '0111111111111110',
    '0000000000000000',
  ],
  [[2, 4, '3'], [13, 11, '2'], [3, 12, '3']]
);

// A plate, not a rung. A horizontal seam at the top of each plate, a right-hand
// falloff so the pedestal turns away from the light, and rivets big enough to read
// as raised bosses: slot 4 on the lit corner, slot 1 on the shaded one.
const R_CANNON_BASE = px(
  [
    '0400000000000010',
    '0443333333322110',
    '0433333333322110',
    '0432222222221110',
    '0432222222221110',
    '0432222222221110',
    '0432222222211110',
    '0432111111111110',
    '0400000000000010',
    '0443333333322110',
    '0433333333322110',
    '0432222222221110',
    '0432222222221110',
    '0432222222221110',
    '0432222222211110',
    '0432111111111110',
  ],
  [
    [4, 4, '4'], [5, 4, '4'], [4, 5, '4'], [5, 5, '1'],
    [10, 4, '4'], [11, 4, '4'], [10, 5, '4'], [11, 5, '1'],
    [4, 12, '4'], [5, 12, '4'], [4, 13, '4'], [5, 13, '1'],
    [10, 12, '4'], [11, 12, '4'], [10, 13, '4'], [11, 13, '1'],
  ]
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
    // the mouth the beanstalk climbs out of
    [5, 12, '0'], [6, 12, '0'], [7, 12, '0'], [8, 12, '0'], [9, 12, '0'], [10, 12, '0'],
    [5, 13, '0'], [6, 13, '5'], [7, 13, '5'], [8, 13, '5'], [9, 13, '5'], [10, 13, '0'],
    // Stem: two pixels wide the whole way, lit tone ALWAYS on the left and shadow
    // ALWAYS on the right. The old stem swapped its lit edge from side to side as
    // it jogged, which is what turned a beanstalk into a green zigzag.
    [7, 12, '7'], [8, 12, '6'],
    [7, 11, '7'], [8, 11, '6'],
    [7, 10, '7'], [8, 10, '6'],
    [6, 9, '7'], [7, 9, '6'],
    [6, 8, '7'], [7, 8, '6'],
    [6, 7, '7'], [7, 7, '6'],
    [7, 6, '7'], [8, 6, '6'],
    [7, 5, '7'], [8, 5, '6'],
    [8, 4, '7'], [9, 4, '6'],
    [8, 3, '7'], [9, 3, '6'],
    [9, 2, '7'], [10, 2, '6'],
    // Left leaf — a 4x3 teardrop with a lit top, a bright core and a shadowed
    // underside, joined to the stem instead of floating beside it.
    [2, 7, '7'], [3, 7, '7'],
    [2, 8, '7'], [3, 8, '8'], [4, 8, '8'], [5, 8, '7'],
    [3, 9, '6'], [4, 9, '6'],
    // right leaf, with its stalk reaching back to the stem
    [11, 3, '7'], [12, 3, '7'],
    [9, 4, '7'], [10, 4, '7'], [11, 4, '8'], [12, 4, '8'], [13, 4, '7'],
    [11, 5, '6'], [12, 5, '6'],
  ]
);

// ---------------------------------------------------------------------------
// non-ramp palettes — one entry per theme, because a tile that ships identical in
// all five themes is a tile nobody drew for four of them.
// ---------------------------------------------------------------------------

// [abyss, depth, deep body, mid body, lit body, caustic, foam] — seven notches so
// waterDepthPal can slide a four-colour window three steps down it. The window is
// what makes a pool deepen; the drawing never changes.
const WATER_PAL = {
  overworld:   ['#02142c', '#052a55', '#0f5a86', '#2088c0', '#4fc0e8', '#b5ebf2', '#ffffff'],
  // The mid body used to be '#0a4a90', 26 RGB and under 10 luminance units from the
  // deep body beside it — the tightest step of any liquid ramp outside the castle's
  // deliberately cold key, and the two slots the water body tile dithers BETWEEN.
  // A cave pool was therefore drawing its whole ordered-dither field in one colour.
  // The other four themes hold 70-76 across the same step; this now holds 70.
  underground: ['#01060f', '#052a55', '#083f78', '#0f68b0', '#2f8ad0', '#9fd6f2', '#ffffff'],
  // Cold, not emerald. A saturated green pool was the loudest thing on a castle
  // screen and it collided head-on with the one object the castle rule reserves
  // saturation for — the pipe. This one stays liquid, keeps a non-black darkest
  // slot, and sits in the same cold key as the masonry.
  castle:      ['#03141e', '#082430', '#0c3c50', '#14586e', '#2c8098', '#88c0d0', '#d8eef4'],
  water:       ['#021530', '#052a55', '#0d5090', '#1c74cc', '#4fa8ec', '#bcdfff', '#ffffff'],
  athletic:    ['#02102a', '#062450', '#0e4a92', '#2070c8', '#3f9ce0', '#a0d8f4', '#ffffff'],
};

// [crust, deep, body, lit, hot, white-hot]. Six notches, and the pool is drawn
// BODY-DOMINANT: the old set thresholded so hard toward the top of the ramp that a
// lava tile came out a flat sheet of cream-flecked orange, weighted luminance 111 in
// a theme whose floor is 52 — the pool was the brightest thing in the fortress and
// it read as a lit rectangle rather than as molten rock. Lava's darkest tone is
// still a blood red, never a brown-black, so a cooled crust plate stays legible as
// lava when the tile sits right next to brown ground.
const LAVA_PAL = {
  overworld:   ['#4a0600', '#8c1200', '#c42c00', '#ee5c04', '#ff9c1c', '#ffc84c'],
  underground: ['#400a04', '#761000', '#a82400', '#d05204', '#ee8a18', '#ffb03c'],
  castle:      ['#520400', '#9a1400', '#d43200', '#fa7010', '#ffae34', '#ffd868'],
  water:       ['#440612', '#7e0c1c', '#b42018', '#e05418', '#f89434', '#ffbc60'],
  athletic:    ['#4e0c00', '#902000', '#cc3e00', '#f47a10', '#ffb838', '#ffd66c'],
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
  overworld:   ['#42201a', '#7e3020', '#b04c30', '#dc7a52', '#f8c49a', '#fff2e0'],
  underground: ['#2e1436', '#5a2062', '#8a3492', '#b85ac0', '#e8a8e8', '#ffffff'],
  castle:      ['#241a20', '#4a3440', '#6a505c', '#8e7480', '#c4b0b8', '#ffffff'],
  water:       ['#48163a', '#802854', '#c03470', '#ff83c0', '#ffcce5', '#ffffff'],
  athletic:    ['#1c3620', '#2e5e28', '#498c38', '#78b850', '#c8e896', '#ffffff'],
};

const STONE_DEEP = {
  overworld: '#2a1020', underground: '#241806', castle: '#181212',
  water: '#0c1420', athletic: '#0c1a0c',
};
// Chamfer highlight on the staircase block — tied to QUARRY, never a bare #ffffff
// dropped on a coloured face.
const QUARRY_LIT = {
  overworld: '#fff0d4', underground: '#e0f8e4', castle: '#ffffee',
  water: '#ffe8f4', athletic: '#f4ffff',
};

// SPENT GOLD — the used block. Reads as the SAME block as the question block (same
// gold family, same bevel) but drained of light. It stays GOLD rather than sliding
// to brown: the old ramp landed 24 units from the overworld floor and within two
// luminance units of it, so in the theme where nearly every used block in the game
// appears, a spent block was the same colour and the same value as the ground under
// it. This one holds 46 from EARTH.overworld and reads 28 luminance units above it,
// while still sitting far below the live block's peak.
const GOLD_SPENT = ['#5c4410', '#8a6a1c', '#b08e34', '#d0b060'];

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
  // Extensions past the ARCHITECTURE legend: the top row of a lava pool and the
  // capped top step of a staircase. Both are the same collision class as the tile
  // they cap, so a level can adopt them by swapping a character.
  LAVA_SURF: 36, STAIR_TOP: 37,
  // Coin heaven's floor and bricks alike; see R_CLOUD_BLOCK.
  CLOUD_BLOCK: 38,
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
  const surfPal = waterSurfPal(theme);
  const lava = LAVA_PAL[theme];
  const S = (rows, palette, name) => makeSprite(rows, palette, { name: `${theme}:${name}` });
  // Question block: slot 0 is the theme outline, 1-4 are the gold ramp, 5-6 glyph.
  const qp = (ramp) => [earth[0], ramp[0], ramp[1], ramp[2], ramp[3], GLYPH[0], GLYPH[1]];

  // The idle sweep runs on ONE ramp. Cycling the palette between idle frames is the
  // "brightness flash" that makes a whole screen of blocks pulse in unison; the
  // struck frames are the only ones allowed to change the block's overall level.
  const qa = S(R_QUESTION_A, qp(GOLD), 'question-idle-0');
  const qb = S(R_QUESTION_B, qp(GOLD), 'question-idle-1');
  const qc = S(R_QUESTION_C, qp(GOLD), 'question-idle-2');
  const qd = S(R_QUESTION_D, qp(GOLD), 'question-idle-3');
  const qhit = S(R_QUESTION_HIT, qp(GOLD_MID), 'question-hit');
  const qpress = S(R_QUESTION_PRESS, qp(GOLD_DIM), 'question-pressed');
  const qrise = S(R_QUESTION_RISE, qp(GOLD_RISE), 'question-rebound');
  const lavaF = R_LAVA.map((rows, i) => S(rows, lava, `lava-${i}`));
  const lavaS = R_LAVA_SURF.map((rows, i) => S(rows, lava, `lava-surf-${i}`));
  const [lavaA, lavaB, lavaC] = [lavaF[0], lavaF[3], lavaF[5]];
  // Four phases of one drawing. The crest travels 4px per frame and wraps after
  // sixteen; the field under it never moves.
  const surf = R_WATER_SURF.map((rows, i) => S(rows, surfPal, `water-surface-${i}`));
  // Depth step 0 is the tile that sits directly under a surface tile; 1 and 2 are
  // the same four phases lit one and two notches further down the ramp.
  const bodies = [0, 1, 2].map((d) =>
    R_WATER_BODY.map((rows, i) => S(rows, waterDepthPal(theme, d), `water-body-${d}-${i}`))
  );
  const [surfA, surfB] = [surf[0], surf[2]];
  const [bodyA, bodyB] = [bodies[0][0], bodies[0][2]];
  const groundA = S(R_GROUND_A, earth, 'ground-a');
  const groundB = S(R_GROUND_B, earth, 'ground-b');
  const quarryPal = pal(quarry, QUARRY_LIT[theme]);
  const stairA = S(R_STAIR_A, quarryPal, 'stair-a');
  const stairB = S(R_STAIR_B, quarryPal, 'stair-b');

  const anims = {
    question: new Anim([qa, qb, qc, qd], 9),
    questionBump: new Anim([qhit, qpress, qrise, qa], [3, 4, 4, 3], false),
    lava: new Anim(lavaF, 5),
    lavaSurf: new Anim(lavaS, 5),
    water: new Anim(surf, 8),
    waterBody: new Anim(bodies[0], 10),
  };

  const t = {};
  t[TID.GROUND] = groundA;
  t[TID.BRICK] = S(R_BRICK, brick, 'brick');
  t[TID.Q_COIN] = qa;
  t[TID.Q_ITEM] = qa;
  t[TID.USED] = S(R_USED, [earth[0], ...GOLD_SPENT], 'used');
  // SOLID BLOCK. The original indexes SolidBlockMetatiles by AreaType, and in two of
  // the four areas the entry is the SAME metatile as TerrainMetatiles':
  //
  //   AreaType        terrain   solid block   brick
  //   0 water           $69        $69         $22     <- solid block IS the terrain
  //   1 ground          $54        $61         $51
  //   2 underground     $52        $61         $52
  //   3 castle          $62        $62         $52     <- solid block IS the terrain
  //
  // (AreaType is confirmed by AreaDataHOffsets .db $00,$03,$19,$1c indexing
  // AreaDataAddrLow, which runs L_WaterArea1-3, L_GroundArea1-22, then underground,
  // then castle; and by `cpy #$03 ;check if we are on castle level` at asm:1547.)
  //
  // So in a castle or a water area a solid block is not a different OBJECT standing
  // in the wall — it is the wall, and the player reads it as unbreakable because it
  // looks like the terrain, not because it looks like a special block. Ours drew the
  // bevelled STONE block in every theme, which in 1-4 put tan blocks against
  // blue-slate masonry: a material the original does not have there.
  //
  // Only the ground and underground areas give the solid block a metatile of its own
  // ($61 against terrain $54 and $52), so those two keep the STONE drawing. `athletic`
  // is not an SMB AreaType at all — the sky levels are AreaType 1 with a different
  // AreaStyle, and these tables are indexed by AreaType only — so it follows ground
  // and keeps its own block too.
  const solidIsTerrain = theme === 'castle' || theme === 'water';
  t[TID.STONE] = solidIsTerrain ? groundA : S(R_STONE, pal(stone, STONE_DEEP[theme]), 'stone');
  t[TID.STAIR] = stairA;
  t[TID.STAIR_TOP] = S(R_STAIR_TOP, quarryPal, 'stair-top');
  t[TID.LAVA_SURF] = lavaS[0];
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
  t[TID.CANNON_BARREL] = S(R_CANNON_BARREL, pal(stone, BORE, BORE_RIM, BORE_DEEP), 'cannon-barrel');
  t[TID.CANNON_BASE] = S(R_CANNON_BASE, stone, 'cannon-base');
  // On TIMBER, not BRICK: a block that hands you a beanstalk must not ship the
  // exact palette of the block you are meant to smash.
  t[TID.VINE_BLOCK] = S(R_VINE_BLOCK, pal(timber, ...VINE_INK), 'vine-block');
  // Not themed: a cloud area is a cloud area whatever theme it declares.
  t[TID.CLOUD_BLOCK] = S(R_CLOUD_BLOCK, CLOUD_PAL, 'cloud-block');

  return {
    tiles: t,
    anims,
    ground: [groundA, groundB],
    stair: [stairA, stairB],
    lavaF,
    lavaS,
    surf,
    bodies,
    depth: bodies.map((b) => b[0]),
    frames: {
      qa, qb, qc, qd, qhit, qpress, qrise,
      lavaA, lavaB, lavaC, surfA, surfB, bodyA, bodyB,
    },
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

// THEME_WATER_PHASES[theme] -> [p0, p1, p2, p3] surface tiles, each the crest
// translated 4px right. Index by (tileX & 3) as well as by tick and the crest
// travels along the pool instead of every tile pumping in unison.
export const THEME_WATER_PHASES = {
  overworld: BUILT.overworld.surf,
  underground: BUILT.underground.surf,
  castle: BUILT.castle.surf,
  water: BUILT.water.surf,
  athletic: BUILT.athletic.surf,
};

// THEME_WATER_DEPTH[theme][d] -> body tile lit d notches deeper (d = 0..2).
// Depth is a palette window, never a gradient inside the tile, so a column of these
// stacks without drawing a band every 16 pixels.
export const THEME_WATER_DEPTH = {
  overworld: BUILT.overworld.depth,
  underground: BUILT.underground.depth,
  castle: BUILT.castle.depth,
  water: BUILT.water.depth,
  athletic: BUILT.athletic.depth,
};

// Full 3 x 4 grid: [depthStep][phase].
export const THEME_WATER_BODIES = {
  overworld: BUILT.overworld.bodies,
  underground: BUILT.underground.bodies,
  castle: BUILT.castle.bodies,
  water: BUILT.water.bodies,
  athletic: BUILT.athletic.bodies,
};

export const waterDepth = (theme, tilesBelowSurface = 0) => {
  const set = THEME_WATER_DEPTH[theme] || THEME_WATER_DEPTH.overworld;
  return set[Math.max(0, Math.min(set.length - 1, tilesBelowSurface))];
};

export const waterPhase = (theme, tileX = 0, tick = 0) => {
  const set = THEME_WATER_PHASES[theme] || THEME_WATER_PHASES.overworld;
  return set[(tileX + (tick >> 3)) & (set.length - 1)];
};

// THEME_STAIR[theme] -> [variantA, variantB]. Two differently pitched stones, so a
// flight of steps alternates instead of printing one drawing forty times.
export const THEME_STAIR = {
  overworld: BUILT.overworld.stair,
  underground: BUILT.underground.stair,
  castle: BUILT.castle.stair,
  water: BUILT.water.stair,
  athletic: BUILT.athletic.stair,
};

export const stairVariant = (theme, tileX = 0, tileY = 0) =>
  (THEME_STAIR[theme] || THEME_STAIR.overworld)[(tileX + tileY) & 1];

// THEME_LAVA_FRAMES[theme] -> the eight frames of the pool, so a caller with tile
// coordinates can DE-PHASE a pool the way waterPhase de-phases a wave. Every cell
// of a pool drawing the identical frame at the identical tick is what turned the
// last lava into a 16px lattice; the body tile itself is now a seamless texture
// with no landmark in it, and this is the second line of defence for any renderer
// that can pass coordinates in.
export const THEME_LAVA_FRAMES = {
  overworld: BUILT.overworld.lavaF,
  underground: BUILT.underground.lavaF,
  castle: BUILT.castle.lavaF,
  water: BUILT.water.lavaF,
  athletic: BUILT.athletic.lavaF,
};

export const THEME_LAVA_SURF_FRAMES = {
  overworld: BUILT.overworld.lavaS,
  underground: BUILT.underground.lavaS,
  castle: BUILT.castle.lavaS,
  water: BUILT.water.lavaS,
  athletic: BUILT.athletic.lavaS,
};

// De-phase along X ONLY. `tileY` is still accepted so callers do not have to change,
// but its coefficient is deliberately ZERO, and that is a measured result rather than
// a preference. This used to be `tileX * 3 + tileY * 5`, which de-phased in both axes
// and quietly traded one lattice for another.
//
// A lava frame is generated from value noise that wraps mod 16, so a frame tiles
// seamlessly with ITSELF — but two DIFFERENT frames have no such guarantee at the
// join, because the crust field drifts (-2, +2) per frame. Neighbours five frames
// apart are therefore ten pixels out of register vertically. Measured on a full-screen
// lava lake as the mean colour step across a tile boundary divided by the same step
// inside a tile (1.0 = the boundary is indistinguishable from the interior):
//
//   va vb   column seam   row seam   frames on screen
//    0  0      1.857        0.936      1   (uniform — the old, un-phased behaviour)
//    3  5      1.324        2.017      8   (de-phased in both axes: rows twice as bad)
//    1  1      1.351        1.566      8
//    2  3      1.363        1.906      8
//    1  0      1.371        0.923      8
//    3  0      1.252        0.890      8   <- this
//
// Any non-zero Y coefficient puts a visible horizontal band across every 16th row,
// which is the same lattice fault rotated ninety degrees. Dropping it keeps all eight
// frames on screen, keeps the vertical join at 0.890 (below even the uniform tile's
// 0.936) and gives the best column figure of the lot.
//
// CORRECTION TO AN EARLIER NOTE HERE, which claimed the uniform tile had a vertical
// seam of its own and scored 1.857. That figure was a measurement artifact: it was
// taken off the SCREEN from a single frame that happened to be one of the three with
// a white-hot pixel near the edge, and compared against a de-phased figure that
// averaged all eight frame pairings. Measured properly on the sprite data, the tile
// wraps: vnoise takes its lattice lookup mod cx and swirl's harmonics have periods
// dividing 16, so meltAt(16, y) and crustAt(16, y) equal their x = 0 values to
// floating-point epsilon (max error 1.0e-15), and for all eight frames the join
// column-pair sits INSIDE the spread of that frame's own fifteen interior column
// pairs — never above it. There is no seam in the texture.
//
// The seam is created by DE-PHASING, and its size is set by the stride. Tile k draws
// frame (va*k + beat); its neighbour is va frames further on; the melt drifts
// LAVA_DRIFT pixels per frame, so the two are va*LAVA_DRIFT pixels out of register at
// the join, mod 16. That is the whole reason the stride matters, and it got four times
// cheaper when the loop went to sixteen frames: at 8 frames the drift had to be 2px, so
// stride 3 cost SIX pixels of register error; at 1px it costs three.
//
// Two constraints pick the stride. It must be ODD, or gcd(stride, 16) > 1 and the lake
// repeats in fewer than sixteen tiles. And smaller is better for the join. Stride 1 is
// the minimum on both counts — one pixel of register error, a full 16-tile period, and
// each tile exactly one frame ahead of its neighbour, so the flow progresses smoothly
// across the pool instead of jumping. That last property is worth more at 16 frames
// than it was at 8: a one-frame step is now a one-pixel step, so a lake reads as one
// travelling surface rather than a mosaic of independent cells.
//
// world.js's _bindTileVariants carries its own copy of the stride and the tick shift;
// the two must agree, and the waterline's must agree with the body's or the crest
// slides against the flow it is supposed to be riding.
// Twice the frames at half the drift is the same speed only if the frames advance
// twice as often, hence >> 2 where the four-phase water still uses >> 3.
export const LAVA_STRIDE = 1;
export const LAVA_TICK_SHIFT = 2;

export const lavaPhase = (theme, tileX = 0, tileY = 0, tick = 0) => {
  const set = THEME_LAVA_FRAMES[theme] || THEME_LAVA_FRAMES.overworld;
  return set[(tileX * LAVA_STRIDE + (tick >> LAVA_TICK_SHIFT)) & (set.length - 1)];
};

export const lavaSurfPhase = (theme, tileX = 0, tick = 0) => {
  const set = THEME_LAVA_SURF_FRAMES[theme] || THEME_LAVA_SURF_FRAMES.overworld;
  return set[(tileX * LAVA_STRIDE + (tick >> LAVA_TICK_SHIFT)) & (set.length - 1)];
};

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
export const T_QUESTION_HIT = OWF.qhit;
export const T_QUESTION_PRESS = OWF.qpress;
export const T_QUESTION_RISE = OWF.qrise;
export const T_QUESTION_BUMP = BUILT.overworld.anims.questionBump;
export const T_USED = OW[TID.USED];
export const T_QUESTION_USED = OW[TID.USED];
export const T_STONE = OW[TID.STONE];
export const T_STAIR = OW[TID.STAIR];
export const T_STAIR_A = BUILT.overworld.stair[0];
export const T_STAIR_B = BUILT.overworld.stair[1];
export const STAIR_VARIANTS = BUILT.overworld.stair;
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
export const T_LAVA_FRAMES = BUILT.overworld.lavaF;
export const T_LAVA_SURF_A = BUILT.overworld.lavaS[0];
export const T_LAVA_SURF_B = BUILT.overworld.lavaS[3];
export const T_LAVA_SURF_C = BUILT.overworld.lavaS[5];
export const T_LAVA_SURF = BUILT.overworld.lavaS[0];
export const T_LAVA_SURF_ANIM = BUILT.overworld.anims.lavaSurf;
export const T_STAIR_TOP = OW[TID.STAIR_TOP];
export const T_WATER_SURF_A = OWF.surfA;
export const T_WATER_SURF_B = OWF.surfB;
export const T_WATER_SURF = OWF.surfA;
export const T_WATER_ANIM = BUILT.overworld.anims.water;
export const T_WATER_BODY_A = OWF.bodyA;
export const T_WATER_BODY_B = OWF.bodyB;
export const T_WATER_BODY = OWF.bodyA;
export const T_WATER_BODY_ANIM = BUILT.overworld.anims.waterBody;
export const T_WATER_SURF_PHASES = BUILT.overworld.surf;
export const T_WATER_BODY_PHASES = BUILT.overworld.bodies[0];
export const T_WATER_BODY_DEPTH = BUILT.overworld.depth;
export const T_FLAG_POLE = OW[TID.FLAG_POLE];
export const T_FLAG_BALL = OW[TID.FLAG_BALL];
export const T_CASTLE_BRICK = OW[TID.CASTLE_BRICK];
export const T_CORAL = OW[TID.CORAL];
export const T_PLATFORM = OW[TID.PLATFORM];
export const T_CANNON_BARREL = OW[TID.CANNON_BARREL];
export const T_CANNON_BASE = OW[TID.CANNON_BASE];
export const T_VINE_BLOCK = OW[TID.VINE_BLOCK];
export const T_CLOUD_BLOCK = OW[TID.CLOUD_BLOCK];

// ---------------------------------------------------------------------------
// tile table
// ---------------------------------------------------------------------------

export const TILES = {
  0: { name: 'air', solid: false, sprite: null },
  1: { name: 'ground', solid: true, sprite: T_GROUND, variants: GROUND_VARIANTS },
  2: { name: 'brick', solid: true, sprite: T_BRICK, breakable: true },
  3: {
    name: 'question', solid: true, sprite: T_QUESTION, question: true,
    animated: T_QUESTION_ANIM, bump: T_QUESTION_BUMP, contains: 'coin', becomes: 7,
  },
  4: {
    name: 'question-item', solid: true, sprite: T_QUESTION, question: true,
    animated: T_QUESTION_ANIM, bump: T_QUESTION_BUMP, contains: 'mushroom', becomes: 7,
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
  // `capTop` names the tile this one turns into when nothing of its own kind is
  // directly above it: the top step of a flight, the waterline of a pool. spriteFor
  // and animatedSpriteFor apply it from the neighbour id; a renderer that only has
  // the record can read it straight off here.
  9: { name: 'stair', solid: true, sprite: T_STAIR, variants: STAIR_VARIANTS, capTop: 37 },
  10: { name: 'pipe-tl', solid: true, sprite: T_PIPE_TL, pipe: 'tl' },
  11: { name: 'pipe-tr', solid: true, sprite: T_PIPE_TR, pipe: 'tr' },
  12: { name: 'pipe-bl', solid: true, sprite: T_PIPE_BL, pipe: 'bl' },
  13: { name: 'pipe-br', solid: true, sprite: T_PIPE_BR, pipe: 'br' },
  14: { name: 'pipe-side-l', solid: true, sprite: T_PIPE_SIDE_L, pipe: 'left' },
  15: { name: 'pipe-side-r', solid: true, sprite: T_PIPE_SIDE_R, pipe: 'right' },
  16: { name: 'pipe-side-body', solid: true, sprite: T_PIPE_SIDE_BODY, pipe: 'body' },
  17: {
    name: 'lava', solid: false, sprite: T_LAVA, harm: 'lava', animated: T_LAVA_ANIM,
    frames: T_LAVA_FRAMES, capTop: 36,
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
  38: { name: 'cloud-block', solid: true, sprite: T_CLOUD_BLOCK },
  28: { name: 'coin', solid: false, sprite: null, coin: true },
  29: { name: 'axe', solid: false, sprite: null, decor: true },
  30: { name: 'tree', solid: false, sprite: null, decor: true },
  31: { name: 'bush', solid: false, sprite: null, decor: true },
  32: { name: 'hill', solid: false, sprite: null, decor: true },
  33: { name: 'cloud', solid: false, sprite: null, decor: true },
  34: { name: 'anchor-platform', solid: false, sprite: null, anchor: 'platform' },
  35: { name: 'anchor-firebar', solid: false, sprite: null, anchor: 'firebar' },
  36: {
    name: 'lava-surface', solid: false, sprite: T_LAVA_SURF, harm: 'lava',
    animated: T_LAVA_SURF_ANIM,
  },
  37: { name: 'stair-top', solid: true, sprite: T_STAIR_TOP },
};

// Every LEGEND char from ARCHITECTURE.md §6, plus five extensions:
// 'K'/'k' cannon barrel/base, '-' horizontal pipe body, 'l' the top row of a lava
// pool and 'T' the capped top step of a staircase.
//
// 'l' and 'T' stay in the legend for a level that wants to place them by hand, but
// a level is no longer REQUIRED to: a census across 1-1..1-4 found both used zero
// times, which stranded eight lava-surface frames per theme and five stair caps as
// art that never appeared in the game. TILES[9].capTop / TILES[17].capTop and the
// `above` argument to spriteFor / animatedSpriteFor apply the caps from the tile
// map itself, so the pool gets its waterline and the flight gets its lit tread
// whether or not anyone remembers to type the character.
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
  'l': 36, 'T': 37,
};

export const tileForChar = (ch) => TILES[CHAR_TO_TILE[ch] ?? 0];

// spriteFor(theme, id) is the plain lookup. Pass tile coordinates as well and the
// tiles that must not wallpaper de-phase themselves; pass the id of the tile
// DIRECTLY ABOVE and the two capping tiles apply themselves, so a level gets a
// waterline on its lava and a lit tread on its staircase without having to opt in
// with a legend character. `above` may be undefined (treated as "not the same
// material", i.e. this cell is the top of its run) or null for "off the map".
//
// LAVA_SURF and STAIR_TOP exist precisely so that a pool does not ship with a hard
// flat top edge and a staircase does not ship as a wall with no tread anywhere.
// A shipped-level char census found 'l' and 'T' used zero times, which stranded 45
// sprites; hanging the decision on the neighbour instead of on the level data is
// what stops that happening again.
export const spriteFor = (theme, id, tileX, tileY, above) => {
  const set = THEME_TILES[theme] || THEME_TILES.overworld;
  if (id === TID.LAVA && above !== TID.LAVA && above !== undefined) return set[TID.LAVA_SURF];
  if (id === TID.STAIR && above !== TID.STAIR && above !== undefined) return set[TID.STAIR_TOP];
  if (id === TID.GROUND && tileX != null) return groundVariant(theme, tileX, tileY || 0);
  if (id === TID.STAIR && tileX != null) return stairVariant(theme, tileX, tileY || 0);
  if (id === TID.LAVA && tileX != null) return lavaPhase(theme, tileX, tileY || 0, 0);
  return set[id] || null;
};

// The animated counterpart: same rules, but a live tick picks the frame. A renderer
// that has the tile coordinate and the tick should call this for every animated
// terrain tile — it is the only way a pool of lava or a pane of water stops drawing
// the identical stamp in every cell on the same frame.
export const animatedSpriteFor = (theme, id, tileX = 0, tileY = 0, tick = 0, above) => {
  if (id === TID.LAVA) {
    return above !== TID.LAVA && above !== undefined
      ? lavaSurfPhase(theme, tileX, tick)
      : lavaPhase(theme, tileX, tileY, tick);
  }
  if (id === TID.LAVA_SURF) return lavaSurfPhase(theme, tileX, tick);
  if (id === TID.WATER_SURF) return waterPhase(theme, tileX, tick);
  if (id === TID.WATER_BODY) {
    const set = (THEME_WATER_BODIES[theme] || THEME_WATER_BODIES.overworld)[0];
    return set[(tileX + (tick >> 3)) & (set.length - 1)];
  }
  return spriteFor(theme, id, tileX, tileY, above);
};

// ---------------------------------------------------------------------------
// The palette policy at the top of this file, enforced.
//
// Every clause up there used to be a comment, and a review found four of them
// measurably false in the shipped module — the castle's breakable brick and its
// indestructible ashlar were two luminance units apart, a spent block was the same
// colour and value as the floor, and two ramps shipped identical in two themes.
// A rule nobody measures is a wish. These run at import time and throw, so the
// module cannot boot with the policy broken.
// ---------------------------------------------------------------------------

const rgb = (c) => {
  let h = String(c).slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lumOf = (c) => { const [r, g, b] = rgb(c); return 0.299 * r + 0.587 * g + 0.114 * b; };
const rgbDist = (a, b) => {
  const p = rgb(a); const q = rgb(b);
  return Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
};
// mean over the four body tones — slot 0 is exempt, every terrain outline is
// deliberately near-black and shared
const rampGap = (a, b, ao = 1, bo = 1) => {
  let s = 0;
  for (let i = 0; i < 4; i++) s += rgbDist(a[ao + i], b[bo + i]);
  return s / 4;
};
// what the eye actually gets: the mean luminance of the finished 16x16 tile
const SLOTS = '0123456789abcdef';
function tileLuminance(sprite) {
  let sum = 0;
  let n = 0;
  for (const row of sprite.rows) {
    for (const ch of row) {
      if (ch === '.' || ch === ' ') continue;
      const c = sprite.palette[SLOTS.indexOf(ch)];
      if (c == null) continue;
      sum += lumOf(c);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function assertPalette() {
  const fail = [];
  const check = (ok, msg) => { if (!ok) fail.push(msg); };
  const MATERIAL = {
    EARTH: EARTH, BRICK: BRICK, ASHLAR: ASHLAR, STONE: STONE, QUARRY: QUARRY, TIMBER: TIMBER,
  };
  const names = Object.keys(MATERIAL);

  for (const t of THEMES) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const d = rampGap(MATERIAL[names[i]][t], MATERIAL[names[j]][t]);
        check(d >= 45, `${t}: ${names[i]}/${names[j]} only ${d.toFixed(0)} RGB apart`);
      }
    }
    // liquids never disappear into the floor they are cut into
    const liquids = { WATER: WATER_PAL[t].slice(2), LAVA: LAVA_PAL[t].slice(1) };
    for (const lk of Object.keys(liquids)) {
      for (const mk of names) {
        const d = rampGap(liquids[lk], MATERIAL[mk][t], 0, 1);
        check(d >= 55, `${t}: ${lk} only ${d.toFixed(0)} from ${mk}`);
      }
    }
    // breakable never wears the question block's gold
    check(rampGap(BRICK[t], GOLD, 1, 0) >= 45, `${t}: BRICK only ${rampGap(BRICK[t], GOLD, 1, 0).toFixed(0)} from GOLD`);
    // a spent block is neither the colour nor the value of the floor
    check(rampGap(GOLD_SPENT, EARTH[t], 0, 1) >= 40, `${t}: GOLD_SPENT only ${rampGap(GOLD_SPENT, EARTH[t], 0, 1).toFixed(0)} from EARTH`);

    const tiles = BUILT[t].tiles;
    const L = (id) => tileLuminance(tiles[id]);
    check(L(TID.BRICK) - L(TID.GROUND) >= 20, `${t}: BRICK is only ${(L(TID.BRICK) - L(TID.GROUND)).toFixed(0)} luminance above GROUND`);
    check(L(TID.CASTLE_BRICK) - L(TID.BRICK) >= 25, `${t}: ASHLAR is only ${(L(TID.CASTLE_BRICK) - L(TID.BRICK)).toFixed(0)} luminance above BRICK`);
    check(L(TID.USED) - L(TID.GROUND) >= 20, `${t}: USED is only ${(L(TID.USED) - L(TID.GROUND)).toFixed(0)} luminance above GROUND`);
    check(L(TID.STAIR) - L(TID.GROUND) >= 40, `${t}: STAIR is only ${(L(TID.STAIR) - L(TID.GROUND)).toFixed(0)} luminance above GROUND`);
  }

  // one material must not ship twice under two theme names
  for (const k of names) {
    for (let i = 0; i < THEMES.length; i++) {
      for (let j = i + 1; j < THEMES.length; j++) {
        const d = rampGap(MATERIAL[k][THEMES[i]], MATERIAL[k][THEMES[j]]);
        check(d >= 35, `${k}: ${THEMES[i]} and ${THEMES[j]} only ${d.toFixed(0)} apart`);
      }
    }
  }
  const pipeNames = Object.keys(PIPE);
  for (let i = 0; i < pipeNames.length; i++) {
    for (let j = i + 1; j < pipeNames.length; j++) {
      const d = rampGap(PIPE[pipeNames[i]], PIPE[pipeNames[j]]);
      check(d >= 35, `PIPE: ${pipeNames[i]} and ${pipeNames[j]} only ${d.toFixed(0)} apart`);
    }
  }

  // every declared slot reached by at least one pixel — an unused slot means the
  // form was never fully shaded
  for (const t of THEMES) {
    for (const id of Object.keys(BUILT[t].tiles)) {
      const sp = BUILT[t].tiles[id];
      const seen = new Set([...sp.rows.join('')]);
      for (let i = 0; i < sp.palette.length; i++) {
        if (sp.palette[i] == null) continue;
        check(seen.has(SLOTS[i]), `${sp.name}: declares slot ${i} and never uses it`);
      }
    }
  }

  if (fail.length) throw new Error(`tiles.js palette policy broken:\n  ${fail.join('\n  ')}`);
}

// The animation policy, enforced the same way. "A frame is not allowed to be its
// neighbour nudged sideways" is only worth writing down if something checks it:
// the water body shipped with 86% of its pixels byte-identical across the whole
// loop and a 7% per-frame delta, which is a cycle in name only.
// LOOP CLOSURE, checked structurally rather than by frame deltas.
//
// A cyclic animation built by translating a field advances by the SAME displacement
// every step, and the wrap from the last frame back to the first is just another step.
// If the loop does not close, the wrap lurches by exactly the amount it failed to close
// by. So: reduce each frame to a 1-D signature, recover the circular shift that maps
// each frame onto the next, and require the wrap shift to equal the constant step.
//
// WHY NOT A FRAME-DELTA CHECK, which is the obvious thing and what was tried first:
// it does not work. Measured against the two real defects this project has had —
// the lava crest that jumped 8px every loop, and the water body's caustics that jumped
// 8px sideways and 4px vertically — the buggy WRAP DELTA came out at 0.90 and 0.95 of
// the median adjacent delta, i.e. BELOW its neighbours in both cases. A delta test
// would have passed both bugs while flagging the question block's idle sweep, which
// closes exactly (period 20, step 5, 4 x 5 = 20). Deltas are drowned by whatever else
// in the tile is churning.
//
// THIS CHECK IS BLIND TO THE TILES THAT MOTIVATED IT. The lava body and the water body
// are noise fields; a 1-D signature of noise has no clean translation to recover, so
// the shifts come out non-uniform and the check ABSTAINS. Both do in fact close, but by
// construction arithmetic (N * drift = 0 mod 16), not because anything here can see it.
// What the check catches is a coherent FEATURE riding on the noise — the crest on the
// lava surface, the caustics on the water — which is where both real bugs lived. Do not
// read a pass as proof that a generated field closes; check the arithmetic for that.
const SIG_SLOTS = SLOTS;

// Mean luminance along a column ('x') or a row ('y'), and the silhouette profile —
// the topmost opaque row of each column. The silhouette is what catches a crest or a
// waterline, which a luminance average buries under the body noise beneath it.
function animSig(sprite, axis) {
  const h = sprite.rows.length;
  const w = sprite.rows[0].length;
  const clear = (c) => c === '.' || c === ' ';
  if (axis === 'top') {
    const out = new Array(w).fill(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) if (!clear(sprite.rows[y][x])) { out[x] = y; break; }
    }
    return out;
  }
  const n = axis === 'x' ? w : h;
  const m = axis === 'x' ? h : w;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < m; j++) {
      const ch = axis === 'x' ? sprite.rows[j][i] : sprite.rows[i][j];
      if (clear(ch)) continue;
      const c = sprite.palette[SIG_SLOTS.indexOf(ch)];
      if (c != null) sum += lumOf(c);
    }
    out[i] = sum / m;
  }
  return out;
}

// The circular shift of `a` that best explains `b`.
function bestCircularShift(a, b) {
  const n = a.length;
  let best = 0;
  let err = Infinity;
  for (let s = 0; s < n; s++) {
    let e = 0;
    for (let i = 0; i < n; i++) e += Math.abs(a[(i - s + n) % n] - b[i]);
    if (e < err) { err = e; best = s; }
  }
  return best;
}

// Returns a description of the fault, or null. TWO GUARDS, both of which exist because
// the first version of this check produced nonsense without them:
//   * a ONE-SHOT is exempt. `new Anim([...], holds, false)` ends where it ends; the
//     wrap is not a transition anyone sees.
//   * fewer than FOUR frames abstains. At n = 2 there is exactly one adjacent
//     transition and the wrap is by definition its inverse, so every ordinary
//     two-frame oscillation "fails" — nine sprite-module animations did exactly that
//     before this guard. n = 3 gives two, still too few to tell an oscillation from a
//     translation.
//   * an axis whose step is a constant ZERO abstains. The signature does not move, so
//     the wrap matching it is vacuous — that alone turned 21 apparent passes into 5.
function loopClosureFault(anim) {
  if (!anim || anim.loop === false) return null;
  const f = anim.frames;
  if (!f || f.length < 4) return null;
  for (const axis of ['x', 'y', 'top']) {
    const sh = [];
    for (let i = 0; i < f.length; i++) {
      sh.push(bestCircularShift(animSig(f[i], axis), animSig(f[(i + 1) % f.length], axis)));
    }
    const step = sh[0];
    if (step === 0) continue;
    let uniform = true;
    for (let i = 1; i < sh.length - 1; i++) if (sh[i] !== step) uniform = false;
    if (!uniform) continue;
    const wrap = sh[sh.length - 1];
    if (wrap !== step) {
      return `${axis} advances ${step}px per frame but ${wrap}px across the wrap`;
    }
  }
  return null;
}

function assertAnimation() {
  const fail = [];
  const stats = (anim) => {
    const f = anim.frames;
    const h = f[0].rows.length;
    const w = f[0].rows[0].length;
    let still = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let same = true;
        for (let i = 1; i < f.length && same; i++) if (f[i].rows[y][x] !== f[0].rows[y][x]) same = false;
        if (same) still++;
      }
    }
    let min = Infinity;
    for (let i = 0; i < f.length; i++) {
      const a = f[i].rows;
      const b = f[(i + 1) % f.length].rows;
      let d = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y][x] !== b[y][x]) d++;
      min = Math.min(min, d);
    }
    return { still: still / (w * h), min: min / (w * h) };
  };
  for (const t of THEMES) {
    for (const key of ['question', 'lava', 'lavaSurf', 'water', 'waterBody']) {
      const s = stats(BUILT[t].anims[key]);
      if (s.min < 0.12) fail.push(`${t}.${key}: per-frame delta only ${(s.min * 100).toFixed(0)}%`);
      if (s.still > 0.72) fail.push(`${t}.${key}: ${(s.still * 100).toFixed(0)}% of the tile never moves`);
    }
    // Every animation the theme publishes, one-shots included — loopClosureFault
    // exempts them itself rather than the caller having to know which is which.
    for (const key of Object.keys(BUILT[t].anims)) {
      const fault = loopClosureFault(BUILT[t].anims[key]);
      if (fault) fail.push(`${t}.${key}: the loop does not close — ${fault}`);
    }
    // The question block's '?' must be byte-identical across its idle loop: an
    // idle animation that moves geometry the player reads as static makes a row of
    // untouched blocks judder in lockstep like a rendering fault.
    const idle = BUILT[t].anims.question.frames;
    let moved = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = idle[0].rows[y][x];
        if (c !== '5' && c !== '6') continue;
        for (let i = 1; i < idle.length; i++) if (idle[i].rows[y][x] !== c) moved++;
      }
    }
    if (moved) fail.push(`${t}: the question glyph moves in ${moved} places during its idle loop`);
  }
  if (fail.length) throw new Error(`tiles.js animation policy broken:\n  ${fail.join('\n  ')}`);
}

assertPalette();
assertAnimation();
