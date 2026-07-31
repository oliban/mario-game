// ---------------------------------------------------------------------------
// WORLD 1-2 — underground, 224 tiles.
//
// The roof is closed from end to end (rows 0-2; the top two sit behind the HUD)
// so the whole level reads as one long cavern. Every hazard is introduced on
// flat ground first: the piranha pipes stand in the open, the two floor gaps
// come after a straight run-up, and the coin rows mark the safe line through.
// Nothing overhangs a gap — the brick shelf that used to cap the 124-125 pit
// now sits at 134-137, clear of both landings.
//
// The ending is a fork, not a formality. The ordinary exit is the side pipe at
// 193 on the cavern floor. The alternative is the lift at 184-186: ride it up
// six tiles (its coin column marks the ride), walk the stone shelf at 187-197,
// hop the three-tile gap onto the deck, and you reach two pipes that go
// somewhere the floor-level exit never does — a flooded grotto and a locked
// vault with a 1-Up in its ceiling. Both spill out onto the same surface with
// the flagpole, so the climb buys content instead of skipping it.
//
// Legend: . air  # ground  = brick  ? coin block  M power block  1 hidden 1-up
//         o coin  B stone  ~ water surface  _ water  g coral
//         [ ] { } pipe  < > side pipe  | ^ flagpole  X castle  t b h c decor
// ---------------------------------------------------------------------------

const TILES = [
  '################################################################################################################################################################################################################################',
  '################################################################################################################################################################################################################################',
  '################################################################################################################################################################################################################################',
  '............................................=====..............................................###########....................................................................................................................##',
  '............................................=====..............................................###########....................................................................................................................##',
  '...............................................................................................###########........................................................................................................[]..[]......##',
  '#####..........................................................................................###########.................................................................................................oooooo.{}..{}......##',
  '#####....................................................................................................................................................................................o.BBBBBBBBBBB...#######################',
  '#####.....ooooo.......................................................................................................................oooo................oooooooooooo...................................#######################',
  '#####.....=====..M.......................................................1..[]....................ooooo.........M.....................====................============...................o...............#######################',
  '#####...............................................................[]......{}....................BBBBB.................?.......................................................==?==.................?..#######################',
  '#####.........................#######...............................{}......{}..........[]........................................................#####.................####.............o.......<>......#######################',
  '#####..oooooo.................#######...................oooooooo....{}......{}..........{}................####................oooo................#####...oooooooooooo..####.....................<>......#######################',
  '####################################################..######################################################################..####...###########################################################################################',
  '####################################################..######################################################################..####...###########################################################################################',
];

// Daylight with the flagpole on it. Every route out of 1-2 lands here.
const SURFACE = {
  id: '1-2b',
  name: 'WORLD 1-2',
  theme: 'overworld',
  music: 'overworld',
  width: 40,
  height: 15,
  spawn: { x: 2, y: 10 },
  tiles: [
    '........................................',
    '........................................',
    '........cc....................^..cc.....',
    '....................ccc.......|.........',
    '..............................|.........',
    '..............................|.........',
    '..............................|.........',
    '..............................|.........',
    '..............................|.........',
    '..........?...=?=.........S...|.........',
    '.........................SS...|.........',
    '..[]..hhh..........oooo.SSS...|.........',
    '..{}.hhhhh..bbb..hhh...SSSSbbb|.........',
    '########################################',
    '########################################',
  ],
  entities: [{ type: 'goomba', x: 18, y: 12 }],
  warps: [],
  flagpole: { x: 30 },
  castle: { x: 35 },
};

// Warp pipe 1 (col 210). A flooded grotto: the only water in World 1, and the
// only place the cheep-cheeps and the blooper live. Swim right into the pipe in
// the far wall to surface at the flagpole.
const GROTTO = {
  id: '1-2c',
  name: 'WORLD 1-2',
  theme: 'water',
  music: 'water',
  width: 28,
  height: 15,
  spawn: { x: 2, y: 4 },
  tiles: [
    '############################',
    '############################',
    '##[]########################',
    '#.{}.......................#',
    '#..........................#',
    '#~~~~~~~~~~~~~~~~~~~~~~~~~~#',
    '#__________________________#',
    '#_____oooo____oooo_________#',
    '#__________________________#',
    '#___oooooo_________________#',
    '#________________________<>#',
    '#___gg_____gg____g_______<>#',
    '############################',
    '############################',
    '############################',
  ],
  entities: [
    { type: 'cheep', x: 9, y: 8, variant: 'grey', facing: -1 },
    { type: 'cheep', x: 17, y: 7, variant: 'grey', facing: -1 },
    { type: 'cheep', x: 21, y: 10, variant: 'grey', facing: 1 },
    { type: 'blooper', x: 14, y: 8 },
  ],
  warps: [
    { from: { x: 25, y: 10 }, dir: 'right', to: { area: '1-2b', x: 2.5, y: 11, exit: 'up' } },
  ],
};

