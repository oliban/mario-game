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
// 6 face mid 7 eye white 8 ink      9 foot dark  a foot lit
// b face shadow (what the cap lip casts)   c face lit
//
// A GOOMBA IS A MUSHROOM WITH A FACE, and a mushroom is two materials, not one.
// The whole cap ramp (1-4) is driven BELOW the face: cap mid '#6b2708' reads at
// luminance 56 against the face's 191, and the cap's brightest body tone
// '#c05a1c' (113) is still darker than the face's own SHADOW '#b07a42' (132). So
// wherever cap meets face there is a value cliff, which is what stops the two
// forms fusing into one brown ball. Slot 5 is the wet-cap specular and is the
// only cap slot allowed to out-shine the face; it covers seven pixels on a
// contact frame and four on a pass, always in the same cap-relative place.
//
// The face's own ink (8, luminance 8) is read against face mid (191) and against
// the cap lip it sits under (slot 2, 56) — a 48-luminance step on BOTH brow arms,
// because the lip carries slot 2 at cols 4-6 and 9-12 in every frame. The lit
// foot tone (a) measures 113 / 122 / 96 RGB units from the overworld, underground
// and castle outlines, so the soles survive a black room in all three palettes.
// Two measured defects fixed here, both of which made this read as one lump of
// brown at gameplay scale:
//   slot 1 was '#3a1608', only 33 RGB from INK.outline — and outline-against-
//     cap-dark is the most common adjacency in the sprite, so the dome had no
//     outline at all and vanished outright against a dark room. Now 50 apart,
//     with the cap-dark -> cap-mid ramp step still healthy at 35.
//   slots 9/a were '#4a2408' / '#7d4416', 21 and 27 RGB from the cap ramp, so
//     the boots were painted out of the cap and read as two more lumps of it.
//     The fix is separation, not hue: a cool lavender cleared the cap ramp but
//     read as slippers. This neutral dark leather measures 68/63/74 against the
//     three cap tones and 100 against the outline, so it still holds up in a
//     black room.
const GOOMBA_PAL = [
  INK.outline, '#4a1c0a', '#6b2708', '#963d10', '#c05a1c', '#f09a48',
  '#e8b878', '#ffffff', '#0b0705', '#1c1610', '#5a4a3a', '#b07a42', '#f8d5ac',
];

// MATERIAL SEPARATION. The underground Goomba shares its level with the Buzzy
// Beetle, so this ramp is measured against BUZZY_PAL rather than against itself.
// Slots 1-4 here sit 50 / 74 / 96 / 87 RGB units from Buzzy's shell ramp, and —
// the pair that actually matters, because Buzzy's head and feet are painted with
// it — 65 / 85 / 93 units from Buzzy's HIDE ramp at slots 6/7/8. That last pair
// used to measure 28 / 27 / 27 and the two enemies greyed into each other.
//
// Slots 1-4 are untouched for exactly that reason. What changed is the FACE:
// it used to be '#9aa4bc', a value that sat between the cap's lit and bright
// tones, so cap and face were the same slate and the thing was a grey ball. The
// face is now a warm bone: 57 RGB units off the cap's brightest body tone (80 off
// the specular), and 87 units at the one adjacency that actually matters — cap
// slot 2 '#626a86' against face-shadow slot b '#a89c7c' along the lip, which are
// the two slots that touch, row 6 against row 7. Cap 4 and face 6 never meet on
// the sheet: slot 4 lives on rows 2-4 and slot 6 on rows 8-12. The separation
// that carries the read is hue as much as value — bone against slate, and slate
// is nowhere near Buzzy's navy either.
const GOOMBA_UNDER_PAL = [
  '#0a0c14', '#3c4258', '#626a86', '#8a92ac', '#b8c0d4', '#e8ecfc',
  '#e0d4b0', '#ffffff', '#141a2c', '#242a3c', '#454e68', '#a89c7c', '#f6efd2',
];

// Cooked stone. The cap ramp 1->5 steps 49 / 58 / 57 / 66 RGB units, and it has
// been dropped a full step so the sandstone face (6) out-values every cap tone
// but the specular. Face shadow (b) clears the cap's bright tone by 45 units,
// which is the one adjacency that matters: those two slots are neighbours all
// along the lip.
// The feet are LEATHER, not stone. Slots 9/a used to be '#2c241c' / '#544838',
// which sit 13 and 8 RGB units from the cap's own '#332c24' / '#524840' — the
// boots were painted out of the cap ramp, so at 1x they read as two more lumps
// of cap. Driven warm they now measure 30 from cap-dark and 52 from cap-mid (67
// from cap-lit), the foot ramp itself steps 61 units 9->a, and the lit sole
// stays 120 RGB off the castle outline so it survives a black room.
const GOOMBA_CASTLE_PAL = [
  '#14100c', '#332c24', '#524840', '#786a5a', '#9c8c76', '#c4b498',
  '#e8cf9a', '#ffffff', '#0a0806', '#4a2a10', '#7a4c1e', '#c2a066', '#f8e8c0',
];

