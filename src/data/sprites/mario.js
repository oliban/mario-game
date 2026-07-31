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
// gets a five-step ramp without burning a palette slot.
//
// Light falls from the upper left. All sprites face RIGHT; the engine mirrors.
//
// Three rules the whole file follows:
//   * The NOSE carries the profile. It steps one pixel past the cap brim on the two
//     eye rows and pulls back in under the moustache, so the head reads as a face
//     and not a brick even at 1x. The brim casts a shadow (slot 1) on the row
//     directly beneath it; skin light (slot 3) only lands on the nose bridge and
//     the cheekbone, never under the brim.
//   * The NEAR arm BREAKS the torso box. On the standing poses column x11 is
//     transparent for the length of the forearm: torso outline at x10, sky at x11,
//     arm outline at x12, sleeve at x13-14, arm outline at x15. Slot f draws the
//     seam only where the sleeve is still welded to the shoulder.
//   * No floating interior bars. Slot f is a fold line that touches a silhouette
//     edge or a limb; it is never a free-standing rectangle in the middle of a
//     colour field.
//
// Every block below is a fixed-width 16-column grid; `sm`/`bg` assert both the
// width and the expected row count, so an off-size block fails at import instead
// of pushing a row through the floor at runtime.

import { makeSprite, Anim } from '../../core/gfx.js';
import { INK } from '../palette.js';

const OUT = INK.outline;
const SOFT = '#3b2412';

const SKIN = ['#a8571c', '#ef9a49', '#f8d5ac'];
const SKIN_PALE = ['#b06a33', '#f4b47e', '#ffe6cc'];
const HAIR = '#733210';
// Boot dark is kept well clear of the outline so soles still read against a black
// (underground / castle) background.
const SHOE = ['#5e2a0a', '#8b4a16'];
const BTN = '#e8b830';

//                 shadow      mid        light      specular
// Overall light stays below the #5c94fc sky so leg edges never dissolve into it.
const RED = ['#7c1408', '#d02a16', '#f0603a', '#ffb090'];
const BLUE = ['#0b2f74', '#1f5fd0', '#3878d8', '#a8d0ff'];
const WHITE = ['#8f97ab', '#cdd3e0', '#f4f6fc', '#ffffff'];
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
const FIRE_PAL = pal(WHITE, RED, SKIN, '#5e2a0c', ['#5a2a0c', '#9a5a1e'], '#c8ccd8');
const DEAD_PAL = pal(RED, BLUE, SKIN_PALE);
const FIRE_DEAD_PAL = pal(WHITE, RED, SKIN_PALE, '#5e2a0c', ['#5a2a0c', '#9a5a1e'], '#c8ccd8');

// The star flash cycles cap, overalls, shoes, hair and buttons — never the SKIN.
// Holding the face on one ramp is what keeps the cap/face edge readable through
// all four phases; a gold cap over gold skin turns the head into one blank mass.
const STAR_PALS = [
  pal(WHITE, GOLD, SKIN, '#6a4414', ['#5a3c08', '#a07a1c'], '#ffffff'),
  pal(GOLD, GREEN, SKIN, '#5a4208', ['#4c4c08', '#8a7c14'], '#ffffff'),
  pal(GREEN, RED, SKIN, '#2e5410', ['#2a4a10', '#568a20'], '#ffffff'),
  pal(RED, WHITE, SKIN, '#733210', ['#5e2a0a', '#8b4a16'], BTN),
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
  '...077e76650....',
  '..077e7666650...',
  '..0665555555550.',
  '..04422202323210',
  '..04432202222210',
  '..0442244444210.',
  '...0122222100...',
];

// Walk frame C / swim pull: cap + brim slid one pixel forward of the face so the
// head leads the step and dips into the stroke.
const S_HEAD_LEAN = [
  '......000000....',
  '....077e76650...',
  '...077e7666650..',
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
  '...077e76650....',
  '..077e766655550.',
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
  '.07e776650......',
  '077e7666650.....',
  '0665555555550...',
  '.04422200232210.',
  '.04432200222210.',
  '.0442244444210..',
  '..0122222100....',
];

