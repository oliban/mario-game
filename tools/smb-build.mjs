#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Render a decoded SMB area into this engine's tile grammar.
//
//   node tools/smb-build.mjs 1-1 --check    render and compare with ours
//   node tools/smb-build.mjs 2-1            print the tile rows
//
// Row mapping: ours = SMB + 2. The original's playfield is 13 rows with the
// status bar above it; ours is 15 with the floor at 13-14. Confirmed against
// all four of 1-1's pipes (SMB rows 9/8/7/7 -> ours 11/10/9/9) and against its
// three holes, whose widths are param + 1.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeObjects, decodeEnemies } from './smb-decode.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = JSON.parse(readFileSync(join(ROOT, 'reference', 'smb-areas.json'), 'utf8'));

const H = 15;
const ROW = (r) => r + 2; // SMB row -> ours
const FLOOR_TOP = 13;

// Enemy ids -> our entity types. The group ids ($37-$3e) expand to two or three
// of the same enemy, which is what DoGroup does in the original.
const ENEMY_MAP = {
  0x00: 'koopa:green', 0x02: 'buzzy', 0x03: 'koopa:red', 0x05: 'hammerbro',
  0x06: 'goomba', 0x07: 'blooper', 0x0a: 'cheep:grey', 0x0b: 'cheep:red',
  0x0c: 'podoboo', 0x0d: 'piranha', 0x0e: 'koopa:green', 0x0f: 'koopa:red',
  0x10: 'koopa:green', 0x11: 'lakitu', 0x12: 'spiny', 0x2d: 'bowser',
};
const GROUPS = {
  0x37: ['goomba', 3, 10], 0x38: ['goomba', 3, 6],
  0x39: ['koopa:green', 3, 10], 0x3a: ['koopa:green', 3, 6],
  0x3b: ['goomba', 2, 10], 0x3c: ['goomba', 2, 6],
  0x3d: ['koopa:green', 2, 10], 0x3e: ['koopa:green', 2, 6],
};

