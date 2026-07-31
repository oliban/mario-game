// enemies-b — the specialists: Piranha Plant, Bullet Bill, Cheep Cheep,
// Blooper, Podoboo, Hammer Bro and the fire bar.
//
// Pixel chars: '.' transparent, '0'-'9'/'a'-'f' palette slots.
// Light comes from the UPPER LEFT on every solid form.
// All sprites face RIGHT.

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
 *  OPEN is the stretch: the head climbs two rows higher and pulls in to
 *  x1..x14 at its widest. SHUT is the squash: the head loses the top two
 *  rows, bleeds out to the full 16px for three rows, and the stalk whips
 *  — left under the head, right at the pot — as the jaws slam.
 *  White spots ride on the HEAD, as in the reference, not on the stem.
 * ------------------------------------------------------------------ */

const PIRANHA_PAL = [
  OUT,        // 0 outline
  '#00420a',  // 1 core shadow
  '#0a7a12',  // 2 shadow green
  '#2ea51f',  // 3 mid green
  '#5ecb4a',  // 4 lit green
  '#a9ef8e',  // 5 specular
  '#ffffff',  // 6 white lips / spots / teeth
  '#c2ccc0',  // 7 lip underside
  '#3d0a04',  // 8 throat
  '#b02a18',  // 9 tongue
];

const PIRANHA_FIRE_PAL = [
  OUT,
  '#4a0d00',
  '#8f2000',
  '#c03a10',
  '#e86a20',
  '#ffc46a',
  '#ffffff',
  '#e0c4b4',
  '#2a0603',
  '#e8a020',
];

//        0123456789abcdef
const PIRANHA_OPEN = [
  '.....000000.....',
  '...0443333220...',
  '..045443333220..',
  '.04554433332210.',
  '.04566666666210.',
  '.06686886868210.',
  '.06688999988210.',
  '.04589999998210.',
  '.04488999988210.',
  '.04486868868210.',
  '.03777777776210.',
  '..033222222110..',
  '..032222211110..',
  '...0222111110...',
  '....02332210....',
  '....04533210....',
  '....04553210....',
  '....04533210....',
  '....04533210....',
  '....04553210....',
  '....04533210....',
  '...0453332210...',
  '...0455332210...',
  '..045333221110..',
];

// The slam: head loses its top two rows and bleeds to full width for three,
// the lip line curves into a downturned scowl with irregular teeth, and the
// stalk kinks one pixel left under the head and one right at the base.
//        0123456789abcdef
const PIRANHA_SHUT = [
  '................',
  '................',
  '................',
  '................',
  '....00000000....',
  '..045544333220..',
  '.04554433332210.',
  '0466443333222110',
  '0466666666666610',
  '0660600660660670',
  '0677777777777710',
  '0333333222221110',
  '.03332222266110.',
  '..033222211110..',
  '...0222111110...',
  '....02332210....',
  '...04553210.....',
  '...04533210.....',
  '...04533210.....',
  '...04553210.....',
  '....04533210....',
  '....0453332210..',
  '....0455332210..',
  '...045333221110.',
];

// The fire variant is NOT a straight recolour: its maw opens two pixels
// wider and the throat carries an ember glow, so it reads as loading a shot.
//        0123456789abcdef
const PIRANHA_FIRE_OPEN = [
  '.....000000.....',
  '...0443333220...',
  '..045443333220..',
  '.04554433332210.',
  '.06666666666210.',
  '.06868868686210.',
  '.08999999998210.',
  '.08955559988210.',
  '.08995599988210.',
  '.08686886868210.',
  '.07777777776210.',
  '..033222222110..',
  '..032222211110..',
  '...0222111110...',
  '....02332210....',
  '....04533210....',
  '....04553210....',
  '....04533210....',
  '....04533210....',
  '....04553210....',
  '....04533210....',
  '...0453332210...',
  '...0455332210...',
  '..045333221110..',
];

const piranhaOpen = sp(PIRANHA_OPEN, PIRANHA_PAL, 16, 24, 'piranha.open');
const piranhaShut = sp(PIRANHA_SHUT, PIRANHA_PAL, 16, 24, 'piranha.shut');

export const PIRANHA = {
  snap: new Anim([piranhaOpen, piranhaShut], [22, 14]),
};

export const PIRANHA_FIRE = {
  snap: new Anim(
    [
      sp(PIRANHA_FIRE_OPEN, PIRANHA_FIRE_PAL, 16, 24, 'piranhaFire.open'),
      piranhaShut.recolor(PIRANHA_FIRE_PAL, 'piranhaFire.shut'),
    ],
    [22, 14]
  ),
};

