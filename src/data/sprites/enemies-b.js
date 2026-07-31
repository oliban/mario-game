// enemies-b — the specialists: Piranha Plant, Bullet Bill, Cheep Cheep,
// Blooper, Podoboo, Hammer Bro and the fire bar.
//
// Pixel chars: '.' transparent, '0'-'9'/'a'-'f' palette slots.
// Light comes from the UPPER LEFT on every solid form — including the frames
// that are derived by rotation, which are re-lit rather than merely turned.
// All sprites face RIGHT.
//
// Cross-material separation is a hard constraint here: a Bullet Bill, a grey
// Cheep Cheep and a Blooper used to be painted from one blue-grey ramp and
// merged into a single blob. They are now three different materials — Bill is
// iron-black (fill luminance 7..87), the grey Cheep is saturated teal slate
// with a warm-cream fin, the Blooper is a warm pearl bell (112..255). Bill's
// ramp clears the Blooper's by 53 RGB units and the grey Cheep's by 38. The
// one pair still tighter than that is the Blooper's lit tone against the
// Cheep's dorsal specular, and both of those are near-white on purpose.

import { makeSprite, Anim } from '../../core/gfx.js';
import { INK } from '../palette.js';

const OUT = INK.outline;

// Local builder that hard-asserts the contracted frame size so a slipped
// character fails loudly in tools/sheet.mjs instead of silently at boot.
function sp(rows, pal, w, h, name) {
  if (rows.length !== h) throw new Error(`${name}: ${rows.length} rows, expected ${h}`);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== w) {
      throw new Error(`${name}: row ${i} is ${rows[i].length} wide, expected ${w}`);
    }
  }
  return makeSprite(rows, pal, { name });
}

/* ------------------------------------------------------------------ *
 *  PIRANHA PLANT — 16x24, 2-frame snap.
 *  OPEN is the stretch: the crown climbs to row 0 and the maw narrows to
 *  x3..x12 between two flared white lips. SHUT is the squash: the whole head
 *  drops four rows, holds full width x2..x13 across five rows instead of one,
 *  and the closed lip band ARCS — high on the left, low on the right — with
 *  four irregular tooth gaps, so it is a scowl and not a zipper. No frame of
 *  either plant touches x0 or x15, so neither collides with its own box.
 *  The stalk is not an extruded tube: its specular column alternates one and
 *  two pixels wide, and it KINKS one pixel sideways partway down — left for
 *  the green plant, right for the fire plant, so a level holding both never
 *  shows two identical columns of plastic.
 * ------------------------------------------------------------------ */

const PIRANHA_PAL = [
  OUT,        // 0 outline
  '#00420a',  // 1 core shadow
  '#0a7a12',  // 2 shadow green
  '#2ea51f',  // 3 mid green
  '#5ecb4a',  // 4 lit green
  '#a9ef8e',  // 5 specular
  '#ffffff',  // 6 white lips / spots / teeth
  '#aecfa6',  // 7 lip underside
  '#3d0a04',  // 8 throat
  '#8e1d10',  // 9 tongue
];

// The old fire ramp was rust-brown and sat on top of the Podoboo/firebar lava,
// so plant and hazard read as one material. These are true reds — every index
// is >= 45 RGB units from the lava ramp at the same slot — and the orange is
// confined to slot 9, where it means 'a shot is loaded', not 'body colour'.
const PIRANHA_FIRE_PAL = [
  OUT,        // 0 outline
  '#3d0400',  // 1 core shadow
  '#a01000',  // 2 shadow
  '#e81c00',  // 3 mid
  '#ff5a30',  // 4 lit
  '#ffb090',  // 5 specular
  '#ffffff',  // 6 white lips / teeth
  '#e0c4b4',  // 7 lip underside
  '#2a0603',  // 8 throat
  '#e8a020',  // 9 ember glow
];

//        0123456789abcdef
const PIRANHA_OPEN = [
  '......0000......',
  '....00443300....',
  '...0443363220...',
  '..046443353220..',
  '.04555433332220.',
  '.06666666666660.',
  '..068868668680..',
  '..089999999880..',
  '..089999999980..',
  '..088999998880..',
  '..068688686680..',
  '..077666666770..',
  '..033222222110..',
  '...0322222110...',
  '....03222110....',
  '....04553210....',
  '....04533210....',
  '....04543210....',
  '...04553210.....',
  '...04533210.....',
  '...04543210.....',
  '...04553210.....',
  '...045332210....',
  '...045532210....',
];

