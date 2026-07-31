import { Entity, registerEntity } from '../entity.js';
import { makeSprite, Anim } from '../../core/gfx.js';
import * as EB from '../../data/sprites/enemies-b.js';
import { pickAnim, frozen, hurtPlayer, fx, sfx } from './index.js';

// 0 outline 1 deep red 2 ember 3 flame 4 hot 5 core
const LAVA_PAL = ['#3a0a02', '#8f1d02', '#d64a08', '#ef9a49', '#ffe6a8', '#ffffff'];

// A ball of lava with the flame crest licking off the top. Two frames pulse the
// crest so it never sits still in the air.
const PODOBOO_A = [
  '......0000......',
  '....04444440....',
  '...0444444440...',
  '..044443333330..',
  '.04443333332220.',
  '0444333332222110',
  '0443333332221110',
  '0433333222211110',
  '0433332222111110',
  '0333322221111110',
  '0333222211111110',
  '0322222111111110',
  '0222211111111110',
  '.02221111111110.',
  '..021111111110..',
  '...0000000000...',
];

const PODOBOO_B = [
  '.....000000.....',
  '...0444444440...',
  '..044444444440..',
  '.04444443333330.',
  '0444433333322220',
  '0444333332222110',
  '0443333332221110',
  '0433333222211110',
  '0433332222111110',
  '0333322221111110',
  '0333222211111110',
  '0322222111111110',
  '0222211111111110',
  '.02221111111110.',
  '..021111111110..',
  '...0000000000...',
];

const FLAME = pickAnim(
  EB,
  ['PODOBOO.flicker', 'PODOBOO.flame', 'LAVA_BUBBLE'],
  () =>
    new Anim(
      [makeSprite(PODOBOO_A, LAVA_PAL, { name: 'podoboo-a' }), makeSprite(PODOBOO_B, LAVA_PAL, { name: 'podoboo-b' })],
      5
    ),
  5
);

export const PODOBOO_ART = { flame: FLAME };

export default class Podoboo extends Entity {
  static type = 'podoboo';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.facing = 1;
    this.noclip = true;
    this.gravity = 0;

    this.homeY = y;
    this.power = opts.power == null ? 6.4 : opts.power;
    this.leapG = opts.gravity == null ? 0.25 : opts.gravity;
    this.period = opts.period == null ? 128 : opts.period;
    this.leaping = false;
    this.waitT = opts.phase | 0;
    this.y = this.homeY + 24;
    // Nothing in the game can hurt it, so shells must not try.
    this.shellProof = true;
    this.isEnemy = true;
  }

  update() {
    if (frozen(this.world)) return;

    if (!this.leaping) {
      this.y = this.homeY + 24;
      this.waitT++;
      const air = Math.ceil((2 * this.power) / this.leapG);
      if (this.waitT >= Math.max(24, this.period - air)) this._launch();
      return;
    }

    this.vy += this.leapG;
    this.y += this.vy;
    // Falls back tail-first, exactly as it rose.
    this.flipY = this.vy > 0;
    if (this.vy > 0 && this.y >= this.homeY) {
      this._splash();
      this.y = this.homeY + 24;
      this.leaping = false;
      this.waitT = 0;
      this.vy = 0;
      this.flipY = false;
    }
  }

  _launch() {
    this.leaping = true;
    this.waitT = 0;
    this.y = this.homeY;
    this.vy = -this.power;
    this.flipY = false;
    if (this.onScreen(this.world && this.world.cam, 32)) {
      // Heavy low thud: the lava lurching as the fireball breaks the surface.
      sfx(this.world, 'thwomp');
      this._splash();
    }
  }

  _splash() {
    fx(this.world, 'lavaSpark', this.centerX, this.homeY + 12);
  }

  draw(ctx, cam) {
    if (!this.leaping) return;
    this.drawSprite(ctx, cam, FLAME.frame(this.tick), { flipX: false });
  }

  // Molten: stomps, fireballs and shells all just pass through it.
  onStomp() {
    return false;
  }

  onPlayerTouch() {
    hurtPlayer(this);
  }

  onFireball() {
    return false;
  }

  onShell() {}

  onStar() {}

  onBlockBump() {}

  onBumped() {}
}

registerEntity(Podoboo);
