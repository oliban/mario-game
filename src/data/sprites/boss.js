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
//     all at least 2x2, lit slot c over shadow slot b, so nothing scatters into
//     speckle when the sprite is drawn at 1x.
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
// SMB1's Bowser is a GREEN creature with an ORANGE mane and a tan plated
// belly: slots 1-4 are the deep pine carapace, 5-7 the bright grass hide,
// 8-a the hair, d-f the plastron scutes.
//
// The two green ramps are deliberately disjoint. Carapace 1-4 climbs
// 0b4020 -> 4ecb85 in four even steps, and no adjacent pair inside slots 0-4
// is closer than 55 RGB units, so the shadow side of the shell cannot fuse
// into the outline the way a near-black pair would. Hide 5-7 is a separate,
// much yellower ramp, and slot 7 covers roughly a quarter of the hide — it
// runs the upper-left of the skull, the muzzle, the collar, the thigh tops
// and the shins, so the body reads as rounded mass rather than a flat fill
// with a shadow edge.

const BOWSER_PAL = [
  '#150f09', '#08421b', '#137833', '#2ba851',
  '#6bd965', '#9c3c04', '#dd7010', '#ff9c30',
  '#7a0f00', '#c02000', '#f04a08', '#b2aa98',
  '#fff6e2', '#c07a20', '#ffd06a', '#fff0b0',
];

// Composition, authored facing RIGHT (the renderer mirrors him):
//   * the spiked carapace is the big mass BEHIND him, cols 1-16, four bone
//     spikes welded to its rim — two off the crown, two off the back edge —
//     every one of them clearing the dome outline by three columns so the
//     silhouette has teeth in it;
//   * the skull is thrust FORWARD past the chest, cols 17-31, so the muzzle
//     overhangs the belly and the head is the first thing that reads;
//   * the plastron is a banded tan slab, cols 18-29, four dark scute seams
//     across it, wedged between the shell and the near arm;
//   * two thick legs and a counter-swinging tail hang off the bottom, and the
//     gap between them is genuine background, not a filled skirt.

const BOWSER_WALK_A = [
  '....................0000..0000..',
  '...................00cc0.00cc0..',
  '..............000000ccb000ccb00.',
  '.............00aa990ccbb00ccbb00',
  '............00aa9933ccbb22ccbb20',
  '...........00aa99043332222222210',
  '..........00aa998031111111111110',
  '....0000..0aa9988021cc001cc00110',
  '....0cc0000aa9988021cc001cc00110',
  '...00cb00cc0aa998022117766666660',
  '...0ccbb0cbaa9988002177666656660',
  '...0ccbbccbba9998002566666666650',
  '...00444ccba99988002500cc000cc00',
  '000044444333a9998000566cb666cb0.',
  '0ccb444322222a99988005555555550.',
  '0ccb4333333331a9998dd00000000d00',
  '0bbb32333332221a999feeeeeee66650',
  '000423333322222110ffeeeeeee66650',
  '000323333222222110ddddddddccccc0',
  '0ccb23322222221110ffeeeeeebbbbb0',
  '0ccb23222222211110ffeeeeeee66650',
  '0bbb21222221111110ddddddddd66650',
  '000221122211111110ffeeeeeed66650',
  '..0022211111111110ffeeeeeeccdcc0',
  '..0002211111111100dd666665bb0bb0',
  '.00665111111115000ff766666550000',
  '0076650076666550.000076666550...',
  '07665500766665500...0766665500..',
  '056650007666665500.007666665500.',
  '005500076666665cc00076666665cc0.',
  '.00000566666655cb00566666655cb0.',
  '.....00000000000000000000000000.',
];

const BOWSER_WALK_B = [
  '................................',
  '...................0000..0000...',
  '..................00cc0.00cc0...',
  '.............000000ccb000ccb00..',
  '............00aa990ccbb00ccbb00.',
  '...........00aa9933ccbb22ccbb20.',
  '..........00aa99043332222222210.',
  '.........00aa998031111111111110.',
  '....0000.0aa9988021cc001cc00110.',
  '....0cc000aa9988021cc001cc00110.',
  '...00cb00ccaa998022117766666660.',
  '...0ccbb0caa9988002177666656660.',
  '...0ccbbccba9998002566666666650.',
  '...00444cca99988002500cc000cc00.',
  '00004444433a9998000566cb666cb0..',
  '0ccb44432222a999880055555555500.',
  '0ccb433333333a9998dd00000000dd0.',
  '0bbb3233333222a999ffeeeeee66650.',
  '000423333322222110ffeeeeee66650.',
  '000323333222222110dddddddccccc0.',
  '0ccb23322222221110ffeeeeebbbbb0.',
  '0ccb23222222211110ffeeeeee66650.',
  '0bbb21222221111110dddddddd66650.',
  '000221122211111110ffeeeeee66650.',
  '007622211111111110f666665ccdcc0.',
  '076652211111111150d766666bbdbb0.',
  '006650111111116650ff76666550000.',
  '.00550000766666cc000766665500...',
  '..0000.056666655c0007666665500..',
  '.......00000000000076666665cc0..',
  '.................0566666655cb0..',
  '.................0000000000000..',
];

