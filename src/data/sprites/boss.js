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
// Four materials, four disjoint hue families, so nothing fuses at 1x:
//   1-4  GREEN carapace and skull      5-7  ORANGE hide: muzzle, limbs, tail
//   8-a  RED mane                      d-f  TAN plastron scutes
//   b-c  BONE: horns, fangs, claws, carapace spikes
// Hide slot 6 (d4600c) and scute slot e (eeb03a) are the closest pair in the
// table and still sit 100 RGB units apart, so the belly plates never bleed
// into the arm or the thigh that overlap them. Slot 1 is a real green, not a
// near-black — the shell's rim ring is drawn in it and has to stay legibly
// green against slot 0 rather than dissolving into the outline.

const BOWSER_PAL = [
  '#150f09', '#06381a', '#0f6b2c', '#1c9440',
  '#46c95c', '#8ceb85', '#7a2600', '#d4600c',
  '#ff9024', '#7a1000', '#d92a00', '#ffd21e',
  '#b2aa98', '#fff6e2', '#8a5a12', '#e0b565',
];

// COMPOSITION, authored facing RIGHT (the renderer mirrors him). The test this
// is built to pass: fill every non-transparent pixel black and he must still be
// Bowser. So every one of these reads as a break in the outer contour, not as
// interior colour:
//   * the carapace is the mass BEHIND him, cols 4-16, ringed by a slot-1 rim
//     and quartered by scute seams. FOUR bone spikes are welded to that rim —
//     two off the crown at cols 3-5 and 9-11, two off the back edge at cols
//     1-3 — each clearing the dome by three columns, with three clear rows
//     between the back pair so the gap survives the outline;
//   * the two horns stand four columns apart on the skull, so the notch
//     between them is background even after the outline closes in;
//   * the skull runs cols 17-31 and the plastron only 17-27, so the muzzle
//     overhangs the belly and cols 30-31 under the jaw are open sky;
//   * the legs are ten columns each and land five columns apart — the crotch
//     is genuine background, not a filled skirt — and the tail clears the
//     rear foot by three more.
//
// The whole figure is outlined by dilation: nothing that touches sky is left
// without a slot-0 edge, and no enclosed pinhole is left unfilled.

// PASSING POSE. Weight is forward over the lead foot, both soles planted on
// row 30, tail hanging back and low, near claw swinging at the hip.
const BOWSER_WALK_A = [
  '.................0000...0000....',
  '.................0dd0...0dd0....',
  '................0ddc0...0dcd0...',
  '.............000dddcc000dddc0...',
  '............0a999dcc55444dcc50..',
  '............09999a905444450550..',
  '.......00...a99999900044000440..',
  '......0dd0.aa9999995bb44bb4440..',
  '.....0dddd0.09999995b044b04440..',
  '.....0cccccaa99099954433333330..',
  '......033332a990999544388888880.',
  '.....0322211aa99999544387777660.',
  '....0322211aaa99999544387777660.',
  '....03211112a099999544380000000.',
  '...033111221109999954438dd6dd60.',
  '.00d33222211a99999443300cd0dc0..',
  '0ddc3322211199999ffff0..........',
  '.00c3322211232fffffff0..........',
  '...03111111221feeeeee0..........',
  '....0322222111ffffffee0000000...',
  '....0322222111fffffee0.0777770..',
  '...03222222111feeeeee0.ddddd70..',
  '.00d3111111111fffffee0.cdddc60..',
  '0ddc3221111111fffeeee0..077660..',
  '.00c3211111110feeeeee0..0dddd0..',
  '...0210111110.000eeee0...cddc...',
  '.00870.08888800..088880000......',
  '08760..07777770..077777770......',
  '0000..087777760..0777777670.....',
  '.....0877766dd0...07766677dd0...',
  '....08776666cd0..087666666cd0...',
  '....00000000000..000000000000...',
];