// Warp pipe 2 (col 214). The 1-Up is seven tiles up — out of reach of any jump,
// so the springboard under it is the whole puzzle: hold JUMP through the bounce
// and the block is yours, tap it and you get the coin row as a consolation.
const VAULT = {
  id: '1-2d',
  name: 'WORLD 1-2',
  theme: 'underground',
  music: 'underground',
  width: 20,
  height: 15,
  spawn: { x: 2, y: 4 },
  tiles: [
    '####################',
    '####################',
    '##[]################',
    '#.{}...............#',
    '#..................#',
    '#..................#',
    '#...........?......#',
    '#..................#',
    '#....oooooooo......#',
    '#..................#',
    '#................<>#',
    '#................<>#',
    '####################',
    '####################',
    '####################',
  ],
  contents: [{ x: 12, y: 6, item: '1up' }],
  // The board is bottom-anchored at y*16 + 32 (springboard.js `baseline`), so
  // y=10 is what puts its foot on the row-12 floor.
  entities: [{ type: 'springboard', x: 12, y: 10 }],
  warps: [
    { from: { x: 17, y: 10 }, dir: 'right', to: { area: '1-2b', x: 2.5, y: 11, exit: 'up' } },
  ],
};

export default {
  id: '1-2',
  name: 'WORLD 1-2',
  time: 400,
  theme: 'underground',
  music: 'underground',
  width: 224,
  height: 15,
  spawn: { x: 2, y: 5 },
  tiles: TILES,
  entities: [
    { type: 'goomba', x: 26, y: 12 },
    { type: 'koopa', x: 34, y: 10, variant: 'green' },
    { type: 'goomba', x: 46, y: 12 },
    { type: 'piranha', x: 68.5, y: 10 },
    { type: 'piranha', x: 76.5, y: 9 },
    { type: 'goomba', x: 82, y: 12 },
    { type: 'goomba', x: 84, y: 12 },
    { type: 'buzzy', x: 99, y: 12 },
    { type: 'koopa', x: 110, y: 12, variant: 'red' },
    { type: 'goomba', x: 118, y: 12 },
    { type: 'buzzy', x: 138, y: 12 },
    { type: 'koopa', x: 143, y: 12, variant: 'green' },
    // The pressure stacks over the long coin corridor, then clears for the lift.
    { type: 'goomba', x: 156, y: 12 },
    { type: 'goomba', x: 158, y: 12 },
    { type: 'koopa', x: 163, y: 12, variant: 'red' },
    { type: 'goomba', x: 166, y: 12 },
    { type: 'goomba', x: 176, y: 12 },
    { type: 'buzzy', x: 178, y: 12 },
    { type: 'goomba', x: 180, y: 12 },
    // The lift to the upper deck. Authored here rather than as an '@' tile
    // because the tile anchor cannot carry options and would default to a
    // horizontal slider; this one has to be an elevator. It hangs at cols
    // 184-186 and runs between y=112 (flush with the stone shelf at 187) and
    // y=192 (one tile over the cavern floor, so it can be jumped onto).
    { type: 'platform', x: 185, y: 9.5, mode: 'vertical', range: 40, tiles: 3, speed: 0.75, dir: -1 },
  ],
  warps: [
    { from: { x: 193, y: 12 }, dir: 'right', to: { area: '1-2b', x: 2.5, y: 11, exit: 'up' } },
    { from: { x: 210, y: 5 }, dir: 'down', to: { area: '1-2c', x: 2.5, y: 3, exit: 'down' } },
    { from: { x: 214, y: 5 }, dir: 'down', to: { area: '1-2d', x: 2.5, y: 3, exit: 'down' } },
  ],
  areas: { '1-2b': SURFACE, '1-2c': GROTTO, '1-2d': VAULT },
};
