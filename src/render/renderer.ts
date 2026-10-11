// 픽셀 렌더러: 시뮬레이션 버퍼를 ImageData(Uint32 뷰)에 직접 쓰고, 라이트맵을 곱해 정수 배율로 확대한다.
import type { World } from '../sim/world';
import {
  M, COLOR_TABLE, EMISSIVE, LIGHT_R, LIGHT_G, LIGHT_B, NUM_MATS,
} from '../sim/materials';
import type { Sprite } from './sprites';

export const VIEW_W = 400;
export const VIEW_H = 225;
const LS = 4; // 라이트맵 축소 배율
export const LW = Math.ceil(VIEW_W / LS) + 1;
export const LH = Math.ceil(VIEW_H / LS) + 1;

export function abgr(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
export function hexAbgr(rgb: number): number {
  return abgr((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
}

export interface ParallaxLayer {
  w: number;
  h: number;
  data: Uint32Array; // 0 = 투명
  factor: number;
}

export interface BgTheme {
  layers: ParallaxLayer[];
  top: number; // rgb
  bottom: number; // rgb
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly off: HTMLCanvasElement;
  readonly octx: CanvasRenderingContext2D;
  readonly image: ImageData;
  readonly buf: Uint32Array;
  scale = 2;
  // 라이트맵
  readonly lr = new Float32Array(LW * LH);
  readonly lg = new Float32Array(LW * LH);
  readonly lb = new Float32Array(LW * LH);
  private tr = new Float32Array(LW * LH);
  private tg = new Float32Array(LW * LH);
  private tb = new Float32Array(LW * LH);
  camX = 0;
  camY = 0;
  flash = 0; // 0..1 화면 섬광
  flashColor: [number, number, number] = [1, 1, 1];
  showChunks = false;
  private bgCache: Uint32Array = new Uint32Array(VIEW_W * VIEW_H);
  private matAnim = new Uint8Array(NUM_MATS);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다');
    this.ctx = ctx;
    this.off = document.createElement('canvas');
    this.off.width = VIEW_W;
    this.off.height = VIEW_H;
    const octx = this.off.getContext('2d');
    if (!octx) throw new Error('2D 컨텍스트를 만들 수 없습니다');
    this.octx = octx;
    this.image = octx.createImageData(VIEW_W, VIEW_H);
    this.buf = new Uint32Array(this.image.data.buffer);
    for (const m of [M.WATER, M.FIRE, M.LAVA, M.SPARK, M.ACID, M.POISON, M.GOLD_LIQ, M.FROST, M.CRYSTAL, M.FUNGUS, M.GOLD, M.GOLD_DUST, M.OIL]) this.matAnim[m] = 1;
    this.resize();
  }

  resize(): void {
    // 화면에 꽉 맞게(비정수 배율 허용) 표시하고, 내부 해상도는 정수 배율로 유지해 픽셀을 선명하게
    const fit = Math.max(0.25, Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H));
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.min(6, Math.round(fit * dpr)));
    this.scale = s;
    this.canvas.width = VIEW_W * s;
    this.canvas.height = VIEW_H * s;
    this.canvas.style.width = `${Math.floor(VIEW_W * fit)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * fit)}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 시차 배경 + 월드 셀 렌더 */
  renderWorld(w: World, bg: BgTheme, time: number): void {
    const buf = this.buf;
    const cx = Math.floor(this.camX);
    const cy = Math.floor(this.camY);
    this.renderBackground(bg, cx, cy);
    const bgc = this.bgCache;
    const W = w.W;
    const mat = w.mat;
    const shade = w.shade;
    const temp = w.temp;
    const charge = w.charge;
    const anim = this.matAnim;
    const t = time;
    const tf = Math.floor(t / 3);
    for (let sy = 0; sy < VIEW_H; sy++) {
      const wy = cy + sy;
      const row = sy * VIEW_W;
      if (wy < 0 || wy >= w.H) {
        for (let sx = 0; sx < VIEW_W; sx++) buf[row + sx] = 0xff000000;
        continue;
      }
      const wrow = wy * W;
      for (let sx = 0; sx < VIEW_W; sx++) {
        const wx = cx + sx;
        if (wx < 0 || wx >= W) {
          buf[row + sx] = 0xff000000;
          continue;
        }
        const i = wrow + wx;
        const m = mat[i];
        if (m === 0) {
          buf[row + sx] = bgc[row + sx];
          continue;
        }
        let s = shade[i];
        if (anim[m]) s = animShade(m, s, wx, wy, t, tf);
        let c = COLOR_TABLE[(m << 8) + s];
        if (charge[i] > 0) {
          c = (charge[i] + tf) & 1 ? 0xffffffe0 : 0xfffff0a0;
        } else {
          const tp = temp[i];
          if (tp > 350 && m !== M.FIRE && m !== M.LAVA && m !== M.GOLD_LIQ) c = heatTint(c, tp);
          else if (tp < -30 && m !== M.FROST && m !== M.ICE) c = coldTint(c);
        }
        buf[row + sx] = c;
      }
    }
    // 낙하 중인 강체
    for (const b of w.rigid.bodies) {
      for (let by = 0; by < b.h; by++) {
        const sy = b.y + by - cy;
        if (sy < 0 || sy >= VIEW_H) continue;
        for (let bx = 0; bx < b.w; bx++) {
          const m = b.mats[by * b.w + bx];
          if (!m) continue;
          const sx = b.x + bx - cx;
          if (sx < 0 || sx >= VIEW_W) continue;
          buf[sy * VIEW_W + sx] = COLOR_TABLE[(m << 8) + b.shades[by * b.w + bx]];
        }
      }
    }
  }

  private renderBackground(bg: BgTheme, cx: number, cy: number): void {
    const out = this.bgCache;
    const top = bg.top;
    const bot = bg.bottom;
    const layers = bg.layers;
    for (let sy = 0; sy < VIEW_H; sy++) {
      const f = sy / VIEW_H;
      const r = (((top >> 16) & 255) * (1 - f) + ((bot >> 16) & 255) * f) | 0;
      const g = (((top >> 8) & 255) * (1 - f) + ((bot >> 8) & 255) * f) | 0;
      const b = ((top & 255) * (1 - f) + (bot & 255) * f) | 0;
      const base = abgr(r, g, b);
      const row = sy * VIEW_W;
      for (let sx = 0; sx < VIEW_W; sx++) out[row + sx] = base;
      for (let li = layers.length - 1; li >= 0; li--) {
        const L = layers[li];
        const ly = ((Math.floor(cy * L.factor) + sy) % L.h + L.h) % L.h;
        const lrow = ly * L.w;
        const ox = Math.floor(cx * L.factor);
        for (let sx = 0; sx < VIEW_W; sx++) {
          const lx = ((ox + sx) % L.w + L.w) % L.w;
          const c = L.data[lrow + lx];
          if (c !== 0) out[row + sx] = c;
        }
      }
    }
  }

  // ---------- 스프라이트/프리미티브 (월드 좌표) ----------
  plot(wx: number, wy: number, c: number): void {
    const sx = Math.floor(wx - Math.floor(this.camX));
    const sy = Math.floor(wy - Math.floor(this.camY));
    if (sx < 0 || sy < 0 || sx >= VIEW_W || sy >= VIEW_H) return;
    this.buf[sy * VIEW_W + sx] = c;
  }

  plotBlend(wx: number, wy: number, c: number, a: number): void {
    const sx = Math.floor(wx - Math.floor(this.camX));
    const sy = Math.floor(wy - Math.floor(this.camY));
    if (sx < 0 || sy < 0 || sx >= VIEW_W || sy >= VIEW_H) return;
    const i = sy * VIEW_W + sx;
    const d = this.buf[i];
    const ia = 1 - a;
    const r = ((d & 255) * ia + (c & 255) * a) | 0;
    const g = (((d >> 8) & 255) * ia + ((c >> 8) & 255) * a) | 0;
    const b = (((d >> 16) & 255) * ia + ((c >> 16) & 255) * a) | 0;
    this.buf[i] = abgr(r, g, b);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: number, alpha = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (dx * k) / n;
      const y = y0 + (dy * k) / n;
      if (alpha >= 1) this.plot(x, y, c);
      else this.plotBlend(x, y, c, alpha);
    }
  }

  rectFill(wx: number, wy: number, w: number, h: number, c: number, alpha = 1): void {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (alpha >= 1) this.plot(wx + x, wy + y, c);
      else this.plotBlend(wx + x, wy + y, c, alpha);
    }
  }

  circle(cx: number, cy: number, r: number, c: number, alpha = 1, fill = false): void {
    if (fill) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) {
          if (alpha >= 1) this.plot(cx + x, cy + y, c);
          else this.plotBlend(cx + x, cy + y, c, alpha);
        }
      }
      return;
    }
    const n = Math.max(8, Math.ceil(r * 6.3));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (alpha >= 1) this.plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
      else this.plotBlend(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c, alpha);
    }
  }

  /** 스프라이트 그리기. tint: 0이면 없음, 아니면 해당 색으로 덮음(alpha) */
  sprite(s: Sprite, wx: number, wy: number, flip = false, tint = 0, tintA = 0): void {
    const ox = Math.floor(wx) - Math.floor(this.camX);
    const oy = Math.floor(wy) - Math.floor(this.camY);
    const buf = this.buf;
    for (let y = 0; y < s.h; y++) {
      const sy = oy + y;
      if (sy < 0 || sy >= VIEW_H) continue;
      for (let x = 0; x < s.w; x++) {
        const sx = ox + x;
        if (sx < 0 || sx >= VIEW_W) continue;
        let c = s.data[y * s.w + (flip ? s.w - 1 - x : x)];
        if (c === 0) continue;
        if (tintA > 0) c = mix(c, tint, tintA);
        buf[sy * VIEW_W + sx] = c;
      }
    }
  }

  // ---------- 조명 ----------
  beginLights(ambient: number, ar = 1, ag = 1, ab = 1): void {
    this.lr.fill(ambient * ar);
    this.lg.fill(ambient * ag);
    this.lb.fill(ambient * ab);
  }

  /** 화면 내 발광 셀을 라이트맵에 누적 */
  accumulateEmissive(w: World): void {
    const cx = Math.floor(this.camX);
    const cy = Math.floor(this.camY);
    const W = w.W;
    const mat = w.mat;
    const charge = w.charge;
    const tr = this.tr;
    const tg = this.tg;
    const tb = this.tb;
    tr.fill(0);
    tg.fill(0);
    tb.fill(0);
    for (let sy = 0; sy < VIEW_H; sy++) {
      const wy = cy + sy;
      if (wy < 0 || wy >= w.H) continue;
      const lrow = (sy >> 2) * LW;
      const wrow = wy * W;
      for (let sx = 0; sx < VIEW_W; sx++) {
        const wx = cx + sx;
        if (wx < 0 || wx >= W) continue;
        const i = wrow + wx;
        const m = mat[i];
        if (charge[i] > 0) {
          const li = lrow + (sx >> 2);
          tr[li] += 0.18;
          tg[li] += 0.22;
          tb[li] += 0.3;
          continue;
        }
        if (!EMISSIVE[m]) continue;
        const li = lrow + (sx >> 2);
        tr[li] += LIGHT_R[m] * 0.11;
        tg[li] += LIGHT_G[m] * 0.11;
        tb[li] += LIGHT_B[m] * 0.11;
      }
    }
    // 넓게 번지도록 블러 (분리형 박스 블러 x3)
    for (let p = 0; p < 3; p++) {
      blur(tr, LW, LH, 3);
      blur(tg, LW, LH, 3);
      blur(tb, LW, LH, 3);
    }
    const lr = this.lr;
    const lg = this.lg;
    const lb = this.lb;
    for (let k = 0; k < LW * LH; k++) {
      lr[k] += tr[k] * 9;
      lg[k] += tg[k] * 9;
      lb[k] += tb[k] * 9;
    }
  }

  /** 점광원 (월드 좌표) */
  addLight(wx: number, wy: number, radius: number, r: number, g: number, b: number): void {
    const lx = (wx - Math.floor(this.camX)) / LS;
    const ly = (wy - Math.floor(this.camY)) / LS;
    const lrad = radius / LS;
    if (lx < -lrad || ly < -lrad || lx > LW + lrad || ly > LH + lrad) return;
    const x0 = Math.max(0, Math.floor(lx - lrad));
    const x1 = Math.min(LW - 1, Math.ceil(lx + lrad));
    const y0 = Math.max(0, Math.floor(ly - lrad));
    const y1 = Math.min(LH - 1, Math.ceil(ly + lrad));
    const inv = 1 / (lrad * lrad);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - lx;
        const dy = y - ly;
        const d = (dx * dx + dy * dy) * inv;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d);
        const k = y * LW + x;
        this.lr[k] += r * f;
        this.lg[k] += g * f;
        this.lb[k] += b * f;
      }
    }
  }

  /** 라이트맵을 픽셀에 곱한다 (쌍선형 보간) */
  applyLighting(): void {
    const buf = this.buf;
    const lr = this.lr;
    const lg = this.lg;
    const lb = this.lb;
    for (let sy = 0; sy < VIEW_H; sy++) {
      const fy = sy / LS;
      const y0 = fy | 0;
      const ty = fy - y0;
      const r0 = y0 * LW;
      const r1 = Math.min(LH - 1, y0 + 1) * LW;
      const row = sy * VIEW_W;
      for (let sx = 0; sx < VIEW_W; sx++) {
        const fx = sx / LS;
        const x0 = fx | 0;
        const tx = fx - x0;
        const a = r0 + x0;
        const b = r0 + x0 + 1;
        const c = r1 + x0;
        const d = r1 + x0 + 1;
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        let R = lr[a] * w00 + lr[b] * w10 + lr[c] * w01 + lr[d] * w11;
        let G = lg[a] * w00 + lg[b] * w10 + lg[c] * w01 + lg[d] * w11;
        let B = lb[a] * w00 + lb[b] * w10 + lb[c] * w01 + lb[d] * w11;
        if (R > 1.8) R = 1.8;
        if (G > 1.8) G = 1.8;
        if (B > 1.8) B = 1.8;
        const p = buf[row + sx];
        let pr = ((p & 255) * R) | 0;
        let pg = (((p >> 8) & 255) * G) | 0;
        let pb = (((p >> 16) & 255) * B) | 0;
        if (pr > 255) pr = 255;
        if (pg > 255) pg = 255;
        if (pb > 255) pb = 255;
        buf[row + sx] = (0xff000000 | (pb << 16) | (pg << 8) | pr) >>> 0;
      }
    }
  }

  /** 조명 무시 오버레이 (UI 성격의 월드 표시용: 조준선 등) — applyLighting 이후 호출 */
  postFlash(): void {
    if (this.flash <= 0.01) return;
    const a = Math.min(1, this.flash);
    const fr = (this.flashColor[0] * 255) | 0;
    const fg = (this.flashColor[1] * 255) | 0;
    const fb = (this.flashColor[2] * 255) | 0;
    const buf = this.buf;
    const ia = 1 - a;
    for (let k = 0; k < buf.length; k++) {
      const p = buf[k];
      const r = ((p & 255) * ia + fr * a) | 0;
      const g = (((p >> 8) & 255) * ia + fg * a) | 0;
      const b = (((p >> 16) & 255) * ia + fb * a) | 0;
      buf[k] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  drawChunkGrid(w: World): void {
    const cx = Math.floor(this.camX);
    const cy = Math.floor(this.camY);
    for (let c = 0; c < w.CW * w.CH; c++) {
      const gx = (c % w.CW) * 64 - cx;
      const gy = Math.floor(c / w.CW) * 64 - cy;
      const col = w.chunkActive[c] ? 0xff30ff30 : 0xff3030a0;
      for (let k = 0; k < 64; k++) {
        this.screenPlot(gx + k, gy, col);
        this.screenPlot(gx, gy + k, col);
      }
    }
  }

  screenPlot(sx: number, sy: number, c: number): void {
    if (sx < 0 || sy < 0 || sx >= VIEW_W || sy >= VIEW_H) return;
    this.buf[sy * VIEW_W + sx] = c;
  }

  /** 버퍼를 화면에 확대 출력. shakeX/Y 는 화면 픽셀 단위 흔들림 */
  present(shakeX = 0, shakeY = 0): void {
    this.octx.putImageData(this.image, 0, 0);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale;
    ctx.drawImage(this.off, Math.round(shakeX * s), Math.round(shakeY * s), VIEW_W * s, VIEW_H * s);
  }

  /** UI 그리기용 변환 (400x225 좌표계) */
  uiBegin(): CanvasRenderingContext2D {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }
}

function blur(a: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(Math.max(w, h));
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[x] = acc * inv;
      acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
    for (let x = 0; x < w; x++) a[row + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += a[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = acc * inv;
      acc += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
    }
    for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
  }
}

export function mix(c: number, t: number, a: number): number {
  const ia = 1 - a;
  const r = ((c & 255) * ia + (t & 255) * a) | 0;
  const g = (((c >> 8) & 255) * ia + ((t >> 8) & 255) * a) | 0;
  const b = (((c >> 16) & 255) * ia + ((t >> 16) & 255) * a) | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function heatTint(c: number, tp: number): number {
  const a = Math.min(0.75, (tp - 350) / 900);
  return mix(c, 0xff2060ff, a);
}

function coldTint(c: number): number {
  return mix(c, 0xfff0d0a0, 0.35);
}

/** 재질 애니메이션: 물결, 불 깜빡임, 용암 꿈틀거림, 전기 번쩍임 */
function animShade(m: number, s: number, x: number, y: number, t: number, tf: number): number {
  switch (m) {
    case M.WATER:
    case M.ACID:
    case M.POISON:
    case M.OIL: {
      const wv = Math.sin(x * 0.35 + y * 0.12 + t * 0.003 * 60) + Math.sin(x * 0.13 - t * 0.0021 * 60);
      return (s & 0x0f) | (((wv + 2) * 28) & 0x70);
    }
    case M.FIRE:
      return (s + tf * 37 + ((x * 7) ^ (y * 13))) & 255;
    case M.LAVA:
    case M.GOLD_LIQ: {
      const n = Math.sin(x * 0.21 + t * 0.05) * Math.cos(y * 0.27 - t * 0.04) + Math.sin((x + y) * 0.09 + t * 0.03);
      return ((n + 2) * 50 + (s & 7)) & 255;
    }
    case M.SPARK:
      return (s + tf * 91) & 255;
    case M.FROST:
      return (s + tf * 11) & 255;
    case M.CRYSTAL:
    case M.FUNGUS: {
      const n = Math.sin(x * 0.2 + y * 0.15 + t * 0.03);
      return (s & 0x8f) | (((n + 1) * 2.5) | 0) << 4;
    }
    case M.GOLD:
    case M.GOLD_DUST:
      return ((s * 7 + tf * 3 + x) & 63) === 0 ? 3 : s;
    default:
      return s;
  }
}
