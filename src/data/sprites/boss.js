// The finale cast: Bowser, his flame breath, Toad, and Princess Toadstool.
//
// FACING — Bowser advances on Mario from the RIGHT, so on screen he is drawn
// facing LEFT. The engine mirrors sprites, so like every other actor in this
// game he is AUTHORED FACING RIGHT here; the renderer draws him flipX = true.
//
// Light source is the UPPER LEFT throughout. Hard pixel edges only.
//
// Two rules this module is held to, because they are cheap to break and
// expensive to notice:
//   * No bone feature is ever one pixel. Fangs, claws and carapace spikes are
//     all at least 2 wide, lit slot c over shadow slot b, so nothing scatters
//     into speckle when the sprite is drawn at 1x. The fangs are straight
//     two-wide columns hanging off a lip line, not diagonal smears.
//   * Interior separation is one step down the material's OWN ramp, not slot 0.
//     Slot 0 is reserved for pixels that touch background, plus the eye and the
//     inside of an open mouth. Interior black runs under 4% of every frame.

import { makeSprite, Anim } from '../../core/gfx.js';

// ---------------------------------------------------------------------------
// BOWSER — 32x32, the largest sprite in the game.
//   0 outline/void   1 shell deep     2 shell mid      3 shell lit
//   4 shell specular 5 hide shadow    6 hide mid       7 hide lit
//   8 mane deep      9 mane mid       a mane lit       b bone shadow
//   c bone lit       d scute shadow   e scute mid      f scute lit
// ---------------------------------------------------------------------------
// Four materials, four disjoint hue families, and — more importantly — the two
// biggest masses are split by VALUE, not by hue, because value is what the eye
// reads shape from:
//   1-4  GREEN. The CARAPACE is painted from slots 1-3 (lum 63/83/103); the
//        SKULL is painted from slots 3-4 (lum 103/165). Skull-lit 4 against
//        shell-mid 2 is 82 luminance units apart, so the head pops off the
//        shell in a pure value read, not only in colour.
//   5-7  ORANGE hide: muzzle, jaw, belly rim, limbs, tail.
//   8-9  RED mane (slot a is held back as a gold specular and used sparingly).
//   d-f  TAN plastron scutes, banded three rows on / one row off.
//   b-c  BONE: horns, fangs, claws, carapace spikes, toe claws.
// Slot 1 is #0b5324 (lum 63), 47 luminance clear of the slot-0 outline (lum 16)
// so the shell's deep tone reads as green rather than fusing into the outline.

const BOWSER_PAL = [
  '#150f09', '#0b5324', '#0f6b2c', '#1c9440',
  '#46c95c', '#7a2600', '#d4600c', '#ff9024',
  '#7a1000', '#d92a00', '#ffd21e', '#b2aa98',
  '#fff6e2', '#8a5a12', '#c98f30', '#eeca7a',
];

// COMPOSITION, authored facing RIGHT (the renderer mirrors him). The test this
// is built to pass: fill every non-transparent pixel black and he must still be
// Bowser. Nineteen of the thirty-two rows carry interior sky, and every gap
// below is at least two columns wide so it survives the outline dilation:
//   * the two HORNS are cored three columns apart, leaving two columns of open
//     sky between them for the top four rows;
//   * the shell's crown spike stands at cols 1-7 while the mane crest starts at
//     col 11, so cols 8-10 are a sky V through rows 7-11 — that notch is what
//     stops the carapace and the head reading as one lump;
//   * the CARAPACE sits LOW and BACK (rows 12-27, cols 1-11) with the skull
//     above and right of it, so the top-left ninth of the frame is empty sky
//     and the figure steps down from horns to shell instead of squaring off;
//   * three bone spikes stand off the dome's left arc with bare contour between
//     them, so the left edge is notched rather than a wall;
//   * a two-column sky channel runs between the shell's front rim and the near
//     thigh from row 21 all the way down into the crotch — eleven rows of
//     genuine background straight through the middle of the figure;
//   * the snout is the forward-most point and the jaw undercuts it, so cols
//     26-31 open onto sky under the chin before the arm swings back in.
//
// Nothing sits on col 31 except the reaching claw. Interior slot 0 is the pupil
// and the nostril only — six pixels a frame.

