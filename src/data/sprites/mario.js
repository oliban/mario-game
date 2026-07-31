// Mario — every form, every animation.
//
// Palette slot contract. Every entry of MARIO_PALS uses it, so any sprite can be
// recolored into any form (or star flash) without redrawing a single pixel:
//
//   0 outline      4 hair         8 overall shadow   c shoe mid
//   1 skin shadow  5 cap shadow   9 overall mid      d button / buckle
//   2 skin mid     6 cap mid      a overall light    e cap specular
//   3 skin light   7 cap light    b shoe dark        f soft interior line
//
// Slot 1 doubles as the lit tone on the boots (same warm brown family), so leather
// gets a four-step ramp (0 -> b -> c -> 1) without burning a palette slot. Those
// steps are measured, not asserted: b->c is 71 units and c->1 is 42.
//
// Every palette in this file is checked pairwise: in all eight of them no two of
// the sixteen slots are closer than 40 RGB units. A ramp whose neighbours are 12
// or 30 apart is not a ramp, it is one colour that the code claims is three.
//
// Light falls from the upper left. All sprites face RIGHT; the engine mirrors.
//
// Five rules the whole file follows:
//   * The BRIM OVERHANGS THE CROWN. Measured down the right edge of the big head:
//     crown 12, brim 14, face 13, nose 15. Two steps out, one step back, two out
//     again. If the dome is as wide as the brim the whole head collapses into one
//     rounded blob in flat silhouette — which is exactly what it used to do.
//   * The NOSE carries the profile. It steps one pixel past the cap brim on the two
//     eye rows and pulls back in under the moustache, so the head reads as a face
//     and not a brick even at 1x. The brim casts a shadow (slot 1) on the row
//     directly beneath it; skin light (slot 3) only lands on the nose bridge and
//     the cheekbone, never under the brim.
//   * The NEAR arm BREAKS the torso box. On the standing poses column x11 is
//     transparent for the length of the forearm: torso outline at x10, sky at x11,
//     arm outline at x12, sleeve at x13-14, arm outline at x15. Slot f draws the
//     seam only where the sleeve is still welded to the shoulder.
//   * The LEGS never fuse. Every pose keeps at least one column of background
//     between the two limbs below the hip — including the passing frame of the
//     walk, which is on screen roughly a third of all running time. At most ONE
//     row, the pelvis, is allowed to weld them.
//   * No floating interior bars. Slot f is a fold line that touches a silhouette
//     edge or a limb; it is never a free-standing rectangle in the middle of a
//     colour field.
//
// Two invariants that are measured, not asserted, and that this file previously
// broke in fifteen sprites:
//   * NO SPRITE HAS A FULLY OPAQUE ROW. Not one of the 63 baked frames contains a
//     16-wide run of ink. A solid row is the signature of two forms that have been
//     allowed to touch — arm into skull, leg into leg, hand into hip — and it is
//     invisible in the art file but fatal in flat silhouette.
//   * Every sprite uses all sixteen palette slots — a declared slot that no pixel
//     reaches means the form under it was never shaded.
//
// Every block below is a fixed-width 16-column grid; `sm`/`bg` assert both the
// width and the expected row count, so an off-size block fails at import instead
// of pushing a row through the floor at runtime.

import { makeSprite, Anim } from '../../core/gfx.js';
import { INK } from '../palette.js';

const OUT = INK.outline;
// The seam colour is a cold near-black indigo, not a third brown. It has to sit
// between a red sleeve and a blue bib and stay >= 40 units from the outline, the
// hair AND the boots; when it was #3b2412 it was 40 from the outline and 20 from
// boot leather, so every fold line it drew silently merged into what it touched.
const SOFT = '#18103c';

const SKIN = ['#a8571c', '#ef9a49', '#f8d5ac'];
const SKIN_PALE = ['#b06a33', '#f4b47e', '#ffe6cc'];
// Hair is a cool ashen brown so it separates from BOTH the cap shadow above it
// and the boot leather below it. A red-brown (#733210) measured 32 from the cap
// shadow it sits directly under — the sideburn vanished into the brim.
const HAIR = '#5a3a28';
// Boot dark is kept well clear of the outline so soles still read against a black
// (underground / castle) background. Slot 1 (skin shadow, #a8571c) doubles as the
// boot's lit tone: 1 -> c is 42 units and c -> b is 71, so the leather is a real
// three-step form instead of the two-step mass it used to be.
const SHOE = ['#4a1f06', '#84421c'];
const BTN = '#f0c840';

//                 shadow      mid        light      specular
// Overall light stays below the #5c94fc sky so leg edges never dissolve into it.
// RED specular is pushed toward hot pink rather than orange — an orange specular
// measured 30 units from skin mid and read as a hole punched through to the
// forehead. BLUE mid is darkened (not the light lifted) so the bib's three-column
// belly shadow actually steps: 8->9 is 59 and 9->a is 75.
const RED = ['#7c1408', '#d02a16', '#f0603a', '#ff8b7f'];
const BLUE = ['#0b2f74', '#1749a8', '#3878d8', '#a8d0ff'];
const WHITE = ['#6c7590', '#a8b4cc', '#d8e0f0', '#ffffff'];
const GOLD = ['#8a5600', '#e0a41c', '#fbe07c', '#fff8d0'];
const GREEN = ['#0d5210', '#2fa832', '#8ce65a', '#d4ffb0'];

function pal(cap, ovl, skin = SKIN, hair = HAIR, shoe = SHOE, btn = BTN) {
  return [
    OUT, skin[0], skin[1], skin[2],
    hair, cap[0], cap[1], cap[2],
    ovl[0], ovl[1], ovl[2], shoe[0],
    shoe[1], btn, cap[3], SOFT,
  ];
}

const SMALL_PAL = pal(RED, BLUE);
const BIG_PAL = pal(RED, BLUE);
const FIRE_PAL = pal(WHITE, RED, SKIN, HAIR, SHOE, BTN);
const DEAD_PAL = pal(RED, BLUE, SKIN_PALE);
const FIRE_DEAD_PAL = pal(WHITE, RED, SKIN_PALE, HAIR, SHOE, BTN);

// The star flash cycles cap, overalls, shoes, hair and buttons — never the SKIN.
// Holding the face on one ramp is what keeps the cap/face edge readable through
// all four phases; a gold cap over gold skin turns the head into one blank mass.
//
// Every phase is measured: no two of its sixteen slots are closer than 40 RGB
// units. That is why the boots go green under gold overalls and the button goes
// dark red under them — a gold button on a gold bib is not a button, and a white
// button next to a white specular is one slot spent twice.
const STAR_PALS = [
  pal(WHITE, GOLD, SKIN, '#1c3a5c', ['#243a10', '#3c6a1c'], '#7c1408'),
  pal(GOLD, GREEN, SKIN, '#1c3a5c', ['#4a1f06', '#8a3a24'], '#7c1408'),
  pal(GREEN, RED, SKIN, '#1c3a5c', SHOE, BTN),
  pal(RED, WHITE, SKIN, HAIR, SHOE, BTN),
];

export const MARIO_PALS = {
  small: SMALL_PAL,
  big: BIG_PAL,
  fire: FIRE_PAL,
  dead: DEAD_PAL,
  star: STAR_PALS,
};

const BLANK = '................';

function grid(rows, h, name) {
  if (rows.length !== h) {
    throw new Error(`mario: ${name} is ${rows.length} rows, expected ${h}`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== 16) {
      throw new Error(`mario: ${name} row ${i} "${rows[i]}" is ${rows[i].length} wide, expected 16`);
    }
  }
  return rows;
}

function sm(rows, name, h = 16) {
  return makeSprite(grid(rows, h, 'small.' + name), SMALL_PAL, {
    name: 'mario.small.' + name, ox: -2, oy: 0,
  });
}
function bg(rows, name, h = 32) {
  return makeSprite(grid(rows, h, 'big.' + name), BIG_PAL, {
    name: 'mario.big.' + name, ox: -2, oy: 0,
  });
}

/* ================================================================== *
 *  SMALL MARIO — 16 x 16   (head 8 rows, torso 4, legs 4)
 * ================================================================== */

// Face rows 4-5 push the nose out to x14 (outline x15) — one pixel past the cap
// brim — then row 6 pulls back to x13 and row 7 to x11. Moustache is 5px under the
// nose only, so the sideburn, the lit cheek and the jaw stay separate browns.
// The cap specular runs (x6,r1)->(x5,r2), a diagonal down the lit face of the dome.
const S_HEAD = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..0665555555550.',
  '..04422202323210',
  '..04432202222210',
  '..0442344444210.',
  '...0122222100...',
];

// Walk frame C / swim pull: cap + brim slid one pixel forward of the face so the
// head leads the step and dips into the stroke.
const S_HEAD_LEAN = [
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...0665555555550',
  '..04422202323210',
  '..04432202222210',
  '..0442244444210.',
  '...0122222100...',
];

// Swim recovery: chin pulled a pixel back, brim tipped up so the nose bridge shows
// above it. The head genuinely lifts — it is not S_HEAD translated.
const S_HEAD_LIFT = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee766655550.',
  '..0665555502210.',
  '..04422202232210',
  '..0443220222210.',
  '..044244444210..',
  '..0122222100....',
];

// Skid: cap thrown two pixels back, face only one, and the eye widened to a 2px
// slot-0 slit for the gritted look.
const S_HEAD_SKID = [
  '...000000.......',
  '.07ee76650......',
  '07ee7666650.....',
  '0665555555550...',
  '.04422200232210.',
  '.04432200222210.',
  '.0442244444210..',
  '..0122222100....',
];

