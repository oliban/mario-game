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
  '#1a1008', '#0b4020', '#17703e', '#2b9a5c',
  '#4ecb85', '#3f8f14', '#7bd032', '#bcf074',
  '#8a1c00', '#d8460c', '#ff7a2c', '#b8b8b8',
  '#ffffff', '#7a5a0c', '#c8901c', '#f0c860',
];

// PASSING POSE — the master drawing; the other five frames are edits of it.
// Weight rolled forward over the lead foot, both feet planted in a wide stride,
// tail nub hooked out at row 27, near claw hanging at the hip.
//
// The carapace is NOT a smooth egg. Four bone spikes are welded into its rim
// and project past it — one up off the crown at rows 12-13, then three
// left-pointing wedges whose tips reach col 0 at rows 17, 22 and 25 — so the
// connected outline of slots 1-4 has protrusions and the back reads as spiked
// in pure silhouette. The mane is jagged for the same reason: its left edge
// steps 13,11,12,9,10,7,8,6 down the rows, three tufts with notches between
// them, instead of a smooth lozenge.
const BOWSER_WALK_A = [
  '....................0cc0..0cc0..',
  '...................0ccb0.0ccb0..',
  '.............0a0..0cccb0.0ccbb0.',
  '...........0aa99..0cccbb00cccbb0',
  '............0a99980cccbb00cccbb0',
  '.........0aa9a99980bbb5776bbb50.',
  '..........0a99998807775555666650',
  '.......0aaa99999880770cc00666650',
  '........0aa99998880770cc00666560',
  '......0aaaa999888807605555776050',
  '.......0aa9998888805666657755550',
  '.......0a9998888880666660cc0cc00',
  '...0cb0.09998888880666660bb0bb0.',
  '..0ccb0.098888888055776666650...',
  '..023443322221115577776666656650',
  '.02344433222221156777766655ccb0.',
  '..0c44433322221157dfffeeeed5cbb0',
  '0ccc44333322221157deeeedddd5bb0.',
  '.0bb43333222221156dffeeeeed57750',
  '..0233332222221156deeeeeddd57750',
  '..0233322222211155ddddddddd57650',
  '..0c23322222211155dffeeeeed57650',
  '0ccc22222222111155deeeeeddd57650',
  '.0bb22222211111155ddddddddd5cc0.',
  '..0122222111111155dffeeeedd5bb0.',
  '..0cc1221111111155deeeeddd56650.',
  '.0bb11111111110555dd577666650...',
  '066505777650......05777666650...',
  '...05776650........057766650....',
  '...05766650........057666650....',
  '..0577666cc0......05776666cc0...',
  '...000000bb0.......0000000bb0...',
];

// CONTACT POSE — a different drawing, not frame A nudged. Realigning this
// frame against A by a row makes the difference WORSE, which is the test:
// nothing here is a translation.
//   * The rear foot has left the ground. Its sole is at row 30 against the
//     lead foot's row 31, and row 31 under it is empty.
//   * The legs have swapped roles: the trailing leg has swung forward under
//     the hips, the lead leg is planted straight and vertical.
//   * The carapace has rocked, so the three side spikes sit one row lower
//     than in A and the specular crescent slides with them.
//   * The near arm swings back — cuff at rows 16-17 instead of 15-16, claw at
//     24-25 instead of 23-24.
//   * The brow drops over the eye (row 7), which is the only head change.
const BOWSER_WALK_B = [
  '....................0cc0..0cc0..',
  '...................0ccb0.0ccb0..',
  '.............0a0..0cccb0.0ccbb0.',
  '...........0aa99..0cccbb00cccbb0',
  '............0a99980cccbb00cccbb0',
  '.........0aa9a99980bbb5776bbb50.',
  '..........0a99998807775555666650',
  '.......0aaa999998807705500666650',
  '........0aa99998880770cc00666560',
  '......0aaaa999888807605555776050',
  '.......0aa9998888805666657755550',
  '.......0a9998888880666660cc0cc00',
  '...0cb0.09998888880666660bb0bb0.',
  '..0ccb0.098888888055776666650...',
  '..023443322221115577776666656650',
  '.023444332222211567777666556650.',
  '..0244433322221157dfffeeeed5ccb0',
  '..0c44333322221157deeeedddd5cbb0',
  '0ccc43333222221156dffeeeeed5bb0.',
  '.0bb33332222221156deeeeeddd57750',
  '..0233322222211155ddddddddd57650',
  '..0223322222211155dffeeeeed57650',
  '..0c22222222111155deeeeeddd57650',
  '0ccc22222211111155ddddddddd56650',
  '.0bb22222111111155dffeeeedd5cc0.',
  '..0111221111111155deeeeddd55bb0.',
  '..0111111111110555dd577666650...',
  '06650.057766650...0577666650....',
  '......05776650.....05776650.....',
  '......0cc6650......05666650.....',
  '.......00bb0.....0577666cc0.....',
  '.................000000bb0......',
];