// The slam: head loses its top two rows and bleeds to full width for three,
// the lip line curves into a downturned scowl with irregular teeth, and the
// stalk kinks one pixel left under the head and one right at the base.
//        0123456789abcdef
const PIRANHA_SHUT = [
  '................',
  '................',
  '................',
  '....00000000....',
  '...0443333220...',
  '..046443333220..',
  '.04555433332220.',
  '.06666433322210.',
  '.08606660666210.',
  '.07736906666660.',
  '.03322777666680.',
  '..033222227710..',
  '...0322222110...',
  '....03222110....',
  '....04533210....',
  '....04553210....',
  '...04533210.....',
  '...04553210.....',
  '...04533210.....',
  '...045332100....',
  '....004553210...',
  '.....04533210...',
  '.....04553210...',
  '.....04533210...',
];

// The fire variant is NOT a recolour and NOT a symmetric pattern. The maw is
// built on the same skeleton as the green plant: a single unbroken white lip
// band on row 5, a dark slot-8 throat across rows 6-8 with a slot-9 ember
// blob that is deliberately off-centre (its mass sits left of x7), upper teeth
// hanging as 1px columns at x3/x9/x12 and lower teeth rising OFF those columns
// at x4/x8/x11. Row 6 bites one pixel deeper on the left than row 8, so the
// block is mirrored on neither axis and the light still falls from upper left.
// The whole maw is inset to x1..x14 — nothing reaches x0 or x15.
//        0123456789abcdef
const PIRANHA_FIRE_OPEN = [
  '....00000000....',
  '...0443333220...',
  '..046443353220..',
  '.04555433332220.',
  '.04554433322210.',
  '.06666666666660.',
  '.08688999688680.',
  '.08899999988880.',
  '.07889998888880.',
  '.08868886886880.',
  '.07766666666770.',
  '..033222222110..',
  '...0322222110...',
  '....03222110....',
  '....04533210....',
  '....04553210....',
  '....04543210....',
  '.....04533210...',
  '.....04553210...',
  '.....04543210...',
  '.....04533210...',
  '.....04553210...',
  '....045332210...',
  '....045532210...',
];

const PIRANHA_FIRE_SHUT = [
  '................',
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0044332200...',
  '..046443332220..',
  '.04554433332210.',
  '.06899999999860.',
  '.03776666667710.',
  '..033222222110..',
  '...0332221110...',
  '....03222110....',
  '....03221110....',
  '....04533210....',
  '....04553210....',
  '.....04533210...',
  '.....04553210...',
  '.....04533210...',
  '....004533210...',
  '...045532100....',
  '...04533210.....',
  '...04553210.....',
  '...04533210.....',
];

const piranhaOpen = sp(PIRANHA_OPEN, PIRANHA_PAL, 16, 24, 'piranha.open');
const piranhaShut = sp(PIRANHA_SHUT, PIRANHA_PAL, 16, 24, 'piranha.shut');

export const PIRANHA = {
  snap: new Anim([piranhaOpen, piranhaShut], [22, 14]),
};

// The shut frame is authored, not recoloured: the fire plant clamps a row
// tighter than the green one — one lip row instead of three, the seam still
// glowing — and its stalk whips the opposite way, so the two plants in one
// level never snap in lockstep.
export const PIRANHA_FIRE = {
  snap: new Anim(
    [
      sp(PIRANHA_FIRE_OPEN, PIRANHA_FIRE_PAL, 16, 24, 'piranhaFire.open'),
      sp(PIRANHA_FIRE_SHUT, PIRANHA_FIRE_PAL, 16, 24, 'piranhaFire.shut'),
    ],
    [22, 14]
  ),
};

/* ------------------------------------------------------------------ *
 *  BULLET BILL — 16x16, 2-frame fly plus a distinct static pose. A horizontal
 *  cylinder banded top-to-bottom — crown streak, lit, mid, shadow, core —
 *  capped by an ogive nose at the right and squared flat at the tail. The face
 *  rides on the NOSE: two 2x2 white sclerae each with a slot-0 pupil crowded
 *  into its forward-lower corner, a solid dark band under them, and a 5px white
 *  grin below that. Two stubby fists hang off the belly, both outlined.
 * ------------------------------------------------------------------ */