// CONTACT POSE. Both soles are planted on row 30, the far leg trailing back
// under the tail and the near leg reaching forward, weight carried between
// them.
const BOWSER_WALK_A = [
  '.................0ccb0..0ccb0...',
  '................00ccb0.00ccb0...',
  '.............0000cccb0.0cccb0...',
  '............00800cccb000cccb0...',
  '............0998ccbbb00ccbbb0...',
  '..........000098cc44444443bb0...',
  '..........089999b444444444300...',
  '..000.....00999944444444443300..',
  '..0b00...000899444111111243320..',
  '..0cb00..0999994441ccc00422220..',
  '..0ccb00.00899844441cc00276620..',
  '..0ccbb0..009984444211127777760.',
  '..0cc33000009983444433277665060.',
  '..0c333330098983344332676666650.',
  '.003133332998888333332677766550.',
  '0033333312888888823332705555555.',
  'cc3331133210088888222265cc55cc5.',
  '0b33113132209988876ee655bb66bb..',
  '033333332220998076fffee0000000..',
  '03113332122080006dddd7776000....',
  '03333322112000006eeee777666000..',
  '033331222120..06ffffe7766665c00.',
  '002312221120..06dddddd66665bcc00',
  '0c3211111120..05eee7eeee55bcccc0',
  '0b2212111250..00577776ef005bcc00',
  '066211111250...0677776d50000bc0.',
  '666521122550...0077766600..0000.',
  '655502255500....066666600.......',
  '000066665cc0....006666550000....',
  '...066665cc0.....0777665ccc0....',
  '...066655cc0.....0776665cc00....',
  '...000550000.....0066555bb0.....',
];

// PASSING POSE. The CARAPACE, its spikes and the tail are pinned — they do not
// move a pixel between the two frames, so the outer contour of the shell never
// jitters. What moves is the head-and-mane block, and it does NOT translate:
// the skull drops a row and squashes half a pixel wider, the jaw drops nearly
// two, the horns barely a half, and the mane tufts swing back. So the weight
// shifts through the neck instead of the whole slab bobbing. The legs swap
// roles underneath: the near leg reaches forward onto a flat sole while the far
// leg pushes off and lifts.
const BOWSER_WALK_B = [
  '.................00000..00000...',
  '................00ccb0.00ccb0...',
  '................0cccb0.0cccb0...',
  '............00000cccb000cccb0...',
  '............0900ccccb00ccccb0...',
  '............0980ccbb4444cbbb0...',
  '.........000098ccb44444443bb0...',
  '..000....08999998444444443300...',
  '..0b00...00899994444444444300...',
  '..0cb00.000099984411111124320...',
  '..0ccb0009999994441ccc0043320...',
  '..0ccbb0089999844441cc00222200..',
  '..0cc33000089984444211127777760.',
  '..0c333330009983444433277765060.',
  '.003133332998983344332677666650.',
  '0033333312998888333332666666650.',
  'cc33311331888888222222705555555.',
  '0b33113132100888876ee665cc55cc5.',
  '033333332220998876fffee5bb66bb..',
  '03113332122098806dddd777655500..',
  '03333322112000006eeee777666000..',
  '033331222120..06ffffe7766665c00.',
  '002312221120..06dddddd66665bcc00',
  '0c3211111120..05eee7eeee55bcccc0',
  '0b2212111200..00577776ef005bcc00',
  '066211111250...0677777650000bc0.',
  '666521122500...00777666600.0000.',
  '6555622bcc0.....067666665000....',
  '00666555cc0.....0006777665c00...',
  '.006655bcc0.......0077665ccc0...',
  '..000550000........066665bcc0...',
  '....0000...........0000000000...',
];

