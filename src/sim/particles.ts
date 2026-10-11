// 자유 입자: 폭발 파편 등 그리드를 벗어나 날아다니는 재질 입자 + 순수 시각 효과 입자.
// 풀링된 SoA 배열, 스왑-삭제로 압축 유지.
import type { World } from './world';
import { M, IS_FLUIDISH, COLOR_TABLE, CAT, Cat } from './materials';

export class Particles {
  readonly cap: number;
  count = 0;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  mat: Uint8Array; // 0 = 시각 효과 입자
  color: Uint32Array; // ABGR
  life: Int16Array;
  temp: Int16Array;
  grav: Float32Array;
  glow: Uint8Array;

  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.mat = new Uint8Array(cap);
    this.color = new Uint32Array(cap);
    this.life = new Int16Array(cap);
    this.temp = new Int16Array(cap);
    this.grav = new Float32Array(cap);
    this.glow = new Uint8Array(cap);
  }

  clear(): void {
    this.count = 0;
  }

  spawnMat(x: number, y: number, vx: number, vy: number, m: number, shade: number, temp: number): void {
    if (this.count >= this.cap || m === M.EMPTY) return;
    const k = this.count++;
    this.x[k] = x + 0.5;
    this.y[k] = y + 0.5;
    this.vx[k] = vx;
    this.vy[k] = vy;
    this.mat[k] = m;
    this.color[k] = COLOR_TABLE[m * 256 + (shade & 255)];
    this.life[k] = 600;
    this.temp[k] = temp;
    this.grav[k] = CAT[m] === Cat.GAS ? -0.05 : 0.18;
    this.glow[k] = 0;
  }

  /** 시각 효과 입자 (그리드와 상호작용하지 않음) */
  spawnFx(x: number, y: number, vx: number, vy: number, abgr: number, life: number, grav = 0.05, glow = 0): void {
    if (this.count >= this.cap) return;
    const k = this.count++;
    this.x[k] = x;
    this.y[k] = y;
    this.vx[k] = vx;
    this.vy[k] = vy;
    this.mat[k] = 0;
    this.color[k] = abgr;
    this.life[k] = life;
    this.temp[k] = 0;
    this.grav[k] = grav;
    this.glow[k] = glow;
  }

  private kill(k: number): void {
    const last = --this.count;
    if (k !== last) {
      this.x[k] = this.x[last];
      this.y[k] = this.y[last];
      this.vx[k] = this.vx[last];
      this.vy[k] = this.vy[last];
      this.mat[k] = this.mat[last];
      this.color[k] = this.color[last];
      this.life[k] = this.life[last];
      this.temp[k] = this.temp[last];
      this.grav[k] = this.grav[last];
      this.glow[k] = this.glow[last];
    }
  }

  update(w: World): void {
    const W = w.W;
    const H = w.H;
    for (let k = this.count - 1; k >= 0; k--) {
      const m = this.mat[k];
      this.vy[k] += this.grav[k];
      if (this.vy[k] > 7) this.vy[k] = 7;
      this.vx[k] *= 0.995;
      if (--this.life[k] <= 0) {
        if (m !== 0) this.deposit(w, k, Math.floor(this.x[k]), Math.floor(this.y[k]));
        this.kill(k);
        continue;
      }
      const vx = this.vx[k];
      const vy = this.vy[k];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy))));
      const sx = vx / steps;
      const sy = vy / steps;
      let px = this.x[k];
      let py = this.y[k];
      let dead = false;
      for (let s = 0; s < steps; s++) {
        const nx = px + sx;
        const ny = py + sy;
        const ix = Math.floor(nx);
        const iy = Math.floor(ny);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) {
          dead = true;
          break;
        }
        const o = w.mat[iy * W + ix];
        if (o !== 0 && !(IS_FLUIDISH[o] && CAT[o] !== Cat.LIQUID)) {
          if (m !== 0) this.deposit(w, k, Math.floor(px), Math.floor(py));
          dead = true;
          break;
        }
        px = nx;
        py = ny;
      }
      if (dead) {
        this.kill(k);
        continue;
      }
      this.x[k] = px;
      this.y[k] = py;
    }
  }

  private deposit(w: World, k: number, x: number, y: number): void {
    const m = this.mat[k];
    for (let d = 0; d < 4; d++) {
      const yy = y - d;
      if (!w.inBounds(x, yy)) return;
      const o = w.mat[yy * w.W + x];
      if (o === 0 || (IS_FLUIDISH[o] && CAT[o] !== Cat.LIQUID)) {
        w.set(x, yy, m);
        w.temp[yy * w.W + x] = this.temp[k];
        return;
      }
    }
  }
}