// The fire-breathing roar. The change is ON THE FACE, at the jaw line, not
// somewhere down the chest.
//   rows 11-13  upper palate (slot 8 throat) with two 2x2 fangs hanging off it
//   row  14     the void — cols 26-31 go to BACKGROUND, sky through the gape
//   rows 15-16  the dropped lower jaw, its own two fangs pointing back up
//   rows 17-18  the chin, ending eight columns short of where the muzzle ends
//               in the walk, so the outer silhouette is genuinely different
// The near arm drops to rows 19-24 to clear the swinging jaw as he rears.
const BOWSER_MOUTH_OPEN = [
  '....................0cc0..0cc0..',
  '...................0ccb0.0ccb0..',
  '.............0a0..0cccb0.0ccbb0.',
  '...........0aa99..0cccbb00cccbb0',
  '............0a99980cccbb00cccbb0',
  '.........0aa9a99980bbb5776bbb50.',
  '..........0a99998807775555666650',
  '.......0aaa99999880770cc00666650',
  '........0aa99998880770cc00666560',
  '......0aaaa999888807605555776050',
  '.......0aa9998888805666657755550',
  '.......0a99988888806666608888880',
  '...0cb0.09998888880666608cc88cc0',
  '..0ccb0.09888888805660888bb00bb0',
  '..0234433222211155660899900..00.',
  '.0234443322222115660cc0cc0......',
  '..0c4443332222115660bb6bb0......',
  '0ccc44333322221157d0666650......',
  '.0bb43333222221157df056650......',
  '..0233332222221156dff0000.0ccb0.',
  '..0233322222211156deeed50.0cbb0.',
  '..0c23322222211155ddddd50.06650.',
  '0ccc22222222111155dffeeed506650.',
  '.0bb22222211111155deeeedd50cc0..',
  '..0122222111111155ddddddd50bb0..',
  '..0cc1221111111155dffeedd56650..',
  '.0bb11111111110555dd577666650...',
  '066505777650......05777666650...',
  '...05776650........057766650....',
  '...05766650........057666650....',
  '..0577666cc0......05776666cc0...',
  '...000000bb0.......0000000bb0...',
];

// Wind-up before the breath. The whole near arm is cocked: the claw is up at
// rows 13-14 clear of the jaw line, the spiked cuff has climbed to rows 15-16,
// and the forearm now runs down the OUTSIDE of the plastron so the scute block
// reads uninterrupted. He braces for it — both feet plant wider than the walk
// and the knees drop a row.
const BOWSER_ARM_UP = [
  '....................0cc0..0cc0..',
  '...................0ccb0.0ccb0..',
  '.............0a0..0cccb0.0ccbb0.',
  '...........0aa99..0cccbb00cccbb0',
  '............0a99980cccbb00cccbb0',
  '.........0aa9a99980bbb5776bbb50.',
  '..........0a99998807775555666650',
  '.......0aaa99999880770cc00666650',
  '........0aa99998880770cc00666560',
  '......0aaaa999888807605555776050',
  '.......0aa9998888805666657755550',
  '.......0a9998888880666660cc0cc00',
  '...0cb0.09998888880666660bb0bb0.',
  '..0ccb0.098888888055776666650cc0',
  '..023443322221115577776666650cb0',
  '.023444332222211567777666550ccb0',
  '..0c44433322221157dfffeeeed0cbb0',
  '0ccc44333322221157deeeedddd06650',
  '.0bb43333222221156dffeeeeed07650',
  '..0233332222221156deeeeeddd57750',
  '..0233322222211155ddddddddd57650',
  '..0c23322222211155dffeeeeed57650',
  '0ccc22222222111155deeeeeddd57650',
  '.0bb22222211111155ddddddddd5cc0.',
  '..0122222111111155dffeeeedd5bb0.',
  '..0cc1221111111155deeeeddd56650.',
  '.0bb11111111110555dd577666650...',
  '.06505776650......057766666650..',
  '...05776650........0577666650...',
  '...05666650........0566666650...',
  '..0577666cc0......05776666cc0...',
  '...000000bb0.......0000000bb0...',
];