// THE ROAR. The change is on the JAW, not somewhere down the chest: the upper
// palate bites down with two fangs, the lower jaw drops five rows with two more
// pointing back up at them, and the throat between is slot 8 — the deep red of
// the mane, so the maw reads as flesh and not as a hole punched in the sprite.
// The chin ends two rows below where it does in the walk and the plastron
// starts two rows later to make room. The near arm has dropped clear of it.
const BOWSER_MOUTH_OPEN = [
  '.................0ccb0..0ccb0...',
  '................00ccb0.00ccb0...',
  '.............0000cccb0.0cccb0...',
  '............00800cccb000cccb0...',
  '............0998ccbbb00ccbbb0...',
  '..........000098cc44444443bb0...',
  '..........089999b444444444300...',
  '..000.....00999944444444443300..',
  '..0b00...000899444111111243320..',
  '..0cb00..0999994441ccc00422220..',
  '..0ccb00.00899844441cc00276620..',
  '..0ccbb0..009984444211127777760.',
  '..0cc33000009983444433277665060.',
  '..0c333330098983344332676666650.',
  '.003133332998888333330000000000.',
  '00333333128888888233388cc88cc80.',
  'cc333113321008888822288bb88bb8..',
  '0b33113132209988876ee888888888..',
  '033333332220998076fff555cc55cc..',
  '03113332122080006dddd755555555..',
  '03333322112000006eeee777666000..',
  '033331222120..06ffffe7766665c00.',
  '002312221120..06dddddd66665bcc00',
  '0c3211111120..05eee7eeee55bcccc0',
  '0b2212111250..00577776ef005bcc00',
  '066211111250...0677776d50000bc0.',
  '666521122550...0077766600..0000.',
  '655502255500....066666600.......',
  '000066665cc0....006666550000....',
  '...066665cc0.....0777665ccc0....',
  '...066655cc0.....0776665cc00....',
  '...000550000.....0066555bb0.....',
];

// WIND-UP before the breath. The whole near arm is cocked: the claws have
// climbed to rows 18-20, level with the jaw instead of swinging at the hip, and
// the elbow has folded back over the plastron. He braces — the feet plant three
// columns wider than in either walk frame.
const BOWSER_ARM_UP = [
  '.................0ccb0..0ccb0...',
  '................00ccb0.00ccb0...',
  '.............0000cccb0.0cccb0...',
  '............00800cccb000cccb0...',
  '............0998ccbbb00ccbbb0...',
  '..........000098cc44444443bb0...',
  '..........089999b444444444300...',
  '..000.....00999944444444443300..',
  '..0b00...000899444111111243320..',
  '..0cb00..0999994441ccc00422220..',
  '..0ccb00.00899844441cc00276620..',
  '..0ccbb0..009984444211127777760.',
  '..0cc33000009983444433277665060.',
  '..0c333330098983344332676666550.',
  '.003133332998888333332677765c50.',
  '00333333128888888233327055555550',
  'cc3331133210088888222265cc55cc50',
  '0b33113132209988876ee655bb66bb00',
  '033333332220998076fffee766cbbb0.',
  '03113332122080006dddd6766655b00.',
  '03333322112000006eee6666665000..',
  '033331222120..06fffe56665000....',
  '002312221120..06ddddd55500......',
  '0c3211111120..05eee7eeee0.......',
  '0b2212111250..00577776ef0.......',
  '066211111250...0677776d50.......',
  '666521122550...0077766600.......',
  '655502255500....066666600.......',
  '000066665cc0....006666550000....',
  '...066665cc0.....0777665ccc0....',
  '...066655cc0.....0776665cc00....',
  '...000550000.....0066555bb0.....',
];

// AIRBORNE — his signature SMB1 hop. Both legs fold up under the shell, the
// soles come off row 30 entirely, and the last two rows of the frame hold
// nothing at all, so he is unmistakably off the bridge.
const BOWSER_HOP = [
  '.................0ccb0..0ccb0...',
  '................00ccb0.00ccb0...',
  '.............0000cccb0.0cccb0...',
  '............00800cccb000cccb0...',
  '............0998ccbbb00ccbbb0...',
  '..........000098cc44444443bb0...',
  '..........089999b444444444300...',
  '..000.....00999944444444443300..',
  '..0b00...000899444111111243320..',
  '..0cb00..0999994441ccc00422220..',
  '..0ccb00.00899844441cc00276620..',
  '..0ccbb0..009984444211127777760.',
  '..0cc33000009983444433277665060.',
  '..0c333330098983344332676666650.',
  '.003133332998888333332677766550.',
  '0033333312888888823332705555555.',
  'cc3331133210088888222265cc55cc5.',
  '0b33113132209988876ee655bb66bb..',
  '033333332220998076fffee0000000..',
  '03113332122080006dddd7776000....',
  '03333322112000006eeee777666000..',
  '033331222120..06ffffe7766665c00.',
  '002312221120..06dddddd66665bcc00',
  '0c3211111120..05ee7776ee55bcccc0',
  '0b2212111250..0057777766005bcc00',
  '066211111250...0677766666000bc0.',
  '666521122c50...0066667776ccc000.',
  '65556225bcc0....006667665ccb0...',
  '00056555bcc0.....00056665bc00...',
  '..0005555000.......000000000....',
  '....000000......................',
  '................................',
];

