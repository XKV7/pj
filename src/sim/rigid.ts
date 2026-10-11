// 지지대 없는 고체 덩어리 → 강체 조각으로 분리되어 낙하 후 다시 그리드에 고착.
import type { World } from './world';
import { M, CAT, Cat, BLOCKS, IS_FLUIDISH, DENS } from './materials';

export interface RigidBody {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  fy: number;
  mats: Uint8Array;
  shades: Uint8Array;
  temps: Int16Array;
  density: number;
  cells: number;
}

const FLOOD_LIMIT = 2500;

export class RigidSystem {
  bodies: RigidBody[] = [];
  private visited: Uint32Array | null = null;
  private gen = 0;
  private list = new Int32Array(FLOOD_LIMIT + 8);
  private stack = new Int32Array(FLOOD_LIMIT * 4 + 16);
  detachedTotal = 0;

  clear(): void {
    this.bodies.length = 0;
    this.visited = null;
  }

  checkSupport(w: World): void {
    const checks = w.supportChecks;
    w.supportChecks = [];
    if (!this.visited || this.visited.length !== w.W * w.H) this.visited = new Uint32Array(w.W * w.H);
    this.gen++;
    if (this.gen > 0xfffffff0) {
      this.visited.fill(0);
      this.gen = 1;
    }
    for (let c = 0; c < checks.length; c += 4) {
      const x0 = Math.max(1, checks[c]);
      const y0 = Math.max(1, checks[c + 1]);
      const x1 = Math.min(w.W - 2, checks[c + 2]);
      const y1 = Math.min(w.H - 2, checks[c + 3]);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * w.W + x;
          const m = w.mat[i];
          if (CAT[m] !== Cat.SOLID || m === M.BEDROCK || this.visited[i] === this.gen) continue;
          this.flood(w, x, y);
        }
      }
    }
  }

  private flood(w: World, sx: number, sy: number): void {
    const W = w.W;
    const visited = this.visited!;
    const gen = this.gen;
    const list = this.list;
    const stack = this.stack;
    let n = 0;
    let sp = 0;
    let anchored = false;
    const s0 = sy * W + sx;
    stack[sp++] = s0;
    visited[s0] = gen;
    let minX = sx;
    let maxX = sx;
    let minY = sy;
    let maxY = sy;
    while (sp > 0) {
      const c = stack[--sp];
      if (n >= FLOOD_LIMIT) {
        anchored = true;
        break;
      }
      list[n++] = c;
      const cx = c % W;
      const cy = (c - cx) / W;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = cy + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.H) {
          anchored = true;
          continue;
        }
        const j = ny * W + nx;
        const m = w.mat[j];
        if (m === M.BEDROCK) {
          anchored = true;
          continue;
        }
        if (CAT[m] !== Cat.SOLID || visited[j] === gen) continue;
        visited[j] = gen;
        if (sp < stack.length) stack[sp++] = j;
        else anchored = true;
      }
    }
    if (anchored) return;
    // 분리된 덩어리 → 강체
    if (n < 4) {
      for (let k = 0; k < n; k++) {
        const c = list[k];
        const cx = c % W;
        const cy = (c - cx) / W;
        w.particles.spawnMat(cx, cy, (w.rand01() - 0.5) * 0.6, 0, w.mat[c], w.shade[c], w.temp[c]);
        w.set(cx, cy, M.EMPTY);
      }
      return;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const body: RigidBody = {
      x: minX,
      y: minY,
      w: bw,
      h: bh,
      vy: 0,
      fy: 0,
      mats: new Uint8Array(bw * bh),
      shades: new Uint8Array(bw * bh),
      temps: new Int16Array(bw * bh),
      density: 0,
      cells: n,
    };
    let dens = 0;
    for (let k = 0; k < n; k++) {
      const c = list[k];
      const cx = c % W;
      const cy = (c - cx) / W;
      const bi = (cy - minY) * bw + (cx - minX);
      body.mats[bi] = w.mat[c];
      body.shades[bi] = w.shade[c];
      body.temps[bi] = w.temp[c];
      dens += DENS[w.mat[c]];
      w.mat[c] = 0;
      w.charge[c] = 0;
    }
    body.density = dens / n;
    w.wakeRect(minX - 1, minY - 1, maxX + 1, maxY + 1);
    this.bodies.push(body);
    this.detachedTotal++;
  }

  private canMoveDown(w: World, b: RigidBody): boolean {
    const W = w.W;
    for (let by = 0; by < b.h; by++) {
      const ty = b.y + by + 1;
      for (let bx = 0; bx < b.w; bx++) {
        if (b.mats[by * b.w + bx] === 0) continue;
        const tx = b.x + bx;
        if (ty >= w.H || tx < 0 || tx >= W) return false;
        const o = w.mat[ty * W + tx];
        if (o === 0) continue;
        if (BLOCKS[o]) return false;
        if (CAT[o] === Cat.LIQUID && b.density < DENS[o]) return false; // 뜬다 (얼음 등)
      }
    }
    return true;
  }

  update(w: World): void {
    for (let k = this.bodies.length - 1; k >= 0; k--) {
      const b = this.bodies[k];
      b.vy = Math.min(b.vy + 0.2, 5);
      b.fy += b.vy;
      let landed = false;
      while (b.fy >= 1) {
        b.fy -= 1;
        if (!this.canMoveDown(w, b)) {
          landed = true;
          break;
        }
        b.y++;
        this.displace(w, b);
      }
      if (landed) {
        this.stamp(w, b);
        this.bodies.splice(k, 1);
      }
    }
  }

  private displace(w: World, b: RigidBody): void {
    const W = w.W;
    for (let by = 0; by < b.h; by++) {
      for (let bx = 0; bx < b.w; bx++) {
        if (b.mats[by * b.w + bx] === 0) continue;
        const tx = b.x + bx;
        const ty = b.y + by;
        const i = ty * W + tx;
        const o = w.mat[i];
        if (o !== 0 && IS_FLUIDISH[o]) {
          if (CAT[o] === Cat.LIQUID) w.particles.spawnMat(tx, ty - 1, (w.rand01() - 0.5) * 3, -1 - w.rand01() * 2.5, o, w.shade[i], w.temp[i]);
          w.set(tx, ty, M.EMPTY);
        }
      }
    }
  }

  private stamp(w: World, b: RigidBody): void {
    const W = w.W;
    for (let by = 0; by < b.h; by++) {
      for (let bx = 0; bx < b.w; bx++) {
        const bi = by * b.w + bx;
        const m = b.mats[bi];
        if (m === 0) continue;
        const tx = b.x + bx;
        const ty = b.y + by;
        if (!w.inBounds(tx, ty)) continue;
        const i = ty * W + tx;
        const o = w.mat[i];
        if (o === 0 || IS_FLUIDISH[o]) {
          w.set(tx, ty, m);
          w.shade[i] = b.shades[bi];
          w.temp[i] = b.temps[bi];
        } else {
          w.particles.spawnMat(tx, ty - 1, (w.rand01() - 0.5) * 2, -1, m, b.shades[bi], b.temps[bi]);
        }
      }
    }
  }
}
