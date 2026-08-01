// ---------------------------------------------------------------------------
// WORLD 1-1 — overworld, 212 tiles.
//
// Pacing: a safe teaching stretch (one block, one goomba, one power-up), then
// three pipes — two clean, the third biting — then the first pit, then the same
// ideas combined at speed. Floor surface is row 13, the low block row is 9 and
// the high block row is 5, exactly four tiles apart, so a running jump reads the
// same everywhere in the level.
//
// Enemy pressure is not flat: nothing for the first screen, singles through the
// pipes, then four goombas walking down the second staircase and a koopa/goomba
// pincer on the last pit. The three screens before the pole are deliberately
// empty.
//
// The star lives in the middle brick of the row-5 cluster at 77-79 (see
// `contents`), the second power block sits at 93 so a player who was hit at the
// pipes can be big again before the staircases.
//
// Legend: . air  # ground  = brick  ? coin block  M power block  1 hidden 1-up
//         C hidden coin  o coin  B stone  S stair  [ ] { } pipe  < > side pipe
//         | ^ flagpole  X castle  t b h c decor
// ---------------------------------------------------------------------------

import { ORDER } from './roster.js';

const TILES = [
  '....................................................................................................................................................................................................................',
  '....................................................................................................................................................................................................................',
  '........cc..................................cc......................ccc.............................................ccc.......................................ccc.......................cc............^.............',
  '..........................ccc...............................................................cc..............................................cc........................................................|.cc..........',
  '......................................................................................................................................................................................................|.............',
  '......................?......................................................===...............===................ooooo.....................................................................S.........|.............',
  '.................................................................................................................=======...................................................................SS.........|.............',
  '..........................................................................................................................................................................................SSS.........|.............',
  '.........................................................................................................................................................................................SSSS.........|.............',
  '................?...=M=?......................[].........[]......1...........=?=............=M?=.C.............................S..S..........................=?=........................SSSSS.........|.............',
  '......................................[]......{}.........{}...................................................[]..........[]..SS..SS......oooo.....................[]..................SSSSSS.........|.............',
  '.......hhh..................[]........{}......{}.hhh.....{}................................hhh................{}..........{}.SSS..SSS....hhh.......................{}............hhh..SSSSSSS.........|.............',
  '......hhhhhbbb..hhh.........{}...bbb..{}......{}hhhhh....{}...bbb.hhh.....bbb.............hhhhh....bbb..hhh...{}......bbb.{}SSSS..SSSS..hhhhh...hhh.bbb............{}.bbb.......hhhhhSSSSSSSS.bbbhhh..|.............',
  '#####################################################################..###############...#######################################..#######################..#########################################################',
  '#####################################################################..###############...#######################################..#######################..#########################################################',
];

// The coin room below the fourth pipe. You drop in through the pipe in its
// ceiling and leave through the side pipe on the right, surfacing at x=122 —
// just short of the staircase pair, so the room is a shortcut and not a bypass:
// it costs you the second power block, the hidden 1-up at 97 and the whole
// block cluster between 76 and 119.
const BONUS = {
  id: '1-1b',
  name: 'WORLD 1-1',
  theme: 'underground',
  music: 'underground',
  width: 20,
  height: 15,
  spawn: { x: 2, y: 10 },
  tiles: [
    '####################',
    '####################',
    '##[]################',
    '#.{}..............##',
    '#.................##',
    '#.................##',
    '#.................##',
    '#.................##',
    '#...oooooooooo....##',
    '#...oooooooooo..<>##',
    '#...oooooooooo..<>##',
    '####################',
    '####################',
    '####################',
    '####################',
  ],
  entities: [],
  // from.x is the '<' column: the trigger and the clip both key off it, so a
  // column short and Mario is swallowed by open floor beside the pipe.
  warps: [
    { from: { x: 16, y: 10 }, dir: 'right', to: { area: 'main', x: 122.5, y: 10, exit: 'up' } },
  ],
};

// The warp zone, reached by the first pipe at col 28. SMB hides its warp zones
// behind a ceiling run or a vine; this one is deliberately on the very first
// pipe, because its job is to get a tester into any level in two seconds.
//
// It is BUILT from the roster rather than written out, so every level that
// exists has a pipe here and a new world needs no edit to this file. Each pipe
// is a two-tile stub on the floor at row 11 and the label above it is a `signs`
// entry — level text painted into world space, the way SMB writes its world
// numbers onto the warp-zone backdrop.
const WZ_FIRST = 5; // column of the first pipe
const WZ_STEP = 4; // columns between pipe left edges

