import { Entity, registerEntity } from '../entity.js';
import * as EA from '../../data/sprites/enemies-a.js';
import {
  pickAnim,
  pickSprite,
  enemyDie,
  frozen,
  hurtPlayer,
  starTouch,
  spawnAt,
  addScore,
  chainScore,
  shellSpeed,
  enemyGravity,
  enemyMaxFall,
  fx,
  sfx,
} from './index.js';

const STILL_FRAMES = 140;
const WOBBLE_FRAMES = 80;

const ART = {
  green: {
    rest: pickSprite(EA, ['KOOPA_GREEN.shell', 'KOOPA_SHELL'], null),
    spin: pickAnim(EA, ['KOOPA_GREEN.shellSpin', 'SHELL_SPIN'], null, 4),
  },
  red: {
    rest: pickSprite(EA, ['KOOPA_RED.shell', 'KOOPA_GREEN.shell'], null),
    spin: pickAnim(EA, ['KOOPA_RED.shellSpin', 'KOOPA_GREEN.shellSpin'], null, 4),
  },
  buzzy: {
    rest: pickSprite(EA, ['BUZZY.shell', 'KOOPA_GREEN.shell'], null),
    spin: pickAnim(EA, ['BUZZY.shellSpin', 'KOOPA_GREEN.shellSpin'], null, 4),
  },
};

export default class Shell extends Entity {
  static type = 'shell';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.variant = ART[opts.variant] ? opts.variant : 'green';
    this.art = ART[this.variant];
    this.facing = opts.facing || -1;
    this.speed = opts.speed == null ? shellSpeed() : opts.speed;

    this.sliding = !!opts.kicked;
    this.vx = this.sliding ? this.speed * this.facing : 0;
    this.stillT = 0;
    this.chain = 0;
    // Brief grace so the shell the player just made cannot instantly hurt them.
    this.kickGrace = 8;

    this.isEnemy = true;
    this.isWalker = false;
    this.isShell = true;
  }

  update() {
    if (frozen(this.world)) return;
    if (this.kickGrace > 0) this.kickGrace--;

    this.applyGravity(enemyGravity(), enemyMaxFall());

    if (this.sliding) {
      this.vx = this.speed * this.facing;
      const col = this.moveAndCollide();
      if (col.hitLeft || col.hitRight) this._hitWall(col);
      this._sweep();
      return;
    }

    this.vx = 0;
    this.moveAndCollide();
    this.stillT++;
    if (this.stillT >= STILL_FRAMES + WOBBLE_FRAMES) this._revert();
  }

  get wobbling() {
    return !this.sliding && this.stillT >= STILL_FRAMES;
  }

  _hitWall(col) {
    const face = col.hitLeft ? col.left : col.right;
    this.facing = col.hitLeft ? 1 : -1;
    this.vx = this.speed * this.facing;
    sfx(this.world, 'bump');
    fx(this.world, 'lavaSpark', col.hitLeft ? this.x : this.x + this.w, this.centerY);

    // A shell at full tilt shatters brick and pops question blocks.
    if (face && this.world) {
      const rec = face.tile;
      if (rec && rec.breakable && typeof this.world.breakBlock === 'function') {
        this.world.breakBlock(face.tx, face.ty, this);
      } else if (rec && rec.bumpable && typeof this.world.bumpBlock === 'function') {
        this.world.bumpBlock(face.tx, face.ty, this);
      }
    }
  }

  // A moving shell mows down every enemy it touches, worth more each time.
  _sweep() {
    const list = this.world && this.world.entities;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || o === this || o.removed || o.dead) continue;
      if (!o.isEnemy || o.shellProof) continue;
      if (typeof o.onShell !== 'function' || !this.hits(o)) continue;
      const pts = chainScore(this.chain++);
      o.onShell(this);
      addScore(this.world, pts, o.centerX, o.y);
      sfx(this.world, 'kick');
      if (this.world && typeof this.world.freeze === 'function') this.world.freeze(2);
    }
  }

  kick(dir) {
    this.sliding = true;
    this.facing = dir < 0 ? -1 : 1;
    this.vx = this.speed * this.facing;
    this.stillT = 0;
    this.chain = 0;
    this.kickGrace = 8;
    sfx(this.world, 'kick');
    fx(this.world, 'landingDust', this.centerX, this.y + this.h, 1);
  }

  stop() {
    this.sliding = false;
    this.vx = 0;
    this.stillT = 0;
    this.chain = 0;
  }

  _revert() {
    const type = this.variant === 'buzzy' ? 'buzzy' : 'koopa';
    const h = type === 'buzzy' ? 16 : 24;
    spawnAt(this.world, type, this.x, this.y + this.h - h, {
      variant: this.variant === 'red' ? 'red' : 'green',
      facing: this.facing,
      active: true,
    });
    fx(this.world, 'enemyPoof', this.centerX, this.centerY);
    this.remove();
  }

  draw(ctx, cam) {
    if (this.sliding && !this.dead) {
      this.drawAnim(ctx, cam, this.art.spin);
      return;
    }
    if (this.wobbling && !this.dead) {
      // Shivering shell — telegraphs the koopa climbing back in.
      const t = this.stillT - STILL_FRAMES;
      this.drawSprite(ctx, cam, this.art.rest, { ox: (t >> 2) & 1 ? 1 : -1 });
      return;
    }
    this.drawSprite(ctx, cam, this.art.rest);
  }

  onStomp(player) {
    if (this.dead) return false;
    if (this.sliding) {
      this.stop();
      return true;
    }
    // Landing on a resting shell while moving kicks it that way; landing on it
    // dead still kicks it wherever the player is facing.
    let dir;
    if (player && Math.abs(player.vx || 0) > 0.15) dir = player.vx > 0 ? 1 : -1;
    else if (player && player.facing) dir = player.facing;
    else dir = this.facing;
    this.kick(dir);
    return true;
  }

  onPlayerTouch(player) {
    if (this.dead) return;
    // The grace window has to be checked BEFORE the sliding branch. kick() sets
    // `sliding` and `kickGrace` together, so a player who is still overlapping the
    // shell on the frame after kicking it would otherwise be hurt by the very shell
    // they just kicked away.
    if (this.kickGrace > 0) return;
    if (this.sliding) {
      // Star Mario smashes a live shell instead of taking the hit.
      if (starTouch(this, player, 200)) return;
      hurtPlayer(this);
      return;
    }
    let dir = player && player.centerX > this.centerX ? -1 : 1;
    if (player && Math.abs(player.vx || 0) > 0.15) dir = player.vx > 0 ? 1 : -1;
    this.kick(dir);
  }

  onFireball(fb) {
    if (this.dead) return false;
    // The buzzy beetle's armour shrugs fire off even as a shell.
    if (this.variant === 'buzzy') return false;
    enemyDie(this, 'fireball', fb, 100);
    return true;
  }

  onShell(other) {
    enemyDie(this, 'shell', other, 0);
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

registerEntity(Shell);
