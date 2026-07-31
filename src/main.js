import { SCREEN_W, SCREEN_H, LAYER, DT } from './core/constants.js';
import { bakeAll, spriteCount } from './core/gfx.js';
import { GameLoop } from './core/loop.js';
import input, { BTN } from './core/input.js';
import rng from './core/rng.js';

import renderer from './render/renderer.js';
import World from './game/world.js';
import particles from './fx/particles.js';
import { screens, options } from './ui/screens.js';
import { drawHud } from './ui/hud.js';

import audio from './audio/engine.js';
import playSfx, { SFX_NAMES, hasSfx } from './audio/sfx.js';
import { playMusic, stopMusic, pauseMusic, resumeMusic, starMusic, setHurry } from './audio/music.js';

import { getLevel, nextLevel, firstLevel, ORDER } from './data/levels/index.js';

const boot = document.getElementById('boot');
const bootBar = boot && boot.querySelector('.bar i');
const HEADLESS = new URLSearchParams(location.search).has('headless');

function progress(pct, label) {
  if (bootBar) bootBar.style.width = `${Math.round(pct * 100)}%`;
  if (boot && label) boot.childNodes[0].nodeValue = label;
}

// Gameplay modules were written in parallel and each invented its own names for the
// same sounds ('1up' / 'oneup' / 'one-up'). Rather than edit a dozen files, the host
// owns the vocabulary: every alias below resolves to a real effect in sfx.js.
const SFX_ALIAS = {
  '1up': 'one-up',
  oneup: 'one-up',
  powerup: 'powerup-collect',
  grow: 'powerup-collect',
  star: 'powerup-collect',
  'item-appear': 'powerup-appear',
  sprout: 'powerup-appear',
  powerdown: 'pipe',
  warp: 'pipe',
  castle: 'pipe',
  jump: 'jump-small',
  'jump-super': 'jump-big',
  kick: 'kick-shell',
  squish: 'stomp',
  die: 'death',
  mariodie: 'death',
  fire: 'fireball',
  shoot: 'fireball',
  throw: 'fireball',
  stroke: 'swim',
  flag: 'flagpole',
  'flagpole-land': 'bump',
  'block-bump': 'bump',
  bowserfall: 'bowser-fall',
  bowserfire: 'enemy-fire',
  rocket: 'firework',
};

function resolveSfx(name) {
  if (!name) return null;
  if (hasSfx(name)) return name;
  const alias = SFX_ALIAS[name];
  return alias && hasSfx(alias) ? alias : null;
}

// A lookup table of every name the game may legitimately ask for. player.js probes
// this (`a.SFX`) to choose from its fallback chain; without it, it always fires the
// first name in the chain, which is often the one that does not exist.
const SFX_TABLE = {};
for (const n of SFX_NAMES) SFX_TABLE[n] = true;
for (const a of Object.keys(SFX_ALIAS)) if (resolveSfx(a)) SFX_TABLE[a] = true;

// The world talks to audio through this narrow pair so a failure in one sound can
// never take down a frame of gameplay.
const audioFacade = {
  SFX: SFX_TABLE,
  sfx(name, opts) {
    const real = resolveSfx(name);
    if (!real) {
      warnOnce(`sfx-unknown:${name}`, new Error(`no effect named "${name}"`));
      return;
    }
    try {
      playSfx(real, opts);
    } catch (e) {
      warnOnce(`sfx:${real}`, e);
    }
  },
  music(name, opts) {
    try {
      if (name == null) stopMusic(opts && opts.fade);
      else playMusic(name, opts);
    } catch (e) {
      warnOnce(`music:${name}`, e);
    }
  },
  star(on) {
    try {
      starMusic(!!on);
    } catch (e) {
      warnOnce('starMusic', e);
    }
  },
  hurry(on) {
    try {
      setHurry(!!on);
    } catch (e) {
      warnOnce('setHurry', e);
    }
  },
};

