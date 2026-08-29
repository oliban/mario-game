// ---------------------------------------------------------------------------
// HARRY 2 — "the tower city"
//
// Harry's second painting (Downloads/IMG_1930), read left to right. As with
// h-1, nothing here is new engine work: every piece is a component the game
// already ships.
//
// FREDRIK READ THE PAINTING FOR HARRY. Four things in it were not inferable
// from the drawing and all four came from him:
//   * the long chain of blocks across the sky is a CEILING, hung at the top of
//     the level the way h-1's ladder was — not a road and not scenery;
//   * the small figures on the towers are not all the same thing: hammer bros
//     on the two tallest, red koopas on the low ones, and the one drawn with a
//     beak is a winged koopa;
//   * the dashes down the left flank of the tall thin tower are STEPS;
//   * the square drawn just before that tower is an INVISIBLE BLOCK holding an
//     extra life. Harry knows where it is; the player will not.
//
// The red floor is lava, which is the rule his first painting set. So this is
// another crossing: two shores, one at the spawn and one under the flagpole,
// and between them a floor that kills you. Every tower runs down to the bottom
// row rather than stopping at the lava's surface, so it reads as stone standing
// in it.
//
//   pencil rectangles   -> nine 'B' towers at the heights he drew, 3 to 8 tiles
//   the block chain     -> the '#' roof on rows 0-1
//   the red floor       -> 'L' everywhere but the two shores
//   the dashes on t.4   -> three ledges climbing to its roof
//   the ? in the air    -> a power-up block over tower 3
//   the plain square    -> the hidden 1-up, over the first step
//   the square by t.7   -> a brick of coins
//   the flagged house   -> the flagpole and castle, where he drew them
//
// THREE THINGS HERE ARE NOT IN THE PAINTING and were agreed as additions:
//
// 1. STEPPING STONES. The gaps he drew between towers are 8 to 11 columns and
//    a running jump spans 7.48 (scratchpad/jumpreach.mjs, measured for h-1 and
//    unchanged). Four of them get one 3-wide stone, splitting them into 3- and
//    4-column hops. Without these the level is not crossable at all.
// 2. PODOBOOS, three of them, at the widest crossings. A lake of lava that
//    never moves reads as scenery, and this level is not scenery. h-1 needed
//    the same thing.
// 3. COINS, over the four stone crossings and on tower 4's roof. Coins do a job
//    in this game beyond being points: they show you the line of a jump before
//    you commit to it, which matters most over lava.
//
// GEOMETRY RULES CARRIED OVER FROM h-1, all of them measured rather than
// guessed: no landing pad narrower than three columns, because a running jump
// spans 7.5 tiles and will sail clean over a 2-wide stone; no upward step of
// more than four rows, because a standing jump clears 4.125 and a running one
// 5.125; gaps of three and four columns are the useful range.
//
// The hidden 1-up is placed over a STEP rather than over open lava, and that is
// deliberate. Striking an invisible block zeroes your rise and plants you under
// it (world.js:_checkHiddenBlocks) — over lava that is a death you cannot see
// coming, and over the step it costs you the jump and nothing else.
//
// Theme, sky and music are h-1's, because this is the same place: the
// underground tileset paints the blocks lavender and the roof green, the paper
// sky keeps the empty page you notice first in the paintings, and the tune is
// the one written for his first level.
// ---------------------------------------------------------------------------

const TILES = [
  '##############################################################################################################################',
  '##############################################################################################################################',
  '....................................................................................................................^.........',
  '..................................................M.................................................................|.........',
  '..................................................................oooo..............................................|.........',
  '..................................................................BBBB..............................................|.........',
  '...............BBBBBBB............................................BBBB......................=...BBBBB...............|.........',
  '...............BBBBBBB..........BBBBBB..........BBBBBB....1....BBBBBBB..........................BBBBB...............|.........',
  '...............BBBBBBB.ooo......BBBBBB..........BBBBBB.........BBBBBBB..........................BBBBB...............|.........',
  '...............BBBBBBB..........BBBBBB.ooo......BBBBBBooo...BBBBBBBBBB....BBBBB...BBBBBB........BBBBB...BBBB........|.........',
  '.........BBB...BBBBBBB..........BBBBBB..........BBBBBB......BBBBBBBBBB....BBBBB...BBBBBB...BBB..BBBBB...BBBB........|.........',
  '......oooBBB...BBBBBBB....BBB...BBBBBB....BBB...BBBBBB...BBBBBBBBBBBBB....BBBBB...BBBBBB...BBB..BBBBB...BBBB........|.........',
  '.........BBB...BBBBBBB....BBB...BBBBBB....BBB...BBBBBB...BBBBBBBBBBBBB....BBBBB...BBBBBB...BBB..BBBBB...BBBB........B.........',
  '######LLLBBBLLLBBBBBBBLLLLBBBLLLBBBBBBLLLLBBBLLLBBBBBBLLLBBBBBBBBBBBBBLLLLBBBBBLLLBBBBBBLLLBBBLLBBBBBLLLBBBBLL################',
  '######LLLBBBLLLBBBBBBBLLLLBBBLLLBBBBBBLLLLBBBLLLBBBBBBLLLBBBBBBBBBBBBBLLLLBBBBBLLLBBBBBBLLLBBBLLBBBBBLLLBBBBLL################',
];

export default {
  id: 'h-2',
  name: 'HARRY 2',
  time: 400,
  theme: 'underground',
  sky: 'paper',
  music: 'harry-lava',
  width: 126,
  height: 15,
  spawn: { x: 2, y: 12 },
  tiles: TILES,
  contents: [
    // the loose square by tower 7
    { x: 92, y: 6, item: 'multicoin' },
  ],
  entities: [
    // tower 2 — the pair Harry drew standing together. Red is not an option for
    // the winged one: the beaked figure is the one that moves between towers.
    { type: 'hammerbro', x: 34, y: 6 },
    { type: 'koopa', x: 36, y: 6, variant: 'green', winged: true },
    { type: 'podoboo', x: 23, y: 13 },
    // tower 3 — red, not green. A green koopa walks off the edge and is in the
    // lava long before you arrive (koopa.js:52-53).
    { type: 'koopa', x: 50, y: 6, variant: 'red' },
    { type: 'podoboo', x: 40, y: 13 },
    // tower 4 — the reason to climb the steps, and the reason not to
    { type: 'hammerbro', x: 67, y: 4 },
    { type: 'podoboo', x: 71, y: 13 },
    { type: 'koopa', x: 84, y: 8, variant: 'red' },
    { type: 'koopa', x: 105, y: 8, variant: 'red' },
  ],
  flagpole: { x: 116 },
  castle: { x: 121 },
};
