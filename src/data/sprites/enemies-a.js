// Ground troops: Goomba, Koopa Troopa (green/red), Buzzy Beetle, Spiny, Lakitu.
// All art is original pixel data. Light source: upper-left. Every sprite faces RIGHT.
//
//   '.' transparent, '0'-'9' palette slot 0..9, 'a'-'f' slot 10..15
//
// Column ruler used while authoring 16-wide art:
//        0123456789abcdef

import { makeSprite, Anim } from '../../core/gfx.js';
import { INK } from '../palette.js';

/* ------------------------------------------------------------------ *
 * GOOMBA
 * ------------------------------------------------------------------ */

// 0 outline  1 cap dark  2 cap mid  3 cap lit  4 cap bright  5 specular
// 6 muzzle   7 eye white 8 ink      9 foot dark  a foot lit
// Feet (9/a) sit ONE step below the cap mid, not three, so they read as part of
// the same creature instead of two bricks parked under a head.
const GOOMBA_PAL = [
  INK.outline, '#4a1a04', '#8b3a10', '#c4661c', '#ef9a49', '#f8d5ac',
  '#dda76a', '#ffffff', '#0b0705', '#6b3a12', '#b06a24',
];

const GOOMBA_UNDER_PAL = [
  '#080a12', '#16295c', '#2a4a92', '#2f5aa8', '#5d8fd8', '#bcdfff',
  '#8fa1ff', '#ffffff', '#0d1830', '#2a3a68', '#5f7ab0',
];

// Slots 1/2 pushed well clear of the '#14100c' outline so the eye ink at
// '#0a0806' is the only near-black in the interior and reads as a feature.
const GOOMBA_CASTLE_PAL = [
  '#14100c', '#4a4038', '#726456', '#8a7c6c', '#b8a894', '#e8dcc8',
  '#c9bba4', '#ffffff', '#0a0806', '#463c30', '#7a6c58',
];

// PASS (up) frame. Eyes are white-dominant, the way SMB's are: an ink brow that
// steps down toward the middle (rows 4-5), a 4-wide sclera under it, and a 2x2
// pupil ringed by white on three sides so it reads as a round eye and not a
// socket. Ankles (slot 6) on row 12 break the outline bar that used to sever
// the feet from the body.
//        0123456789abcdef
const GOOMBA_A = [
  '....00000000....',
  '...0345432210...',
  '..034554332210..',
  '.02345544332210.',
  '0388444333228810',
  '0348883333888410',
  '0277773333777710',
  '0278873333788710',
  '0278872222788710',
  '0155666666666610',
  '.06660000006610.',
  '..066666666110..',
  '..660000000660..',
  '.09aa90..09aa90.',
  '.099990..000000.',
  '.000000.........',
];

// CONTACT (down) frame. The whole rig drops 1px, the cap widens a pixel per
// side (squash), one sclera row is eaten so the eyes narrow into a bob, and the
// feet swap stance: near foot strides 1px forward, far foot plants and the
// weight transfers to it.
//        0123456789abcdef
const GOOMBA_B = [
  '................',
  '....00000000....',
  '...0345432210...',
  '..034554332210..',
  '0234554433222110',
  '0388444333228810',
  '0348883333888410',
  '0278873333788710',
  '0278872222788710',
  '0155666666666610',
  '.06660000006610.',
  '..066666666110..',
  '..066000000660..',
  '..09aa90.09aa90.',
  '..000000.09aa90.',
  '.........000000.',
];

//        0123456789abcdef
const GOOMBA_FLAT_ROWS = [
  '................',
  '....00000000....',
  '..034554433210..',
  '0288883388882210',
  '0178876666788710',
  '0166600000066110',
  '09aa01111110aa90',
  '.00000000000000.',
];

// Every sprite in this module is authored at hitbox width, so the anchor is always (0, 0).
const mk = (rows, pal, name) => makeSprite(rows, pal, { name, ox: 0, oy: 0 });