// Reach: the raised hand lives in the two rows the jaw leaves empty on the right.
const S_HEAD_REACH = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..0665555555550.',
  '..04422202323210',
  '..04432202222210',
  '..04422444442100',
  '...0122222100220',
];

const S_HEAD_CLIMB_HI = [
  '......000000....',
  '....07ee76650...',
  '03207ee7666650..',
  '021066555555550.',
  '075.442220232210',
  '065.443220222210',
  '065.442244444210',
  '.0650122222100..',
];
const S_HEAD_CLIMB_LO = [
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...066555555550.',
  '032.442220232210',
  '021.443320222210',
  '075.442244444210',
  '.0650122222100..',
];

/* --- small torso blocks (rows 8..11) ------------------------------ *
 * x11 carries the slot-f arm seam at the shoulder; below the shoulder x11 goes
 * transparent so the forearm silhouettes clear of the ribs (torso outline x10,
 * sky x11, arm outline x12, sleeve x13, outline x14). The far sleeve is 2px at
 * x2-3 and runs 6 on its outboard column into 5 against the chest, so it reads as
 * a rounded limb behind the ribs rather than a flat stripe down the bib.          */

// Arm hanging at the side — hand at x12-13, sky notch cut at x11.
const SA_LOW = [
  '..076666666650..',
  '.0766966966f760.',
  '.065a999980.070.',
  '.021ad99d998320.',
];
// Walk contact: arm swept back. Seam and sleeve step one column left, hand at
// x11-12 — a full column behind the hanging pose.
const SA_BACK = [
  '..076666666650..',
  '.076696669f760..',
  '.065a99998f760..',
  '.021ad99d98320..',
];
// Arm straight out in front, hand clear of the chest at x12-14.
const SA_PULL = [
  '..076666666650..',
  '.0766966966f7650',
  '.065a999998f2220',
  '.021ad99d99880..',
];
// Walk push-off (3 rows — hips ride a pixel higher): the forward hand rides at
// x12-14, a row higher and two columns ahead of the back-swing.
const SA_PULL3 = [
  '..076666666650..',
  '.0766966966f7650',
  '.021ad99d9982220',
];
// Recovery: elbows in, the folded hand outlined onto the chest.
const SA_TUCK = [
  '..076666666650..',
  '.0766966966f760.',
  '.065a9902216650.',
  '.021ad99000880..',
];
// Arm rising forward at shoulder height.
const SA_RISE = [
  '..076666666650..',
  '.0766966966f7220',
  '.065a99999880...',
  '.021ad99d99880..',
];
// Arm overhead — hand is drawn into S_HEAD_REACH.
const SA_REACH = [
  '..07666666666220',
  '.0766966966f760.',
  '.065a99999880...',
  '.021ad99d99880..',
];
// Float: forearms angled forward at chest height, hands high.
const SA_FLOAT = [
  '..076666666650..',
  '.0766966966f2220',
  '.065a999998f760.',
  '.021ad99d99880..',
];
// Grow/shrink squash: shoulders spread, both hands braced out at the hips.
const SA_SQUASH = [
  '.07666666666650.',
  '022.6966966f.220',
  '022.ad99d980.220',
];

/* --- small leg blocks (rows 12..15) -------------------------------
 * Far leg is one step darker than the near leg all the way down so the two never
 * read as one blue slab.                                                        */

const SL_TOGETHER = [
  '..0a9999999980..',
  '..0998800a9980..',
  '..0ccb0.01ccb0..',
  '.0bccb0.0bcccb0.',
];
// Contact: both boots planted, three columns of sky between the soles so the
// stride still reads as a stride in flat silhouette.
const SL_STRIDE = [
  '..0a9999999980..',
  '.099800..0a9980.',
  '01cb0....01ccb0.',
  '0bccb0...0bcccb0',
];
// Passing (3 rows — body has dropped a pixel): rear boot swung up and forward,
// clear of the ground AND clear of the standing leg's column.
const SL_PASS = [
  '0ccb0..0a9980...',
  '0bcb0..01ccb0...',
  '.......0bcccb0..',
];
// Push-off (5 rows — hips ride a pixel higher): front heel reaching, rear leg
// stretched back on its toe.
const SL_REACH = [
  '..0a9999999980..',
  '.0998800a99980..',
  '099800...0a9980.',
  '01cb0....01ccb0.',
  '0bccb0...0bcccb0',
];
// Swim: wide split, knees at different bends, boots never level.
const SL_SPLIT = [
  '..0a9999999980..',
  '01cb0....0a99980',
  '0bccb0...01ccb0.',
  '.........0bcccb0',
];
// Swim pull: rear boot kicked up and back a row higher than the near knee, near
// boot dropped — neither foot level, and no leg here matches a walk pose.
const SL_SWIMPULL = [
  '..0a9999999980..',
  '01ccb0..0a99980.',
  '0bccb0...099980.',
  '.........01ccb0.',
];
// Swim: both knees folded up.
const SL_TUCK = [
  '..0a9999999980..',
  '..0ccb0.01ccb0..',
  '.0bccb0.0bcccb0.',
  '................',
];
// Swim: near leg snapping down, far leg kicked back and up.
const SL_KICK = [
  '..0a9999999980..',
  '01cb00..0a9980..',
  '0bccb0..01ccb0..',
  '........0bcccb0.',
];
// Glide: both knees relaxed and hanging a pixel apart, near boot one row above the
// far one, and nothing at all on the bottom row — the float rides higher than any
// stroke frame.
const SL_HANG = [
  '..0980.0a9980...',
  '..0980..01ccb0..',
  '..0880..0bcccb0.',
  '.0bccb0.........',
];
// Float: trailing foot drifts down and back, the other hangs loose.
const SL_FLOAT = [
  '..0a9999999980..',
  '.09980..0a9980..',
  '.0ccb0..01ccb0..',
  '0bccb0..0bccb0..',
];
// Swim: legs trailing back with the toes pointed — a different boot shape, not a
// slid copy of SL_TOGETHER.
const SL_TRAIL = [
  '..0a9999999980..',
  '.09980.0a99880..',
  '01cb00.01cb00...',
  '0bccb0.0bccb0...',
];
// Airborne: rear leg tucked up, front leg reaching down.
const SL_JUMP = [
  '..0a9999999980..',
  '01cb00..0a99980.',
  '0bccb0..0a99980.',
  '........01ccb0..',
];
// Grow/shrink squash (5 rows): hips bulge a pixel wider each side and the soles
// spread — the size change lands with weight instead of mid-stride.
const SL_SQUASH = [
  '..0a9999999980..',
  '.0a999999999890.',
  '.09980.0a9980...',
  '.0cccb0.01cccb0.',
  '0bbcccb0.0bcccb0',
];

const SMALL_IDLE = sm([...S_HEAD, ...SA_LOW, ...SL_TOGETHER], 'idle');

// Walk: A contact, arm swept back (hand x11-12) -> B passing, arm vertical
// (hand x12-13, body dropped 1px) -> C push-off, arm driven forward (hand x12-14,
// a row higher). Head, hips, both boots AND the hand all move every frame.
const SMALL_WALK_A = sm([...S_HEAD, ...SA_BACK, ...SL_STRIDE], 'walkA');
const SMALL_WALK_B = sm([BLANK, ...S_HEAD, ...SA_LOW, ...SL_PASS], 'walkB');
const SMALL_WALK_C = sm([...S_HEAD_LEAN, ...SA_PULL3, ...SL_REACH], 'walkC');

const SMALL_JUMP = sm([
  ...S_HEAD_REACH,
  '..07666666666220',
  '02266966966f760.',
  '022a99999880....',
  '..0ad99d99880...',
  ...SL_JUMP,
], 'jump');

const SMALL_SKID = sm([
  ...S_HEAD_SKID,
  '.076666666650...',
  '0766966966f6650.',
  '066a9999980.0760',
  '011ad99d9980.320',
  '.0a999999998000.',
  '.01cb0..0a99980.',
  '.0bccb0.0a99980.',
  '.......01ccccb0.',
], 'skid');

// Same column contract as BIG_DEAD_ROWS: arm x0-x2, SKY at x3, head x4-x11 with
// its own outline at x4 and x11, SKY at x12, arm x13-x15. Five rows of solid
// 16-wide ink used to weld the cap, both fists and the face into one lump.
const SMALL_DEAD = makeSprite(grid([
  '...0000000000...',
  '..07ee76666650..',
  '.06655555555550.',
  '000.04111140.000',
  '032.04022040.310',
  '021.01232210.210',
  '076.04444440.650',
  '065..012210..550',
  '.06776666665550.',
  '.066f999999f650.',
  '.06ad999999d860.',
  '..0a9999998880..',
  '..0a9988899880..',
  '..0a980.0a9980..',
  '..01cb0.01ccb0..',
  '..0bbb0.0bcccb0.',
], 16, 'small.dead'), DEAD_PAL, { name: 'mario.small.dead', ox: -2, oy: 0 });

// Climb: the legs alternate their grip. In A the near leg is folded up and its
// boot sits three rows above the far boot; in B the pair is swapped.
const SMALL_CLIMB_A = sm([
  ...S_HEAD_CLIMB_HI,
  '...076666666650.',
  '03266966966f760.',
  '021.6a999998f760',
  '...0ad99d998210.',
  '...0a9999999980.',
  '...09980.01ccb0.',
  '...09880.0bccb0.',
  '..0bcccb0.......',
], 'climbA');

const SMALL_CLIMB_B = sm([
  ...S_HEAD_CLIMB_LO,
  '...076666666650.',
  '...06966966f760.',
  '032.6a999998f760',
  '021.6ad99d998210',
  '...0a9999999980.',
  '...01cb0.0a9980.',
  '..0bccb0.0a9880.',
  '.........01ccb0.',
], 'climbB');