/* ------------------------------------------------------------------ *
 *  BULLET BILL — 16x16, 2-frame fly. A horizontal capsule: flat squared
 *  tail at x0, three-step hemispherical nose leading at x15. The face
 *  rides on the NOSE — white eyes with inward pupils and a downturned
 *  outline scowl, no teeth. One stubby fist, 4-connected to the casing.
 * ------------------------------------------------------------------ */

// Gunmetal rather than true black, and the outline is lifted to #3d4557 so
// the silhouette survives a black castle sky instead of dissolving into it.
const BILL_PAL = [
  '#3d4557',  // 0 outline (lifted off black on purpose)
  '#4c5468',  // 1 core shadow
  '#626b82',  // 2 shadow
  '#7f899f',  // 3 mid
  '#99a3b8',  // 4 lit
  '#c3cbdb',  // 5 specular / belly bounce
  '#ffffff',  // 6 eye white
  '#c4cad6',  // 7 eye shade
];

//        0123456789abcdef
const BILL_A = [
  '................',
  '................',
  '................',
  '.000000000000...',
  '04445555555440..',
  '04444444444330..',
  '044444333663660.',
  '0333333337030730',
  '0222222222223320',
  '022222222000020.',
  '02211111011010..',
  '01555555555510..',
  '.000433000000...',
  '...03320........',
  '...02210........',
  '...00000........',
];

// Frame B is the same round in flight: the casing specular slides three
// pixels aft, the belly bounce runs two the other way, and the eyes squeeze
// a pixel narrower — air rushing past, and a scowl pulse.
//        0123456789abcdef
const BILL_B = [
  '................',
  '................',
  '................',
  '.000000000000...',
  '05555555444440..',
  '04444444443330..',
  '044444333063060.',
  '0333333330730730',
  '0222222222223320',
  '022222222000020.',
  '02111111011010..',
  '01115555555550..',
  '.000433000000...',
  '...03320........',
  '...02210........',
  '...00000........',
];

const billA = sp(BILL_A, BILL_PAL, 16, 16, 'bulletBill.a');
const billB = sp(BILL_B, BILL_PAL, 16, 16, 'bulletBill.b');

export const BULLET_BILL = {
  fly: new Anim([billA, billB], [6, 6]),
  body: billA,
};

/* ------------------------------------------------------------------ *
 *  CHEEP CHEEP — 16x16, 2-frame flap. Frame A drives the tail down and
 *  fans the pectoral fin; frame B whips the tail up over the spine and
 *  tucks the fin in, so the silhouette actually changes shape.
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

const CHEEP_GREY_PAL = [
  OUT,
  '#33404e',
  '#55636f',
  '#8391a0',
  '#b4c0cc',
  '#e8f0f6',
  '#ffffff',
  '#dfe8f0',
  '#8fa0ae',
];

// Frame A: triangular caudal fin swept low, pectoral fin tucked inside the
// belly outline and tapered to a point. Exactly one white shape on the head —
// a 3x3 sclera with a centred pupil and a shaded lower lid; the mouth is a
// bare outline notch, so nothing competes with the eye.
//        0123456789abcdef
const CHEEP_A = [
  '.......000......',
  '......04430.....',
  '.....0444320....',
  '0...0444433220..',
  '00.055555433220.',
  '0300444443332220',
  '0330443333226660',
  '0333333333226060',
  '0333333332227770',
  '0222332222222210',
  '0220222222211000',
  '020022222211000.',
  '00..022778810...',
  '......0788000...',
  '......080.......',
  '................',
];

// Frame B: tail whipped up over the spine, and the head takes a 1px vertical
// squash (rows 6-8 drop one, row 5 holds) so the whole body undulates
// instead of just the tail flicking.
//        0123456789abcdef
const CHEEP_B = [
  '.......000......',
  '0.....04430.....',
  '00...0444320....',
  '030.0444433220..',
  '033055555433220.',
  '0333444443332220',
  '0333444433332220',
  '0222443333226660',
  '0220433333226060',
  '00.0333332227770',
  '...0332222222210',
  '...0222222211000',
  '...0222277880...',
  '.......0788000..',
  '........080.....',
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
 *  BLOOPER — 16x24. The mantle is a pointed BELL, not a dome: a 2px apex
 *  and a straight diagonal flank, so it cannot be mistaken for a skull.
 *  "open" is the propulsion pose — mantle squashed wide, tentacles thrown
 *  outward, outer pair four rows longer than the inner pair and splaying.
 *  "closed" is the glide: bell stretched tall, tentacles streaming.
 * ------------------------------------------------------------------ */