// Iron, not gunmetal. The old ramp topped out mid-grey and the round looked
// like a pale blimp; worse, its lit tone landed inside 10 RGB units of both
// the grey Cheep's flesh and the Blooper's mantle, so three materials read as
// one. This ramp is near-black throughout: the fill averages luminance 55 of
// 255, 57% of it sits at slot 2 or darker, and the crown streak — the only
// value above luminance 60 apart from the eyes — is spent on four pixels.
// Slot 0 is the only value LIGHTER than the deepest fill: a rim, so the round
// still cuts against a black castle sky.
const BILL_PAL = [
  '#1b1f2b',  // 0 outline / rim — the only value lighter than the deepest fill
  '#06070c',  // 1 core shadow (the belly; near black)
  '#12151f',  // 2 shadow
  '#1f2431',  // 3 mid
  '#2f3949',  // 4 lit
  '#4e5670',  // 5 crown streak / belly bounce — 4 px, nothing else
  '#ffffff',  // 6 eye white / grin
];

// Frame A — level flight. The casing is a long, LOW capsule, not an egg: nine
// rows tall across all sixteen columns, sealed by a square tail (outline column
// x0, flat top and bottom outlines that start at x0 with no chamfer) and closed
// by an ogive nose whose right edge steps 12/13/14/15/14/13/12. Row 4 is the
// single lit crown band; the two 2x2 sclerae sit on rows 5-6 at x7-x8 and
// x10-x11 with their slot-0 pupils forward and low, at x8 and x11. Row 7 is a
// solid dark band, there purely so the eyes cannot fuse with the 5px white
// grin on row 8 — which is exactly what they did before it was put in.
//        0123456789abcdef
const BILL_A = [
  '................',
  '................',
  '................',
  '000000000000....',
  '0555544444330...',
  '04433336636620..',
  '033222260260220.',
  '0322222222222210',
  '022221166666110.',
  '02111111111110..',
  '0431111111110...',
  '000000000000....',
  '..0330.0330.....',
  '...00...00......',
  '................',
  '................',
];

// Frame B — the round pitches nose-up. Everything from x0 to x6 drops one row
// while the nose half from x7 holds, so the casing tilts around the face
// instead of shearing through it; the crown streak steps back with the tail,
// the belly bounce rides down, and the rear fist swings a column further back
// AND a row lower than the lead one, so the two mitts trail out of phase.
//        0123456789abcdef
const BILL_B = [
  '................',
  '................',
  '................',
  '.......00000....',
  '0000000444330...',
  '05555446636620..',
  '044333360260220.',
  '0332222222222210',
  '032222266666110.',
  '02222111111110..',
  '0211111111110...',
  '043111100000....',
  '00000000330.....',
  '.0330..0220.....',
  '.0220...00......',
  '..00............',
];

// The static export is a pose of its own, not a second reference to frame A.
// The round is pitched a full two rows nose-up in three steps — x0-x3 drops
// two, x4-x6 drops one, the face band x7-x15 holds — and both fists are pulled
// flush under the belly at x4..x9 instead of hanging wide. It shares no row
// with frame A except the three empty ones.
//        0123456789abcdef
const BILL_BODY = [
  '................',
  '................',
  '................',
  '.......00000....',
  '....000444330...',
  '00005446636620..',
  '055533360260220.',
  '0443222222222210',
  '033222266666110.',
  '03222111111110..',
  '0222111111110...',
  '021111100000....',
  '04310000330.....',
  '00003300220.....',
  '...0220.00......',
  '....00..........',
];

const billA = sp(BILL_A, BILL_PAL, 16, 16, 'bulletBill.a');
const billB = sp(BILL_B, BILL_PAL, 16, 16, 'bulletBill.b');

export const BULLET_BILL = {
  fly: new Anim([billA, billB], [6, 6]),
  body: sp(BILL_BODY, BILL_PAL, 16, 16, 'bulletBill.body'),
};

/* ------------------------------------------------------------------ *
 *  CHEEP CHEEP — 16x16, 2-frame flap. Frame A drives the caudal fin low and
 *  fans the pectoral; frame B whips the tail up over the spine, drops the whole
 *  head one row and tucks the fin flush, so the body undulates end to end.
 *  Every outline pixel has fill behind it — the old top tail lobe was drawn in
 *  bare outline and vanished on a dark cave background.
 * ------------------------------------------------------------------ */

// The fin used to be #ffffff/#b8b8b8 — a chroma-free grey that read as a sock
// hung under the fish. It is now a warm peach that stays inside the red
// family; pure white is reserved for the eye sclera and two lip pixels.
const CHEEP_RED_PAL = [
  OUT,        // 0 outline
  '#7a1008',  // 1 core shadow
  '#b52418',  // 2 shadow
  '#e04a2c',  // 3 mid
  '#ff8b7f',  // 4 lit
  '#ffcfca',  // 5 dorsal specular
  '#ffffff',  // 6 eye sclera / lip highlight
  '#ffd8c8',  // 7 fin + belly lit
  '#e09a86',  // 8 fin + belly shade
];