// A CAP THAT FLARES AND A BODY THAT TAPERS. The last pass was called a figure in
// a wide-brimmed hat, and it was: the dome ran straight down at 14 columns, hit a
// 16-wide slab, and then dropped to a box of SIX identical 12-wide rows. Nothing
// in the black fill separated head from jaw, and the stem was 75% of the cap.
//
// The occupied width per row now runs
//   6, 10, 12, 14, 14, 16, 16, 16, 12, 12, 12, 12, 10, 10(split), 12(split),
//   12(split)
// — the cap opens continuously from a 6-column crown to a 16-column rim, the
// body steps IN twice below the rim, and then it SPLITS and splays back out
// into two wide flat pads with a four-column hole of floor between them. The
// longest run of equal widths in the body is four rows, not six. Black-filled
// that is: narrow crown, flared cap, waisted head, two feet — the pinch at row
// 12 plus the gap at rows 13-15 is what a hat brim can never have.
//
// THE RIM SURVIVES A BLACK ROOM. Row 7 is the overhang's underside, and its
// flanks used to be bare slot 0 — INK.outline, 32 RGB from black, 25 in the
// underground palette. At a 40-RGB visibility threshold row 7 collapsed from 16
// occupied columns to 10 and the sprite's visible width fell to 14, i.e. the one
// feature that stops the meatball read did not exist in exactly the two rooms
// GOOMBA_UNDER and GOOMBA_CASTLE ship into. The flanks now read outward-to-inward
// 0 / 1 / 2, and cap-mid measures 114 / 197 / 127 RGB from black across the three
// palettes, so the overhang is visible on sky, on soot and on stone while still
// stepping darker than the lip above it.
//
// THREE FORMS, NOT ONE LUMP — this used to be a single brown ball with a stripe
// of eyes in it, which is why the first one read as a meatball. Every frame is
// built from the same vertical plan (row numbers are the CONTACT frames; the two
// passes run the same plan one row lower with a dome row eaten out):
//
//   row  0     crown, 6 columns of bare outline.
//   rows 1-4   CAP DOME, flaring 10 -> 12 -> 14 as the tone ramps 5 -> 1. The
//              specular is a fixed blob at cols 4-6.
//   row  5     the cap's shoulder, first full-width row, painted from cap mid.
//   row  6     CAP LIP, sixteen columns of the two darkest cap tones.
//   row  7     the overhang's UNDERSIDE. Slot 0 / 1 / 2 outward-to-inward on each
//              flank — NOT bare outline, which is what used to make this row
//              disappear against soot and stone — and between them the lip's cast
//              shadow (slot b) carrying the brow arms in ink at cols 4-6 / 9-11.
//   rows 8-9   the head's upper sides, 14 columns: the CAP WRAPS DOWN around the
//              face in slot 1 at cols 2-3 and 12-13, so the boundary between cap
//              and face is an arc rather than a ruled horizontal line and the
//              head is one rounded form instead of a hat sitting on a card.
//   rows 10-11 12 columns, the face at its widest.
//   row  12    the jaw, 10 columns — the waist.
//   rows 13-15 TWO FEET, splaying back out to cols 0-5 and 10-15 with a four
//              column hole of floor between them.
//
// Occupied width per row runs 6, 10, 12, 14, 14, 16, 16, 16, 14, 14, 12, 12, 10,
// 10(split), 12(split), 12(split). Filled solid black that is a narrow crown, a
// cap flaring to full width, a head waisting IN by six columns, and then two
// separated pads — a pinch plus a split, neither of which a brimmed hat has.
//
// THE FACE — SEPARATE ISLANDS OF INK, NEVER ONE SMEAR:
//
//   row  7   brow arms, ink at cols 4-6 and 9-11, high on each flank.
//   row  8   eye whites at cols 4-6 / 9-11 with the nose bridge — ink at cols 7-8
//            only — driven down between them. Arms high, bridge low: the angry V.
//   row  9   pupils, ONE pixel each dead-centre of its eye at cols 5 and 10, with
//            white on both sides and white directly above, and two clear columns
//            from the bridge so they cannot touch it even diagonally.
//   row 10   CHEEK BAND. No ink at all — the row that stops the eyes and the
//            mouth fusing. Slot c at cols 4-5, slot b at cols 10-11: the
//            modelling now sits INSIDE the face, not stacked in its two edge
//            columns the way the rim-lit version had it.
//   row 11   the mouth: a 4px ink bar at cols 6-9 with a white FANG at each
//            corner (cols 5 and 10) breaking the bar into a shape.
//   row 12   the jaw, with the frown's two down-turned corners landing in ink at
//            cols 5 and 10, directly under the fangs.
//
// Vertical falloff, which the rim-lit version had none of: row 8 is white over
// face mid, row 10 carries the lit slot c on the left and the shadow slot b on
// the right, and row 12 drops to cap-dark shoulders around a face-mid jaw. Brow
// and chin are no longer the same value.
//
// THE CYCLE. 0 CONTACT both feet planted at their widest. 1 PASS the whole body
// sinks a row and the cap eats a dome row with it, the trailing leg compresses to
// a single planted row while the leading foot lifts clear of the floor, and the
// frown stretches to a 6px bar. 2 CONTACT planted again with the stance drawn in
// a column on each side, and he SQUINTS: row 8's whites are gone entirely. 3 PASS
// the mirror of 1 with the trailing foot in the air and the eyes pulled outboard,
// glancing down the line of travel.
//
// THE CAP DOES NOT BOIL. Slot 5 is frozen at cols 4-6 in all four frames, one row
// lower and one row shorter on the passes because the dome squashes. The light
// does not travel, the object does.

