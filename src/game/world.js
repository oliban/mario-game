// The World: the level, the tilemap, the entity list and the game rules.
//
// Pixels and pixels-per-frame at a fixed 1/60.0988 s step. Nothing here
// multiplies by dt. +Y is DOWN. Entity x,y is the TOP-LEFT of its hitbox.
//
// Division of labour with the other systems:
//   * Entity.updateActivation() owns dormancy and off-screen despawn, so the
//     world calls update() on every entity every tick and only drops the ones
//     that flagged themselves `removed`.
//   * Player owns its own left-wall clamp, pit death, head bumps, flagpole and
//     pipe animations. It calls back into the world through warpAt / warp /
//     onPlayerDeath / lowerFlag / onFlagDone / levelComplete.
//   * The world owns everything neither of them can: the tilemap, block state,
//     player-vs-entity resolution, score, coins, lives, the timer, hit-stop and
//     the camera.

import { SCREEN_W, SCREEN_H, TILE, LAYER } from '../core/constants.js';
import { Camera } from './camera.js';
import { BlockSystem, tileKey } from './blocks.js';

// ---------------------------------------------------------------------------
// Cross-agent modules. Every one of these is authored in parallel, so each is
// pulled in optionally: a module that is missing or mid-edit degrades one
// feature instead of taking the whole game down.
// ---------------------------------------------------------------------------
async function opt(spec) {
  try {
    return await import(spec);
  } catch (err) {
    return null;
  }
}

const [
  tilesMod,
  entityCoreMod,
  entityMod,
  playerMod,
  particlesMod,
  audioMod,
  fontMod,
  itemsMod,
  sceneryMod,
] = await Promise.all([
  opt('../data/tiles.js'),
  opt('./entity.js'),
  opt('./entities/index.js'),
  opt('./player.js'),
  opt('../fx/particles.js'),
  opt('../audio/engine.js'),
  opt('../data/sprites/font.js'),
  opt('../data/sprites/items.js'),
  opt('../data/scenery.js'),
]);

// entities/index.js only pulls in the enemy roster. Items, props and one-shot
// effects self-register on import, so the world imports them too — otherwise a
// question block would have nothing to hand back.
await Promise.all(
  [
    'coin',
    'debris',
    'scorepop',
    'mushroom',
    'fireflower',
    'star',
    'vine',
    'fireball',
    'firework',
    // No 'flagpole' entity: the flag is owned by world (_findLandmarks /
    // lowerFlag / _drawFlag) and player (startFlagpole), not by an entity.
    'platform',
    'firebar',
    'springboard',
  ].map((n) => opt(`./entities/${n}.js`))
);

// ---------------------------------------------------------------------------
// Tile legend (ARCHITECTURE.md section 6). The collision semantics here are
// authoritative; src/data/tiles.js supplies the artwork.
//
// collision.js treats `question: true` as solid unless `solid: false` is
// explicit, which is exactly what invisible blocks need.
// ---------------------------------------------------------------------------
export const LEGEND = {
  '.': { name: 'air' },
  '#': { name: 'ground', solid: true },
  '=': { name: 'brick', solid: true, breakable: true, bumpable: true },
  '?': { name: 'question', solid: true, question: true, bumpable: true, item: 'coin' },
  M: { name: 'question', solid: true, question: true, bumpable: true, item: 'power' },
  1: {
    name: 'invisible',
    solid: false,
    question: true,
    bumpable: true,
    invisible: true,
    item: '1up',
  },
  C: {
    name: 'invisible',
    solid: false,
    question: true,
    bumpable: true,
    invisible: true,
    item: 'coin',
  },
  o: { name: 'coin', solid: false, coin: true },
  B: { name: 'block', solid: true },
  // Coin heaven's floor and its brick rows are the same tile in the original —
  // metatile $88, which has its own art rather than being a recoloured brick.
  // Solid, and nothing else: no bump, no break, no contents.
  O: { name: 'cloud-block', solid: true },
  S: { name: 'stair', solid: true },
  '[': { name: 'pipe_tl', solid: true, pipe: true },
  ']': { name: 'pipe_tr', solid: true, pipe: true },
  '{': { name: 'pipe_bl', solid: true, pipe: true },
  '}': { name: 'pipe_br', solid: true, pipe: true },
  '<': { name: 'pipe_l', solid: true, pipe: true },
  '>': { name: 'pipe_r', solid: true, pipe: true },
  L: { name: 'lava', solid: false, harm: 'lava' },
  '~': { name: 'water_surface', solid: false, liquid: true, surface: true },
  _: { name: 'water', solid: false, liquid: true },
  '|': { name: 'flag_shaft', solid: false, climb: true, flag: true },
  '^': { name: 'flag_ball', solid: false, climb: true, flag: true },
  X: { name: 'castle_brick', solid: true },
  a: { name: 'axe', solid: false, axe: true },
  t: { name: 'tree', solid: false, decor: true },
  b: { name: 'bush', solid: false, decor: true },
  h: { name: 'hill', solid: false, decor: true },
  c: { name: 'cloud', solid: false, decor: true },
  g: { name: 'coral', solid: true },
  P: { name: 'platform', solid: false, platform: true },
  '@': { name: 'anchor_platform', solid: false, anchor: 'platform' },
  F: { name: 'anchor_firebar', solid: false, anchor: 'firebar' },
  // Platform supports four modes; '@' is the horizontal lift from the
  // ARCHITECTURE legend and these are the other three. Any anchor's options
  // (mode, range, speed, dir, spacing, tiles) can also be overridden per tile
  // from the level's `contents` list — see _anchorOpts.
  V: { name: 'anchor_platform', solid: false, anchor: 'platform', anchorOpts: { mode: 'vertical' } },
  Y: { name: 'anchor_platform', solid: false, anchor: 'platform', anchorOpts: { mode: 'pulley' } },
  W: { name: 'anchor_platform', solid: false, anchor: 'platform', anchorOpts: { mode: 'fall' } },
  v: { name: 'vine_block', solid: true, question: true, bumpable: true, item: 'vine' },
  U: { name: 'used', solid: true },
  // tiles.js extensions beyond the ARCHITECTURE legend
  '-': { name: 'pipe_body', solid: true, pipe: true },
  K: { name: 'cannon_barrel', solid: true },
  k: { name: 'cannon_base', solid: true },
};

// Names accepted from src/data/tiles.js when resolving a char's artwork.
const ART_NAMES = {
  '#': ['ground', 'floor', 'dirt', 'groundblock', 'terrain', 'grass'],
  '=': ['brick', 'brickblock', 'bricks'],
  '?': ['question', 'questionblock', 'qblock', 'mystery', 'itemblock'],
  M: ['question', 'questionblock', 'qblock', 'mystery', 'itemblock'],
  1: ['invisible', 'hidden', 'invisibleblock', 'hiddenblock'],
  C: ['invisible', 'hidden', 'invisibleblock', 'hiddenblock'],
  o: ['coin', 'cointile', 'freecoin', 'spinningcoin'],
  B: ['stone', 'solidblock', 'hardblock', 'block', 'rock'],
  O: ['cloud-block', 'cloudblock', 'cloud-terrain'],
  S: ['stair', 'staircase', 'stairblock', 'stone', 'solidblock', 'block'],
  '[': ['pipetopleft', 'pipetl', 'pipelipleft'],
  ']': ['pipetopright', 'pipetr', 'pipelipright'],
  '{': ['pipebodyleft', 'pipebl', 'pipeshaftleft'],
  '}': ['pipebodyright', 'pipebr', 'pipeshaftright'],
  '<': ['pipesideleft', 'pipehorizleft', 'pipesidel'],
  '>': ['pipesideright', 'pipehorizright', 'pipesider'],
  L: ['lava', 'hazard', 'magma'],
  '~': ['watersurface', 'waterline', 'wavetop'],
  _: ['waterbody', 'water', 'deepwater'],
  '|': ['flagpole', 'flagshaft', 'pole'],
  '^': ['flagball', 'flagtop', 'poleball', 'flagpoleball'],
  X: ['castlebrick', 'castleblock', 'castle'],
  a: ['axe'],
  t: ['tree', 'treedecor'],
  b: ['bush', 'shrub'],
  h: ['hill', 'mound'],
  c: ['cloud'],
  g: ['coral', 'seaweed', 'reef'],
  P: ['platform', 'onewayplatform', 'mushroomplatform', 'woodplatform'],
  v: ['vineblock', 'vine', 'questionvine', 'question'],
  U: ['used', 'usedblock', 'empty', 'emptyblock', 'hitblock', 'bumped'],
  '-': ['pipesidebody', 'pipebody', 'pipeshaft'],
  K: ['cannonbarrel', 'cannon'],
  k: ['cannonbase', 'cannon'],
};

// Distinct from every value an entity hook can legitimately return, including
// undefined: _safeCall hands this back when the hook threw.
const THREW = Symbol('threw');

const STOMP_CHAIN = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];

const TIME_TICKS = 24; // frames per unit of game time
const HURRY_AT = 100;
const DEATH_WATCHDOG = 300; // ticks before the world takes the life itself
const TALLY_TICKS = 2; // frames per time unit during the end-of-level tally
const TALLY_POINTS = 50;
const FLAG_DROP = 2.6;

const AIR_REC = Object.freeze({ name: 'air', char: '.', code: 46, solid: false });
const EDGE_REC = Object.freeze({ name: 'edge', char: '#', code: 35, solid: true });

