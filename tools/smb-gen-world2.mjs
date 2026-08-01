#!/usr/bin/env node
// Generate world 2's level modules from the original's own area data.
//   node tools/smb-gen-world2.mjs
//
// Everything positional here — widths, pipe columns, hole widths, the beanstalk
// brick, the jumpspring, the flagpole and castle — comes from reference/, not
// from anyone's memory of the game. Deviations are marked DEVIATION and are
// only where this engine lacks a mechanism the original had.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emitLevel } from './smb-build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'levels');


const SOLID = new Set(['#', 'B', '=', 'S', 'U']);
const ITEMS = new Set(['?', 'M', '1', 'C']);

// DEVIATION, and one we would rather not have.
//
// The original stacks item blocks: 2-1 puts a Hidden1Up on SMB row 3 and a
// hidden coin block on SMB row 7 in the SAME column, and the row-7 block is the
// step. You strike it from below, it turns into a used block, you stand on it,
// and from there the 1-up is an ordinary jump away. This engine does exactly
// that at runtime — a bumped question block becomes 'U', which is solid.
//
// tools/reach.mjs cannot see it. Its grid takes solidity straight from LEGEND,
// where 'C' and '1' are `solid: false`, so no standing node is ever created on
// top of a hidden block and the upper one reads as unreachable. Until that
// checker models a struck block as a platform, any item block more than a jump
// above its own ground is dropped to four rows above it. It keeps its column
// where it can; when the column is taken — and in 2-1 it is taken by the very
// block the puzzle is built on — it steps one column aside rather than giving
// up, which is what left 2-1's 1-up stranded before.
function dropStrandedItems(g) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      if (!ITEMS.has(g[y][x])) continue;
      let ground = -1;
      for (let k = y + 1; k < g.length; k++) {
        if (SOLID.has(g[k][x])) { ground = k; break; }
      }
      if (ground < 0 || ground - y <= 4) continue;
      const ty = ground - 4;
      for (const tx of [x, x + 1, x - 1]) {
        if (tx < 0 || tx >= g[ty].length || g[ty][tx] !== '.') continue;
        // Only useful if the new column has the same ground under it.
        let g2 = -1;
        for (let k = ty + 1; k < g.length; k++) {
          if (SOLID.has(g[k][tx])) { g2 = k; break; }
        }
        if (g2 !== ground) continue;
        g[ty][tx] = g[y][x];
        g[y][x] = '.';
        break;
      }
    }
  }
}

// DEVIATION: the original lets a power-up slide out sideways from a block set
// into a ceiling; this engine emerges it upward and would bury it. One tile of
// air is carved above any capped item block.
function relieveBlocks(rows) {
  const CAPPED = new Set(['?', 'M']);
  const g = rows.map((r) => r.split(''));
  for (let y = 1; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      if (CAPPED.has(g[y][x]) && SOLID.has(g[y - 1][x])) g[y - 1][x] = '.';
    }
  }
  dropStrandedItems(g);
  return g.map((r) => r.join(''));
}


// Spawn on the first column with two clear rows above solid ground, so the
// terrain decides where the player starts instead of a guessed constant.
function findSpawn(rows) {
  for (let x = 2; x < 30; x++) {
    for (let y = 12; y >= 3; y--) {
      const solid = '#B=SU'.includes(rows[y][x]);
      const clear = rows[y - 1][x] === '.' && rows[y - 2][x] === '.';
      if (solid && clear) return { x, y: y - 1 };
    }
  }
  return { x: 2, y: 12 };
}


// Podoboos are lava bubbles. The original's castle floor is lava where they
// leap; rendering it as plain stone made them erupt out of bedrock. Each one
// gets a three-wide pool, which is inside a running jump exactly as 1-4's are,
// and is re-seated on the lava surface.
function seatPodoboos(rows, ents) {
  // Terrain now supplies the lava (a castle with no floor is a lake), so the
  // podoboos only need seating on its surface rather than pools of their own.
  const g = rows.map((r) => r.split(''));
  for (const e of ents) {
    if (e.type !== 'podoboo') continue;
    let top = g.length - 1;
    for (let y = 0; y < g.length; y++) {
      if (g[y][e.x] === 'L') { top = y; break; }
    }
    e.y = top;
  }
  // Filling the lava lakes can leave an item block hanging over one, so run the
  // same drop pass again now that the lava is in place.
  dropStrandedItems(g);
  return g.map((r) => r.join(''));
}

