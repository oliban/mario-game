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
  '#46c95c', '#7a2600', '#d4600c', '#ff9024',
  '#7a1000', '#d92a00', '#ffd21e', '#b2aa98',
  '#fff6e2', '#8a5a12', '#c98f30', '#eeca7a',
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
  '...................0000.0000....',
  '.............0000.00cc0.0cc00...',
  '............00a90.0ccb0.0ccb0...',
  '............0aa9000cbb000cbb0...',
  '.......0000.0a998223443322110...',
  '......00cc0008999234433322210...',
  '......0cbbc8aa992341111112210...',
  '..000001111a89992331cccc12210...',
  '.00cbb11111aa9992331cc0012210...',
  '.0ccbb11443899992321cc0012210...',
  '.00bb1144439999922211111122100..',
  '..00011222289999222221567766500.',
  '....014444aa9999222215677776650.',
  '....014444389999222156770076650.',
  '..00012222299999221567777776650.',
  '.00cb33333328999215655555555500.',
  '.0ccb33333228999156cc66cc66500..',
  '.00bb22222111899155bb55bb5550...',
  '..000133322218881ffffffedd550...',
  '....0132222111111eeee577665500..',
  '....0111111111111dddd577665550..',
  '..000122221111111fffff57665550..',
  '.00cb112221111111eeeee5cc5cc50..',
  '.0ccbb11111111111ddddd5cb5cb50..',
  '.00bbb11111111111ffffff55b5b50..',
  '..0bb5556666550007766665550000..',
  '..0665566665500.07666665550.....',
  '..066556666550..007666665500....',
  '..055566665500...007666665500...',
  '..05566666550.....0766666bb50...',
  '..05555555550.....0555555bb50...',
  '..00000000000.....00000000000...',
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
  '...................0000.0000....',
  '.............0000.00cc0.0cc00...',
  '............00a90.0ccb0.0ccb0...',
  '.......0000.0aa9000cbb000cbb0...',
  '......00cc0.0a998223443322110...',
  '......0cbb0008999234433322210...',
  '..0000011111aa992341111112210...',
  '.00cbb11111289992331cccc12210...',
  '.0ccbb11443aa9992331cc0012210...',
  '.00bb114443899992321cc0012210...',
  '..0001122229999922211111122100..',
  '....014444489999222221567766500.',
  '....014444aa9999222215677776650.',
  '..00012222289999222156770076650.',
  '.00cb33333399999221567777776650.',
  '.0ccb33333228999215655555555500.',
  '.00bb22222118999156cc66cc66500..',
  '..000133322218991ffffffedd550...',
  '....0132222118881eeee577665500..',
  '....0111111111111dddd577665550..',
  '..000122221111111fffff57665550..',
  '.00cb112221111111eeeee5cc5cc50..',
  '.0ccbb11111111111ddddd5cb5cb50..',
  '.00bbb11111111111ffffff55b5b50..',
  '..0bbb777666650005566665500000..',
  '..0666776666550.0556666550......',
  '..066766666bb00.05566665500.....',
  '..055555555bb0..055666665500....',
  '..000000000000..05566666bb50....',
  '................05555555bb50....',
  '................000000000000....',
];

// THE ROAR. The change is on the JAW, not somewhere down the chest: the upper
// palate keeps its two fangs, the lower jaw drops four rows with two more
// pointing back up at them, and the throat between is slot 8 — the deep red of
// the mane, so the maw reads as flesh and not as a hole punched in the sprite.
// The chin now ends eight rows below where it does in the walk, so the outer
// silhouette is genuinely different. The near arm swings clear of it.
const BOWSER_MOUTH_OPEN = [
  '...................0000.0000....',
  '.............0000.00cc0.0cc00...',
  '............00a90.0ccb0.0ccb0...',
  '............0aa9000cbb000cbb0...',
  '.......0000.0a998223443322110...',
  '......00cc0008999234433322210...',
  '......0cbbc8aa992341111112210...',
  '..000001111a89992331cccc12210...',
  '.00cbb11111aa9992331cc0012210...',
  '.0ccbb11443899992321cc0012210...',
  '.00bb1144439999922211111122100..',
  '..00011222289999222221567766500.',
  '....014444aa9999222215677776650.',
  '....014444389999222156770076650.',
  '..0001222229999922156777cc7cc50.',
  '.00cb33333328999215888888888500.',
  '.0ccb33333228999158cc88cc88500..',
  '.00bb222221118991566666666650...',
  '..000133322218888566666666500...',
  '....0132222111111dd556665550....',
  '....0111111111111dddd57766500...',
  '..000122221111111ffff57665550...',
  '.00cb112221111111eeee56655550...',
  '.0ccbb11111111111dddd5cc5cc50...',
  '.00bbb11111111111ffff5cb5cb00...',
  '..0bb55566665500077666655500....',
  '..0665566665500.07666665550.....',
  '..066556666550..007666665500....',
  '..055566665500...007666665500...',
  '..05566666550.....0766666bb50...',
  '..05555555550.....0555555bb50...',
  '..00000000000.....00000000000...',
];