// The grey Cheep is not a desaturated fish. Its body ramp is saturated TEAL
// slate — clear of Bullet Bill's iron and of the Blooper's warm pearl — and
// its fins are a warm cream/tan pair, so the pectoral membrane separates from
// the belly instead of dissolving into it. Slot 7 now sits 64 units from
// slot 5 and slot 8 sits 87 from slot 4; they used to sit 12 and 21.
const CHEEP_GREY_PAL = [
  OUT,        // 0 outline
  '#083c44',  // 1 core shadow
  '#25666a',  // 2 shadow
  '#468489',  // 3 mid
  '#79b4b8',  // 4 lit
  '#d6e8e8',  // 5 dorsal specular
  '#ffffff',  // 6 eye sclera / lip highlight
  '#f2ddbe',  // 7 fin lit  (warm — 64 units off the dorsal specular)
  '#b8945c',  // 8 fin shade
];

// Frame A: caudal fin swept LOW and given real fill — every outline pixel has
// body behind it, so the top lobe no longer dissolves on a dark background.
// Exactly one white mass on the head: a 3x3 sclera at x10-x12 with a 2x2 pupil
// crowded into its upper-right corner, so the fish looks forward and down. The
// mouth is a 2px slit at the snout with a single white lip pixel above it.
//        0123456789abcdef
const CHEEP_A = [
  '.......000......',
  '......04440.....',
  '.....04444300...',
  '....0554443320..',
  '...055544433220.',
  '..04455544333220',
  '..03444443600220',
  '..03333333600220',
  '.023333333666260',
  '.02233222222200.',
  '033222227788210.',
  '03222222788110..',
  '0220000008800...',
  '.00......00.....',
  '................',
  '................',
];

// Frame B: the caudal fin whips UP over the spine while the head drops a row —
// the eye, the mouth slit and the whole jaw travel one pixel down and the
// pectoral fin tucks flush inside the belly, so the body undulates end to end
// instead of the tail flicking on a frozen fish.
//        0123456789abcdef
const CHEEP_B = [
  '.......000......',
  '.00..004440.....',
  '0220044443000...',
  '032205544433200.',
  '0322255544433220',
  '.022344554433320',
  '..04444443332220',
  '..03444443600220',
  '..03333333600220',
  '..0333333666260.',
  '..0223322222200.',
  '...022222778810.',
  '....02122788820.',
  '.....000000000..',
  '................',
  '................',
];

const cheepA = sp(CHEEP_A, CHEEP_RED_PAL, 16, 16, 'cheepRed.a');
const cheepB = sp(CHEEP_B, CHEEP_RED_PAL, 16, 16, 'cheepRed.b');

export const CHEEP_RED = {
  swim: new Anim([cheepA, cheepB], [10, 8]),
};

export const CHEEP_GREY = {
  swim: new Anim(
    [
      cheepA.recolor(CHEEP_GREY_PAL, 'cheepGrey.a'),
      cheepB.recolor(CHEEP_GREY_PAL, 'cheepGrey.b'),
    ],
    [12, 10]
  ),
};

/* ------------------------------------------------------------------ *
 *  BLOOPER — 16x24. The mantle is a pointed BELL, not a dome: a 2px apex and a
 *  straight diagonal flank. "open" is the propulsion pose — bell squashed wide,
 *  four tentacles thrown outward. "closed" is the glide: bell stretched tall
 *  and narrow, three tentacles streaming and kinking left as they trail.
 *
 *  The tentacle bands are the part that used to be wallpaper — six pixel-identical
 *  copies of one 16-char string. Every limb now TAPERS to an outline cap: the
 *  outer pair from three fill pixels to two to one, the foreshortened inner
 *  pair from two to one. Each starts tapering on a different row, the outer
 *  pair runs three to four rows longer and flares outward while the inner pair
 *  converges, and no row in either band repeats — not once, anywhere.
 * ------------------------------------------------------------------ */

// Volume, not a white blob. The old ramp lived entirely in the top 42% of the
// value range: two of its slots were 37 units apart and both read as white.
// The bottom is pushed down and the middle is spread, so the bell now runs
// luminance 112 -> 161 -> 205 -> 235 -> 255, with no adjacent pair inside 37
// RGB units. The cast is deliberately WARM pearl rather than blue-grey: that
// is what buys 53 units of clearance from Bullet Bill's iron and 45 from the
// grey Cheep's teal body, so a screen holding all three never reads as one
// blob. Slot 2 is laid as a continuous shadow band down the right flank rather
// than scattered as a terminator, slot 1 rims the lower right, and no slot
// holds more than 32% of the fill.
const BLOOP_PAL = [
  OUT,        // 0 outline
  '#7d6c64',  // 1 terminator / lower rim   (lum 112)
  '#ab9e96',  // 2 right-flank shadow band  (lum 161)
  '#d3ccc4',  // 3 mid                      (lum 206)
  '#eeeae5',  // 4 lit                      (lum 235)
  '#ffffff',  // 5 specular / eye catchlight
  '#2b2f42',  // 6 eye
];