const warned = new Set();
function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[audio] ${key} failed:`, err && err.message ? err.message : err);
}

class Game {
  constructor() {
    this.world = null;
    this.loop = null;
    this.levelId = firstLevel ? firstLevel() : ORDER[0];
    this.started = false;
    this.audioUnlocked = false;
    this.scripted = false;
    this.fatal = null;
  }

  async boot() {
    if (HEADLESS) document.body.classList.add('headless');

    progress(0.1, 'RENDERER');
    renderer.init({ canvas: document.getElementById('screen'), keys: !HEADLESS });

    progress(0.25, 'ART');
    const baked = bakeAll();

    progress(0.5, 'WORLD');
    this.world = new World({
      onLevelComplete: (w) => this.onLevelComplete(w),
      onGameOver: (w) => this.onGameOver(w),
      onLifeLost: (w) => this.onLifeLost(w),
    });
    this.world.setParticles(particles);
    this.world.setAudio(audioFacade);

    progress(0.7, 'UI');
    screens.attach({ world: this.world, renderer, audio });

    progress(0.85, 'INPUT');
    input.attach(window);
    this._bindGestures();

    progress(1, 'READY');

    this.loop = new GameLoop(
      () => this.update(),
      (alpha) => this.render(alpha)
    );

    // Load the opening level so the very first rendered frame is real content.
    await this.loadLevel(this.levelId);

    if (!HEADLESS) {
      await screens.showTitle();
    }

    if (boot) boot.classList.add('gone');
    if (!HEADLESS) this.loop.start();

    console.info(
      `[boot] ${baked} sprites baked (${spriteCount()} registered), ${ORDER.length} levels available.`
    );
    return this;
  }

  _bindGestures() {
    const unlock = () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      try {
        if (typeof audio.unlock === 'function') audio.unlock();
        else if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      } catch (e) {
        warnOnce('unlock', e);
      }
    };
    for (const ev of ['keydown', 'pointerdown', 'touchstart']) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    }
    // Dim the control hint once the player clearly knows the controls.
    const hint = document.getElementById('hint');
    if (hint) {
      window.addEventListener(
        'keydown',
        () => {
          setTimeout(() => hint.classList.add('gone'), 2500);
        },
        { once: true }
      );
    }
  }

  async loadLevel(id, areaId = null, opts = {}) {
    const lvl = getLevel(id);
    if (!lvl) {
      console.error(`[main] unknown level "${id}"`);
      return false;
    }
    this.levelId = id;
    const [w, l] = String(id).split('-');
    this.world.worldNum = parseInt(w, 10) || 1;
    this.world.levelNum = parseInt(l, 10) || 1;
    this.world.loadLevel(lvl, areaId, opts);
    if (this.world.level && this.world.level.music !== undefined) {
      audioFacade.music(this.world.level.music);
    } else {
      audioFacade.music(this.world.theme || 'overworld');
    }
    return true;
  }

  async startGame() {
    this.started = true;
    this.world.score = 0;
    this.world.coins = 0;
    this.world.lives = 3;
    await this.loadLevel(firstLevel ? firstLevel() : ORDER[0]);
    await screens.showIntro(this.world);
  }

  onLevelComplete() {
    const next = nextLevel(this.levelId);
    (async () => {
      try {
        await screens.showTally(this.world);
      } catch (e) {
        /* tally is cosmetic */
      }
      if (next) {
        await this.loadLevel(next);
        await screens.showIntro(this.world);
      } else {
        await screens.showGameOver(this.world, { cleared: true });
        await screens.showTitle();
      }
    })();
    return true;
  }

  onLifeLost() {
    (async () => {
      await this.loadLevel(this.levelId, null, { fromCheckpoint: this.world.checkpointReached });
      await screens.showIntro(this.world);
    })();
    return true;
  }

  onGameOver() {
    (async () => {
      await screens.showGameOver(this.world);
      await screens.showTitle();
    })();
    return true;
  }

  update() {
    if (this.fatal) return;
    try {
      input.update();

      if (input.pressed(BTN.START) && this.started && !screens.blocksWorld) {
        screens.togglePause();
        audioFacade.sfx('pause');
        if (screens.paused) pauseMusic();
        else resumeMusic();
      }

      const menuResult = screens.update();
      if (menuResult === 'start1' || menuResult === 'start2') {
        this.startGame();
      } else if (menuResult === 'options') {
        screens.showOptions();
      }

      if (!screens.blocksWorld && !screens.paused) {
        this.world.update();
      }
    } catch (e) {
      this.crash(e);
    }
  }

  render() {
    if (this.fatal) return;
    try {
      const sky = renderer.skyColor(this.world && this.world.theme);
      renderer.beginFrame(sky);
      if (this.world && this.world.level) this.world.submit(renderer);
      if (this.started && !screens.hudOwned) {
        renderer.draw(LAYER.HUD, (ctx) => drawHud(ctx, this.world));
      }
      screens.submit(renderer);
      renderer.flush();
      renderer.present();
    } catch (e) {
      this.crash(e);
    }
  }

  crash(e) {
    if (this.fatal) return;
    this.fatal = e;
    console.error('[fatal]', e);
    if (this.loop) this.loop.stop();
    try {
      const ctx = renderer.ctx || (renderer.buffer && renderer.buffer.getContext('2d'));
      if (ctx) {
        ctx.fillStyle = '#180000';
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
        renderer.tinyText(ctx, 'RUNTIME ERROR', 8, 8, '#ff6b6b');
        const msg = String((e && e.message) || e).slice(0, 120);
        renderer.tinyText(ctx, msg.slice(0, 40), 8, 24, '#ffffff');
        renderer.tinyText(ctx, msg.slice(40, 80), 8, 34, '#ffffff');
        renderer.tinyText(ctx, msg.slice(80, 120), 8, 44, '#ffffff');
        renderer.present();
      }
    } catch (_) {
      /* the crash screen itself must never throw */
    }
  }
}

const game = new Game();

const ready = game.boot().catch((e) => {
  console.error('[boot] failed:', e);
  game.crash(e);
  throw e;
});

// ---------------------------------------------------------------------------
// Debug / capture API — ARCHITECTURE.md section 10. tools/shot.mjs drives this.
// ---------------------------------------------------------------------------
window.__GAME = {
  game,
  ready,
  get world() {
    return game.world;
  },
  renderer,
  audio,
  particles,
  screens,
  options,
  rng,

  async loadLevel(id, areaId = null) {
    const ok = await game.loadLevel(id, areaId);
    screens.hide();
    game.started = true;
    game.world.state = 'playing';
    // Settle the camera and one frame of entity activation before capture.
    game.loop.step(1);
    return ok;
  },

  teleport(tileX, tileY) {
    const p = game.world && game.world.player;
    if (!p) return false;
    p.x = tileX * 16;
    p.y = tileY * 16 - (p.h || 16);
    p.vx = 0;
    p.vy = 0;
    const cam = game.world.cam;
    const maxX = Math.max(0, game.world.w * 16 - SCREEN_W);
    cam.x = Math.max(0, Math.min(maxX, p.x - SCREEN_W / 2));
    if (typeof cam.snap === 'function') cam.snap(p);
    game.world.rcam.x = cam.x;
    game.world.rcam.y = cam.y;
    return true;
  },

  setPower(power) {
    const p = game.world && game.world.player;
    if (!p) return false;
    if (power === 'star') {
      if (typeof p.giveStar === 'function') p.giveStar();
      else p.starTimer = 660;
    } else if (typeof p.setPower === 'function') {
      p.setPower(power, true);
    } else {
      p.power = power;
    }
    return true;
  },

  hold(map) {
    game.scripted = true;
    input.force({
      left: !!map.left,
      right: !!map.right,
      up: !!map.up,
      down: !!map.down,
      jump: !!map.jump,
      run: !!map.run,
      start: !!map.start,
      select: !!map.select,
    });
    return true;
  },

  release() {
    game.scripted = false;
    input.release();
    return true;
  },

  tick(n = 1) {
    for (let i = 0; i < n; i++) {
      game.update();
      game.loop.tick++;
    }
    game.render(1);
    return game.loop.tick;
  },

  pause() {
    game.loop.stop();
    return true;
  },

  resume() {
    game.loop.start();
    return true;
  },

  async showTitle() {
    game.started = false;
    await screens.showTitle();
    game.loop.step(1);
    return true;
  },

  setPreset(name) {
    renderer.setPreset(name);
    game.render(1);
    return name;
  },

  setPost(name, on = true) {
    renderer.setPost(name, on);
    return true;
  },

  stats() {
    const w = game.world;
    const p = w && w.player;
    return {
      fps: game.loop ? Math.round(game.loop.fps) : 0,
      tick: game.loop ? game.loop.tick : 0,
      backend: renderer.backend,
      preset: renderer._preset,
      level: game.levelId,
      theme: w ? w.theme : null,
      entities: w ? w.entities.length : 0,
      particles: particles ? particles.count : null,
      state: w ? w.state : null,
      playerState: p ? p.state : null,
      power: p ? p.power : null,
      x: p ? Math.round(p.x) : null,
      y: p ? Math.round(p.y) : null,
      vx: p ? Number(p.vx.toFixed(4)) : null,
      vy: p ? Number(p.vy.toFixed(4)) : null,
      grounded: p ? !!p.grounded : null,
      score: w ? w.score : null,
      coins: w ? w.coins : null,
      lives: w ? w.lives : null,
      time: w ? w.time : null,
      fatal: game.fatal ? String(game.fatal.message || game.fatal) : null,
    };
  },
};

export default game;