function buildWarpZone(order) {
  const width = WZ_FIRST + order.length * WZ_STEP + 2;
  const pipeCols = order.map((_, i) => WZ_FIRST + i * WZ_STEP);
  const blank = (fill) => fill.repeat(width);
  const room = (mid) => '#' + mid + '#';
  const open = () => room('.'.repeat(width - 2));

  const pipeRow = (left, right) => {
    const row = '.'.repeat(width).split('');
    for (const c of pipeCols) {
      row[c] = left;
      row[c + 1] = right;
    }
    row[0] = '#';
    row[width - 1] = '#';
    return row.join('');
  };

  const tiles = [
    blank('#'),
    blank('#'),
    '##[]' + '#'.repeat(width - 4),
    '#.{}' + '.'.repeat(width - 5) + '#',
    open(),
    open(),
    open(),
    open(),
    open(),
    open(),
    open(),
    pipeRow('[', ']'),
    pipeRow('{', '}'),
    blank('#'),
    blank('#'),
  ];

  const title = 'WARP ZONE';
  const signs = [{ x: (width - title.length) / 2, y: 5, text: title }];
  for (let i = 0; i < order.length; i++) {
    // Centre the three-glyph label on the two-tile pipe: 24px of text over 32px
    // of pipe leaves 4px, which is a quarter of a tile.
    signs.push({ x: pipeCols[i] + 0.25, y: 9, text: order[i] });
  }

  return {
    id: '1-1w',
    name: 'WARP ZONE',
    theme: 'underground',
    music: 'underground',
    width,
    height: 15,
    spawn: { x: 2, y: 10 },
    tiles,
    entities: [],
    signs,
    warps: order.map((id, i) => ({
      from: { x: pipeCols[i], y: 11 },
      dir: 'down',
      to: { level: id },
    })),
  };
}

const WARP = buildWarpZone(ORDER);

export default {
  id: '1-1',
  name: 'WORLD 1-1',
  time: 400,
  theme: 'overworld',
  music: 'overworld',
  width: 212,
  height: 15,
  spawn: { x: 2, y: 12 },
  tiles: TILES,
  contents: [{ x: 78, y: 5, item: 'star' }],
  entities: [
    { type: 'goomba', x: 22, y: 12 },
    // Pipes 1 and 2 (cols 28 and 38) are clean; the plant is on the third.
    { type: 'piranha', x: 46.5, y: 9 },
    { type: 'koopa', x: 51, y: 12, variant: 'green' },
    { type: 'goomba', x: 64, y: 12 },
    { type: 'goomba', x: 66, y: 12 },
    { type: 'goomba', x: 80, y: 12 },
    { type: 'goomba', x: 82, y: 12 },
    { type: 'koopa', x: 106, y: 12, variant: 'green' },
    { type: 'piranha', x: 110.5, y: 10 },
    { type: 'goomba', x: 117, y: 12 },
    // The crescendo: a descending file on the second staircase...
    { type: 'goomba', x: 130, y: 8 },
    { type: 'goomba', x: 132, y: 10 },
    { type: 'goomba', x: 134, y: 12 },
    { type: 'goomba', x: 137, y: 12 },
    // ...then a pincer on the last pit at 153-154.
    { type: 'koopa', x: 148, y: 12, variant: 'green' },
    { type: 'goomba', x: 150, y: 12 },
    { type: 'goomba', x: 152, y: 12 },
  ],
  warps: [
    { from: { x: 57, y: 9 }, dir: 'down', to: { area: '1-1b', x: 2.5, y: 3, exit: 'down' } },
    // The first pipe in the game is the tester's door into every other level.
    { from: { x: 28, y: 11 }, dir: 'down', to: { area: '1-1w', x: 2.5, y: 3, exit: 'down' } },
  ],
  areas: { '1-1b': BONUS, '1-1w': WARP },
  flagpole: { x: 198 },
  // The castle base is cut open at 202-204 so the walk-off can actually reach
  // the door: the player is hidden at castle.x * 16 + 22, i.e. inside col 204.
  castle: { x: 203 },
};
