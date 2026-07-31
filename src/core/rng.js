// Deterministic RNG so replays, demos and screenshot captures are reproducible.
export class Rng {
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x;
  }
  float() {
    return this.next() / 4294967296;
  }
  range(a, b) {
    return a + this.float() * (b - a);
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
  chance(p) {
    return this.float() < p;
  }
}

export const rng = new Rng();
export default rng;