// Reach: the raised hand lives in the two rows the jaw leaves empty on the right.
const S_HEAD_REACH = [
  '.....000000.....',
  '...077e76650....',
  '..077e7666650...',
  '..0665555555550.',
  '..04422202323210',
  '..04432202222210',
  '..04422444442100',
  '...0122222100220',
];

const S_HEAD_CLIMB_HI = [
  '......000000....',
  '....077e76650...',
  '022077e7666650..',
  '022066555555550.',
  '0660442220232210',
  '0660443220222210',
  '0660442244444210',
  '.0660122222100..',
];
const S_HEAD_CLIMB_LO = [
  '......000000....',
  '....077e76650...',
  '...077e7666650..',
  '...066555555550.',
  '0220442220232210',
  '0660443220222210',
  '0660442244444210',
  '.0660122222100..',
];

/* --- small torso blocks (rows 8..11) ------------------------------ *
 * x11 carries the slot-f arm seam at the shoulder; below the shoulder x11 goes
 * transparent so the forearm silhouettes clear of the ribs (torso outline x10,
 * sky x11, arm outline x12, sleeve x13, outline x14). The far sleeve stays 2px of
 * cap shadow at x2-3 so it reads as being behind the chest.                       */

// Arm hanging at the side — hand at x12-13, sky notch cut at x11.
const SA_LOW = [
  '..076666666650..',
  '.0766966966f650.',
  '.066a999980.060.',
  '.011ad99d998320.',
];
// Walk contact: arm swept back. Seam and sleeve step one column left, hand at
// x11-12 — a full column behind the hanging pose.
const SA_BACK = [
  '..076666666650..',
  '.076696669f650..',
  '.066a99998f650..',
  '.011ad99d98320..',
];
// Arm straight out in front, hand clear of the chest at x12-14.
const SA_PULL = [
  '..076666666650..',
  '.0766966966f6650',
  '.066a999998f2220',
  '.011ad99d99880..',
];
// Walk push-off (3 rows — hips ride a pixel higher): the forward hand rides at
// x12-14, a row higher and two columns ahead of the back-swing.
const SA_PULL3 = [
  '..076666666650..',
  '.0766966966f6650',
  '.011ad99d9982220',
];
// Recovery: elbows in, the folded hand outlined onto the chest.
const SA_TUCK = [
  '..076666666650..',
  '.07669669666650.',
  '.066a9902216650.',
  '.011ad99000880..',
];
// Arm rising forward at shoulder height.
const SA_RISE = [
  '..076666666650..',
  '.0766966966f6220',
  '.066a99999880...',
  '.011ad99d99880..',
];
// Arm overhead — hand is drawn into S_HEAD_REACH.
const SA_REACH = [
  '..07666666666220',
  '.0766966966f650.',
  '.066a99999880...',
  '.011ad99d99880..',
];
// Float: forearms angled forward at chest height, hands high.
const SA_FLOAT = [
  '..076666666650..',
  '.0766966966f2220',
  '.066a999998f660.',
  '.011ad99d99880..',
];
// Grow/shrink squash: shoulders spread, both hands braced out at the hips.
const SA_SQUASH = [
  '.07666666666650.',
  '02266966966f6220',
  '022ad99d99888220',
];

/* --- small leg blocks (rows 12..15) -------------------------------
 * Far leg is one step darker than the near leg all the way down so the two never
 * read as one blue slab.                                                        */

const SL_TOGETHER = [
  '..0a9999999980..',
  '..0998800a9980..',
  '..0ccb001ccb0...',
  '.0bccb00bcccb0..',
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
  '..0ccb001ccb0...',
  '.0bccb00bcccb0..',
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
  '..099800a9980...',
  '..09880.01ccb0..',
  '..08880.0bcccb0.',
  '.0bcccb0........',
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
  '.0998800a99880..',
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
  '.0a9999999998 0.'.replace(' ', '9').slice(0, 16),
  '.0998800a9980...',
  '.0cccb001cccb0..',
  '0bbcccb00bcccbb0',
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
  '02266966966f650.',
  '022a99999880....',
  '..0ad99d99880...',
  ...SL_JUMP,
], 'jump');

