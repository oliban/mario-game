// The finale cast: Bowser, his flame breath, Toad, and Princess Toadstool.
//
// FACING — Bowser advances on Mario from the RIGHT, so on screen he is drawn
// facing LEFT. The engine mirrors sprites, so like every other actor in this
// game he is AUTHORED FACING RIGHT here; the renderer draws him flipX = true.
//
// Light source is the UPPER LEFT throughout. Hard pixel edges only.
//
// Nothing in this module is static: Bowser walks on a two-pose contact/passing
// cycle, the flame forks and rolls, and both Peach and Toad breathe and blink.

import { makeSprite, Anim } from '../../core/gfx.js';

// ---------------------------------------------------------------------------
// BOWSER — 32x32, the largest sprite in the game.
//   0 outline        1 shell deep     2 shell mid      3 shell lit
//   4 shell specular 5 hide shadow    6 hide mid       7 hide lit
//   8 mane deep      9 mane mid       a mane lit       b bone shadow
//   c bone lit       d plastron dark  e plastron lit   f void (pupil / maw)
// ---------------------------------------------------------------------------
// SMB1 Bowser is GREEN-HIDED with a TAN/ORANGE shell — slots 1-4 carry the
// carapace tan ramp, slots 5-7 the reptile green ramp.
const BOWSER_PAL = [
  '#1a1008', '#8f3d00', '#d07018', '#ef9a49',
  '#f8d5ac', '#1f5c14', '#3f9c2c', '#7fd45c',
  '#5a1a00', '#bd3c30', '#ff8b7f', '#b8b8b8',
  '#ffffff', '#bdac2c', '#e4e594', '#2a0c08',
];

// PASSING POSE. Weight rolling over the lead foot, feet close, body at full
// height, tail hooked back and up, near arm hanging with the claw at its lowest.
const BOWSER_WALK_A = [
  '...............c0............c0.',
  '...............cc0..........cc0.',
  '...........a....ccb0.......ccb0.',
  '..........a9a....ccbb0....ccbb0.',
  '.........a99998...0cbb0000cbbb0.',
  '.........09aa999905bb56776bb50..',
  '.........09aaa99056777766666550.',
  '........09aaaa990677766666666550',
  '........9aaaa9980677666650000000',
  '........9aa999980666660cffc05660',
  '........9aa9998806666650ccc056f0',
  '........0c0999806666555666677660',
  '.......0ccb098806665566666666660',
  '......0cbb2210880565500000000000',
  '.....0b12233210565550cb0cb0cb0c0',
  '.....012343432105555055555555550',
  '.....0c34444332100c00c00c0056660',
  '...0ccb23344332210b00b00b0076650',
  '.....0b213443322105eeeeee0076650',
  '...0501231443322105ddddddd076650',
  '..05601234411322105eeeeeee066650',
  '.05660c234433122105eeeeeee0c0c0.',
  '056c601123333222105ddddddd00000.',
  '056660b211332221105eeeeeee066650',
  '0566501222112211055dddddd000ccb0',
  '0c65501122222110555eeeee0550cb0.',
  '.00000011221105776650057766650..',
  '.....012210.057666550.07666650..',
  '...0122110..056666550.056666650.',
  '....0110...056666665005666666650',
  '..........0566666665c056666665c0',
  '..........0000000c0c0.000000c0c0',
];

// CONTACT POSE — a different drawing, not frame A nudged. The mass lands: the
// upper body drops a row while the legs shorten by one and split into a wide
// stride, the shell's rim rocks forward and its spike climbs a row, the mane
// lags a pixel behind the skull, the eye cluster drops relative to the snout so
// the head nods, the muzzle retracts a pixel, the elbow bends and rides up, and
// the tail counter-swings in against the leg pass.
const BOWSER_WALK_B = [
  '................................',
  '...............c0............c0.',
  '...............cc0..........cc0.',
  '...........0a...ccb0.......ccb0.',
  '..........0a9a...ccbb0....ccbb0.',
  '.........0a99998..0cbb0000cbbb0.',
  '.........009aa99995bb56776bb50..',
  '.........009aaa9956777766666550.',
  '........009aaaa9967776666666650.',
  '........09aaaa99867766665000000.',
  '........09aa9999866666666666560.',
  '........09aa99988666660cffc0560.',
  '........0c00999866665560ccc07f0.',
  '.......0ccb00988666556666666660.',
  '......0cbb221008856550000000000.',
  '.....0b12233210565550cb0cb0cb00.',
  '......0234343210555505555555550.',
  '...0ccb34444332100c00c00c0056660',
  '......023344332210b00b00b0076650',
  '......0213443322105eeeeee0076650',
  '......0231143322105ddddddd066650',
  '....001233311322105eeeeeee00c0c0',
  '...050c233333122105eeeeeee000000',
  '..05601123333222105ddddddd066650',
  '.05660b211332221105eeeeeee00ccb0',
  '.05c601222112211055dddddd0000cb0',
  '.056601122222110555eeeee05566650',
  '.05650011221105776650057766650..',
  '..000012210057666550...07666650.',
  '...0122110056666550....056666650',
  '.......0566666665c0..056666665c0',
  '.......00000000c0c0...000000c0c0',
];

