#!/usr/bin/env node
// Deterministic screenshot harness.
//
//   node tools/shot.mjs --out shots/a.png --script "await g.loadLevel('1-1'); g.teleport(20,11); g.tick(90);"
//   node tools/shot.mjs --scenes tools/scenes.json --outdir shots
//
// Serves the repo on an ephemeral port, drives Chromium, evaluates the scene script
// against `window.__GAME` (bound to `g`), then captures the display canvas.
// Any page error or console error fails the run loudly — silent breakage is worse
// than a crash.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serve() {
  return new Promise((res) => {
    const srv = createServer(async (req, rq) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const file = join(ROOT, p);
        if (!file.startsWith(ROOT) || !existsSync(file)) {
          rq.writeHead(404);
          rq.end('not found');
          return;
        }
        const buf = await readFile(file);
        rq.writeHead(200, {
          'Content-Type': MIME[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        rq.end(buf);
      } catch (e) {
        rq.writeHead(500);
        rq.end(String(e));
      }
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) a[k.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return a;
}

const args = parseArgs(process.argv);

const { chromium } = await import('playwright');
const { srv, port } = await serve();
const base = `http://127.0.0.1:${port}`;

const scenes = args.scenes
  ? JSON.parse(await readFile(resolve(args.scenes), 'utf8'))
  : [{ name: args.name || 'shot', out: args.out || 'shots/shot.png', script: args.script || 'g.tick(1);' }];

const outdir = args.outdir || 'shots';
await mkdir(resolve(ROOT, outdir), { recursive: true });

const browser = await chromium.launch({
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--use-gl=angle'],
});
const scale = parseInt(args.scale || '3', 10);
const page = await browser.newPage({
  viewport: { width: 256 * scale + 64, height: 240 * scale + 64 },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}\n${e.stack || ''}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto(`${base}/index.html?headless=1`, { waitUntil: 'domcontentloaded' });

try {
  await page.waitForFunction('window.__GAME && window.__GAME.ready', null, { timeout: 20000 });
  await page.evaluate('window.__GAME.ready');
} catch (e) {
  console.error('FAILED: window.__GAME never became ready within 20s.');
  console.error(errors.join('\n') || '(no console errors captured)');
  await browser.close();
  srv.close();
  process.exit(2);
}

await page.evaluate(() => window.__GAME.pause && window.__GAME.pause());

const results = [];
for (const s of scenes) {
  const before = errors.length;
  try {
    await page.evaluate(
      `(async () => { const g = window.__GAME; ${s.script} })()`
    );
  } catch (e) {
    errors.push(`SCENE "${s.name}": ${e.message}`);
  }
  await page.waitForTimeout(60);
  const outPath = resolve(ROOT, s.out || join(outdir, `${s.name}.png`));
  await mkdir(dirname(outPath), { recursive: true });
  const el = await page.$('#screen');
  if (!el) {
    console.error('FAILED: no #screen canvas in the page.');
    await browser.close();
    srv.close();
    process.exit(3);
  }
  await el.screenshot({ path: outPath });
  results.push({ name: s.name, out: outPath, newErrors: errors.length - before });
  console.log(`captured ${s.name} -> ${outPath}`);
}

await browser.close();
srv.close();

if (errors.length) {
  console.error(`\n--- ${errors.length} RUNTIME ERROR(S) ---`);
  console.error([...new Set(errors)].slice(0, 40).join('\n'));
  await writeFile(resolve(ROOT, outdir, 'errors.txt'), errors.join('\n'));
  process.exit(1);
}
console.log(`\nOK — ${results.length} scene(s), no runtime errors.`);