// CONTACT. Both feet planted, stance at its widest, crown at its highest.
//        0123456789abcdef
const GOOMBA_A = [
  '.....000000.....',
  '...0044332200...',
  '..044554332210..',
  '.03455543322210.',
  '.02455433222110.',
  '0122333322221110',
  '0122222112222110',
  '012b888bb888b210',
  '...0777887770...',
  '...0787667870...',
  '...0cc6666bb0...',
  '...0b788887b0...',
  '....08666680....',
  '.0aa90....0aa90.',
  '0aaa90....0aaa90',
  '099990....099990',
];

// PASS. The cap has eaten a dome row and its crown has dropped a pixel: the body
// sinks onto the trailing (left) leg, whose shin now shows through the jaw row.
// The leading foot is off the floor entirely — it lives in rows 13-14, never
// reaches row 15, and its sole tips into the darker foot tone as it lifts. The
// frown stretches from a 4px bar with corners to a flat 6px bar with the fangs
// pushed out to cols 4 and 11, so he grits into the step.
//        0123456789abcdef
const GOOMBA_B = [
  '................',
  '................',
  '.....000000.....',
  '...0044332200...',
  '..044554332210..',
  '.02455433222110.',
  '0122333322221110',
  '0122222112222110',
  '012b888bb888b210',
  '...0777887770...',
  '...0787667870...',
  '...0cc6666bb0...',
  '...0788888870...',
  '....06666660....',
  '0aaa90....0aa90.',
  '099990..........',
];

// CONTACT. Planted again but a column inboard of frame 0. The cap is byte-for-
// byte frame 0's cap — a mushroom that is not rolling has no reason to relight —
// and the step is told by the stance and by the SQUINT: row 8 loses both bands of
// white to the brow's shadow, so each eye is one row deep instead of two.
//        0123456789abcdef
const GOOMBA_C = [
  '.....000000.....',
  '...0044332200...',
  '..044554332210..',
  '.03455543322210.',
  '.02455433222110.',
  '0122333322221110',
  '0122222112222110',
  '012b888bb888b210',
  '...0666886660...',
  '...0787667870...',
  '...0cc6666bb0...',
  '...0b788887b0...',
  '....08666680....',
  '..0aa90..0aa90..',
  '.0aaa90..0aaa90.',
  '.099990..099990.',
];

// PASS, mirrored. Trailing (left) foot in the air and tucked, the leading right
// leg carrying the drop, the same stretched frown as frame 1, and the eye whites
// pulled outboard — cols 4-5 and 10-11 on row 8 instead of 4-6 and 9-11 — so he
// glances ahead down the line of travel.
//        0123456789abcdef
const GOOMBA_D = [
  '................',
  '................',
  '.....000000.....',
  '...0044332200...',
  '..044554332210..',
  '.02455433222110.',
  '0122333322221110',
  '0122222112222110',
  '012b888bb888b210',
  '...0776886770...',
  '...0787667870...',
  '...0cc6666bb0...',
  '...0788888870...',
  '....06666660....',
  '.0aa90....0aaa90',
  '..........099990',
];

// STOMPED. The same three forms with the middle one crushed out: the cap keeps a
// dome row, its full-width lip and the lip's underside, the face is down to the
// brow, the bridge and a pair of eyes — the mouth is what the stomp squeezed away
// — and the feet have squirted out sideways past the cap into cols 1-2 and 13-14,
// painted in the LIT foot tone so they still read in a black room. The brow's ink
// and the pupils' ink stay two separate islands here too: row 4 carries the
// whites and the bridge, row 5 the pupils at cols 4-5 and 10-11.
//        0123456789abcdef
const GOOMBA_FLAT_ROWS = [
  '....00000000....',
  '..044554332210..',
  '0122222112222110',
  '012b888bb888b210',
  '...0777887770...',
  '...0787667870...',
  '0aa0cc6666bb0aa0',
  '0990........0990',
];