//        0123456789abcdef
const BLOOP_OPEN = [
  '.......00.......',
  '......0430......',
  '.....054430.....',
  '....04544330....',
  '...0454433220...',
  '..044544332220..',
  '.04454433322210.',
  '0444544333322210',
  '0444456335622210',
  '0443366336622110',
  '0433333322221110',
  '.04333322221110.',
  '..033322221110..',
  '.00003221110000.',
  '0432032031003110',
  '0433031021002110',
  '0430032031003110',
  '0430.03021002110',
  '0420.000310.0210',
  '030....020..0210',
  '030....00...0110',
  '030..........020',
  '00...........020',
  '..............0.',
];

//        0123456789abcdef
const BLOOP_CLOSED = [
  '.......00.......',
  '......0430......',
  '.....054330.....',
  '....05443320....',
  '....04543320....',
  '...0455433220...',
  '...0445433220...',
  '..044543332220..',
  '..044533332210..',
  '.04443333222110.',
  '.04433332221110.',
  '.04456335622110.',
  '.04466336622110.',
  '..043333222110..',
  '...0333222110...',
  '...0032221000...',
  '...04320320210..',
  '...04330310310..',
  '..04300320210...',
  '..0420031020....',
  '.043003200......',
  '.030020.........',
  '030.00..........',
  '00..............',
];

export const BLOOPER = {
  open: sp(BLOOP_OPEN, BLOOP_PAL, 16, 24, 'blooper.open'),
  closed: sp(BLOOP_CLOSED, BLOOP_PAL, 16, 24, 'blooper.closed'),
};

/* ------------------------------------------------------------------ *
 *  PODOBOO — 16x16, 2-frame flicker. Emissive ramp: white-hot core, saturated
 *  orange body, dark ember rim so bloom has an edge to bite. The crown is a
 *  three-step arc and the mass leans one pixel further left than right, so it
 *  is a blob and not a cut gem. The two frames are a surge, not a pulse: A is
 *  the compressed apex with a short tail wandering right, B narrows two pixels,
 *  lifts the core two rows and runs the tail three rows longer, whipping the
 *  other way. Each sheds a detached spark — outlined like everything else, and
 *  well inboard of the frame so neither is clipped.
 * ------------------------------------------------------------------ */

const FIRE_PAL = [
  '#3a0a00',  // 0 ember rim (never pure black — the thing glows)
  '#7d1500',  // 1 deep
  '#c03400',  // 2 saturated
  '#ef7a10',  // 3 orange
  '#ffbe30',  // 4 yellow
  '#ffee9a',  // 5 hot
  '#ffffff',  // 6 white core
];

// A is the compressed apex. The crown is a three-step arc (4 -> 8 -> 11 px),
// not a two-step wedge, and the mass bulges one pixel further LEFT than right
// so the flame leans instead of reading as a cut gem. The tail wanders right
// off the centreline, and a spark is shed low-LEFT — a 2x2 of hot slots 4/3
// with its own outline, so it obeys the same rule as every other form here.
//        0123456789abcdef
const PODOBOO_A = [
  '......0000......',
  '....00222200....',
  '..00223333220...',
  '.0233344433320..',
  '023344554433220.',
  '023345665443220.',
  '023345665433210.',
  '.0234454432210..',
  '..02344322100...',
  '...02343210.....',
  '....023310......',
  '.....0000.......',
  '..00............',
  '.0440...........',
  '.0330...........',
  '..00............',
];

// B is the stretched climb: the crown narrows two pixels, the white core surges
// two rows higher, the tail runs three rows longer and whips the OTHER way, and
// the spark is shed to the RIGHT — well inboard of x15 so nothing is clipped.
//        0123456789abcdef
const PODOBOO_B = [
  '......0000......',
  '.....022220.....',
  '...0022332200...',
  '..023346643320..',
  '.02334566543320.',
  '.02334555433220.',
  '.0233444432210..',
  '..02344332210...',
  '...023432210....',
  '...02332210.....',
  '....0233210.....',
  '....023310......',
  '.....02330.00...',
  '......000.0440..',
  '..........0330..',
  '...........00...',
];

