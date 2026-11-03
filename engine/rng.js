// Small seedable PRNG (mulberry32) whose whole state is one number, so saves can capture it.
export class Rng {
  constructor(seed = 1) { this.state = seed >>> 0; }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(list) { return list.length ? list[this.int(0, list.length - 1)] : undefined; }
}
