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
//
// SOLIDITY. The parser writes metatiles into a 13-row buffer and only copies a
// metatile into the collision buffer when it clears the bar for its top two
// bits: $10 at attribute 0, $51 at attribute 1, $88 at attribute 2, and $c0 at
// attribute 3 (BlockBuffLowBounds). That single rule is why tree trunks, bridge
// railings, chains, ropes, castle walls and every piece of scenery below are
// drawn but never collided with, and it decides which of them we emit as decor.
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

// Moving lifts are enemy-stream objects, not area objects: entries $24-$2c of
// the enemy init table are the balance, vertical, large up/down, horizontal,
// drop and small up/down lift platforms. Without them 2-4's rope shaft is an
// unjumpable void.
const LIFTS = {
  0x24: { mode: 'pulley', tiles: 3 },
  0x25: { mode: 'vertical', tiles: 3 },
  0x26: { mode: 'vertical', tiles: 4, dir: -1 },
  0x27: { mode: 'vertical', tiles: 4, dir: 1 },
  0x28: { mode: 'horizontal', tiles: 3 },
  0x29: { mode: 'fall', tiles: 3 },
  0x2a: { mode: 'horizontal', tiles: 3 },
  0x2b: { mode: 'vertical', tiles: 2, dir: -1 },
  0x2c: { mode: 'vertical', tiles: 2, dir: 1 },
};

// --- scenery tables, copied byte for byte from the disassembly --------------
// BackSceneryData is three 48-byte sets, indexed by (page mod 3) * 16 plus the
// set's offset plus the column within the page.
const BSCENE_OFF = [0x00, 0x30, 0x60];
// prettier-ignore
const BACK_SCENERY_DATA = [
  0x93,0x00,0x00,0x11,0x12,0x12,0x13,0x00, 0x00,0x51,0x52,0x53,0x00,0x00,0x00,0x00,
  0x00,0x00,0x01,0x02,0x02,0x03,0x00,0x00, 0x00,0x00,0x00,0x00,0x91,0x92,0x93,0x00,
  0x00,0x00,0x00,0x51,0x52,0x53,0x41,0x42, 0x43,0x00,0x00,0x00,0x00,0x00,0x91,0x92,

  0x97,0x87,0x88,0x89,0x99,0x00,0x00,0x00, 0x11,0x12,0x13,0xa4,0xa5,0xa5,0xa5,0xa6,
  0x97,0x98,0x99,0x01,0x02,0x03,0x00,0xa4, 0xa5,0xa6,0x00,0x11,0x12,0x12,0x12,0x13,
  0x00,0x00,0x00,0x00,0x01,0x02,0x02,0x03, 0x00,0xa4,0xa5,0xa5,0xa6,0x00,0x00,0x00,

  0x11,0x12,0x12,0x13,0x00,0x00,0x00,0x00, 0x00,0x00,0x00,0x9c,0x00,0x8b,0xaa,0xaa,
  0xaa,0xaa,0x11,0x12,0x13,0x8b,0x00,0x9c, 0x9c,0x00,0x00,0x01,0x02,0x03,0x11,0x12,
  0x12,0x13,0x00,0x00,0x00,0x00,0xaa,0xaa, 0x9c,0xaa,0x00,0x8b,0x00,0x01,0x02,0x03,
];
// prettier-ignore
const BACK_SCENERY_MT = [
  0x80,0x83,0x00, 0x81,0x84,0x00, 0x82,0x85,0x00,   // cloud left / middle / right
  0x02,0x00,0x00, 0x03,0x00,0x00, 0x04,0x00,0x00,   // bush left / middle / right
  0x00,0x05,0x06, 0x07,0x06,0x0a, 0x00,0x08,0x09,   // mountain left / middle / right
  0x4d,0x00,0x00,                                   // fence
  0x0d,0x0f,0x4e, 0x0e,0x4e,0x4e,                   // tall tree, short tree
];
// prettier-ignore
const FORE_SCENERY = [
  [0x86,0x87,0x87,0x87,0x87,0x87,0x87,0x87,0x87,0x87,0x87,0x69,0x69], // in water
  [0x00,0x00,0x00,0x00,0x00,0x45,0x47,0x47,0x47,0x47,0x47,0x00,0x00], // wall
  [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x86,0x87], // over water
];