function goombaSet(pal, tag) {
  const a = mk(GOOMBA_A, pal, `goomba-a${tag}`);
  const b = mk(GOOMBA_B, pal, `goomba-b${tag}`);
  const flat = mk(GOOMBA_FLAT_ROWS, pal, `goomba-flat${tag}`);
  return { walk: new Anim([a, b], 8), flat };
}

export const GOOMBA = goombaSet(GOOMBA_PAL, '');
export const GOOMBA_UNDER = goombaSet(GOOMBA_UNDER_PAL, '-under');
export const GOOMBA_CASTLE = goombaSet(GOOMBA_CASTLE_PAL, '-castle');

/* ------------------------------------------------------------------ *
 * KOOPA TROOPA
 * ------------------------------------------------------------------ */

// 0 outline  1 shell dark  2 shell mid  3 shell lit  4 shell bright  5 shell spec
// 6 skin dark  7 skin mid  8 skin lit  9 skin spec  a eye white  b ink
// c wing shade  d wing light  e wing dark
const KOOPA_GREEN_PAL = [
  '#0c1a08', '#0b4210', '#12751a', '#35a832', '#6ed45c', '#cfffb4',
  '#a8720c', '#e8b830', '#f8dc70', '#fff4b0', '#ffffff', '#0b0705',
  '#9fa8bc', '#eef2ff', '#6b7793',
];

const KOOPA_RED_PAL = [
  '#1c0806', '#5a0c08', '#96170f', '#c8371f', '#e86a3c', '#ffcfca',
  '#a8720c', '#e8b830', '#f8dc70', '#fff4b0', '#ffffff', '#0b0705',
  '#9fa8bc', '#eef2ff', '#6b7793',
];

// The shell's specular is a solid convex wedge in the UPPER-LEFT quadrant (rows
// 10-12), matching the module's declared light, with a slot-3 bounce arc along
// the lower-right where the dome turns away. It used to be a comma sitting low
// and left, which read as a bite taken out of the shell.
//        0123456789abcdef
const KOOPA_WALK_A = [
  '........0000....',
  '.......098870...',
  '......09887760..',
  '......088aab760.',
  '......087abb7760',
  '.....0877abb7870',
  '.....07777b78980',
  '.....06777700870',
  '.....0667777760.',
  '...00006777760..',
  '..0345430677600.',
  '.03455433067760.',
  '.03455433206660.',
  '023444433207870.',
  '0233443322078870',
  '0123333322067760',
  '012223332100660.',
  '01122221111000..',
  '.088777777760...',
  '.000000000000...',
  '..07870.078870..',
  '..07770.077770..',
  '..00000.067760..',
  '........000000..',
];

// Contact frame: the whole rig bobs 1px, the shell loses a row, and both feet
// translate — near foot forward, far foot back.
//        0123456789abcdef
const KOOPA_WALK_B = [
  '................',
  '........0000....',
  '.......098870...',
  '......09887760..',
  '......088aab760.',
  '......087abb7760',
  '.....0877abb7870',
  '.....07777b78980',
  '.....06777700870',
  '.....0667777760.',
  '...00006777760..',
  '..0345430677600.',
  '.03455433067760.',
  '.03455433206660.',
  '023444433207870.',
  '0233443322078870',
  '012223332100660.',
  '01122221111000..',
  '.088777777760...',
  '.000000000000...',
  '..078870.07870..',
  '..077770.07770..',
  '..067760.00000..',
  '..000000........',
];

// At rest. The two 1x2 punch-throughs that used to sit mid-dome (they read as
// bullet holes) are gone; the limb holes now sit in the rim band on row 11,
// which is where a shell's limb holes actually are.
//        0123456789abcdef
const KOOPA_SHELL_ROWS = [
  '................',
  '................',
  '.....000000.....',
  '...0345543220...',
  '..034555433220..',
  '.02345544332210.',
  '0234544333222110',
  '0123443322221110',
  '0123322222221110',
  '0112222222221110',
  '0112221111111110',
  '.08807777770660.',
  '.08777777776660.',
  '.07766666666660.',
  '..066666666660..',
  '..000000000000..',
];