// BLOWN OFF THE BRIDGE. The figure is SHEARED, two columns of rake applied in
// steps down the body — skull back 2, jaw and mane back 1, hips none — so the
// body axis leans instead of standing plumb. Eyes screwed shut behind a bone
// lash line, jaw wrenched open, both legs kicked clear of the baseline.
const BOWSER_FALLING = [
  '.................00000..00000...',
  '................00ccb0.00ccb0...',
  '................0cccb0.0cccb0...',
  '.............0000cccb000cccb0...',
  '............0080ccccb00ccccb0...',
  '............0990ccbbb00ccbbb0...',
  '..........00008ccb44444443bb0...',
  '..000.....0990988444444444300...',
  '..0b00....08999944444444443300..',
  '..0cb00..000899444111111243320..',
  '..0ccb00.099999444111111433320..',
  '..0ccbb0.089998444422223222220..',
  '..0cc3300008998444444432777776..',
  '..0c333330009983444433277775060.',
  '.003133333099983344332677666650.',
  '0033333312998988333330000000000.',
  'cc333113299988888222288cc88cc80.',
  '0b33113131100888876ee88bb88bb80.',
  '033333332220998876fff888888888..',
  '03113332122099886dddd555cc55cc..',
  '03333322112098006eeee755555555..',
  '0333312221200006ffffe7766665c00.',
  '002312221120..06dddddd66665bcc00',
  '0c3211111120..05eee7eeee55bcccc0',
  '0b2212111250..005777766e005bcc00',
  '066211111250...0677776665000bc0.',
  '666521122550...0077766666500000.',
  '6555522cb500....06666677665c00..',
  '006655bc000.....0006677665ccc0..',
  '.00055000.........00066665ccc0..',
  '...0000.............0005555000..',
  '......................000000....',
];

export const BOWSER = {
  walk: new Anim(
    [
      makeSprite(BOWSER_WALK_A, BOWSER_PAL, { name: 'bowser.walkA' }),
      makeSprite(BOWSER_WALK_B, BOWSER_PAL, { name: 'bowser.walkB' }),
    ],
    [10, 14]
  ),
  mouthOpen: makeSprite(BOWSER_MOUTH_OPEN, BOWSER_PAL, { name: 'bowser.mouthOpen' }),
  hop: makeSprite(BOWSER_HOP, BOWSER_PAL, { name: 'bowser.hop' }),
  armUp: makeSprite(BOWSER_ARM_UP, BOWSER_PAL, { name: 'bowser.armUp' }),
  falling: makeSprite(BOWSER_FALLING, BOWSER_PAL, { name: 'bowser.falling' }),
};

// ---------------------------------------------------------------------------
// BOWSER'S FLAME — 24x16 stretched jet with a white-hot core.
//   0 ember outline  1 deep red   2 red    3 orange
//   4 amber          5 cream      6 white core
// ---------------------------------------------------------------------------
const FLAME_PAL = [
  '#3a0f02', '#9f2000', '#e03b10', '#ff7b1c',
  '#ffc12a', '#ffe9a0', '#ffffff',
];

// NOT a fireball. The white core is a short horizontal BAR at rows 5-8 — about
// a tenth of the ink — and the mass is SHEARED: the upper edge throws two licks
// out to the right margin while the lower edge stops eight columns short, so
// the jet tapers down-and-back the way a blown flame does. The trailing licks
// are amber and orange (hot flame carrying on past the body), never the dark
// reds, which are held for the last pixel before the outline.
const FLAME_JET_A = [
  '......0330..............',
  '....03444430............',
  '..034555544330..........',
  '.0345555554433344433320.',
  '034555555554443344433210',
  '03456666666655443320....',
  '035566666666554420......',
  '03556666666655444433210.',
  '0345666666655443334320..',
  '03455555544433220.......',
  '.034455444333344310.....',
  '.03344443332220.........',
  '..0333332220............',
  '...0233220..............',
  '.....0220...............',
  '........................',
];

// A different MOMENT, not a different taper: the core surges a column forward,
// the middle lick whips out to the margin while the upper one retracts, a new
// lick opens underneath, and an ember tears loose and floats clear of the body.
const FLAME_JET_B = [
  '.......0330.............',
  '.....03444430...........',
  '...034555544330.........',
  '.0345555554443332210....',
  '0345555555444333210.....',
  '034556666666654433220...',
  '035566666666554443332210',
  '03556666666655444433220.',
  '03456666666554433220....',
  '034555555444333220......',
  '.03445544433334443320...',
  '.0334444333332220.......',
  '..03333322220......0330.',
  '....0233220........0220.',
  '......0220..........00..',
  '........................',
];