// Volume, not a white blob: slot 4 holds only the lit left flank, slot 3 the
// core, slot 2 runs a continuous shadow band down the right, slot 1 is a 1px
// terminator at the rim. Slot 5 is spent on ONE small specular and the eye
// catchlights — nothing else.
const BLOOP_PAL = [
  OUT,        // 0 outline
  '#8d94a8',  // 1 terminator
  '#b3bacd',  // 2 core shadow band
  '#dbe0ec',  // 3 mid
  '#f4f6fc',  // 4 lit
  '#ffffff',  // 5 specular / eye catchlight
  '#232b45',  // 6 eye
];

//        0123456789abcdef
const BLOOP_OPEN = [
  '.......00.......',
  '......0430......',
  '.....054320.....',
  '....05543210....',
  '...0454432210...',
  '..044433322110..',
  '.04443333222110.',
  '0444433332222110',
  '0444333332222110',
  '0444563333562110',
  '0444663333662110',
  '0433333322221110',
  '.03333222221110.',
  '..033222221110..',
  '..040030020020..',
  '.04400300200220.',
  '0440.030020.0220',
  '0440030..0200220',
  '040.030..020.020',
  '040.000..000.020',
  '040..........020',
  '040..........020',
  '040..........020',
  '000..........000',
];

//        0123456789abcdef
const BLOOP_CLOSED = [
  '.......00.......',
  '......0430......',
  '.....044320.....',
  '....04543210....',
  '....05543210....',
  '...0454432210...',
  '...0444332210...',
  '..044433322110..',
  '.04443333222110.',
  '.04433333222110.',
  '.04445633356210.',
  '.04446633366210.',
  '.04333332222110.',
  '..033322221110..',
  '..033222211110..',
  '...0322221110...',
  '....040030020...',
  '....040030020...',
  '...040030020....',
  '...040030020....',
  '...040030000....',
  '...040000.......',
  '...040..........',
  '...000..........',
];

export const BLOOPER = {
  open: sp(BLOOP_OPEN, BLOOP_PAL, 16, 24, 'blooper.open'),
  closed: sp(BLOOP_CLOSED, BLOOP_PAL, 16, 24, 'blooper.closed'),
};

/* ------------------------------------------------------------------ *
 *  PODOBOO — 16x16, 2-frame flicker. Emissive ramp: white-hot core,
 *  saturated orange body, dark ember rim so bloom has an edge to bite.
 *  The two frames are a surge, not a pulse: A is the compressed apex, B
 *  stretches a row taller, narrows two pixels, lifts the core two rows and
 *  runs the tail two rows longer. Each sheds a hot detached spark.
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

// A is the compressed apex: broad head bleeding to the full 16px, core low
// at rows 4-6, short tail, and a spark shed BELOW-LEFT.
//        0123456789abcdef
const PODOBOO_A = [
  '......0000......',
  '....00222200....',
  '..023333333320..',
  '.02344554433220.',
  '0234456654433210',
  '0233456655433210',
  '0123345664433210',
  '.01233444433220.',
  '..012333332210..',
  '...0122332210...',
  '....01232210....',
  '.....012210.....',
  '......0110......',
  '................',
  '..2442..........',
  '...22...........',
];

// B is the stretched climb: head a row taller and two pixels narrower, core
// surged up to rows 3-5, tail two rows longer, spark shed to the RIGHT.
//        0123456789abcdef
const PODOBOO_B = [
  '.....000000.....',
  '...0022222200...',
  '..023444443320..',
  '.02345665443320.',
  '.02345665543320.',
  '.02334566544320.',
  '.01233455443320.',
  '..012334443210..',
  '...0123332210...',
  '....01232210....',
  '....0123210.....',
  '.....012210.....',
  '.....01210..2442',
  '......010....22.',
  '......00........',
  '................',
];

export const PODOBOO = {
  flicker: new Anim(
    [sp(PODOBOO_A, FIRE_PAL, 16, 16, 'podoboo.a'), sp(PODOBOO_B, FIRE_PAL, 16, 16, 'podoboo.b')],
    [5, 4]
  ),
};

/* ------------------------------------------------------------------ *
 *  FIRE BAR — 8x8 bead. The OUTLINE rotates, not just the interior: each
 *  frame pushes a 1px flare out of a different quadrant, so the silhouette
 *  itself tumbles. The white core walks the four corners of a 2x2 orbit
 *  and drags a hot tail behind it, opposite the direction of travel.
 * ------------------------------------------------------------------ */