// SHELL SPIN — one rotation, one axis, four honest views. The rim ring sweeps
// bottom (0) -> right limb (1) -> out of sight behind (2) -> left limb (3), and
// the dome's specular slides the opposite way because the light does NOT rotate
// with the object. Frame 2 is the far side: no slot 5 anywhere, dimmer tones,
// and only a 2px sliver of rim still coming around the leading edge.
//
// FRONT — rim is the near-bottom skirt, spec upper-left.
//        0123456789abcdef
const KOOPA_SPIN_0 = [
  '................',
  '................',
  '....00000000....',
  '...0455433220...',
  '..034554433220..',
  '.03455443332210.',
  '.02344433322210.',
  '0234443332222110',
  '0233333222221110',
  '0123332222211110',
  '0122222221111110',
  '.08877777776660.',
  '.08777777666660.',
  '..077666666660..',
  '...0666666660...',
  '....00000000....',
];

// QUARTER — rim has swung onto the right limb, spec pulled left with the bulge.
//        0123456789abcdef
const KOOPA_SPIN_1 = [
  '................',
  '................',
  '....00000000....',
  '...0554433760...',
  '..055544338760..',
  '.04555443387760.',
  '.04454443387760.',
  '0344444332887760',
  '0333333322887760',
  '0233333222187760',
  '0222222221187760',
  '.02222221187760.',
  '.01111111118760.',
  '..011111118760..',
  '...0111111760...',
  '....00000000....',
];

// BACK — rim gone but for a sliver on the left, no specular, tones stepped down.
//        0123456789abcdef
const KOOPA_SPIN_2 = [
  '................',
  '................',
  '....00000000....',
  '...0222222220...',
  '..023333222220..',
  '.02333333222210.',
  '.06733333222210.',
  '0672333322222110',
  '0672233222221110',
  '0672222222221110',
  '0672222222211110',
  '.06722222111110.',
  '.06711111111110.',
  '..067111111110..',
  '...0111111110...',
  '....00000000....',
];

// PARATROOPA. The wing is drawn only into cells the walk frame leaves
// transparent and is then auto-outlined, so not one shell or body pixel is
// carved away — compare row by row against KOOPA_WALK_A. It is a fan, not a
// blade: a lit leading arc (d), a shaded body (c), a dark root (e), and three
// 1px notches in the trailing edge that separate the primaries.
// UP-STROKE: fan raised and spread, rows 1-8.
//        0123456789abcdef
const KOOPA_FLY_A = [
  '..0000..0000....',
  '.0dddd0098870...',
  '0ddddc09887760..',
  'dddccc088aab760.',
  '0ddccc087abb7760',
  'ddccc0877abb7870',
  '0dcce07777b78980',
  'dccee06777700870',
  '0ceee0667777760.',
  '.0000006777760..',
  '..0345430677600.',
  '.03455433067760.',
  '.03455433206660.',
  '023444433207870.',
  '0233443322078870',
  '0123333322067760',
  '012223332100660.',
  '01122221111000..',
  '.088777777760...',
  '.000000000000...',
  '..07870.078870..',
  '..07770.077770..',
  '..00000.067760..',
  '........000000..',
];

// DOWN-STROKE: the same fan swept low and compressed, rows 4-10.
//        0123456789abcdef
const KOOPA_FLY_B = [
  '................',
  '........0000....',
  '.......098870...',
  '....0009887760..',
  '..00dd088aab760.',
  '00dddc087abb7760',
  'dddcc0877abb7870',
  '0ddcc07777b78980',
  'ddccc06777700870',
  '0dcce0667777760.',
  'cce00006777760..',
  '000345430677600.',
  '.03455433067760.',
  '.03455433206660.',
  '023444433207870.',
  '0233443322078870',
  '012223332100660.',
  '01122221111000..',
  '.088777777760...',
  '.000000000000...',
  '..078870.07870..',
  '..077770.07770..',
  '..067760.00000..',
  '..000000........',
];