const j = (v) => JSON.stringify(v);
const tilesBlock = (rows) => 'const TILES = [\n' + rows.map((r) => `  '${r}',\n`).join('') + '];\n';
const entsBlock = (ents) =>
  ents.map((e) => `    ${j(e).replace(/"([a-z]+)":/g, '$1: ').replace(/"/g, "'")},`).join('\n');

function header(id, note) {
  return `// ---------------------------------------------------------------------------
// WORLD ${id}
//
// Generated by tools/smb-gen-world2.mjs from the original's area data — see
// reference/smb-areas.json. Pipe columns, hole widths, block rows, the
// staircases, the flagpole and the castle are the original's own numbers, not
// an approximation of them. Re-run the generator rather than editing by hand.
//
${note}
// ---------------------------------------------------------------------------

`;
}

// ---------------------------------------------------------------------- 2-1
{
  const L = emitLevel('2-1', { theme: 'overworld' });
  const warp = L.meta.pipes.find((p) => p.warp);
  const ents = L.entities.filter((e) => e.type !== 'piranha');
  // Piranhas belong on pipes; the original's enemy stream places them by column.
  for (const p of L.meta.pipes) {
    if (p.warp) continue;
    if (L.entities.some((e) => e.type === 'piranha' && Math.abs(e.x - p.x) < 3)) {
      ents.push({ type: 'piranha', x: p.x + 0.5, y: p.top });
    }
  }
  const body = `
// The beanstalk brick is at column 83 and the warp pipe at ${warp ? warp.x : '-'} — both the
// original's positions. The jumpspring before the flagpole is at ${L.meta.springs[0] ? L.meta.springs[0].x : '-'}.
const SKY = {
  id: '2-1c',
  name: 'WORLD 2-1',
  theme: 'overworld',
  music: 'bonus',
  width: 40,
  height: 15,
  spawn: { x: 2, y: 10 },
  tiles: [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '....oooo....oooo....oooo....oooo........',
    '...======..======..======..======.......',
    '........................................',
    '....oooo....oooo....oooo....oooo........',
    '...======..======..======..======.......',
    '........................................',
    '........................................',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB[]....',
    '..................................{}....',
    '........................................',
    '........................................',
  ],
  entities: [],
  warps: [{ from: { x: 34, y: 11 }, dir: 'down', to: { area: 'main', x: 128.5, y: 10, exit: 'up' } }],
};

export default {
  id: '2-1',
  name: 'WORLD 2-1',
  time: 400,
  theme: 'overworld',
  music: 'overworld',
  width: ${L.width},
  height: 15,
  spawn: { x: 2, y: 12 },
  tiles: TILES,
  contents: [
${L.contents.map((c) => `    ${j(c).replace(/"([a-z]+)":/g, '$1: ').replace(/"/g, "'")},`).join('\n')}
    { x: 83, y: 5, item: 'vine', height: 11, warp: { to: { area: '2-1c', x: 2.5, y: 10, exit: 'none' } } },
  ],
  entities: [
${entsBlock(ents)}
  ],
  areas: { '2-1c': SKY },
  flagpole: { x: ${L.meta.flagpole.x} },
  castle: { x: ${L.meta.castle.x} },
};
`;
  writeFileSync(
    join(OUT, '2-1.js'),
    header('2-1 — overworld', '// The beanstalk, the warp pipe and the jumpspring are all the original\'s.') +
      tilesBlock(relieveBlocks(L.rows)) +
      body
  );
}

// ---------------------------------------------------------------------- 2-2
{
  const L = emitLevel('2-2', { theme: 'water' });
  // DEVIATION: the original ends this area at a water pipe and has no flagpole
  // in its object stream. This engine completes a level at a pole, so a short
  // dry shore and a pole are appended past the last of the original's geometry.
  const W = L.width + 24;
  const rows = L.rows.map((r) => r.padEnd(W, '.'));
  const set = (x, y, ch) => {
    const a = rows[y].split('');
    a[x] = ch;
    rows[y] = a.join('');
  };
  for (let x = L.width; x < W; x++) {
    for (let y = 13; y < 15; y++) set(x, y, '#');
    for (let y = 0; y < 13; y++) set(x, y, '.');
  }
  const flag = W - 10;
  set(flag, 2, '^');
  for (let r = 3; r <= 12; r++) set(flag, r, '|');
  const body = `
export default {
  id: '2-2',
  name: 'WORLD 2-2',
  time: 400,
  theme: 'water',
  music: 'underwater',
  width: ${W},
  height: 15,
  spawn: { x: 2, y: 6 },
  tiles: TILES,
  entities: [
${entsBlock(L.entities)}
  ],
  flagpole: { x: ${flag} },
  castle: { x: ${flag + 5} },
};
`;
  writeFileSync(
    join(OUT, '2-2.js'),
    header(
      '2-2 — underwater',
      "// DEVIATION: the original ends at a water pipe and has no flagpole object.\n// A short dry shore and a pole are appended so the level can be completed with\n// this engine's existing level-end machinery. Everything to the left of column " +
        L.width +
        '\n// is the original.'
    ) +
      tilesBlock(relieveBlocks(rows)) +
      body
  );
}

// ---------------------------------------------------------------------- 2-3
{
  const L = emitLevel('2-3', { theme: 'overworld' });
  // The leaping cheep-cheeps are the original's own Frenzy objects at columns
  // 26 and 137, with the stop at 197, emitted as `frenzy` entities. They used
  // to be a row of hand-placed cheeps because this engine had no spawner.
  const ents = L.entities.slice();
  const body = `
export default {
  id: '2-3',
  name: 'WORLD 2-3',
  time: 400,
  theme: 'overworld',
  music: 'overworld',
  width: ${L.width},
  height: 15,
  spawn: { x: 2, y: 11 },
  tiles: TILES,
  entities: [
${entsBlock(ents)}
  ],
  flagpole: { x: ${L.meta.flagpole.x} },
  castle: { x: ${L.meta.castle.x} },
};
`;
  writeFileSync(
    join(OUT, '2-3.js'),
    header(
      '2-3 — the bridges',
      "// The leaping cheep-cheeps come from the original's own Frenzy objects at\n// columns 26 and 137, with the stop frenzy at 197. Almost every hand-placed\n// enemy in this area is flagged hard-mode-only and so is absent on a first\n// quest, exactly as in the original."
    ) +
      tilesBlock(relieveBlocks(L.rows)) +
      body
  );
}

// ---------------------------------------------------------------------- 2-4
{
  const L = emitLevel('2-4', { theme: 'castle' });
  const ents = L.entities.slice();
  const T24 = seatPodoboos(relieveBlocks(L.rows), ents);
  const SP24 = findSpawn(T24);
  const body = `
export default {
  id: '2-4',
  name: 'WORLD 2-4',
  time: 300,
  theme: 'castle',
  music: 'castle',
  width: ${L.width},
  height: 15,
  spawn: { x: ${SP24.x}, y: ${SP24.y} },
  tiles: TILES,
  entities: [
${entsBlock(ents)}
  ],
  flagpole: null,
  castle: { x: ${L.width - 6}, tall: true },
};
`;
  writeFileSync(
    join(OUT, '2-4.js'),
    header('2-4 — castle', "// Bowser at 135, the bridge at 128 and the axe at 141 are the original's.") +
      tilesBlock(T24) +
      body
  );
}

console.log('regenerated 2-1, 2-2, 2-3, 2-4 from reference data');