// Every sprite in this module is authored at hitbox width, so the anchor is always (0, 0).
const mk = (rows, pal, name) => makeSprite(rows, pal, { name, ox: 0, oy: 0 });

function goombaSet(pal, tag) {
  const frames = [GOOMBA_A, GOOMBA_B, GOOMBA_C, GOOMBA_D].map((r, i) =>
    mk(r, pal, `goomba-${'abcd'[i]}${tag}`));
  const flat = mk(GOOMBA_FLAT_ROWS, pal, `goomba-flat${tag}`);
  // Contacts hold, passes snap through — 16 ticks total, the old two-frame cadence.
  return { walk: new Anim(frames, [5, 3, 5, 3]), flat };
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

// THE WORN SHELL CARRIES THE SAME MASS AS THE LOOSE ONE. It used to span ten
// columns against KOOPA_SHELL_ROWS' fourteen, so the carapace grew 40% wider in
// the single frame where Mario stomps it and the player is looking straight at
// it. The carapace here now spans cols 1-12 — twelve columns against fourteen —
// and the belly and near arm have been pulled back to cols 13-14 to pay for it.
//
// The shell's specular is a solid convex wedge in the UPPER-LEFT quadrant (rows
// 11-13), matching the module's declared light, with a slot-2 bounce arc along
// the lower-right where the dome turns away.
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
  '..000000677760..',
  '.034554332206770',
  '0345544332222080',
  '0234444333222070',
  '0233443332221080',
  '0123333322210780',
  '0122233321106770',
  '0112222111066760',
  '.0887777777660..',
  '.0000000000000..',
  '..07870.078870..',
  '..07770.077770..',
  '..00000.067760..',
  '........000000..',
];

