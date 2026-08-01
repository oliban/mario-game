import { Entity, registerEntity } from '../entity.js';
import { SCREEN_W } from '../../core/constants.js';
import * as EB from '../../data/sprites/enemies-b.js';
import { pickSprite, enemyDie, frozen, hurtPlayer, starTouch, fx, sfx } from './index.js';

// BulletBillXSpdData is `.db $18,$e8` (smbdis.asm:6821-6822) and MoveBulletBill
// writes the same magnitude for the frenzy variant (`lda #$e8`, asm:9577-9585).
// MoveObjectHorizontally (asm:7541-7576) reads that byte as high nybble = whole
// pixels, low nybble = sixteenths, so $e8 is -1.5 px/frame, not -2.4: a bill
// takes ~2.8s to cross the screen, not ~1.8s.
const SPEED = 1.5;
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
    // A stomped bullet bill pays a flat 200, not the 100 that opens the stomp
    // chain: EnemyStomped (asm:11439-11453) branches both bill variants to
    // EnemyStompedPts with Y=0, and StompedEnemyPtsData[0] = $02 (asm:11436)
    // selects "200" in FloateyNumTileData (asm:1264-1266). That path also never
    // touches StompChainCounter, so the chain is put back a frame later by
    // updateCorpse() — the score itself is awarded by the player's chain code
    // after this returns, which is why it has to be nudged rather than paid here.
    if (player && typeof player.stompChain === 'number') {
      this._chainRestore = { player, chain: player.stompChain };
      player.stompChain = 1; // index 1 of STOMP_SCORES -> 200
    }
    return true;
  }

  _restoreChain() {
    if (!this._chainRestore) return;
    const { player, chain } = this._chainRestore;
    this._chainRestore = null;
    player.stompChain = chain;
  }

  // The corpse's first tick, i.e. the frame after the score was awarded.
  updateCorpse() {
    this._restoreChain();
    return super.updateCorpse();
  }

  onRemove() {
    this._restoreChain();
  }

  // Fireproof. HandleEnemyFBallCol falls through to ChkOtherEnemies
  // (asm:11164-11170), which leaves on `cmp #BulletBill_FrenzyVar` ($08) and,
  // for the cannon variant $33, on `cmp #$15 / bcs ExHCF`. The ball still bursts
  // — Fireball_State gets d7 set before the handler runs (asm:11106-11109) —
  // but the bill flies on.
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

registerEntity(BulletBill);