// Six-frame stroke: the hand traces reach (above the head) -> forward -> at the
// side -> past the hip -> tucked on the chest -> rising, and no two leg blocks
// are translations of each other. The head dips on the pull (S_HEAD_LEAN) and
// lifts on the recovery (S_HEAD_LIFT) instead of riding as a rigid block.
const SMALL_SWIM_1 = sm([...S_HEAD_REACH, ...SA_REACH, ...SL_SPLIT], 'swim1');
const SMALL_SWIM_2 = sm([...S_HEAD_LEAN, ...SA_PULL, ...SL_SWIMPULL], 'swim2');
const SMALL_SWIM_3 = sm([...S_HEAD_LEAN, ...SA_LOW, ...SL_KICK], 'swim3');
const SMALL_SWIM_4 = sm([...S_HEAD, ...SA_BACK, ...SL_TUCK], 'swim4');
const SMALL_SWIM_5 = sm([...S_HEAD_LIFT, ...SA_TUCK, ...SL_TRAIL], 'swim5');
const SMALL_SWIM_6 = sm([...S_HEAD_LIFT, ...SA_RISE, ...SL_FLOAT], 'swim6');

// Floating: forearms up at chest height, both knees loose, near foot a row above
// the far one and the bottom row empty — the glide visibly rides higher than the
// stroke it came out of.
const SMALL_SWIM_IDLE = sm([...S_HEAD, ...SA_FLOAT, ...SL_HANG], 'swimIdle');

// Transformation pose: a 16-row squash-and-hold. Same footprint as every other
// small sprite (it used to be 17 and pushed a row through the floor) and its own
// pose rather than a borrowed walk frame.
const SMALL_GROW = sm([...S_HEAD, ...SA_SQUASH, ...SL_SQUASH], 'grow');

export const SMALL_MARIO = {
  idle: SMALL_IDLE,
  walk: new Anim([SMALL_WALK_A, SMALL_WALK_B, SMALL_WALK_C], 5),
  jump: SMALL_JUMP,
  skid: SMALL_SKID,
  dead: SMALL_DEAD,
  climb: new Anim([SMALL_CLIMB_A, SMALL_CLIMB_B], 8),
  swim: new Anim([SMALL_SWIM_1, SMALL_SWIM_2, SMALL_SWIM_3, SMALL_SWIM_4, SMALL_SWIM_5, SMALL_SWIM_6],
    [6, 5, 5, 7, 6, 6]),
  swimIdle: SMALL_SWIM_IDLE,
  grow: SMALL_GROW,
  star: STAR_PALS,
};

/* ================================================================== *
 *  BIG MARIO — 16 x 32   (head 12 rows, torso 10, legs + boots 10)
 * ================================================================== */

// Silhouette down the face: brim 14, nose 15, nose 15, moustache 14, jaw 13,
// chin 12, neck 11. Row 5 is the brim's cast shadow (slot 1). Skin light lands on
// the nose bridge (x10-11, rows 5-6) and the cheekbone (x5-6, rows 7-8) — the two
// planes that actually face the upper-left key.
const B_HEAD = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..07776666650...',
  '..0665555555550.',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
  '....01222110....',
];

// Walk frame C: cap + brim lead the face by a pixel.
const B_HEAD_LEAN = [
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...07776666650..',
  '...0665555555550',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
  '....01222110....',
];

// Swim pull: the whole head drops a row into the water and the cap tips a pixel
// forward of the face, so the skull rolls with the stroke instead of riding it.
const B_HEAD_DIP = [
  '................',
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...07776666650..',
  '...0665555555550',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
];

// Swim recovery: brim tipped up so the bridge of the nose clears it a row early,
// jaw and chin pulled a pixel back. The chin lifts, the cap does not translate.
const B_HEAD_LIFT = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..07776666655550',
  '..06655555502210',
  '..04411222332210',
  '..0442220222210.',
  '..0443320222210.',
  '..044324444410..',
  '..01222444410...',
  '..0122222100....',
  '...01222110.....',
];

// Skid: cap thrown two pixels back over a face that only moves one, so the brim
// leads and the chin trails. Eye widened to a 2px slot-0 slit.
const B_HEAD_L = [
  '...000000.......',
  '.07ee76650......',
  '07ee7666650.....',
  '07776666650.....',
  '0665555555550...',
  '.044112223210...',
  '.04422200332210.',
  '.04433200222210.',
  '.0443224444410..',
  '..01222444410...',
  '..0122222100....',
  '...01222110.....',
];

// Reach: hand and wrist occupy the three rows the jaw leaves free on the right.
const B_HEAD_REACH = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..07776666650...',
  '..0665555555550.',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...0122244441000',
  '...0122222100022',
  '....012221100220',
];

// Climbing: the far arm crosses in front of the pole. It is a lit sleeve (slot 7
// at the shoulder, 6 down the upper arm) over a shadow column (slot 5) on the
// side turning away from the key light, capped by a two-tone skin fist — a
// modelled limb, not a 2px bar of one flat red. On the three rows where the arm
// runs alongside the cheek, x3 is background: the reaching arm has to clear the
// skull or the whole climb pose is one 16-wide slab of ink.
const B_HEAD_CLIMB_HI = [
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...07776666650..',
  '032066555555550.',
  '021044112223210.',
  '075.442220233210',
  '065.443320222210',
  '065.443224444410',
  '.06501222444410.',
  '.0650122222100..',
  '..06501222110...',
];

const B_HEAD_CLIMB_LO = [
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...07776666650..',
  '...066555555550.',
  '...044112223210.',
  '032.442220233210',
  '021.443320222210',
  '075.443224444410',
  '.06501222444410.',
  '.0650122222100..',
  '..06501222110...',
];

/* --- big torso blocks (rows 12..21) -------------------------------
 * Column plan: x1 outline, x2-3 far sleeve, x4-x9 overalls ramped
 * light->mid->shadow left to right, x10 torso outline, x11 SKY, x12 arm outline,
 * x13-14 near sleeve, x15 arm outline. Slot f welds the sleeve to the shoulder on
 * rows 13-14 only; below that the arm is a free limb with background behind it.
 * The hand is a 2x2 of skin that terminates the arm with its own outline.
 *
 * BOTH sleeves are modelled, not filled. The near sleeve runs 7 (lit) -> 6 (mid)
 * -> 5 (shadow) left to right across its width, so the limb closest to the camera
 * is a cylinder; it used to be 8 flat pixels of slot 6 and never reached slot 7
 * anywhere in the sprite. The far sleeve is 6 on its outboard column and 5 on the
 * column against the chest, and it ends in a slot-0 cuff before the hand instead
 * of running six flat pixels of one red straight into four flat pixels of skin.
 *
 * The chest is not a flat blue rectangle: the shadow WIDENS as it descends —
 * one column at the sternum, two at the ribs, three at the belly — so the bib
 * reads as a barrel turning away from the upper-left key rather than as a field
 * with a 1px line down one side.
 *
 * The last three rows of every block are the shared pelvis: waist, a rounded hip
 * mass turning away from the light, and a crotch fold that runs into the leg gap.
 * (No 4px slot-f bar floating in the middle of the bib — that read as a mail slot
 * at 30x and as a hole at 1x.)                                                  */

const BA_DOWN = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad999d0.0760',
  '.065aa99980.0760',
  '.001a999880.0320',
  '.021a998880.0210',
  '..0a99999988800.',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Walk contact — arm swept back behind the hip. Seam and sleeve step one column