// CONTACT frame — 57.5% of union pixels differ from KOOPA_WALK_A and the longest
// identical row run between the two is two rows. Five things move at once:
//   * the head drops a pixel and its underside darkens (rows 8-9 swap skin-mid
//     for skin-dark) because the neck has folded it down toward the carapace;
//   * he SQUINTS: the eye loses a column of ink and pulls back to cols 10-11;
//   * the carapace loses a whole row — eight dome rows become seven — so the
//     shell genuinely squashes instead of sliding;
//   * the specular slides one column right on EVERY dome row as the shell rolls
//     onto the leading foot;
//   * the legs stride in OPPOSITE directions: near foot 1px forward and lifted
//     clear of the floor, far foot 1px back and planted flat on row 23.
//        0123456789abcdef
const KOOPA_WALK_B = [
  '................',
  '........0000....',
  '.......098870...',
  '......09887660..',
  '......0888ab760.',
  '......0878ab7760',
  '.....08777ab7870',
  '.....07777b78980',
  '.....06677700860',
  '.....0666777660.',
  '...00006777760..',
  '..000000677760..',
  '.033455433206770',
  '0234555433222080',
  '0223444433322070',
  '0223344333221080',
  '0122333332220780',
  '0112223221106770',
  '.0877777766600..',
  '.0000000000000..',
  '.07870...078870.',
  '.07770...077770.',
  '.06760...000000.',
  '.00000..........',
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

// PARATROOPA. The wing occupies ONLY cells the matching walk frame leaves
// transparent: differenced cell by cell against KOOPA_WALK_A / _B, zero shell,
// limb or belly pixels are overwritten — 40 cells of wing are added to A, 25 to
// B — and it carries its own slot-0 outline on every exposed edge instead of
// running off the sprite border.
//
// It is a fan, not a blade: a lit leading arc (d) along the top, a shaded
// mid-web (c), a dark root (e) where it meets the carapace, and two 1px slot-0
// notches bitten into the trailing edge (rows 4 and 6) that split it into three
// primaries. Its root outline runs into the shell's own top arc on row 9, so it
// is attached, not floating.
//
// UP-STROKE: fan swept up and spread over ten rows and five columns.
//        0123456789abcdef
const KOOPA_FLY_A = [
  '........0000....',
  '..00...098870...',
  '.0dd0.09887760..',
  '0dddd0088aab760.',
  '0ddcc0087abb7760',
  '00dc00877abb7870',
  '0cce007777b78980',
  '00ee006777700870',
  '0ee0.0667777760.',
  '00000006777760..',
  '..000000677760..',
  '.034554332206770',
  '0345544332222080',
  '0234444333222070',
  '0233443332221080',
  '0123333322210780',
  '0122233321106770',
  '0112222111066760',
  '.0887777777660..',
  '.0000000000000..',
  '..07870.078870..',
  '..07770.077770..',
  '..00000.067760..',
  '........000000..',
];

// DOWN-STROKE: the fan has beaten down and folded. It is three columns instead
// of five, its tip has travelled from row 0 to row 3, and the whole web has
// collapsed toward the root — a change of AREA, which is what makes a flap read,
// not a one-pixel slide.
//        0123456789abcdef
const KOOPA_FLY_B = [
  '................',
  '........0000....',
  '.......098870...',
  '......09887660..',
  '..00..0888ab760.',
  '.0dd0.0878ab7760',
  '0dd0.08777ab7870',
  '00c0.07777b78980',
  '0ce0.06677700860',
  '0ee0.0666777660.',
  '00000006777760..',
  '..000000677760..',
  '.033455433206770',
  '0234555433222080',
  '0223444433322070',
  '0223344333221080',
  '0122333332220780',
  '0112223221106770',
  '.0877777766600..',
  '.0000000000000..',
  '.07870...078870.',
  '.07770...077770.',
  '.06760...000000.',
  '.00000..........',
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
//
// The hide ramp (6/7/8) is the material that actually shares a screen with the
// underground Goomba, and it used to sit 28 / 27 / 27 RGB units from that
// Goomba's body ramp — the head and the feet of one enemy were the same slate as
// the whole body of the other, in the one level they both live in. Driven cool
// and dark it now measures 65 / 85 / 93 against GOOMBA_UNDER_PAL[1,2,3].
//
// The shell ramp was lifted at the same time, because the underground clears to
// pure black and slots 1-2 used to sink into it. Shell-dark [1] against hide-dark
// [6] has opened from 23 units to 68, so the dome and the skirt part company
// inside the sprite as well as against the room.
const BUZZY_PAL = [
  '#080c18', '#1c2f7a', '#2a49aa', '#3f6ad8', '#6f9cf4', '#c8dcff',
  '#101c3a', '#22386e', '#3d5ea6', '#ffffff', '#0a0a12',
];

// A BEETLE, NOT A RECOLOURED KOOPA. The carapace is a low wide helmet: the
// crown opens at 10 columns on row 1, reaches its full 14 by row 3 and then runs
// straight down, so the dome is broad and shallow instead of the Koopa's tall
// egg. Row 8 is an unbroken slot-0 line — the shadow the dome casts on the brim
// — and below it the brim flares to the full 16 columns, one pixel proud of the
// dome on each flank, which is the overhang that makes it read as a helmet. The
// brim is painted from the SHELL ramp, not the hide: it is carapace, and only the
// head and the two feet are hide.
//
// The head is tucked UNDER the front brim at cols 9-15, rows 10-12, not bolted
// to the right flank: a lit hide brow (slot 8) with two 2x2 eyes below it, three
// white cells and an ink pupil each, thrown forward toward the leading edge.
//        0123456789abcdef
const BUZZY_WALK_A = [
  '................',
  '...0000000000...',
  '..034554332210..',
  '.03455543332210.',
  '.03445543322210.',
  '.02344433322110.',
  '.02333332221110.',
  '.01222222211110.',
  '0000000000000000',
  '0544433333222220',
  '0443333320888880',
  '.0332220.0996990',
  '..000000.09a69a0',
  '..08880..0000000',
  '..08770....08880',
  '..00000....00000',
];

// PASS. The whole carapace drops a row — five dome rows against six — so the
// beetle genuinely squats, and the dome specular slides one column right as the
// shell rolls onto the leading foot. The eyes narrow to a single white cell on
// the leading side. The rear foot is tucked inward to cols 3-7 and lifted clear
// of the floor (it stops on row 14); only the front foot reaches row 15.
//        0123456789abcdef
const BUZZY_WALK_B = [
  '................',
  '................',
  '...0000000000...',
  '..033455432210..',
  '.03345554332210.',
  '.02334554322210.',
  '.02233433222110.',
  '.01222322211110.',
  '0000000000000000',
  '0454443333222210',
  '0344333330888880',
  '.0322220.0969990',
  '..000000.09a99a0',
  '...08880.0000000',
  '...00000..08880.',
  '..........00000.',
];

// The loose shell: the same helmet with the head withdrawn. This array used to
// BE KOOPA_SHELL_ROWS shifted down one row — six byte-identical consecutive rows
// and 130 of 188 union pixels the same, 69.1%. Re-authored, the best offset-aware
// identity against KOOPA_SHELL_ROWS is 37.0% (71 of 192) and no BUZZY_* array
// shares even two consecutive rows with any KOOPA_* array. The occupied-width
// sequence now runs 10,12,14,14,14,14,14,16,16,16,14,12,10 against the Koopa's
// 6,10,12,14,16,16,16,16,16,14,14,14,12,12: thirteen rows against fourteen, and
// the widest part is the brim at the BOTTOM rather than the dome in the middle.
// Row 10 is the unbroken slot-0 dome/skirt outline, so the two forms are parted
// by line as well as by value.
//        0123456789abcdef
const BUZZY_SHELL_ROWS = [
  '................',
  '................',
  '................',
  '...0000000000...',
  '..034554332210..',
  '.03455543332210.',
  '.03445543322210.',
  '.02344433322110.',
  '.02333332221110.',
  '.01222222211110.',
  '0000000000000000',
  '0544433333222220',
  '0444333332222210',
  '.03322222221110.',
  '..022222111110..',
  '...0000000000...',
];

// SPIN — a vertical-axis rotation, the one motion that leaves a helmet's outline
// unchanged, so all four frames keep the resting silhouette and the Koopa's
// tumbling circle is never borrowed. What turns is the surface. Two ribs run the
// full height of the carapace, each a lit crest one step up followed by a 2px
// groove two steps down; they sit 8 columns apart and step +2 columns per frame
// (1/9 -> 3/11 -> 5/13 -> 7/15), which closes the loop exactly on the fourth
// frame. The notch the head withdrew through orbits the brim with them —
// front-right, off the leading edge, hidden behind, then round the left. The
// dome specular does NOT travel, because the light does not rotate.
// Adjacent-frame union diffs: 39.2%, 43.2%, 39.8%, 36.9%.
//        0123456789abcdef
const BUZZY_SPIN_0 = [
  '................',
  '................',
  '................',
  '...0000000000...',
  '..034554421210..',
  '.02455544222210.',
  '.02445544212210.',
  '.01344434212110.',
  '.01333333111110.',
  '.01222223111110.',
  '0000000000000000',
  '0324433340000220',
  '0224333341111210',
  '.02322223111110.',
  '..022222211110..',
  '...0000000000...',
];

//        0123456789abcdef
const BUZZY_SPIN_1 = [
  '................',
  '................',
  '................',
  '...0000000000...',
  '..022554333110..',
  '.04235543341110.',
  '.04225543331110.',
  '.03224433331110.',
  '.03223332231110.',
  '.02112222221110.',
  '0000000000000000',
  '0552233333310000',
  '0452233332311110',
  '.04212222231110.',
  '..011222112110..',
  '...0000000000...',
];

//        0123456789abcdef
const BUZZY_SPIN_2 = [
  '................',
  '................',
  '................',
  '...0000000000...',
  '..035334332220..',
  '.03453343332310.',
  '.03453343322310.',
  '.02352233322210.',
  '.02342232221210.',
  '.01231122211210.',
  '0000000000000000',
  '0544522333223110',
  '0444422332223110',
  '.03331122221210.',
  '..023112111120..',
  '...0000000000...',
];

//        0123456789abcdef
const BUZZY_SPIN_3 = [
  '................',
  '................',
  '................',
  '...0000000000...',
  '..034552232210..',
  '.03455522332210.',
  '.03445522322210.',
  '.02344522322110.',
  '.02333421221110.',
  '.01222311211110.',
  '0000000000000000',
  '0000034223222230',
  '0111134222222220',
  '.01112311221110.',
  '..022231111110..',
  '...0000000000...',
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
// 6 spike shade  7 spike white  8 muzzle lit  9 muzzle shade  a ink
//
// The muzzle used to be '#e8a058' — only 46 units from the shell's own '#f89a34'
// highlight, so head and carapace fused into one orange mass. It is now a pale
// bone '#f8c890' over '#b05818', 103 units clear of the brightest shell tone, so
// the head reads as a different material poking out from under the brim.
// The shell has also been driven red, away from the Goomba's cap. Measured at
// ramp indices 1-5 the two used to sit 48/48/31/23/57 apart — the lit and bright
// tones were close enough that an overworld screen holding both read as one
// orange. They now measure 51/57/52/54/65.
const SPINY_PAL = [
  '#1c0a04', '#7c1200', '#c02808', '#ec4a08', '#ff7a20', '#ffbc70',
  '#b9c2cc', '#ffffff', '#f8c890', '#b05818', '#0b0705',
];

// The shell is a DOME, not a crate: it narrows to eight pixels at the crown
// (row 3), swells to full width at rows 5-9 and pulls back in over rows 10-12.
// Four spikes splay off the arc — the outer pair lean out and stand a pixel
// shorter than the inner pair, each a white body with the outline cut only down
// its flanks, and each rooted in a slot-6 stub (row 3) with shell colour showing
// between the roots so they sit ON the carapace instead of on a grey bar.
// The head is a pale muzzle pushing out from under the brim at cols 9-15: a
// brow, two 2x2 white eyes with ink pupils thrown forward, and a dark jaw.
//        0123456789abcdef
const SPINY_WALK_A = [
  '.....0..0.......',
  '..0.070070.0....',
  '.0760760760760..',
  '..045543322110..',
  '.03455443332210.',
  '0345554433322110',
  '0234554433322210',
  '0234454333222210',
  '0223333220888880',
  '0122222110779770',
  '.0111111107a97a0',
  '..0111110899980.',
  '..000000000000..',
  '.03430...03430..',
  '.02320...02320..',
  '.00000...00000..',
];

// Contact. The carapace loses a middle row and spreads a pixel wider at the
// base — a real squash, not a nudge — and the specular slides one column right
// across EVERY dome row as the shell rolls onto the leading foot. The left leg
// lifts clear of the floor while the right plants a pixel further forward.
//        0123456789abcdef
const SPINY_WALK_B = [
  '................',
  '.....0..0.......',
  '..0.070070.0....',
  '.0760760760760..',
  '..044553322110..',
  '.03345544332210.',
  '0334555443332210',
  '0233445433322210',
  '0223332220888880',
  '0112222110779770',
  '..011111107a97a0',
  '.01111110899980.',
  '.0000000000000..',
  '.03430....03430.',
  '.00000....02320.',
  '..........00000.',
];

// SPINY EGG — one ball, one 45-degree roll. The core used to be 0 pixels
// different between the two frames while four flat pure-white 3px blocks
// teleported around it. Now:
//   * every spike TAPERS — a 1px slot-7 tip over a 2px base whose trailing pixel
//     is slot 6, the declared spike shade, so it is a shaded cone and not a flag;
//   * the shell carries eight scute plates, each one step off the local tone.
//     Frame A seats the spike sockets on N/E/S/W with the plates on the
//     diagonals; frame B swaps them. That is 32 differing pixels inside the
//     slot-1-5 core, all of it surface pattern.
// The specular does NOT travel with the pattern, because the light does not roll
// with the egg — a sphere's shading is the one thing rotation cannot change.
//        0123456789abcdef
const SPINY_EGG_A = [
  '................',
  '.......70.......',
  '......0760......',
  '.....044330.....',
  '....04554320....',
  '...0334542220...',
  '..003454432200..',
  '.06024443321077.',
  '.77013433222060.',
  '..002333221100..',
  '...0211222210...',
  '....01222110....',
  '.....011210.....',
  '......0670......',
  '.......07.......',
  '................',
];

//        0123456789abcdef
const SPINY_EGG_B = [
  '................',
  '...0........0...',
  '..070......070..',
  '..076045430670..',
  '....03454210....',
  '...0345543320...',
  '...0345333220...',
  '...0334433120...',
  '...0224332110...',
  '...0233212110...',
  '...0222221110...',
  '....02122220....',
  '..076012110670..',
  '..070......070..',
  '...0........0...',
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

// LAKITU. The cloud used to be a box: seven consecutive full-16 rows with a
// ruler-straight lid and dead-vertical sides, shaped only in the last two rows,
// which on sky read as a laundry basket. It is now lobed. The occupied width per
// row runs 6,8,10,12,12,12,12,12,12,12,12,12,12,14,16,16,16,15,14,14,13,12,12,11
// — three consecutive full-width rows at most (14-16), two bump crowns rising
// out of the deck at rows 12-13 with his waist showing in the notch between
// them, flanks that step back in over rows 17-21, and three hanging bumps
// underneath at rows 22-23.
//
// The tonal deck steps 8 -> 7 -> 9 -> 6 -> c down a diagonal from the lit
// upper-left to the shaded lower-right; every one of those five slots is
// painted in every cloud frame.
//
// The head is 12 rows tall in EVERY frame — idle, throw, both bob phases — so it
// can never shrink mid-throw. Only where it sits changes.
//        0123456789abcdef
const LAKITU_IDLE = [
  '.....000000.....',
  '....03454210....',
  '...0345543210...',
  '..023411433210..',
  '..023443322110..',
  '..0bbbb3bbbb20..',
  '..0b88d3b88d20..',
  '..0b8ad2b8ad20..',
  '..0ddee2ddee10..',
  '..023333333220..',
  '..010000000220..',
  '..010080080210..',
  '..000022210000..',
  '.08888021077770.',
  '0888777007779990',
  '0877777777999990',
  '0777777799999990',
  '077779999999960.',
  '.07999999996660.',
  '.09999999666660.',
  '.0999996666660..',
  '..099066660660..',
  '..060.0660.0c0..',
  '..00...00..00...',
];

// WIND-UP. Three things happen at once and none of them is a recolour.
//   * He rears back: head rows 0-8 shift two columns left, rows 9-11 one column
//     left, and the waist stays put, so the lean has a hinge instead of being a
//     rigid slide.
//   * The mouth opens across THREE rows — 9, 10 and 11 — where the idle frame
//     has a closed slot-0 line.
//   * A real arm is authored in slots 2/3 with its own slot-0 outline all round.
//     Shoulder (6,12)-(6,13); upper arm rising right through (5,13)-(5,14) to an
//     elbow at (4,14)-(4,15); forearm turning back up-LEFT through (3,13)-(3,14)
//     and (2,12)-(2,13); a 3x2 fist at rows 0-1, cols 11-13. Two segments, two
//     pixels thick, meeting at a corner — a bend, not a stalk.
// Measured against LAKITU_IDLE that is 151 differing cells of 327 union, 46.2%.
// The egg is SPINY.egg, spawned by the entity.
//        0123456789abcdef
const LAKITU_THROW = [
  '...000000.03430.',
  '..0345421003330.',
  '.03455432100330.',
  '0234114332100330',
  '023443322110.030',
  '0bbbb3bbbb200330',
  '0b88d3b88d20230.',
  '0b8ad2b8ad2000..',
  '0ddee2ddee10....',
  '.023aaaaa3220...',
  '.010aaaaa0220...',
  '.010a8a8a0210...',
  '..000022210000..',
  '.08888021077770.',
  '0888777007779990',
  '0877777777999990',
  '0777777799999990',
  '077779999999960.',
  '.07999999996660.',
  '.09999999666660.',
  '.0999996666660..',
  '..099066660660..',
  '..060.0660.0c0..',
  '..00...00..00...',
];

// DRIFT + SINK. Not the same cloud nudged sideways — 163 differing cells of 301
// union against LAKITU_IDLE, 54.2%:
//   * Lakitu settles a row deeper and the crowns swell around him, from cols
//     2-5 / 10-13 to cols 1-5 / 10-14, so the deck closes over a row earlier
//     (row 13 instead of 14) and he is swallowed rather than translated;
//   * the tonal banding rolls three columns, the shaded flank eating into the
//     lit face the way a cloud rolling over on itself does;
//   * all three underside bumps travel, cols 2-4 / 6-9 / 11-13 becoming
//     3-5 / 7-10 / 12-14, so every valley in the silhouette lands somewhere new.
//        0123456789abcdef
const LAKITU_IDLE_B = [
  '................',
  '.....000000.....',
  '....03454210....',
  '...0345543210...',
  '..023411433210..',
  '..023443322110..',
  '..0bbbb3bbbb20..',
  '..0b88d3b88d20..',
  '..0b8ad2b8ad20..',
  '..0ddee2ddee10..',
  '..023333333220..',
  '..010000000220..',
  '.00000221100000.',
  '0888880000777770',
  '0888888777777770',
  '0888877777777990',
  '088777777779990.',
  '.07777779999990.',
  '.07777999999990.',
  '.0779999999960..',
  '..099999996660..',
  '..0999096660660.',
  '...090.0660.0c0.',
  '...00...00..00..',
];

// SWING-THROUGH, second bob phase. The elbow straightens: the forearm drops
// from a diagonal to horizontal at row 5, cols 12-14, and the fist falls four
// rows from (0-1, 11-13) to (4, 13-15). Cancel the one-row bob and 47 cells
// still differ inside cols 12-15 between this frame and LAKITU_THROW — the arm
// travels through an arc, it is not the same arm translated. The cloud re-lobes
// underneath exactly as it does in the idle pair.
//        0123456789abcdef
const LAKITU_THROW_B = [
  '................',
  '...000000.......',
  '..03454210......',
  '.0345543210..000',
  '0234114332100343',
  '0234433221103330',
  '0bbbb3bbbb20200.',
  '0b88d3b88d200...',
  '0b8ad2b8ad20....',
  '0ddee2ddee10....',
  '.023aaaaa3220...',
  '.010aaaaa0220...',
  '.00000221100000.',
  '0888880000777770',
  '0888888777777770',
  '0888877777777990',
  '088777777779990.',
  '.07777779999990.',
  '.07777999999990.',
  '.0779999999960..',
  '..099999996660..',
  '..0999096660660.',
  '...090.0660.0c0.',
  '...00...00..00..',
];

// Nothing here is static: the cloud drifts a pixel and re-rolls its internal
// banding while Lakitu settles into it and rises again.
export const LAKITU = {
  idle: new Anim([mk(LAKITU_IDLE, LAKITU_PAL, 'lakitu-idle'),
                  mk(LAKITU_IDLE_B, LAKITU_PAL, 'lakitu-idle-b')], 24),
  throwing: new Anim([mk(LAKITU_THROW, LAKITU_PAL, 'lakitu-throw'),
                      mk(LAKITU_THROW_B, LAKITU_PAL, 'lakitu-throw-b')], 24),
};