export const PODOBOO = {
  flicker: new Anim(
    [sp(PODOBOO_A, FIRE_PAL, 16, 16, 'podoboo.a'), sp(PODOBOO_B, FIRE_PAL, 16, 16, 'podoboo.b')],
    [5, 4]
  ),
};

/* ------------------------------------------------------------------ *
 *  FIRE BAR — 8x8 bead. The OUTLINE rotates, not just the interior: the mass
 *  elongates away from the core, so the silhouette itself tumbles once per
 *  cycle. The white core walks the four corners of a 2x2 orbit and drags a
 *  slot-5 trail of 8-9 px behind it. Every bead spends at least three pixels
 *  on EVERY slot from 1 to 6 — the ramp is on the canvas, not in this comment.
 * ------------------------------------------------------------------ */

// Its own ramp — the low end pulled a full 32 RGB units off PODOBOO's at the
// same slot and the whole thing skewed yellow — so a bar bead reads as
// yellow-white and a Podoboo stays orange-red at a glance.
const FIREBAR_PAL = [
  '#6b2000',  // 0 rim
  '#c05400',  // 1 deep
  '#f06a00',  // 2 saturated
  '#ffb020',  // 3 orange
  '#ffe860',  // 4 yellow
  '#fffad0',  // 5 hot
  '#ffffff',  // 6 core
];

// A: core upper-left, body streaming to the lower right.
const FIREBAR_A = [
  '..000...',
  '.05540..',
  '0566530.',
  '05665430',
  '03554320',
  '.0343210',
  '..013210',
  '....000.',
];

// B: core upper-right, body streaming to the lower left.
const FIREBAR_B = [
  '...000..',
  '..04550.',
  '.0356650',
  '03456650',
  '02345540',
  '0123430.',
  '0123210.',
  '.0000...',
];

// C: core lower-right, body streaming to the upper left.
const FIREBAR_C = [
  '.000....',
  '011230..',
  '0123440.',
  '02345650',
  '03455660',
  '.0455660',
  '..034550',
  '...0000.',
];

// D: core lower-left, body streaming to the upper right.
const FIREBAR_D = [
  '....000.',
  '..032110',
  '.0443210',
  '05654320',
  '06655430',
  '0565540.',
  '055430..',
  '.0000...',
];

export const FIREBAR = {
  ball: new Anim(
    [
      sp(FIREBAR_A, FIREBAR_PAL, 8, 8, 'firebar.a'),
      sp(FIREBAR_B, FIREBAR_PAL, 8, 8, 'firebar.b'),
      sp(FIREBAR_C, FIREBAR_PAL, 8, 8, 'firebar.c'),
      sp(FIREBAR_D, FIREBAR_PAL, 8, 8, 'firebar.d'),
    ],
    3
  ),
};

/* ------------------------------------------------------------------ *
 *  HAMMER BRO — 16x24. A KOOPA, built as one: pale beak with a nostril,
 *  banded belly plate on the leading half, shell mass with a lit rim on
 *  the trailing half, notch-horned helmet with a hard brim.
 *
 *  Head: a 2px-wide horn notch rising from each side of the helmet, a brim
 *  drawn in slot 1 with slot-0 corners so it has thickness instead of reading
 *  as a black stripe, a white sclera with a slot-0 pupil, and a pale beak
 *  wedge at the front of the jaw.
 *
 *  walk: the head drops one row on the passing pose and the torso loses a row
 *  to absorb it, so the feet stay pinned to rows 22-23 — that is the bob. The
 *  arms genuinely swap: in A the lead arm hangs low at the hip, in B it is
 *  cocked high with the fist at the shoulder. The legs go from wide contact to
 *  gathered passing, the shell rim rocks one pixel, and every boot is three
 *  toned with a lit rim on the leading toe instead of being a black brick.
 * ------------------------------------------------------------------ */

// Skin is Koopa gold, NOT human flesh — #f8d5ac is what made this read as a
// bearded soldier. These are the exact skin tones enemies-a gives the Koopa
// Troopa, so the two turtles are visibly the same species.
const BRO_PAL = [
  OUT,        // 0 outline
  '#0b4210',  // 1 shell core shadow
  '#12751a',  // 2 shell shadow
  '#35a832',  // 3 shell mid / limbs
  '#6ed45c',  // 4 shell lit rim
  '#f8dc70',  // 5 skin lit
  '#ffffff',  // 6 eye sclera / beak
  '#a8720c',  // 7 skin shade / scute seam
  '#fffbe8',  // 8 plastron lit
  '#ddb45a',  // 9 plastron shade
  '#3a4450',  // a hammer head core shadow  (same steel as HAMMER.spin)
  '#707c8c',  // b hammer head shadow
  '#7a4a1c',  // c hammer haft mid
  '#e8b830',  // d skin mid / haft lit
  '#aab4c4',  // e hammer head mid
  '#e8eef6',  // f hammer head specular
];

