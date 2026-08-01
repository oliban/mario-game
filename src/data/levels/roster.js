// ---------------------------------------------------------------------------
// The play order, on its own so that both the registry and the levels can read
// it. index.js imports every level module, so a level that wants the roster
// cannot import index.js back without forming a cycle — 1-1 builds its warp
// zone from this list and would otherwise see `undefined` at module-eval time.
// ---------------------------------------------------------------------------

export const ORDER = [
  '1-1', '1-2', '1-3', '1-4',
  '2-1', '2-2', '2-3', '2-4',
  '3-1', '3-2', '3-3', '3-4',
  '4-1', '4-2', '4-3', '4-4',
  '5-1', '5-2', '5-3', '5-4',
];
