// ---------------------------------------------------------------------------
// World 1 level registry.
//
//   LEVELS        — id -> level object, in the format of ARCHITECTURE.md §6
//   ORDER         — play order
//   getLevel(id)  — tolerant lookup: '1-1', '1_1', 'w1-1', 1, '1' all resolve
//   getArea(id, areaId) — a level's sub-area (pipe rooms, warp exits)
//   nextLevel(id) — the id that follows, or null after the last one
//
// A level object never mutates at runtime: World copies the tile rows into its
// own typed array on load, so the same object can be replayed as often as the
// player loses a life.
// ---------------------------------------------------------------------------

import L11 from './1-1.js';
import L12 from './1-2.js';
import L13 from './1-3.js';
import L14 from './1-4.js';
import L21 from './2-1.js';
import L22 from './2-2.js';
import L23 from './2-3.js';
import L24 from './2-4.js';
import L31 from './3-1.js';
import L32 from './3-2.js';
import L33 from './3-3.js';
import L34 from './3-4.js';

export const LEVELS = {
  '1-1': L11,
  '1-2': L12,
  '1-3': L13,
  '1-4': L14,
  '2-1': L21,
  '2-2': L22,
  '2-3': L23,
  '2-4': L24,
  '3-1': L31,
  '3-2': L32,
  '3-3': L33,
  '3-4': L34,
};

export { ORDER } from './roster.js';
import { ORDER } from './roster.js';

function normalize(id) {
  if (id == null) return null;
  if (typeof id === 'number') return ORDER[id] || ORDER[id - 1] || null;
  const s = String(id).trim().toLowerCase();
  if (LEVELS[s]) return s;
  const m = s.match(/(\d+)\s*[-_. ]\s*(\d+)/);
  if (m) {
    const key = `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`;
    if (LEVELS[key]) return key;
  }
  const n = s.match(/^\d+$/) ? parseInt(s, 10) : NaN;
  if (!Number.isNaN(n)) return ORDER[n] || ORDER[n - 1] || null;
  return null;
}

export function getLevel(id) {
  const key = normalize(id);
  return key ? LEVELS[key] : null;
}

export function hasLevel(id) {
  return normalize(id) != null;
}

export function levelId(id) {
  return normalize(id);
}

// Sub-areas are addressed by their own id ('1-1b'); 'main' / null returns the
// level itself, which is what World does when a warp comes back out.
export function getArea(id, areaId) {
  const lvl = getLevel(id);
  if (!lvl) return null;
  if (!areaId || areaId === 'main') return lvl;
  return (lvl.areas && lvl.areas[areaId]) || null;
}

export function nextLevel(id) {
  const key = normalize(id);
  if (!key) return null;
  const i = ORDER.indexOf(key);
  return i >= 0 && i + 1 < ORDER.length ? ORDER[i + 1] : null;
}

export function firstLevel() {
  return ORDER[0];
}

export default LEVELS;