// The fire-breathing roar: the jaw swings down and away into a void maw with a
// lit tongue, and the collar and plastron stay exactly where the walk put them.
const BOWSER_MOUTH_OPEN = [
  '...............c0............c0.',
  '...............cc0..........cc0.',
  '...........a....ccb0.......ccb0.',
  '..........a9a....ccbb0....ccbb0.',
  '.........a99998...0cbb0000cbbb0.',
  '.........09aa999905bb56776bb50..',
  '.........09aaa99056777766666550.',
  '........09aaaa990677766666666550',
  '........9aaaa9980677666650000000',
  '........9aa999980666660cffc05660',
  '........9aa9998806666650ccc056f0',
  '........0c0999806666555666677660',
  '.......0ccb098806665566666666660',
  '......0cbb2210880565500000000000',
  '.....0b12233210565550cb0cb0cb0c0',
  '.....0123434321055550ffffffffff0',
  '.....0c34444332100c0089a98fffff0',
  '...0ccb23344332210b009a99f0cb0c0',
  '.....0b213443322100666666666660.',
  '...0501231443322100555555555500.',
  '..05601234411322105eeeeeee066650',
  '.05660c234433122105eeeeeee0c0c0.',
  '056c601123333222105ddddddd00000.',
  '056660b211332221105eeeeeee066650',
  '0566501222112211055dddddd000ccb0',
  '0c65501122222110555eeeee0550cb0.',
  '.00000011221105776650057766650..',
  '.....012210.057666550.07666650..',
  '...0122110..056666550.056666650.',
  '....0110...056666665005666666650',
  '..........0566666665c056666665c0',
  '..........0000000c0c0.000000c0c0',
];

// The near claw cocks UP beside the jaw — talons at the top of the limb instead
// of hanging at the hip — so the pose reads as a wind-up, not as the walk.
const BOWSER_ARM_UP = [
  '...............c0............c0.',
  '...............cc0..........cc0.',
  '...........a....ccb0.......ccb0.',
  '..........a9a....ccbb0....ccbb0.',
  '.........a99998...0cbb0000cbbb0.',
  '.........09aa999905bb56776bb50..',
  '.........09aaa99056777766666550.',
  '........09aaaa990677766666666550',
  '........9aaaa9980677666650000000',
  '........9aa999980666660cffc05660',
  '........9aa9998806666650ccc056f0',
  '........0c0999806666555666677660',
  '.......0ccb098806665566666666660',
  '......0cbb2210880565500000000000',
  '.....0b12233210565550cb0cb0cb0c0',
  '.....012343432105555055555555550',
  '.....0c34444332100c00c00c000c0c0',
  '...0ccb23344332210b00b00b00ccbc0',
  '.....0b213443322105eeeeee0066650',
  '...0501231443322105ddddddd0c0c0.',
  '..05601234411322105eeeeeee00000.',
  '.05660c234433122105eeeeeee076650',
  '056c601123333222105ddddddd076650',
  '056660b211332221105eeeeeee076650',
  '0566501222112211055dddddd006650.',
  '0c65501122222110555eeeee050650..',
  '.00000011221105776650057766650..',
  '.....012210.057666550.07666650..',
  '...0122110..056666550.056666650.',
  '....0110...056666665005666666650',
  '..........0566666665c056666665c0',
  '..........0000000c0c0.000000c0c0',
];