export const BOWSER_FLAME = {
  jet: new Anim(
    [
      makeSprite(FLAME_JET_A, FLAME_PAL, { name: 'flame.jetA' }),
      makeSprite(FLAME_JET_B, FLAME_PAL, { name: 'flame.jetB' }),
    ],
    [4, 4]
  ),
};

// ---------------------------------------------------------------------------
// TOAD — 16x24.
//   0 outline     1 cap shadow  2 cap mid    3 cap lit
//   4 spot dark   5 spot mid    6 spot lit   7 skin shadow
//   8 skin mid    9 skin lit    a vest dark  b vest mid
//   c vest lit    d pupil       e boot       f gold stud
// ---------------------------------------------------------------------------
// Slot d is a COOL near-black, forty units clear of the warm outline, so the
// pupils read as pupils and not as holes. Each eye is one pixel of it sitting
// against a pixel of slot 3 sclera on the outboard side.
const TOAD_PAL = [
  '#1a1008', '#c8b8a8', '#f0e8dc', '#ffffff',
  '#8f1f10', '#cc3a22', '#ff8b7f', '#b06a28',
  '#efa860', '#f8d5ac', '#131f7f', '#3050c8',
  '#a3b4ff', '#101c3c', '#6d3a10', '#e4e594',
];

const TOAD_IDLE_A = [
  '....00000000....',
  '...0333322220...',
  '..033365552220..',
  '.03336555542220.',
  '0333225544222110',
  '0365322222225510',
  '0655422222255440',
  '.05422222111540.',
  '.02211111111110.',
  '..000000000000..',
  '..08999999980...',
  '..093d999d390...',
  '..093d999d390...',
  '..08999899970...',
  '...089977980....',
  '...00ab99ba00...',
  '.080cc333bba080.',
  '.080cf333fba080.',
  '.070c03330ba070.',
  '.000cbb33bba000.',
  '...0abbbbba0....',
  '...0330.0330....',
  '..0eee0.0eee0...',
  '.0eeee0.0eeee0..',
];

// The breath does NOT move the sprite. The cap is pinned at rows 0-9 and the
// boots at rows 20-23 — identical to A, pixel for pixel. Only the head sinks a
// row into the cap and the waistcoat loses a row to absorb it, so the feet
// never pop and the outline never translates.
const TOAD_IDLE_B = [
  '....00000000....',
  '...0333322220...',
  '..033365552220..',
  '.03336555542220.',
  '0333225544222110',
  '0365322222225510',
  '0655422222255440',
  '.05422222111540.',
  '.02211111111110.',
  '..000000000000..',
  '..000000000000..',
  '..08999999980...',
  '..093d999d390...',
  '..093d999d390...',
  '..08999899970...',
  '...089977980....',
  '...00ab99ba00...',
  '.080cc333bba080.',
  '.070c03330ba070.',
  '.000cbb33bba000.',
  '...0abbbbba0....',
  '...0330.0330....',
  '..0eee0.0eee0...',
  '.0eeee0.0eeee0..',
];

const TOAD_BLINK = [
  '....00000000....',
  '...0333322220...',
  '..033365552220..',
  '.03336555542220.',
  '0333225544222110',
  '0365322222225510',
  '0655422222255440',
  '.05422222111540.',
  '.02211111111110.',
  '..000000000000..',
  '..08999999980...',
  '..09999999990...',
  '..09779997790...',
  '..08799899770...',
  '...089977980....',
  '...00ab99ba00...',
  '.080cc333bba080.',
  '.080cf333fba080.',
  '.070c03330ba070.',
  '.000cbb33bba000.',
  '...0abbbbba0....',
  '...0330.0330....',
  '..0eee0.0eee0...',
  '.0eeee0.0eeee0..',
];

export const TOAD = {
  idle: new Anim(
    [
      makeSprite(TOAD_IDLE_A, TOAD_PAL, { name: 'toad.idleA' }),
      makeSprite(TOAD_IDLE_B, TOAD_PAL, { name: 'toad.idleB' }),
      makeSprite(TOAD_IDLE_A, TOAD_PAL, { name: 'toad.idleA2' }),
      makeSprite(TOAD_BLINK, TOAD_PAL, { name: 'toad.blink' }),
    ],
    [30, 18, 30, 7]
  ),
};