// THREE-QUARTER — rim on the left limb, spec carried over to the right.
//        0123456789abcdef
const KOOPA_SPIN_3 = [
  '................',
  '................',
  '....00000000....',
  '...0673445540...',
  '..067834555540..',
  '.06778345555440.',
  '.06778344554430.',
  '0677883344443330',
  '0677883333333320',
  '0677822233332220',
  '0677822222222220',
  '.06778122222210.',
  '.06781111111110.',
  '..067811111110..',
  '...0671111110...',
  '....00000000....',
];

const KOOPA_GREEN_WALK = new Anim(
  [mk(KOOPA_WALK_A, KOOPA_GREEN_PAL, 'koopa-walk-a'),
   mk(KOOPA_WALK_B, KOOPA_GREEN_PAL, 'koopa-walk-b')], 9);
const KOOPA_GREEN_SHELL = mk(KOOPA_SHELL_ROWS, KOOPA_GREEN_PAL, 'koopa-shell');
const KOOPA_GREEN_SPIN = new Anim(
  [KOOPA_SPIN_0, KOOPA_SPIN_1, KOOPA_SPIN_2, KOOPA_SPIN_3]
    .map((r, i) => mk(r, KOOPA_GREEN_PAL, `koopa-spin-${i}`)), 3);
const KOOPA_GREEN_FLY = new Anim(
  [mk(KOOPA_FLY_A, KOOPA_GREEN_PAL, 'koopa-fly-a'),
   mk(KOOPA_FLY_B, KOOPA_GREEN_PAL, 'koopa-fly-b')], 6);

export const KOOPA_GREEN = {
  walk: KOOPA_GREEN_WALK,
  shell: KOOPA_GREEN_SHELL,
  shellSpin: KOOPA_GREEN_SPIN,
  fly: KOOPA_GREEN_FLY,
};

const reAnim = (anim, tag) =>
  new Anim(anim.frames.map((f, i) => f.recolor(KOOPA_RED_PAL, `${tag}-${i}`)), anim.holds, anim.loop);

export const KOOPA_RED = {
  walk: reAnim(KOOPA_GREEN.walk, 'koopa-red-walk'),
  shell: KOOPA_GREEN.shell.recolor(KOOPA_RED_PAL, 'koopa-red-shell'),
  shellSpin: reAnim(KOOPA_GREEN.shellSpin, 'koopa-red-spin'),
  fly: reAnim(KOOPA_GREEN.fly, 'koopa-red-fly'),
};

/* ------------------------------------------------------------------ *
 * BUZZY BEETLE
 * ------------------------------------------------------------------ */

// 0 outline  1 shell dark  2 shell mid  3 shell lit  4 shell bright  5 spec
// 6 hide dark  7 hide mid  8 hide lit  9 eye white  a ink
const BUZZY_PAL = [
  '#080c18', '#14245e', '#1e3480', '#3055b8', '#5f88e4', '#b8d4ff',
  '#243458', '#4a628e', '#8098c4', '#ffffff', '#0a0a12',
];

// Two 2x2 eyes under the brim — a white lens with an ink pupil each — so both
// still read at 1x. It used to have one eye, one pixel wide.
//        0123456789abcdef
const BUZZY_WALK_A = [
  '................',
  '................',
  '.....000000.....',
  '...0345543220...',
  '..034555433220..',
  '.02345544332210.',
  '0234544333222110',
  '0123443322221110',
  '0122221110888880',
  '0111111110998990',
  '08887777669a89a0',
  '.07766666668880.',
  '..0000000000000.',
  '..07870.07870...',
  '..07670.00000...',
  '..00000.........',
];

