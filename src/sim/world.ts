// 셀룰러 오토마타 시뮬레이션 엔진 (DOM 비의존).
import {
  M, NUM_MATS, CAT, Cat, DENS, HARD, COND, IS_SOURCE, HEAT, TINIT, DISP, VISC, CONDUCTIVE,
  BLOCKS, IS_FLUIDISH, COOLDIV, COOLMASK, FLAM, IGN, MELT_AT, MELT_INTO, FREEZE_AT, FREEZE_INTO,
  BOIL_AT, BOIL_INTO, BURN_INTO, EXPLOSIVE, LIFE_MIN, LIFE_RANGE, DECAY_INTO, DECAY_CHANCE, MATS,
} from './materials';
import { RX, REACTS, REACTIONS, KEEP, IGNITE } from './reactions';
import { Particles } from './particles';
import { RigidSystem } from './rigid';

export const CHUNK = 64;
const CSHIFT = 6;
const EMPTY_MIN = 32767;
export const CHARGE_TIME = 10;

export interface ExplosionInfo {
  x: number;
  y: number;
  r: number;
  power: number;
  cause: string;
}

interface PendingExplosion extends ExplosionInfo {
  delay: number;
}

export class World {
  readonly W: number;
  readonly H: number;
  readonly CW: number;
  readonly CH: number;
  readonly mat: Uint8Array;
  readonly shade: Uint8Array;
  readonly temp: Int16Array;
  readonly life: Uint16Array;
  readonly aux: Uint8Array;
  readonly charge: Uint8Array;
  readonly stamp: Uint8Array;
  private cur: Int16Array;
  private next: Int16Array;
  /** 청크별 마지막 활성 프레임 (디버그 표시용) */
  readonly chunkActive: Uint8Array;
  ambient = 20;
  frame = 0;
  private tag = 1;
  private seed = 0x9e3779b9;
  private simCX0 = 0;
  private simCY0 = 0;
  private simCX1 = 1 << 20;
  private simCY1 = 1 << 20;
  readonly particles: Particles;
  readonly rigid: RigidSystem;
  private explosions: PendingExplosion[] = [];
  onExplosion: ((e: ExplosionInfo) => void) | null = null;
  /** 연결 영역 검사 요청 (x0,y0,x1,y1) */
  supportChecks: number[] = [];
  stats = { activeChunks: 0, cells: 0 };
  private bfsQueue: Int32Array;
  explosionCause = '폭발';

  constructor(W: number, H: number, seed = 1234) {
    this.W = W;
    this.H = H;
    this.CW = Math.ceil(W / CHUNK);
    this.CH = Math.ceil(H / CHUNK);
    const n = W * H;
    this.mat = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.temp = new Int16Array(n).fill(20);
    this.life = new Uint16Array(n);
    this.aux = new Uint8Array(n);
    this.charge = new Uint8Array(n);
    this.stamp = new Uint8Array(n);
    const nc = this.CW * this.CH;
    this.cur = new Int16Array(nc * 4);
    this.next = new Int16Array(nc * 4);
    this.chunkActive = new Uint8Array(nc);
    for (let c = 0; c < nc; c++) {
      for (const a of [this.cur, this.next]) {
        a[c * 4] = EMPTY_MIN;
        a[c * 4 + 1] = EMPTY_MIN;
        a[c * 4 + 2] = -1;
        a[c * 4 + 3] = -1;
      }
    }
    this.seed = (seed * 2654435761) >>> 0 || 1;
    this.particles = new Particles(6000);
    this.rigid = new RigidSystem();
    this.bfsQueue = new Int32Array(8000);
  }

  // ---------- RNG ----------
  rnd(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed;
  }
  rand01(): number {
    return this.rnd() / 4294967296;
  }

