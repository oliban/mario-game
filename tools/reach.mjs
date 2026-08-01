#!/usr/bin/env node
// Find places a player can get to but not get out of.
//
// SMB's camera never scrolls back, so the left edge of the screen is a hard wall.
// That makes any spot whose only exit is leftward a permanent trap: the level is
// unwinnable and the player has to burn a life on the timer.
//
//   node tools/reach.mjs            # all levels and sub-areas
//   node tools/reach.mjs 1-2        # one level
//   node tools/reach.mjs 1-2 -v     # also dump the graph stats
//   node tools/reach.mjs 1-2 --patch 198,10=.
//                                   # "what if that block weren't there?" — edits the
//                                   # tile map in memory before analysing. Repeatable.
//
// MODEL
// -----
// A column is not one place. An underground cavern has a ceiling AND a floor;
// a tree-top level has standing room on the canopy and (sometimes) under it.
// So the unit of analysis is a NODE = (column, surfaceY): a tile the player can
// stand in, i.e. free space with support directly beneath it.
//
// Two nodes are connected when the player can actually travel between them: a
// run jump gains about MAX_JUMP_UP tiles of height and clears about MAX_GAP
// tiles of gap, and the flight path has to be clear of solid tiles. Moving
// lifts, springboards, vines and warps get modelled explicitly because they are
// the difference between a level being generous and being broken.
//
// A trap is then a node reachable from the spawn from which no exit is
// reachable — where an exit is the flagpole/axe column, the right edge, or the
// mouth of a warp that leaves the area. "Reachable" is forward-biased: the
// camera never scrolls back, and it sits FOLLOW_X = 112px behind the player, so
// from the furthest column you have reached you may still walk BACKTRACK = 7
// tiles left, and no further. Taking a warp resets the camera, so a warp edge
// clears that limit.
//
// The movement numbers are deliberately conservative. Approximate by design:
//   * flight arcs are checked as "rise to an apex row, cross, drop", not as a
//     real parabola;
//   * a lift is credited with its whole sweep, ignoring whether you can time it;
//   * enemies, shells, and stomping off an enemy are ignored entirely.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './serve.mjs';

const TILE = 16;
const MAX_JUMP_UP = 4; // tiles of height a run jump gains
const MAX_GAP = 5; // tiles of horizontal gap a run jump clears
const FALL_BONUS = 3; // extra tiles of reach when the landing is far below
const SWIM_UP = 8; // water lets you climb as far as you like
const SPRING_UP = 8; // a springboard roughly doubles the jump
const VINE_UP = 12; // a vine reaches the sky
const BACKTRACK = 7; // tiles you can walk left of your furthest point (camera.FOLLOW_X)

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const patches = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--patch') continue;
  const m = /^(\d+),(\d+)=(.)$/.exec(args[i + 1] || '');
  if (!m) {
    console.error(`bad --patch "${args[i + 1]}", want x,y=char`);
    process.exit(2);
  }
  patches.push({ x: +m[1], y: +m[2], ch: m[3] });
  args.splice(i, 2);
  i--;
}
let why = null;
{
  const i = args.indexOf('--why');
  if (i >= 0) {
    const m = /^(\d+),(\d+)$/.exec(args[i + 1] || '');
    if (!m) {
      console.error('bad --why, want x,y');
      process.exit(2);
    }
    why = { x: +m[1], y: +m[2] };
    args.splice(i, 2);
  }
}
const only = args.find((a) => !a.startsWith('-')) || null;

function applyPatches(lvl) {
  for (const p of patches) {
    const row = lvl.tiles[p.y];
    if (row == null || p.x >= row.length) continue;
    lvl.tiles[p.y] = row.slice(0, p.x) + p.ch + row.slice(p.x + 1);
    console.log(`patched (${p.x},${p.y}) '${row[p.x]}' -> '${p.ch}'`);
  }
}

const { LEGEND } = await import(pathToFileURL(join(ROOT, 'src/game/world.js')).href);

const rec = (ch) => LEGEND[ch] || null;
const INF = 1e9;

/**
 * Where you have to be standing for a pipe to swallow you. This mirrors
 * Player._checkPipeEntry exactly, because the difference between "you can still
 * reach the pipe" and "you are stuck forever" in 1-2 is one tile.
 *   down : feet on the lip, either of the two lip columns
 *   right: walking INTO the mouth from the left, body straddling fx-1/fx, with
 *          the player's middle on row fy or fy+1
 */