// ---------------------------------------------------------------------------
// PRINCESS TOADSTOOL — 16x24.
//   0 outline      1 dress shadow  2 dress mid   3 dress lit
//   4 dress spec   5 hair shadow   6 hair mid    7 hair lit
//   8 glove lit    9 glove shadow  a skin shadow b skin mid
//   c skin lit     d sapphire      e crown gold  f hair specular
// ---------------------------------------------------------------------------
// Slot 7 is pushed to a saturated blonde so it is nowhere near skin-lit and the
// hair stops fusing into the temples. Slot 9 leaves neutral grey for a warm
// pink-grey that belongs to the dress family, so the gloves stop reading as
// masonry. The mouth is ONE pixel — a 2x2 slab on a six-pixel face is a wound.
const PEACH_PAL = [
  '#1a1008', '#8c1f4e', '#c03470', '#ff83c0',
  '#ffcce5', '#9c6410', '#d0a418', '#ffe94f',
  '#ffffff', '#d8b0c8', '#c9793a', '#f0a868',
  '#f8d5ac', '#3ec2cd', '#ffd23f', '#fffbd0',
];

const PEACH_IDLE_A = [
  '....0e0e0e0.....',
  '...0eeeeeee0....',
  '...0ede2ede0....',
  '..006ff777650...',
  '..06ff6666550...',
  '.06f7766666550..',
  '.0760caccac0650.',
  '.0760c0cc0c0650.',
  '.0760cbcabc0650.',
  '.0760cbb1bc0650.',
  '..0760aaaa0650..',
  '..07660aa06550..',
  '.076ab3322ba550.',
  '0760893dd2890550',
  '0760893221890550',
  '0060893322890500',
  '....04432210....',
  '...0444332110...',
  '...0443322110...',
  '..034443322110..',
  '..034433222110..',
  '.02344433221110.',
  '0223444332211110',
  '.00000000000000.',
];

// The breath does NOT move the sprite. The crown at rows 0-2 and the whole
// skirt from row 17 down are pinned identical to A; only the bodice drops a
// row as the ribs fill, and the waist gives up a row to pay for it. Nothing
// translates, so the hem never pops.
const PEACH_IDLE_B = [
  '....0e0e0e0.....',
  '...0eeeeeee0....',
  '...0ede2ede0....',
  '..006ff777650...',
  '..06ff6666550...',
  '.06f7766666550..',
  '.0760caccac0650.',
  '.0760c0cc0c0650.',
  '.0760cbcabc0650.',
  '.0760cbb1bc0650.',
  '..0760aaaa0650..',
  '..07660aa06550..',
  '..07660aa06550..',
  '.076ab3322ba550.',
  '0760893dd2890550',
  '0760893221890550',
  '0060893322890500',
  '....04432210....',
  '...0443322110...',
  '..034443322110..',
  '..034433222110..',
  '.02344433221110.',
  '0223444332211110',
  '.00000000000000.',
];

const PEACH_BLINK = [
  '....0e0e0e0.....',
  '...0eeeeeee0....',
  '...0ede2ede0....',
  '..006ff777650...',
  '..06ff6666550...',
  '.06f7766666550..',
  '.0760caaaac0650.',
  '.0760aaccaa0650.',
  '.0760cbbabb0650.',
  '.0760cb11bc0650.',
  '..0760aaaa0650..',
  '..07660aa06550..',
  '.076ab3322ba550.',
  '0760893dd2890550',
  '0760893221890550',
  '0060893322890500',
  '....04432210....',
  '...0444332110...',
  '...0443322110...',
  '..034443322110..',
  '..034433222110..',
  '.02344433221110.',
  '0223444332211110',
  '.00000000000000.',
];

export const PEACH = {
  idle: new Anim(
    [
      makeSprite(PEACH_IDLE_A, PEACH_PAL, { name: 'peach.idleA' }),
      makeSprite(PEACH_IDLE_B, PEACH_PAL, { name: 'peach.idleB' }),
      makeSprite(PEACH_IDLE_A, PEACH_PAL, { name: 'peach.idleA2' }),
      makeSprite(PEACH_BLINK, PEACH_PAL, { name: 'peach.blink' }),
    ],
    [34, 20, 34, 6]
  ),
};
