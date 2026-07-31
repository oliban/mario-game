// ---------------------------------------------------------------------------
// WORLD 1-4 — castle, 192 tiles.
//
// Order of teaching: a three-ball fire bar at col 20 hung high enough that its
// lowest reach (y=156) stops 36px above a walking Mario's head, so the first
// one is genuinely walked under; then lava you only have to jump; then lava
// with a bar turning over the crossing at 58-61 — its arc never touches either
// lip of that jump, so you can stand on both sides and pick your moment; then
// the fork.
//
// The fork is a single stone stair at 77-79 with a coin row on top of it. That
// stair is the only way onto the row-8 ledge chain (80-94, 98-107, 110-118) —
// a jump from the floor to row 8 needs 80px and the engine tops out at 77.5 —
// so it is signposted rather than hidden. The corridor underneath is the other
// branch: it pays a ten-coin row at 84-93 and a hidden 1-Up at (96,10), and it
// ends at the side pipe at 115 which drops you back at x=76, on the stair's
// doorstep. Wrong branch costs seconds and buys coins; it never costs a life.
//
// The bridge is stone over a lava lake, cols 158-178, with Bowser on it and a
// hammer bro guarding the run-up at 148. The axe sits at col 182, four tiles
// past the far end of the bridge.
//
// Fire bars are authored in `entities` rather than as 'F' tiles because the
// tile anchor cannot carry a ball count and every bar here needs one that is
// not the default six — six balls reach 84px, which is wider than any corridor
// in this level and would swallow the footholds the jumps take off from.
//
// Legend: . air  # stone  X castle brick  B bridge/stone block  L lava
//         M power block  1 hidden 1-up  o coin  < > side pipe  a axe
// ---------------------------------------------------------------------------

const TILES = [
  '################################################################################################################################################################################################',
  '################################################################################################################################################################################################',
  '################################################################################################################################################################################################',
  '...............................######################################..................................................#########################################################################',
  '...............................######################################..................................................#########################################################################',
  '......................................................................................M.........................................................................................................',
  '................................................................................................................................................................................................',
  '....................................................................................ooooooo.........ooooo.......ooooo...........................................................................',
  '................................................................................###############...##########..#########.........................................................................',
  '.............................................................................ooo.....................................##.........................................................................',
  '....................................................######....#######........BBB................1....................##.........................................................................',
  '..........................X.........................######....#######..............................................<>##...........................#####.......BBBBBBBBBBBBBBBBBBBBB...a.........',
  '..........................X.......LLLL......LLLL....######LLLL#######...............oooooooooo.....................<>##.......LLLL..........LLLL..############LLLLLLLLLLLLLLLLLLLLL#############',
  '##################################LLLL######LLLL##########LLLL################################################################LLLL##########LLLL##############LLLLLLLLLLLLLLLLLLLLL#############',
  '##################################LLLL######LLLL##########LLLL################################################################LLLL##########LLLL##############LLLLLLLLLLLLLLLLLLLLL#############',
];

export default {
  id: '1-4',
  name: 'WORLD 1-4',
  time: 300,
  theme: 'castle',
  music: 'castle',
  width: 192,
  height: 15,
  spawn: { x: 2, y: 12 },
  tiles: TILES,
  entities: [
    // Fire bars. `count` sets the ball count; reach is (count-1)*16 + 4 px.
    // 3 -> 36px, 4 -> 52px, 5 -> 68px.
    { type: 'firebar', x: 20, y: 7, count: 3 },
    // Anchored over the LEDGE at 52-57, not over the lava gap at 58-61. Hanging it
    // above the gap forced a frame-perfect jump that had to clear four tiles of lava
    // and thread a rotating bar at the same instant; SMB always sequences these two
    // challenges so you solve the bar on solid ground and then take the jump clean.
    { type: 'firebar', x: 54, y: 8, count: 3, dir: -1 },
    { type: 'firebar', x: 71, y: 9, count: 4, angle: 90 },
    { type: 'firebar', x: 103, y: 5, count: 4, dir: -1 },
    { type: 'firebar', x: 152, y: 8, count: 5, angle: 180 },

    { type: 'buzzy', x: 24, y: 12 },
    { type: 'podoboo', x: 36, y: 12 },
    { type: 'podoboo', x: 45, y: 12 },
    { type: 'buzzy', x: 66, y: 9 },
    // The high line pays coins and the only power block in the castle, and
    // costs three beetles and the bar at 103.
    { type: 'buzzy', x: 88, y: 7 },
    { type: 'buzzy', x: 105, y: 7 },
    { type: 'buzzy', x: 114, y: 7 },
    // The low corridor is quieter — it is a detour, not a punishment.
    { type: 'buzzy', x: 95, y: 12 },
    { type: 'podoboo', x: 127, y: 12 },
    { type: 'podoboo', x: 141, y: 12 },
    { type: 'hammerbro', x: 148, y: 10 },
    { type: 'bowser', x: 172, y: 10, hp: 5, range: 34, facing: -1 },
  ],
  // from.x is the '<' column and from.y the lower pipe row: keying the trigger
  // to the lower row alone halves the window in which a jump can set it off.
  warps: [
    { from: { x: 115, y: 12 }, dir: 'right', to: { area: 'main', x: 76, y: 12 } },
  ],
  areas: {},
};