// Squash frame: the carapace drops 1px and spreads a pixel per side, and each
// foot translates 1px in opposite directions.
//        0123456789abcdef
const BUZZY_WALK_B = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0345543220...',
  '.03455554332220.',
  '0234554433322210',
  '0123443322221110',
  '0122221110888880',
  '0111111110998990',
  '08887777669a89a0',
  '.07766666668880.',
  '..0000000000000.',
  '...07870.07870..',
  '...00000.07670..',
  '.........00000..',
];

//        0123456789abcdef
const BUZZY_SHELL_ROWS = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0345543220...',
  '..034555433220..',
  '.02345544332210.',
  '0234544333222110',
  '0123443322221110',
  '0123332222211110',
  '0122222222111110',
  '0788877776666610',
  '.08877776666660.',
  '.07766666666660.',
  '..066666666660..',
  '..000000000000..',
];

// Buzzy's spin is authored from BUZZY_SHELL_ROWS, NOT from the Koopa's. It keeps
// the beetle silhouette — narrow crown, wide flat skirt — through all four
// frames, and its ring is a 2px hide edge rather than the Koopa's 4px lip, so
// the shell never pops into a Koopa the instant it is kicked.
//        0123456789abcdef
const BUZZY_SPIN_0 = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0455544330...',
  '..044555443320..',
  '.03445554433220.',
  '0333444443332210',
  '0233344433322210',
  '0223333333222110',
  '0222233322221110',
  '0788887777666660',
  '.08877776666660.',
  '.07766666666660.',
  '..066666666660..',
  '..000000000000..',
];

//        0123456789abcdef
const BUZZY_SPIN_1 = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0554433270...',
  '..055554332760..',
  '.04555443322760.',
  '0344444433221760',
  '0334443332221760',
  '0333333322211760',
  '0222332222111760',
  '0222222221111760',
  '.01222211111760.',
  '.01111111111760.',
  '..011111111170..',
  '..000000000000..',
];

//        0123456789abcdef
const BUZZY_SPIN_2 = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0333322220...',
  '..023333322220..',
  '.06733333222210.',
  '0672333332222110',
  '0672333322222110',
  '0672222222221110',
  '0672222222211110',
  '0672222222111110',
  '.06712221111110.',
  '.01111111111110.',
  '..011111111110..',
  '..000000000000..',
];

//        0123456789abcdef
const BUZZY_SPIN_3 = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '...0733445550...',
  '..067334455550..',
  '.06723344555540.',
  '0672223344444430',
  '0671223334443330',
  '0671222333333320',
  '0671122222332220',
  '0671111222222220',
  '.06711111222210.',
  '.06711111111110.',
  '..071111111110..',
  '..000000000000..',
];

export const BUZZY = {
  walk: new Anim([mk(BUZZY_WALK_A, BUZZY_PAL, 'buzzy-walk-a'),
                  mk(BUZZY_WALK_B, BUZZY_PAL, 'buzzy-walk-b')], 8),
  shell: mk(BUZZY_SHELL_ROWS, BUZZY_PAL, 'buzzy-shell'),
  shellSpin: new Anim([BUZZY_SPIN_0, BUZZY_SPIN_1, BUZZY_SPIN_2, BUZZY_SPIN_3]
    .map((r, i) => mk(r, BUZZY_PAL, `buzzy-spin-${i}`)), 3),
};

/* ------------------------------------------------------------------ *
 * SPINY  (and the egg Lakitu throws)
 * ------------------------------------------------------------------ */

// 0 outline  1 shell dark  2 shell mid  3 shell lit  4 shell bright  5 spec
// 6 spike shade  7 spike white  8 face lit  9 face dark  a ink
const SPINY_PAL = [
  '#1c0a04', '#7a1c00', '#b83c00', '#e06a10', '#f89a34', '#ffd08a',
  '#b9c2cc', '#ffffff', '#e8a058', '#9c4408', '#0b0705',
];

