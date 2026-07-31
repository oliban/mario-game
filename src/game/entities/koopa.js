import { Entity, registerEntity } from '../entity.js';
import * as EA from '../../data/sprites/enemies-a.js';
import {
  pickAnim,
  walkStep,
  enemyBump,
  enemyDie,
  frozen,
  hurtPlayer,
  starTouch,
  spawnAt,
  fx,
  walkSpeed,
  enemyGravity,
} from './index.js';

// Apex of the green paratroopa's hop, in pixels. The impulse is solved from it
// against the shared enemy gravity so the arc is fixed, not the velocity.
const HOP_RISE = 38;

const GREEN = {
  walk: pickAnim(EA, ['KOOPA_GREEN.walk', 'KOOPA_WALK'], null, 10),
  fly: pickAnim(EA, ['KOOPA_GREEN.fly', 'KOOPA_GREEN.walk'], null, 6),
};
const RED = {
  walk: pickAnim(EA, ['KOOPA_RED.walk', 'KOOPA_GREEN.walk'], null, 10),
  fly: pickAnim(EA, ['KOOPA_RED.fly', 'KOOPA_GREEN.fly'], null, 6),
};

export default class Koopa extends Entity {
  static type = 'koopa';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 24;
    this.facing = opts.facing || -1;
    this.variant = opts.variant === 'red' ? 'red' : 'green';
    this.art = this.variant === 'red' ? RED : GREEN;
    this.speed = opts.speed == null ? walkSpeed() : opts.speed;

    this.winged = !!(opts.winged || opts.wing || opts.para);
    // Red paratroopas hover on a vertical sine; green ones hop along the floor.
    this.flying =
      opts.fly === true || (this.winged && opts.fly !== false && this.variant === 'red');
    this.homeY = y;
    this.flyRange = opts.range == null ? 40 : opts.range;
    this.flyRate = opts.flyRate == null ? 0.042 : opts.flyRate;
    this.hopPower =
      opts.hopPower == null ? Math.sqrt(2 * enemyGravity() * HOP_RISE) : opts.hopPower;

    // Green koopas walk straight off a ledge; red ones turn at the edge.
    this.turnAtLedge = opts.turnAtLedge != null ? !!opts.turnAtLedge : this.variant === 'red';

    this.anim = this.winged ? this.art.fly : this.art.walk;
    this.isWalker = !this.winged;
    this.isEnemy = true;
    this.flyT = 0;
  }

  update() {
    if (frozen(this.world)) return;

    if (this.winged && this.flying) {
      this.flyT++;
      const prev = this.y;
      this.y = this.homeY + Math.sin(this.flyT * this.flyRate) * this.flyRange;
      this.vy = this.y - prev;
      this.vx = this.speed * this.facing * 0.35;
      const col = this.moveAndCollide(this.vx, 0);
      if (col.hitLeft || col.hitRight) this.facing = col.hitLeft ? 1 : -1;
      return;
    }

    const col = walkStep(this, {
      speed: this.speed,
      turnAtLedge: this.turnAtLedge && !this.winged,
    });
    if (this.winged && col.hitBottom) {
      this.vy = -this.hopPower;
      this.grounded = false;
      fx(this.world, 'landingDust', this.centerX, this.y + this.h, 0.7);
    }
    enemyBump(this);
  }

  draw(ctx, cam) {
    const anim = this.winged && !this.dead ? this.art.fly : this.art.walk;
    this.drawAnim(ctx, cam, anim);
  }

  _toShell(dir) {
    const shell = spawnAt(this.world, 'shell', this.x, this.y + this.h - 16, {
      variant: this.variant,
      facing: dir || this.facing,
      active: true,
    });
    fx(this.world, 'enemyPoof', this.centerX, this.y + this.h - 8);
    this.remove();
    return shell;
  }

  onStomp(player) {
    if (this.dead) return false;
    if (this.winged) {
      // The first stomp only strips the wings.
      this.winged = false;
      this.flying = false;
      this.isWalker = true;
      this.vy = 0;
      this.grounded = false;
      fx(this.world, 'powerupSparkle', this.centerX, this.y + 6);
      return true;
    }
    this._toShell(player && player.facing ? player.facing : this.facing);
    return true;
  }

  onFireball(fb) {
    if (this.dead) return false;
    enemyDie(this, 'fireball', fb, 100);
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

registerEntity(Koopa);