// Blown off the bridge: the whole figure is SHEARED so the body axis leans back,
// the eyes are screwed shut behind a lid line, the jaw is wide, the near arm
// flails out with its claws splayed, and both legs kick clear of the baseline —
// rows 30-31 hold nothing at all, so he is visibly off the ground.
const BOWSER_FALLING = [
  '...........c0............c0.....',
  '...........cc0..........cc0.....',
  '.......a....ccb0.......ccb0.....',
  '......a9a....ccbb0....ccbb0.....',
  '.....a99998...0cbb0000cbbb0.....',
  '.....09aa999905bb56776bb50......',
  '......09aaa99056777766666550....',
  '.....09aaaa990677766666666550...',
  '.....9aaaa9980677666650000000...',
  '.....9aa999980666660666665660...',
  '.....9aa999880666660bbbb056f0...',
  '......0c0999806666555666677660..',
  '.....0ccb098806665566666666660..',
  '....0cbb2210880565500000000000..',
  '...0b12233210565550cb0cb0cb0c0..',
  '...0123434321055550ffffffffff0..',
  '...0c34444332100c0089a98ff056660',
  '..0ccb23344332210b009a99f0076660',
  '....0b21344332210066666666076660',
  '..0501231143322100555555550c0c0.',
  '.05601233311322105eeeeeee000000.',
  '05660c233333122105eeeeeee0066650',
  '056c601123333222105ddddddd0ccb0.',
  '056660b211332221105eeeeeee.0cb0.',
  '0566501222112211055dddddd0......',
  '0c65501122222110555eeeee05......',
  '........05666650..0566666550....',
  '.......05666650.....05666666550.',
  '......0566550.........056666650.',
  '......0c0c00...........00c0c00..',
  '................................',
  '................................',
];

// HOP — his signature SMB1 move. Both legs tuck up under the shell (rows 30-31
// are empty, so he is unmistakably airborne) and the tail whips down behind.
const BOWSER_HOP = [
  '...............c0............c0.',
  '...............cc0..........cc0.',
  '...........a....ccb0.......ccb0.',
  '..........a9a....ccbb0....ccbb0.',
  '.........a99998...0cbb0000cbbb0.',
  '.........09aa999905bb56776bb50..',
  '.........09aaa99056777766666550.',
  '........09aaaa990677766666666550',
  '........9aaaa9980677666650000000',
  '........9aa999980666660cffc05660',
  '........9aa9998806666650ccc056f0',
  '........0c0999806666555666677660',
  '.......0ccb098806665566666666660',
  '......0cbb2210880565500000000000',
  '.....0b12233210565550cb0cb0cb0c0',
  '.....012343432105555055555555550',
  '.....0c34444332100c00c00c0056660',
  '...0ccb23344332210b00b00b0076650',
  '.....0b213443322105eeeeee0076650',
  '.....01231443322105ddddddd076650',
  '.....01234411322105eeeeeee066650',
  '.....0c234433122105eeeeeee0c0c0.',
  '.....01123333222105ddddddd00000.',
  '.....0b211332221105eeeeeee066650',
  '0566501222112211055dddddd000ccb0',
  '056c601122222110555eeeee0550cb0.',
  '056660011221105776650057766650..',
  '05665012210.056666650.056666650.',
  '0c650122110.05666665c00566666650',
  '.00000110...00c0c0c00.00c0c0c0..',
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

// The mass is HOT: white/cream/amber own the body, the reds are pushed out to the
// trailing licks, and `0` is only ever the silhouette — never an interior band.
// Three separated tongues fork off the trailing edge.
const FLAME_JET_A = [
  '......000000............',
  '....00222222000.........',
  '...033333333333000000...',
  '..04444444444433322210..',
  '.04455555555444332200...',
  '0345555555555443300.....',
  '03455566665554433000000.',
  '034556666665544332221110',
  '03455666666554433222100.',
  '034555666655544330000...',
  '03455555555554433000....',
  '.04455555555444332220...',
  '..044444444444333220....',
  '...0333333333330000.....',
  '....00222222000.........',
  '......000000............',
];

// A different MOMENT, not a different taper: the licks roll over — the top tongue
// whips out 3px while the bottom retracts 3px — and a 2x2 ember tears loose and
// floats clear of the body entirely.
const FLAME_JET_B = [
  '......000000............',
  '....00222222000.........',
  '...03333333333300000000.',
  '..0444444444443332221110',
  '.0445555555544433222110.',
  '0345555555555443300000..',
  '034555666655544330000...',
  '0345566666655443322210..',
  '034556666665544332200...',
  '0345556666555443300.....',
  '0345555555555443300..00.',
  '.04455555555444332200330',
  '..04444444444433320.0330',
  '...033333333333000...00.',
  '....00222222000.........',
  '......000000............',
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
const TOAD_PAL = [
  '#1a1008', '#c8b8a8', '#f0e8dc', '#ffffff',
  '#8f1f10', '#cc3a22', '#ff8b7f', '#b06a28',
  '#efa860', '#f8d5ac', '#131f7f', '#3050c8',
  '#a3b4ff', '#160d18', '#6d3a10', '#e4e594',
];

// The cap is a WHITE dome carrying three discrete round red spots — one crown
// spot and one on each flank — not a red field with white streaks. The whites are
// warm (1/2/3) so they sit with the rest of the file instead of going lavender.
// Cap is 16px across, torso only 10px, so the mushroom silhouette reads at 1x.
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
  '..099dd99dd90...',
  '..099dd98dd90...',
  '..08999899970...',
  '...089077080....',
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

// Frame B: the whole cap block bobs down a pixel, the head compresses into the
// shoulders to absorb it, and both arm slivers swing a pixel outward.
const TOAD_IDLE_B = [
  '................',
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
  '..099dd99dd90...',
  '..099dd98dd90...',
  '...089077080....',
  '...00ab99ba00...',
  '0800cc333bba0080',
  '0800cf333fba0080',
  '0700c03330ba0070',
  '0000cbb33bba0000',
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
    ],
    [40, 40]
  ),
};