// Four spikes, each a 1px tip on a 2px base with the outline valley cut all the
// way down to the shade ridge, so every tip is attached and none of them is a
// floating speck. The side spike sits on row 5 of BOTH frames — it cannot
// flicker. The head is a rounded pale dome emerging from under the brim with
// two 1x2 ink eyes and a mouth line, not a rectangle bolted to the shell.
//        0123456789abcdef
const SPINY_WALK_A = [
  '...0..0..0..0...',
  '..070070070070..',
  '..0770770770770.',
  '.06666666666660.',
  '.04554433322110.',
  '7764554433322210',
  '0345544333222110',
  '0234443330888890',
  '0233332208a88a90',
  '0122221088a88a90',
  '.011111088998890',
  '.044332219999990',
  '..0000000000000.',
  '..03430.03430...',
  '..02320.00000...',
  '..00000.........',
];

// Contact frame: the dome loses a row and the feet swap stance and X position.
//        0123456789abcdef
const SPINY_WALK_B = [
  '................',
  '...0..0..0..0...',
  '..070070070070..',
  '..0770770770770.',
  '.06666666666660.',
  '7764554433322210',
  '0345544333222110',
  '0234443330888890',
  '0233332208a88a90',
  '0122221088a88a90',
  '.011111088998890',
  '.044332219999990',
  '..0000000000000.',
  '...03430.03430..',
  '...00000.02320..',
  '.........00000..',
];

//        0123456789abcdef
const SPINY_EGG_A = [
  '.......0........',
  '......070.......',
  '.....077600.....',
  '....04554320....',
  '...0345543320...',
  '..034554433220..',
  '.00234443322100.',
  '0702333322211070',
  '0601222221111060',
  '.00111111111100.',
  '..011111111110..',
  '...0111111110...',
  '....01111110....',
  '.....061100.....',
  '......060.......',
  '.......0........',
];

//        0123456789abcdef
const SPINY_EGG_B = [
  '................',
  '................',
  '.....000000.....',
  '..070455432070..',
  '.07034554332070.',
  '0703455443322070',
  '..023444332210..',
  '..023333222110..',
  '..012222211110..',
  '..011111111110..',
  '0601111111111060',
  '.06011111111060.',
  '..060111111060..',
  '.....000000.....',
  '................',
  '................',
];

export const SPINY = {
  walk: new Anim([mk(SPINY_WALK_A, SPINY_PAL, 'spiny-walk-a'),
                  mk(SPINY_WALK_B, SPINY_PAL, 'spiny-walk-b')], 8),
  egg: new Anim([mk(SPINY_EGG_A, SPINY_PAL, 'spiny-egg-a'),
                 mk(SPINY_EGG_B, SPINY_PAL, 'spiny-egg-b')], 5),
};

/* ------------------------------------------------------------------ *
 * LAKITU
 * ------------------------------------------------------------------ */

// 0 outline  1 dark green  2 mid green  3 lit green  4 bright green  5 spec
// 6 cloud shade  7 cloud mid  8 cloud light / eye white  9 cloud mid-shade
// a ink  b goggle rim lit  c cloud deep  d goggle rim shade  e goggle rim dark
//
// Slot 9 used to be a second '#ffffff' — a duplicate of slot 8 — so it has been
// spent on the missing cloud step instead, giving the cloud a real 5-tone ramp
// (8 -> 7 -> 9 -> 6 -> c). Slots d/e were the egg, which is now SPINY.egg; they
// pay for the goggle rim's shade and dark side.
const LAKITU_PAL = [
  '#0c1a08', '#0b4210', '#12751a', '#35a832', '#6ed45c', '#cfffb4',
  '#c2d0e4', '#e2eaf6', '#ffffff', '#d2dcec', '#0b0705',
  '#ffd08a', '#a2b4d2', '#e8a83c', '#a86a10',
];

