import { Entity, registerEntity } from '../entity.js';
import { SCREEN_W } from '../../core/constants.js';
import * as EB from '../../data/sprites/enemies-b.js';
import { pickSprite, enemyDie, frozen, hurtPlayer, starTouch, fx, sfx } from './index.js';

const SPEED = 2.4;
const BODY = pickSprite(EB, ['BULLET_BILL.body', 'BULLET_BILL', 'BULLETBILL'], null);

export default class BulletBill extends Entity {
  static type = 'bulletbill';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.facing = opts.dir || opts.facing || -1;
    this.speed = opts.speed == null ? SPEED : opts.speed;
    this.vx = this.speed * this.facing;
    this.vy = 0;
    this.gravity = 0;
    // Fired from a cannon: it punches straight through the level, unaffected
    // by gravity, until it leaves the screen.
    this.noclip = true;
    this.sprite = BODY;
    this.isEnemy = true;

    // The cannon shares the whistle-and-bang of the end-of-level fireworks,
    // exactly as the original reuses one effect for both.
    if (opts.silent !== true) sfx(world, 'firework');
    fx(world, 'enemyPoof', this.facing > 0 ? x : x + this.w, y + 8);
  }

  update() {
    if (frozen(this.world)) return;
    this.vx = this.speed * this.facing;
    this.x += this.vx;

    if ((this.tick & 7) === 0) {
      fx(this.world, 'bubble', this.facing > 0 ? this.x : this.x + this.w, this.centerY);
    }

    const cam = this.world && this.world.cam;
    if (cam && (this.x > cam.x + SCREEN_W + 48 || this.x + this.w < cam.x - 48)) this.remove();
  }

  draw(ctx, cam) {
    this.drawSprite(ctx, cam, BODY);
  }

  onStomp(player) {
    if (this.dead) return false;
    this.kill('stomp', player);
    this.squashTicks = 18;
    fx(this.world, 'enemyPoof', this.centerX, this.centerY);
    return true;
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

  onPlayerTouch(player) {
    if (this.dead) return;
    if (starTouch(this, player, 200)) return;
    hurtPlayer(this);
  }
}

registerEntity(BulletBill);