// Its own ramp — one step yellower and hotter than PODOBOO's — so a bar bead
// reads as yellow-white and a Podoboo stays orange-red at a glance.
const FIREBAR_PAL = [
  '#4a1200',  // 0 rim
  '#a03000',  // 1 deep
  '#e05000',  // 2 saturated
  '#ff9418',  // 3 orange
  '#ffd84a',  // 4 yellow
  '#fff6c0',  // 5 hot
  '#ffffff',  // 6 core
];

// A: round, core upper-left, tail trailing left (core travelling right).
const FIREBAR_A = [
  '..0000..',
  '.044330.',
  '05664320',
  '05664320',
  '03443220',
  '02332210',
  '.022110.',
  '..0000..',
];

// B: flare pushed out of the upper right; core has slid across, tail above.
const FIREBAR_B = [
  '..00000.',
  '.0335540',
  '03446643',
  '03456640',
  '02344430',
  '02233320',
  '.022210.',
  '..0000..',
];

// C: flare at the lower right; core has dropped, tail to its right.
const FIREBAR_C = [
  '..0000..',
  '.022320.',
  '02233420',
  '02334430',
  '03346650',
  '02346653',
  '.0344440',
  '..00000.',
];

// D: flare at the lower left; core swinging back up, tail below.
const FIREBAR_D = [
  '..0000..',
  '.023320.',
  '02332210',
  '03433220',
  '04664320',
  '34664320',
  '0455320.',
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
 *  walk: the two frames are hip-anchored, not offset copies. The helmet
 *  holds its absolute row; the torso lifts one pixel so the neck
 *  compresses (that is the bob); the arms genuinely swap — in A the lead
 *  arm hangs low off the right edge and the rear arm shows as a sliver at
 *  the left, in B the lead arm is cocked high and inboard and the rear arm
 *  has swung out of sight; and the shell rocks one pixel left with a fresh
 *  shadow at the plastron seam.
 * ------------------------------------------------------------------ */

// Skin is Koopa gold, NOT human flesh — #f8d5ac is what made this read as a
// bearded soldier. These are the exact skin tones enemies-a gives the Koopa
// Troopa, so the two turtles are visibly the same species.
const BRO_PAL = [
  OUT,        // 0 outline
  '#0a4a10',  // 1 shell core shadow
  '#12801e',  // 2 shell shadow
  '#33b52e',  // 3 shell mid / limbs
  '#7fe05a',  // 4 shell lit rim
  '#f8dc70',  // 5 skin lit
  '#ffffff',  // 6 eye sclera / beak
  '#a8720c',  // 7 skin shade / scute seam
  '#fffbe8',  // 8 plastron lit
  '#ddb45a',  // 9 plastron shade
  '#6b7488',  // a hammer head shadow
  '#c2ccdc',  // b hammer head lit
  '#8a5c10',  // c hammer haft
  '#e8b830',  // d skin mid
];

// Contact pose. Cross-section of the torso, left to right: rear-arm sliver |
// shell (lit rim at x2, curving into core shadow) | plastron seam | belly
// plate with scute bands | lead arm.
//        0123456789abcdef
const BRO_WALK_A = [
  '....0......0....',
  '...040....040...',
  '...0044444400...',
  '..044444333220..',
  '..044433332210..',
  '..000000000000..',
  '..0d55566555d0..',
  '..0d55560556660.',
  '..07d5555556670.',
  '...0755555700...',
  '..043322108890..',
  '.0443322108890..',
  '0443322210770570',
  '0433322210880570',
  '0333222110770570',
  '0222221110880570',
  '.022211110790550',
  '..0111111090....',
  '..013331033310..',
  '..0330...03330..',
  '.0330....03330..',
  '.0330.....03330.',
  '01110....011110.',
  '00000....000000.',
];

// Passing pose. Helmet rows are pinned to frame A's; everything from the jaw
// down is redrawn — torso up one, shell rocked left, arms swapped, legs
// gathered under the hips.
//        0123456789abcdef
const BRO_WALK_B = [
  '....0......0....',
  '...040....040...',
  '...0044444400...',
  '..044443333220..',
  '..044333332210..',
  '..000000000000..',
  '..0d55566555d0..',
  '..0d55560556660.',
  '..07d5555576670.',
  '..043322108890..',
  '.044332210890570',
  '0443322210790570',
  '0433322210890550',
  '0333222110790770',
  '02222211108890..',
  '.0222111107790..',
  '..0111111090....',
  '..013331033310..',
  '...033303330....',
  '...033303330....',
  '..0333003330....',
  '..0333003330....',
  '.01110..011110..',
  '.00000..000000..',
];

// Wind-up: hammer cocked overhead, haft running down past the helmet into a
// raised fist. The Bro sinks into a crouch — feet stay on the same two rows,
// the head drops four — so the pose loads before the release.
//        0123456789abcdef
const BRO_THROW_A = [
  '..........000000',
  '.........0bbbaa0',
  '.........0bbaaa0',
  '.........0baaaa0',
  '...0...0.0000000',
  '..040.040..0cc0.',
  '..0044444430cc0.',
  '..0444333220cc0.',
  '..0000000000cc0.',
  '..0d556655d0570.',
  '..0d55605660770.',
  '..07d5555670770.',
  '...07555570070..',
  '..043322108870..',
  '04433222107790..',
  '04333222108890..',
  '03332221107790..',
  '02222211108890..',
  '.022211110900...',
  '..013331033310..',
  '..0330...03330..',
  '.0330....03330..',
  '01110....011110.',
  '00000....000000.',
];

// Release: the hammer has left the fist and is already clearing the beak, the
// arm is straight out at shoulder height and the lead leg lunges a pixel
// further forward.
//        0123456789abcdef
const BRO_THROW_B = [
  '................',
  '................',
  '................',
  '................',
  '....0......0....',
  '...040....040...',
  '...0044444400...',
  '..044444333220..',
  '..044433332210..',
  '..000000000000..',
  '..0d55566555d000',
  '..0d5556055660b0',
  '..07d555555660a0',
  '...0755555700000',
  '..04332210889570',
  '.044332210779570',
  '04333222108890..',
  '03332221107790..',
  '02222211108890..',
  '..013331033310..',
  '..0330....03330.',
  '.0330.....03330.',
  '01110.....011110',
  '00000.....000000',
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
 *  HAMMER — 16x16, 4-frame spin at 45 degree steps. A rigid body rotating
 *  in plane keeps its mass: the head holds ~38-45 lit pixels in every
 *  frame (9x5 on the axes, a 7-tall diagonal block between) and the total
 *  span holds at 15-16px, so it turns instead of pulsing. Every haft is a
 *  three-tone cylinder — lit / mid / shadow — and meets the head at a 1px
 *  outline seam.
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

// 0 degrees — head across the top (9x5 = 45 lit), haft plumb below it.
//        0123456789abcdef
const HAMMER_1 = [
  '..00000000000...',
  '..07776665540...',
  '..07666555440...',
  '..06665554440...',
  '..06555444440...',
  '..05554444440...',
  '..00000000000...',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....03210......',
  '.....00000......',
];

// 45 degrees — the same block foreshortened, not a smaller one.
//        0123456789abcdef
const HAMMER_2 = [
  '.........000000.',
  '.........077660.',
  '........07666550',
  '.......066655540',
  '.......065554440',
  '........05544440',
  '.........0544440',
  '.....0321004440.',
  '....0321000000..',
  '....03210.......',
  '...03210........',
  '...03210........',
  '..03210.........',
  '..03210.........',
  '.03210..........',
  '.00000..........',
];

// 90 degrees — head stood on end (5x9 = 45 lit), haft out to the left, the
// same 15px overall span as frame 1.
//        0123456789abcdef
const HAMMER_3 = [
  '................',
  '................',
  '.........0000000',
  '.........0776650',
  '.........0766550',
  '.000000000665540',
  '.333333330665440',
  '.222222220655440',
  '.111111110554440',
  '.000000000544440',
  '.........0444440',
  '.........0444440',
  '.........0000000',
  '................',
  '................',
  '................',
];

// 135 degrees — mirror of frame 2 about the horizontal, head swinging low.
//        0123456789abcdef
const HAMMER_4 = [
  '.00000..........',
  '.03210..........',
  '..03210.........',
  '..03210.........',
  '...03210........',
  '...03210........',
  '....03210.......',
  '....0321000000..',
  '.....0321007760.',
  '.........0766650',
  '........06665550',
  '.......066555440',
  '.......055544440',
  '........05444440',
  '.........0444440',
  '.........000000.',
];

export const HAMMER = {
  spin: new Anim(
    [
      sp(HAMMER_1, HAMMER_PAL, 16, 16, 'hammer.1'),
      sp(HAMMER_2, HAMMER_PAL, 16, 16, 'hammer.2'),
      sp(HAMMER_3, HAMMER_PAL, 16, 16, 'hammer.3'),
      sp(HAMMER_4, HAMMER_PAL, 16, 16, 'hammer.4'),
    ],
    4
  ),
};
