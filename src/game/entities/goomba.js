import { Entity, registerEntity } from '../entity.js';
import * as EA from '../../data/sprites/enemies-a.js';
import {
  pickAnim,
  pickSprite,
  walkStep,
  enemyBump,
  enemyDie,
  frozen,
  hurtPlayer,
  starTouch,
  fx,
  walkSpeed,
} from './index.js';

const SETS = {
  overworld: {
    walk: pickAnim(EA, ['GOOMBA.walk', 'GOOMBA_WALK', 'GOOMBA_ANIM'], null, 8),
    flat: pickSprite(EA, ['GOOMBA.flat', 'GOOMBA_FLAT', 'GOOMBA_SQUASH'], null),
  },
  underground: {
    walk: pickAnim(EA, ['GOOMBA_UNDER.walk', 'GOOMBA.walk'], null, 8),
    flat: pickSprite(EA, ['GOOMBA_UNDER.flat', 'GOOMBA.flat'], null),
  },
  castle: {
    walk: pickAnim(EA, ['GOOMBA_CASTLE.walk', 'GOOMBA.walk'], null, 8),
    flat: pickSprite(EA, ['GOOMBA_CASTLE.flat', 'GOOMBA.flat'], null),
  },
};

function setFor(world, opts) {
  const t = (opts && opts.theme) || (world && world.level && world.level.theme) || 'overworld';
  return SETS[t] || SETS.overworld;
}

export default class Goomba extends Entity {
  static type = 'goomba';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.facing = opts.facing || -1;
    this.speed = opts.speed == null ? walkSpeed(world) : opts.speed;
    this.art = setFor(world, opts);
    this.anim = this.art.walk;
    this.isWalker = true;
    this.isEnemy = true;
  }

  update() {
    if (frozen(this.world)) return;
    walkStep(this, { speed: this.speed });
    enemyBump(this);
  }

  draw(ctx, cam) {
    if (this.dead && this.killStyle === 'stomp') {
      this.drawSprite(ctx, cam, this.art.flat);
      return;
    }
    this.drawAnim(ctx, cam, this.art.walk);
  }

  onStomp(player) {
    if (this.dead) return false;
    this.kill('stomp', player);
    this.squashTicks = 30;
    fx(this.world, 'landingDust', this.centerX, this.y + this.h, 1.2);
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

  // A block bumped from under its feet flips it onto its back.
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

registerEntity(Goomba);
