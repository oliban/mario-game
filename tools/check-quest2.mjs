#!/usr/bin/env node
// ---------------------------------------------------------------------------
// The second quest, measured rather than assumed.
//
//   node tools/check-quest2.mjs
//
// Beating 8-4 is supposed to change two things, and BOTH of them shipped broken
// once already, in ways only a played game would show:
//
//   1. The ending printed PUSH BUTTON B TO SELECT A WORLD and then expired on
//      its own timer and started 1-1 for you. The screen asked for a button
//      that did nothing and offered a choice that was never made.
//   2. PrimaryHardMode was set, but only ONE of the six places the ROM reads it
//      was wired up (the secondary-hard-mode forcing at asm:2694). The other
//      five are the ones you can feel, so the second quest played exactly like
//      the first — "not a tougher challenge at all", which is how it was
//      reported.
//
// So this drives the real game through the real ending and asserts on the
// numbers the ROM's own tables give. Each check names the disassembly line it
// comes from; if one fails, read that routine before changing the number here.
// ---------------------------------------------------------------------------

import { serve } from './serve.mjs';

const { chromium } = await import('playwright');
const { srv, port } = await serve();
const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});

await page.goto(`http://127.0.0.1:${port}/index.html?headless=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GAME && window.__GAME.ready', null, { timeout: 20000 });
await page.evaluate('window.__GAME.ready');
await page.evaluate(() => window.__GAME.pause());

const SCRIPT = `
const G = window.__GAME;
const game = G.game;
const out = {};

const census = (w) => {
  const c = {};
  for (const e of w.entities) {
    if (!e.isEnemy) continue;
    const t = e.type || (e.constructor && e.constructor.type) || '?';
    c[t] = (c[t] || 0) + 1;
  }
  return c;
};

// Build one of each enemy under a given PrimaryHardMode and read the speed it
// gave itself, the way InitEnemyObject does it once at load.
const born = (hard) => {
  game.world.primaryHardMode = hard;
  const mk = (type, opts) => {
    const e = game.world.spawn(type, 100 * 16, 10 * 16, opts || {});
    const v = e && { speed: e.speed, reviveFrames: e.reviveFrames };
    if (e) e.remove();
    return v || {};
  };
  return {
    goomba: mk('goomba').speed,
    koopaGround: mk('koopa', { variant: 'green' }).speed,
    koopaWinged: mk('koopa', { variant: 'green', winged: true }).speed,
    buzzy: mk('buzzy').speed,
    spiny: mk('spiny').speed,
    shellReviveFrames: mk('shell').reviveFrames,
  };
};

game.world.primaryHardMode = false;
await G.loadLevel('1-1');
out.quest1Census = census(game.world);
out.quest1 = born(false);

game.world.primaryHardMode = true;
await G.loadLevel('1-1');
out.quest2Census = census(game.world);
out.quest2 = born(true);

// The ending must not move on by itself once its messages are up.
game.started = true;
const P = G.screens.princess;
G.screens.showPrincessEnd(game.world);
G.release();
G.tick(P.constructor.END_FRAME + 120);
out.holdsPastTimer = G.screens.state === 'princess' && P.running === true;
G.hold({ run: true });
G.tick(2);
G.release();
G.tick(1);
out.dismissedByB = P.running === false;

// Clearing the game must land on the TITLE with world select armed, not in a
// game someone else chose.
game.worldSelect = false;
G.screens.title.worldSelect = false;
G.screens.title.worldIndex = 0;
game.endSession({ cleared: true });
for (let i = 0; i < 200 && G.screens.state !== 'title'; i++) {
  await new Promise((r) => setTimeout(r, 4));
  G.tick(1);
}
out.landsOnTitle = G.screens.state === 'title' && game.started === false;
out.worldSelectArmed = game.worldSelect === true && G.screens.title.worldSelect === true;

// B steps the world number; START then starts THAT world, in hard mode.
for (let i = 0; i < 4; i++) {
  G.hold({ run: true });
  G.tick(2);
  G.release();
  G.tick(2);
}
out.worldAfterFourB = G.screens.selectedWorld;
game.onMenuSelect('start1');
for (let i = 0; i < 300 && game.levelId !== '5-1'; i++) {
  await new Promise((r) => setTimeout(r, 4));
  G.tick(1);
}
out.startedAt = game.levelId;
out.startedHard = game.world.primaryHardMode === true;
out.startedCensus = census(game.world);
return out;
`;

const r = await page.evaluate(`(async () => { ${SCRIPT} })()`);

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(42)} ${detail}`);
  if (!ok) fails.push(name);
};

