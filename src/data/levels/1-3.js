// ---------------------------------------------------------------------------
// WORLD 1-3 — athletic, 180 tiles. Tree tops over open sky.
//
// The first ledge sits over solid ground on purpose: that is where you learn a
// red koopa turns at an edge instead of walking off it, with nothing to lose.
// From x=19 the ground is gone and every landing is a canopy. Gaps run 3 tiles
// while the level climbs, 5 across the lift chasm — a full-run jump clears 6,
// so the chasm is honest even if you never touch a lift.
//
// The middle of the level is a real fork, not scenery. Off the canopy at 77-80
// the same three-tile gap gives two landings: up onto the high canopy at row 6
// (84-92) for seven coins and the 1-Up hidden in the sky at (88,2), or down
// onto the low canopy at row 10 (84-92) for three coins, a goomba and no risk.
// Both rejoin at 96-99. The 1-Up is 96px above the low line, i.e. out of reach
// of any jump from it, so the height is what buys it.
//
// Legend: . air  # ground/canopy  = brick  ? coin block  M power block
//         1 hidden 1-up  o coin  S stair  P one-way platform  @ lift anchor
//         | ^ flagpole  X castle  t b h c decor
// ---------------------------------------------------------------------------

const TILES = [
  '....................................................................................................................................................................................',
  '....................................................................................................................................................................................',
  '......cc..................cc................ccc................cc.................cc....1......ccc................................................ccc......cc...........^...........',
  '.................ccc................................cc...........................................................cc...........cc.....................................cc.|...........',
  '....................................cc..................................cc................................................................cc............................|...........',
  '.....................................................................................ooooooo.........cc................ccc.........................................S....|...........',
  '.......................................oooo.........................................#########.....................................................................SS....|...........',
  '.......................................####.............................................t........................................................................SSS....|....X.X....',
  '........................................t...............?....................####.......t.......####............................................................SSSS....|....XXX....',
  '.....M.........?.............oo#####....t.....#####...........................t......ooot........t.............................PPP.............................SSSSS....|...X.X.X...',
  '........#####.......o.......o....t..............t...................oo####....t.....#########....t.....####..............PPP........@.........................SSSSSS....|...XXXXX...',
  '......hhh.t........o.o######.....t..............t.....####.........o...t..............t...t.............t.............@................######................SSSSSSS....|......XXhhh',
  '.....hhhhht.bb.hhh......t..............................t.....######....t................................t.....######.....................t......#####..bbb..SSSSSSSS.bbb|......XXhhh',
  '###################.....t..............................t.......t................................................t........................t........t..###############################',
  '###################............................................t................................................t.................................t..###############################',
];

export default {
  id: '1-3',
  name: 'WORLD 1-3',
  time: 300,
  theme: 'athletic',
  music: 'athletic',
  width: 180,
  height: 15,
  spawn: { x: 2, y: 12 },
  tiles: TILES,
  entities: [
    { type: 'koopa', x: 10, y: 9, variant: 'red' },
    { type: 'koopa', x: 24, y: 10, variant: 'red' },
    { type: 'goomba', x: 33, y: 8 },
    { type: 'koopa', x: 48, y: 8, variant: 'red' },
    { type: 'koopa', x: 63, y: 11, variant: 'red' },
    { type: 'koopa', x: 65, y: 11, variant: 'red' },
    { type: 'goomba', x: 79, y: 7 },
    // High line (row 6) — two enemies on a nine-tile canopy over open sky.
    { type: 'koopa', x: 87, y: 5, variant: 'red' },
    { type: 'goomba', x: 90, y: 5 },
    // Low line (row 10) — one, and solid canopy under both feet.
    { type: 'goomba', x: 88, y: 9 },
    { type: 'goomba', x: 105, y: 9 },
    { type: 'goomba', x: 112, y: 11 },
    { type: 'koopa', x: 125, y: 6, variant: 'red', winged: true, fly: true, range: 48 },
    { type: 'koopa', x: 137, y: 10, variant: 'red' },
    { type: 'goomba', x: 146, y: 11 },
    { type: 'koopa', x: 153, y: 12, variant: 'green' },
  ],
  warps: [],
  areas: {},
  flagpole: { x: 168 },
  // Base cut open at 172-174 so the walk-off reaches the door at col 174
  // (hidden at castle.x * 16 + 22) instead of stalling against the wall.
  castle: { x: 173 },
};