// Contact pose. Cross-section of the torso, left to right: rear-arm sliver |
// shell (lit rim at x2, curving into core shadow) | plastron seam | belly
// plate with scute bands | lead arm.
//        0123456789abcdef
const BRO_WALK_A = [
  '....00....00....',
  '...0440000440...',
  '..044443333220..',
  '.04444433332210.',
  '.04444333322110.',
  '..001111111100..',
  '..0d55555555d0..',
  '..0d555556055d0.',
  '..07d55556656760',
  '..00d555555d6660',
  '.03221988889000.',
  '0432219888890330',
  '0432219777790330',
  '0432219888890330',
  '0432219777790550',
  '0432219888890550',
  '.03221977779030.',
  '..022198888910..',
  '..03320003320...',
  '.03320...03320..',
  '.03320...03320..',
  '.03320..003320..',
  '.033340033340...',
  '.011110011110...',
];

// Passing pose. Helmet rows are pinned to frame A's; everything from the jaw
// down is redrawn — torso up one, shell rocked left, arms swapped, legs
// gathered under the hips.
//        0123456789abcdef
const BRO_WALK_B = [
  '................',
  '....00....00....',
  '...0440000440...',
  '..044443333220..',
  '.04444433332210.',
  '.04444333322110.',
  '..001111111100..',
  '..0d55555555d0..',
  '..0d555556055d0.',
  '..07d55556656760',
  '..00d555555d6660',
  '.03321988889000.',
  '0443219888890550',
  '0443219777790340',
  '0443219888890330',
  '044321977779010.',
  '.03321988889010.',
  '..032197777910..',
  '...0033203320...',
  '....033203320...',
  '....033203320...',
  '....033203320...',
  '...03334033340..',
  '...01111011110..',
];

// Wind-up: hammer cocked overhead, haft running down past the helmet into a
// raised fist. The Bro sinks into a crouch — feet stay on the same two rows,
// the head drops four — so the pose loads before the release.
//        0123456789abcdef
const BRO_THROW_A = [
  '..........00000.',
  '.........0ffeeb0',
  '.........0feeba0',
  '...00...00eebaa0',
  '..044000440bbaa0',
  '.04444332210dc0.',
  '.04443332210dc0.',
  '..0011111000dc0.',
  '..0d55555d00dc0.',
  '..0d56055d05d70.',
  '..07d566566055d0',
  '...0d5555d6605d0',
  '..00d5555d66000.',
  '.032219888890...',
  '04322198888910..',
  '04322197777910..',
  '04322198888910..',
  '04322197777910..',
  '.0322198888910..',
  '..02219888890...',
  '..03320003320...',
  '.03320...03320..',
  '033340...033340.',
  '011110...011110.',
];

// Release: the hammer has left the fist and is already clearing the beak, the
// arm is straight out at shoulder height and the lead leg lunges a pixel
// further forward.
//        0123456789abcdef
const BRO_THROW_B = [
  '..........00000.',
  '.........0ffeeb0',
  '...00...00feeba0',
  '..044000440bbaa0',
  '.04444332210dc0.',
  '.0444433221000..',
  '.04443332210....',
  '..001111100.....',
  '..0d55555d0.....',
  '..0d56055d0.....',
  '..07d5665660....',
  '..00d5555d660...',
  '.03221988889000.',
  '04322198888905d0',
  '0432219777790550',
  '043221988889100.',
  '04322197777910..',
  '.0322198888910..',
  '..022197777900..',
  '..0320000033320.',
  '.03320...033320.',
  '.03320....033320',
  '033340....033340',
  '011110....011110',
];

export const HAMMER_BRO = {
  walk: new Anim(
    [sp(BRO_WALK_A, BRO_PAL, 16, 24, 'bro.walkA'), sp(BRO_WALK_B, BRO_PAL, 16, 24, 'bro.walkB')],
    [9, 9]
  ),
  throwing: new Anim(
    [sp(BRO_THROW_A, BRO_PAL, 16, 24, 'bro.throwA'), sp(BRO_THROW_B, BRO_PAL, 16, 24, 'bro.throwB')],
    [14, 10],
    false
  ),
};

