// 시드 기반 난수 + 값 노이즈 (주기적 래핑 지원) + fBm.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x12345678;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 값 노이즈. periodX > 0 이면 x 방향으로 주기적 */
export function valueNoise(x: number, y: number, seed: number, periodX = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wx = (v: number): number => (periodX > 0 ? ((v % periodX) + periodX) % periodX : v);
  const a = hash(wx(x0), y0, seed);
  const b = hash(wx(x0 + 1), y0, seed);
  const c = hash(wx(x0), y0 + 1, seed);
  const d = hash(wx(x0 + 1), y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x: number, y: number, seed: number, oct = 4, periodX = 0): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 1013, periodX > 0 ? periodX * f : 0) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
