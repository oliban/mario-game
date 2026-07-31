#!/usr/bin/env node
// Import every module in the game and report which ones throw.
//
// world.js deliberately imports its cross-agent dependencies through a try/catch
// wrapper so one broken module degrades a feature instead of blanking the screen.
// That is right for players and terrible for debugging: a single ragged sprite row
// silently removes Mario from the game. This tool removes the safety net and tells
// you exactly which module failed and why.
//
//   node tools/validate.mjs

import { serve } from './serve.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './serve.mjs';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'src'))
  .map((p) => '/' + relative(ROOT, p).split('\\').join('/'))
  .sort();

const { chromium } = await import('playwright');
const { srv, port } = await serve();
const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://127.0.0.1:${port}/tools/preview.html?mod=/src/core/gfx.js`, {
  waitUntil: 'domcontentloaded',
});

const results = await page.evaluate(async (list) => {
  const out = [];
  for (const spec of list) {
    try {
      const m = await import(spec);
      let sprites = 0;
      for (const v of Object.values(m)) {
        if (v && typeof v === 'object') {
          if (v.rows && v.palette) sprites++;
          else if (Array.isArray(v.frames)) sprites += v.frames.length;
        }
      }
      out.push({ spec, ok: true, exports: Object.keys(m).length, sprites });
    } catch (e) {
      out.push({ spec, ok: false, error: String((e && e.message) || e) });
    }
  }
  return out;
}, files);

await browser.close();
srv.close();

const bad = results.filter((r) => !r.ok);
const good = results.filter((r) => r.ok);

for (const r of bad) console.error(`FAIL  ${r.spec}\n      ${r.error}`);
console.log(`\n${good.length}/${results.length} modules import cleanly.`);

if (bad.length) {
  console.error(`\n${bad.length} module(s) failed to import.`);
  process.exit(1);
}
