#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Collect the Super Mario Bros. reference data locally, once, so level work is
// driven by what the original actually contains rather than by recollection.
//
//   node tools/smb-ref.mjs            fetch (if needed) and extract
//   node tools/smb-ref.mjs --refetch  force a re-download
//
// Writes into reference/ :
//   smbdis.asm        doppelganger's disassembly, as downloaded
//   smb-areas.json    every area's header, object bytes and enemy bytes,
//                     plus the world/level -> area mapping
//
// reference/ is gitignored. The disassembly is ROM-derived, so it stays a local
// working reference and is never redistributed through this repo; this script
// is what is committed, and it reproduces the whole directory from scratch.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ROOT, 'reference');
const ASM = join(REF, 'smbdis.asm');
const OUT = join(REF, 'smb-areas.json');
const SRC = 'https://gist.githubusercontent.com/1wErt3r/4048722/raw/SMBDIS.ASM';

// The area pointer byte packs the area TYPE into bits 5-6 and the index within
// that type into bits 0-4. Bit 7 is a separate flag and is not part of either.
const TYPE_BASE = { 0: 0x00, 1: 0x03, 2: 0x19, 3: 0x1c };
const AREA_NAMES = [
  ...Array.from({ length: 3 }, (_, i) => `WaterArea${i + 1}`),
  ...Array.from({ length: 22 }, (_, i) => `GroundArea${i + 1}`),
  ...Array.from({ length: 3 }, (_, i) => `UndergroundArea${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `CastleArea${i + 1}`),
];

async function ensureAsm(refetch) {
  if (!existsSync(REF)) mkdirSync(REF, { recursive: true });
  if (existsSync(ASM) && !refetch) return readFileSync(ASM, 'utf8');
  process.stdout.write(`fetching ${SRC}\n`);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const text = await res.text();
  writeFileSync(ASM, text);
  return text;
}

// Pull the .db byte run that follows a label, up to the next label.
function bytesAfterLabel(src, label) {
  const re = new RegExp(`^${label}:\\s*$([\\s\\S]*?)(?=^\\w[\\w\\d_]*:)`, 'm');
  const m = src.match(re);
  if (!m) return null;
  const out = [];
  for (const line of m[1].split('\n')) {
    const db = line.match(/\.db\s+(.*)$/);
    if (!db) continue;
    for (const tok of db[1].split(',')) {
      const t = tok.trim();
      const hex = t.match(/^\$([0-9a-fA-F]{1,2})$/);
      if (hex) out.push(parseInt(hex[1], 16));
    }
  }
  return out;
}

function decodeWorldMap(src) {
  const m = src.match(/^AreaAddrOffsets:\s*$([\s\S]*?)(?=^\s*;)/m);
  if (!m) throw new Error('AreaAddrOffsets not found');
  const worlds = {};
  for (const line of m[1].split('\n')) {
    const w = line.match(/^World(\d)Areas:\s*\.db\s+(.*)$/);
    if (!w) continue;
    worlds[+w[1]] = w[2]
      .split(',')
      .map((t) => t.trim().match(/^\$([0-9a-fA-F]{2})$/))
      .filter(Boolean)
      .map((h) => parseInt(h[1], 16));
  }
  return worlds;
}

const areaOf = (b) => AREA_NAMES[TYPE_BASE[(b >> 5) & 3] + (b & 0x1f)];

function main(argv) {
  return ensureAsm(argv.includes('--refetch')).then((src) => {
    const worlds = decodeWorldMap(src);

    // Worlds with five entries carry a shared sub-area in slot 1; the four
    // playable levels are slots 0, 2, 3, 4. Four-entry worlds map straight
    // across. Cross-check: this is the only reading under which 1-2 and 4-2
    // come out underground and 2-2 and 7-2 come out water.
    const levelMap = {};
    for (const [w, list] of Object.entries(worlds)) {
      const slots = list.length === 5 ? [0, 2, 3, 4] : [0, 1, 2, 3];
      slots.forEach((s, i) => {
        levelMap[`${w}-${i + 1}`] = { pointer: list[s], area: areaOf(list[s]) };
      });
      if (list.length === 5) levelMap[`${w}-sub`] = { pointer: list[1], area: areaOf(list[1]) };
    }

    const areas = {};
    for (const name of AREA_NAMES) {
      const obj = bytesAfterLabel(src, `L_${name}`);
      const ene = bytesAfterLabel(src, `E_${name}`);
      if (!obj && !ene) continue;
      const objects = obj ? obj.slice(0, obj.indexOf(0xfd) + 1 || obj.length) : [];
      areas[name] = {
        header: objects.slice(0, 2),
        objectBytes: objects.slice(2),
        enemyBytes: ene ? ene.slice(0, ene.indexOf(0xff) + 1 || ene.length) : [],
      };
    }

    const payload = { source: SRC, worlds, levelMap, areas };
    writeFileSync(OUT, JSON.stringify(payload, null, 2));

    const n = Object.keys(areas).length;
    console.log(`reference/smbdis.asm  ${src.length} bytes`);
    console.log(`reference/smb-areas.json  ${n} areas, ${Object.keys(levelMap).length} level entries`);
    for (const id of ['1-1', '1-2', '2-1', '2-2', '2-3', '2-4']) {
      const e = levelMap[id];
      const a = areas[e.area];
      console.log(
        `  ${id}  ${e.area.padEnd(18)} header=${a.header.map((b) => b.toString(16)).join(',')}` +
          `  ${a.objectBytes.length} object bytes, ${a.enemyBytes.length} enemy bytes`
      );
    }
  });
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
