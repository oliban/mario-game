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
  sfx,
  walkSpeed,
} from './index.js';

const WALK = pickAnim(EA, ['BUZZY.walk', 'BUZZY_WALK'], null, 8);

export default class Buzzy extends Entity {
  static type = 'buzzy';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.facing = opts.facing || -1;
    this.speed = opts.speed == null ? walkSpeed(world) : opts.speed;
    this.anim = WALK;
    this.isWalker = true;
    this.isEnemy = true;
  }

  update() {
    if (frozen(this.world)) return;
    walkStep(this, { speed: this.speed });
    enemyBump(this);
  }

  draw(ctx, cam) {
    this.drawAnim(ctx, cam, WALK);
  }

  onStomp(player) {
    if (this.dead) return false;
    spawnAt(this.world, 'shell', this.x, this.y, {
      variant: 'buzzy',
      facing: player && player.facing ? player.facing : this.facing,
      active: true,
    });
    fx(this.world, 'enemyPoof', this.centerX, this.centerY);
    this.remove();
    return true;
  }

  // The armoured shell shrugs fireballs off — that is the whole point of it.
  onFireball() {
    fx(this.world, 'lavaSpark', this.centerX, this.centerY);
    sfx(this.world, 'bump');
    return false;
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

registerEntity(Buzzy);
