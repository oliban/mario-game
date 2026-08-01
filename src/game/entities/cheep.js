import { Entity, registerEntity } from '../entity.js';
import { SCREEN_H } from '../../core/constants.js';
import * as EB from '../../data/sprites/enemies-b.js';
import { pickAnim, enemyDie, frozen, hurtPlayer, starTouch, playerOf, fx, sfx } from './index.js';

const LEAP_V0 = -7.5;
const LEAP_G = 0.25;

const GREY = pickAnim(EB, ['CHEEP_GREY.swim', 'CHEEP_GREY', 'CHEEP.swim'], null, 9);
const RED = pickAnim(EB, ['CHEEP_RED.swim', 'CHEEP_RED', 'CHEEP.swim'], null, 9);

export default class Cheep extends Entity {
  static type = 'cheep';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.variant = opts.variant === 'red' ? 'red' : 'grey';
    this.anim = this.variant === 'red' ? RED : GREY;
    // Grey cheeps patrol underwater; the red ones are the bridge-level jumpers.
    this.leaping = opts.leap != null ? !!opts.leap : this.variant === 'red' && opts.swim !== true;

    this.homeY = y;
    this.spawnY = y;
    this.bob = opts.bob == null ? 8 : opts.bob;
    this.bobRate = opts.bobRate == null ? 0.045 : opts.bobRate;
    this.swimT = 0;
    this.gravity = 0;
    // Fish move through the level, not against it.
    this.noclip = true;
    this.isEnemy = true;

    if (this.leaping) {
      const p = playerOf(world);
      const dir = opts.dir || (p && p.centerX > x ? 1 : -1);
      this.facing = dir;
      this.vx = opts.vx == null ? dir * 1.1 : opts.vx;
      this.vy = opts.vy == null ? LEAP_V0 : opts.vy;
      this.leapG = opts.gravity == null ? LEAP_G : opts.gravity;
      this.leapMaxFall = opts.maxFall == null ? 0 : opts.maxFall;
      this.active = true;
      // OffscreenBoundsCheck (smbdis.asm 11006) opens with
      //   lda Enemy_ID,x / cmp #FlyingCheepCheep / beq ExScrnBd
      // — the one enemy the original refuses to erase for leaving the sides of
      // the screen. It has to be: a frenzy deliberately surfaces fish up to
      // 160 px behind Mario, and culling those on their first frame thins the
      // barrage to a single fish. That ID only ever comes from a frenzy, so the
      // exemption is scoped the same way; a hand-placed leaper keeps the
      // engine's normal despawn. The arc still ends itself below, so no leak.
      if (opts.offscreenCull === false) this.despawnOffscreen = false;
      // A frenzy launches its fish from below the bottom of the screen, where
      // there is no surface to break — the original plays nothing there either.
      if (opts.silent !== true) {
        // 'swim' is the water burst in sfx.js — the closest thing to a splash.
        sfx(world, 'swim');
        fx(world, 'splash', x + 8, y + 16);
      }
    } else {
      this.facing = opts.facing || -1;
      const base = this.variant === 'red' ? 0.95 : 0.62;
      this.vx = (opts.speed == null ? base : opts.speed) * this.facing;
      this.vy = 0;
    }
  }

  update() {
    if (frozen(this.world)) return;

    if (this.leaping) {
      this.vy += this.leapG;
      if (this.leapMaxFall && this.vy > this.leapMaxFall) this.vy = this.leapMaxFall;
      this.x += this.vx;
      this.y += this.vy;
      // Back under the surface it came from.
      if (this.y > this.spawnY + 24) {
        fx(this.world, 'splash', this.centerX, this.spawnY + 16);
        this.remove();
      }
      return;
    }

    this.swimT++;
    this.x += this.vx;
    const prev = this.y;
    this.y = this.homeY + Math.sin(this.swimT * this.bobRate) * this.bob;
    this.vy = this.y - prev;
    this.facing = this.vx > 0 ? 1 : -1;
    if ((this.tick & 63) === 0) fx(this.world, 'bubble', this.centerX, this.y);

    const cam = this.world && this.world.cam;
    if (cam && this.y > cam.y + SCREEN_H + 96) this.remove();
  }

  draw(ctx, cam) {
    this.drawAnim(ctx, cam, this.variant === 'red' ? RED : GREY);
  }

  onStomp(player) {
    if (this.dead) return false;
    // There is no footing underwater, so only the airborne jumpers squash.
    if (!this.leaping) return false;
    this.kill('stomp', player);
    this.squashTicks = 22;
    return true;
  }

  onPlayerTouch(player) {
    if (this.dead) return;
    if (starTouch(this, player, 200)) return;
    hurtPlayer(this);
  }

  onFireball(fb) {
    if (this.dead) return false;
    enemyDie(this, 'fireball', fb, 200);
    return true;
  }

  onShell(shell) {
    enemyDie(this, 'shell', shell, 0);
  }

  onStar(player) {
    enemyDie(this, 'shell', player, 200);
  }

  onBlockBump(tx, ty, by) {
    enemyDie(this, 'shell', by, 100);
  }

  onBumped(from) {
    enemyDie(this, 'shell', from, 100);
  }
}

registerEntity(Cheep);
