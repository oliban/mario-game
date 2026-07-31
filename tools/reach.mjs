#!/usr/bin/env node
// Find places a player can get to but not get out of.
//
// SMB's camera never scrolls back, so the left edge of the screen is a hard wall.
// That makes any spot whose only exit is leftward a permanent trap: the level is
// unwinnable and the player has to burn a life on the timer. This walks every
// level and sub-area and reports columns that are reachable from the spawn but
// from which the goal is not reachable.
//
//   node tools/reach.mjs            # all levels
//   node tools/reach.mjs 1-2        # one level
//
// The movement model is deliberately conservative: a run jump clears about 4
// tiles of height and 5 of gap, so anything needing more is treated as blocked.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './serve.mjs';

const MAX_JUMP_UP = 4; // tiles of height a run jump gains
const MAX_GAP = 5; // tiles of horizontal gap a run jump clears

const only = process.argv[2] || null;

const { LEGEND } = await import(pathToFileURL(join(ROOT, 'src/game/world.js')).href);

function surfaceOf(lvl) {
  const T = lvl.tiles;
  const H = T.length;
  const W = lvl.width || T[0].length;
  const solid = (x, y) => {
    if (x < 0 || x >= W) return true;
    if (y < 0) return false;
    if (y >= H) return true;
    const r = LEGEND[T[y][x]];
    return !!(r && r.solid);
  };
  // For each column: the y of the highest standable surface (the tile ABOVE the
  // first solid tile scanning down). null when the column is a bottomless pit.
  const surf = new Array(W).fill(null);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (solid(x, y)) {
        surf[x] = y - 1;
        break;
      }
    }
  }
  return { surf, W, H, solid };
}

function analyse(name, lvl) {
  const { surf, W } = surfaceOf(lvl);
  const spawnX = Math.round((lvl.spawn && lvl.spawn.x) || 2);

  // Adjacency: from column a you can reach column b.
  function canStep(a, b) {
    const sa = surf[a];
    const sb = surf[b];
    if (sa == null) return false;
    if (sb == null) return false; // a pit, not a landing
    const dist = Math.abs(b - a);
    if (dist > MAX_GAP) return false;
    const rise = sa - sb; // positive = stepping UP
    if (rise > MAX_JUMP_UP) return false;
    return true;
  }

  function reachable(from, dirs) {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const x = stack.pop();
      for (const d of dirs) {
        for (let step = 1; step <= MAX_GAP; step++) {
          const nx = x + d * step;
          if (nx < 0 || nx >= W || seen.has(nx)) continue;
          if (canStep(x, nx)) {
            seen.add(nx);
            stack.push(nx);
          }
        }
      }
    }
    return seen;
  }

  // Where the player is actually trying to get to.
  const goalX = lvl.flagpole ? Math.round(lvl.flagpole.x) : W - 2;

  // Forward-only reachability models the no-scroll-back camera.
  const fromSpawn = reachable(spawnX, [1, -1]);
  const traps = [];
  for (const x of fromSpawn) {
    if (x >= goalX) continue;
    // From here, can the goal still be reached going forward?
    const onward = reachable(x, [1]);
    if (!onward.has(goalX) && ![...onward].some((v) => v >= goalX)) traps.push(x);
  }
  traps.sort((a, b) => a - b);

  const runs = [];
  let cur = null;
  for (const x of traps) {
    if (cur && x === cur.x1 + 1) cur.x1 = x;
    else {
      cur = { x0: x, x1: x, surfaceY: surf[x] };
      runs.push(cur);
    }
  }
  if (runs.length) {
    console.log(`\n${name}  (spawn x=${spawnX}, goal x=${goalX})`);
    for (const r of runs) {
      console.log(`  TRAP columns ${r.x0}..${r.x1}  floor y=${r.surfaceY}`);
    }
  }
  return runs.length;
}

const dir = join(ROOT, 'src/data/levels');
const files = readdirSync(dir).filter((f) => /^\d+-\d+\.js$/.test(f)).sort();
let total = 0;
for (const f of files) {
  const id = f.replace('.js', '');
  if (only && id !== only) continue;
  const mod = await import(pathToFileURL(join(dir, f)).href);
  const lvl = mod.default;
  total += analyse(id, lvl);
  for (const [aid, area] of Object.entries(lvl.areas || {})) {
    total += analyse(`${id}/${aid}`, area);
  }
}
console.log(total ? `\n${total} trap region(s) found.` : '\nNo traps found.');
process.exit(total ? 1 : 0);