export function buildArea(levelId, opts = {}) {
  const entry = REF.levelMap[levelId];
  const area = REF.areas[entry.area];
  const objs = decodeObjects(area.objectBytes);
  const enemies = decodeEnemies(area.enemyBytes);

  const terrain = area.header[1] & 0x0f;
  const width = Math.max(...objs.map((o) => o.x)) + 8;
  const g = Array.from({ length: H }, () => new Array(width).fill('.'));
  const put = (x, y, ch) => {
    if (x >= 0 && x < width && y >= 0 && y < H) g[y][x] = ch;
  };
  const fillCol = (x, y0, y1, ch) => {
    for (let y = y0; y <= y1; y++) put(x, y, ch);
  };

  // TerrainRenderBits, verbatim: two bytes forming a row mask over SMB rows
  // 0-15, bit i of the first byte being row i and bit i of the second row 8+i.
  // Terrain 1 is "no ceiling, floor 2" and comes out as rows 11-12, which is
  // our 13-14 — the floor every hand-authored level already uses.
  const TERRAIN = [
    [0b00000000, 0b00000000], [0b00000000, 0b00011000], [0b00000001, 0b00011000],
    [0b00000111, 0b00011000], [0b00001111, 0b00011000], [0b11111111, 0b00011000],
    [0b00000001, 0b00011111], [0b00000111, 0b00011111], [0b00001111, 0b00011111],
    [0b10000001, 0b00011111], [0b00000001, 0b00000000], [0b10001111, 0b00011111],
    [0b11110001, 0b00011111], [0b11111001, 0b00011000], [0b11110001, 0b00011000],
    [0b11111111, 0b00011111],
  ];

  // Terrain is not one setting for the level: AlterAreaAttributes (row 14)
  // rewrites TerrainControl from its own column onward. That is what makes 2-3
  // a bridge level — it switches to terrain 0, no floor at all, at column 6 —
  // and what opens the lava lake before Bowser's bridge in 2-4.
  const schedule = [{ x: 0, t: terrain }];
  for (const o of objs) {
    if (o.index !== 46) continue;
    if (o.b1 & 0x40) continue; // foreground/colour variant, not terrain
    schedule.push({ x: o.x, t: o.b1 & 0x0f });
  }
  schedule.sort((a, b) => a.x - b.x);
  const terrainAt = (x) => {
    let t = schedule[0].t;
    for (const s of schedule) {
      if (s.x > x) break;
      t = s.t;
    }
    return t;
  };
  const lethal = opts.theme === 'castle' ? 'L' : '.';
  for (let x = 0; x < width; x++) {
    const bits = TERRAIN[terrainAt(x)] || TERRAIN[1];
    const solidRow = (r) => (r < 8 ? (bits[0] >> r) & 1 : (bits[1] >> (r - 8)) & 1);
    for (let r = 0; r <= 12; r++) if (solidRow(r)) put(x, ROW(r), '#');
    if (solidRow(12)) fillCol(x, ROW(12), H - 1, '#');
    // A castle with no floor here is a lava lake, not a clean drop.
    else if (lethal === 'L') fillCol(x, H - 3, H - 1, 'L');
  }

  const meta = { pipes: [], flagpole: null, castle: null, axe: null, springs: [], vine: null, warpPipe: null };
  const contents = [];

  for (const o of objs) {
    const x = o.x;
    const y = ROW(o.row);
    const n = o.param;
    switch (o.name) {
      case 'VerticalPipe':
      case 'VerticalPipe(warp)': {
        const top = y;
        const bottom = FLOOR_TOP - 1;
        put(x, top, '['); put(x + 1, top, ']');
        for (let r = top + 1; r <= bottom; r++) { put(x, r, '{'); put(x + 1, r, '}'); }
        meta.pipes.push({ x, top, warp: o.name.includes('warp') });
        if (o.name.includes('warp')) meta.warpPipe = { x, top };
        break;
      }
      case 'RowOfBricks': for (let i = 0; i <= n; i++) put(x + i, y, '='); break;
      case 'RowOfSolidBlocks': for (let i = 0; i <= n; i++) put(x + i, y, 'B'); break;
      case 'RowOfCoins': for (let i = 0; i <= n; i++) put(x + i, y, 'o'); break;
      case 'ColumnOfBricks': fillCol(x, y, Math.min(H - 1, y + n), '='); break;
      case 'ColumnOfSolidBlocks': fillCol(x, y, Math.min(H - 1, y + n), 'B'); break;
      case 'QBlock(powerup)': put(x, y, 'M'); break;
      case 'QBlock(coin)': put(x, y, '?'); break;
      case 'QBlock(hidden coin)': put(x, y, 'C'); break;
      case 'Hidden1Up': put(x, y, '1'); break;
      case 'Brick(powerup)': put(x, y, '='); contents.push({ x, y, item: 'power' }); break;
      case 'Brick(star)': put(x, y, '='); contents.push({ x, y, item: 'star' }); break;
      case 'Brick(coins)': put(x, y, '='); contents.push({ x, y, item: 'coin', count: 10 }); break;
      case 'Brick(1up)': put(x, y, '='); contents.push({ x, y, item: '1up' }); break;
      case 'Brick(vine)': put(x, y, 'v'); meta.vine = { x, y }; break;
      case 'EmptyBlock': put(x, y, 'U'); break;
      case 'QuestionBlockRow_High': for (let i = 0; i <= n; i++) put(x + i, ROW(3), '?'); break;
      case 'QuestionBlockRow_Low': for (let i = 0; i <= n; i++) put(x + i, ROW(7), '?'); break;
      case 'Hole_Empty': for (let i = 0; i <= n; i++) fillCol(x + i, FLOOR_TOP, H - 1, '.'); break;
      case 'Hole_Water':
        for (let i = 0; i <= n; i++) { fillCol(x + i, FLOOR_TOP, H - 1, '_'); }
        break;
      case 'Bridge_High': for (let i = 0; i <= n; i++) put(x + i, ROW(6), 'B'); break;
      case 'Bridge_Middle': for (let i = 0; i <= n; i++) put(x + i, ROW(7), 'B'); break;
      case 'Bridge_Low': for (let i = 0; i <= n; i++) put(x + i, ROW(9), 'B'); break;
      case 'StaircaseObject':
        // Ascending stair, tallest at the right, sitting on the floor.
        for (let i = 0; i <= n; i++) fillCol(x + i, FLOOR_TOP - 1 - i, FLOOR_TOP - 1, 'S');
        break;
      case 'Jumpspring': meta.springs.push({ x, y }); break;
      case 'Flagpole': meta.flagpole = { x }; break;
      case 'CastleObject': if (x > 8) meta.castle = { x }; break;
      case 'Axe': put(x, y, 'a'); meta.axe = { x, y }; break;
      case 'CastleBridge': for (let i = 0; i < 13; i++) put(x + i, ROW(7), 'B'); break;
      default: break; // scenery, frenzies, scroll locks, ropes
    }
  }

  // Flagpole tiles, using the same convention as the hand-authored levels.
  if (meta.flagpole) {
    const fx = meta.flagpole.x;
    put(fx, 2, '^');
    for (let r = 3; r <= 12; r++) put(fx, r, '|');
  }

  const ents = [];
  for (const e of enemies) {
    if (e.hardOnly) continue;
    const gr = GROUPS[e.id];
    if (gr) {
      const [type, count, row] = gr;
      for (let i = 0; i < count; i++) ents.push({ type, x: e.x + i, y: row + 1 });
      continue;
    }
    const t = ENEMY_MAP[e.id];
    if (!t) continue;
    // Enemies map with +1, not the objects' +2: the original's enemy row is the
    // row the body occupies, so a row-11 koopa stands ON the floor rather than
    // half-buried in its top course.
    ents.push({ type: t, x: e.x, y: e.y + 1 });
  }

  return { width, terrain, tiles: g.map((r) => r.join('')), meta, contents, entities: ents, objs, enemies };
}

