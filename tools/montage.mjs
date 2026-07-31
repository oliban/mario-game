#!/usr/bin/env node
// Tile a set of PNGs into one labelled contact sheet so a critic can judge many
// scenes in a single look, or diff a before/after pair.
//
//   node tools/montage.mjs shots/scenes/*.png --out shots/contact.png --cols 4
//   node tools/montage.mjs --ab shots/before.png shots/after.png --out shots/ab.png
//
// Requires ImageMagick (`magick`), which is already on this machine.

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const out = resolve(flag('out', 'shots/montage.png'));
mkdirSync(dirname(out), { recursive: true });

const abIdx = argv.indexOf('--ab');
if (abIdx >= 0) {
  const a = argv[abIdx + 1];
  const b = argv[abIdx + 2];
  for (const f of [a, b]) {
    if (!existsSync(f)) {
      console.error(`missing: ${f}`);
      process.exit(1);
    }
  }
  execFileSync('magick', [
    'montage', a, b,
    '-tile', '2x1', '-geometry', '+12+12',
    '-background', '#14161c', '-fill', '#c8d3f5', '-pointsize', '18',
    '-label', '%f', out,
  ]);
  console.log(`AB -> ${out}`);
  process.exit(0);
}

const files = argv.filter((a) => !a.startsWith('--') && a.endsWith('.png') && existsSync(a));
if (!files.length) {
  console.error('no input PNGs found');
  process.exit(1);
}
const cols = flag('cols', '4');

execFileSync('magick', [
  'montage', ...files,
  '-tile', `${cols}x`, '-geometry', '+10+10',
  '-background', '#14161c', '-fill', '#c8d3f5', '-pointsize', '16',
  '-label', '%t', out,
]);
console.log(`montage of ${files.length} -> ${out}`);