// NormalXSpdData (asm:8163) = $f8, $f4 -> 8/16 and 12/16 pixels a frame.
const SLOW = 0.5;
const FAST = 0.75;

console.log('--- enemies ---');
check('quest 1 keeps its goombas', (r.quest1Census.goomba | 0) > 0 && !r.quest1Census.buzzy,
  JSON.stringify(r.quest1Census));
// BuzzyBeetleMutate, asm:7988-7996.
check('quest 2 turns every goomba to a buzzy', !r.quest2Census.goomba &&
  r.quest2Census.buzzy === r.quest1Census.goomba, JSON.stringify(r.quest2Census));

// InitNormalEnemy, asm:8166-8172.
check('quest 1 ground walkers at $f8', r.quest1.goomba === SLOW && r.quest1.koopaGround === SLOW &&
  r.quest1.buzzy === SLOW, `${r.quest1.goomba} / ${r.quest1.koopaGround} / ${r.quest1.buzzy}`);
check('quest 2 ground walkers at $f4', r.quest2.goomba === FAST && r.quest2.koopaGround === FAST &&
  r.quest2.buzzy === FAST, `${r.quest2.goomba} / ${r.quest2.koopaGround} / ${r.quest2.buzzy}`);
// InitJumpGPTroopa hardcodes $f8 (asm:8871); spiny gets its speed from
// PlayerLakituDiff (asm:10002). Neither reads the flag, so neither may move.
check('paratroopa and spiny unchanged', r.quest2.koopaWinged === SLOW && r.quest2.spiny === SLOW,
  `${r.quest2.koopaWinged} / ${r.quest2.spiny}`);

// RevivalRateData (asm:11496) = $10, $0b, at 21 frames a tick.
check('shell revival 336 -> 231 frames',
  r.quest1.shellReviveFrames === 336 && r.quest2.shellReviveFrames === 231,
  `${r.quest1.shellReviveFrames} -> ${r.quest2.shellReviveFrames}`);

console.log('\n--- the ending ---');
// PlayerEndWorld / EndChkBButton, asm:1232-1256.
check('ending will not expire on its own', r.holdsPastTimer === true, `holds past END_FRAME`);
check('ending ends on B', r.dismissedByB === true, 'B dismisses it');
check('clearing lands on the title', r.landsOnTitle === true, 'not straight into a game');
check('world select armed by clearing', r.worldSelectArmed === true, 'WorldSelectEnableFlag');

console.log('\n--- world select ---');
// IncWorldSel, asm:1008-1013, then asm:1045-1046 for the hard mode it implies.
check('four B presses reach world 5', r.worldAfterFourB === 5, `world ${r.worldAfterFourB}`);
check('and START begins there', r.startedAt === '5-1', r.startedAt);
check('with primary hard mode on', r.startedHard === true, JSON.stringify(r.startedCensus));
check('so 5-1 has no goombas left', !r.startedCensus.goomba && (r.startedCensus.buzzy | 0) > 0,
  JSON.stringify(r.startedCensus));

await browser.close();
srv.close();

if (errors.length) {
  console.error(`\n--- ${errors.length} runtime error(s) ---\n${[...new Set(errors)].slice(0, 20).join('\n')}`);
  process.exit(1);
}
if (fails.length) {
  console.error(`\n${fails.length} check(s) failed:\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log('\nSecond quest is a second quest.');