// ---------------------------------------------------------------------------
// PRINCESS TOADSTOOL — 16x24.
//   0 outline      1 dress shadow  2 dress mid   3 dress lit
//   4 dress spec   5 hair shadow   6 hair mid    7 hair lit
//   8 glove lit    9 glove shadow  a skin shadow b skin mid
//   c skin lit     d sapphire      e crown gold  f pupil
//
// Slot e used to duplicate slot 2's hex and slot a was never referenced. Both are
// live now: e is the crown's own gold (so the crown no longer dissolves into the
// hair ramp) and a shades the jaw, nose and brow.
// ---------------------------------------------------------------------------
const PEACH_PAL = [
  '#1a1008', '#8c1f4e', '#c03470', '#ff83c0',
  '#ffcce5', '#8a6a00', '#bdac2c', '#e4e594',
  '#ffffff', '#b8b8b8', '#c9793a', '#f0a868',
  '#f8d5ac', '#3ec2cd', '#ffd23f', '#000000',
];

// Gown lit as a cone from the upper LEFT — slot 4 owns the left flank, slot 1 the
// right — instead of a centred stripe with symmetric darks.
const PEACH_IDLE_A = [
  '....0e0e0e0.....',
  '...0eeeeeee0....',
  '...0ede2ede0....',
  '..00677777650...',
  '..06776666550...',
  '.0677766666550..',
  '.0760caccac0650.',
  '.0760cfccfc0650.',
  '.0760cbcabc0650.',
  '.0760cb11bc0650.',
  '..0760aaaa0650..',
  '..07660aa06550..',
  '.07660332206550.',
  '0760883dd2990550',
  '0760883221990550',
  '0060883322990500',
  '....04432210....',
  '...0444332110...',
  '...0443322110...',
  '..034443322110..',
  '..034433222110..',
  '.02344433221110.',
  '0223444332211110',
  '0222111111111110',
];

// Frame B: she blinks, the hair mass lifts and flares on the left, the gown's
// fold-highlight slides a pixel and the hem's outer corners settle.
const PEACH_IDLE_B = [
  '....0e0e0e0.....',
  '...0eeeeeee0....',
  '...0ede2ede0....',
  '..00677777650...',
  '..06776666550...',
  '.0677766666550..',
  '.0760caccac0650.',
  '.0760aaccaa0650.',
  '.0760cbcabc0650.',
  '.0760cb11bc0650.',
  '..0760aaaa0650..',
  '.077660aa065550.',
  '.07660332206550.',
  '0760883dd2990550',
  '0060883221990550',
  '0000883322990500',
  '....04432210....',
  '...0444332110...',
  '...0443322110...',
  '..033444322110..',
  '..033443222110..',
  '.02334443221110.',
  '0223344433211110',
  '.02211111111110.',
];

export const PEACH = {
  idle: new Anim(
    [
      makeSprite(PEACH_IDLE_A, PEACH_PAL, { name: 'peach.idleA' }),
      makeSprite(PEACH_IDLE_B, PEACH_PAL, { name: 'peach.idleB' }),
    ],
    [40, 40]
  ),
};