// Which of our decor chars stands in for each background-scenery metatile.
// None of these clears its block-buffer bar, so none of them is solid.
function decorChar(mt) {
  if (mt >= 0x80 && mt <= 0x85) return 'c'; // cloud
  if (mt >= 0x02 && mt <= 0x04) return 'b'; // bush
  if (mt >= 0x05 && mt <= 0x0a) return 'h'; // mountain
  if (mt === 0x0d || mt === 0x0e || mt === 0x0f || mt === 0x4e) return 't'; // tree
  if (mt === 0x4d) return 'b'; // DEVIATION: no fence in our legend, use a bush
  return null;
}

// StaircaseObject is not a triangle measured off a floor. It renders ONE column
// per level column out of these two tables, with StaircaseControl counting down
// from 9. Row + height is 10 in every single entry, so the foot of every step
// is SMB row 10 — an absolute row. That is what lets 2-3's staircase, which
// stands over open water with no floor under it at all, still meet the bridge.
const STAIR_ROW = [0x03, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a];
const STAIR_HEIGHT = [0x07, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x00];

export function buildArea(levelId, opts = {}) {
  const entry = REF.levelMap[levelId];
  const area = REF.areas[entry.area];
  const objs = decodeObjects(area.objectBytes);
  const enemies = decodeEnemies(area.enemyBytes);

  const terrain = area.header[1] & 0x0f;
  // Header byte 1's two MSB pick the AreaStyleObject sub-routine; the value 3
  // means the cloud-block override instead and leaves the style at 0.
  const styleBits = (area.header[1] & 0xc0) >> 6;
  const areaStyle = styleBits === 3 ? 0 : styleBits;
  const bgScenery0 = (area.header[1] & 0x30) >> 4;
  const fore0 = (area.header[0] & 0x07) < 4 ? area.header[0] & 0x07 : 0;

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

  // None of these three is one setting for the level. AlterAreaAttributes (row
  // 14) rewrites TerrainControl and BackgroundScenery from its own column
  // onward when d6 is clear, and ForegroundScenery when d6 is set. That is what
  // makes 2-3 a bridge level — terrain 0, no floor at all, from column 6 — and
  // what opens and closes the lava under 2-4.
  const schedule = [{ x: 0, t: terrain, bg: bgScenery0, fore: fore0 }];
  for (const o of objs) {
    if (o.index !== 46) continue;
    const prev = schedule[schedule.length - 1];
    if (o.b1 & 0x40) {
      const f = o.b1 & 0x07;
      schedule.push({ x: o.x, t: prev.t, bg: prev.bg, fore: f < 4 ? f : 0 });
    } else {
      schedule.push({ x: o.x, t: o.b1 & 0x0f, bg: (o.b1 & 0x30) >> 4, fore: prev.fore });
    }
  }
  const attrAt = (x) => {
    let s = schedule[0];
    for (const c of schedule) {
      if (c.x > x) break;
      s = c;
    }
    return s;
  };
  const terrainAt = (x) => attrAt(x).t;

  // AreaParserCore's order is background scenery, then foreground scenery over
  // it, then terrain over that, and the area objects last — each pass is free
  // to paint over the one before it, so we follow the same order.
  for (let x = 0; x < width; x++) {
    const bg = attrAt(x).bg;
    if (!bg) continue;
    const v = BACK_SCENERY_DATA[(Math.floor(x / 16) % 3) * 16 + BSCENE_OFF[bg - 1] + (x % 16)];
    if (!v) continue;
    let mtx = ((v & 0x0f) - 1) * 3;
    let r = v >> 4;
    for (let i = 0; i < 3 && r < 0x0b; i++, mtx++, r++) {
      const ch = decorChar(BACK_SCENERY_MT[mtx]);
      if (ch) put(x, ROW(r), ch);
    }
  }

  const liquidTop = opts.theme === 'castle' ? 'L' : '~';
  const liquidBody = opts.theme === 'castle' ? 'L' : '_';
  for (let x = 0; x < width; x++) {
    const fore = attrAt(x).fore;
    if (!fore) continue;
    const data = FORE_SCENERY[fore - 1];
    for (let r = 0; r <= 12; r++) {
      const mt = data[r];
      if (!mt) continue;
      // $69 is the water-area terrain metatile and the only solid one here.
      if (mt === 0x69) put(x, ROW(r), '#');
      else if (mt === 0x86) put(x, ROW(r), liquidTop);
      else if (mt === 0x87) put(x, ROW(r), liquidBody);
      // DEVIATION: $45/$47 is the decorative castle wall behind the player and
      // this engine has no non-solid wall tile, so it is left out.
    }
  }

  for (let x = 0; x < width; x++) {
    const bits = TERRAIN[terrainAt(x)] || TERRAIN[1];
    const solidRow = (r) => (r < 8 ? (bits[0] >> r) & 1 : (bits[1] >> (r - 8)) & 1);
    for (let r = 0; r <= 12; r++) if (solidRow(r)) put(x, ROW(r), '#');
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
      case 'ColumnOfBricks': fillCol(x, y, Math.min(ROW(12), y + n), '='); break;
      case 'ColumnOfSolidBlocks': fillCol(x, y, Math.min(ROW(12), y + n), 'B'); break;
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
        // Waves on SMB row 10, water under them to the bottom of the buffer.
        for (let i = 0; i <= n; i++) { put(x + i, ROW(10), '~'); fillCol(x + i, ROW(11), H - 1, '_'); }
        break;
      // A bridge's row nybble is where its RAILING goes, and the railing is
      // metatile $0b, below the block buffer's bar — you walk straight through
      // it. The deck you actually stand on is the row BELOW that.
      case 'Bridge_High': for (let i = 0; i <= n; i++) put(x + i, ROW(7), 'B'); break;
      case 'Bridge_Middle': for (let i = 0; i <= n; i++) put(x + i, ROW(8), 'B'); break;
      case 'Bridge_Low': for (let i = 0; i <= n; i++) put(x + i, ROW(10), 'B'); break;
      case 'StaircaseObject':
        for (let i = 0; i <= n; i++) {
          const s = Math.max(0, 8 - i);
          fillCol(x + i, ROW(STAIR_ROW[s]), ROW(STAIR_ROW[s] + STAIR_HEIGHT[s]), 'S');
        }
        break;
      case 'AreaStyleObject': {
        if (areaStyle === 2) {
          // BulletBillCannon: barrel, then neck and base until the length runs out.
          put(x, y, 'K');
          for (let r = y + 1; r <= Math.min(ROW(12), y + n); r++) put(x, r, 'k');
          break;
        }
        // TreeLedge and MushroomLedge are the same shape: a solid deck of
        // n + 1 tiles at the object's own row, with a NON-SOLID stem running
        // from just below the deck down to SMB row 12. The original draws that
        // stem with $4c (tree) or $4f/$50 (mushroom), all of which fall under
        // their attribute's block-buffer bar, so it is scenery and nothing else.
        for (let i = 0; i <= n; i++) put(x + i, y, '#');
        if (areaStyle === 1) {
          const stem = x + (n >> 1); // mushrooms grow one stem, under the middle
          for (let r = y + 1; r <= ROW(12); r++) put(stem, r, 't');
        } else {
          for (let i = 1; i < n; i++) {
            // trees grow a trunk under every column but the two end caps
            for (let r = y + 1; r <= ROW(12); r++) put(x + i, r, 't');
          }
        }
        break;
      }
      case 'Jumpspring': meta.springs.push({ x, y }); break;
      case 'Flagpole': meta.flagpole = { x }; break;
      case 'CastleObject': if (x > 8) meta.castle = { x }; break;
      // ChainObj/AxeObj/CastleBridgeObj all ignore the row nybble and take
      // their row from C_ObjectRow: axe 6, chain 7, bridge 8. Of their three
      // metatiles only the bridge's ($89) clears its bar, so only it is solid.
      case 'Axe': put(x, ROW(6), 'a'); meta.axe = { x, y: ROW(6) }; break;
      case 'CastleBridge': for (let i = 0; i < 13; i++) put(x + i, ROW(8), 'B'); break;
      default: break; // frenzies, scroll locks, ropes, loop commands
    }
  }

  // FlagpoleObject: ball on SMB row 0, shaft rows 1-9, and a solid block ($61)
  // on row 10 for the pole to stand on.
  if (meta.flagpole) {
    const fx = meta.flagpole.x;
    put(fx, ROW(0), '^');
    for (let r = 1; r <= 9; r++) put(fx, ROW(r), '|');
    put(fx, ROW(10), 'B');
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
    const lift = LIFTS[e.id];
    if (lift) {
      // PosPlatform nudges every lift 12 pixels right of its own column.
      ents.push({ type: 'platform', x: e.x + 0.75, y: e.y + 1, ...lift, range: 64, speed: 0.75 });
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
    const { type: _t, x, y, ...rest } = e;
    return variant ? { type, x, y, variant, ...rest } : { type, x, y, ...rest };
  });
  for (const s of b.meta.springs) ents.push({ type: 'springboard', x: s.x, y: s.y });

  return { id, width: W, rows, meta: b.meta, contents: b.contents, entities: ents, terrain: b.terrain };
}
