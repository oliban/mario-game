// LOOP-CLOSURE audit, structural rather than delta-based.
//
// A cyclic animation built by translating a field advances by the same displacement
// every step. If the loop does not close, the wrap step lurches by exactly the amount
// it failed to close by. So: reduce each frame to a 1-D signature, find the circular
// shift that best maps each frame onto the next, and check the wrap shift equals the
// others. Delta-based tests cannot see this — proven separately.
const T = await import('../src/data/tiles.js');
const S = await import('../src/data/scenery.js');
const SLOTS = '0123456789abcdef';
const lum = (c) => { if (!c) return 0; let h = String(c).slice(1);
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return 0.299*parseInt(h.slice(0,2),16) + 0.587*parseInt(h.slice(2,4),16) + 0.114*parseInt(h.slice(4,6),16); };

const isAnim = (v) => v && Array.isArray(v.frames) && v.frames.length > 1 && v.frames[0] && v.frames[0].rows;
function collect(mod, tag) {
  const out = [], seen = new Set();
  const walk = (v, path, d) => {
    if (!v || d > 4) return;
    if (isAnim(v)) { if (!seen.has(v)) { seen.add(v); out.push([`${tag}.${path}`, v]); } return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, d + 1)); return; }
    if (typeof v === 'object' && !v.rows) for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, d + 1);
  };
  for (const k of Object.keys(mod)) walk(mod[k], k, 0);
  return out;
}
// column signature: mean luminance down each column ('.' contributes 0)
const colSig = (sp) => { const w = sp.rows[0].length, h = sp.rows.length, p = [];
  for (let x = 0; x < w; x++) { let s = 0;
    for (let y = 0; y < h; y++) { const ch = sp.rows[y][x];
      s += ch === '.' || ch === ' ' ? 0 : lum(sp.palette[SLOTS.indexOf(ch)]); }
    p.push(s / h); }
  return p; };
const rowSig = (sp) => { const w = sp.rows[0].length, h = sp.rows.length, p = [];
  for (let y = 0; y < h; y++) { let s = 0;
    for (let x = 0; x < w; x++) { const ch = sp.rows[y][x];
      s += ch === '.' || ch === ' ' ? 0 : lum(sp.palette[SLOTS.indexOf(ch)]); }
    p.push(s / w); }
  return p; };
const bestShift = (a, b) => { const n = a.length; let best = 0, err = Infinity;
  for (let s = 0; s < n; s++) { let e = 0;
    for (let i = 0; i < n; i++) e += Math.abs(a[(i - s + n) % n] - b[i]);
    if (e < err) { err = e; best = s; } }
  return best; };

const rows = [];
for (const [name, anim] of [...collect(T, 'tiles'), ...collect(S, 'scenery')]) {
  if (anim.loop === false) { rows.push({ name, n: anim.frames.length, verdict: 'ONE-SHOT (exempt)' }); continue; }
  const f = anim.frames, n = f.length;
  const axes = {};
  for (const [ax, sig] of [['x', colSig], ['y', rowSig]]) {
    const sh = [];
    for (let i = 0; i < n; i++) sh.push(bestShift(sig(f[i]), sig(f[(i + 1) % n])));
    const adj = sh.slice(0, n - 1), wrap = sh[n - 1];
    const uniform = adj.every((s) => s === adj[0]);
    // An axis whose step is a constant ZERO tells us nothing: the signature does not
    // move on that axis, so the wrap "matching" is vacuous. Only a non-zero constant
    // step is evidence of a translation whose closure can be judged.
    // Needs at least THREE adjacent transitions to establish a constant velocity.
    // With n=2 there is exactly one, and the wrap is by definition its inverse, so an
    // ordinary two-frame oscillation "fails" every time — nine sprite-module anims did
    // exactly that before this guard. n=3 gives two, still too few to distinguish an
    // oscillation from a translation.
    const informative = n >= 4 && uniform && adj[0] !== 0;
    axes[ax] = { sh, adj, wrap, uniform, informative, closes: informative && wrap === adj[0] };
  }
  let verdict, axis = '';
  if (!axes.x.informative && !axes.y.informative) {
    verdict = 'n/a (no axis shows a constant non-zero translation)';
  } else {
    const bad = [];
    for (const ax of ['x', 'y']) if (axes[ax].informative && !axes[ax].closes)
      bad.push(`${ax}: steps ${axes[ax].adj[0]}px, wrap ${axes[ax].wrap}px`);
    const good = ['x','y'].filter((ax) => axes[ax].closes);
    verdict = bad.length ? 'DOES NOT CLOSE — ' + bad.join('; ') : 'closes';
    axis = good.map((ax) => `${ax} step ${axes[ax].adj[0]}px`).join(', ');
  }
  rows.push({ name, n, verdict, axis, x: axes.x.sh.join(','), y: axes.y.sh.join(',') });
}
const bad = rows.filter((r) => r.verdict.startsWith('DOES NOT'));
const na  = rows.filter((r) => r.verdict.startsWith('n/a'));
const ok  = rows.filter((r) => r.verdict === 'closes');
const one = rows.filter((r) => r.verdict.startsWith('ONE-SHOT'));
console.log(`${rows.length} animations: ${ok.length} close, ${bad.length} DO NOT CLOSE, ${na.length} not translations (test n/a), ${one.length} one-shot (exempt)\n`);
if (bad.length) { console.log('DOES NOT CLOSE:'); for (const r of bad) console.log(`  ${r.name.padEnd(40)} n=${r.n}  ${r.verdict}`); console.log(); }
console.log('CLOSES (with a real, non-zero translation to judge):');
for (const r of ok) console.log(`  ${r.name.padEnd(40)} n=${r.n}  ${r.axis}`);
console.log('\nnot a pure translation — closure test does not apply:');
for (const r of na) console.log(`  ${r.name.padEnd(40)} n=${r.n}  x ${r.x}  y ${r.y}`);
console.log('\none-shot, exempt:'); for (const r of one) console.log(`  ${r.name.padEnd(40)} n=${r.n}`);