const SMALL_SKID = sm([
  ...S_HEAD_SKID,
  '.076666666650...',
  '0766966966f65000',
  '066a999998f66622',
  '011ad99d99880220',
  '.0a9999999980...',
  '.01cb0..0a99980.',
  '.0bccb0.0a99980.',
  '.......01ccccb0.',
], 'skid');

const SMALL_DEAD = makeSprite(grid([
  '.....000000.....',
  '.00.07777660.00.',
  '022077e766650220',
  '0220665555550220',
  '0660400220040660',
  '0660422332240660',
  '0660442222440660',
  '.06604222240660.',
  '.07666666666650.',
  '.066a999998f650.',
  '.066ad99d998650.',
  '..0a9999999980..',
  '..0a9999888880..',
  '..0a9988899880..',
  '.01ccb0..01ccb0.',
  '0bcccb0..0bcccb0',
], 16, 'small.dead'), DEAD_PAL, { name: 'mario.small.dead', ox: -2, oy: 0 });

// Climb: the legs alternate their grip. In A the near leg is folded up and its
// boot sits three rows above the far boot; in B the pair is swapped.
const SMALL_CLIMB_A = sm([
  ...S_HEAD_CLIMB_HI,
  '...076666666650.',
  '02266966966f650.',
  '02266a999998f650',
  '...0ad99d998210.',
  '...0a9999999980.',
  '...0998001ccb0..',
  '...09880.0bccb0.',
  '..0bcccb0.......',
], 'climbA');

