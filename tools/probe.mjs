#!/usr/bin/env node
// Drive the game headlessly and print numbers instead of pixels.
// Used to verify that movement matches Super Mario Bros. rather than merely looking like it.
//
//   node tools/probe.mjs                     # run the built-in physics suite
//   node tools/probe.mjs --script "..."      # run an arbitrary snippet, print its return value

import { serve } from './serve.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const { chromium } = await import('playwright');
const { srv, port } = await serve();
const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/index.html?headless=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME && window.__GAME.ready', null, { timeout: 20000 });
await page.evaluate('window.__GAME.ready');
await page.evaluate(() => window.__GAME.pause());

const custom = flag('script', null);

const SUITE = `
const g = window.__GAME;
const out = {};
const TILE = 16;

// Carve a long flat corridor with open sky into 1-1. Hunting for a clear stretch in a
// real level measures level geometry, not physics — reaching top run speed alone needs
// ~46 frames of runway and there is no such straight in 1-1.
const BED_X0 = 4;
const BED_X1 = 90;
const BED_FLOOR = 12;

function carveSandbox(w) {
  for (let tx = BED_X0; tx <= Math.min(BED_X1, w.w - 2); tx++) {
    for (let ty = 0; ty < BED_FLOOR; ty++) w.setTile(tx, ty, '.');
    for (let ty = BED_FLOOR; ty < w.h; ty++) w.setTile(tx, ty, '#');
  }
}

// Test bed: flat open ground, every enemy removed, so a physics run measures physics.
async function reset(power) {
  await g.loadLevel('1-1');
  g.release();
  const w = g.world;
  w.entities.length = 0;
  if (w.level) w.level.entities = [];
  if (w.rootLevel) w.rootLevel.entities = [];
  carveSandbox(w);
  g.teleport(BED_X0 + 3, BED_FLOOR - 1);
  if (power) g.setPower(power);
  // Settle: fall to the floor and stand still with NO buttons held, so the next
  // hold() produces a genuine rising edge.
  for (let i = 0; i < 60 && !g.stats().grounded; i++) g.tick(1);
  g.tick(2);
}

// --- terminal velocity -------------------------------------------------------
await reset();
g.teleport(12, 2);
g.hold({});
let frames = 0, vy = 0;
for (let i = 0; i < 90; i++) { g.tick(1); const s = g.stats(); if (s.vy === vy) { break; } vy = s.vy; frames++; if (s.grounded) break; }
out.terminalVy = vy;
out.framesToTerminal = frames;

// --- standing jump peak ------------------------------------------------------
await reset();
let s0 = g.stats();
const groundY = s0.y;
g.hold({ jump: true });
let peak = groundY;
for (let i = 0; i < 70; i++) {
  g.tick(1);
  const s = g.stats();
  if (s.y < peak) peak = s.y;
  if (i > 4 && s.grounded) break;
}
out.standingJumpTiles = +(((groundY - peak) / TILE).toFixed(3));

// --- full-run jump peak and distance ----------------------------------------
await reset();
g.hold({ right: true, run: true });
for (let i = 0; i < 90; i++) g.tick(1);
const sRun = g.stats();
out.maxRunSpeed = sRun.vx;
const runY = sRun.y, runX = sRun.x;
g.hold({ right: true, run: true, jump: true });
let peakR = runY, landX = runX;
for (let i = 0; i < 80; i++) {
  g.tick(1);
  const s = g.stats();
  if (s.y < peakR) peakR = s.y;
  if (i > 4 && s.grounded) { landX = s.x; break; }
}
out.runJumpTiles = +(((runY - peakR) / TILE).toFixed(3));
out.runJumpDistanceTiles = +(((landX - runX) / TILE).toFixed(2));

// --- walk top speed ----------------------------------------------------------
await reset();
g.hold({ right: true });
for (let i = 0; i < 120; i++) g.tick(1);
out.maxWalkSpeed = g.stats().vx;

// --- variable jump height (release early) ------------------------------------
await reset();
const gy = g.stats().y;
g.hold({ jump: true });
for (let i = 0; i < 6; i++) g.tick(1);
g.hold({});
let peakS = gy;
for (let i = 0; i < 70; i++) { g.tick(1); const s = g.stats(); if (s.y < peakS) peakS = s.y; if (i > 4 && s.grounded) break; }
out.shortHopTiles = +(((gy - peakS) / TILE).toFixed(3));

// --- skid deceleration -------------------------------------------------------
await reset();
g.hold({ right: true, run: true });
for (let i = 0; i < 90; i++) g.tick(1);
const beforeSkid = g.stats().vx;
g.hold({ left: true, run: true });
let skidFrames = 0;
for (let i = 0; i < 120; i++) { g.tick(1); skidFrames++; if (g.stats().vx <= 0) break; }
out.skidFromFullRunFrames = skidFrames;
out.speedBeforeSkid = beforeSkid;

// --- does the game actually play? --------------------------------------------
await reset();
g.hold({ right: true, run: true });
const startX = g.stats().x;
let died = false;
for (let i = 0; i < 600; i++) {
  g.tick(1);
  const s = g.stats();
  if (s.state === 'gameover' || s.playerState === 'dying' || s.playerState === 'dead') { died = true; break; }
}
const endS = g.stats();
out.autoRun600 = { fromX: startX, toX: endS.x, tilesTravelled: +(((endS.x - startX) / TILE).toFixed(1)), died, state: endS.state, playerState: endS.playerState };
out.finalStats = endS;
g.release();
return out;
`;

let result;
try {
  result = await page.evaluate(`(async () => { ${custom ? `const g = window.__GAME; ${custom}` : SUITE} })()`);
} catch (e) {
  console.error('PROBE THREW:', e.message);
  await browser.close();
  srv.close();
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

if (!custom) {
  const ref = {
    maxWalkSpeed: 1.5625,
    maxRunSpeed: 2.5625,
    terminalVy: 4.5,
    standingJumpTiles: 4.0,
    runJumpTiles: 4.7,
  };
  console.log('\n--- vs Super Mario Bros. reference ---');
  for (const [k, want] of Object.entries(ref)) {
    const got = result[k];
    const delta = got == null ? NaN : Math.abs(got - want);
    const tol = k.endsWith('Tiles') ? 0.45 : 0.02;
    console.log(
      `${k.padEnd(20)} got ${String(got).padEnd(10)} want ~${String(want).padEnd(8)} ${
        isNaN(delta) ? 'MISSING' : delta <= tol ? 'OK' : `OFF BY ${delta.toFixed(4)}`
      }`
    );
  }
}

await browser.close();
srv.close();
if (errors.length) {
  console.error(`\n--- ${errors.length} runtime error(s) ---\n${[...new Set(errors)].slice(0, 20).join('\n')}`);
  process.exit(1);
}