// CONTACT POSE — a different drawing, not frame A slid sideways. No two parts
// carry the same offset, which is the only way to guarantee it is not a
// translation: the carapace ROCKS back and down (-1, +1) while the skull and
// mane only bob (0, +1) and the plastron does not move at all. Because the
// shell's shading is evaluated in screen space, the specular crescent slides
// across the carapace as it rocks instead of riding along with it. The legs
// have swapped roles — the trailing leg has swung forward and its sole has
// left the ground two rows early — and the tail has swung UP against them.
const BOWSER_WALK_B = [
  '................................',
  '....................0000..0000..',
  '...............000000cc0.00cc0..',
  '.............000aa90ccb000ccb00.',
  '............00aa9990ccbb00ccbb00',
  '...........00aa99933ccbb33ccbb30',
  '..........00aa999044333333322220',
  '..........0aa9998043111111112220',
  '.0000.....00aa999031cc01cc011220',
  '.0cc0..0000aa9998031c001c0011220',
  '.0cb00.0cc00aa999022111117766500',
  '.0ccb000cb0aa9998022177666666650',
  '.0ccb111ccb1aa999002566666655650',
  '00001444ccbaa9998005500cc000cc00',
  'ccb143333233aa999880566cb666cb50',
  'ccb1433332333aa99980d55555555000',
  'bbb14222222211aa999ffeeeeddd000.',
  '000133333332221aa99feeeee076650.',
  '..0143233322122100ddddddd076650.',
  '..0133232222122100ffeeee0ccccb0.',
  '000133222222121000ffeeee0bbbb50.',
  'ccb132111111121000ddddddd076650.',
  'ccb112222222211000ffeeeed076650.',
  'bbb12222212221000ffeeeee0cc0cc0.',
  '07661222212215500dddd6660bb0bb0.',
  '00550122212165500ffee7666655000.',
  '.0000011111666550000007666550...',
  '.....0007666666cc0...076665500..',
  '......056666665cb0..00766665500.',
  '......000000000000.007666666cc0.',
  '...................056666665cb0.',
  '...................000000000000.',
];

// THE ROAR. The change is on the JAW, not somewhere down the chest: the upper
// palate keeps its two fangs, the lower jaw drops four rows with two more
// pointing back up at them, and the throat between is slot 8 — the deep red of
// the mane, so the maw reads as flesh and not as a hole punched in the sprite.
// The chin now ends eight rows below where it does in the walk, so the outer
// silhouette is genuinely different. The near arm swings clear of it.
const BOWSER_MOUTH_OPEN = [
  '....................0000..0000..',
  '...............000000cc0.00cc0..',
  '.............000aa90ccb000ccb00.',
  '............00aa9990ccbb00ccbb00',
  '...........00aa99933ccbb33ccbb30',
  '..........00aa999044333333322220',
  '..........0aa9998043111111112220',
  '..0000....00aa999031cc01cc011220',
  '..0cc0..000aa9998031c001c0011220',
  '..0cb00.0cc0aa999022111117766500',
  '..0ccb000cbaa9998022177666666650',
  '..0ccb111ccbaa999002566666666665',
  '000001444ccaa9998005588cc888cc85',
  '0ccb14333323aa999805888cb888cb85',
  '0ccb143333233aa99985888888888880',
  '0bbb1422222221aa99905cb888cb8850',
  '000013333333222aa99f566666666500',
  '...014323332212210ffe55555550000',
  '...013323222212210dddddddd076650',
  '000013322222212100ffeeeee0ccccb0',
  '0ccb13211111112100ffeeeee0bbbb50',
  '0ccb11222222221100dddddddd076650',
  '0bbb12222212221000ffeeeedd076650',
  '00066122221221000ffeeeeed0cc0cc0',
  '00766512221210000ddddd6660bb0bb0',
  '07665501111155000ffeee7666655000',
  '076650007666550000000007666550..',
  '0055000076665500......076665500.',
  '.0000000766665500....00766665500',
  '.....007666666cc0...007666666cc0',
  '.....056666665cb0...056666665cb0',
  '.....000000000000...000000000000',
];

// WIND-UP before the breath. The whole near arm is cocked: claws up at rows
// 15-16 clear of the jaw line, the spiked cuff climbed to rows 17-18, so the
// plastron below reads uninterrupted. He braces — the feet plant wider than
// in either walk frame.
const BOWSER_ARM_UP = [
  '....................0000..0000..',
  '...............000000cc0.00cc0..',
  '.............000aa90ccb000ccb00.',
  '............00aa9990ccbb00ccbb00',
  '...........00aa99933ccbb33ccbb30',
  '..........00aa999044333333322220',
  '..........0aa9998043111111112220',
  '..0000....00aa999031cc01cc011220',
  '..0cc0..000aa9998031c001c0011220',
  '..0cb00.0cc0aa999022111117766500',
  '..0ccb000cbaa9998022177666666650',
  '..0ccb111ccbaa999002566666655650',
  '000001444ccaa9998005500cc000cc00',
  '0ccb14333323aa999880566cb666cb50',
  '0ccb143333233aa99980055555555000',
  '0bbb1422222221aa9990ddddd0cc0cc0',
  '000013333333222aa99ffeeee0bb0bb0',
  '...014323332212210ffeeeee0ccccb0',
  '...013323222212210ddddddd0bbbb50',
  '000013322222212100ffeeeeed076650',
  '0ccb13211111112100ffeeeeed076650',
  '0ccb11222222221100dddddddd076650',
  '0bbb12222212221000ffeeeedd076650',
  '00066122221221000ffeeeeeddd00000',
  '007665122212100.0dddddd66665500.',
  '07665571111150..0ffeeed76666550.',
  '07665007666550..000000007666550.',
  '005500076665500........076665500',
  '.000000766665500......0076666550',
  '....007666666cc0.....007666666cc',
  '....056666665cb0.....056666665cb',
  '....000000000000.....00000000000',
];

