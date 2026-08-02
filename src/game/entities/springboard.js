import { Entity, registerEntity } from '../entity.js';
import { makeSprite } from '../../core/gfx.js';
import input, { BTN } from '../../core/input.js';
import * as ITEMS from '../../data/sprites/items.js';
import { PHYS } from '../physics.js';
import { fx, sfx } from './mushroom.js';
import { playersOf } from './index.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// The launch speeds are the ROM's, in the same px/frame the rest of the engine
// uses: ChkForLandJumpSpring (smbdis.asm:12249-12258) writes the default force
// `lda #$f9` = -7, and JumpspringHandler (asm:6653-6655) replaces it with
// `lda #$f4` = -12 when the boost is earned.
//
// That same routine writes `lda #$70 / sta VerticalForce` — the spring dictates
// the gravity Mario rises under, and $70 is FULL gravity, not the reduced
// hold-gravity a normal jump rises under. So neither bounce changes height with
// the jump button, and the two heights come out at the original's ~3.7 and
// ~10.7 tiles. This is why the speeds are no longer solved from a target height
// against gHold: with the boost keyed to a fresh press (see _sampleBoost) the
// button is no longer a proxy for which gravity applies, and a small bounce
// taken with the button down would otherwise out-climb the big one.
const FALL_G = num(PHYS.gravity || PHYS.playerGravity, 0.4375);

// Frames per animation step. JumpspringTimer is reloaded with $04 and the frame
// control only advances when it expires (asm:6668-6672), so each of the four
// steps lasts four frames and the whole spring runs ~13 frames rather than the
// six ours used to take. This is the constant that decides whether a human can
// land the fresh press the boost requires.
const STEP_FRAMES = 4;
export const SPRING_LAUNCH = -7; // $f9
export const SPRING_LAUNCH_HELD = -12; // $f4
export const SPRING_RISE_G = FALL_G; // VerticalForce = $70

const SPRING_PAL = ['#1a1008', '#0d5c14', '#18a028', '#7cf07a'];

const PLATE = ['0000000000000000', '0333333333333330', '0322222222222210', '0000000000000000'];
const BASE = ['0000000000000000', '0322222222222210', '0311111111111110', '0000000000000000'];
const COIL_OPEN = ['...0........0...', '...0222222220...', '...0111111110...', '...0........0...'];
const COIL_TIGHT = ['...0222222220...', '...0111111110...'];

function build(units, tight) {
  const rows = PLATE.slice();
  for (let i = 0; i < units; i++) rows.push(...(tight ? COIL_TIGHT : COIL_OPEN));
  rows.push(...BASE);
  return rows;
}

const AUTHORED =
  ITEMS.SPRINGBOARD && Array.isArray(ITEMS.SPRINGBOARD.frames) && ITEMS.SPRINGBOARD.frames.length
    ? ITEMS.SPRINGBOARD.frames
    : null;

const SPRITES = AUTHORED || [
  makeSprite(build(6, false), SPRING_PAL, { name: 'spring.free' }),
  makeSprite(build(4, false), SPRING_PAL, { name: 'spring.mid' }),
  makeSprite(build(4, true), SPRING_PAL, { name: 'spring.tight' }),
];

const FULL_H = 32;
const MID_H = 24;
const LOW_H = 16;
const HEIGHTS = [FULL_H, MID_H, LOW_H, LOW_H];

export default class SpringBoard extends Entity {
  static type = 'springboard';

  constructor(world, x, y, opts = {}) {
    super(world, x, y, opts);
    this.w = 16;
    this.h = FULL_H;
    this.t = 0;
    this.vx = 0;
    this.vy = 0;
    this.baseline = y + FULL_H;
    this.stage = 0;
    this.phase = 'idle';
    this.phaseT = 0;
    // Every player standing on the plate rides it: [{ player, boost }].
    this.riders = [];
    this.isPlatform = true;
    this.oneWay = true;
    this.tangible = true;
    this.persistent = true;
    this.autoCorpse = false;
    this.strength = num(opts.strength, 1);
  }

  setStage(s) {
    this.stage = Math.max(0, Math.min(3, s));
    this.h = HEIGHTS[this.stage];
    this.y = this.baseline - this.h;
  }

  standing(e) {
    if (!e || e.removed) return false;
    if (e.x + e.w <= this.x + 1 || e.x >= this.x + this.w - 1) return false;
    const feet = e.y + e.h;
    return feet >= this.y - 3 && feet <= this.y + 6 + Math.max(0, e.vy);
  }

  snap(e) {
    e.y = this.y - e.h;
    if (e.vy > 0) e.vy = 0;
    e.grounded = true;
    e.onPlatform = this;
  }

  _padOf(p) {
    return p && p.pad ? p.pad : input;
  }

  _riderOf(p) {
    for (const r of this.riders) if (r.player === p) return r;
    return null;
  }