export function atMouth(x, y, wp) {
  const fx = Math.round(wp.from.x);
  const fy = Math.round(wp.from.y);
  const dir = wp.dir || 'down';
  if (dir === 'down') return (x === fx || x === fx + 1) && y === fy - 1;
  if (dir === 'right') return (x === fx - 1 || x === fx) && (y === fy || y === fy + 1);
  if (dir === 'left') return (x === fx + 1 || x === fx + 2) && (y === fy || y === fy + 1);
  return false;
}

// ---------------------------------------------------------------------------
// Tile queries
// ---------------------------------------------------------------------------

function makeGrid(lvl) {
  const T = lvl.tiles;
  const H = T.length;
  const W = lvl.width || T[0].length;
  const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? null : rec(T[y][x]));

  // Blocks movement from every side.
  const wall = (x, y) => {
    if (x < 0 || x >= W) return true; // level edges are walls
    if (y < 0) return true; // the ceiling of the world
    if (y >= H) return false; // below the floor is a pit, not a wall
    const r = at(x, y);
    if (!r) return false;
    if (r.harm) return true; // lava is not somewhere you fly through
    if (r.platform) return false; // one-way: you pass up through it
    return !!r.solid;
  };

  // Air the player can occupy.
  const free = (x, y) => !wall(x, y) && y >= 0 && y < H;

  // Something you can land on top of.
  const support = (x, y) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    const r = at(x, y);
    if (!r) return false;
    if (r.harm) return false;
    // A bumpable question or hidden block counts as footing even though it is
    // not solid in the map: striking it from below turns it into a used block,
    // which IS solid, and the original builds puzzles on exactly that. 2-1
    // stacks a hidden coin block at (28,9) under a hidden 1-up at (28,5) — you
    // bump the lower one, stand on what it becomes, and take the upper one.
    // Modelling only the static map called that faithful level unplayable.
    return !!(r.solid || r.platform || (r.question && r.bumpable));
  };

  const liquid = (x, y) => {
    const r = at(x, y);
    return !!(r && r.liquid);
  };

  return { T, W, H, at, wall, free, support, liquid };
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function buildNodes(lvl, g) {
  const nodes = [];
  const key = (x, y) => x * 64 + y;
  const byKey = new Map();

  const add = (x, y, extra) => {
    if (x < 0 || x >= g.W || y < 0 || y >= g.H) return null;
    const k = key(x, y);
    if (byKey.has(k)) {
      const n = byKey.get(k);
      if (extra) Object.assign(n, extra);
      return n;
    }
    const n = { x, y, virtual: false, swim: false, exit: false, ...(extra || {}) };
    n.id = nodes.length;
    nodes.push(n);
    byKey.set(k, n);
    return n;
  };

  // Every free tile with support beneath it, at EVERY depth in the column.
  for (let x = 0; x < g.W; x++) {
    for (let y = 0; y < g.H; y++) {
      if (!g.free(x, y)) continue;
      if (g.support(x, y + 1)) add(x, y, { swim: g.liquid(x, y) });
      else if (g.liquid(x, y)) add(x, y, { swim: true }); // treading water counts
    }
  }

  // Moving lifts: level entities and map anchors alike. Credit the whole sweep.
  const lifts = [];
  // A pulley places ONE half in the level data and its partner is created by
  // the entity's constructor, so the second platform is invisible to anything
  // reading the level. Model it here the same way the constructor does —
  // mirrored about the rope's balance point, a rope-span to the right. 4-3 is
  // built almost entirely on balance pairs and reported 76 trap regions
  // without this, while being perfectly playable.
  const addLift = (pos, opts) => {
    lifts.push(liftFrom(pos, opts));
    const mode = opts.mode || opts.kind;
    if (mode !== 'pulley') return;
    const spacing = opts.spacing != null ? opts.spacing : 112;
    const anchorY = opts.anchorY != null ? opts.anchorY : pos.y * TILE - 96;
    lifts.push(
      liftFrom({ x: pos.x + spacing / TILE, y: (2 * anchorY) / TILE - pos.y }, opts)
    );
  };
  for (const spec of lvl.entities || []) {
    if (spec && spec.type === 'platform') addLift(spec, spec);
  }
  for (let y = 0; y < g.H; y++) {
    for (let x = 0; x < g.W; x++) {
      const r = g.at(x, y);
      if (!r || r.anchor !== 'platform') continue;
      addLift({ x, y }, { ...(r.anchorOpts || {}) });
    }
  }
  for (const lift of lifts) {
    lift.nodes = [];
    for (let c = lift.x0; c <= lift.x1; c++) {
      for (let ry = lift.y0; ry <= lift.y1; ry++) {
        const n = add(c, ry, { virtual: true, lift: true });
        if (n) lift.nodes.push(n);
      }
    }
  }

  // Springboards and vine blocks buy extra height for anything standing near them.
  const boosts = [];
  for (const spec of lvl.entities || []) {
    if (spec && spec.type === 'springboard') boosts.push({ x: spec.x, y: spec.y, up: SPRING_UP });
  }
  for (let y = 0; y < g.H; y++) {
    for (let x = 0; x < g.W; x++) {
      const r = g.at(x, y);
      if (r && r.item === 'vine') boosts.push({ x, y, up: VINE_UP });
    }
  }
  for (const n of nodes) {
    for (const b of boosts) {
      if (Math.abs(n.x - b.x) <= 2 && Math.abs(n.y - b.y) <= 3) n.up = Math.max(n.up || 0, b.up);
    }
  }

  return { nodes, byKey, key, lifts };
}