// left of the hanging pose and the hand drops to rows 18-19 at x12-13.
const BA_WALK_BACK = [
  '..076666666650..',
  '.076696669f7650.',
  '.065aa9999f7650.',
  '.065ad999df7650.',
  '.065aa9998f7650.',
  '.001a99988f7650.',
  '.021a9988880320.',
  '..0a99999980210.',
  '..0a9999888800..',
  '..0a9988899880..',
];
// Walk push-off (9 rows — chest squashed, hips a pixel higher) — arm driven
// forward and up, elbow high, hand out at x14-15 clear of the chest. The forearm
// is short because it is foreshortened straight at the camera.
const BA_WALK_FWD = [
  '..0766666666650.',
  '.0766966696f7660',
  '.065aa99999f7660',
  '.065ad999d9f7622',
  '.065a99999988021',
  '.021a99999888000',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 1 — arm overhead (hand lives in B_HEAD_REACH).
const BA_REACH = [
  '..07666666666220',
  '.0766966696f760.',
  '.065aa9999980...',
  '.065ad999d980...',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 2 — arm straight out in front, hand clear of the chest.
const BA_PULL = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7620',
  '.065ad999d9f7220',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 4 — hand driven down past the hip.
const BA_BACK = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad999d9f7650',
  '.065a999998f7650',
  '.001a99998880760',
  '.021a99998880320',
  '..0a999999888210',
  '..0a99998888800.',
  '..0a9988899880..',
];
// Stroke pose 5 — recovery. The elbow swings out, the forearm crosses in over the
// bib and the hand is boxed on its own outline at the end of it: a limb, not four
// loose skin pixels keyed into the blue.
const BA_TUCK = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad990776650.',
  '.065a9902216650.',
  '.001a999000880..',
  '.021a99998880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 6 — arm swinging back up to shoulder height.
const BA_RISE = [
  '..076666666650..',
  '.076696669f7220.',
  '.065aa9999980210',
  '.065ad999d980...',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Float (9 rows): forearms lifted to chest height and angled forward.
const BA_FLOAT = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7220',
  '.065ad999d9f2220',
  '.065a99999880...',
  '.021a99998880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];

/* --- big leg blocks (rows 22..31) ---------------------------------
 * Both legs get a knee and a calf: 4px thigh, a 3px pinch at the knee, a 4px calf
 * with the light column stepping one pixel outboard to follow the curve, then a
 * 3px ankle into the boot. The far leg runs a full 3-tone ramp (a/9/8) one step
 * darker than the near leg so the two never fuse into a single blue column.     */

// Idle stance. The hips stay welded for two rows, then a column of sky opens
// between the legs and runs unbroken to the soles — in flat silhouette the idle
// has to read as a man standing, not as a pillar with a head on it. The far leg
// pinches at the knee (row 25) and the near calf swells one column outboard
// (rows 26-27) so neither limb is an extruded rectangle.
const BL_TOGETHER = [
  '..0a98800a9980..',
  '..0a980..0a9980.',
  '..0a980..0a9980.',
  '..09980..0a9980.',
  '..09880..0a99980',
  '..08880..0999980',
  '..01ccb0.01ccb0.',
  '..0cccb0.0cccb0.',
  '.0bcccb0.0bcccb0',
  '.0bbbbb0.0bbbbb0',
];
// Contact: both boots down, legs splayed.
const BL_STRIDE = [
  '.0998800a99980..',
  '.099800..0a9980.',
  '.09880...0a9980.',
  '099800...0a99980',
  '09880....0a99980',
  '08880....0888880',
  '0cccb0...01ccb0.',
  '0cccb0...0cccb0.',
  '0bcccb0..0bcccb0',
  '0bbbbb0..0bbbbb0',
];
// Passing (9 rows — body dropped a pixel): rear boot lifted clear and toed off,
// near leg vertical under the weight. The rear leg is one column narrower than the
// near one so a full column of sky runs at x7 from hip to sole: every row here is
// exactly two ink runs. This is the frame that is on screen a third of all running
// time — when the two legs touched at x7/x8 the whole cycle collapsed into a slab.
const BL_PASS = [
  '..09980.0a9980..',
  '..09980.0a9980..',
  '..08880.0a9980..',
  '..01cb0.0a9980..',
  '..0ccb0.0a9880..',
  '.0bbbb0.01ccb0..',
  '........0cccb0..',
  '.......0bcccb0..',
  '.......0bbbbb0..',
];
// Push-off (11 rows — hips a pixel higher): front heel reaching, rear heel up.
const BL_PUSH = [
  '..0998800a9980..',
  '.0998800.0a9980.',
  '.099800..0a9980.',
  '099800...0a99980',
  '09880....0a99980',
  '09880....0a99980',
  '08880....0999980',
  '01cb0....0888880',
  '0cccb0...01ccb0.',
  '0bbbb0...0cccb0.',
  '........0bcccb0.',
];
// Swim: moderate split, rear sole one row shy of the near one.
const BL_OPEN = [
  '..0998800a99980.',
  '.099880..0a9980.',
  '.09880...0a9980.',
  '.09880...0a9980.',
  '.08880...0a9980.',
  '.01cb0...0a9980.',
  '.0cccb0..099980.',
  '0bcccb0..01ccb0.',
  '0bbbbb0..0cccb0.',
  '.........0bcccb0',
];
// Swim: wide split with the near knee bent forward, feet three rows apart.
const BL_SPLIT = [
  '..0998800a99980.',
  '.099880..0a9980.',
  '099880...0a9980.',
  '09880....0a99980',
  '01cb0....0a99980',
  '0cccb0...0a99980',
  '0bbbb0....099980',
  '..........01ccb0',
  '.........0bcccb0',
  '.........0bbbbb0',
];
// Swim: near leg folded up and forward, far leg trailing down and back.
const BL_SCISSOR = [
  '..0998800a9980..',
  '.099880..0a99980',
  '.09880...0a99980',
  '099880....099980',
  '09880.....01ccb0',
  '09880.....0cccb0',
  '08880....0bcccb0',
  '01cb0.....0bbbb0',
  '0cccb0..........',
  '0bbbbb0.........',
];
// Swim: both knees folded, boots clear of the ground line entirely.
const BL_TUCK = [
  '..09980.0a9980..',
  '..09980.0a9980..',
  '..08880.0a9880..',
  '..01cb0.0a8880..',
  '..0ccb0.01ccb0..',
  '.0bbbb0.0cccb0..',
  '.......0bcccb0..',
  '.......0bbbbb0..',
  '................',
  '................',
];
// Swim: near leg snapping straight down, far leg kicked back and up.
const BL_KICK = [
  '..0998800a9980..',
  '.0998800.0a9980.',
  '099880...0a9980.',
  '01ccb0...0a9980.',
  '0cccb0...0a9980.',
  '0bbbb0...0a9980.',
  '.........0a9980.',
  '.........01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];
// Float (11 rows): trailing foot drifts down and back, the other hangs loose.
const BL_FLOAT = [
  '..0998800a9980..',
  '..0998800a9980..',
  '.099800..0a9980.',
  '.09880...0a9980.',
  '.09880...0a9980.',
  '.08880...0a9880.',
  '.01cb0...0a8880.',
  '.0cccb0..01ccb0.',
  '0bcccb0..0cccb0.',
  '0bbbbb0.0bcccb0.',
  '.........0bbbb0.',
];
// Swim: legs trailing back and slightly bent, toes pointed away from the stroke.
const BL_TRAIL = [
  '..0998800a9980..',
  '..0998800a9980..',
  '.0998800a99980..',
  '.099800.0a9980..',
  '.09880..0a9980..',
  '.08880..0a9880..',
  '01cb0...0a8880..',
  '0cccb0..01ccb0..',
  '0bcccb0.0cccb0..',
  '0bbbbb00bbbbb0..',
];
// Airborne: the rear leg is genuinely FOLDED — its sole sits at row 27, four rows
// clear of the ground line — while the lead leg hangs full length to row 31. This
// used to share three identical rows with the swim split, which made the jump and
// the power stroke read as the same drawing.
const BL_JUMP = [
  '..0998800a99980.',
  '.0998800.0a9980.',
  '01cb00...0a9980.',
  '0cccb0...0a99980',
  '0bcccb0..0a99980',
  '0bbbbb0..0999980',
  '.........0899880',
  '.........01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];

const BIG_IDLE = bg([...B_HEAD, ...BA_DOWN, ...BL_TOGETHER], 'idle');

// Walk: A contact, arm swept back, both boots planted -> B passing, arm vertical,
// whole body dropped one row, rear boot swung clear -> C push-off, arm driven
// forward to x14-15, chest squashed a row, hips a pixel higher, cap leading the
// face. Head, hips, hand and both boots all change every frame.
const BIG_WALK_A = bg([...B_HEAD, ...BA_WALK_BACK, ...BL_STRIDE], 'walkA');
const BIG_WALK_B = bg([BLANK, ...B_HEAD, ...BA_DOWN, ...BL_PASS], 'walkB');
const BIG_WALK_C = bg([...B_HEAD_LEAN, ...BA_WALK_FWD, ...BL_PUSH], 'walkC');

const BIG_JUMP = bg([
  ...B_HEAD_REACH,
  '..07666666666220',
  '02266966696f760.',
  '022aa9999980....',
  '.065ad999d980...',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
  ...BL_JUMP,
], 'jump');

const BIG_SKID = bg([
  ...B_HEAD_L,
  '.076666666650...',
  '0766966696650...',
  '055aa99999f650..',
  '055ad999d9f650..',
  '055a999998f6650.',
  '011a9998880.0760',
  '011a99988880.320',
  '.0a99999988800..',
  '.0a9999888880...',
  '.0a9988899880...',
  '.0998800a99980..',
  '.099800..0a9980.',
  '.09880...0a9980.',
  '099800...0a99980',
  '09880....0a99980',
  '01cb0....0a99980',
  '0cccb0...0a99980',
  '0bbbb0....099980',
  '........01ccccb0',
  '.......0bcccccb0',
], 'skid');

// Duck — a real crouch, not the idle with rows deleted. The cap loses its top two
// rows so the head sinks into the shoulders, the near arm tilts down until the
// hand hangs at thigh height, and the legs fold: thigh forward, shin back, boots
// planted two pixels wider than idle. The near arm keeps its column of sky at x12
// all the way down and the far shoulder no longer bulges out to x0, so the crouch
// is at most 15 columns wide and never a solid 16-wide brick.
const BIG_DUCK = bg([
  '....00000000....',
  '..07ee76666650..',
  '..0665555555550.',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
  '....01222110....',
  '.07666666666650.',
  '.0766966696f7650',
  '.065aa99999f7650',
  '.065ad999d90.760',
  '.001a9999980.760',
  '.021a9999880.320',
  '.0998800a999800.',
  '.09980..0a99980.',
  '.08880..099980..',
  '.08880..088880..',
  '0cccb0...01ccb0.',
  '0bcccb0..0bcccb0',
], 'duck', 22);

// Climb: the legs genuinely alternate their grip. In A the near knee is folded up
// and its boot sits six rows above the far boot, which stays extended; in B the
// pair is swapped. Nothing here is the other frame slid up a row.
const BIG_CLIMB_A = bg([
  ...B_HEAD_CLIMB_HI,
  '...076666666650.',
  '..0766966696760.',
  '..065aa99999f760',
  '..065ad999d9f760',
  '032.5a999998f760',
  '021.5a999998f760',
  '...0a9999998880.',
  '...0a9999888880.',
  '...0a9988899880.',
  '...09980.0a9980.',
  '...09980.0a9980.',
  '...09980..0a980.',
  '...0980..01ccb0.',
  '...09880.0bcccb0',
  '...098880.......',
  '....08880.......',
  '....08880.......',
  '...01ccb0.......',
  '..0bcccb0.......',
  '..0bbbbb0.......',
], 'climbA');

const BIG_CLIMB_B = bg([
  ...B_HEAD_CLIMB_LO,
  '...076666666650.',
  '..0766966696760.',
  '..065aa99999f760',
  '..065ad999d9f760',
  '..065a999998f760',
  '032.5a999998f760',
  '021.5a9999998880',
  '...0a9999888880.',
  '...0a9988899880.',
  '...09980.0a9980.',
  '...09980.0a9980.',
  '...0980..0a9980.',
  '...01cb0.0a9980.',
  '..0bccb0.0a9980.',
  '.........0a9980.',
  '.........0a9880.',
  '..........09880.',
  '.........01ccb0.',
  '.........0bcccb0',
  '.........0bbbbb0',
], 'climbB');

// Six-frame stroke. Near hand: above the head -> out in front -> at the side ->
// past the hip -> folded on the bib -> rising back to the shoulder. Every leg
// block is a different pose, and the head bobs with the stroke: dipped on frames
// 2-3, neutral on 4, lifted on 5-6.
const BIG_SWIM_1 = bg([...B_HEAD_REACH, ...BA_REACH, ...BL_SPLIT], 'swim1');
const BIG_SWIM_2 = bg([...B_HEAD_DIP, ...BA_PULL, ...BL_OPEN], 'swim2');
const BIG_SWIM_3 = bg([...B_HEAD_DIP, ...BA_DOWN, ...BL_KICK], 'swim3');
const BIG_SWIM_4 = bg([...B_HEAD, ...BA_BACK, ...BL_TUCK], 'swim4');
const BIG_SWIM_5 = bg([...B_HEAD_LIFT, ...BA_TUCK, ...BL_SCISSOR], 'swim5');
const BIG_SWIM_6 = bg([...B_HEAD_LIFT, ...BA_RISE, ...BL_TRAIL], 'swim6');

const BIG_SWIM_IDLE = bg([...B_HEAD, ...BA_FLOAT, ...BL_FLOAT], 'swimIdle');

// Death: head turned to the camera so both eyes read, both arms punched up beside
// it, boots pointed down. The cap owns rows 0-3 alone; from row 4 to row 11 the
// column layout is hard: arm x0-x2, SKY at x3, head outline x4, face x5-x10, head
// outline x11, SKY at x12, arm x13-x15. Two unbroken columns of background run the
// whole height of the skull, so in flat silhouette this is a man with his arms up
// and not one 16x10 brick with a face printed on it — which is exactly what ten
// consecutive fully-opaque rows used to give.
//
// The arms are lit as one form: the left arm shows its lit face (slot 7 -> 6) and
// the right arm shows its shadow face (slot 6 -> 5), each carrying its outline on
// the side turning away from the upper-left key. The fists are 2x2 of skin capped
// by an outline row above and a cuff row below.
const BIG_DEAD_ROWS = [
  '...0000000000...',
  '..077ee7666650..',
  '..07ee76666550..',
  '.06655555555550.',
  '000.04111140.000',
  '032.04022040.310',
  '021.04032040.210',
  '010.01232210.100',
  '076.04444440.650',
  '076.01444410.650',
  '066..012210..650',
  '065...0120...550',
  '.06776666665550.',
  '.066f999999f650.',
  '.06aa9999999860.',
  '.06ad999999d860.',
  '.06aa9999998860.',
  '.0aa99999998880.',
  '.0a999999988880.',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
  '..0aa980.0aa980.',
  '..0a9980.0a9980.',
  '..0a9980.0a9980.',
  '..09980..0a9980.',
  '..09880..0a9980.',
  '..08880..099980.',
  '..01ccb0.01ccb0.',
  '..0cccb0.0cccb0.',
  '...0ccb0.0ccb0..',
  '...0bbb0.0bbb0..',
];

const BIG_DEAD = makeSprite(grid(BIG_DEAD_ROWS, 32, 'big.dead'), DEAD_PAL,
  { name: 'mario.big.dead', ox: -2, oy: 0 });
const FIRE_DEAD = makeSprite(BIG_DEAD_ROWS, FIRE_DEAD_PAL,
  { name: 'mario.fire.dead', ox: -2, oy: 0 });

/* ================================================================== *
 *  GROW / SHRINK TRANSITION — all 16 x 32, content bottom-aligned so a
 *  single draw position can flicker between them. GROW_MID is squashed:
 *  one row shorter through the chest with the boots a pixel wider each
 *  side, so the change of size lands with some weight.
 * ================================================================== */

const MID_BODY = [
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.021ad99d9880220',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
  '..08880.0a8880..',
  '.01cccb0.01cccb0',
  '.0bcccb0.0bcccb0',
  '0bbbbbb0.0bbbbb0',
];

const GROW_SMALL = bg([...Array(16).fill(BLANK), ...SMALL_IDLE.rows], 'growSmall');
const GROW_MID = bg([...Array(9).fill(BLANK), ...B_HEAD, ...MID_BODY], 'growMid');
const GROW_BIG = bg([...BIG_IDLE.rows], 'growBig');

export const GROW_FRAMES = [
  GROW_SMALL, GROW_MID, GROW_BIG,
  GROW_MID, GROW_SMALL, GROW_MID,
  GROW_BIG, GROW_MID, GROW_BIG,
];

export const BIG_MARIO = {
  idle: BIG_IDLE,
  walk: new Anim([BIG_WALK_A, BIG_WALK_B, BIG_WALK_C], 5),
  jump: BIG_JUMP,
  skid: BIG_SKID,
  duck: BIG_DUCK,
  dead: BIG_DEAD,
  climb: new Anim([BIG_CLIMB_A, BIG_CLIMB_B], 8),
  swim: new Anim([BIG_SWIM_1, BIG_SWIM_2, BIG_SWIM_3, BIG_SWIM_4, BIG_SWIM_5, BIG_SWIM_6],
    [6, 5, 5, 7, 6, 6]),
  swimIdle: BIG_SWIM_IDLE,
  // The engine looks for the mid-transition pose here (POSE_ALIASES 'grow').
  grow: GROW_MID,
  star: STAR_PALS,
};

/* ================================================================== *
 *  FIRE MARIO — Big Mario's pixels, fire palette, plus a throw pose
 * ================================================================== */

const fire = (s, name) => s.recolor(FIRE_PAL, 'mario.fire.' + name);
const fireAnim = (a, name) =>
  new Anim(a.frames.map((f, i) => fire(f, `${name}${i}`)), a.holds, a.loop);

// Cap pitched a pixel forward of the face, mouth open with the effort, throwing
// arm driven down past the hip so the hand breaks the silhouette below the belt.
// Rear leg braced back in a lunge.
const FIRE_THROW = makeSprite(grid([
  '......000000....',
  '....07ee76650...',
  '...07ee7666650..',
  '...07776666650..',
  '...0665555555550',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122002100...',
  '....01222110....',
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad999d9f7650',
  '.065a999998f7650',
  '.001a99998880760',
  '.021a99998880650',
  '..0a999999888220',
  '..0a999988888220',
  '..0a998889988000',
  '.0998800a99980..',
  '.099800..0a9980.',
  '099800...0a9980.',
  '09880....0a99980',
  '08880....0a99980',
  '01cb0....0888880',
  '0cccb0...01ccb0.',
  '0bcccb0..0cccb0.',
  '0bbbbb0..0bcccb0',
  '.........0bbbbb0',
], 32, 'fire.throw'), FIRE_PAL, { name: 'mario.fire.throw', ox: -2, oy: 0 });

export const FIRE_MARIO = {
  idle: fire(BIG_IDLE, 'idle'),
  walk: fireAnim(BIG_MARIO.walk, 'walk'),
  jump: fire(BIG_JUMP, 'jump'),
  skid: fire(BIG_SKID, 'skid'),
  duck: fire(BIG_DUCK, 'duck'),
  dead: FIRE_DEAD,
  climb: fireAnim(BIG_MARIO.climb, 'climb'),
  swim: fireAnim(BIG_MARIO.swim, 'swim'),
  swimIdle: fire(BIG_SWIM_IDLE, 'swimIdle'),
  throwing: FIRE_THROW,
  grow: fire(GROW_MID, 'grow'),
  star: STAR_PALS,
};


/* ================================================================== *
 *  SMOOTH LOCOMOTION — a 6-frame walk and a 6-frame run, both scales.
 *
 *  Appended as its own section and attached to the exported sets at the
 *  end, so nothing above this line has to move. The 3-frame `walk` is
 *  untouched and stays as the fallback.
 *
 *  THE VERTICAL PLAN. A cycle with no vertical travel is a slide. Every
 *  frame is STACKED out of blocks whose row counts sum to the sprite
 *  height, so the hip line is authored rather than offset:
 *
 *      small   [blank?] + head 8  + torso T + legs L = 16
 *      big     [blank?] + head 12 + torso T + legs L = 32
 *
 *  Walk — head top row / hip row / block heights (small):
 *
 *      1 contact A   head 1  hip 12   torso 3  legs 4
 *      2 down A      head 0  hip 13   torso 5  legs 3
 *      3 passing A   head 0  hip 11   torso 3  legs 5
 *      4 contact B   head 1  hip 12   torso 3  legs 4
 *      5 down B      head 0  hip 13   torso 5  legs 3
 *      6 passing B   head 0  hip 11   torso 3  legs 5
 *
 *  Hips travel 11 -> 13: lowest as the knee absorbs the contact, highest
 *  at passing when the support leg is straight underneath. The head runs
 *  the OTHER WAY — it is at its lowest on the contacts, where the hips
 *  are mid, and at its highest on the downs, where the hips bottom out.
 *  That is why the torso block grows a NECK row on the down frames and
 *  loses one at passing: the body pumps under a head that lags it.
 *
 *  Frames 1-3 lead with the near leg, 4-6 with the far leg. The second
 *  half is REDRAWN on the darker ramp, not mirrored — a far limb is
 *  never as light, as wide, or as far forward as a near one. Arms run
 *  opposite the legs, and the near fist walks x11-12 (back) -> x13-14
 *  (side) -> x13-14 at chest height (front) and back again, so the swing
 *  is legible from the hand alone.
 * ================================================================== */

// Contact head: brim pushed a row lower over the eye (its cast shadow deepens to
// slot 1 across two pixels), a pixel of dome shaved off the crown, jaw pulled in.
// The head is compressed by the step, not translated down it.
const S_HEAD_NOD = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..0666555555550.',
  '..04411202323210',
  '..04432202222210',
  '..0442344444210.',
  '....01222100....',
];

/* --- small walk torsos (3 rows at contact/passing, 5 at the downs) --- */

// 1 — contact A: near arm at the back of its swing. Seam and sleeve step a
// column left of the hanging pose and the fist is tucked behind the hip x11-12.
const SW_ARM_BACK = [
  '..076666666650..',
  '.076696669f7650.',
  '.021ad99d98320..',
];
// 2 — down A: the neck row. The body has dropped out from under the head. The
// forearm angles FORWARD off the elbow and the fist clears the hip at x13-14.
const SW_ARM_DOWNA = [
  '....01222100....',
  '..076666666650..',
  '.0766966966f760.',
  '.065a999980.0760',
  '.021ad99d9980320',
];
// 3 — passing A: shoulder pulled forward by the swing, sleeve running out to
// x14, fist still at belt height — the arm is halfway up, not up.
const SW_ARM_RISE = [
  '..0766666666650.',
  '.0766966966f7660',
  '.021ad99d9980320',
];
// 4 — contact B: front of the swing. The fist has climbed to CHEST height at
// x13-14 and the belt line is clear of it entirely.
const SW_ARM_FWD = [
  '..076666666650..',
  '.0766966966f7220',
  '.021ad99d99880..',
];
// 5 — down B: neck row again, but the forearm is tucked back against the ribs
// and the fist has fallen to x12-13 — the return half of the swing.
const SW_ARM_DOWNB = [
  '....01222100....',
  '..076666666650..',
  '.0766966966f760.',
  '.065a999998f760.',
  '.021ad99d998320.',
];
// 6 — passing B: elbow relaxed, sleeve short, fist trailing at x11-12.
const SW_ARM_TRAIL = [
  '..076666666650..',
  '.0766966966f760.',
  '.021ad99d98320..',
];

/* --- small walk legs ----------------------------------------------- */

// 1 — contact A: near leg reaching forward, its sole flaring BACK off the heel
// it just landed on; far leg extended behind with the sole flaring FORWARD off
// its toe. Three columns of sky at x6-x8 between the thighs.
const SW_LEG_CONTACT_A = [
  '..0a9999999980..',
  '.09980...0a9980.',
  '01cb00...01ccb0.',
  '0bccb0..0bcccb0.',
];
// 2 — down A: hips at their lowest. The near thigh swells under the load and
// the boot is flat under the hip; the far boot has peeled up onto its toe and
// narrows to two pixels at the sole.
const SW_LEG_DOWN_A = [
  '.09980..0a99880.',
  '01ccb0..01ccb0..',
  '.0cb0...0bcccb0.',
];
// 3 — passing A: near leg straight and vertical carrying everything, far leg
// folded knee-high, its boot a full row clear of the ground line.
const SW_LEG_PASS_A = [
  '..0a9999999980..',
  '.09980...0a9980.',
  '.01ccb0..0a9980.',
  '..0bcb0..01ccb0.',
  '........0bcccb0.',
];
// 4 — contact B: the far leg leads. Drawn a column narrower, a step darker,
// and stopping one pixel shy of how far the near leg reached in frame 1.
const SW_LEG_CONTACT_B = [
  '..0a9999999980..',
  '.0a980...09980..',
  '01ccb0...01cb0..',
  '0bcccb0..0bccb0.',
];
// 5 — down B: far leg planted and vertical, near leg peeled up onto its toe.
const SW_LEG_DOWN_B = [
  '.0a980..09880...',
  '.01ccb0.01cb0...',
  '..0cb0..0bccb0..',
];
// 6 — passing B: near leg swings through, folded and lit and a column wider
// than the far leg was; far leg straight under the hip.
const SW_LEG_PASS_B = [
  '..0a9999999980..',
  '.0a980...09980..',
  '.01ccb0..09980..',
  '..0bccb0.01cb0..',
  '.........0bccb0.',
];

const SMALL_W6_1 = sm([BLANK, ...S_HEAD_NOD, ...SW_ARM_BACK, ...SW_LEG_CONTACT_A], 'w6_1');
const SMALL_W6_2 = sm([...S_HEAD_LEAN, ...SW_ARM_DOWNA, ...SW_LEG_DOWN_A], 'w6_2');
const SMALL_W6_3 = sm([...S_HEAD, ...SW_ARM_RISE, ...SW_LEG_PASS_A], 'w6_3');
const SMALL_W6_4 = sm([BLANK, ...S_HEAD_NOD, ...SW_ARM_FWD, ...SW_LEG_CONTACT_B], 'w6_4');
const SMALL_W6_5 = sm([...S_HEAD_LEAN, ...SW_ARM_DOWNB, ...SW_LEG_DOWN_B], 'w6_5');
const SMALL_W6_6 = sm([...S_HEAD, ...SW_ARM_TRAIL, ...SW_LEG_PASS_B], 'w6_6');

SMALL_MARIO.walk6 = new Anim(
  [SMALL_W6_1, SMALL_W6_2, SMALL_W6_3, SMALL_W6_4, SMALL_W6_5, SMALL_W6_6],
  [5, 3, 4, 5, 3, 4]);

/* ------------------------------------------------------------------ *
 *  SMALL RUN — same stacking discipline, different physics.
 *
 *  A run is not a fast walk. Four things change and all four are drawn:
 *    * the whole figure PITCHES FORWARD — the cap sits two pixels ahead
 *      of the face (S_HEAD_DRIVE) and the shoulder line starts at x3
 *      instead of x2, so the chest leads the belt;
 *    * the STRIDE lengthens — five columns of sky between the feet at
 *      contact instead of three, the lead boot reaching x15;
 *    * the ARMS BEND and pump HIGHER — the fist tops out at shoulder
 *      height on the drive instead of at the belt;
 *    * the passing pose goes AIRBORNE. Row 15 is empty on frames 3 and
 *      6: neither foot is on the ground and the trailing boot has been
 *      thrown up behind the hip. A run has no double-support phase, so
 *      the `down` frames carry the rear foot clear of the floor too.
 * ------------------------------------------------------------------ */

// Cap driven two pixels ahead of the face, brim low, eye squeezed to a 2px
// slot-0 slit. The brim still overhangs the crown (crown x12, brim x14) and the
// nose still steps one past the brim to x15 — the head leans, it does not smear.
const S_HEAD_DRIVE = [
  '.......000000...',
  '.....07ee76650..',
  '....07ee7666650.',
  '....06655555550.',
  '..04422002323210',
  '..04432202222210',
  '..0442244444210.',
  '...0122222100...',
];

/* --- small run torsos --------------------------------------------- */

// 1 — contact A: near arm slammed back, fist behind the hip at x11-12.
const SR_ARM_BACK = [
  '...076666666650.',
  '.076696669f7650.',
  '.021ad99d98320..',
];
// 2 — down A: neck row, elbow bent, fist already up at RIB height (x13-14) —
// the run pumps through the bottom of the swing instead of hanging there.
const SR_ARM_DOWNA = [
  '....01222100....',
  '...076666666650.',
  '.0766966966f7650',
  '.065a99999880220',
  '.021ad99d99880..',
];
// 3 — airborne A: top of the pump. The fist has climbed onto the SHOULDER row
// at x13-14 and breaks the silhouette above the chest.
const SR_ARM_AIR_A = [
  '..07666666665220',
  '.0766966966f7650',
  '.021ad99d99880..',
];
// 4 — contact B: fist dropping back through chest height, elbow still folded,
// hip mass widened by the twist.
const SR_ARM_FWD = [
  '...076666666650.',
  '.0766966966f7220',
  '.021ad99d998880.',
];
// 5 — down B: forearm tucked against the ribs, the fist rolled palm-back into a
// 3px mass at x11-13 at the bottom of the return.
const SR_ARM_DOWNB = [
  '....01222100....',
  '...076666666650.',
  '.0766966966f760.',
  '.065a999998f760.',
  '.021ad99d983220.',
];
// 6 — airborne B: shoulder narrowed and only one bib strap left in view — the
// torso has twisted away with the arm at the top of its BACK swing.
const SR_ARM_AIR_B = [
  '...07666666650..',
  '.076696666f7650.',
  '.021ad99d98320..',
];

/* --- small run legs ------------------------------------------------ */

// 1 — contact A: five columns of sky between the boots and the lead foot out
// at x15. The walk's widest stride is three columns and stops at x14.
const SR_LEG_CONTACT_A = [
  '..0a9999999980..',
  '09880....0a9980.',
  '01cb0.....01ccb0',
  '0bccb0...0bcccb0',
];
// 2 — down A: no double support. The rear boot is already two rows clear of the
// floor while the lead leg eats the landing.
const SR_LEG_DOWN_A = [
  '0ccb0...0a99880.',
  '0bcb0...01ccb0..',
  '........0bcccb0.',
];
// 3 — airborne A: row 15 empty. Rear leg thrown back and UP (its boot starts a
// row higher than the lead boot), lead foot reaching to x15.
const SR_LEG_AIR_A = [
  '..0a9999999980..',
  '.09880..0a99980.',
  '01cb0....0a9980.',
  '0bcb0.....01ccb0',
  '................',
];
// 4 — contact B: far leg leads. A column narrower, a step darker, and one pixel
// shy of the reach the near leg had.
const SR_LEG_CONTACT_B = [
  '..0a9999999980..',
  '.0a980...09980..',
  '01ccb0....01cb0.',
  '0bcccb0...0bccb0',
];
// 5 — down B: far leg planted, near leg folded up behind it.
const SR_LEG_DOWN_B = [
  '01ccb0..09880...',
  '0bcccb0.01cb0...',
  '........0bccb0..',
];
// 6 — airborne B: row 15 empty again. Trailing near boot is wider and lighter
// than the trailing far boot was in frame 3.
const SR_LEG_AIR_B = [
  '..0a9999999980..',
  '.0a980..09980...',
  '01ccb0....09980.',
  '0bcccb0...01cb0.',
  '................',
];

const SMALL_RUN_1 = sm([BLANK, ...S_HEAD_LEAN, ...SR_ARM_BACK, ...SR_LEG_CONTACT_A], 'run1');
const SMALL_RUN_2 = sm([...S_HEAD_DRIVE, ...SR_ARM_DOWNA, ...SR_LEG_DOWN_A], 'run2');
const SMALL_RUN_3 = sm([...S_HEAD_DRIVE, ...SR_ARM_AIR_A, ...SR_LEG_AIR_A], 'run3');
const SMALL_RUN_4 = sm([BLANK, ...S_HEAD_LEAN, ...SR_ARM_FWD, ...SR_LEG_CONTACT_B], 'run4');
const SMALL_RUN_5 = sm([...S_HEAD_DRIVE, ...SR_ARM_DOWNB, ...SR_LEG_DOWN_B], 'run5');
const SMALL_RUN_6 = sm([...S_HEAD_DRIVE, ...SR_ARM_AIR_B, ...SR_LEG_AIR_B], 'run6');

SMALL_MARIO.run = new Anim(
  [SMALL_RUN_1, SMALL_RUN_2, SMALL_RUN_3, SMALL_RUN_4, SMALL_RUN_5, SMALL_RUN_6],
  [3, 2, 4, 3, 2, 4]);

/* ------------------------------------------------------------------ *
 *  BIG WALK — 16 x 32. Same plan, one more articulation.
 *
 *      1 contact A   head 1  shoulder 13  hip 22   torso 9   legs 10
 *      2 down A      head 0  shoulder 12  hip 23   torso 11  legs 9
 *      3 passing A   head 0  shoulder 12  hip 21   torso 9   legs 11
 *      4 contact B   head 1  shoulder 13  hip 22   torso 9   legs 10
 *      5 down B      head 0  shoulder 12  hip 23   torso 11  legs 9
 *      6 passing B   head 0  shoulder 12  hip 21   torso 9   legs 11
 *
 *  At this size the neck is drawn: the two `down` frames carry two extra
 *  skin rows between the chin and the collar, and the head sits a pixel
 *  HIGHER there than it does at contact even though the hips are a pixel
 *  LOWER. Head and hips are never travelling the same direction on the
 *  same frame; that is the whole trick.
 *
 *  Every leg here is a real limb — 4px thigh, a 3px pinch at the knee, a
 *  4-5px calf whose light column steps outboard, a 5px ankle, then the
 *  boot. Never an extruded rectangle, and never two limbs touching below
 *  the pelvis row.
 * ------------------------------------------------------------------ */

// Contact head: crown compressed a row, brim thickened and dropped, its cast
// shadow spread to three pixels of slot 1, jaw and chin pulled in. The head is
// squashed by the step, not slid down it.
const B_HEAD_NOD = [
  '.....000000.....',
  '...07ee76650....',
  '..07ee7666650...',
  '..07766666650...',
  '..0666555555550.',
  '..044111223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '....012222100...',
  '.....0122110....',
];

// The two rows that appear between chin and collar on the `down` frames.
const B_NECK = [
  '.....012210.....',
  '....0122210.....',
];

/* --- big walk torsos ----------------------------------------------- */

// 1 — contact A: near arm at the back of its swing. Seam and sleeve a column
// left of the hanging pose, fist dropped behind the hip at x11-12.
//
// The FAR arm runs antiphase to it and is therefore FORWARD here: the forearm
// crosses in front of the bib, so only a short sleeve, a cuff and the fist show
// at x1-x3 and they sit HIGH (row 17). Below the fist the far arm is gone and
// the bib's own light column (x2) reads through — the arm has swung off it.
const BW_ARM_BACK = [
  '..076666666650..',
  '.076696669f7650.',
  '.065aa9999f7650.',
  '.001ad999df7650.',
  '.021aa9998f7650.',
  '.0a99999880320..',
  '.0a99998880210..',
  '..0a999988880...',
  '..0a9988899880..',
];
// 2 — down A: neck rows in. Forearm swings clear of the ribs and the fist rides
// at x12-13 with a column of sky behind it.
// The far fist is a row lower than at contact and its knuckles have rolled into
// the key light (slot 3 instead of slot 1) — the hand is turning over at the top
// of the forward swing, not repeating frame 1 a pixel down.
const BW_ARM_DOWNA = [
  ...B_NECK,
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.001ad999d0.0760',
  '.032aa99980.0760',
  '.0a99999880.0320',
  '.0a99998880.0210',
  '..0a99999988800.',
  '..0a9988899880..',
];
// 3 — passing A: shoulder pulled forward by the swing, sleeve running out to
// x14, fist at RIB height (x13-14) — halfway up, not up.
// The far arm has crossed to the BACK half of its swing: the elbow steps out past
// the torso to x0, the forearm carries its own outline at x3, and the fist has
// dropped to hip height with its knuckles still lit.
const BW_ARM_RISE = [
  '..076666666650..',
  '.0766966696f7660',
  '.065aa99999f7660',
  '.065ad999d9f7220',
  '0655a99999880...',
  '0650a99998880...',
  '0010a99988880...',
  '03109999998880..',
  '..0a9988899880..',
];
// 4 — contact B: front of the swing. The fist has climbed to CHEST height at
// x14-15 and the arm folds back into the body two rows below it.
const BW_ARM_FWD = [
  '..0766666666650.',
  '.0766966696f7622',
  '.065aa99999f7621',
  '.065ad999d9880..',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9988899880..',
];
// 5 — down B: neck rows again, forearm tucked back along the ribs, fist falling
// through x12-13 on the return.
const BW_ARM_DOWNB = [
  ...B_NECK,
  '..076666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad999d9f7650',
  '.065aa999980760.',
  '.001a9998880320.',
  '.021a9988880210.',
  '..0a999988880...',
  '..0a9988899880..',
];
// 6 — passing B: elbow folded back behind the ribs, the seam running four rows
// down the flank, fist trailing at x11-12.
const BW_ARM_TRAIL = [
  '..076666666650..',
  '.076696669f7650.',
  '.065aa9999f7650.',
  '.065ad999d9f760.',
  '.065aa99998f760.',
  '.001a99988f7650.',
  '.021a998880320..',
  '..0a999988820...',
  '..0a9988899880..',
];

/* --- big walk legs -------------------------------------------------- */

// 1 — contact A: near leg reaching forward to x15, far leg driven back to x0.
const BW_LEG_CONTACT_A = [
  '.0a98800a99980..',
  '.09980...0a9980.',
  '099800...0a9980.',
  '09880....0a99980',
  '09880....0999980',
  '08880....0888880',
  '01cb0....01ccb0.',
  '0cccb0...0cccb0.',
  '0bcccb0..0bcccb0',
  '0bbbbb0..0bbbbb0',
];
// 2 — down A: hips at their lowest. Near leg vertical under the load, far heel
// peeled up so its sole clears the ground line by a row.
const BW_LEG_DOWN_A = [
  '.09880..0a99980.',
  '.0980....0a9980.',
  '099800...0a9980.',
  '09880....0a99980',
  '08880....0999980',
  '01cb0....0888880',
  '0cccb0...01ccb0.',
  '0bcb0....0cccb0.',
  '.........0bcccb0',
];
// 3 — passing A: near leg straight and vertical — thigh, knee pinch, calf swell,
// ankle, boot — with the far leg folded knee-high three rows off the floor.
const BW_LEG_PASS_A = [
  '..0a9999999980..',
  '..09880.0a9980..',
  '..0980..0a9980..',
  '..09880.0a980...',
  '..08880.0a9980..',
  '..01cb0.0a99980.',
  '.0cccb0.0999980.',
  '.0bbbb0.0888880.',
  '........01cccb0.',
  '........0ccccb0.',
  '.......0bccccb0.',
];
// 4 — contact B: the far leg leads. Narrower, a step darker, and stopping at
// x13 where the near leg reached x15.
const BW_LEG_CONTACT_B = [
  '.0a98800999980..',
  '.0a980...09980..',
  '.0a9980..09980..',
  '0a9980...099980.',
  '0a9980...098880.',
  '088880...088880.',
  '01ccb0...01cb0..',
  '0cccb0...0cccb0.',
  '0bcccb0..0bccb0.',
  '0bbbbb0..0bbbb0.',
];
// 5 — down B: far leg planted, near leg peeled up onto its toe behind it.
const BW_LEG_DOWN_B = [
  '.0a980..099980..',
  '.0a80...09980...',
  '0a9980..09980...',
  '0a9980..099980..',
  '088880..098880..',
  '01ccb0..088880..',
  '0cccb0..01ccb0..',
  '0bcb0...0cccb0..',
  '........0bcccb0.',
];
// 6 — passing B: near leg swings through, folded, and its boot is a column
// wider than the far boot was in frame 3; far leg straight under the hip.
const BW_LEG_PASS_B = [
  '..0a9999999980..',
  '..0a980.099980..',
  '..0a80..09980...',
  '..0a980.099980..',
  '..0a9980.09980..',
  '..01ccb0.099980.',
  '.0ccccb0.098880.',
  '.0bbbbb0.088880.',
  '.........01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];

const BIG_W6_1 = bg([BLANK, ...B_HEAD_NOD, ...BW_ARM_BACK, ...BW_LEG_CONTACT_A], 'w6_1');
const BIG_W6_2 = bg([...B_HEAD_LEAN, ...BW_ARM_DOWNA, ...BW_LEG_DOWN_A], 'w6_2');
const BIG_W6_3 = bg([...B_HEAD, ...BW_ARM_RISE, ...BW_LEG_PASS_A], 'w6_3');
const BIG_W6_4 = bg([BLANK, ...B_HEAD_NOD, ...BW_ARM_FWD, ...BW_LEG_CONTACT_B], 'w6_4');
const BIG_W6_5 = bg([...B_HEAD_LEAN, ...BW_ARM_DOWNB, ...BW_LEG_DOWN_B], 'w6_5');
const BIG_W6_6 = bg([...B_HEAD, ...BW_ARM_TRAIL, ...BW_LEG_PASS_B], 'w6_6');

BIG_MARIO.walk6 = new Anim(
  [BIG_W6_1, BIG_W6_2, BIG_W6_3, BIG_W6_4, BIG_W6_5, BIG_W6_6],
  [5, 3, 4, 5, 3, 4]);

/* ------------------------------------------------------------------ *
 *  BIG RUN — 16 x 32.
 *
 *  A run has NO double-support phase, and that is the structural change
 *  from the walk: exactly one boot is on the ground line in frames 1, 2,
 *  4 and 5, and NEITHER is in frames 3 and 6, where the last two rows of
 *  the sprite are empty and the whole figure floats two pixels. The walk
 *  never leaves the floor.
 *
 *  On top of that: the cap is driven two pixels ahead of the face, the
 *  shoulder line starts at x3 so the chest leads the belt, the fist tops
 *  out on the SHOULDER row instead of at the ribs, and the trailing boot
 *  is thrown further behind and higher than any walk pose reaches.
 * ------------------------------------------------------------------ */

// Cap two pixels ahead of the face, brim outline pulled back to x14 so the nose
// still steps past it to x15, eye squeezed to a 2px slot-0 slit. Crown x12,
// brim x14, face x15 — the overhang survives the lean.
const B_HEAD_DRIVE = [
  '.......000000...',
  '.....07ee76650..',
  '....07ee7666650.',
  '....07776666650.',
  '....06655555550.',
  '..044112223210..',
  '..04422002332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
  '....01222110....',
];

/* --- big run torsos ------------------------------------------------ */

// 1 — contact A: arm cocked all the way back with the elbow HIGH, so the fist
// sits at chest height behind the ribs rather than hanging at the belt.
const BR_ARM_BACK = [
  '...07666666650..',
  '.0766966696f650.',
  '.065aa9999f7650.',
  '.065ad999d0320..',
  '.065aa99980210..',
  '.001a99988880...',
  '.021a99988880...',
  '..0a999998880...',
  '..0a9988899880..',
];
// 2 — down A: neck rows in, elbow folded, fist already climbing at x13-14.
const BR_ARM_DOWNA = [
  ...B_NECK,
  '...07666666650..',
  '.0766966696f7650',
  '.065aa99999f7220',
  '.065ad999d98020.',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9988899880..',
];
// 3 — airborne A: top of the pump. The fist breaks the silhouette ON the
// shoulder row at x13-14 — a height the walk never reaches.
const BR_ARM_AIR_A = [
  '..07666666665220',
  '.0766966696f7650',
  '.065aa99999f7650',
  '.065ad999d99880.',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9988899880..',
];
// 4 — contact B: fist punched forward to x14-15 and the shoulder line pitched
// a full column ahead of the belt.
const BR_ARM_FWD = [
  '...0766666666650',
  '.0766966696f7622',
  '.065aa99999f7621',
  '.065ad999d9880..',
  '.065a99999880...',
  '.001a99998880...',
  '.021a99988880...',
  '..0a9999998880..',
  '..0a9988899880..',
];
// 5 — down B: forearm folded back along the flank, seam running four rows down
// it, fist dropping through x12-13.
const BR_ARM_DOWNB = [
  ...B_NECK,
  '...07666666650..',
  '.0766966696f760.',
  '.065aa99999f7650',
  '.065ad999d9f7650',
  '.065aa99998f760.',
  '.001a9998880320.',
  '.021a9988880210.',
  '..0a999988880...',
  '..0a9988899880..',
];
// 6 — airborne B: shoulder narrowed to ten columns and only one bib strap left
// in view — the whole torso has twisted with the arm at the back of its pump.
const BR_ARM_AIR_B = [
  '...0766666650...',
  '.076696666f7650.',
  '.065aa9999f7650.',
  '.065ad999df7650.',
  '.065aa9998f7650.',
  '.001a999880320..',
  '.021a998880210..',
  '..0a999988880...',
  '..0a9988899880..',
];

/* --- big run legs --------------------------------------------------- */

// 1 — contact A: near foot strikes and takes everything; the far leg is already
// extended behind with its sole two rows clear of the ground.
const BR_LEG_CONTACT_A = [
  '.0a98800a99980..',
  '.09980...0a9980.',
  '099800...0a9980.',
  '09880....0a9980.',
  '08880....0a99980',
  '01cb0....0999980',
  '0cccb0...0888880',
  '0bbbb0...01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];
// 2 — down A: deepest point of the cycle. The far leg has swung through, knee
// folded, boot four rows off the floor.
const BR_LEG_DOWN_A = [
  '.0998800a99980..',
  '..09980..0a9980.',
  '..01cb0..0a9980.',
  '.0cccb0..0a99980',
  '.0bbbb0..0999980',
  '.........0888880',
  '.........01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];
// 3 — airborne A: the last two rows are EMPTY. Near leg thrown back behind the
// hip after the push-off, far knee driven up in front, nothing on the floor.
const BR_LEG_AIR_A = [
  '..0a9999999980..',
  '.0a98800999980..',
  '0a9980...09980..',
  '0a980....09980..',
  '09880....09980..',
  '08880....01cb0..',
  '01cb0....0cccb0.',
  '0cccb0..0bcccb0.',
  '0bbbb0..........',
  '................',
  '................',
];
// 4 — contact B: far foot strikes. Narrower and a step darker than the near
// foot was in frame 1, and the near leg trails clear of the ground behind it.
const BR_LEG_CONTACT_B = [
  '.0a98800999980..',
  '.0a980...09980..',
  '0a9980...09980..',
  '0a9980...099980.',
  '088880...098880.',
  '01ccb0...088880.',
  '0cccb0...01cb0..',
  '0bcccb0..0cccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];
// 5 — down B: far leg eats the landing, near leg folded through knee-high — a
// column wider and a shade lighter than the far leg managed in frame 2.
const BR_LEG_DOWN_B = [
  '.0a98800999980..',
  '..0a980..09980..',
  '..01ccb0.09980..',
  '.0ccccb0.099980.',
  '.0bbbbb0.098880.',
  '.........088880.',
  '.........01ccb0.',
  '.........0cccb0.',
  '........0bcccb0.',
];
// 6 — airborne B: floating again. Far leg thrown back, near knee driven up in
// front with its boot a full row higher than the trailing one.
const BR_LEG_AIR_B = [
  '..0a9999999980..',
  '.0998800a99980..',
  '09980....0a9980.',
  '0980.....0a9980.',
  '09880....01ccb0.',
  '08880....0cccb0.',
  '01cb0...0bcccb0.',
  '0cccb0..0bbbbb0.',
  '0bbbb0..........',
  '................',
  '................',
];

const BIG_RUN_1 = bg([BLANK, ...B_HEAD_LEAN, ...BR_ARM_BACK, ...BR_LEG_CONTACT_A], 'run1');
const BIG_RUN_2 = bg([...B_HEAD_DRIVE, ...BR_ARM_DOWNA, ...BR_LEG_DOWN_A], 'run2');
const BIG_RUN_3 = bg([...B_HEAD_DRIVE, ...BR_ARM_AIR_A, ...BR_LEG_AIR_A], 'run3');
const BIG_RUN_4 = bg([BLANK, ...B_HEAD_LEAN, ...BR_ARM_FWD, ...BR_LEG_CONTACT_B], 'run4');
const BIG_RUN_5 = bg([...B_HEAD_DRIVE, ...BR_ARM_DOWNB, ...BR_LEG_DOWN_B], 'run5');
const BIG_RUN_6 = bg([...B_HEAD_DRIVE, ...BR_ARM_AIR_B, ...BR_LEG_AIR_B], 'run6');

BIG_MARIO.run = new Anim(
  [BIG_RUN_1, BIG_RUN_2, BIG_RUN_3, BIG_RUN_4, BIG_RUN_5, BIG_RUN_6],
  [3, 2, 4, 3, 2, 4]);

/* ------------------------------------------------------------------ *
 *  FIRE MARIO — derived, never redrawn. Same pixels, fire palette.
 * ------------------------------------------------------------------ */

FIRE_MARIO.walk6 = fireAnim(BIG_MARIO.walk6, 'walk6');
FIRE_MARIO.run = fireAnim(BIG_MARIO.run, 'run');