/* ------------------------------------------------------------------ *
 *  HAMMER — 16x16, 8-frame spin at 45 degree steps: a TRUE 360. Four frames
 *  are authored and the second half of the revolution is those four turned
 *  through 180 degrees AND RE-LIT, because rotating a sprite rotates its
 *  light source with it. relight() inverts both ramps — head 7<->4, 6<->5 and
 *  haft 3<->1 — so after the geometric turn the specular lands back on the
 *  world-space upper left and the hammer does not flip which side is bright
 *  halfway through every revolution.
 *  A rigid body rotating in plane keeps its mass: the head holds 45 or 46 lit
 *  pixels in EVERY frame — 9x5 on the vertical axis, 5x9 on the horizontal,
 *  a 46px foreshortened block on each diagonal — and in all eight frames the
 *  specular centroid sits up AND left of the head's own centroid.
 *  The haft is a turned cylinder, not an extrusion: 4 fill px where it sockets
 *  into the head, 3 through the shaft, a dark grip wrap, 2 at the butt.
 * ------------------------------------------------------------------ */

const HAMMER_PAL = [
  OUT,        // 0 outline
  '#3a2208',  // 1 haft shadow
  '#7a4a1c',  // 2 haft mid
  '#b07030',  // 3 haft lit
  '#3a4450',  // 4 head core shadow
  '#707c8c',  // 5 head shadow
  '#aab4c4',  // 6 head mid
  '#e8eef6',  // 7 head specular
];

// 0 degrees — head across the top (9x5 = 45 lit), haft plumb below it, swelling
// where it enters the head and narrowing to a 2px butt through a grip wrap.
//        0123456789abcdef
const HAMMER_1 = [
  '...000000000....',
  '..07776665540...',
  '..07766655440...',
  '..07666554440...',
  '..06655544440...',
  '..06555444440...',
  '...000000000....',
  '....033210......',
  '....033210......',
  '.....03210......',
  '.....03210......',
  '.....02210......',
  '.....01210......',
  '......0310......',
  '......0310......',
  '.......00.......',
];

// 45 degrees — the same block foreshortened, not a smaller one.
//        0123456789abcdef
const HAMMER_2 = [
  '..........00000.',
  '.........0776550',
  '........07765540',
  '.......077665440',
  '.......076654440',
  '.......066554440',
  '........06554440',
  '.......000554440',
  '......0321004440',
  '.....03210..000.',
  '....03210.......',
  '...03210........',
  '..03210.........',
  '.03210..........',
  '03210...........',
  '0000............',
];

// 90 degrees — head stood on end (5x9 = 45 lit), haft out to the left, the
// same 15px overall span as frame 1.
//        0123456789abcdef
const HAMMER_3 = [
  '................',
  '................',
  '..........00000.',
  '.........0776650',
  '.........0766550',
  '.000000000766540',
  '0333333330665540',
  '0222222220665440',
  '0111111110655440',
  '.000000000654440',
  '.........0554440',
  '.........0544440',
  '..........00000.',
  '................',
  '................',
  '................',
];

// 135 degrees — mirror of frame 2 about the horizontal, head swinging low.
//        0123456789abcdef
const HAMMER_4 = [
  '0000............',
  '03210...........',
  '.03210..........',
  '..03210.........',
  '...03210........',
  '....03210.......',
  '.....03210..000.',
  '......0321007770',
  '.......000776550',
  '........07765540',
  '.......077665440',
  '.......076654440',
  '.......066544440',
  '........06554440',
  '.........0554440',
  '..........00000.',
];

// A thrown hammer must come back round to where it started, and it must not
// change which side is lit while it does. rot180 supplies the geometry for the
// second half of the revolution; relight inverts the two ramps so the specular
// stays on the world-space upper left instead of riding round with the sprite.
// Slot 2 (haft mid) and slot 0 (outline) are their own inverses.
const rot180 = (rows) => rows.slice().reverse().map((r) => [...r].reverse().join(''));
const FLIP = { 1: '3', 3: '1', 4: '7', 5: '6', 6: '5', 7: '4' };
const relight = (rows) => rows.map((r) => r.replace(/[134567]/g, (c) => FLIP[c]));

const HAMMER_STEPS = [HAMMER_1, HAMMER_2, HAMMER_3, HAMMER_4];

export const HAMMER = {
  spin: new Anim(
    [
      ...HAMMER_STEPS.map((r, i) => sp(r, HAMMER_PAL, 16, 16, `hammer.${i * 45}`)),
      ...HAMMER_STEPS.map((r, i) =>
        sp(relight(rot180(r)), HAMMER_PAL, 16, 16, `hammer.${180 + i * 45}`)
      ),
    ],
    2
  ),
};