// WIND-UP before the breath. The whole near arm is cocked: claws up at rows
// 15-16 clear of the jaw line, the spiked cuff climbed to rows 17-18, so the
// plastron below reads uninterrupted. He braces — the feet plant wider than
// in either walk frame.
const BOWSER_ARM_UP = [
  '...................0000.0000....',
  '.............0000.00cc0.0cc00...',
  '............00a90.0ccb0.0ccb0...',
  '............0aa9000cbb000cbb0...',
  '.......0000.0a998223443322110...',
  '......00cc0008999234433322210...',
  '......0cbbc8aa992341111112210...',
  '..000001111a89992331cccc12210...',
  '.00cbb11111aa9992331cc0012210...',
  '.0ccbb11443899992321cc0012210...',
  '.00bb1144439999922211111122100..',
  '..00011222289999222221567766500.',
  '....014444aa9999222215677776650.',
  '....014444389999222156770076650.',
  '..00012222299999221567777776650.',
  '.00cb33333328999215655555555500.',
  '.0ccb33333228999156cc66cc66550..',
  '.00bb22222111899155bb55bb555500.',
  '..000133322218881ffffffedcc5cc0.',
  '....0132222111111eeeeeeedcb5cb0.',
  '....0111111111111ddddddd7665550.',
  '..000122221111111ffffff57665550.',
  '.00cb112221111111eeeee576655500.',
  '.0ccbb11111111111ddddd56655500..',
  '.00bbb11111111111ffffffedd000...',
  '..0bb5566665500007766665550.....',
  '..055566665500..007666665500....',
  '..06556666550....007666665500...',
  '.005566665500.....00766666550...',
  '.05566666550.......0766666bb0...',
  '.05555555550.......0555555bb0...',
  '.00000000000.......0000000000...',
];

// AIRBORNE — his signature SMB1 hop. Both legs fold up under the shell, the
// soles come off row 30 entirely, the body rides a row higher, and the last
// three rows of the frame hold nothing at all, so he is unmistakably off the
// bridge.
const BOWSER_HOP = [
  '...................0000.0000....',
  '.............0000.00cc0.0cc00...',
  '............00a90.0ccb0.0ccb0...',
  '............0aa9000cbb000cbb0...',
  '.......0000.0a998223443322110...',
  '......00cc0008999234433322210...',
  '......0cbbc8aa992341111112210...',
  '..000001111a89992331cccc12210...',
  '.00cbb11111aa9992331cc0012210...',
  '.0ccbb11443899992321cc0012210...',
  '.00bb1144439999922211111122100..',
  '..00011222289999222221567766500.',
  '....014444aa9999222215677776650.',
  '....014444389999222156770076650.',
  '..00012222299999221567777776650.',
  '.00cb33333328999215655555555500.',
  '.0ccb33333228999156cc66cc66500..',
  '.00bb22222111899155bb55bb5550...',
  '..000133322218881ffffffedd550...',
  '....0132222111111eeee577665500..',
  '....0111111111111dddd577665550..',
  '..000122221111111fffff57665550..',
  '.00cb112221111111eeeee5cc5cc50..',
  '.0ccbb11111111111ddddd5cb5cb50..',
  '.00bbb11111111111ffffff55b5b50..',
  '..0bbb555666650007766665500000..',
  '..0666556666bb0.0766666550......',
  '..066555555bb00.055666bb50......',
  '..055500000000..005555bb00......',
  '..00000..........00000000.......',
  '................................',
  '................................',
];

// BLOWN OFF THE BRIDGE. The figure is SHEARED, three columns of rake applied
// in steps down the body — skull back 2, jaw and mane back 1, hips none — so
// the body axis leans instead of standing plumb. Eyes screwed shut behind a
// lash line, jaw wrenched open, both legs kicked clear of the baseline.
const BOWSER_FALLING = [
  '.................0000.0000......',
  '...........0000.00cc0.0cc00.....',
  '..........00a90.0ccb0.0ccb0.....',
  '..........0aa9000cbb000cbb0.....',
  '.....0000.0a998223443322110.....',
  '....00cc0008999234433322210.....',
  '....0cbbc8aa9923411111122100....',
  '000001111a899923311111122210....',
  '0cbb11111aa9992331bbbb122210....',
  'ccbb114438999923211111122110....',
  '0bbb1444399999222111111221100...',
  '000011222289999222221567766500..',
  '...014444aa9999222215677776650..',
  '...014444389999222156777076650..',
  '.0001222229999922156777cc7cc50..',
  '00cb33333328999215888888888500..',
  '0ccb33333228999158cc88cc88500...',
  '00bb222221118991566666666650....',
  '.000133322218888566666666550....',
  '...0013222211111166556665550....',
  '....0111111111111dddd57766500...',
  '..000122221111111ffff57665550...',
  '.00cb112221111111eeee56655550...',
  '.0ccbb11111111111dddd5cc5cc50...',
  '.00bbb11111111111ffff5cb5cb00...',
  '..0bb55666655000077666655500....',
  '..055566666550..00766666550.....',
  '..055666bb5500...007666665000...',
  '..05555bb5000.....00766666bb0...',
  '..000000000........0055555bb0...',
  '....................000000000...',
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
