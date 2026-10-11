// 간단한 그리드 기반 길찾기: 플레이어 주변 거친 격자에 BFS 흐름장(flow field)을 만든다.
import type { World } from '../sim/world';
import { BLOCKS } from '../sim/materials';

export const CELL = 6;
const FW = 110;
const FH = 80;

export class FlowField {
  dist = new Uint16Array(FW * FH);
  pass = new Uint8Array(FW * FH);
  ox = 0; // 격자 원점 (월드 좌표, CELL 배수)
  oy = 0;
  private queue = new Int32Array(FW * FH);
  valid = false;

  build(w: World, tx: number, ty: number): void {
    this.ox = Math.floor(tx / CELL - FW / 2) * CELL;
    this.oy = Math.floor(ty / CELL - FH / 2) * CELL;
    const pass = this.pass;
    for (let gy = 0; gy < FH; gy++) {
      for (let gx = 0; gx < FW; gx++) {
        const wx0 = this.ox + gx * CELL;
        const wy0 = this.oy + gy * CELL;
        let solid = 0;
        for (let y = 0; y < CELL; y += 2) {
          for (let x = 0; x < CELL; x += 2) {
            const xx = wx0 + x;
            const yy = wy0 + y;
            if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H || BLOCKS[w.mat[yy * w.W + xx]]) solid++;
          }
        }
        pass[gy * FW + gx] = solid <= 4 ? 1 : 0;
      }
    }
    const dist = this.dist;
    dist.fill(65535);
    const sx = Math.floor((tx - this.ox) / CELL);
    const sy = Math.floor((ty - this.oy) / CELL);
    if (sx < 0 || sy < 0 || sx >= FW || sy >= FH) {
      this.valid = false;
      return;
    }
    let h = 0;
    let t = 0;
    const s = sy * FW + sx;
    dist[s] = 0;
    this.queue[t++] = s;
    while (h < t) {
      const c = this.queue[h++];
      const cx = c % FW;
      const cy = (c - cx) / FW;
      const d = dist[c] + 1;
      for (let k = 0; k < 8; k++) {
        const dx = k === 0 ? -1 : k === 1 ? 1 : k < 4 ? 0 : k === 4 || k === 6 ? -1 : 1;
        const dy = k === 2 ? -1 : k === 3 ? 1 : k < 2 ? 0 : k < 6 ? -1 : 1;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
        const j = ny * FW + nx;
        if (!pass[j] || dist[j] <= d) continue;
        if (dx !== 0 && dy !== 0 && (!pass[cy * FW + nx] || !pass[ny * FW + cx])) continue;
        dist[j] = d;
        this.queue[t++] = j;
      }
    }
    this.valid = true;
  }

  /** 월드 좌표에서 목표 쪽 다음 칸 방향. 없으면 null */
  dirAt(x: number, y: number): { dx: number; dy: number; dist: number } | null {
    if (!this.valid) return null;
    const gx = Math.floor((x - this.ox) / CELL);
    const gy = Math.floor((y - this.oy) / CELL);
    if (gx < 0 || gy < 0 || gx >= FW || gy >= FH) return null;
    const here = this.dist[gy * FW + gx];
    let best = here;
    let bdx = 0;
    let bdy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
        const d = this.dist[ny * FW + nx];
        if (d < best) {
          best = d;
          bdx = dx;
          bdy = dy;
        }
      }
    }
    if (best === 65535 || (bdx === 0 && bdy === 0)) return here === 65535 ? null : { dx: 0, dy: 0, dist: here };
    return { dx: bdx, dy: bdy, dist: best };
  }
}