  // Riders are LATCHED. Re-testing standing() each frame loses them: compressing
  // moves the plate down 8px a frame, their feet fall outside the band, snap()
  // stops being called and they drop off the board before it can launch them.
  // The list is a list rather than one player because in co-op both brothers can
  // land on the same plate, and an unlatched second brother falls straight
  // through what is supposed to be a solid platform.
  _pickUpRiders() {
    for (const p of playersOf(this.world)) {
      if (!p || p.removed || p.dead || p.vy < 0) continue;
      if (!this.standing(p)) continue;
      if (!this._riderOf(p)) this.riders.push({ player: p, boost: false });
    }
  }

  // JumpspringHandler (smbdis.asm:6648-6656) takes the boost only on a FRESH
  // press: `lda A_B_Buttons / and #A_Button / beq BounceJS` requires A down now,
  // and `and PreviousA_B_Buttons / bne BounceJS` skips the boost when A was down
  // last frame too. Holding A from the jump that carried you onto the plate
  // therefore gives the ordinary hop ($f9), not the rocket ($f4).
  _sampleBoost() {
    for (const r of this.riders) {
      if (!r.boost && this._padOf(r.player).pressed(BTN.JUMP)) r.boost = true;
    }
  }

  update() {
    this.t++;
    this.riders = this.riders.filter((r) => r.player && !r.player.removed && !r.player.dead);
    this._pickUpRiders();
    if (this.phase !== 'idle' && !this.riders.length) {
      this.phase = 'idle';
      this.phaseT = 0;
    }

    switch (this.phase) {
      case 'idle': {
        this.setStage(0);
        if (this.riders.length) {
          this.phase = 'compress';
          this.phaseT = 0;
        }
        break;
      }
      case 'compress': {
        // The original holds each animation step for FOUR frames --
        // JumpspringTimer is reloaded with $04 (asm:6670-6672) and only then does
        // JumpspringAnimCtrl advance. The A-check runs while Y = ctrl-1 is 1 or 2
        // and the launch fires when it reaches 3, so a player has roughly NINE
        // frames to land a fresh press. Ours ran a step per frame, which gave six
        // frames across compress and release together and made the boost feel
        // like it did nothing. STEP_FRAMES is what makes the window hittable; do
        // not collapse it back to one.
        this.phaseT++;
        const step = Math.min(3, Math.floor(this.phaseT / STEP_FRAMES));
        // Jumpspring_Y_PosData is $08,$10,$08,$00 (asm:6625-6626): dip, deepest,
        // dip, flush -- it springs back before it launches.
        this.setStage([2, 3, 2, 0][step]);
        if (step >= 1) this._sampleBoost();
        for (const r of this.riders) this.snap(r.player);
        if (step >= 3) {
          this.phase = 'release';
          this.phaseT = 0;
        }
        break;
      }
      case 'release': {
        this.phaseT++;
        this._sampleBoost();
        this.setStage(0);
        if (this.phaseT >= 1) {
          this.setStage(0);
          // Launch the latched riders, not whoever happens to test as standing:
          // the plate has just sprung back up and they are a few pixels clear of
          // it. Both brothers go up — the plate served them both, and letting
          // one ride while the other is dropped would be the same defect from
          // the other side.
          const going = this.riders;
          this.riders = [];
          this.phase = 'idle';
          this.phaseT = 0;
          for (const r of going) this.launch(r.player, r.boost);
        } else {
          for (const r of this.riders) this.snap(r.player);
        }
        break;
      }
      default:
        break;
    }
  }

  launch(player, boost) {
    const held = boost === undefined ? this._padOf(player).pressed(BTN.JUMP) : !!boost;
    const v = (held ? SPRING_LAUNCH_HELD : SPRING_LAUNCH) * this.strength;
    player.y = this.y - player.h - 1;
    player.onPlatform = null;
    if (typeof player.bounce === 'function') player.bounce(v);
    else {
      player.vy = v;
      player.grounded = false;
    }
    // bounce() picks the rise gravity from a normal jump's speed row; the spring
    // overrides it, exactly as ChkForLandJumpSpring overrides VerticalForce.
    player._gHold = SPRING_RISE_G;
    // ImposeGravity moves before it applies gravity, so the takeoff frame
    // travels the whole launch speed — the same allowance a real jump gets.
    player._launchFrame = true;
    sfx(this.world, held ? 'jump-super' : 'jump');
    fx(this.world, 'landingDust', this.x + 8, this.baseline - 2, 0.8);
  }

  onPlayerTouch(player) {
    if (!this.standing(player) || player.vy < 0) return;
    // Latch him here too: the collision pass runs after update(), so a brother
    // who arrives a frame late is caught before the plate can drop out from
    // under him.
    if (!this._riderOf(player)) this.riders.push({ player, boost: false });
    this.snap(player);
  }

  onFireball() {
    return false;
  }

  onStomp() {
    return false;
  }

  draw(ctx, cam) {
    const spr = SPRITES[Math.min(SPRITES.length - 1, this.stage === 0 ? 0 : this.stage === 1 ? 1 : 2)];
    const sx = Math.floor(this.x - cam.x);
    const sy = Math.floor(this.baseline - cam.y) - spr.h;
    spr.draw(ctx, sx, sy);
  }
}

registerEntity(SpringBoard);
