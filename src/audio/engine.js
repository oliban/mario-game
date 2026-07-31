// NES-flavoured APU emulation built from Web Audio primitives. No samples, no files.
//
// Signal path:
//   voice -> voiceGain(envelope) -> busGain (music|sfx) -> master -> shelf/lowpass -> limiter -> out
//
// Everything is scheduled on ctx.currentTime. The pump (rAF + an audio-clock chained
// silent buffer) only decides *when to refill* the schedule; it never decides note times,
// so nothing drifts.

import { DT } from '../core/constants.js';
import rng from '../core/rng.js';

const LETTER_SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([a-gA-G])([#sb]*)(-?\d+)$/;

export const A4_HZ = 440;

// Selectable pulse duties, as the NES exposes them.
export const DUTY = {
  D125: 0.125,
  D25: 0.25,
  D50: 0.5,
  D75: 0.75,
};

export function noteToMidi(note) {
  if (typeof note === 'number') return note;
  const m = NOTE_RE.exec(String(note).trim());
  if (!m) return NaN;
  let semi = LETTER_SEMI[m[1].toLowerCase()];
  for (const ch of m[2]) semi += ch === 'b' ? -1 : 1;
  return (parseInt(m[3], 10) + 1) * 12 + semi;
}

export function midiToFreq(midi) {
  return A4_HZ * Math.pow(2, (midi - 69) / 12);
}

// Numbers are always Hz — use midiToFreq() explicitly for note numbers.
export function noteToFreq(note) {
  if (typeof note === 'number') return note;
  const m = noteToMidi(note);
  return Number.isFinite(m) ? midiToFreq(m) : 0;
}

// ---------------------------------------------------------------------------
// Wave tables
// ---------------------------------------------------------------------------

// Fourier series of a duty-cycle pulse. Slight high-harmonic rolloff keeps the
// top octave from turning into aliasing fizz without dulling the buzz.
function buildPulseWave(ctx, duty, harmonics = 44) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    const roll = Math.pow(Math.cos((n / (harmonics + 1)) * Math.PI * 0.5), 0.6);
    real[n] = ((2 * Math.sin(2 * Math.PI * n * duty)) / (Math.PI * n)) * roll;
    imag[n] = ((2 * (1 - Math.cos(2 * Math.PI * n * duty))) / (Math.PI * n)) * roll;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// The NES triangle is a 32-step staircase, not a smooth ramp. Reconstructing it
// from its own DFT keeps the characteristic gritty edge.
function buildTriangleWave(ctx) {
  const N = 32;
  const steps = new Float32Array(N);
  for (let i = 0; i < 16; i++) steps[i] = (15 - i - 7.5) / 7.5;
  for (let i = 0; i < 16; i++) steps[16 + i] = (i - 7.5) / 7.5;
  const H = 16;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  for (let n = 1; n <= H; n++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const ph = (2 * Math.PI * n * i) / N;
      re += steps[i] * Math.cos(ph);
      im += steps[i] * Math.sin(ph);
    }
    real[n] = (2 * re) / N;
    imag[n] = (2 * im) / N;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// 15-bit LFSR, exactly the APU's noise generator.
//   long  mode: feedback = bit0 ^ bit1   -> pseudo-white hiss
//   short mode: feedback = bit0 ^ bit6   -> 93-step metallic buzz
function buildNoiseBuffer(ctx, mode) {
  const sr = ctx.sampleRate;
  const periodic = mode === 'periodic';
  const len = periodic ? 93 : Math.floor(sr * 1.1);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < len; i++) {
    const fb = periodic ? (reg ^ (reg >> 6)) & 1 : (reg ^ (reg >> 1)) & 1;
    reg = (reg >>> 1) | (fb << 14);
    d[i] = reg & 1 ? -0.9 : 0.9;
  }
  return buf;
}

// 1-bit delta modulation, the way the DPCM channel works. Anything fed through
// this picks up the crunchy quantisation that makes NES drums sound like NES drums.
function deltaModulate(target, step) {
  const out = new Float32Array(target.length);
  let level = 0;
  for (let i = 0; i < target.length; i++) {
    level += target[i] > level ? step : -step;
    if (level > 1) level = 1;
    else if (level < -1) level = -1;
    out[i] = level;
  }
  return out;
}

const DRUM_SHAPES = {
  kick: { dur: 0.19, step: 2 / 48 },
  snare: { dur: 0.16, step: 2 / 40 },
  hat: { dur: 0.055, step: 2 / 30 },
  openhat: { dur: 0.15, step: 2 / 30 },
  tom: { dur: 0.17, step: 2 / 44 },
  click: { dur: 0.035, step: 2 / 24 },
  crash: { dur: 0.42, step: 2 / 34 },
};

function drumTarget(kind, n, rate) {
  const t = new Float32Array(n);
  const seed = rng.next();
  const local = { s: seed >>> 0 || 1 };
  const noise = () => {
    let x = local.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    local.s = x;
    return x / 2147483648 - 1;
  };
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const time = i / rate;
    let v = 0;
    switch (kind) {
      case 'kick': {
        const f = 150 * Math.pow(0.28, u);
        v = Math.sin(2 * Math.PI * f * time) * Math.pow(1 - u, 1.4);
        v += noise() * 0.18 * Math.pow(1 - u, 7);
        break;
      }
      case 'snare': {
        v = noise() * Math.pow(1 - u, 1.8);
        v += Math.sin(2 * Math.PI * 220 * time) * 0.35 * Math.pow(1 - u, 4);
        v += Math.sin(2 * Math.PI * 330 * time) * 0.2 * Math.pow(1 - u, 5);
        break;
      }
      case 'hat': {
        v = noise() * Math.pow(1 - u, 3.2);
        break;
      }
      case 'openhat': {
        v = noise() * Math.pow(1 - u, 1.2);
        break;
      }
      case 'crash': {
        v = noise() * Math.pow(1 - u, 0.85);
        v += Math.sin(2 * Math.PI * 5200 * time) * 0.12 * Math.pow(1 - u, 2);
        break;
      }
      case 'tom': {
        const f = 260 * Math.pow(0.45, u);
        v = Math.sin(2 * Math.PI * f * time) * Math.pow(1 - u, 1.6);
        v += noise() * 0.1 * Math.pow(1 - u, 6);
        break;
      }
      default: {
        v = (noise() * 0.6 + Math.sin(2 * Math.PI * 900 * time)) * Math.pow(1 - u, 5);
        break;
      }
    }
    t[i] = Math.max(-1, Math.min(1, v));
  }
  return t;
}

function buildDrumBuffer(ctx, kind) {
  const shape = DRUM_SHAPES[kind] || DRUM_SHAPES.click;
  const dpcmRate = 22050;
  const n = Math.max(8, Math.floor(shape.dur * dpcmRate));
  const modulated = deltaModulate(drumTarget(kind, n, dpcmRate), shape.step);
  const sr = ctx.sampleRate;
  const outLen = Math.max(8, Math.floor(shape.dur * sr));
  const buf = ctx.createBuffer(1, outLen, sr);
  const d = buf.getChannelData(0);
  const ratio = dpcmRate / sr;
  for (let i = 0; i < outLen; i++) {
    const src = Math.min(n - 1, (i * ratio) | 0);
    d[i] = modulated[src];
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Voice bookkeeping
// ---------------------------------------------------------------------------

const SILENCE = 0.00012;

class Voice {
  constructor(engine, gain, sources, endTime, tag) {
    this.engine = engine;
    this.gain = gain;
    this.sources = sources;
    this.endTime = endTime;
    this.tag = tag || null;
    this.startedAt = engine.now();
    this.released = false;
  }

  // Cut this voice short with a short fade so stealing never clicks.
  release(when, fade = 0.012) {
    if (this.released || !this.gain) return;
    this.released = true;
    const t = Math.max(when, this.engine.now());
    if (t >= this.endTime) return;
    const p = this.gain.gain;
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
      }
      p.linearRampToValueAtTime(0, t + fade);
    } catch (e) {
      /* param already finished */
    }
    for (const s of this.sources) {
      try {
        s.stop(t + fade + 0.005);
      } catch (e) {
        /* already stopped */
      }
    }
    this.endTime = t + fade;
  }
}

const STUB_VOICE = {
  release() {},
  endTime: 0,
  gain: null,
  sources: [],
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

const LOOKAHEAD = 0.32;
const MAX_VOICES = 48;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = false;
    this.enabled = true;
    this.latency = 0.02;
    this.lookahead = LOOKAHEAD;

    this._volume = 0.75;
    this._musicVol = 0.62;
    this._sfxVol = 0.9;

    this._waves = new Map();
    this._noiseBufs = new Map();
    this._drumBufs = new Map();
    this._channels = new Map();
    this._live = [];
    this._pumps = [];
    this._queue = [];
    this._pumping = false;
    this._rafId = 0;
    this._clockSrc = null;
    this._duckUntil = 0;

    this._sfxHandler = null;
    this._musicHandler = null;
    this._pending = [];
    this._boundGesture = null;
  }

  // -- lifecycle ------------------------------------------------------------

  get context() {
    return this.ctx;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  _build() {
    if (this.ctx || !this.enabled) return this.ctx;
    const Ctor =
      typeof globalThis !== 'undefined' &&
      (globalThis.AudioContext || globalThis.webkitAudioContext);
    if (!Ctor) {
      this.enabled = false;
      return null;
    }
    let ctx;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      this.enabled = false;
      return null;
    }
    this.ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    limiter.connect(ctx.destination);

    // The NES output stage is band limited; mimicking it removes digital harshness.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 12800;
    lp.Q.value = 0.5;
    lp.connect(limiter);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 42;
    hp.Q.value = 0.5;
    hp.connect(lp);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this._volume;
    master.connect(hp);

    const musicDuck = ctx.createGain();
    musicDuck.gain.value = 1;
    musicDuck.connect(master);

    const musicBus = ctx.createGain();
    musicBus.gain.value = this._musicVol;
    musicBus.connect(musicDuck);

    const sfxBus = ctx.createGain();
    sfxBus.gain.value = this._sfxVol;
    sfxBus.connect(master);

    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);

    this.limiter = limiter;
    this.master = master;
    this.musicDuck = musicDuck;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this._sink = sink;
    return ctx;
  }

  // Browsers refuse to start audio before a gesture. Call from the first input event.
  unlock() {
    if (!this.enabled) return Promise.resolve(false);
    const ctx = this._build();
    if (!ctx) return Promise.resolve(false);
    const done = () => {
      if (ctx.state === 'running') {
        if (!this.unlocked) {
          this.unlocked = true;
          this._startPump();
          this._flushPending();
        }
        return true;
      }
      return false;
    };
    if (done()) return Promise.resolve(true);
    let p;
    try {
      p = ctx.resume();
    } catch (e) {
      return Promise.resolve(false);
    }
    return Promise.resolve(p)
      .then(done)
      .catch(() => false);
  }

  // Safety net: if the game forgets to call unlock(), the first gesture still works.
  attachGestureUnlock(target) {
    const t = target || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!t || !t.addEventListener || this._boundGesture) return;
    const fire = () => {
      this.unlock();
      if (this.unlocked) {
        for (const ev of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
          t.removeEventListener(ev, fire, true);
        }
        this._boundGesture = null;
      }
    };
    this._boundGesture = fire;
    for (const ev of ['pointerdown', 'touchstart', 'keydown', 'mousedown']) {
      t.addEventListener(ev, fire, true);
    }
    if (t.document && t.document.addEventListener) {
      t.document.addEventListener('visibilitychange', () => {
        if (!t.document.hidden && this.unlocked && this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
      });
    }
  }

  _flushPending() {
    const pend = this._pending;
    this._pending = [];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let music = null;
    for (const req of pend) {
      if (req.kind === 'music') music = req;
      else if (now - req.at < 350) this.sfx(req.name, req.opts);
    }
    if (music) this.music(music.name, music.opts);
  }

  // -- master controls ------------------------------------------------------

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) {
      this.master.gain.setTargetAtTime(this._volume, this.now(), 0.02);
    }
    return this._volume;
  }

  get volume() {
    return this._volume;
  }

  setMusicVolume(v) {
    this._musicVol = Math.max(0, Math.min(1, v));
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this._musicVol, this.now(), 0.03);
    return this._musicVol;
  }

  setSfxVolume(v) {
    this._sfxVol = Math.max(0, Math.min(1, v));
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this._sfxVol, this.now(), 0.03);
    return this._sfxVol;
  }

  mute(on) {
    this.muted = on === undefined ? !this.muted : !!on;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this._volume, this.now(), 0.015);
    }
    return this.muted;
  }

  toggleMute() {
    return this.mute();
  }

  get isMuted() {
    return this.muted;
  }

  // -- clock ----------------------------------------------------------------

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  when(t) {
    const n = this.now() + this.latency;
    return t == null ? n : Math.max(t, this.now());
  }

  // Refill the schedule. Safe to call as often as you like; it is idempotent.
  update() {
    if (!this.ctx || !this.unlocked) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < this._pumps.length; i++) this._pumps[i](now, now + this.lookahead);
    if (this._live.length) {
      let w = 0;
      for (let i = 0; i < this._live.length; i++) {
        if (this._live[i].endTime > now - 0.05) this._live[w++] = this._live[i];
      }
      this._live.length = w;
    }
  }

  onPump(fn) {
    if (typeof fn === 'function' && !this._pumps.includes(fn)) this._pumps.push(fn);
  }

  offPump(fn) {
    const i = this._pumps.indexOf(fn);
    if (i >= 0) this._pumps.splice(i, 1);
  }

  _startPump() {
    if (this._pumping) return;
    this._pumping = true;
    const raf = typeof globalThis !== 'undefined' && globalThis.requestAnimationFrame;
    if (raf) {
      const step = () => {
        if (!this._pumping) return;
        this.update();
        this._rafId = raf.call(globalThis, step);
      };
      this._rafId = raf.call(globalThis, step);
    }
    this._chainClock();
  }

  // Audio-clock driven backstop: a silent buffer whose `ended` event pulls the
  // scheduler forward even when rAF is throttled (hidden tab, background window).
  _chainClock() {
    if (!this.ctx || !this._pumping) return;
    try {
      const ctx = this.ctx;
      const frames = Math.max(64, Math.floor(ctx.sampleRate * 0.06));
      const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this._sink);
      src.onended = () => {
        this._clockSrc = null;
        if (!this._pumping) return;
        this.update();
        this._chainClock();
      };
      src.start(ctx.currentTime);
      this._clockSrc = src;
    } catch (e) {
      this._clockSrc = null;
    }
  }

  // -- ducking --------------------------------------------------------------

  // Pull the music down under an important sound effect, then let it back up.
  duck(depth = 0.4, hold = 0.12, attack = 0.02, release = 0.32) {
    if (!this.musicDuck) return;
    const t = this.now();
    const level = Math.max(0.05, 1 - depth);
    const p = this.musicDuck.gain;
    const end = t + attack + hold + release;
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
      }
      p.linearRampToValueAtTime(level, t + attack);
      p.setValueAtTime(level, t + attack + hold);
      p.linearRampToValueAtTime(1, end);
      this._duckUntil = end;
    } catch (e) {
      /* ignore */
    }
  }

  // -- voice plumbing -------------------------------------------------------

  _bus(name) {
    return name === 'music' ? this.musicBus : this.sfxBus;
  }

  _wave(duty) {
    const key = Math.round(duty * 1000);
    let w = this._waves.get(key);
    if (!w) {
      w = buildPulseWave(this.ctx, duty);
      this._waves.set(key, w);
    }
    return w;
  }

  _triWave() {
    let w = this._waves.get('tri');
    if (!w) {
      w = buildTriangleWave(this.ctx);
      this._waves.set('tri', w);
    }
    return w;
  }

  _noiseBuf(mode) {
    let b = this._noiseBufs.get(mode);
    if (!b) {
      b = buildNoiseBuffer(this.ctx, mode);
      this._noiseBufs.set(mode, b);
    }
    return b;
  }

  _drumBuf(kind) {
    let b = this._drumBufs.get(kind);
    if (!b) {
      b = buildDrumBuffer(this.ctx, kind);
      this._drumBufs.set(kind, b);
    }
    return b;
  }

  // Instant-attack, decay-to-sustain, hold, release. Returns the absolute end time.
  _envelope(param, t0, dur, o, peakVol) {
    const peak = Math.max(SILENCE, peakVol);
    const a = o.attack == null ? 0.0015 : o.attack;
    const d = o.decay == null ? 0 : o.decay;
    const s = o.sustain == null ? 1 : Math.max(0, Math.min(1, o.sustain));
    const r = o.release == null ? 0.03 : o.release;
    const tEnd = t0 + Math.max(dur, a + 0.006);

    param.setValueAtTime(SILENCE, t0);
    if (a > 0.0005) param.linearRampToValueAtTime(peak, t0 + a);
    else param.setValueAtTime(peak, t0 + a);

    let level = peak;
    if (d > 0 && s < 1) {
      const dEnd = Math.min(t0 + a + d, tEnd);
      level = Math.max(SILENCE, peak * s);
      param.exponentialRampToValueAtTime(level, dEnd);
    }
    param.setValueAtTime(level, tEnd);
    param.linearRampToValueAtTime(0, tEnd + r);
    return tEnd + r;
  }

  // Stepped sweeps (NES style) or smooth ones. `mode: 'step' | 'exp' | 'lin'`.
  _sweep(param, t0, from, sweep, dur) {
    const time = Math.max(0.004, sweep.time == null ? dur : sweep.time);
    let to = sweep.to != null ? noteToFreq(sweep.to) : from;
    if (sweep.cents != null) to = from * Math.pow(2, sweep.cents / 1200);
    if (sweep.semis != null) to = from * Math.pow(2, sweep.semis / 12);
    if (!(to > 0)) to = from;
    const mode = sweep.mode || 'step';
    if (mode === 'lin') {
      param.setValueAtTime(from, t0);
      param.linearRampToValueAtTime(to, t0 + time);
      return;
    }
    if (mode === 'exp') {
      param.setValueAtTime(from, t0);
      param.exponentialRampToValueAtTime(Math.max(1, to), t0 + time);
      return;
    }
    const steps = Math.max(2, Math.min(128, sweep.steps || Math.round(time / DT)));
    const curve = new Float32Array(steps);
    const ratio = Math.max(1e-4, to / from);
    for (let i = 0; i < steps; i++) {
      curve[i] = from * Math.pow(ratio, i / (steps - 1));
    }
    param.setValueCurveAtTime(curve, t0, time);
  }

  _vibrato(target, t0, endTime, vib) {
    const ctx = this.ctx;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = vib.rate == null ? 6.2 : vib.rate;
    const depth = ctx.createGain();
    const cents = vib.depth == null ? 26 : vib.depth;
    const delay = vib.delay == null ? 0.09 : vib.delay;
    depth.gain.setValueAtTime(0, t0);
    depth.gain.setValueAtTime(0, t0 + delay);
    depth.gain.linearRampToValueAtTime(cents, Math.min(endTime, t0 + delay + 0.07));
    lfo.connect(depth);
    depth.connect(target);
    lfo.start(t0);
    lfo.stop(endTime + 0.02);
    lfo.onended = () => {
      try {
        depth.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    return lfo;
  }

  // Rapid note cycling — how the NES fakes chords on a monophonic channel.
  _arpeggio(param, t0, dur, baseFreq, arp) {
    const notes = arp.notes || [0, 4, 7];
    const frames = Math.max(1, arp.frames == null ? 2 : arp.frames);
    const stepT = frames * DT;
    let i = 0;
    for (let t = t0; t < t0 + dur && i < 640; t += stepT, i++) {
      param.setValueAtTime(baseFreq * Math.pow(2, notes[i % notes.length] / 12), t);
    }
  }

  _register(voice, opts) {
    const bus = opts.bus === 'music' ? 'music' : 'sfx';
    if (opts.channel) {
      const key = bus + ':' + opts.channel;
      const prev = this._channels.get(key);
      if (prev && prev !== voice) prev.release(voice.startTime, 0.008);
      this._channels.set(key, voice);
    }
    this._live.push(voice);
    if (this._live.length > MAX_VOICES) {
      const now = this.now();
      let w = 0;
      for (let i = 0; i < this._live.length; i++) {
        if (this._live[i].endTime > now) this._live[w++] = this._live[i];
      }
      this._live.length = w;
    }
    if (this._live.length > MAX_VOICES) {
      // Steal the oldest non-music voice rather than dropping the new one.
      let idx = -1;
      for (let i = 0; i < this._live.length; i++) {
        if (this._live[i] !== voice && this._live[i].tag !== '__music') {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        this._live[idx].release(this.now(), 0.02);
        this._live.splice(idx, 1);
      }
    }
    return voice;
  }

  // Cancel any still-sounding instance of a named effect (polite voice stealing).
  releaseTag(tag, when, fade = 0.015) {
    if (!tag || !this._live.length) return;
    const t = when == null ? this.now() : when;
    for (const v of this._live) {
      if (v.tag === tag) v.release(t, fade);
    }
  }

  // -- channels -------------------------------------------------------------

  /**
   * Pulse channel voice.
   * opts: { time, dur, freq|note, duty, vol, bus, channel, tag, detune,
   *         attack, decay, sustain, release, sweep, vibrato, arp, pan }
   */
  pulse(opts = {}) {
    if (!this._ready()) return STUB_VOICE;
    const ctx = this.ctx;
    const t0 = this.when(opts.time);
    const dur = opts.dur == null ? 0.15 : opts.dur;
    const freq = noteToFreq(opts.freq != null ? opts.freq : opts.note || 'a4');
    if (!(freq > 0)) return STUB_VOICE;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._wave(opts.duty == null ? DUTY.D50 : opts.duty));
    const g = ctx.createGain();
    g.gain.value = 0; // so a cancelled envelope holds silence, never full scale
    const endTime = this._envelope(g.gain, t0, dur, opts, opts.vol == null ? 0.24 : opts.vol);

    if (opts.arp) {
      osc.frequency.setValueAtTime(freq, t0);
      this._arpeggio(osc.frequency, t0, endTime - t0, freq, opts.arp);
    } else if (opts.sweep) {
      this._sweep(osc.frequency, t0, freq, opts.sweep, dur);
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
    const extra = [];
    if (opts.vibrato) extra.push(this._vibrato(osc.detune, t0, endTime, opts.vibrato));

    osc.connect(g);
    g.connect(this._out(opts));
    osc.start(t0);
    osc.stop(endTime + 0.02);
    osc.onended = () => {
      try {
        g.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    const v = new Voice(this, g, [osc, ...extra], endTime, opts.tag);
    v.startTime = t0;
    return this._register(v, opts);
  }

  /** Triangle channel — the bass voice. Same option shape as pulse(). */
  triangle(opts = {}) {
    if (!this._ready()) return STUB_VOICE;
    const ctx = this.ctx;
    const t0 = this.when(opts.time);
    const dur = opts.dur == null ? 0.2 : opts.dur;
    const freq = noteToFreq(opts.freq != null ? opts.freq : opts.note || 'a2');
    if (!(freq > 0)) return STUB_VOICE;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._triWave());
    const g = ctx.createGain();
    g.gain.value = 0; // so a cancelled envelope holds silence, never full scale
    const endTime = this._envelope(g.gain, t0, dur, opts, opts.vol == null ? 0.32 : opts.vol);

    if (opts.arp) {
      osc.frequency.setValueAtTime(freq, t0);
      this._arpeggio(osc.frequency, t0, endTime - t0, freq, opts.arp);
    } else if (opts.sweep) {
      this._sweep(osc.frequency, t0, freq, opts.sweep, dur);
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }
    const extra = [];
    if (opts.vibrato) extra.push(this._vibrato(osc.detune, t0, endTime, opts.vibrato));

    osc.connect(g);
    g.connect(this._out(opts));
    osc.start(t0);
    osc.stop(endTime + 0.02);
    osc.onended = () => {
      try {
        g.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    const v = new Voice(this, g, [osc, ...extra], endTime, opts.tag);
    v.startTime = t0;
    return this._register(v, opts);
  }

  /**
   * Noise channel.
   * opts adds: { mode: 'white'|'periodic', clock (Hz), clockTo, freq (periodic only),
   *              filter: { type, freq, freqTo, Q } }
   */
  noise(opts = {}) {
    if (!this._ready()) return STUB_VOICE;
    const ctx = this.ctx;
    const t0 = this.when(opts.time);
    const dur = opts.dur == null ? 0.1 : opts.dur;
    const mode = opts.mode === 'periodic' ? 'periodic' : 'white';
    const buf = this._noiseBuf(mode);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.length / ctx.sampleRate;

    let rate;
    if (opts.freq != null && mode === 'periodic') {
      rate = (noteToFreq(opts.freq) * 93) / ctx.sampleRate;
    } else {
      rate = (opts.clock == null ? 11000 : opts.clock) / ctx.sampleRate;
    }
    rate = Math.max(0.0008, Math.min(3.9, rate));
    src.playbackRate.setValueAtTime(rate, t0);
    if (opts.clockTo != null || opts.freqTo != null) {
      let to;
      if (opts.freqTo != null && mode === 'periodic') {
        to = (noteToFreq(opts.freqTo) * 93) / ctx.sampleRate;
      } else {
        to = opts.clockTo / ctx.sampleRate;
      }
      to = Math.max(0.0008, Math.min(3.9, to));
      src.playbackRate.linearRampToValueAtTime(to, t0 + (opts.sweepTime == null ? dur : opts.sweepTime));
    }

    const g = ctx.createGain();
    g.gain.value = 0; // so a cancelled envelope holds silence, never full scale
    const endTime = this._envelope(g.gain, t0, dur, opts, opts.vol == null ? 0.22 : opts.vol);

    let head = g;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type || 'lowpass';
      f.frequency.setValueAtTime(Math.max(30, opts.filter.freq || 4000), t0);
      if (opts.filter.freqTo != null) {
        f.frequency.linearRampToValueAtTime(
          Math.max(30, opts.filter.freqTo),
          t0 + (opts.filter.time == null ? dur : opts.filter.time)
        );
      }
      f.Q.value = opts.filter.Q == null ? 0.8 : opts.filter.Q;
      src.connect(f);
      f.connect(g);
      head = g;
    } else {
      src.connect(g);
    }
    head.connect(this._out(opts));
    src.start(t0);
    src.stop(endTime + 0.02);
    src.onended = () => {
      try {
        g.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    const v = new Voice(this, g, [src], endTime, opts.tag);
    v.startTime = t0;
    return this._register(v, opts);
  }

  /** DPCM-ish percussion click. kind: kick|snare|hat|openhat|tom|click|crash */
  drum(opts = {}) {
    if (!this._ready()) return STUB_VOICE;
    const ctx = this.ctx;
    const t0 = this.when(opts.time);
    const kind = opts.kind || 'click';
    const buf = this._drumBuf(kind);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, opts.rate == null ? 1 : opts.rate));
    const natural = buf.length / ctx.sampleRate / src.playbackRate.value;
    const dur = opts.dur == null ? natural : Math.min(opts.dur, natural);
    const g = ctx.createGain();
    g.gain.value = 0;
    const vol = opts.vol == null ? 0.3 : opts.vol;
    g.gain.setValueAtTime(vol, t0);
    const endTime = t0 + dur;
    g.gain.setValueAtTime(vol, Math.max(t0, endTime - 0.012));
    g.gain.linearRampToValueAtTime(0, endTime);
    src.connect(g);
    g.connect(this._out(opts));
    src.start(t0);
    src.stop(endTime + 0.01);
    src.onended = () => {
      try {
        g.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    const v = new Voice(this, g, [src], endTime, opts.tag);
    v.startTime = t0;
    return this._register(v, opts);
  }

  _out(opts) {
    return this._bus(opts.bus);
  }

  _ready() {
    return !!(this.ctx && this.unlocked && this.enabled && this.master);
  }

  /** True once a context exists and the browser has let us start it. */
  isReady() {
    return this._ready();
  }

  // -- silence --------------------------------------------------------------

  stopAll(fade = 0.04) {
    const t = this.now();
    for (const v of this._live) v.release(t, fade);
    this._live.length = 0;
    this._channels.clear();
  }

  // -- high level facade (filled in by sfx.js / music.js) -------------------

  registerSfx(fn) {
    this._sfxHandler = fn;
    if (this.unlocked && this._pending.length) this._flushPending();
  }

  registerMusic(fn) {
    this._musicHandler = fn;
    if (this.unlocked && this._pending.length) this._flushPending();
  }

  /** Fire and forget sound effect. */
  sfx(name, opts) {
    if (!name || !this.enabled) return null;
    if (!this._sfxHandler || !this.unlocked) {
      this._pending.push({
        kind: 'sfx',
        name,
        opts,
        at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
      if (this._pending.length > 24) this._pending.shift();
      return null;
    }
    return this._sfxHandler(name, opts);
  }

  /** Start a music track. `null` stops. */
  music(name, opts) {
    if (!this.enabled) return null;
    if (!this._musicHandler || (!this.unlocked && name)) {
      this._pending.push({
        kind: 'music',
        name,
        opts,
        at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
      return null;
    }
    return this._musicHandler(name, opts);
  }
}

export const audio = new AudioEngine();

// `Audio` is the name the rest of the game uses (see ARCHITECTURE.md section 8).
// It is the same object as `audio`, so `window.__GAME.audio` and `Audio` agree.
export const Audio = audio;

if (typeof globalThis !== 'undefined' && globalThis.addEventListener) {
  audio.attachGestureUnlock(globalThis);
}

// Self-wire the effect and music layers so importing engine.js alone is enough.
// Dynamic import keeps the static graph acyclic.
if (typeof globalThis !== 'undefined' && globalThis.document !== undefined) {
  Promise.all([import('./sfx.js'), import('./music.js')]).catch(() => {});
}

export default audio;