// --- CLI ---
if (process.argv[1] && process.argv[1].endsWith('smb-build.mjs')) {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--')) || '1-1';
  const built = buildArea(id);
  if (args.includes('--check')) {
    const mod = await import(`../src/data/levels/${id}.js`);
    const ours = mod.default;
    console.log(`${id}: built width ${built.width}, ours ${ours.width}`);
    console.log(`  flagpole built ${built.meta.flagpole && built.meta.flagpole.x} / ours ${ours.flagpole && ours.flagpole.x}`);
    console.log(`  castle   built ${built.meta.castle && built.meta.castle.x} / ours ${ours.castle && ours.castle.x}`);
    const pipes = (rows) => {
      const out = [];
      rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '[') out.push(x + ':' + y); }));
      return out.join(' ');
    };
    console.log(`  pipes built  ${pipes(built.tiles)}`);
    console.log(`  pipes ours   ${pipes(ours.tiles)}`);
  } else {
    built.tiles.forEach((r, i) => console.log(String(i).padStart(2), r));
    console.log('meta', JSON.stringify(built.meta));
    console.log('entities', built.entities.length);
  }

}

// --- level module emitter -------------------------------------------------
export function emitLevel(id, opts = {}) {
  const b = buildArea(id, opts);
  const rows = b.tiles.slice();
  const W = b.width;

  // Water levels flood every open cell; the top open row becomes the surface.
  if (opts.theme === 'water') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (rows[y][x] === '.') {
          const r = rows[y].split('');
          r[x] = y <= 1 ? '~' : '_';
          rows[y] = r.join('');
        }
      }
    }
  }

  const ents = b.entities.map((e) => {
    const [type, variant] = e.type.split(':');
    return variant ? { type, x: e.x, y: e.y, variant } : { type, x: e.x, y: e.y };
  });
  for (const s of b.meta.springs) ents.push({ type: 'springboard', x: s.x, y: s.y });

  return { id, width: W, rows, meta: b.meta, contents: b.contents, entities: ents, terrain: b.terrain };
}