// Different systems ask for the same sound under different names. Collapsing
// them to one key is what lets the per-tick de-duplication actually catch the
// double announcements (the enemy and the player both report a stomp).
const SFX_KEY = {
  '1up': 'one-up',
  oneup: 'one-up',
  die: 'death',
  mariodie: 'death',
  jump: 'jump-small',
  kick: 'kick-shell',
  shell: 'kick-shell',
  squish: 'stomp',
  brick: 'brick-break',
  break: 'brick-break',
  blockbreak: 'brick-break',
  blockbump: 'bump',
  head: 'bump',
  warp: 'pipe',
  powerup: 'powerup-collect',
  mushroom: 'powerup-collect',
  flower: 'powerup-collect',
  grow: 'powerup-collect',
  sprout: 'powerup-appear',
  hurry: 'time-warning',
  flag: 'flagpole',
  powerdown: 'pipe',
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function isSprite(v) {
  return !!v && typeof v.draw === 'function' && typeof v.w === 'number';
}
function isAnim(v) {
  return !!v && typeof v.frame === 'function';
}

// Art modules publish either a bare Sprite/Anim or a small object keyed by pose
// ({ idle }, { spin }, { sprite }). Unwrap either shape.
function unwrapArt(v) {
  if (!v) return null;
  if (isAnim(v) || isSprite(v)) return v;
  if (typeof v !== 'object') return null;
  for (const k of ['spin', 'idle', 'tumble', 'animated', 'anim', 'sprite', 'still', 'default']) {
    const c = v[k];
    if (isAnim(c) || isSprite(c)) return c;
  }
  if (Array.isArray(v.frames) && v.frames.length) {
    return { frames: v.frames, hold: v.hold || 6, frame(t) {
      return this.frames[Math.floor(t / this.hold) % this.frames.length];
    } };
  }
  return null;
}

function pickArt(mod, names) {
  if (!mod) return null;
  for (const n of names) {
    const v = unwrapArt(mod[n]);
    if (v) return v;
  }
  return null;
}

// Same as unwrapArt, but for the prop modules, whose objects are keyed by size
// or by part ({ small, medium, large }, { top, trunk, rustle }) rather than by
// pose, so the caller has to say which member it wants.
function poseArt(v, poses) {
  if (!v) return null;
  if (isAnim(v) || isSprite(v)) return v;
  if (typeof v !== 'object') return null;
  for (const p of poses) {
    const c = v[p];
    if (isAnim(c) || isSprite(c)) return c;
  }
  return unwrapArt(v);
}

function artFrame(art, tick) {
  if (isAnim(art)) return art.frame(tick);
  if (isSprite(art)) return art;
  return null;
}

function artW(art) {
  const s = artFrame(art, 0);
  return s ? s.w : 0;
}

// ---------------------------------------------------------------------------
// Props whose artwork deliberately does NOT live in tiles.js. tiles.js records
// the decor and axe tiles with `sprite: null` because their art is authored in
// scenery.js (hills, bushes, clouds, trees, fence) and items.js (the castle
// axe), so the resolver follows the char through to those modules instead of
// leaving the level to render as empty space.
// ---------------------------------------------------------------------------
const PROP_ART = {
  a: { mod: 'items', names: ['AXE'], poses: ['idle'] },
  t: { mod: 'scenery', names: ['TREE'], poses: ['trunk', 'rustle', 'top'] },
  b: { mod: 'scenery', names: ['BUSH'], poses: ['small', 'medium', 'large'] },
  h: { mod: 'scenery', names: ['HILL_SMALL', 'HILL_LARGE'], poses: ['sprite'] },
  c: { mod: 'scenery', names: ['CLOUD'], poses: ['small', 'medium', 'large'] },
  f: { mod: 'scenery', names: ['FENCE'], poses: ['sprite'] },
};

function propModule(which) {
  return which === 'items' ? itemsMod : sceneryMod;
}

// Decor pieces are authored at several widths. The level data marks only the
// footprint — a run of N chars — so the run picks the variant that is N tiles
// wide instead of stamping N copies of one silhouette on top of each other.
const DECOR_SETS = {
  h: [['HILL_SMALL', 'sprite'], ['HILL_LARGE', 'sprite']],
  b: [['BUSH', 'small'], ['BUSH', 'medium'], ['BUSH', 'large']],
  c: [['CLOUD', 'small'], ['CLOUD', 'medium'], ['CLOUD', 'large']],
};

// Keyed by scenery variant, not one global set. World 3's night levels repaint
// the scenery palette — hills, bushes and tree canopy go white — which the
// original does by writing four bytes over background palette 0 rather than by
// swapping art. A level asks for it with `scenery: 'snow'`.
const DECOR_ART = new Map();
function decorArt(variant) {
  const key = variant || 'default';
  if (DECOR_ART.has(key)) return DECOR_ART.get(key);
  const suffix = variant ? `_${String(variant).toUpperCase()}` : '';
  // Fall back to the plain sprite whenever a variant does not publish one, so a
  // new variant only has to redraw what actually differs.
  const pick = (name) =>
    (suffix && sceneryMod && sceneryMod[name + suffix]) || (sceneryMod && sceneryMod[name]);
  const out = {};
  for (const ch of Object.keys(DECOR_SETS)) {
    const list = [];
    for (const [name, pose] of DECOR_SETS[ch]) {
      const art = poseArt(pick(name), [pose]);
      if (art && artW(art) > 0 && !list.includes(art)) list.push(art);
    }
    list.sort((a, b) => artW(a) - artW(b));
    if (list.length) out[ch] = list;
  }
  // A tree column is a canopy sitting on a stack of trunk segments. Every tree
  // in the shipped levels hangs under a platform, so the canopy only appears
  // when nothing covers the top of the column.
  const trunk = poseArt(pick('TREE'), ['trunk']);
  const canopy = poseArt(pick('TREE'), ['rustle', 'top']);
  if (trunk || canopy) out.t = { trunk: trunk || canopy, canopy: canopy || trunk };
  const cloud = sceneryMod && sceneryMod.CLOUD;
  out.driftPx = cloud && typeof cloud.driftPx === 'number' ? cloud.driftPx : 0;
  DECOR_ART.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Tile art resolution.
//
// tiles.js publishes TILES (id -> record), CHAR_TO_TILE (legend char -> id) and
// per-theme sprite/anim sets. Records carry the base-theme art; THEME_TILES and
// THEME_ANIMS carry the underground / castle / water / athletic repaints, which
// is what actually makes each area read as its own place.
// ---------------------------------------------------------------------------
function buildTileArt() {
  const t = tilesMod || {};
  const table = t.TILES || t.TILE_TABLE || (t.default && typeof t.default === 'object' ? t.default : null);
  const charToId = t.CHAR_TO_TILE || t.TILE_CHARS || t.CHARS || null;
  const themeTiles = t.THEME_TILES || null;
  const themeAnims = t.THEME_ANIMS || null;

  const byName = new Map();
  const byChar = new Map();
  if (table && typeof table === 'object') {
    for (const id of Object.keys(table)) {
      const rec = table[id];
      if (!rec || typeof rec !== 'object') continue;
      const entry = { id, rec };
      if (rec.name) byName.set(norm(rec.name), entry);
      if (rec.char) byChar.set(rec.char, entry);
    }
    if (charToId && typeof charToId === 'object') {
      for (const ch of Object.keys(charToId)) {
        const id = charToId[ch];
        if (table[id]) byChar.set(ch, { id, rec: table[id] });
      }
    }
  }

  // Invert the base theme's animation set so a record's `animated` Anim can be
  // swapped for the current theme's repaint of the same animation.
  const animKeys = new Map();
  if (themeAnims) {
    const base = themeAnims.overworld || themeAnims[Object.keys(themeAnims)[0]];
    if (base) for (const k of Object.keys(base)) animKeys.set(base[k], k);
  }
  return { byName, byChar, themeTiles, themeAnims, animKeys };
}

// ---------------------------------------------------------------------------
// Entity registry. entity.js owns the live registry (every entity module
// self-registers there); entities/index.js publishes a static roster as well.
// ---------------------------------------------------------------------------
function buildRegistry() {
  const lookup =
    entityCoreMod && typeof entityCoreMod.entityClass === 'function'
      ? entityCoreMod.entityClass
      : null;
  const make =
    entityCoreMod && typeof entityCoreMod.createEntity === 'function'
      ? entityCoreMod.createEntity
      : null;
  const roster = entityMod ? entityMod.ENTITY_TYPES || entityMod.default : null;
  const table = roster && typeof roster === 'object' && !(roster instanceof Map) ? roster : null;

  return {
    get(type) {
      if (!type) return null;
      if (lookup) {
        const c = lookup(type);
        if (c) return c;
      }
      if (table) return table[type] || table[String(type).toLowerCase()] || null;
      return null;
    },
    create(type, world, x, y, opts) {
      const Cls = this.get(type);
      if (!Cls) return null;
      if (make) return make(type, world, x, y, opts);
      return new Cls(world, x, y, opts);
    },
  };
}

// Names level data may use that are not the registered `static type`.
const TYPE_ALIASES = {
  greenkoopa: ['koopa', { variant: 'green' }],
  koopagreen: ['koopa', { variant: 'green' }],
  redkoopa: ['koopa', { variant: 'red' }],
  koopared: ['koopa', { variant: 'red' }],
  paratroopa: ['koopa', { winged: true }],
  koopapara: ['koopa', { winged: true }],
  buzzybeetle: ['buzzy', null],
  koopashell: ['shell', null],
  piranhaplant: ['piranha', null],
  plant: ['piranha', null],
  bullet: ['bulletbill', null],
  cheepcheep: ['cheep', null],
  bloober: ['blooper', null],
  squid: ['blooper', null],
  lavabubble: ['podoboo', null],
  hammerbros: ['hammerbro', null],
  flower: ['fireflower', null],
  firefower: ['fireflower', null],
  supermushroom: ['mushroom', null],
  oneup: ['1up', null],
  oneupmushroom: ['1up', null],
  lifemushroom: ['1up', null],
  starman: ['star', null],
  lift: ['platform', null],
  elevator: ['platform', null],
  movingplatform: ['platform', null],
  spring: ['springboard', null],
  beanstalk: ['vine', null],
};

// ---------------------------------------------------------------------------
// Text for floating score popups. font.js publishes text(str) -> Sprite[] and
// a FONT glyph map; accept a plain draw function too.
// ---------------------------------------------------------------------------
function buildTextDrawer() {
  if (!fontMod) return null;

  if (typeof fontMod.text === 'function') {
    let sample = null;
    try {
      sample = fontMod.text('0');
    } catch (err) {
      sample = null;
    }
    if (Array.isArray(sample)) {
      return (ctx, str, x, y) => {
        const glyphs = fontMod.text(str);
        let cx = x;
        for (const g of glyphs) {
          if (isSprite(g)) g.draw(ctx, cx, y);
          cx += g && g.w ? g.w : 8;
        }
      };
    }
  }
  for (const n of ['drawText', 'drawString', 'print', 'blitText']) {
    if (typeof fontMod[n] === 'function') {
      const f = fontMod[n];
      return (ctx, str, x, y) => f.call(fontMod, ctx, str, x, y);
    }
  }
  for (const n of ['FONT', 'GLYPHS', 'FONT_MAP']) {
    const m = fontMod[n];
    if (m && typeof m === 'object') {
      return (ctx, str, x, y) => {
        let cx = x;
        for (const ch of String(str)) {
          const g = m[ch] || m[ch.toUpperCase()];
          if (isSprite(g)) g.draw(ctx, cx, y);
          cx += g && g.w ? g.w : 8;
        }
      };
    }
  }
  return null;
}

function buildParticles() {
  if (!particlesMod) return null;
  const inst = particlesMod.particles || particlesMod.default;
  if (inst && typeof inst.update === 'function') return inst;
  const C = particlesMod.ParticleSystem || particlesMod.Particles;
  if (typeof C === 'function') {
    try {
      return new C();
    } catch (err) {
      return null;
    }
  }
  return null;
}

// Same-name sound effects fired twice in one tick (the enemy and the player
// both announce a stomp) collapse into one. Everything else passes straight
// through to the engine.
function dedupeAudio(impl) {
  if (!impl) return null;
  const fired = new Set();
  const sfx = (name, opts) => {
    if (!name) return null;
    const k = SFX_KEY[name] || name;
    if (fired.has(k)) return null;
    fired.add(k);
    return typeof impl.sfx === 'function' ? impl.sfx(name, opts) : null;
  };
  return new Proxy(impl, {
    get(target, prop) {
      if (prop === 'sfx') return sfx;
      if (prop === '__endTick') return () => fired.clear();
      if (prop === '__raw') return target;
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

// ===========================================================================
// World
// ===========================================================================
export class World {
  constructor(opts = {}) {
    this.cam = new Camera();
    this.blocks = new BlockSystem(this);

    this.level = null;
    this.rootLevel = null;
    this.areaId = null;
    this.theme = 'overworld';
    this.tileset = 'overworld';

    this.w = 0;
    this.h = 0;
    this.map = new Uint8Array(0);
    this.recByCode = new Array(128).fill(null);
    this.contents = new Map();
    this.decor = [];

    this.entities = [];
    this.popups = [];
    this.player = null;
    // Co-op roster. players[0] is always `player`; a second entry is Luigi.
    this.players = [];
    this.player2 = null;
    this.coop = false;
    this.coopPad = null;
    this._collidingPlayer = null;

    this.score = 0;
    this.coins = 0;
    this.lives = opts.lives != null ? opts.lives : 3;
    this.worldNum = 1;
    this.levelNum = 1;
    this.time = 400;
    this.timeAcc = 0;
    this.hurryUp = false;

    this.tick = 0;
    this.state = 'idle';
    this.freezeTimer = 0;
    this.checkpointReached = false;
    this._deadTicks = 0;

    this.endPhase = null;
    this.endTimer = 0;
    this.flag = null;
    this.flagY = 0;
    this.flagFalling = false;
    this.castleX = null;

    this.safeMode = opts.safeMode !== false;
    this.resolveEnemyCollisions = opts.resolveEnemyCollisions !== false;
    this.debug = { hitboxes: false };

    this.onLevelComplete = opts.onLevelComplete || null;
    this.onGameOver = opts.onGameOver || null;
    this.onLifeLost = opts.onLifeLost || null;
    this.onWarpLevel = opts.onWarpLevel || null;

    this.registry = buildRegistry();
    this.tileArt = buildTileArt();
    this.art = {
      coin: pickArt(itemsMod, ['COIN', 'COIN_SPIN', 'COIN_ANIM', 'BLOCK_COIN']),
      mushroom: pickArt(itemsMod, ['MUSHROOM_SUPER', 'MUSHROOM', 'SUPER_MUSHROOM']),
      '1up': pickArt(itemsMod, ['MUSHROOM_1UP', 'ONEUP_MUSHROOM', 'LIFE_MUSHROOM']),
      fireflower: pickArt(itemsMod, ['FIRE_FLOWER', 'FIREFLOWER', 'FLOWER']),
      star: pickArt(itemsMod, ['STARMAN', 'STAR', 'SUPER_STAR']),
      // The shard art is an item sprite (items.js DEBRIS), not a tile.
      debris:
        pickArt(itemsMod, ['DEBRIS', 'BRICK_DEBRIS', 'BRICK_PIECE']) ||
        pickArt(tilesMod, ['T_BRICK_DEBRIS', 'BRICK_DEBRIS', 'T_BRICK_PIECE']),
      flag: pickArt(sceneryMod, ['FLAG', 'FLAGPOLE_FLAG', 'LEVEL_FLAG']),
      // scenery.js authors a proper 80x80 castle; without this it was never drawn
      // and levels had to fake one out of solid castle-brick tiles.
      castle: poseArt(sceneryMod && sceneryMod.CASTLE_BIG, ['sprite', 'idle', 'big']),
      // SMB ships TWO end-of-level castles, both 5 tiles wide and differing only in
      // height: 5x5 for x-1 and x-2, and 5x11 for x-3 (CastleObject renders from
      // start row $06 or $00 down to the floor). x-3 getting the short one is six
      // tiles too short.
      castleTall: poseArt(sceneryMod && sceneryMod.CASTLE_TALL, ['sprite', 'idle', 'tall']),
    };

    this.particles = opts.particles !== undefined ? opts.particles : buildParticles();
    if (this.particles && typeof this.particles.attach === 'function') {
      try {
        this.particles.attach(this);
      } catch (err) {
        /* optional hook */
      }
    }
    this.setAudio(
      opts.audio !== undefined ? opts.audio : (audioMod && (audioMod.Audio || audioMod.default)) || null
    );

    this._text = null;
    this._textResolved = false;
    this._merge = null;
    this._warned = new Set();
    this.rcam = { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H };
    this._boundPasses = null;
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------
  setAudio(impl) {
    this._audioRaw = impl || null;
    this.audio = dedupeAudio(impl) || { sfx() {}, music() {} };
  }

  setParticles(ps) {
    this.particles = ps || null;
    if (ps && typeof ps.attach === 'function') ps.attach(this);
  }

  // Public so entities/index.js routes through here (it probes world.sfx first).
  sfx(name, opts) {
    if (!name) return;
    try {
      this.audio.sfx(name, opts);
    } catch (err) {
      /* audio must never break gameplay */
    }
  }

  music(name, opts) {
    const a = this._audioRaw;
    if (!a || typeof a.music !== 'function') return;
    try {
      a.music(name, opts);
    } catch (err) {
      /* ignore */
    }
  }

  // Particle request. src/fx/particles.js exposes one method per effect
  // (coinSparkle, brickShatter, landingDust, ...); call it directly.
  fx(kind, x, y, a, b) {
    const p = this.particles;
    if (!p || typeof p[kind] !== 'function') return null;
    try {
      return p[kind](x, y, a, b);
    } catch (err) {
      return null;
    }
  }

  isFrozen() {
    return this.freezeTimer > 0;
  }

  // -------------------------------------------------------------------------
  // Level loading
  // -------------------------------------------------------------------------
  reset() {
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.checkpointReached = false;
    this.state = 'idle';
  }

  loadLevel(levelObj, areaId = null, opts = {}) {
    if (!levelObj) throw new Error('world.loadLevel: no level object');
    if (!opts.subArea) this.rootLevel = levelObj;

    const lvl = areaId && levelObj.areas && levelObj.areas[areaId] ? levelObj.areas[areaId] : levelObj;
    this.level = lvl;
    this.areaId = areaId || null;
    this.theme = lvl.theme || levelObj.theme || 'overworld';
    // A level may draw its TILES with another theme's palette while staying its
    // own theme for everything else. The original does this with colour control
    // 7, which writes the full castle palette over an overworld area — 6-3 is an
    // overworld level rendered in castle greys under a black sky. Not called
    // `tiles`, which is already the tile MAP.
    this.tileset = lvl.tileset || levelObj.tileset || this.theme;

    const m = String(lvl.id || levelObj.id || '1-1').match(/(\d+)\s*-\s*(\d+)/);
    if (m) {
      this.worldNum = parseInt(m[1], 10) || 1;
      this.levelNum = parseInt(m[2], 10) || 1;
    }

    this._buildTiles(lvl);
    this._buildDecor();
    this._buildContents(lvl);

    this.blocks.reset();
    this.entities.length = 0;
    this.climbables = [];
    this._bridge = null;
    this.popups.length = 0;
    if (this.particles) {
      if (typeof this.particles.clear === 'function') this.particles.clear();
      if (typeof this.particles.setTheme === 'function') this.particles.setTheme(this.theme);
    }

    if (opts.resetTime != null ? opts.resetTime : areaId == null) {
      this.time = lvl.time || levelObj.time || 400;
      this.timeAcc = 0;
      this.hurryUp = false;
      if (this._audioRaw && typeof this._audioRaw.setHurry === 'function') {
        try {
          this._audioRaw.setHurry(false);
        } catch (err) {
          /* ignore */
        }
      }
    }

    this._findLandmarks(lvl, levelObj);
    this._placePlayer(lvl, opts);
    this.cam.reset(lvl, this.player);
    this._spawnLevelEntities(lvl);

    this.tick = 0;
    this.freezeTimer = 0;
    this._deadTicks = 0;
    this.endPhase = null;
    this.endTimer = 0;
    this.flagFalling = false;
    this.state = 'playing';

    if (!opts.silent) this.music(lvl.music || this.theme || 'overworld');
    return this;
  }

  loadArea(areaId, tileX, tileY) {
    const spawnAt = tileX != null ? { x: tileX, y: tileY } : null;
    return this.loadLevel(this.rootLevel, areaId || null, {
      subArea: true,
      resetTime: false,
      spawnAt,
    });
  }

  _buildTiles(lvl) {
    const rows = lvl.tiles || [];
    const w = (this.w = Math.max(1, (lvl.width | 0) || (rows[0] ? rows[0].length : 16)));
    const h = (this.h = Math.max(1, (lvl.height | 0) || rows.length || 15));
    const map = (this.map = new Uint8Array(w * h));

    for (let y = 0; y < h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < w; x++) {
        const ch = x < row.length ? row[x] : '.';
        map[y * w + x] = ch === ' ' ? 46 : ch.charCodeAt(0) & 0x7f;
      }
    }

    this.recByCode = new Array(128).fill(null);
    const seen = new Set([46, 85]); // air, and 'U' used blocks (runtime only)
    for (let i = 0; i < map.length; i++) seen.add(map[i]);
    for (const code of seen) this._makeRec(code);

    // Does this level tile its water? A water-themed level that does gets
    // tile-accurate swimming, which is what lets 2-2 have a dry shore.
    this.hasWaterTiles = seen.has(95) || seen.has(126); // '_' and '~'

    // Emptied blocks fall back to the solid stone tile when tiles.js has no
    // dedicated "used" art — never to a bare rectangle.
    const used = this.recByCode[85];
    if (used && !used.sprite && !used.anim) {
      const stone = this.recByCode[66];
      if (stone) {
        used.sprite = stone.sprite;
        used.anim = stone.anim;
      }
    }
  }

  _makeRec(code) {
    const ch = String.fromCharCode(code);
    const sem = LEGEND[ch];
    if (!sem) {
      const rec = { name: 'air', solid: false, char: ch, code, unknown: true };
      this.recByCode[code] = rec;
      if (!this._warned.has('tile' + ch)) {
        this._warned.add('tile' + ch);
        console.warn(`world: level uses unknown tile char ${JSON.stringify(ch)}`);
      }
      return rec;
    }
    const rec = { ...sem, char: ch, code };
    if (ch !== '.') {
      const art = this._tileArtFor(ch, ART_NAMES[ch] || [sem.name]);
      if (art) {
        if (art.anim) rec.anim = art.anim;
        if (art.sprite) rec.sprite = art.sprite;
        if (!rec.harm && art.harm) rec.harm = art.harm;
      }
      // The coin tile has no entry in the tile sheet — it is an item sprite.
      if (rec.coin && !rec.sprite && !rec.anim && this.art.coin) rec.anim = this.art.coin;
    }
    this.recByCode[code] = rec;
    return rec;
  }

  // tiles.js first, then the prop modules. A tile sheet entry that exists but
  // carries no artwork (the decor and axe records are `sprite: null` by design)
  // is not an answer — keep walking the chain.
  _tileArtFor(ch, candidates) {
    const fromTiles = this._tileSheetArtFor(ch, candidates);
    if (fromTiles && (fromTiles.sprite || fromTiles.anim)) return fromTiles;
    const prop = this._propArtFor(ch, candidates);
    if (!prop) return fromTiles;
    return {
      sprite: prop.sprite,
      anim: prop.anim,
      harm: (fromTiles && fromTiles.harm) || null,
    };
  }

  _propArtFor(ch, candidates) {
    const spec = PROP_ART[ch];
    if (spec) {
      const mod = propModule(spec.mod);
      if (mod) {
        for (const n of spec.names) {
          const art = poseArt(mod[n], spec.poses);
          if (art) return { sprite: isSprite(art) ? art : null, anim: isAnim(art) ? art : null };
        }
      }
    }
    for (const mod of [sceneryMod, itemsMod]) {
      if (!mod) continue;
      for (const c of candidates) {
        const up = String(c).toUpperCase();
        const art = unwrapArt(mod[up]) || unwrapArt(mod['T_' + up]);
        if (art) return { sprite: isSprite(art) ? art : null, anim: isAnim(art) ? art : null };
      }
    }
    return null;
  }

  _tileSheetArtFor(ch, candidates) {
    const A = this.tileArt;
    let entry = A.byChar.get(ch) || null;
    if (!entry) {
      for (const c of candidates) {
        const e = A.byName.get(norm(c));
        if (e) {
          entry = e;
          break;
        }
      }
    }
    if (!entry) {
      for (const c of candidates) {
        const n = norm(c);
        if (n.length < 4) continue;
        for (const [k, e] of A.byName) {
          if (k.includes(n) || n.includes(k)) {
            entry = e;
            break;
          }
        }
        if (entry) break;
      }
    }
    if (!entry) {
      if (!tilesMod) return null;
      for (const c of candidates) {
        const up = String(c).toUpperCase();
        const v = unwrapArt(tilesMod['T_' + up] || tilesMod[up] || tilesMod['TILE_' + up]);
        if (v) return { sprite: isSprite(v) ? v : null, anim: isAnim(v) ? v : null, harm: null };
      }
      return null;
    }

    const rec = entry.rec;
    const themeSet = A.themeTiles ? A.themeTiles[this.tileset] : null;
    let sprite = (themeSet && themeSet[entry.id]) || rec.sprite || null;
    if (!isSprite(sprite)) sprite = null;

    let anim = unwrapArt(rec.animated) || unwrapArt(rec.anim) || null;
    if (anim && A.themeAnims) {
      const key = A.animKeys.get(anim);
      const themed = key && A.themeAnims[this.tileset] ? A.themeAnims[this.tileset][key] : null;
      if (isAnim(themed)) anim = themed;
    }
    if (!isAnim(anim)) anim = null;
    return { sprite, anim, harm: rec.harm || null };
  }

  // -------------------------------------------------------------------------
  // Background decor. Hills, bushes and clouds are authored in scenery.js at
  // two or three widths each, and the level marks only their footprint, so the
  // map is compiled once into a display list of placed sprites rather than
  // being drawn cell by cell.
  // -------------------------------------------------------------------------
  _buildDecor() {
    const list = (this.decor = []);
    // The variant comes off the current area, so a sub-area can differ from the
    // level that contains it — the same rule the sky override follows.
    const sets = decorArt(this.level && this.level.scenery);
    const seen = new Uint8Array(this.w * this.h);

    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = ty * this.w + tx;
        if (seen[i]) continue;
        const code = this.map[i];
        const rec = this.recByCode[code];
        if (!rec || !rec.decor) continue;
        seen[i] = 1;

        if (rec.char === 't' && sets.t) {
          this._placeTree(list, sets.t, tx, ty);
          continue;
        }

        const set = sets[rec.char];
        if (!set) {
          // No multi-width set for this char: fall back to whatever single-tile
          // art the record resolved to.
          this._pushDecor(list, rec.anim || rec.sprite, tx * TILE, ty, 1, rec.char);
          continue;
        }

        let n = 1;
        while (tx + n < this.w && this.map[i + n] === code) n++;
        for (let k = 1; k < n; k++) seen[i + k] = 1;

        // A run that repeats on the row below is only the shoulder of a taller
        // silhouette; the bottom row of the shape owns the sprite.
        let base = true;
        if (ty + 1 < this.h) {
          for (let k = 0; k < n && base; k++) if (this.map[i + this.w + k] === code) base = false;
        }
        if (!base) continue;

        this._pushDecor(list, this._fitDecor(set, n), tx * TILE, ty, n, rec.char);
      }
    }
  }

  // Widest variant that still fits the run, else the narrowest one authored.
  _fitDecor(set, tiles) {
    const want = tiles * TILE;
    let best = set[0];
    for (const art of set) if (artW(art) <= want) best = art;
    return best;
  }

  _placeTree(list, tree, tx, ty) {
    // Covered from above (a platform, or the next segment up) -> trunk.
    const above = ty > 0 ? this.recByCode[this.map[(ty - 1) * this.w + tx]] : null;
    const covered = !!above && (above.solid || above.char === 't');
    this._pushDecor(list, covered ? tree.trunk : tree.canopy, tx * TILE, ty, 1, 't');
  }

  _pushDecor(list, art, px, ty, tiles, ch) {
    const s = artFrame(art, 0);
    if (!s) return;
    list.push({
      art,
      // Centre the silhouette on its footprint and sit it on the cell floor.
      x: px + Math.floor((tiles * TILE - s.w) * 0.5),
      y: (ty + 1) * TILE - s.h,
      drift: ch === 'c' ? decorArt(this.level && this.level.scenery).driftPx : 0,
    });
  }

  _buildContents(lvl) {
    this.contents.clear();
    const list = lvl.contents || lvl.blocks;
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || c.x == null || c.y == null) continue;
      // Everything that is not the block payload is kept as spawn options, so
      // the same list can configure a moving-platform or fire-bar anchor.
      const opts = {};
      for (const k of Object.keys(c)) {
        if (k !== 'x' && k !== 'y' && k !== 'item' && k !== 'type' && k !== 'count') opts[k] = c[k];
      }
      this.contents.set(tileKey(c.x | 0, c.y | 0), {
        item: c.item || c.type,
        count: c.count,
        opts,
      });
    }
  }

  _placePlayer(lvl, opts) {
    const sp = opts.spawnAt || lvl.spawn || { x: 2, y: 11 };
    const PlayerClass = playerMod && (playerMod.default || playerMod.Player);

    if (!this.player && PlayerClass) {
      try {
        this.player = new PlayerClass(this, sp.x * TILE, sp.y * TILE);
      } catch (err) {
        console.error('world: player construction failed', err);
        this.player = null;
      }
    }
    // Co-op: build Luigi on demand when the host asks for two players.
    if (this.coop && !this.player2 && PlayerClass) {
      try {
        this.player2 = new PlayerClass(this, sp.x * TILE, sp.y * TILE, { player: 2 });
        this.player2.pad = this.coopPad || null;
        this.player2.isLuigi = true;
      } catch (err) {
        console.error('world: luigi construction failed', err);
        this.player2 = null;
      }
    }
    if (!this.coop) this.player2 = null;
    this.players = [this.player, this.player2].filter(Boolean);

    const p = this.player;
    if (!p) return;

    p.world = this;
    const px = sp.x * TILE;
    const py = (sp.y + 1) * TILE - (p.h || TILE);
    if (typeof p.respawn === 'function') p.respawn(px, py, opts.resetPlayer ? 'small' : undefined);
    else {
      p.x = px;
      p.y = py;
      p.vx = 0;
      p.vy = 0;
      p.dead = false;
      p.removed = false;
    }
    // A respawn resizes the hitbox, so re-anchor the feet afterwards.
    p.y = (sp.y + 1) * TILE - p.h;
    this._settlePlayer(p);

    if (this.player) this.player.out = false;
    const l = this.player2;
    if (l) {
      l.out = false;
      l.world = this;
      const lx = Math.max(0, px - TILE);
      const ly = (sp.y + 1) * TILE - l.h;
      if (typeof l.respawn === 'function') l.respawn(lx, ly, opts.resetPlayer ? 'small' : undefined);
      else {
        l.x = lx;
        l.y = ly;
        l.vx = 0;
        l.vy = 0;
        l.dead = false;
        l.removed = false;
      }
      l.y = (sp.y + 1) * TILE - l.h;
      this._settlePlayer(l);
    }
  }

  _spawnLevelEntities(lvl) {
    const list = lvl.entities || [];
    for (const spec of list) {
      if (!spec || !spec.type) continue;
      const e = this.spawn(spec.type, spec.x * TILE, spec.y * TILE, spec);
      if (!e) continue;
      if (typeof e.place === 'function') e.place(spec.x * TILE + TILE * 0.5, (spec.y + 1) * TILE);
      else if (e.isPlatform) {
        // A lift spans several tiles and measures its travel from where it was
        // constructed, so it keeps the tile's top-left exactly like a map
        // anchor does instead of being centred and re-seated afterwards.
      } else {
        e.x = spec.x * TILE + (TILE - e.w) * 0.5;
        e.y = (spec.y + 1) * TILE - e.h;
      }
    }
    // Tile anchors become entities and clear out of the map.
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const rec = this.recByCode[this.map[ty * this.w + tx]];
        if (!rec || !rec.anchor) continue;
        this.map[ty * this.w + tx] = 46;
        this.spawn(rec.anchor, tx * TILE, ty * TILE, this._anchorOpts(rec, tx, ty));
      }
    }
  }

  // The anchor char fixes the variant; an entry in the level's `contents` list
  // at the same tile overrides any of the entity's own options, which is how a
  // level asks for a longer range, a slower lift or a wider platform.
  _anchorOpts(rec, tx, ty) {
    const opts = { tx, ty, anchor: true };
    if (rec.anchorOpts) Object.assign(opts, rec.anchorOpts);
    const ov = this.contents.get(tileKey(tx, ty));
    if (ov && ov.opts) Object.assign(opts, ov.opts);
    return opts;
  }

  _findLandmarks(lvl, root) {
    this.flag = null;
    this.castleX = null;
    const fp = lvl.flagpole || root.flagpole;
    if (fp && fp.x != null) {
      const tx = fp.x | 0;
      let top = null;
      let bottom = null;
      for (let ty = 0; ty < this.h; ty++) {
        const rec = this.recByCode[this.map[ty * this.w + tx]];
        if (rec && rec.flag) {
          if (top == null) top = ty * TILE;
          bottom = ty * TILE + TILE;
        }
      }
      if (top == null) {
        top = (fp.top != null ? fp.top : 3) * TILE;
        bottom = (this.h - 2) * TILE;
      }
      this.flag = { tx, x: tx * TILE, top, bottom };
      this.flagY = top + TILE;
    }
    const cs = lvl.castle || root.castle;
    if (cs && cs.x != null) this.castleX = cs.x * TILE;
    else if (typeof cs === 'number') this.castleX = cs * TILE;
  }

  // -------------------------------------------------------------------------
  // Tile queries
  // -------------------------------------------------------------------------
  recAt(tx, ty) {
    if (ty < 0) return AIR_REC;
    if (tx < 0 || tx >= this.w) return EDGE_REC;
    if (ty >= this.h) return AIR_REC;
    return this.recByCode[this.map[ty * this.w + tx]] || AIR_REC;
  }

  tileAt(tx, ty) {
    return this.recAt(tx | 0, ty | 0);
  }

  tileAtPixel(px, py) {
    return this.recAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  setTile(tx, ty, ch) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
    if (!this.recByCode[code]) this._makeRec(code);
    this.map[ty * this.w + tx] = code;
  }

  // `dir === 'down'` also counts one-way platforms — how a feet query asks.
  solidAt(px, py, dir) {
    const rec = this.tileAtPixel(px, py);
    if (rec.solid) return true;
    if (dir === 'down' && rec.platform) return true;
    return false;
  }

  platformAt(px, py) {
    return !!this.tileAtPixel(px, py).platform;
  }

  liquidAt(px, py) {
    return !!this.tileAtPixel(px, py).liquid;
  }

  harmAt(px, py) {
    return this.tileAtPixel(px, py).harm || null;
  }

  climbAt(px, py) {
    return !!this.tileAtPixel(px, py).climb;
  }

  _boxSolid(x, y, w, h) {
    return (
      this.solidAt(x + 1, y + 1) ||
      this.solidAt(x + w - 2, y + 1) ||
      this.solidAt(x + 1, y + h - 2) ||
      this.solidAt(x + w - 2, y + h - 2)
    );
  }

  // A player spawned inside the floor is fatal; lift by at most one tile.
  _settlePlayer(p) {
    for (let n = 0; n < TILE && this._boxSolid(p.x, p.y, p.w, p.h); n++) p.y -= 1;
  }

  // -------------------------------------------------------------------------
  // Blocks
  // -------------------------------------------------------------------------
  bumpBlock(tx, ty, by) {
    return this.blocks.bump(tx | 0, ty | 0, by || this.player);
  }

  breakBlock(tx, ty, by) {
    return this.blocks.shatter(tx | 0, ty | 0, by || this.player);
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------
  // Resolve a level-data name onto a registered type, folding in any options
  // the alias implies (variant, winged, ...).
  _resolveType(type, opts) {
    if (this.registry.get(type)) return { type, opts };
    const key = norm(type);
    if (this.registry.get(key)) return { type: key, opts };
    const alias = TYPE_ALIASES[key];
    if (alias && this.registry.get(alias[0])) {
      return { type: alias[0], opts: alias[1] ? { ...alias[1], ...(opts || {}) } : opts };
    }
    return null;
  }

  spawn(type, x, y, opts) {
    if (!type) return null;
    const hit = this._resolveType(type, opts);
    if (!hit) {
      if (!this._warned.has('type' + type)) {
        this._warned.add('type' + type);
        console.warn(`world.spawn: no entity registered for "${type}"`);
      }
      return null;
    }

    let e = null;
    try {
      e = this.registry.create(hit.type, this, x, y, hit.opts || {});
    } catch (err) {
      console.error(`world.spawn: ${hit.type} constructor threw`, err);
      return null;
    }
    if (!e) return null;

    e.world = this;
    if (e.w == null) e.w = TILE;
    if (e.h == null) e.h = TILE;
    this.entities.push(e);
    return e;
  }

  add(entity) {
    if (!entity) return null;
    entity.world = this;
    this.entities.push(entity);
    return entity;
  }

  // -------------------------------------------------------------------------
  // Score, coins, lives
  // -------------------------------------------------------------------------
  // Two systems announce the same event in the same tick (the enemy awards its
  // flat value, the player awards the stomp chain). Inside a merge window the
  // larger value wins and only one popup shows.
  addScore(n, x, y) {
    if (n === '1UP') {
      this.addLife(1, x, y);
      return;
    }
    const v = n | 0;
    if (!v) return;
    const m = this._merge;
    if (m && x != null && Math.abs(x - m.x) < 28 && Math.abs(y - m.y) < 28) {
      if (v <= m.best) return;
      this.score += v - m.best;
      m.best = v;
      return;
    }
    this.score += v;
    if (x != null && y != null) this._popup(String(v), x, y);
  }

  // Prefer the real ScorePop entity; the plain text list is the fallback.
  _popup(text, x, y) {
    const e = this.spawn('scorepop', x, y, { text });
    if (e) return e;
    const q = { text, x, y, t: 0, life: 44 };
    this.popups.push(q);
    return q;
  }

  _beginMerge(x, y) {
    this._merge = { x, y, best: 0 };
  }

  // The popup is deferred to the end of the window so a merged award shows one
  // number, not the first value overwritten by the second.
  _endMerge() {
    const m = this._merge;
    this._merge = null;
    if (m && m.best > 0) this._popup(String(m.best), m.x, m.y);
  }

  addCoin(n = 1) {
    this.coins += n;
    while (this.coins >= 100) {
      this.coins -= 100;
      this.addLife(1);
    }
  }

  // Called as addLife(1) by the player, and as addLife(1, x, y) internally.
  addLife(n = 1, x, y) {
    this.lives += Math.max(1, n | 0);
    this.sfx('one-up');
    const p = this.player;
    const px = x != null ? x : p ? p.x + p.w * 0.5 : null;
    const py = y != null ? y : p ? p.y : null;
    if (px != null) this._popup('1UP', px, py);
  }

  freeze(ticks) {
    const t = ticks | 0;
    if (t > this.freezeTimer) this.freezeTimer = t;
  }

  shake(mag, ticks = 8) {
    this.cam.shake(mag, ticks);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update() {
    if (!this.level) return;
    // Open a fresh sound-effect window for this tick.
    if (typeof this.audio.__endTick === 'function') this.audio.__endTick();

    if (this.state === 'gameover' || this.state === 'complete') {
      this.cam.updateShake();
      return;
    }

    // Hit-stop: gameplay is fully suspended, but the shake keeps running so the
    // impact still reads on screen.
    if (this.freezeTimer > 0) {
      this.freezeTimer--;
      this.cam.updateShake();
      return;
    }

    this.tick++;
    if (this.state === 'levelend') this._updateLevelEnd();
    else this._updatePlaying();

    this.cam.update();
    this._updatePopups();
  }

  _updatePlaying() {
    const p = this.player;
    const roster = this.players && this.players.length ? this.players : p ? [p] : [];
    // In co-op the level only holds still when EVERY live brother is dying, so one
    // player's death does not freeze the other mid-jump.
    const dying = roster.length > 0 && roster.every((q) => q && (q.dead || q.state === 'dying'));
    // SMB halts its whole game engine for the grow/shrink animation: the injury
    // and power-up routines set TimerControl to $ff, and that one flag gates
    // enemy movement, platforms, firebars, the level timer and every other
    // subroutine until the change-size routine clears it. Only the player's own
    // animation keeps ticking — which is why this cannot go through freeze(),
    // whose early return would stop the very stateTimer that ends the state.
    //
    // NOTE the asymmetry with `dying` above: that one is every(), this one is
    // some(). Deliberate. A death arc runs for seconds and ends in a respawn, so
    // holding the level for it would strand the other brother; a size change is
    // ~35 frames, and pausing the enemies briefly for both is far less intrusive
    // than letting a goomba walk through a frozen player. Flip this to every()
    // if co-op should never hold still for one brother's mushroom.
    const changing = roster.some((q) => q && (q.state === 'growing' || q.state === 'shrinking'));

    // The player reports its own death once the fall animation clears the
    // screen. If it never does — a broken update, a death off the bottom of a
    // very tall level — the world takes the life itself rather than hanging.
    if (dying) {
      if (++this._deadTicks > DEATH_WATCHDOG) {
        this._deadTicks = 0;
        this.onPlayerDeath();
        return;
      }
    } else {
      this._deadTicks = 0;
      if (!changing) this._updateTimer();
    }

    for (const q of roster) if (q) this._safe(q, 'update');

    // SMB holds the whole level still while Mario's death arc plays.
    if (!dying && !changing) {
      this._updateBridgeFall();
      this.blocks.update();
      this._updateEntities();
      for (const q of roster) {
        if (!q || q.dead) continue;
        this._collidingPlayer = q;
        this._playerEntityCollisions(q);
        this._collectTiles(q);
        this._checkHiddenBlocks(q);
        this._checkCheckpoint(q);
        this._collidingPlayer = null;
      }
      this._compact();
    }
    this._updateParticles();
  }

  _updateTimer() {
    if (this.time <= 0) return;
    if (++this.timeAcc < TIME_TICKS) return;
    this.timeAcc = 0;
    this.time--;

    const a = this._audioRaw;
    if (a && typeof a.updateTime === 'function') {
      try {
        a.updateTime(this.time);
      } catch (err) {
        /* ignore */
      }
    }
    if (this.time <= HURRY_AT && !this.hurryUp) {
      this.hurryUp = true;
      if (!a || typeof a.updateTime !== 'function') this.sfx('time-warning');
    }
    if (this.time <= 0) {
      this.time = 0;
      // The clock is shared, so running it out takes BOTH brothers. Killing
      // only world.player left the other one walking around a dead level.
      const roster = this.players && this.players.length ? this.players : [this.player];
      let killed = false;
      for (const q of roster) {
        if (!q || q.out || q.dead || q.state === 'dying') continue;
        if (typeof q.die === 'function') {
          q.die('timeup');
          killed = true;
        }
      }
      if (!killed) this.onPlayerDeath(this.player);
    }
  }

  // Entity.updateActivation() owns dormancy and despawn, so every entity gets
  // its tick every frame and the wrapper decides whether the body runs.
  _updateEntities() {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed) continue;
      if (e.emerging) {
        this.blocks.stepEmerge(e);
        continue;
      }
      if (e.suspended) continue;
      this._safe(e, 'update');
    }
  }

  _updateParticles() {
    const p = this.particles;
    if (!p || typeof p.update !== 'function') return;
    try {
      p.update(this.cam);
    } catch (err) {
      /* ignore */
    }
  }

  // Vines are intangible — the entity/player collision loop skips them on
  // purpose, or Mario would be shoved around by a beanstalk. They announce
  // themselves here instead, and the player scans this list to latch on.
  registerClimbable(e) {
    if (!e) return;
    if (!Array.isArray(this.climbables)) this.climbables = [];
    if (this.climbables.indexOf(e) < 0) this.climbables.push(e);
  }

  _compact() {
    if (Array.isArray(this.climbables) && this.climbables.length) {
      this.climbables = this.climbables.filter((e) => e && !e.removed);
    }
    const list = this.entities;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && !e.removed) list[n++] = e;
    }
    list.length = n;
  }

  _overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Nothing else walks the entity list against the player: the world owns this.
  _playerEntityCollisions(p) {
    if (!this.resolveEnemyCollisions) return;
    if (p.hidden || p.collidable === false) return;
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || e.dead || e.emerging) continue;
      if (e.tangible === false || e.collidable === false || e.noPlayerCollide) continue;
      if (!this._overlap(p, e)) continue;

      this._beginMerge(e.x + e.w * 0.5, e.y);
      const feetBefore = p.y + p.h - (p.vy || 0);
      const stompable = typeof e.onStomp === 'function' && !e.isItem;

      if (stompable && p.vy > 0 && feetBefore <= e.y + e.h * 0.55) {
        const absorbed = this._safeCall(e, 'onStomp', p);
        // A broken onStomp absorbed nothing. _reportError has already dropped
        // the entity, so there is no touch to fall through to either — awarding
        // the bounce and the score here would only hide the crash.
        if (absorbed === THREW) {
          this._endMerge();
          continue;
        }
        if (absorbed !== false) {
          this._onStompLanded(p, e);
          this._endMerge();
          continue;
        }
      }
      if (typeof e.onPlayerTouch === 'function') this._safeCall(e, 'onPlayerTouch', p);
      this._endMerge();
    }
  }

  _onStompLanded(p, e) {
    // No hit-stop on a stomp. SMB has none, and freezing here breaks chain-stomping:
    // every frozen frame costs ~2.6px of horizontal travel at run speed, so a player
    // bouncing off one enemy lands SHORT of the next one and takes a hit instead.
    this.shake(0.8, 4);
    this.sfx('stomp');
    this.fx('landingDust', e.x + e.w * 0.5, e.y + e.h, 1);

    // The player normally owns the bounce and the chain score. If its bounce
    // throws, the world still has to launch Mario off the enemy's head.
    let bounced = false;
    if (typeof p.stompBounce === 'function') {
      if (this.safeMode) {
        try {
          p.stompBounce(e);
          bounced = true;
        } catch (err) {
          this._reportError(p, 'stompBounce', err);
        }
      } else {
        p.stompBounce(e);
        bounced = true;
      }
    }
    if (bounced) return;

    p.vy = -6.4;
    p.grounded = false;
    const i = p.stompChain | 0;
    p.stompChain = Math.min(i + 1, STOMP_CHAIN.length + 1);
    if (i < STOMP_CHAIN.length) this.addScore(STOMP_CHAIN[i], e.x + e.w * 0.5, e.y);
    else if (i === STOMP_CHAIN.length) this.addLife(1, e.x + e.w * 0.5, e.y);
    else this.addScore(STOMP_CHAIN[STOMP_CHAIN.length - 1], e.x + e.w * 0.5, e.y);
  }

  // Free-standing coins, hazard tiles and the castle axe.
  _collectTiles(p) {
    const x0 = Math.floor((p.x + 2) / TILE);
    const x1 = Math.floor((p.x + p.w - 3) / TILE);
    const y0 = Math.floor((p.y + 2) / TILE);
    const y1 = Math.floor((p.y + p.h - 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const rec = this.recAt(tx, ty);
        if (rec.coin) {
          this.setTile(tx, ty, '.');
          this.addCoin(1);
          this.sfx('coin');
          this.addScore(200, tx * TILE + TILE * 0.5, ty * TILE - 2);
          this.fx('coinSparkle', tx * TILE + TILE * 0.5, ty * TILE + TILE * 0.5);
        } else if (rec.harm) {
          if (typeof p.die === 'function') p.die(rec.harm);
          else this.onPlayerDeath(p);
          return;
        } else if (rec.axe) {
          this.setTile(tx, ty, '.');
          this.sfx('axe');
          this.shake(2.4, 14);
          this.freeze(10);
          // The axe drops the bridge out from under Bowser. Only if there is no
          // bridge to drop does the level end on the spot.
          if (!this._startBridgeFall(tx, ty, p)) {
            if (typeof p.walkOff === 'function') p.walkOff(this.castleX);
            this.levelComplete(p);
          }
          return;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // The axe, the bridge and Bowser.
  //
  // The bridge is found rather than declared, so this works for any castle that
  // puts an axe on the same row as the span: walk left from the axe, skip the
  // gap, and take the first run of solid tiles. It then unbuilds itself one
  // tile at a time from the axe end towards Bowser, exactly the direction the
  // original collapses in.
  // -------------------------------------------------------------------------

  _startBridgeFall(tx, ty, p) {
    let x = tx - 1;
    const limit = Math.max(0, tx - 20);
    while (x >= limit && !this._solidTile(x, ty)) x--;
    if (x < limit) return null;
    const right = x;
    while (x >= 0 && this._solidTile(x, ty)) x--;
    const left = x + 1;
    if (right - left < 2) return null;

    const cols = [];
    for (let c = right; c >= left; c--) cols.push(c);
    this._bridge = { cols, y: ty, timer: 0, player: p || null, bowserDropped: false };
    if (p) p.controlsLocked = true;

    // The axe ends the fight, so nothing left on screen may still kill you — a
    // flame Bowser breathed a moment before you touched it was landing after
    // you had already won. The boss himself stays, because watching him drop is
    // the point. Clearing the hazards is better than making Mario invulnerable:
    // invulnFrames blanks the sprite on odd frames, and he would flicker through
    // the entire collapse and walk-off.
    const boss0 = this._bowser();
    for (const e of this.entities) {
      if (!e || e.removed || e === boss0) continue;
      if (e.isPlayer || e === p) continue;
      if (typeof e.onPlayerTouch === 'function' || e.harmful) e.removed = true;
    }

    // Frame the pair. Mario is at the axe on the right and Bowser is out on the
    // bridge to the left; following Mario alone scrolls the boss off the screen
    // so you never see him drop.
    const boss = this._bowser();
    if (boss && this.cam) {
      const mid = (boss.x + boss.w * 0.5 + (p ? p.x + p.w * 0.5 : boss.x)) * 0.5;
      const maxX = Math.max(0, this.w * TILE - SCREEN_W);
      this.cam.x = Math.max(0, Math.min(maxX, Math.round(mid - SCREEN_W * 0.5)));
      if (typeof this.cam.lock === 'function') this.cam.lock(true);
    }
    return this._bridge;
  }

  _solidTile(tx, ty) {
    const r = this.recAt(tx, ty);
    return !!(r && r.solid);
  }

  _bowser() {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e && !e.removed && typeof e.onAxe === 'function') return e;
    }
    return null;
  }

  _updateBridgeFall() {
    const b = this._bridge;
    if (!b) return;
    b.timer++;
    if (b.timer % 3 !== 0) return;

    if (b.cols.length) {
      const c = b.cols.shift();
      this.setTile(c, b.y, '.');
      this.fx('brickShards', c * TILE + TILE * 0.5, b.y * TILE + TILE * 0.5);
      this.sfx('block-bump');
      // Once the planks under him are gone, the boss goes with them.
      const boss = this._bowser();
      if (!b.bowserDropped && boss) {
        const bx = (boss.x + boss.w * 0.5) / TILE;
        if (c <= bx + 1) {
          b.bowserDropped = true;
          this._safe(boss, 'onAxe');
        }
      }
      return;
    }

    // Bridge gone. Anything still standing on it falls anyway.
    const boss = this._bowser();
    if (!b.bowserDropped && boss) {
      b.bowserDropped = true;
      this._safe(boss, 'onAxe');
    }
    if ((b.timer | 0) < 90) return;
    this._bridge = null;
    const p = b.player || this.player;
    if (p) {
      p.controlsLocked = false;
      if (typeof p.walkOff === 'function') p.walkOff(this.castleX);
    }
    this.levelComplete(p);
  }

  // Mario keeps the midway checkpoint for the rest of his lives on this level.
  _checkCheckpoint(p) {
    if (this.checkpointReached || this.areaId) return;
    const cp = this.rootLevel && this.rootLevel.checkpoint;
    if (!cp || cp.x == null) return;
    if (p.x >= cp.x * TILE) this.checkpointReached = true;
  }

  // Invisible blocks are non-solid until struck from below; the strike and the
  // reveal are the same event, exactly as in the original. The player's own
  // head-bump probe cannot see them precisely because they are not solid.
  _checkHiddenBlocks(p) {
    if (p.vy >= 0) return;
    const ty = Math.floor(p.y / TILE);
    const x0 = Math.floor((p.x + 2) / TILE);
    const x1 = Math.floor((p.x + p.w - 3) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const rec = this.recAt(tx, ty);
      if (!rec.invisible || !rec.bumpable) continue;
      this.bumpBlock(tx, ty, p);
      p.y = (ty + 1) * TILE;
      p.vy = 0;
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Warps — the player drives the pipe animation and calls back here.
  // -------------------------------------------------------------------------
  warpAt(tx, ty, dir) {
    const warps = this.level && this.level.warps;
    if (!Array.isArray(warps)) return null;
    for (const wp of warps) {
      if (!wp || !wp.from || !wp.to) continue;
      if (dir && (wp.dir || 'down') !== dir) continue;
      const fx = wp.from.x | 0;
      const fy = wp.from.y | 0;
      const d = wp.dir || 'down';
      const inX = tx === fx || tx === fx + 1;
      const vertical = d === 'down' || d === 'up';
      const inY = vertical ? ty === fy : ty === fy || ty === fy + 1;
      if (!inX || !inY) continue;
      return wp;
    }
    return null;
  }

  warp(wdef) {
    const to = wdef && wdef.to;
    if (!to) return false;

    // A warp that COMPLETES ends the level the ordinary way — tally, time
    // bonus, then progression — rather than jumping somewhere. The original
    // ends its water levels at a pipe rather than a flagpole, and 2-2 is one.
    //
    // This is deliberately not `to.level`: that path hands off to onWarpLevel,
    // which is the warp-zone route and skips the tally and the level
    // progression entirely. Ending a level through it would look correct in
    // every check we have while quietly costing the player their score.
    if (to.complete) {
      this.levelComplete();
      return true;
    }

    // A warp that names a LEVEL leaves this level entirely, which only the host
    // can do — it owns level ids, the HUD world number and the intro screen. The
    // world just reports the destination and stops.
    if (to.level) {
      if (typeof this.onWarpLevel === 'function') {
        this.onWarpLevel(to.level, to);
        return true;
      }
      return false;
    }

    const area = to.area === 'main' || to.area == null ? null : to.area;
    this.loadLevel(this.rootLevel, area, {
      subArea: true,
      resetTime: false,
      spawnAt: { x: to.x, y: to.y },
    });
    const p = this.player;
    if (!p) return true;
    const exit = to.exit || to.dir || null;
    if (exit && exit !== 'none' && typeof p.exitPipe === 'function') {
      p.exitPipe(exit, { x: to.x | 0, y: to.y | 0 });
    } else {
      p.hidden = false;
      p.controlsLocked = false;
      p.state = 'normal';
    }
    this.cam.reset(this.level, p);
    return true;
  }

  doWarp(wdef) {
    return this.warp(wdef);
  }

  // -------------------------------------------------------------------------
  // Death — the player animates it and reports back when it is done.
  // -------------------------------------------------------------------------
  onPlayerDeath(who) {
    if (this.state === 'gameover') return;

    // Co-op: one brother dying does not end the round. He drops out and the
    // survivor plays on; only when BOTH are out does the level restart. The lead
    // player (and therefore the camera, HUD and block bumps) becomes whoever is
    // still standing.
    const roster = [this.player, this.player2].filter(Boolean);
    if (this.coop && roster.length > 1) {
      const victim = roster.includes(who) ? who : this.player;
      if (victim) {
        victim.out = true;
        victim.hidden = true;
        victim.removed = true;
      }
      const alive = roster.filter((q) => q && !q.out);
      if (alive.length > 0) {
        this.players = alive;
        if (this.player && this.player.out) {
          // Swap the slots rather than overwriting the lead, otherwise
          // player and player2 alias the survivor and it updates twice.
          const survivor = alive[0];
          const fallen = this.player;
          this.player = survivor;
          this.player2 = fallen === survivor ? null : fallen;
          this.cam.player = this.player;
        }
        this._deadTicks = 0;
        return;
      }
      // Nobody left — restore the roster so the restart brings both back.
      const unique = [...new Set(roster)].filter(Boolean);
      for (const q of unique) q.out = false;
      this.player = unique[0];
      this.player2 = unique[1] || null;
      this.players = unique;
      this.cam.player = this.player;
    }

    if (this.lives <= 0) {
      this.state = 'gameover';
      this.music('game-over');
      if (this.onGameOver) this.onGameOver(this);
      return;
    }
    this.lives--;
    const handled = this.onLifeLost ? this.onLifeLost(this) === true : false;
    if (!handled) this.respawn();
  }

  playerDied() {
    this.onPlayerDeath();
  }
  loseLife() {
    this.onPlayerDeath();
  }

  respawn() {
    if (!this.rootLevel) return;
    const cp = this.checkpointReached && this.rootLevel.checkpoint;
    this.loadLevel(this.rootLevel, null, {
      resetTime: true,
      resetPlayer: true,
      spawnAt: cp ? { x: cp.x, y: cp.y } : null,
    });
  }

  hurtPlayer(a, b) {
    // Co-op: enemies call hurtPlayer(this) without naming a victim, so the world
    // remembers whose collision pass is running. Without this every hit landed on
    // player 1 — Luigi could walk into a shell and Mario would take the damage.
    const roster = this.players && this.players.length ? this.players : [this.player];
    let p = null;
    if (roster.includes(a)) p = a;
    else if (roster.includes(b)) p = b;
    if (!p) p = this._collidingPlayer || this.player;
    const src = a === p ? b : a;
    if (!p || p.dead) return false;
    if (typeof p.hurt === 'function') return p.hurt(src) !== false;
    if (typeof p.die === 'function') p.die('hit');
    return true;
  }

  // -------------------------------------------------------------------------
  // Flagpole and level end — the player drives the slide and the walk-off.
  // -------------------------------------------------------------------------
  lowerFlag() {
    this.flagFalling = true;
    this.state = 'levelend';
    this.endPhase = 'flag';
    this.endTimer = 0;
    this.cam.lock(true);
  }

  startFlag() {
    this.lowerFlag();
  }

  onFlagDone() {
    if (this.endPhase === 'flag') this.endPhase = 'walk';
    this.fx('flagConfetti', this.flag ? this.flag.x + 8 : 0, this.flagY);
  }

  flagComplete() {
    this.onFlagDone();
  }

  // Player finished walking into the castle (or the axe fired).
  levelComplete() {
    if (this.state === 'complete') return;
    this.state = 'levelend';
    this.endPhase = 'tally';
    this.endTimer = 0;
    this.cam.lock(true);
  }

  onPlayerFinish() {
    this.levelComplete();
  }
  levelClear() {
    this.levelComplete();
  }
  completeLevel() {
    this.levelComplete();
  }

  _updateLevelEnd() {
    this.endTimer++;
    const p = this.player;
    const roster = this.players && this.players.length ? this.players : p ? [p] : [];
    for (const q of roster) if (q) this._safe(q, 'update');
    this.blocks.update();
    this._updateEntities();
    this._updateParticles();
    this._compact();

    if (this.flagFalling && this.flag) {
      const rest = this.flag.bottom - TILE * 2;
      this.flagY = Math.min(rest, this.flagY + FLAG_DROP);
      if (this.flagY >= rest) this.flagFalling = false;
    }

    // If the player's walk-off never reports in (a wall, a missing castle),
    // the level must still finish rather than hang forever.
    if ((this.endPhase === 'flag' || this.endPhase === 'walk') && this.endTimer > 900) {
      this.levelComplete();
      return;
    }

    if (this.endPhase === 'tally') {
      if (this.endTimer % TALLY_TICKS === 0) {
        if (this.time > 0) {
          this.time--;
          this.score += TALLY_POINTS;
          this.sfx('coin');
        } else {
          this.endPhase = 'hold';
          this.endTimer = 0;
        }
      }
    } else if (this.endPhase === 'hold' && this.endTimer > 90) {
      this.state = 'complete';
      if (this.onLevelComplete) this.onLevelComplete(this);
    }
  }

  _updatePopups() {
    const list = this.popups;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      q.t++;
      q.y -= 0.55;
      if (q.t < q.life) list[n++] = q;
    }
    list.length = n;
  }

  // -------------------------------------------------------------------------
  // Draw. Layers 3..9 of the render stack; the renderer owns sky, parallax and
  // the HUD. Entity draw receives a shake-adjusted render camera, so the shake
  // never touches the logical camera.
  // -------------------------------------------------------------------------
  draw(ctx) {
    if (!this.level) return;
    const rc = this._syncRenderCam();
    this.drawBackground(ctx, rc);
    this.drawBehind(ctx, rc);
    this.drawTiles(ctx, rc);
    this.drawEntities(ctx, rc);
    this.drawPlayer(ctx, rc);
    this.drawEffects(ctx, rc);
  }

  // Queue each pass on its own layer of renderer.draw(layer, fn).
  submit(renderer) {
    if (!this.level || !renderer || typeof renderer.draw !== 'function') return;
    if (!this._boundPasses) {
      this._boundPasses = [
        [LAYER.BG_TILES, (ctx) => this.drawBackground(ctx, this.rcam)],
        [LAYER.BEHIND, (ctx) => this.drawBehind(ctx, this.rcam)],
        [LAYER.TILES, (ctx) => this.drawTiles(ctx, this.rcam)],
        [LAYER.ENTITIES, (ctx) => this.drawEntities(ctx, this.rcam)],
        [LAYER.PLAYER, (ctx) => this.drawPlayer(ctx, this.rcam)],
        [LAYER.PARTICLES, (ctx) => this.drawEffects(ctx, this.rcam)],
      ];
    }
    this._syncRenderCam();
    for (const [layer, fn] of this._boundPasses) renderer.draw(layer, fn);
  }

  _syncRenderCam() {
    const rc = this.rcam;
    rc.x = this.cam.x + this.cam.shakeX;
    rc.y = this.cam.y + this.cam.shakeY;
    return rc;
  }

  _visibleRange(cam) {
    return {
      x0: Math.max(0, Math.floor(cam.x / TILE) - 1),
      x1: Math.min(this.w - 1, Math.floor((cam.x + SCREEN_W) / TILE) + 1),
      y0: Math.max(0, Math.floor(cam.y / TILE) - 1),
      y1: Math.min(this.h - 1, Math.floor((cam.y + SCREEN_H) / TILE) + 1),
    };
  }

  tileSprite(rec, tick) {
    if (!rec) return null;
    if (rec.anim) return rec.anim.frame(tick);
    return rec.sprite || null;
  }

  // The end-of-level castle. Background art, drawn behind everything, with its base
  // planted on the ground column beneath it and its doorway centred on castleX so
  // the walk-in lines up with the arch.
  _drawCastle(ctx, cam) {
    if (this.castleX == null) return;
    // x-3 ends with the tall castle; every other level gets the short one. A level
    // may override with castle.tall.
    const cs = (this.level && this.level.castle) || (this.rootLevel && this.rootLevel.castle) || null;
    const wantTall = cs && cs.tall != null ? !!cs.tall : this.levelNum === 3;
    const art = (wantTall && this.art.castleTall) || this.art.castle;
    const s = artFrame(art, this.tick);
    if (!s) return;
    const tx = Math.floor(this.castleX / TILE);
    // Find the floor by walking UP from the bottom to the first gap. Scanning down
    // from the top instead lands on whatever solid tile comes first — a brick, a
    // platform, a leftover decorative block — and leaves the castle floating.
    let groundY = this.h * TILE;
    for (let ty = this.h - 1; ty >= 0; ty--) {
      const r = this.recAt(tx, ty);
      if (!(r && r.solid)) {
        groundY = (ty + 1) * TILE;
        break;
      }
    }
    const x = Math.floor(this.castleX + TILE / 2 - s.w / 2 - cam.x);
    const y = Math.floor(groundY - s.h - cam.y);
    if (x + s.w < 0 || x > SCREEN_W) return;
    s.draw(ctx, x, y);
  }

  drawBackground(ctx, cam) {
    this._drawCastle(ctx, cam);
    const list = this.decor;
    const span = this.w * TILE;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const s = artFrame(d.art, this.tick);
      if (!s) continue;
      let x = d.x;
      if (d.drift) {
        // Nothing in the sky is static: clouds slide at the drift rate
        // scenery.js publishes, wrapping around the level so one never runs out.
        const period = span + s.w;
        x = ((((d.x + this.tick * d.drift + s.w) % period) + period) % period) - s.w;
      }
      if (x + s.w < cam.x || x > cam.x + SCREEN_W) continue;
      s.draw(ctx, Math.floor(x - cam.x), Math.floor(d.y - cam.y));
    }
  }

  // 0 = behind the tile layer (emerging items, piranhas in pipes)
  // 1 = the normal entity layer
  // 2 = above the player (score popups and anything that opted into the
  //     particle layer) — a "100" must never hide behind Mario's head.
  _entityPass(e) {
    if (e.emerging || e.behind || e.layer === LAYER.BEHIND) return 0;
    if (e.type === 'scorepop' || e.layer >= LAYER.PARTICLES) return 2;
    return 1;
  }

  drawBehind(ctx, cam) {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || this._entityPass(e) !== 0) continue;
      this._drawEntity(ctx, cam, e);
    }
  }

  drawTiles(ctx, cam) {
    const r = this._visibleRange(cam);
    const blocks = this.blocks;
    for (let ty = r.y0; ty <= r.y1; ty++) {
      const row = ty * this.w;
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const rec = this.recByCode[this.map[row + tx]];
        if (!rec || rec.decor || rec.invisible || rec.code === 46) continue;
        const s = this.tileSprite(rec, this.tick);
        if (!s) continue;
        const off = rec.bumpable ? blocks.offsetAt(tx, ty) : 0;
        s.draw(
          ctx,
          Math.floor(tx * TILE - cam.x),
          Math.floor(ty * TILE + off + (TILE - s.h) - cam.y)
        );
      }
    }
    this._drawFlag(ctx, cam);
  }

  // The flag hangs on the left of the pole, its mast column on the pole centre.
  _drawFlag(ctx, cam) {
    const f = this.flag;
    // scenery.FLAG resolves to an Anim (it ripples), so take the current frame
    // rather than assuming a bare Sprite.
    const s = artFrame(this.art.flag, this.tick);
    if (!f || !s) return;
    s.draw(ctx, Math.floor(f.x + 8 - (s.w - 2) - cam.x), Math.floor(this.flagY - cam.y));
  }

  drawEntities(ctx, cam) {
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || this._entityPass(e) !== 1) continue;
      this._drawEntity(ctx, cam, e);
    }
  }

  drawPlayer(ctx, cam) {
    // Luigi first so Mario reads on top when they overlap.
    const roster = this.players && this.players.length ? this.players : [this.player];
    for (let i = roster.length - 1; i >= 0; i--) {
      const q = roster[i];
      if (!q || q.removed) continue;
      this._drawEntity(ctx, cam, q);
    }
  }

  _drawEntity(ctx, cam, e) {
    if (typeof e.draw !== 'function') return;
    if (this.safeMode) {
      try {
        e.draw(ctx, cam);
      } catch (err) {
        this._reportError(e, 'draw', err);
      }
    } else {
      e.draw(ctx, cam);
    }
    if (this.debug.hitboxes) {
      ctx.strokeStyle = e === this.player ? '#ff4d6d' : '#7de2ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.floor(e.x - cam.x) + 0.5,
        Math.floor(e.y - cam.y) + 0.5,
        (e.w || TILE) - 1,
        (e.h || TILE) - 1
      );
    }
  }

  drawEffects(ctx, cam) {
    this.blocks.drawEffects(ctx, cam);
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.removed || this._entityPass(e) !== 2) continue;
      this._drawEntity(ctx, cam, e);
    }
    const p = this.particles;
    if (p && typeof p.draw === 'function') {
      try {
        p.draw(ctx, cam);
      } catch (err) {
        /* ignore */
      }
    }
    this._drawSigns(ctx, cam);
    this._drawPopups(ctx, cam);
  }

  // Level text baked into world space: `signs: [{ x, y, text }]` in TILE
  // coordinates. SMB's warp zone paints its world numbers straight onto the
  // background, and this is that — it scrolls with the level, unlike the HUD.
  _drawSigns(ctx, cam) {
    const signs = this.level && this.level.signs;
    if (!Array.isArray(signs) || !signs.length) return;
    if (!this._textResolved) {
      this._textResolved = true;
      this._text = buildTextDrawer();
    }
    const draw = this._text;
    if (!draw) return;
    for (const s of signs) {
      if (!s || !s.text) continue;
      const sx = Math.floor(s.x * TILE - cam.x);
      const sy = Math.floor(s.y * TILE - cam.y);
      if (sx < -256 || sx > SCREEN_W + 256) continue;
      try {
        draw(ctx, String(s.text), sx, sy);
      } catch (err) {
        this._text = null;
        return;
      }
    }
  }

  _drawPopups(ctx, cam) {
    if (!this.popups.length) return;
    if (!this._textResolved) {
      this._textResolved = true;
      this._text = buildTextDrawer();
    }
    const draw = this._text;
    if (!draw) return;
    for (let i = 0; i < this.popups.length; i++) {
      const q = this.popups[i];
      try {
        draw(ctx, q.text, Math.floor(q.x - cam.x - q.text.length * 4), Math.floor(q.y - cam.y));
      } catch (err) {
        this._text = null;
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Safety net: one broken module must not take the whole build down while the
  // other agents are still landing their files.
  // -------------------------------------------------------------------------
  _safe(obj, method) {
    if (!obj || typeof obj[method] !== 'function') return undefined;
    if (!this.safeMode) return obj[method]();
    try {
      return obj[method]();
    } catch (err) {
      this._reportError(obj, method, err);
      return undefined;
    }
  }

  // Returns THREW when the call blew up, so a crashing entity is never mistaken
  // for one that deliberately returned undefined.
  _safeCall(obj, method, arg) {
    if (!obj || typeof obj[method] !== 'function') return undefined;
    if (!this.safeMode) return obj[method](arg);
    try {
      return obj[method](arg);
    } catch (err) {
      this._reportError(obj, method, err);
      return THREW;
    }
  }

  _reportError(e, method, err) {
    const k = `${e && e.constructor ? e.constructor.name : '?'}.${method}`;
    if (!this._warned.has(k)) {
      this._warned.add(k);
      console.error(`world: ${k} threw`, err);
    }
    if (e !== this.player) e.removed = true;
  }
}

export default World;