  // ---------- 기본 접근 ----------
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return M.BEDROCK;
    return this.mat[y * this.W + x];
  }
  isBlocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return true;
    return BLOCKS[this.mat[y * this.W + x]] === 1;
  }

  /** 셀 설정 (온도/수명 초기화, 깨우기) */
  set(x: number, y: number, m: number, keepTemp = false): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x;
    this.setIdx(i, x, y, m, keepTemp);
  }

  private setIdx(i: number, x: number, y: number, m: number, keepTemp: boolean): void {
    this.mat[i] = m;
    this.shade[i] = this.rnd() & 255;
    if (!keepTemp || IS_SOURCE[m]) {
      const t = TINIT[m];
      this.temp[i] = t === -32768 ? this.ambient : t;
    }
    this.life[i] = LIFE_RANGE[m] ? LIFE_MIN[m] + (this.rnd() % LIFE_RANGE[m]) : 0;
    this.aux[i] = 0;
    if (!CONDUCTIVE[m]) this.charge[i] = 0;
    this.stamp[i] = this.tag;
    this.wake(x, y);
    // 외부 변화: 주변 액체의 '정착' 카운터 리셋
    const W = this.W;
    if (x > 0 && CAT[this.mat[i - 1]] === Cat.LIQUID) this.life[i - 1] &= 0xff00;
    if (x < W - 1 && CAT[this.mat[i + 1]] === Cat.LIQUID) this.life[i + 1] &= 0xff00;
    if (y > 0 && CAT[this.mat[i - W]] === Cat.LIQUID) this.life[i - W] &= 0xff00;
  }

  /** 가연물 점화 */
  ignite(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.W + x;
    const m = this.mat[i];
    if (EXPLOSIVE[m]) {
      this.setIdx(i, x, y, M.EMPTY, false);
      this.explode(x, y, EXPLOSIVE[m], 4, this.explosionCause, 0);
      return;
    }
    if (FLAM[m] <= 0) return;
    const d = MATS[m];
    this.setIdx(i, x, y, M.FIRE, false);
    this.aux[i] = m;
    if (d.burnLife) this.life[i] = d.burnLife[0] + (this.rnd() % (d.burnLife[1] - d.burnLife[0] + 1));
  }

  // ---------- 더티 렉트 ----------
  wake(x: number, y: number): void {
    this.wakeRect(x - 1, y - 1, x + 1, y + 1);
  }

  wakeRect(x0: number, y0: number, x1: number, y1: number): void {
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= this.W) x1 = this.W - 1;
    if (y1 >= this.H) y1 = this.H - 1;
    if (x0 > x1 || y0 > y1) return;
    const cx0 = x0 >> CSHIFT;
    const cx1 = x1 >> CSHIFT;
    const cy0 = y0 >> CSHIFT;
    const cy1 = y1 >> CSHIFT;
    const nx = this.next;
    for (let cy = cy0; cy <= cy1; cy++) {
      const by0 = cy << CSHIFT;
      const by1 = by0 + CHUNK - 1;
      const ry0 = y0 > by0 ? y0 : by0;
      const ry1 = y1 < by1 ? y1 : by1;
      for (let cx = cx0; cx <= cx1; cx++) {
        const bx0 = cx << CSHIFT;
        const bx1 = bx0 + CHUNK - 1;
        const rx0 = x0 > bx0 ? x0 : bx0;
        const rx1 = x1 < bx1 ? x1 : bx1;
        const b = (cy * this.CW + cx) * 4;
        if (rx0 < nx[b]) nx[b] = rx0;
        if (ry0 < nx[b + 1]) nx[b + 1] = ry0;
        if (rx1 > nx[b + 2]) nx[b + 2] = rx1;
        if (ry1 > nx[b + 3]) nx[b + 3] = ry1;
      }
    }
  }

  /** 전체 월드를 깨운다 (생성 직후) */
  wakeAll(): void {
    this.wakeRect(0, 0, this.W - 1, this.H - 1);
  }

  setActiveRegion(x0: number, y0: number, x1: number, y1: number): void {
    this.simCX0 = Math.max(0, (x0 >> CSHIFT) - 1);
    this.simCY0 = Math.max(0, (y0 >> CSHIFT) - 1);
    this.simCX1 = Math.min(this.CW - 1, (x1 >> CSHIFT) + 1);
    this.simCY1 = Math.min(this.CH - 1, (y1 >> CSHIFT) + 1);
  }

  setFullActiveRegion(): void {
    this.simCX0 = 0;
    this.simCY0 = 0;
    this.simCX1 = this.CW - 1;
    this.simCY1 = this.CH - 1;
  }

  // ---------- 메인 스텝 ----------
  step(): void {
    this.frame++;
    this.tag = this.tag >= 255 ? 1 : this.tag + 1;
    const tmp = this.cur;
    this.cur = this.next;
    this.next = tmp;
    const nc = this.CW * this.CH;
    const cur = this.cur;
    const nx = this.next;
    for (let c = 0; c < nc; c++) {
      const b = c * 4;
      nx[b] = EMPTY_MIN;
      nx[b + 1] = EMPTY_MIN;
      nx[b + 2] = -1;
      nx[b + 3] = -1;
    }
    // 시뮬레이션 영역 밖 청크는 잠들되 더티 상태를 보존
    let active = 0;
    for (let cy = 0; cy < this.CH; cy++) {
      for (let cx = 0; cx < this.CW; cx++) {
        const c = cy * this.CW + cx;
        const b = c * 4;
        if (cur[b] > cur[b + 2]) {
          this.chunkActive[c] = 0;
          continue;
        }
        if (cx < this.simCX0 || cx > this.simCX1 || cy < this.simCY0 || cy > this.simCY1) {
          nx[b] = cur[b];
          nx[b + 1] = cur[b + 1];
          nx[b + 2] = cur[b + 2];
          nx[b + 3] = cur[b + 3];
          cur[b] = EMPTY_MIN;
          cur[b + 1] = EMPTY_MIN;
          cur[b + 2] = -1;
          cur[b + 3] = -1;
          this.chunkActive[c] = 0;
          continue;
        }
        this.chunkActive[c] = 1;
        active++;
      }
    }
    this.stats.activeChunks = active;
    let cells = 0;
    const ltr = (this.frame & 1) === 0;
    const CW = this.CW;
    for (let cy = this.CH - 1; cy >= 0; cy--) {
      let rowMin = EMPTY_MIN;
      let rowMax = -1;
      for (let cx = 0; cx < CW; cx++) {
        const b = (cy * CW + cx) * 4;
        if (cur[b] > cur[b + 2]) continue;
        if (cur[b + 1] < rowMin) rowMin = cur[b + 1];
        if (cur[b + 3] > rowMax) rowMax = cur[b + 3];
      }
      if (rowMax < 0) continue;
      for (let y = rowMax; y >= rowMin; y--) {
        for (let k = 0; k < CW; k++) {
          const cx = ltr ? k : CW - 1 - k;
          const b = (cy * CW + cx) * 4;
          const x0 = cur[b];
          const x1 = cur[b + 2];
          if (x0 > x1 || y < cur[b + 1] || y > cur[b + 3]) continue;
          cells += x1 - x0 + 1;
          if (ltr) {
            for (let x = x0; x <= x1; x++) this.updateCell(x, y);
          } else {
            for (let x = x1; x >= x0; x--) this.updateCell(x, y);
          }
        }
      }
    }
    this.stats.cells = cells;
    this.processExplosions();
    this.particles.update(this);
    this.rigid.update(this);
    if ((this.frame & 7) === 0 && this.supportChecks.length) this.rigid.checkSupport(this);
  }

  /** 테스트/로딩용: 전체 영역을 n 스텝 */
  run(n: number): void {
    for (let k = 0; k < n; k++) this.step();
  }

  private swap(i: number, j: number, x: number, y: number, x2: number, y2: number): void {
    const mat = this.mat;
    const a = mat[i];
    mat[i] = mat[j];
    mat[j] = a;
    const sh = this.shade;
    let t = sh[i];
    sh[i] = sh[j];
    sh[j] = t;
    const tp = this.temp;
    t = tp[i];
    tp[i] = tp[j];
    tp[j] = t;
    const lf = this.life;
    t = lf[i];
    lf[i] = lf[j];
    lf[j] = t;
    const ax = this.aux;
    t = ax[i];
    ax[i] = ax[j];
    ax[j] = t;
    const ch = this.charge;
    t = ch[i];
    ch[i] = ch[j];
    ch[j] = t;
    this.stamp[i] = this.tag;
    this.stamp[j] = this.tag;
    this.wake(x, y);
    this.wake(x2, y2);
  }

  private updateCell(x: number, y: number): void {
    const i = y * this.W + x;
    const m = this.mat[i];
    if (m === 0) return;
    if (this.stamp[i] === this.tag) return;
    this.stamp[i] = this.tag;
    if (IS_SOURCE[m]) this.temp[i] = HEAT[m];
    if (this.charge[i] > 0) this.updateCharge(x, y, i);
    if (REACTS[m] && this.react(x, y, i, m)) return;
    if (COND[m] > 0 && this.thermal(x, y, i, m)) return;
    switch (CAT[m]) {
      case Cat.POWDER:
        this.updatePowder(x, y, i, m);
        break;
      case Cat.LIQUID:
        this.updateLiquid(x, y, i, m);
        break;
      case Cat.GAS:
        this.updateGas(x, y, i, m);
        break;
      case Cat.ENERGY:
        this.updateEnergy(x, y, i, m);
        break;
      default:
        if (m === M.FUNGUS && (this.rnd() & 4095) === 0) {
          // 버섯은 가끔 포자(독가스)를 내뿜는다
          if (y > 0 && this.mat[i - this.W] === 0) this.setIdx(i - this.W, x, y - 1, M.TOXGAS, false);
        }
        break;
    }
  }

  private neighbor8(x: number, y: number, r: number): number {
    // 반환: 인덱스 또는 -1
    let nx = x;
    let ny = y;
    switch (r & 7) {
      case 0: nx--; break;
      case 1: nx++; break;
      case 2: ny--; break;
      case 3: ny++; break;
      case 4: nx--; ny--; break;
      case 5: nx++; ny--; break;
      case 6: nx--; ny++; break;
      default: nx++; ny++; break;
    }
    if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) return -1;
    return ny * this.W + nx;
  }

  private react(x: number, y: number, i: number, m: number): boolean {
    const j = this.neighbor8(x, y, this.rnd());
    if (j < 0) return false;
    const mb = this.mat[j];
    const idx = RX[m * NUM_MATS + mb];
    if (idx < 0) return false;
    const r = REACTIONS[idx];
    if (this.rand01() >= r.chance) {
      this.wakeCellOnly(x, y);
      return false;
    }
    const jx = j % this.W;
    const jy = (j - jx) / this.W;
    if (r.explode) {
      this.setIdx(j, jx, jy, M.EMPTY, false);
      this.explode(jx, jy, r.explode, 4, this.explosionCause, 0);
    } else if (r.toB === IGNITE) {
      this.ignite(jx, jy);
    } else if (r.toB !== KEEP) {
      this.setIdx(j, jx, jy, r.toB, true);
    }
    if (r.toA !== KEEP) {
      this.setIdx(i, x, y, r.toA, true);
      return true;
    }
    return false;
  }

  private wakeCellOnly(x: number, y: number): void {
    this.wakeRect(x, y, x, y);
  }

  private thermal(x: number, y: number, i: number, m: number): boolean {
    const temp = this.temp;
    let t = temp[i];
    const t0 = t;
    const src = IS_SOURCE[m];
    const r = this.rnd();
    let nxp = x;
    let nyp = y;
    switch (r & 3) {
      case 0: nxp--; break;
      case 1: nxp++; break;
      case 2: nyp--; break;
      default: nyp++; break;
    }
    if (nxp >= 0 && nyp >= 0 && nxp < this.W && nyp < this.H) {
      const j = nyp * this.W + nxp;
      const mj = this.mat[j];
      if (mj !== 0) {
        const cj = COND[mj];
        if (cj > 0) {
          const ci = COND[m];
          const k = ci < cj ? ci : cj;
          const tj = temp[j];
          const dd = ((tj - t) * k) >> 10;
          if (dd !== 0) {
            if (!src) t += dd;
            if (!IS_SOURCE[mj]) {
              temp[j] = tj - dd;
              this.wakeRect(nxp, nyp, nxp, nyp);
            }
          }
        }
      }
    }
    if (!src) {
      const d = this.ambient - t;
      if (d !== 0) {
        let s = (d / COOLDIV[m]) | 0;
        if (s === 0 && ((r >>> 8) & COOLMASK[m]) === 0) s = d > 0 ? 1 : -1;
        t += s;
        this.wakeCellOnly(x, y);
      }
      if (t !== t0) {
        temp[i] = t;
        if (t >= IGN[m]) {
          this.ignite(x, y);
          return true;
        }
        if (t >= MELT_AT[m]) {
          this.setIdx(i, x, y, MELT_INTO[m], true);
          return true;
        }
        if (t >= BOIL_AT[m]) {
          this.setIdx(i, x, y, BOIL_INTO[m], true);
          return true;
        }
        if (t <= FREEZE_AT[m]) {
          this.setIdx(i, x, y, FREEZE_INTO[m], true);
          return true;
        }
      }
    }
    return false;
  }

  private updateCharge(x: number, y: number, i: number): void {
    const c = this.charge[i];
    this.charge[i] = c - 1;
    this.wakeCellOnly(x, y);
    const j = this.neighbor8(x, y, this.rnd());
    if (j < 0) return;
    const mj = this.mat[j];
    if (mj === 0) return;
    if (EXPLOSIVE[mj] || (FLAM[mj] > 0 && this.rand01() < 0.15)) {
      const jx = j % this.W;
      this.ignite(jx, (j - jx) / this.W);
    } else if (CONDUCTIVE[mj] && this.charge[j] === 0 && c > 3) {
      this.charge[j] = c - 1;
      const jx = j % this.W;
      this.wakeRect(jx, (j - jx) / this.W, jx, (j - jx) / this.W);
    }
  }

  private canSink(m: number, o: number): boolean {
    return o === 0 || (IS_FLUIDISH[o] === 1 && DENS[o] < DENS[m]);
  }

  private updatePowder(x: number, y: number, i: number, m: number): void {
    const W = this.W;
    if (y + 1 >= this.H) return;
    const mat = this.mat;
    if (this.canSink(m, mat[i + W])) {
      let v = this.life[i] + 1;
      if (v > 4) v = 4;
      let cur = i;
      let cy = y;
      for (let s = 0; s < v; s++) {
        if (cy + 1 >= this.H) break;
        const nb = cur + W;
        const o = mat[nb];
        if (!this.canSink(m, o)) break;
        if (o !== 0 && this.rnd() & 1) break; // 액체 속에서는 천천히 가라앉음
        this.swap(cur, nb, x, cy, x, cy + 1);
        cur = nb;
        cy++;
      }
      this.life[cur] = v;
      return;
    }
    this.life[i] = 0;
    const dir = this.rnd() & 1 ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? dir : -dir;
      const nx = x + d;
      if (nx < 0 || nx >= W) continue;
      const j = i + W + d;
      if (this.canSink(m, mat[j]) && mat[i + d] !== M.BEDROCK) {
        this.swap(i, j, x, y, nx, y + 1);
        return;
      }
    }
  }

  private updateLiquid(x: number, y: number, i: number, m: number): void {
    const W = this.W;
    const mat = this.mat;
    const visc = VISC[m];
    if (visc > 0 && this.rand01() < visc) {
      this.wakeCellOnly(x, y);
      return;
    }
    if (y + 1 < this.H) {
      if (this.canSink(m, mat[i + W])) {
        let v = (this.life[i] >> 8) + 1;
        if (v > 3) v = 3;
        let cur = i;
        let cy = y;
        for (let s = 0; s < v; s++) {
          if (cy + 1 >= this.H) break;
          const nb = cur + W;
          if (!this.canSink(m, mat[nb])) break;
          this.swap(cur, nb, x, cy, x, cy + 1);
          cur = nb;
          cy++;
        }
        this.life[cur] = v << 8;
        return;
      }
      const dir = this.rnd() & 1 ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const d = k === 0 ? dir : -dir;
        const nx = x + d;
        if (nx < 0 || nx >= W) continue;
        if (this.canSink(m, mat[i + W + d])) {
          this.swap(i, i + W + d, x, y, nx, y + 1);
          this.life[i + W + d] = 0;
          return;
        }
      }
    }
    // 수평 확산. 너무 오래 수평으로만 떠돌면 잠든다(끝없는 진동 방지)
    const settle = this.life[i] & 255;
    if (settle > 90) return;
    const disp = DISP[m];
    const dir = this.rnd() & 1 ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? dir : -dir;
      let best = -1;
      for (let s = 1; s <= disp; s++) {
        const nx = x + d * s;
        if (nx < 0 || nx >= W) break;
        const o = mat[i + d * s];
        if (o === 0) {
          best = s;
          // 아래가 비었으면 그쪽으로 떨어지도록 거기서 멈춘다
          if (y + 1 < this.H && mat[i + d * s + W] === 0) break;
          continue;
        }
        if (s === 1 && IS_FLUIDISH[o] && DENS[o] < DENS[m] && CAT[o] !== Cat.LIQUID) best = 1;
        else if (s === 1 && CAT[o] === Cat.LIQUID && DENS[o] < DENS[m] && (this.rnd() & 3) === 0) best = 1;
        break;
      }
      if (best > 0) {
        const j = i + d * best;
        this.swap(i, j, x, y, x + d * best, y);
        this.life[j] = settle + 1;
        return;
      }
    }
  }

  private updateGas(x: number, y: number, i: number, m: number): void {
    let l = this.life[i];
    if (l > 0) {
      l--;
      this.life[i] = l;
      if (l === 0) {
        const into = this.rand01() < DECAY_CHANCE[m] ? DECAY_INTO[m] : M.EMPTY;
        this.setIdx(i, x, y, into, true);
        return;
      }
    }
    this.wakeCellOnly(x, y);
    const r = this.rnd();
    if (m === M.TOXGAS && (r & 3) !== 0) return;
    if ((r & 7) === 0) return;
    const W = this.W;
    const mat = this.mat;
    const dx = ((r >>> 4) % 3) - 1;
    const goUp = ((r >>> 8) & 3) !== 0;
    const ny = goUp ? y - 1 : y;
    const nx = x + (goUp ? dx : dx === 0 ? ((r >>> 12) & 1 ? 1 : -1) : dx);
    if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) return;
    const j = ny * W + nx;
    const o = mat[j];
    if (o === 0) {
      this.swap(i, j, x, y, nx, ny);
    } else if (CAT[o] === Cat.LIQUID && ny < y) {
      this.swap(i, j, x, y, nx, ny); // 기포처럼 액체를 뚫고 올라감
    } else if (CAT[o] === Cat.GAS && o !== m && ((r >>> 16) & 7) === 0) {
      this.swap(i, j, x, y, nx, ny);
    }
  }

  private updateEnergy(x: number, y: number, i: number, m: number): void {
    let l = this.life[i];
    if (l > 0) l--;
    this.life[i] = l;
    this.wakeCellOnly(x, y);
    const W = this.W;
    const mat = this.mat;
    if (l === 0) {
      if (m === M.FIRE) {
        const a = this.aux[i];
        let into: number = M.EMPTY;
        if (a !== 0) {
          into = BURN_INTO[a];
          if (into === M.ASH && this.rand01() < 0.4) into = M.EMPTY;
        } else if (this.rand01() < DECAY_CHANCE[m]) into = DECAY_INTO[m];
        this.setIdx(i, x, y, into, true);
      } else {
        this.setIdx(i, x, y, this.rand01() < DECAY_CHANCE[m] ? DECAY_INTO[m] : M.EMPTY, true);
      }
      return;
    }
    const r = this.rnd();
    if (m === M.FIRE) {
      const a = this.aux[i];
      if (y > 0 && (r & 63) === 0 && mat[i - W] === 0) {
        this.setIdx(i - W, x, y - 1, M.SMOKE, false);
      }
      // 주변 가연물 직접 가열 (열 확산 보조)
      if (a === 0) {
        // 자유 불꽃: 위로 일렁이며 올라감
        if ((r >>> 4 & 1) === 0 && y > 0) {
          const dx = ((r >>> 6) % 3) - 1;
          const nx = x + dx;
          if (nx >= 0 && nx < W && mat[i - W + dx] === 0) this.swap(i, i - W + dx, x, y, nx, y - 1);
        }
      } else if (CAT[a] === Cat.LIQUID || CAT[a] === Cat.POWDER) {
        // 불타는 기름/가루는 떨어짐
        if (y + 1 < this.H) {
          if (mat[i + W] === 0) this.swap(i, i + W, x, y, x, y + 1);
          else if (CAT[a] === Cat.LIQUID) {
            const d = (r >>> 4) & 1 ? 1 : -1;
            if (x + d >= 0 && x + d < W && mat[i + d] === 0 && (r >>> 5 & 3) === 0) this.swap(i, i + d, x, y, x + d, y);
          }
        }
      }
      return;
    }
    if (m === M.SPARK) {
      // 전도체 접촉 → 연결 영역 전체에 전류
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
        const j = ny * W + nx;
        if (CONDUCTIVE[mat[j]] && this.charge[j] === 0) this.conduct(nx, ny);
      }
      if ((r & 1) === 0) {
        const dx = ((r >>> 2) % 3) - 1;
        const dy = ((r >>> 5) % 3) - 1;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < this.H && mat[ny * W + nx] === 0) this.swap(i, ny * W + nx, x, y, nx, ny);
      }
      return;
    }
    if (m === M.FROST) {
      // 냉기는 무겁게 가라앉으며 퍼짐
      if ((r & 3) !== 0) {
        const dx = ((r >>> 2) % 3) - 1;
        const dy = ((r >>> 5) & 3) === 0 ? 0 : 1;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < this.H && mat[ny * W + nx] === 0) this.swap(i, ny * W + nx, x, y, nx, ny);
      }
    }
  }

  /** 전도체 연결 영역 전체에 전류를 흘린다. 반환: 대전된 셀 수 */
  conduct(x: number, y: number, maxCells = 6000): number {
    if (!this.inBounds(x, y)) return 0;
    const W = this.W;
    const start = y * W + x;
    if (!CONDUCTIVE[this.mat[start]]) return 0;
    const q = this.bfsQueue.length >= maxCells ? this.bfsQueue : (this.bfsQueue = new Int32Array(maxCells));
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    this.charge[start] = CHARGE_TIME;
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    while (head < tail) {
      const c = q[head++];
      const cx = c % W;
      const cy = (c - cx) / W;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = cy + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
        const j = ny * W + nx;
        if (this.charge[j] === 0 && CONDUCTIVE[this.mat[j]] && tail < maxCells) {
          this.charge[j] = CHARGE_TIME;
          q[tail++] = j;
        }
      }
    }
    this.wakeRect(minX - 1, minY - 1, maxX + 1, maxY + 1);
    return tail;
  }

  // ---------- 폭발 ----------
  explode(x: number, y: number, r: number, power: number, cause: string, delay = 0): void {
    for (const e of this.explosions) {
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < (e.r * e.r) / 4 && e.r >= r) return;
    }
    if (this.explosions.length > 200) return;
    this.explosions.push({ x, y, r, power, cause, delay });
  }

  private processExplosions(): void {
    let n = 0;
    const keep: PendingExplosion[] = [];
    const list = this.explosions;
    this.explosions = [];
    for (const e of list) {
      if (e.delay > 0 || n >= 6) {
        if (e.delay > 0) e.delay--;
        keep.push(e);
        continue;
      }
      n++;
      this.doExplosion(e);
    }
    this.explosions.push(...keep);
  }

  pendingExplosions(): number {
    return this.explosions.length;
  }

  private doExplosion(e: ExplosionInfo): void {
    const { x, y, r, power } = e;
    const r2 = r * r;
    const W = this.W;
    const prevCause = this.explosionCause;
    this.explosionCause = e.cause;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
        const i = ny * W + nx;
        const m = this.mat[i];
        if (d2 > r2 * 0.7 && (this.rnd() & 1)) continue;
        if (m === 0) {
          if (d2 < r2 * 0.5 && (this.rnd() & 3) === 0) {
            this.setIdx(i, nx, ny, M.FIRE, false);
            this.life[i] = 4 + (this.rnd() & 15);
          }
          continue;
        }
        if (HARD[m] > power * 2) {
          this.temp[i] = Math.min(2000, this.temp[i] + 200);
          this.wake(nx, ny);
          continue;
        }
        if (EXPLOSIVE[m]) {
          // 연쇄: 화약/독가스는 불씨가 되어 이웃을 터뜨린다
          this.setIdx(i, nx, ny, M.FIRE, false);
          this.life[i] = 3 + (this.rnd() & 7);
          continue;
        }
        const c = CAT[m];
        if (c === Cat.GAS || c === Cat.ENERGY) {
          this.setIdx(i, nx, ny, M.EMPTY, false);
          continue;
        }
        const chance = c === Cat.LIQUID ? 0.45 : 0.18;
        if (this.rand01() < chance) {
          const d = Math.sqrt(d2) + 0.5;
          const sp = (1.3 - d / r) * (2.2 + power * 0.25) * (0.6 + this.rand01() * 0.8);
          const outM = MATS[m].digInto ?? m;
          this.particles.spawnMat(nx, ny, (dx / d) * sp, (dy / d) * sp - 1.2, outM, this.shade[i], this.temp[i] + (c === Cat.LIQUID ? 0 : 120));
        } else if (MATS[m].digInto !== undefined) {
          this.setIdx(i, nx, ny, MATS[m].digInto!, false);
          continue;
        }
        this.setIdx(i, nx, ny, M.EMPTY, false);
      }
    }
    this.explosionCause = prevCause;
    this.wakeRect(x - r - 2, y - r - 2, x + r + 2, y + r + 2);
    this.requestSupportCheck(x - r - 2, y - r - 2, x + r + 2, y + r + 2);
    if (this.onExplosion) this.onExplosion(e);
  }

  requestSupportCheck(x0: number, y0: number, x1: number, y1: number): void {
    if (this.supportChecks.length > 64) return;
    this.supportChecks.push(x0, y0, x1, y1);
  }

  // ---------- 게임용 유틸 ----------
  /** mode: 'empty' 빈칸에만, 'fluid' 빈칸+유체 덮어쓰기, 'all' 기반암 제외 전부 */
  fillCircle(cx: number, cy: number, r: number, m: number, mode: 'empty' | 'fluid' | 'all' = 'empty', chance = 1): number {
    let n = 0;
    const r2 = r * r + r * 0.6;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        if (chance < 1 && this.rand01() > chance) continue;
        const o = this.mat[y * this.W + x];
        if (o === M.BEDROCK) continue;
        if (mode === 'empty' && o !== 0) continue;
        if (mode === 'fluid' && o !== 0 && !IS_FLUIDISH[o]) continue;
        this.set(x, y, m);
        n++;
      }
    }
    return n;
  }

  /** 지형 굴착. maxHard 이하 경도만 파괴. 반환: 파괴한 셀 수 */
  dig(cx: number, cy: number, r: number, maxHard: number, debris = 0.08): number {
    let n = 0;
    const r2 = r * r + r * 0.6;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const i = y * this.W + x;
        const o = this.mat[i];
        if (o === 0 || IS_FLUIDISH[o] || HARD[o] > maxHard) continue;
        const into = MATS[o].digInto;
        if (into !== undefined) {
          this.setIdx(i, x, y, into, false);
          continue;
        }
        if (this.rand01() < debris) {
          this.particles.spawnMat(x, y, (this.rand01() - 0.5) * 2, -this.rand01() * 1.5, o, this.shade[i], this.temp[i]);
        }
        this.setIdx(i, x, y, M.EMPTY, false);
        n++;
      }
    }
    if (n > 0) this.requestSupportCheck(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
    return n;
  }

  heatArea(cx: number, cy: number, r: number, amount: number): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const i = y * this.W + x;
        if (this.mat[i] === 0) continue;
        this.temp[i] = Math.max(-200, Math.min(3000, this.temp[i] + amount));
        this.wake(x, y);
      }
    }
  }

  countMat(m: number, x0 = 0, y0 = 0, x1 = this.W - 1, y1 = this.H - 1): number {
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.mat[y * this.W + x] === m) n++;
    return n;
  }

  /** 월드 전체 리셋 */
  clear(): void {
    this.mat.fill(0);
    this.temp.fill(this.ambient);
    this.life.fill(0);
    this.aux.fill(0);
    this.charge.fill(0);
    this.explosions.length = 0;
    this.particles.clear();
    this.rigid.clear();
    this.supportChecks.length = 0;
    this.wakeAll();
  }

  /** 테두리를 기반암으로 */
  frameBedrock(): void {
    for (let x = 0; x < this.W; x++) {
      this.set(x, 0, M.BEDROCK);
      this.set(x, this.H - 1, M.BEDROCK);
    }
    for (let y = 0; y < this.H; y++) {
      this.set(0, y, M.BEDROCK);
      this.set(this.W - 1, y, M.BEDROCK);
    }
  }
}