const SMALL_CLIMB_B = sm([
  ...S_HEAD_CLIMB_LO,
  '...076666666650.',
  '...06966966f650.',
  '02266a999998f650',
  '02266ad99d998210',
  '...0a9999999980.',
  '...01ccb00a9980.',
  '..0bcccb00a9880.',
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
  '...077e76650....',
  '..077e7666650...',
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
  '....077e76650...',
  '...077e7666650..',
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
  '....077e76650...',
  '...077e7666650..',
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
  '...077e76650....',
  '..077e7666650...',
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
  '.07e776650......',
  '077e7666650.....',
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
  '...077e76650....',
  '..077e7666650...',
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

const B_HEAD_CLIMB_HI = [
  '......000000....',
  '....077e76650...',
  '...077e7666650..',
  '...07776666650..',
  '022066555555550.',
  '022044112223210.',
  '0660442220233210',
  '0660443320222210',
  '0660443224444410',
  '.06601222444410.',
  '.0660122222100..',
  '..06601222110...',
];

const B_HEAD_CLIMB_LO = [
  '......000000....',
  '....077e76650...',
  '...077e7666650..',
  '...07776666650..',
  '...066555555550.',
  '...044112223210.',
  '0220442220233210',
  '0660443320222210',
  '0660443224444410',
  '.06601222444410.',
  '.0660122222100..',
  '..06601222110...',
];

/* --- big torso blocks (rows 12..21) -------------------------------
 * Column plan: x1 outline, x2-3 far sleeve (cap shadow — it is behind the chest),
 * x4-x9 overalls ramped light->mid->shadow left to right, x10 torso outline,
 * x11 SKY, x12 arm outline, x13-14 near sleeve, x15 arm outline. Slot f welds the
 * sleeve to the shoulder on rows 13-14 only; below that the arm is a free limb
 * with background behind it. The hand is a 2x2 of skin that terminates the arm
 * with its own outline.
 *
 * The last three rows of every block are the shared pelvis: waist, a rounded hip
 * mass turning away from the light, and a crotch fold that runs into the leg gap.
 * (No 4px slot-f bar floating in the middle of the bib — that read as a mail slot
 * at 30x and as a hole at 1x.)                                                  */

const BA_DOWN = [
  '..076666666650..',
  '.0766966696f650.',
  '.055aa99999f6650',
  '.055ad999d0.0660',
  '.055a999980.0660',
  '.011a999980.0320',
  '.011a999980.0210',
  '..0a99999988800.',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Walk contact — arm swept back behind the hip. Seam and sleeve step one column
// left of the hanging pose and the hand drops to rows 18-19 at x12-13.
const BA_WALK_BACK = [
  '..076666666650..',
  '.076696669f6650.',
  '.055aa9999f6650.',
  '.055ad999df6650.',
  '.055a99998f6650.',
  '.011a99998f6650.',
  '.011a9999880320.',
  '..0a99999980210.',
  '..0a9999888800..',
  '..0a9988899880..',
];
// Walk push-off (9 rows — chest squashed, hips a pixel higher) — arm driven
// forward and up, elbow high, hand out at x14-15 clear of the chest. The forearm
// is short because it is foreshortened straight at the camera.
const BA_WALK_FWD = [
  '..0766666666650.',
  '.0766966696f6660',
  '.055aa99999f6660',
  '.055ad999d9f6622',
  '.055a99999988021',
  '.011a99999888000',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 1 — arm overhead (hand lives in B_HEAD_REACH).
const BA_REACH = [
  '..07666666666220',
  '.0766966696f650.',
  '.055aa9999980...',
  '.055ad999d980...',
  '.055a99999880...',
  '.011a99998880...',
  '.011a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 2 — arm straight out in front, hand clear of the chest.
const BA_PULL = [
  '..076666666650..',
  '.0766966696f650.',
  '.055aa99999f6620',
  '.055ad999d9f6220',
  '.055a99999880...',
  '.011a99998880...',
  '.011a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 4 — hand driven down past the hip.
const BA_BACK = [
  '..076666666650..',
  '.0766966696f650.',
  '.055aa99999f6650',
  '.055ad999d9f6650',
  '.055a999998f6650',
  '.011a99998880650',
  '.011a99998880320',
  '..0a999999888210',
  '..0a99998888800.',
  '..0a9988899880..',
];
// Stroke pose 5 — recovery. The elbow swings out, the forearm crosses in over the
// bib and the hand is boxed on its own outline at the end of it: a limb, not four
// loose skin pixels keyed into the blue.
const BA_TUCK = [
  '..076666666650..',
  '.0766966696f650.',
  '.055aa99999f6650',
  '.055ad990666650.',
  '.055a9902216650.',
  '.011a999000880..',
  '.011a99998880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Stroke pose 6 — arm swinging back up to shoulder height.
const BA_RISE = [
  '..076666666650..',
  '.076696669f6220.',
  '.055aa9999980210',
  '.055ad999d980...',
  '.055a99999880...',
  '.011a99998880...',
  '.011a99988880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];
// Float (9 rows): forearms lifted to chest height and angled forward.
const BA_FLOAT = [
  '..076666666650..',
  '.0766966696f650.',
  '.055aa99999f6220',
  '.055ad999d9f2220',
  '.055a99999880...',
  '.011a99998880...',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
];

/* --- big leg blocks (rows 22..31) ---------------------------------
 * Both legs get a knee and a calf: 4px thigh, a 3px pinch at the knee, a 4px calf
 * with the light column stepping one pixel outboard to follow the curve, then a
 * 3px ankle into the boot. The far leg runs a full 3-tone ramp (a/9/8) one step
 * darker than the near leg so the two never fuse into a single blue column.     */

const BL_TOGETHER = [
  '..0a98800a9980..',
  '..0a99800a9980..',
  '..0a98000a990...',
  '..09988009a9980.'.slice(0, 16),
  '..09888008a9980.'.slice(0, 16),
  '...08880009980..',
  '..0cccb001ccb0..',
  '..0cccb00cccb0..',
  '.0bcccb00bcccb0.',
  '.0bbbbb00bbbbb0.',
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
// near leg vertical under the weight.
const BL_PASS = [
  '..0998800a9980..',
  '..0998800a9980..',
  '..0888800a9980..',
  '..01ccb00a9980..',
  '..0cccb00a9880..',
  '.0bbbbb001ccb0..',
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
  '..0998800a9980..',
  '..0998800a9980..',
  '..0888800a9880..',
  '..01ccb00a8880..',
  '..0cccb001ccb0..',
  '.0bbbbb00cccb0..',
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
// Airborne: rear leg tucked, front leg reaching down.
const BL_JUMP = [
  '.0998800a99980..',
  '.099800..0a9980.',
  '099800...0a99980',
  '09880....0a99980',
  '01cb0....0a99980',
  '0cccb0...0a99980',
  '0bcccb0..0a99980',
  '0bbbbb0..01ccb0.',
  '.........0bcccb0',
  '.........0bbbbb0',
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
  '022669666966650.',
  '022aa9999980....',
  '.055ad999d980...',
  '.055a99999880...',
  '.011a99998880...',
  '.011a99988880...',
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
  '055a999998f65000',
  '011a999888066622',
  '011a999888800220',
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
// rows so the head sinks into the shoulders, the torso bulges a pixel wider on the
// far side, the near arm tilts down until the hand hangs at thigh height, and the
// legs fold: thigh forward, shin back, boots planted two pixels wider than idle.
const BIG_DUCK = bg([
  '....00000000....',
  '..077e76666650..',
  '..0665555555550.',
  '..044112223210..',
  '..04422202332210',
  '..04433202222210',
  '..0443224444410.',
  '...01222444410..',
  '...0122222100...',
  '....01222110....',
  '.07666666666650.',
  '08766966696f6650',
  '0855aa99999f6650',
  '0855ad999d980660',
  '0811a99999880620',
  '08a9999988880210',
  '.0998800a999800.',
  '.0998800a99980..',
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
  '..0766966696650.',
  '..055aa99999f650',
  '..055ad999d9f650',
  '02255a999998f650',
  '02255a999998f650',
  '...0a9999998880.',
  '...0a9999888880.',
  '...0a9988899880.',
  '...0998800a9980.',
  '...0998800a9980.',
  '...09988000a980.',
  '...09880001ccb0.',
  '...0998800bcccb0',
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
  '..0766966696650.',
  '..055aa99999f650',
  '..055ad999d9f650',
  '..055a999998f650',
  '02255a999998f650',
  '02255a9999998880',
  '...0a9999888880.',
  '...0a9988899880.',
  '...0998800a9980.',
  '...0998800a9980.',
  '...0998000a9980.',
  '...01ccb00a9980.',
  '..0bcccb00a9980.',
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

// Death: both arms punched straight up, head turned to the camera so both eyes
// read, cap knocked back off the crown, boots pointed down. Big and fire Mario
// used to fall through to `idle` here and die standing at attention.
const BIG_DEAD_ROWS = [
  '....00000000....',
  '...07777666650..',
  '02207e7666660220',
  '0210665555550120',
  '0660442222440660',
  '0660432222340660',
  '0660420220240660',
  '0660420220240660',
  '0660422112240660',
  '0660224444220660',
  '0660122222210660',
  '0660012222100660',
  '0660766666660660',
  '0666966666966660',
  '.06a99999999860.',
  '.06ad999999d860.',
  '.06a99999999860.',
  '.0a999999999880.',
  '.0a999999998880.',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
  '..0a98800a9980..',
  '..0a99800a9980..',
  '..0a98000a990...',
  '..09988009a9980.',
  '..09888008a9980.',
  '...08880009980..',
  '..0cccb00cccb0..',
  '..0cccb00cccb0..',
  '...0ccb00ccb0...',
  '...0bbb00bbb0...',
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
  '.0766966696f650.',
  '.055aa99999f6650',
  '.011ad99d9880220',
  '..0a9999998880..',
  '..0a9999888880..',
  '..0a9988899880..',
  '..0888800a8880..',
  '.01cccb001cccb0.',
  '.0bcccb00bcccb0.',
  '0bbbbbb00bbbbbb0',
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
  '....077e76650...',
  '...077e7666650..',
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
  '.0766966696f650.',
  '.055aa99999f6650',
  '.055ad999d9f6650',
  '.055a999998f6650',
  '.011a99998880650',
  '.011a99998880660',
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
