// Entity base class + the type registry every spawnable thing goes through.
//
// Units: pixels and pixels-per-frame at a fixed 1/60.0988 s step. Nothing in
// here multiplies by dt. +Y is DOWN. `x, y` is the TOP-LEFT OF THE HITBOX; the
// sprite is placed relative to that hitbox by the anchor helpers below.
//
// Lifecycle (SMB-accurate, level pacing depends on it):
//   * An entity constructed to the right of the camera starts DORMANT: its
//     `update()` body does not run and its `tick` does not advance, so its
//     animation starts fresh the instant it wakes.
//   * It ACTIVATES when its left edge comes within ACTIVATE_MARGIN px of the
//     right edge of the screen — just before it would be visible.
//   * It is REMOVED once it is DESPAWN_MARGIN px past the left edge of the
//     camera, or once it falls out of the bottom of the level.
//   * The player (world.player, or anything with `persistent = true`) is exempt.
//
// The bookkeeping above is installed as a wrapper around each instance's
// `update`, so a subclass only writes its own `update()` and the world only has
// to call `entity.update()` (or `entity.step()`), exactly as ARCHITECTURE.md §7
// describes. Calling `super.update()` from a subclass runs the base corpse
// physics and never re-enters the wrapper.
//
// `tick` (and `deadTick`) belong to that wrapper — it advances them once per
// frame for every entity, including the player. A subclass update() must not
// touch them; if it needs its own clock, it keeps a separate counter.
//
// After kill(), an entity stops running its own update() and plays the base
// corpse animation (flatten-and-vanish for a stomp, flip-pop-and-fall for a
// shell or fireball). Set `autoCorpse = false` to stage a custom death.

import { SCREEN_W, SCREEN_H, TILE, LAYER } from '../core/constants.js';
import {
  collide,
  newCollision,
  resetCollision,
  isOnGround,
  hasGroundAhead,
  wallAhead,
  tileAtPoint,
  hazardAt,
  GROUND_PROBE,
} from './collision.js';

export const ACTIVATE_MARGIN = 16;
export const DESPAWN_MARGIN = 32;
export const OFFWORLD_MARGIN = 32;

// Corpse physics for shell/fireball kills: pop up, flip over, fall away.
export const CORPSE_POP = -3.25;
export const CORPSE_GRAVITY = 0.3;
export const CORPSE_DRIFT = 0.4;
export const CORPSE_MAX_FALL = 8;

// How long a stomped enemy stays flattened before it is removed.
export const SQUASH_TICKS = 24;

export const KILL_STYLES = Object.freeze(['stomp', 'shell', 'fireball', 'fall', 'silent']);

let nextId = 1;

function tickBody(self, inner, a, b) {
  if (self.removed) return;
  self.updateActivation();
  if (self.removed || !self.active) return;
  // A killed entity runs the corpse animation instead of its own brain, unless
  // it opted out with `autoCorpse = false` to stage its own death.
  if (self.dead && self.autoCorpse) self.updateCorpse();
  else inner.call(self, a, b);
  // The wrapper is the sole owner of `tick`: exactly one advance per tick that
  // actually ran a body. A subclass update() must never advance it itself (that
  // would double the clock every entity reads through currentSprite/drawAnim);
  // keep a private counter instead if you need a second clock.
  self.tick++;
  if (self.dead) self.deadTick++;
  self.checkWorldBounds();
}

