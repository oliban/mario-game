#!/usr/bin/env node
// Render every Sprite/Anim exported by a module into a labelled contact sheet PNG.
// This is how art agents actually LOOK at what they wrote.
//
//   node tools/sheet.mjs src/data/sprites/mario.js
//   node tools/sheet.mjs src/data/tiles.js --bg sky --scale 6 --out shots/tiles.png
//
// Exits non-zero (and prints the error) if the module throws — bad palettes and
// ragged rows are caught here rather than at game boot.

import { mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { serve, ROOT } from './serve.mjs';

const argv = process.argv.slice(2);
const modArg = argv.find((a) => !a.startsWith('--'));
if (!modArg) {
  console.error('usage: node tools/sheet.mjs <module.js> [--bg checker|sky|dark] [--scale N] [--out path.png]');
  process.exit(64);
}
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const modPath = '/' + modArg.replace(/^\.?\//, '');
const bg = flag('bg', 'checker');
const scale = flag('scale', '5');
const out = resolve(ROOT, flag('out', `shots/sheet-${basename(modArg, '.js')}.png`));

const { chromium } = await import('playwright');
const { srv, port } = await serve();
const browser = await chromium.launch({ args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const url = `http://127.0.0.1:${port}/tools/preview.html?mod=${encodeURIComponent(modPath)}&bg=${bg}&scale=${scale}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });

try {
  await page.waitForFunction('window.__PREVIEW_READY === true', null, { timeout: 15000 });
} catch {
  console.error(`FAILED: ${modArg} did not finish loading.`);
  console.error(errors.join('\n') || '(no errors captured — check for a top-level await hang)');
  await browser.close(); srv.close(); process.exit(2);
}

const perr = await page.evaluate('window.__PREVIEW_ERROR || null');
if (perr) {
  console.error(`FAILED: ${perr}`);
  console.error(errors.join('\n'));
  await browser.close(); srv.close(); process.exit(2);
}

const count = await page.evaluate('window.__PREVIEW_COUNT');
await mkdir(dirname(out), { recursive: true });
const el = await page.$('#out');
await el.screenshot({ path: out });
await browser.close();
srv.close();

if (errors.length) {
  console.error(`\n--- ERRORS ---\n${[...new Set(errors)].join('\n')}`);
  process.exit(1);
}
if (!count) {
  console.error(`FAILED: ${modArg} exported 0 renderable Sprites/Anims.`);
  process.exit(3);
}
console.log(`OK — ${count} exports rendered -> ${out}`);