// The head is 13 rows tall in EVERY frame — idle, throw, both bob phases — so it
// can never shrink mid-throw. Only where it sits changes.
//        0123456789abcdef
const LAKITU_IDLE = [
  '................',
  '....00000000....',
  '...0345432210...',
  '..034554332210..',
  '.02341143113210.',
  '.02344333222110.',
  '023bbbb33bbbb210',
  '023b88d33b88d210',
  '023b8ad22b8ad210',
  '012ddee22ddee210',
  '0123333333332210',
  '0120000000002210',
  '.02008000800210.',
  '.02222222222110.',
  '.088800888008880',
  '0888880888808880',
  '0888888888877770',
  '0888888877799990',
  '0888877799999960',
  '0887779999966660',
  '0777999996666660',
  '.07999966666ccc0',
  '..09960666660cc0',
  '...000.00000.00.',
];

// Wind-up. Same head, same 13 rows; the mouth opens and an arm comes up over the
// shell's right shoulder. The egg is SPINY.egg, spawned by the entity — it is no
// longer glued on top of the head at the cost of four head rows.
//        0123456789abcdef
const LAKITU_THROW = [
  '...........04540',
  '....000000003440',
  '...0345432210340',
  '..03455433220330',
  '.023411431132030',
  '.02344333222110.',
  '023bbbb33bbbb210',
  '023b88d33b88d210',
  '023b8ad22b8ad210',
  '012ddee22ddee210',
  '0123333333332210',
  '0120aaaaaaa02210',
  '.020a88a88a0210.',
  '.02222222222110.',
  '.088800888008880',
  '0888880888808880',
  '0888888888877770',
  '0888888877799990',
  '0888877799999960',
  '0887779999966660',
  '0777999996666660',
  '.07999966666ccc0',
  '..09960666660cc0',
  '...000.00000.00.',
];

// Drift + bob: cloud lobes and bumps shift 1px, the interior banding rolls with
// them, and Lakitu settles a pixel deeper into the cloud.
//        0123456789abcdef
const LAKITU_IDLE_B = [
  '................',
  '................',
  '....00000000....',
  '...0345432210...',
  '..034554332210..',
  '.02341143113210.',
  '.02344333222110.',
  '023bbbb33bbbb210',
  '023b88d33b88d210',
  '023b8ad22b8ad210',
  '012ddee22ddee210',
  '0123333333332210',
  '0120000000002210',
  '.02008000800210.',
  '.022222222221100',
  '088888.088888880',
  '0788888888887770',
  '0988888887779990',
  '0688887779999990',
  '0688777999996660',
  '0677799999666660',
  '0c07999966666cc0',
  '...09960666660c0',
  '....000.00000.00',
];

// Wind-up, second bob phase.
//        0123456789abcdef
const LAKITU_THROW_B = [
  '................',
  '...........04540',
  '....000000003440',
  '...0345432210340',
  '..03455433220330',
  '.023411431132030',
  '.02344333222110.',
  '023bbbb33bbbb210',
  '023b88d33b88d210',
  '023b8ad22b8ad210',
  '012ddee22ddee210',
  '0123333333332210',
  '0120aaaaaaa02210',
  '.020a88a88a0210.',
  '.022222222221100',
  '088888.088888880',
  '0788888888887770',
  '0988888887779990',
  '0688887779999990',
  '0688777999996660',
  '0677799999666660',
  '0c07999966666cc0',
  '...09960666660c0',
  '....000.00000.00',
];

// Nothing here is static: the cloud drifts a pixel and re-rolls its internal
// banding while Lakitu settles into it and rises again.
export const LAKITU = {
  idle: new Anim([mk(LAKITU_IDLE, LAKITU_PAL, 'lakitu-idle'),
                  mk(LAKITU_IDLE_B, LAKITU_PAL, 'lakitu-idle-b')], 24),
  throwing: new Anim([mk(LAKITU_THROW, LAKITU_PAL, 'lakitu-throw'),
                      mk(LAKITU_THROW_B, LAKITU_PAL, 'lakitu-throw-b')], 24),
};
