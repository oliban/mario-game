import { SCREEN_W, SCREEN_H, TILE } from '../core/constants.js';
import { Rng } from '../core/rng.js';

// The player's locked screen-space X once the camera starts scrolling right.
// SMB pins Mario a hair left of centre; 112 puts a 16px-wide Mario at 112..128.
export const FOLLOW_X = 112;

// Vertical dead zone, measured from the top of the viewport.
export const DEADZONE_TOP = 72;
export const DEADZONE_BOTTOM = 152;

const SHAKE_DECAY = 0.86;
const SHAKE_MIN = 0.15;
const EASE_Y = 0.14;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Camera {
  constructor() {
    // Logical camera. Gameplay, culling and activation read these.
    this.x = 0;
    this.y = 0;
    this.w = SCREEN_W;
    this.h = SCREEN_H;

    // Render-time offsets. Never fold these into x/y.
    this.shakeX = 0;
    this.shakeY = 0;

    this.maxX = 0;
    this.maxY = 0;
    this.levelW = SCREEN_W;
    this.levelH = SCREEN_H;
    this.vertical = false;
    this.locked = false;
    this.followX = FOLLOW_X;
    this.targetY = 0;
    this.player = null;

    this._shakeMag = 0;
    this._shakeLife = 0;
    this._rng = new Rng(0x5a17c0de);
  }

  reset(level, player) {
    this.levelW = Math.max(SCREEN_W, (level.width || 16) * TILE);
    this.levelH = Math.max(SCREEN_H, (level.height || 15) * TILE);
    this.maxX = Math.max(0, this.levelW - SCREEN_W);
    this.maxY = Math.max(0, this.levelH - SCREEN_H);
    this.vertical = this.maxY > 0;
    this.locked = false;
    this.player = player || null;
    this.shakeX = 0;
    this.shakeY = 0;
    this._shakeMag = 0;
    this._shakeLife = 0;

    if (typeof level.camStart === 'number') {
      this.x = clamp(level.camStart * TILE, 0, this.maxX);
    } else if (player) {
      this.x = clamp(player.x + player.w * 0.5 - this.followX, 0, this.maxX);
    } else {
      this.x = 0;
    }

    if (this.vertical && player) {
      const cy = player.y + player.h * 0.5;
      this.y = clamp(cy - DEADZONE_BOTTOM, 0, this.maxY);
    } else {
      this.y = 0;
    }
    this.targetY = this.y;
  }

  // Hard-lock horizontal scrolling (flagpole, boss arenas, cutscenes).
  lock(on = true) {
    this.locked = !!on;
  }

  // Jump the camera without any easing (warps, area changes).
  snapTo(px, py) {
    this.x = clamp(px, 0, this.maxX);
    this.y = clamp(py == null ? this.y : py, 0, this.maxY);
    this.targetY = this.y;
  }

  update() {
    this.follow();
    this.updateShake();
  }

  follow() {
    // In co-op the camera tracks whichever living brother is furthest right, so
    // the leader is never pushed off the edge of the screen by the other.
    let p = this.player;
    const w = p && p.world;
    if (w && w.coop && Array.isArray(w.players) && w.players.length > 1) {
      let lead = null;
      for (const q of w.players) {
        if (!q || q.dead || q.removed) continue;
        if (!lead || q.x > lead.x) lead = q;
      }
      if (lead) p = lead;
    }
    if (p) {
      if (!this.locked) {
        const t = p.x + p.w * 0.5 - this.followX;
        // The one rule that defines SMB: forward only, never back.
        if (t > this.x) this.x = t;
      }
      if (this.vertical) this._followY(p);
    }
    if (this.x < 0) this.x = 0;
    if (this.x > this.maxX) this.x = this.maxX;
    if (!this.vertical) {
      this.y = 0;
      this.targetY = 0;
    }
  }

  _followY(p) {
    const cy = p.y + p.h * 0.5;
    // While airborne the camera holds still unless the player is really pushing
    // the edges — that keeps ordinary jumps from sloshing the whole screen.
    const pushing = cy < this.y + 40 || cy > this.y + SCREEN_H - 56;
    if (p.grounded || pushing) {
      let t = this.targetY;
      if (cy < this.y + DEADZONE_TOP) t = cy - DEADZONE_TOP;
      else if (cy > this.y + DEADZONE_BOTTOM) t = cy - DEADZONE_BOTTOM;
      else t = this.y;
      this.targetY = clamp(t, 0, this.maxY);
    }
    const d = this.targetY - this.y;
    if (Math.abs(d) < 0.06) this.y = this.targetY;
    else this.y += d * EASE_Y;
    this.y = clamp(this.y, 0, this.maxY);
  }

  shake(mag, ticks = 8) {
    if (mag > this._shakeMag) this._shakeMag = mag;
    if (ticks > this._shakeLife) this._shakeLife = ticks;
  }

  // Runs even while the world is frozen for hit-stop: the shake is what sells
  // the freeze.
  updateShake() {
    if (this._shakeLife > 0) {
      this._shakeLife--;
      const m = this._shakeMag;
      this.shakeX = Math.round(this._rng.range(-m, m));
      this.shakeY = Math.round(this._rng.range(-m, m) * 0.75);
      this._shakeMag *= SHAKE_DECAY;
      if (this._shakeMag < SHAKE_MIN) this._shakeLife = 0;
    }
    if (this._shakeLife <= 0) {
      this._shakeMag = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  get shaking() {
    return this._shakeLife > 0;
  }

  // Camera position including shake — what draw code subtracts.
  get drawX() {
    return this.x + this.shakeX;
  }
  get drawY() {
    return this.y + this.shakeY;
  }

  get left() {
    return this.x;
  }
  get right() {
    return this.x + SCREEN_W;
  }
  get top() {
    return this.y;
  }
  get bottom() {
    return this.y + SCREEN_H;
  }

  screenX(px) {
    return Math.floor(px - (this.x + this.shakeX));
  }
  screenY(py) {
    return Math.floor(py - (this.y + this.shakeY));
  }

  contains(x, y, w = 0, h = 0, margin = 0) {
    return (
      x + w >= this.x - margin &&
      x <= this.x + SCREEN_W + margin &&
      y + h >= this.y - margin &&
      y <= this.y + SCREEN_H + margin
    );
  }
}

export default Camera;
