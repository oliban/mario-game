import { DT, MAX_FRAME_SKIP } from './constants.js';

export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.tick = 0;
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._raf = null;
    this._bound = (t) => this._frame(t);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this._raf = requestAnimationFrame(this._bound);
  }

  stop() {
    this.running = false;
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  // Advance exactly n fixed steps and render once. Used by the debug/screenshot API.
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.update(DT);
      this.tick++;
    }
    this.render(1);
  }

  _frame(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._bound);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;

    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_FRAME_SKIP) {
      this.update(DT);
      this.tick++;
      this.acc -= DT;
      steps++;
    }
    if (steps === MAX_FRAME_SKIP) this.acc = 0;
    this.render(this.acc / DT);
  }
}

export default GameLoop;
