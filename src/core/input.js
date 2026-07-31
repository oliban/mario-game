export const BTN = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  JUMP: 'jump',
  RUN: 'run',
  START: 'start',
  SELECT: 'select',
};

// A key may drive several buttons. Up is both the climb/enter direction AND a jump,
// because that is what players reach for first and holding UP has no other meaning
// while airborne.
const KEYMAP = {
  ArrowLeft: BTN.LEFT,
  ArrowRight: BTN.RIGHT,
  ArrowUp: [BTN.UP, BTN.JUMP],
  ArrowDown: BTN.DOWN,
  KeyA: BTN.LEFT,
  KeyD: BTN.RIGHT,
  KeyW: [BTN.UP, BTN.JUMP],
  KeyS: BTN.DOWN,
  Space: BTN.JUMP,
  KeyK: BTN.JUMP,
  KeyZ: BTN.JUMP,
  KeyJ: BTN.RUN,
  KeyX: BTN.RUN,
  ShiftLeft: BTN.RUN,
  ShiftRight: BTN.RUN,
  Enter: BTN.START,
  Escape: BTN.START,
  Tab: BTN.SELECT,
};

const PADMAP = {
  0: BTN.JUMP,
  1: BTN.RUN,
  2: BTN.RUN,
  3: BTN.JUMP,
  9: BTN.START,
  8: BTN.SELECT,
  12: BTN.UP,
  13: BTN.DOWN,
  14: BTN.LEFT,
  15: BTN.RIGHT,
};

class Input {
  constructor() {
    this.state = {};
    this.prev = {};
    this._raw = {};
    this._forced = null;
    for (const b of Object.values(BTN)) {
      this.state[b] = false;
      this.prev[b] = false;
      this._raw[b] = false;
    }
    this.anyPressedThisFrame = false;
  }

  attach(target = window) {
    const set = (code, down, e) => {
      const b = KEYMAP[code];
      if (!b) return;
      if (Array.isArray(b)) for (const k of b) this._raw[k] = down;
      else this._raw[b] = down;
      e.preventDefault();
    };
    target.addEventListener('keydown', (e) => set(e.code, true, e));
    target.addEventListener('keyup', (e) => set(e.code, false, e));
    target.addEventListener('blur', () => {
      for (const k in this._raw) this._raw[k] = false;
    });
  }

  pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (!p) continue;
      for (const i in PADMAP) {
        if (p.buttons[i] && p.buttons[i].pressed) this._raw[PADMAP[i]] = true;
      }
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      if (ax < -0.4) this._raw[BTN.LEFT] = true;
      if (ax > 0.4) this._raw[BTN.RIGHT] = true;
      if (ay < -0.4) this._raw[BTN.UP] = true;
      if (ay > 0.4) this._raw[BTN.DOWN] = true;
    }
  }

  // Called once per fixed tick, before systems read input.
  update() {
    const padDown = {};
    for (const b of Object.values(BTN)) padDown[b] = this._raw[b];
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (const p of pads) {
        if (!p) continue;
        for (const i in PADMAP) {
          if (p.buttons[i] && p.buttons[i].pressed) padDown[PADMAP[i]] = true;
        }
        const ax = p.axes[0] || 0;
        const ay = p.axes[1] || 0;
        if (ax < -0.4) padDown[BTN.LEFT] = true;
        if (ax > 0.4) padDown[BTN.RIGHT] = true;
        if (ay < -0.4) padDown[BTN.UP] = true;
        if (ay > 0.4) padDown[BTN.DOWN] = true;
      }
    }
    this.anyPressedThisFrame = false;
    for (const b of Object.values(BTN)) {
      this.prev[b] = this.state[b];
      this.state[b] = this._forced ? !!this._forced[b] : padDown[b];
      if (this.state[b] && !this.prev[b]) this.anyPressedThisFrame = true;
    }
  }

  down(b) {
    return !!this.state[b];
  }
  pressed(b) {
    return !!this.state[b] && !this.prev[b];
  }
  released(b) {
    return !this.state[b] && !!this.prev[b];
  }

  // Scripted input for demos, cutscenes and automated screenshots.
  force(map) {
    this._forced = map;
  }
  release() {
    this._forced = null;
  }
}

export const input = new Input();
export default input;