const BOWSER_MOUTH_OPEN = [
  '....................0000..0000..',
  '...................00cc0.00cc0..',
  '..............000000ccb000ccb00.',
  '.............00aa990ccbb00ccbb00',
  '............00aa9933ccbb22ccbb20',
  '...........00aa99043332222222210',
  '..........00aa998031111111111110',
  '....0000..0aa9988021cc001cc00110',
  '....0cc0000aa9988021cc001cc00110',
  '...00cb00cc0aa998022117766666660',
  '...0ccbb0cbaa9988002177666656660',
  '...0ccbbccbba9998002566666666665',
  '...00444ccba99988002588cc888cc85',
  '000044444333a9998000588cb888cb85',
  '0ccb444322222a999000588888888880',
  '0ccb4333333331a9998d5cb888cb8500',
  '0bbb32333332221a999f56666666650.',
  '000423333322222110ffe55555555d0.',
  '000323333222222110dddd000000dd00',
  '0ccb23322222221110ffeeeeeee66650',
  '0ccb23222222211110ffeeeeeeccccc0',
  '0bbb21222221111110ddddddddbbbbb0',
  '000221122211111110ffeeeeeed66650',
  '..0022211111111110ffeeeeeed66650',
  '..0002211111111100dd666665cc0cc0',
  '.00665111111115000ff766666bb0bb0',
  '0076650076666550.000076666550000',
  '07665500766665500...0766665500..',
  '056650007666665500.007666665500.',
  '005500076666665cc00076666665cc0.',
  '.00000566666655cb00566666655cb0.',
  '.....00000000000000000000000000.',
];

const BOWSER_ARM_UP = [
  '....................0000..0000..',
  '...................00cc0.00cc0..',
  '..............000000ccb000ccb00.',
  '.............00aa990ccbb00ccbb00',
  '............00aa9933ccbb22ccbb20',
  '...........00aa99043332222222210',
  '..........00aa998031111111111110',
  '....0000..0aa9988021cc001cc00110',
  '....0cc0000aa9988021cc001cc00110',
  '...00cb00cc0aa998022117766666660',
  '...0ccbb0cbaa9988002177666656660',
  '...0ccbbccbba9998002566666666650',
  '...00444ccba99988002500cc000cc00',
  '000044444333a9998000566cb666cb0.',
  '0ccb444322222a999880055555555500',
  '0ccb4333333331a9998dd00000cc0cc0',
  '0bbb32333332221a999feeeeeebbdbb0',
  '000423333322222110ffeeeeeeccccc0',
  '000323333222222110ddddddddbbbbb0',
  '0ccb23322222221110ffeeeeeee66650',
  '0ccb23222222211110ffeeeeeee66650',
  '0bbb21222221111110ddddddddd66650',
  '000221122211111110ffeeeeeed66650',
  '..0022211111111110ffeeeeeeddd000',
  '..0002211111111100ddd666665500..',
  '.00665111111110000ffe766666550..',
  '007665076666550..0000076666550..',
  '0766550766665500.....0766665500.',
  '05665007666665500...007666665500',
  '00550076666665cc0..0076666665cc0',
  '.0000566666655cb0..0566666655cb0',
  '....0000000000000..0000000000000',
];

const BOWSER_HOP = [
  '...................00cc0.00cc0..',
  '..............000000ccb000ccb00.',
  '.............00aa990ccbb00ccbb00',
  '............00aa9933ccbb22ccbb20',
  '...........00aa99043332222222210',
  '..........00aa998031111111111110',
  '....0000..0aa9988021cc001cc00110',
  '....0cc0000aa9988021cc001cc00110',
  '...00cb00cc0aa998022117766666660',
  '...0ccbb0cbaa9988002177666656660',
  '...0ccbbccbba9998002566666666650',
  '...00444ccba99988002500cc000cc00',
  '000044444333a9998000566cb666cb0.',
  '0ccb444322222a99988005555555550.',
  '0ccb4333333331a9998dd00000000d00',
  '0bbb32333332221a999feeeeeee66650',
  '000423333322222110ffeeeeeee66650',
  '000323333222222110ddddddddccccc0',
  '0ccb23322222221110ffeeeeeebbbbb0',
  '0ccb23222222211110ffeeeeeee66650',
  '0bbb21222221111110ddddddddd66650',
  '000221122211111110ffeeeeeed66650',
  '.00622211111111110f6666655ccdcc0',
  '007662211111111100d7666665bb0bb0',
  '076655111111115500ff766665500000',
  '0066500007666665000076666650....',
  '.0055000766666cc000766666cc0....',
  '..0000056666655c0056666655c0....',
  '......0000000000000000000000....',
  '................................',
  '................................',
  '................................',
];

const BOWSER_FALLING = [
  '..................0000..0000....',
  '.................00cc0.00cc0....',
  '............000000ccb000ccb00...',
  '...........00aa990ccbb00ccbb00..',
  '..........00aa9933ccbb22ccbb20..',
  '.........00aa99043332222222210..',
  '........00aa998031111111111110..',
  '..0000..0aa9988021111111111110..',
  '..0cc0000aa99880211100110011100.',
  '..00cb00cc0aa998022117766666660.',
  '..0ccbb0cbaa99880021776666566600',
  '..0ccbbccbba99980025666666666650',
  '..00444ccba99988002588cc888cc850',
  '00044444333a9998000588cb888cb850',
  '0ccb444322222a999000588888888880',
  '0ccb4333333331a9998d5cb888cc8cc0',
  '0bbb32333332221a999f566666bb6bb0',
  '000423333322222110ffe55555ccccc0',
  '000323333222222110dddd0000bbbbb0',
  '0ccb23322222221110ffeeeeeee66650',
  '00ccb23222222211110ffeeeeeee6665',
  '.0bbb21222221111110ddddddddd6665',
  '.000221122211111110ffeeeeeed6665',
  '...0022211111111110ff6666655dd00',
  '..00662211111111100dd7666665500.',
  '.007665111111115000ffe76666550..',
  '.0766550076666650.000076666650..',
  '.0066500766666cc0..00766666cc0..',
  '..0055056666655c0..056666655c0..',
  '...00000000000000..00000000000..',
  '................................',
  '................................',
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