function installTick(entity) {
  const inner = entity.update;
  if (typeof inner !== 'function' || inner.__entityTick === true) return;
  const wrapped = function entityTick(a, b) {
    tickBody(this, inner, a, b);
  };
  wrapped.__entityTick = true;
  Object.defineProperty(entity, 'update', {
    value: wrapped,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export class Entity {
  static type = 'entity';

  constructor(world, x = 0, y = 0, opts = null) {
    this.world = world || null;
    this.id = nextId++;
    this.type = this.constructor.type || 'entity';
    this.opts = opts || null;

    // Hitbox. Subclasses overwrite w/h right after super().
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;

    // Position at the start of the current tick — set by moveAndCollide.
    this.px = x;
    this.py = y;

    this.vx = 0;
    this.vy = 0;
    this.facing = 1;

    this.grounded = false;
    this.wasGrounded = false;
    this.dead = false;
    this.removed = false;
    this.tick = 0;
    this.deadTick = 0;

    // Interaction flags.
    this.tangible = true; // takes part in entity-vs-entity / player checks
    this.noclip = false; // skip tile collision entirely
    this.persistent = this.constructor.persistent === true; // never auto-despawns
    this.despawnOffscreen = true;
    this.activateMargin = ACTIVATE_MARGIN;
    this.despawnMargin = DESPAWN_MARGIN;
    this._fellOut = false;
    this.everActive = false;

    // Death bookkeeping. With autoCorpse on (the default) a killed entity stops
    // running its own update() and plays the base squash/flip-and-fall instead.
    this.autoCorpse = true;
    this.killStyle = null;
    this.killedBy = null;
    this.squashTicks = 0;

    // Physics defaults — subclasses and physics.js override freely.
    this.gravity = CORPSE_GRAVITY;
    this.maxFall = CORPSE_MAX_FALL;

    // Drawing. Set `sprite` or `anim` and the default draw() does the rest.
    this.sprite = null;
    this.anim = null;
    this.animPhase = 0;
    this.anchor = 'bottom-center';
    this.ox = 0;
    this.oy = 0;
    this.flipY = false;
    this.visible = true;
    this.layer = LAYER.ENTITIES;

    // Collision options handed to collide(); tweak per subclass.
    this.colOpts = {
      dropThrough: false,
      ignorePlatforms: false,
      groundProbe: GROUND_PROBE,
      stopX: true,
      stopY: true,
    };
    this._col = newCollision();
    this.col = resetCollision(this._col);

    // Dormant unless it already stands inside the activation window.
    const cam = world && world.cam;
    if (opts && opts.active != null) {
      this.active = !!opts.active;
    } else if (!cam) {
      this.active = true;
    } else {
      this.active = x <= (cam.x || 0) + SCREEN_W + this.activateMargin;
    }
    this.everActive = this.active;

    installTick(this);
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  get left() {
    return this.x;
  }
  set left(v) {
    this.x = v;
  }
  get right() {
    return this.x + this.w;
  }
  set right(v) {
    this.x = v - this.w;
  }
  get top() {
    return this.y;
  }
  set top(v) {
    this.y = v;
  }
  get bottom() {
    return this.y + this.h;
  }
  set bottom(v) {
    this.y = v - this.h;
  }
  get centerX() {
    return this.x + this.w * 0.5;
  }
  set centerX(v) {
    this.x = v - this.w * 0.5;
  }
  get centerY() {
    return this.y + this.h * 0.5;
  }
  set centerY(v) {
    this.y = v - this.h * 0.5;
  }
  get cx() {
    return this.x + this.w * 0.5;
  }
  get cy() {
    return this.y + this.h * 0.5;
  }
  get tileX() {
    return Math.floor(this.centerX / TILE);
  }
  get tileY() {
    return Math.floor((this.y + this.h - 1) / TILE);
  }
  get isPlayer() {
    return !!this.world && this.world.player === this;
  }

  // Place by bottom-centre — the natural anchor for level data and spawns.
  place(cx, bottomY) {
    this.x = cx - this.w * 0.5;
    this.y = bottomY - this.h;
    this.px = this.x;
    this.py = this.y;
    return this;
  }

  // Resize the hitbox while keeping the bottom-centre fixed (power-up changes).
  resize(w, h) {
    const cx = this.centerX;
    const b = this.bottom;
    this.w = w;
    this.h = h;
    this.x = cx - w * 0.5;
    this.y = b - h;
    return this;
  }

  hits(other) {
    return (
      !!other &&
      this.x < other.x + other.w &&
      this.x + this.w > other.x &&
      this.y < other.y + other.h &&
      this.y + this.h > other.y
    );
  }

  hitsBox(x, y, w, h) {
    return this.x < x + w && this.x + this.w > x && this.y < y + h && this.y + this.h > y;
  }

  // Overlap with a margin grown (pad > 0) or shrunk (pad < 0) on every side.
  near(other, pad = 0) {
    return (
      !!other &&
      this.x - pad < other.x + other.w &&
      this.x + this.w + pad > other.x &&
      this.y - pad < other.y + other.h &&
      this.y + this.h + pad > other.y
    );
  }

  distanceTo(other) {
    const dx = this.centerX - other.centerX;
    const dy = this.centerY - other.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Signed depth of the overlap on each axis; useful to decide stomp vs. side hit.
  overlapX(other) {
    return Math.min(this.x + this.w, other.x + other.w) - Math.max(this.x, other.x);
  }

  overlapY(other) {
    return Math.min(this.y + this.h, other.y + other.h) - Math.max(this.y, other.y);
  }

  onScreen(cam, margin = 0) {
    const cxp = cam ? cam.x || 0 : 0;
    const cyp = cam ? cam.y || 0 : 0;
    return (
      this.x + this.w > cxp - margin &&
      this.x < cxp + SCREEN_W + margin &&
      this.y + this.h > cyp - margin &&
      this.y < cyp + SCREEN_H + margin
    );
  }

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------

  // Sweep by (dx, dy) — defaults to this frame's velocity — resolving X then Y
  // against the tilemap. Returns { hitLeft, hitRight, hitTop, hitBottom, ... }.
  // The result object is reused per entity; copy what you need to keep.
  // By default the blocked axis' velocity is zeroed (colOpts.stopX / stopY).
  moveAndCollide(dx = this.vx, dy = this.vy, opts = null) {
    const o = opts || this.colOpts;
    this.px = this.x;
    this.py = this.y;
    this.wasGrounded = this.grounded;
    const res = this._col;

    if (this.noclip || o.noclip) {
      resetCollision(res);
      res.dx = dx;
      res.dy = dy;
      this.x += dx;
      this.y += dy;
      res.movedX = dx;
      res.movedY = dy;
      this.grounded = false;
      this.col = res;
      return res;
    }

    collide(this.world, this, dx, dy, o, res);
    this.grounded = res.hitBottom;
    if (res.hitX && o.stopX !== false) this.vx = 0;
    if (res.hitY && o.stopY !== false) this.vy = 0;
    this.col = res;
    return res;
  }

  // Integrate without touching the tilemap.
  moveFree(dx = this.vx, dy = this.vy) {
    this.px = this.x;
    this.py = this.y;
    this.x += dx;
    this.y += dy;
    return this;
  }

  applyGravity(g = this.gravity, max = this.maxFall) {
    this.vy += g;
    if (this.vy > max) this.vy = max;
    return this.vy;
  }

  onGround(dist = GROUND_PROBE) {
    return isOnGround(this.world, this, this.colOpts, dist);
  }

  groundAhead(dir = this.facing, look = 2) {
    return hasGroundAhead(this.world, this, dir, look);
  }

  wallAhead(dir = this.facing, look = 1) {
    return wallAhead(this.world, this, dir, look);
  }

  tileUnder(dist = 1) {
    return tileAtPoint(this.world, this.centerX, this.y + this.h + dist);
  }

  hazardUnder() {
    return hazardAt(this.world, this.centerX, this.y + this.h + 1);
  }

  turnAround() {
    this.facing = this.facing >= 0 ? -1 : 1;
    this.vx = -this.vx;
    return this.facing;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  // Called automatically once per tick before the subclass update body runs.
  updateActivation(cam) {
    const c = cam || (this.world ? this.world.cam : null);
    if (this.persistent || this.isPlayer || !c) {
      this.active = true;
      this.everActive = true;
      return true;
    }
    const camX = c.x || 0;
    if (!this.active) {
      if (this.x <= camX + SCREEN_W + this.activateMargin) {
        this.active = true;
        this.everActive = true;
        this.onActivate();
      }
      return this.active;
    }
    if (this.despawnOffscreen && this.x + this.w < camX - this.despawnMargin) this.remove();
    return this.active;
  }

  checkWorldBounds() {
    const lvl = this.world ? this.world.level : null;
    const rows = lvl && lvl.height ? lvl.height : SCREEN_H / TILE;
    if (this.y > rows * TILE + OFFWORLD_MARGIN && !this._fellOut) {
      this._fellOut = true;
      this.onFellOut();
    }
  }

  // Explicit per-tick entry point. Identical to calling update() directly, and
  // still does the full bookkeeping even if a subclass replaced the wrapper
  // with an instance field.
  step(cam) {
    if (this.removed) return;
    if (cam) this.updateActivation(cam);
    if (this.removed) return;
    if (this.update.__entityTick === true) this.update();
    else tickBody(this, this.update);
  }

  remove() {
    if (this.removed) return false;
    this.removed = true;
    this.onRemove();
    return true;
  }

  // style: 'stomp' | 'shell' | 'fireball' | 'fall' | 'silent'
  // Returns false if it was already dead.
  kill(style = 'silent', by = null) {
    if (this.dead) return false;
    this.dead = true;
    this.killStyle = style;
    this.killedBy = by;
    this.deadTick = 0;
    this.grounded = false;
    this.tangible = false;
    switch (style) {
      case 'stomp':
        this.vx = 0;
        this.vy = 0;
        this.squashTicks = SQUASH_TICKS;
        break;
      case 'shell':
      case 'fireball': {
        this.flipY = true;
        this.noclip = true;
        this.vy = CORPSE_POP;
        let dir = this.facing >= 0 ? 1 : -1;
        if (by && typeof by.centerX === 'number') dir = this.centerX < by.centerX ? -1 : 1;
        else if (by && typeof by.x === 'number') dir = this.x < by.x ? -1 : 1;
        this.vx = CORPSE_DRIFT * dir;
        break;
      }
      case 'fall':
        this.noclip = true;
        this.removed = true;
        break;
      case 'silent':
      default:
        this.removed = true;
        break;
    }
    this.onKilled(style, by);
    if (this.removed) this.onRemove();
    return true;
  }

  // Default corpse behaviour. `update()` falls back to this, and subclasses can
  // call it (or super.update()) once they are dead.
  updateCorpse() {
    if (!this.dead) return false;
    if (this.killStyle === 'stomp') {
      if (this.squashTicks > 0 && --this.squashTicks <= 0) this.remove();
      return true;
    }
    if (this.killStyle === 'shell' || this.killStyle === 'fireball') {
      this.vy += CORPSE_GRAVITY;
      if (this.vy > CORPSE_MAX_FALL) this.vy = CORPSE_MAX_FALL;
      this.x += this.vx;
      this.y += this.vy;
      return true;
    }
    return true;
  }

  spawn(type, x, y, opts) {
    if (this.world && typeof this.world.spawn === 'function') {
      return this.world.spawn(type, x, y, opts);
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Per-tick / draw
  // -------------------------------------------------------------------------

  update() {
    this.updateCorpse();
  }

  currentSprite() {
    if (this.anim) return this.anim.frame(this.tick + this.animPhase);
    return this.sprite;
  }

  // Draw a sprite positioned against the HITBOX, not the sprite corner.
  // anchor: 'bottom-center' (default) | 'center' | 'top-left' | 'bottom-left'
  // opts.ox is mirrored automatically when the sprite is flipped.
  drawSprite(ctx, cam, sprite, opts = null) {
    if (!sprite) return;
    const camX = cam ? cam.x || 0 : 0;
    const camY = cam ? cam.y || 0 : 0;
    const flipX = opts && opts.flipX != null ? opts.flipX : this.facing < 0;
    const flipY = opts && opts.flipY != null ? opts.flipY : this.flipY;
    const anchor = (opts && opts.anchor) || this.anchor;

    let ox = this.ox + (sprite.ox || 0) + (opts && opts.ox ? opts.ox : 0);
    const oy = this.oy + (sprite.oy || 0) + (opts && opts.oy ? opts.oy : 0);
    if (flipX) ox = -ox;

    let sx;
    let sy;
    if (anchor === 'top-left') {
      sx = this.x;
      sy = this.y;
    } else if (anchor === 'bottom-left') {
      sx = this.x;
      sy = this.y + this.h - sprite.h;
    } else if (anchor === 'center') {
      sx = this.x + (this.w - sprite.w) * 0.5;
      sy = this.y + (this.h - sprite.h) * 0.5;
    } else {
      sx = this.x + (this.w - sprite.w) * 0.5;
      sy = this.y + this.h - sprite.h;
    }
    sprite.draw(ctx, Math.floor(sx + ox - camX), Math.floor(sy + oy - camY), flipX, flipY);
  }

  drawAnim(ctx, cam, anim, opts = null) {
    if (!anim) return;
    const t = (opts && opts.tick != null ? opts.tick : this.tick) + this.animPhase;
    this.drawSprite(ctx, cam, anim.frame(t), opts);
  }

  draw(ctx, cam) {
    if (!this.visible) return;
    this.drawSprite(ctx, cam, this.currentSprite());
  }

  // Hitbox outline for the debug overlay. Never part of normal rendering.
  debugDraw(ctx, cam, color = '#ff00ff') {
    const camX = cam ? cam.x || 0 : 0;
    const camY = cam ? cam.y || 0 : 0;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.floor(this.x - camX) + 0.5,
      Math.floor(this.y - camY) + 0.5,
      Math.max(1, this.w - 1),
      Math.max(1, this.h - 1)
    );
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Hooks — safe no-ops so any system can call them on any entity.
  // -------------------------------------------------------------------------

  onActivate() {}
  onRemove() {}
  onKilled(_style, _by) {}
  onFellOut() {
    if (!this.persistent && !this.isPlayer) this.remove();
  }

  onStomp(_player) {
    return false;
  }
  onFireball(_fb) {
    return false;
  }
  onShell(_shell) {}
  onPlayerTouch(_player) {}
  onBumped(_from) {}
}

// ---------------------------------------------------------------------------
// Type registry — src/game/entities/index.js populates this.
// ---------------------------------------------------------------------------

const REGISTRY = new Map();
const warned = new Set();

// registerEntity(cls) | registerEntity('name', cls) | registerEntity([a, b, c])
export function registerEntity(a, b) {
  if (Array.isArray(a)) {
    for (const c of a) registerEntity(c);
    return a;
  }
  const cls = typeof a === 'string' ? b : a;
  const name = typeof a === 'string' ? a : cls && cls.type;
  if (typeof cls !== 'function') throw new Error('registerEntity: expected a class');
  if (!name) throw new Error(`registerEntity: ${cls.name} has no static type`);
  REGISTRY.set(name, cls);
  return cls;
}

export function entityClass(type) {
  if (typeof type === 'function') return type;
  return REGISTRY.get(type) || null;
}

export function hasEntity(type) {
  return REGISTRY.has(type);
}

export function entityTypes() {
  return Array.from(REGISTRY.keys()).sort();
}

export function entityRegistry() {
  return REGISTRY;
}

// x, y are PIXEL coordinates of the hitbox top-left, per the Entity contract.
// Returns null (and warns once) for an unknown type so a bad level entry can
// never take the whole game down.
export function createEntity(type, world, x, y, opts) {
  const cls = entityClass(type);
  if (!cls) {
    const key = String(type);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`createEntity: unknown entity type "${key}"`);
    }
    return null;
  }
  const e = new cls(world, x, y, opts);
  if (!e.type || e.type === 'entity') e.type = typeof type === 'string' ? type : cls.type;
  return e;
}

export default Entity;