// AIRBORNE — his signature SMB1 hop. Both legs fold up under the shell, the
// soles come off row 30 entirely, the body rides a row higher, and the last
// three rows of the frame hold nothing at all, so he is unmistakably off the
// bridge.
const BOWSER_HOP = [
  '...............000000cc0.00cc0..',
  '.............000aa90ccb000ccb00.',
  '............00aa9990ccbb00ccbb00',
  '...........00aa99933ccbb33ccbb30',
  '..........00aa999044333333322220',
  '..........0aa9998043111111112220',
  '..0000....00aa999031cc01cc011220',
  '..0cc0..000aa9998031c001c0011220',
  '..0cb00.0cc0aa999022111117766500',
  '..0ccb000cbaa9998022177666666650',
  '..0ccb111ccbaa999002566666655650',
  '000001444ccaa9998005500cc000cc00',
  '0ccb14333323aa999880566cb666cb50',
  '0ccb143333233aa99980055555555000',
  '0bbb1422222221aa9990dddddddd0000',
  '000013333333222aa99ffeeeed076650',
  '...014323332212210ffeeeeed076650',
  '...013323222212210ddddddd0ccccb0',
  '000013322222212100ffeeeee0bbbb50',
  '0ccb13211111112100ffeeeeed076650',
  '0ccb11222222221100dddddddd076650',
  '0bbb12222212221000ffeeeed0cc0cc0',
  '00766122221221000ffeeeeed0bb0bb0',
  '07665512221210000dddd66665500000',
  '07665001111155000ffee76666550...',
  '005500007666550000000076665500..',
  '.0000000766665500...00766665500.',
  '.....007666666cc0..007666666cc0.',
  '.....056666665cb0..056666665cb0.',
  '.....000000000000..000000000000.',
  '................................',
  '................................',
];

// BLOWN OFF THE BRIDGE. The figure is SHEARED, three columns of rake applied
// in steps down the body — skull back 2, jaw and mane back 1, hips none — so
// the body axis leans instead of standing plumb. Eyes screwed shut behind a
// lash line, jaw wrenched open, both legs kicked clear of the baseline.
const BOWSER_FALLING = [
  '..................0000..0000....',
  '.............000000cc0.00cc0....',
  '...........000aa90ccb000ccb00...',
  '..........00aa9990ccbb00ccbb00..',
  '.........00aa99933ccbb33ccbb30..',
  '........00aa999044333333322220..',
  '........0aa9998043111111112220..',
  '0000....00aa999043111111112220..',
  '0cc00..00aa9998031100110011220..',
  '00cb00.0cc0aa999022111117766500.',
  '.0ccb000cbaa99980221776666666500',
  '.0ccb111ccbaa9990025666666666650',
  '00001444ccaa9998005588cc888cc850',
  'ccb14333323aa999805888cb888cb850',
  '0ccb143333233aa99985888888888880',
  '0bbb1422222221aa99905cb880cc0cc0',
  '000013333333222aa99f566660bb0bb0',
  '...014323332212210ffe55550ccccb0',
  '...013323222212210ddddddd0bbbb50',
  '.00013322222212100ffeeeeed076650',
  '.0ccb13211111112100ffeeeeed07665',
  '.0ccb11222222221100dddddddd07665',
  '.0bbb12222212221000ffeeeedd07665',
  '.00766122221221000ffeee666655000',
  '.07665512221210000ddddd76666550.',
  '.07665001111150000ffeeed76665500',
  '.0055000766665500000000076666550',
  '..000007666666cc0....007666666cc',
  '.....056666665cb0....056666665cb',
  '.....000000000000....00000000000',
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
