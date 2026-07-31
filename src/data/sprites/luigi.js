// Luigi — a palette swap of Mario, built by recolouring rather than redrawing.
//
// This lives in its own file on purpose: mario.js is large and frequently edited,
// and deriving Luigi from whatever it currently exports means he automatically
// inherits every animation improvement made to Mario, including frames that do
// not exist yet.
//
// Slot contract (from mario.js): 5/6/7 are the cap ramp and 14 is its specular.
// Swapping just those four turns the red cap and shirt green and leaves the skin,
// overalls, boots and buttons alone — which is exactly what a Luigi palette is.

import { Anim } from '../../core/gfx.js';
import { MARIO_PALS, SMALL_MARIO, BIG_MARIO, FIRE_MARIO } from './mario.js';

const CAP_SLOTS = [5, 6, 7, 14];

// Luigi's green, kept in the same value relationship as Mario's red so the
// shading reads identically — a palette swap that changes contrast changes the
// apparent form, and the two brothers stop looking like the same character.
const GREEN = ['#0d5210', '#2fa832', '#57d43a', '#b6f58a'];

// Fire Luigi inverts the same way Fire Mario does: white cap, coloured overalls.
const OVERALL_SLOTS = [8, 9, 10];
const GREEN_OVERALLS = ['#0d5210', '#2fa832', '#57d43a'];

function swap(pal, slots, colors) {
  const out = pal.slice();
  slots.forEach((s, i) => {
    if (colors[i]) out[s] = colors[i];
  });
  return out;
}

export const LUIGI_PALS = {
  small: swap(MARIO_PALS.small, CAP_SLOTS, GREEN),
  big: swap(MARIO_PALS.big, CAP_SLOTS, GREEN),
  // Fire Mario is a white cap over red overalls; Fire Luigi keeps the white cap
  // and takes green overalls so the brothers stay distinguishable when powered up.
  fire: swap(MARIO_PALS.fire, OVERALL_SLOTS, GREEN_OVERALLS),
  dead: swap(MARIO_PALS.dead, CAP_SLOTS, GREEN),
  star: (MARIO_PALS.star || []).map((p) => swap(p, CAP_SLOTS, GREEN)),
};

// Recolour a whole pose set, preserving Anim timing so the cycles stay in step.
function recolorSet(set, pal, tag) {
  const out = {};
  if (!set) return out;
  for (const [key, v] of Object.entries(set)) {
    if (!v) continue;
    if (v instanceof Anim) {
      out[key] = new Anim(
        v.frames.map((f, i) => f.recolor(pal, `luigi.${tag}.${key}${i}`)),
        v.holds.slice(),
        v.loop
      );
    } else if (typeof v.recolor === 'function') {
      out[key] = v.recolor(pal, `luigi.${tag}.${key}`);
    } else if (Array.isArray(v)) {
      out[key] = v.map((f, i) =>
        f && typeof f.recolor === 'function' ? f.recolor(pal, `luigi.${tag}.${key}${i}`) : f
      );
    } else {
      out[key] = v;
    }
  }
  return out;
}

export const SMALL_LUIGI = recolorSet(SMALL_MARIO, LUIGI_PALS.small, 'small');
export const BIG_LUIGI = recolorSet(BIG_MARIO, LUIGI_PALS.big, 'big');
export const FIRE_LUIGI = recolorSet(FIRE_MARIO, LUIGI_PALS.fire, 'fire');

export const LUIGI_SETS = { small: SMALL_LUIGI, big: BIG_LUIGI, fire: FIRE_LUIGI };

export default LUIGI_SETS;