// A lift spec keeps its tile top-left, so its deck top is at spec.y * TILE and
// the row a player standing on it occupies is one above that.
function liftFrom(pos, opts) {
  const mode = opts.mode || opts.kind || 'horizontal';
  const tiles = opts.tiles || opts.width || 3;
  const range = opts.range != null ? opts.range : 64;
  const topPx = pos.y * TILE;
  const standRow = (px) => Math.floor((px - 1) / TILE);
  const x0 = Math.floor(pos.x);
  const lift = { mode, x0, x1: x0 + tiles - 1, y0: standRow(topPx), y1: standRow(topPx) };
  if (mode === 'vertical' || mode === 'pulley') {
    lift.y0 = standRow(topPx - range);
    lift.y1 = standRow(topPx + range);
    if (mode === 'pulley') lift.y0 = standRow(topPx - (opts.spacing != null ? opts.spacing : 112));
  } else if (mode === 'horizontal') {
    lift.x0 = Math.floor((pos.x * TILE - range) / TILE);
    lift.x1 = Math.floor((pos.x * TILE + range) / TILE) + tiles - 1;
  } else if (mode === 'fall') {
    lift.y1 = standRow(topPx) + 6; // it drops away under you
  }
  return lift;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

function makeTravel(g) {
  const colFree = (x, yTop, yBot) => {
    for (let y = yTop; y <= yBot; y++) if (!g.free(x, y)) return false;
    return true;
  };

  return function canTravel(a, b) {
    if (a === b) return false;
    const dx = b.x - a.x;
    const adx = Math.abs(dx);
    const rise = a.y - b.y; // > 0 means b is higher

    const jumpUp = a.swim || b.swim ? SWIM_UP : Math.max(MAX_JUMP_UP, a.up || 0);
    if (rise > jumpUp) return false;

    const drop = Math.max(0, -rise);
    let maxDx = MAX_GAP + Math.min(FALL_BONUS, drop);
    if (a.swim || b.swim) maxDx = MAX_GAP;
    if (adx > maxDx) return false;

    // Rise to an apex row, cross at that row, drop onto b.
    const hi = Math.min(a.y, b.y);
    const lo = Math.max(0, a.y - jumpUp);
    for (let p = hi; p >= lo; p--) {
      if (!colFree(a.x, p, a.y)) break; // ceiling above a; no higher apex is possible
      if (!colFree(b.x, p, b.y)) continue;
      let clear = true;
      const step = dx > 0 ? 1 : -1;
      for (let c = a.x + step; c !== b.x; c += step) {
        if (!g.free(c, p)) {
          clear = false;
          break;
        }
      }
      if (clear) return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * The whole traversal model for one area, as data. Exported so other tools
 * (playthrough.mjs) can ask "is this block reachable?" without re-deriving it.
 */
export function buildLevelGraph(lvl, areaKey = 'main') {
  const g = makeGrid(lvl);
  const { nodes, byKey, key, lifts } = buildNodes(lvl, g);
  const canTravel = makeTravel(g);

  // --- adjacency -----------------------------------------------------------
  const byColumn = new Map();
  for (const n of nodes) {
    if (!byColumn.has(n.x)) byColumn.set(n.x, []);
    byColumn.get(n.x).push(n);
  }
  const out = nodes.map(() => []);
  const warpOut = nodes.map(() => []);
  const SPAN = MAX_GAP + FALL_BONUS;
  for (const a of nodes) {
    for (let c = a.x - SPAN; c <= a.x + SPAN; c++) {
      const col = byColumn.get(c);
      if (!col) continue;
      for (const b of col) if (canTravel(a, b)) out[a.id].push(b.id);
    }
  }
  // Riding a lift joins every tile of its sweep.
  for (const lift of lifts) {
    for (const a of lift.nodes) {
      for (const b of lift.nodes) if (a !== b) out[a.id].push(b.id);
    }
  }

  // --- goal and exits ------------------------------------------------------
  let goalX = null;
  if (lvl.flagpole) goalX = Math.round(lvl.flagpole.x);
  if (goalX == null) {
    for (let y = 0; y < g.H && goalX == null; y++) {
      const i = lvl.tiles[y].indexOf('a');
      if (i >= 0) goalX = i;
    }
  }
  if (goalX == null) goalX = g.W - 2;

  let warpExits = 0;
  for (const wp of lvl.warps || []) {
    // A warp that leaves the LEVEL — to another level, or one that simply ends
    // it — is an exit too. Only `to.area` was checked, so these fell into the
    // in-area branch and were given an edge to whatever nearestNode(undefined,
    // undefined) happened to return. 4-2 reported 39 trap regions on that
    // alone; 2-2 passed only because its geometry never exposed it.
    if (wp.to && (wp.to.level || wp.to.complete)) {
      for (const n of nodes) if (atMouth(n.x, n.y, wp)) n.exit = true;
      warpExits++;
      continue;
    }
    const dest = wp.to && wp.to.area;
    if (dest && dest !== areaKey) {
      // Leaves the area entirely: reaching the mouth is a win here.
      for (const n of nodes) if (atMouth(n.x, n.y, wp)) n.exit = true;
      warpExits++;
    } else {
      // Stays in the area (1-4's maze loop). An ordinary edge — but taking it
      // re-seats the camera, so it is flagged as a warp.
      const to =
        landingNode(byKey, key, g, wp.to.x, wp.to.y) || nearestNode(nodes, wp.to.x, wp.to.y);
      if (to) for (const n of nodes) if (atMouth(n.x, n.y, wp)) warpOut[n.id].push(to.id);
    }
  }
  for (const n of nodes) if (n.x >= goalX) n.exit = true;

  // --- the spawn -----------------------------------------------------------
  const spawnX = Math.round((lvl.spawn && lvl.spawn.x) || 2);
  const spawnY = Math.round((lvl.spawn && lvl.spawn.y) != null ? lvl.spawn.y : 12);
  const start = landingNode(byKey, key, g, spawnX, spawnY) || nearestNode(nodes, spawnX, spawnY);

  // Reachability under the camera rule. `best[i]` is the smallest "furthest
  // column reached" with which the player can be standing on node i; a smaller
  // value means more of the level is still behind the camera edge, so this is a
  // shortest-path search on that value rather than a plain flood.
  const reach = (fromId) => {
    const best = new Int32Array(nodes.length).fill(INF);
    const queued = new Uint8Array(nodes.length);
    best[fromId] = nodes[fromId].x;
    const q = [fromId];
    queued[fromId] = 1;
    while (q.length) {
      const i = q.shift();
      queued[i] = 0;
      const m = best[i];
      const relax = (j, nm) => {
        if (nm >= best[j]) return;
        best[j] = nm;
        if (!queued[j]) {
          queued[j] = 1;
          q.push(j);
        }
      };
      for (const j of out[i]) {
        if (nodes[j].x < m - BACKTRACK) continue; // behind the camera edge
        relax(j, Math.max(m, nodes[j].x));
      }
      for (const j of warpOut[i]) relax(j, nodes[j].x); // a pipe re-seats the camera
    }
    return best;
  };

  const fromSpawn = start ? reach(start.id) : new Int32Array(nodes.length).fill(INF);
  const nodeAt = (x, y) => byKey.get(key(x, y)) || null;
  const reachedFromSpawn = (n) => !!n && fromSpawn[n.id] < INF;

  return {
    grid: g,
    nodes,
    lifts,
    out,
    warpOut,
    goalX,
    warpExits,
    spawn: { x: spawnX, y: spawnY },
    start,
    reach,
    fromSpawn,
    nodeAt,
    reachedFromSpawn,
    INF,
  };
}

/** Nodes reachable from the spawn from which no exit is reachable. */
export function findTraps(gr) {
  const traps = [];
  for (const n of gr.nodes) {
    if (gr.fromSpawn[n.id] >= INF) continue;
    if (n.exit) continue;
    if (n.virtual) continue; // a lift deck is not a place you get stranded
    const onward = gr.reach(n.id);
    let ok = false;
    for (let i = 0; i < gr.nodes.length && !ok; i++) {
      if (onward[i] < INF && gr.nodes[i].exit) ok = true;
    }
    if (!ok) traps.push(n);
  }
  return traps;
}

function analyse(name, lvl, areaKey) {
  const gr = buildLevelGraph(lvl, areaKey);
  if (!gr.nodes.length) {
    console.log(`\n${name}: no standable tile anywhere — level is unplayable.`);
    return 1;
  }
  if (!gr.start) {
    console.log(`\n${name}: spawn (${gr.spawn.x},${gr.spawn.y}) has no floor under it.`);
    return 1;
  }

  if (why) {
    const n = gr.nodeAt(why.x, why.y);
    if (n) {
      const r = gr.reach(n.id);
      const got = gr.nodes.filter((m) => r[m.id] < INF);
      console.log(
        `\n${name}: from (${n.x},${n.y}) you can reach ${got.length} node(s): ` +
          got.map((m) => `${m.x},${m.y}${m.exit ? '*' : ''}${m.virtual ? '~' : ''}`).join(' ')
      );
    }
  }

  const traps = findTraps(gr);

  if (verbose) {
    let reached = 0;
    for (let i = 0; i < gr.nodes.length; i++) if (gr.fromSpawn[i] < INF) reached++;
    console.log(
      `\n${name}: ${gr.nodes.length} nodes, ${gr.out.reduce((a, b) => a + b.length, 0)} edges, ` +
        `${gr.lifts.length} lift(s), goal x=${gr.goalX}, ` +
        `${gr.warpExits} warp exit(s), ${gr.nodes.filter((n) => n.exit).length} exit node(s), ` +
        `reachable=${reached}`
    );
  }

  // Group traps into contiguous (surfaceY, column-range) runs.
  traps.sort((a, b) => a.y - b.y || a.x - b.x);
  const runs = [];
  for (const n of traps) {
    const last = runs[runs.length - 1];
    if (last && last.y === n.y && n.x === last.x1 + 1) last.x1 = n.x;
    else runs.push({ y: n.y, x0: n.x, x1: n.x });
  }
  runs.sort((a, b) => a.x0 - b.x0 || a.y - b.y);

  if (runs.length) {
    console.log(`\n${name}  (spawn ${gr.spawn.x},${gr.start.y}  goal x=${gr.goalX})`);
    for (const r of runs) {
      const span = r.x0 === r.x1 ? `column ${r.x0}` : `columns ${r.x0}..${r.x1}`;
      console.log(`  TRAP ${span}  standing on y=${r.y}`);
    }
  }
  return runs.length;
}

// Spawns and warp destinations are written in mid-air; the player falls to the
// first surface below.
function landingNode(byKey, key, g, x, y) {
  const tx = Math.round(x);
  for (let ty = Math.round(y); ty < g.H; ty++) {
    const n = byKey.get(key(tx, ty));
    if (n) return n;
  }
  return null;
}

function nearestNode(nodes, x, y) {
  let best = null;
  let bd = Infinity;
  for (const n of nodes) {
    const d = Math.abs(n.x - x) * 4 + Math.abs(n.y - y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return bd <= 40 ? best : null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const dir = join(ROOT, 'src/data/levels');
  const files = readdirSync(dir)
    .filter((f) => /^\d+-\d+\.js$/.test(f))
    .sort();
  return (async () => {
    let total = 0;
    let checked = 0;
    for (const f of files) {
      const id = f.replace('.js', '');
      if (only && id !== only) continue;
      const mod = await import(pathToFileURL(join(dir, f)).href);
      const lvl = mod.default;
      if (only) applyPatches(lvl);
      total += analyse(id, lvl, 'main');
      checked++;
      for (const [aid, area] of Object.entries(lvl.areas || {})) {
        total += analyse(`${id}/${aid}`, area, aid);
        checked++;
      }
    }
    console.log(
      total
        ? `\n${total} trap region(s) found in ${checked} area(s).`
        : `\nNo traps found in ${checked} area(s).`
    );
    process.exit(total ? 1 : 0);
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
