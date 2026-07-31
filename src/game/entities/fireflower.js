import { Entity, registerEntity } from '../entity.js';
import * as ITEMS from '../../data/sprites/items.js';
import { animOf, awardPowerup, drawEmerging, fx, sfx } from './mushroom.js';

const FLOWER_ROWS = [
  '...000....000...',
  '..03330..03330..',
  '.03333333222220.',
  '0333332222222220',
  '0334455445544220',
  '0334455445544220',
  '0334444444444220',
  '0112222222222110',
  '.01111111111110.',
  '..000000000000..',
  '.07777066077770.',
  '.08888066088880.',
  '......0660......',
  '......0660......',
  '......0660......',
  '......0000......',
];

function flowerPal(dark, mid, light) {
  return ['#1a1008', dark, mid, light, '#6d2b00', '#ffffff', '#18a028', '#0d7a18', '#5ce65a'];
}

const PALS = [
  flowerPal('#a01018', '#e03028', '#ff8a6a'),
  flowerPal('#a04a00', '#ef9a49', '#ffd08a'),
  flowerPal('#8a7a10', '#e4e594', '#fffbd0'),
  flowerPal('#8a8a8a', '#e8e8e8', '#ffffff'),
];

const FLOWER_ANIM = animOf(
  ITEMS.FIRE_FLOWER && ITEMS.FIRE_FLOWER.idle,
  PALS.map(() => FLOWER_ROWS),
  PALS,
  { name: 'fireflower' },
  6
);

export default class FireFlower extends Entity {
  static type = 'fireflower';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = 16;
    this.t = 0;
    this.isItem = true;
    this.rooted = true;
    this.autoCorpse = false;
    this.vx = 0;
    this.vy = 0;
    if (opts.fromBlock) sfx(world, 'item-appear');
  }

  onEmerged() {
    fx(this.world, 'powerupSparkle', this.x + 8, this.y + 8);
  }

  // Rooted items ignore bumps from the block underneath them.
  onBlockBump() {}

  update() {
    this.t++;
    if (this.x + this.w < this.world.cam.x - 32) this.removed = true;
  }

  onPlayerTouch(player) {
    if (this.removed) return false;
    this.removed = true;
    const already = !!player && player.power === 'fire';
    awardPowerup(this.world, player, 'flower', this.x + 8, this.y, already);
    return true;
  }

  onStomp() {
    return false;
  }

  onFireball() {
    return false;
  }

  draw(ctx, cam) {
    drawEmerging(this, ctx, cam, FLOWER_ANIM.frame(this.t));
  }
}

registerEntity(FireFlower);
registerEntity('flower', FireFlower);