// Airborne — his signature SMB1 hop. A whole plastron band is crushed out of
// the torso, both legs fold up under the shell so the claws sit at row 27
// instead of row 31, and the last three rows hold nothing at all, so he is
// unmistakably off the bridge.
const BOWSER_HOP = [
  '....................0cc0..0cc0..',
  '...................0ccb0.0ccb0..',
  '.............0a0..0cccb0.0ccbb0.',
  '...........0aa99..0cccbb00cccbb0',
  '............0a99980cccbb00cccbb0',
  '.........0aa9a99980bbb5776bbb50.',
  '..........0a99998807775555666650',
  '.......0aaa99999880770cc00666650',
  '........0aa99998880770cc00666560',
  '......0aaaa999888807605555776050',
  '.......0aa9998888805666657755550',
  '.......0a9998888880666660cc0cc00',
  '...0cb0.09998888880666660bb0bb0.',
  '..0ccb0.098888888055776666650...',
  '..023443322221115577776666656650',
  '.02344433222221156777766655ccb0.',
  '..0c44433322221157dfffeeeed5cbb0',
  '0ccc44333322221157deeeedddd5bb0.',
  '.0bb43333222221156dffeeeeed57750',
  '..0233332222221156deeeeeddd57750',
  '..0233322222211155ddddddddd57650',
  '..0c23322222211155dffeeeeed57650',
  '0ccc22222222111155deeeeeddd57650',
  '.0bb22222211111155ddddddddd5cc0.',
  '..0cc1221111111155deeeeddd56650.',
  '.0bb11111111110555dd577666650...',
  '....0577666650......0577666650..',
  '.....05766cc0.......05766cc0....',
  '......000bb0.........000bb0.....',
  '................................',
  '................................',
  '................................',
];

// Blown off the bridge. The figure is genuinely SHEARED, four columns of rake
// applied in steps down the body: skull rows 0-8 move back 4, the mane and jaw
// rows 9-13 move back 3 then 2, the carapace rows 14-19 move back 1, and the
// hips carry none. The body axis leans instead of standing plumb. The eyes are
// screwed shut behind a lash line at row 8, the jaw is wrenched open with the
// tongue out, and both legs kick clear of the baseline — row 31 is empty.
const BOWSER_FALLING = [
  '................0cc0..0cc0......',
  '...............0ccb0.0ccb0......',
  '.........0a0..0cccb0.0ccbb0.....',
  '.......0aa99..0cccbb00cccbb0....',
  '........0a99980cccbb00cccbb0....',
  '.....0aa9a99980bbb5776bbb50.....',
  '......0a99998807775555666650....',
  '...0aaa999998807755555666650....',
  '....0aa999988807700005666560....',
  '...0aaaa999888807605555776050...',
  '....0aa9998888805666657755550...',
  '.....0a99988888806666608888880..',
  '.0cb0.09998888880666660cc88cc0..',
  '0ccb0.09888888805509990bb00bb0..',
  '.023443322221115577776666656650.',
  '02344433222221156777766655ccb0..',
  '.0c44433322221157dfffeeeed5cbb0.',
  '0cc44333322221157deeeedddd5bb0..',
  '0bb43333222221156dffeeeeed57750.',
  '.0233332222221156deeeeeddd57750.',
  '..0233322222211155ddddddddd57650',
  '..0c23322222211155dffeeeeed57650',
  '0ccc22222222111155deeeeeddd57650',
  '.0bb22222211111155ddddddddd5cc0.',
  '..0122222111111155dffeeeedd5bb0.',
  '..0cc1221111111155deeeeddd56650.',
  '.0bb11111111110555dd577666650...',
  '05666500.0577650..0577666650....',
  '0cc6650...056650...056666650....',
  '0bb000....0566cc0..056666cc0....',
  '..........0000bbb0..00000bb0....',
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
