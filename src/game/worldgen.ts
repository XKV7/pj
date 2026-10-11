// 절차적 월드 생성: 노이즈 동굴 + 미리 설계한 방 조각 + 구역별 재질 배치. 성소/보스방/타이틀 데모 장면.
import { World } from '../sim/world';
import { M, BLOCKS, CAT, Cat } from '../sim/materials';
import { Rng, fbm, valueNoise } from './noise';
import { Item } from './items';
import { randomCard, randomWand, wandValue, card, type Wand } from './spells';
import type { EnemyKind } from './enemies';
import { abgr, type BgTheme, type ParallaxLayer } from '../render/renderer';

export const ZONE_W = 512;
export const ZONE_H = 768;

export interface ZoneDef {
  name: string;
  sub: string;
  ambient: number;
  light: number;
  tint: [number, number, number];
  base: number;
  alt: number;
  bgTop: number;
  bgBottom: number;
  bgColors: [number, number, number];
  enemies: [EnemyKind, number][];
  enemyCount: number;
}

export const ZONES: ZoneDef[] = [
  {
    name: '제1구역: 뿌리 동굴', sub: '흙과 나무뿌리, 물과 기름 웅덩이', ambient: 18, light: 0.3, tint: [1, 0.95, 0.85], base: M.DIRT, alt: M.STONE,
    bgTop: 0x14100c, bgBottom: 0x0a0806, bgColors: [0x1e1712, 0x2a2018, 0x3a2c20],
    enemies: [['slime', 5], ['bat', 2], ['bomber', 2], ['mage', 1], ['worm', 1]], enemyCount: 20,
  },
  {
    name: '제2구역: 얼음 동굴', sub: '얼음과 냉기, 미끄러운 바닥', ambient: -12, light: 0.32, tint: [0.8, 0.92, 1.15], base: M.STONE, alt: M.ICE,
    bgTop: 0x0a1220, bgBottom: 0x060a12, bgColors: [0x101c2c, 0x18283c, 0x24384e],
    enemies: [['spirit', 5], ['slime', 2], ['mage', 2], ['worm', 1], ['bat', 1]], enemyCount: 22,
  },
  {
    name: '제3구역: 독의 늪', sub: '독액, 독가스, 빛나는 버섯', ambient: 24, light: 0.26, tint: [0.85, 1.05, 0.8], base: M.DIRT, alt: M.STONE,
    bgTop: 0x0c140c, bgBottom: 0x060a06, bgColors: [0x122014, 0x1a2c1c, 0x243a26],
    enemies: [['slime', 5], ['mage', 2], ['spirit', 1], ['bomber', 2], ['worm', 2]], enemyCount: 24,
  },
  {
    name: '제4구역: 화약 광산', sub: '화약층과 나무 지지대 — 연쇄 폭발 주의', ambient: 22, light: 0.28, tint: [1.05, 0.95, 0.8], base: M.STONE, alt: M.DIRT,
    bgTop: 0x16100a, bgBottom: 0x0a0704, bgColors: [0x221810, 0x302216, 0x40301e],
    enemies: [['bomber', 5], ['golem', 2], ['mage', 2], ['worm', 2], ['bat', 1]], enemyCount: 24,
  },
  {
    name: '제5구역: 용암 심층', sub: '용암의 강, 금속 광맥, 타오르는 열기', ambient: 45, light: 0.28, tint: [1.15, 0.85, 0.75], base: M.STONE, alt: M.METAL,
    bgTop: 0x1c0806, bgBottom: 0x0c0403, bgColors: [0x2a0e0a, 0x3a140e, 0x4e1c12],
    enemies: [['bat', 4], ['golem', 3], ['mage', 2], ['bomber', 1], ['spirit', 1]], enemyCount: 26,
  },
];

export const BOSS_ZONE: ZoneDef = {
  name: '최종: 연금 심장', sub: '심연의 가장 깊은 곳', ambient: 25, light: 0.34, tint: [1, 0.9, 1.1], base: M.STONE, alt: M.CRYSTAL,
  bgTop: 0x140a1c, bgBottom: 0x08040c, bgColors: [0x1e1028, 0x2a1838, 0x3a2250],
  enemies: [], enemyCount: 0,
};

export const SANCTUARY_ZONE: ZoneDef = {
  name: '성소', sub: '안전한 휴식처', ambient: 20, light: 0.55, tint: [1, 0.95, 0.9], base: M.STONE, alt: M.CRYSTAL,
  bgTop: 0x16121c, bgBottom: 0x0c0a10, bgColors: [0x221c2a, 0x2c2436, 0x3a3046],
  enemies: [], enemyCount: 0,
};

export interface Level {
  world: World;
  zone: ZoneDef;
  spawnX: number;
  spawnY: number;
  items: Item[];
  enemies: { kind: EnemyKind; x: number; y: number }[];
  bg: BgTheme;
  kind: 'zone' | 'sanctuary' | 'boss' | 'demo';
  index: number;
  bossX: number;
  bossY: number;
}

// ---------- 배경 ----------
export function makeBg(z: ZoneDef, seed: number): BgTheme {
  const layers: ParallaxLayer[] = [];
  const factors = [0.15, 0.3, 0.5];
  for (let li = 0; li < 3; li++) {
    const w = 512;
    const h = 320;
    const data = new Uint32Array(w * h);
    const col = z.bgColors[li];
    const s = seed + li * 77;
    const period = 8 + li * 4;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * period;
      const top = 40 + fbm(u, 0.5, s, 3, period) * 120 - li * 10;
      const bot = h - 40 - fbm(u, 3.5, s + 9, 3, period) * 120 + li * 10;
      const spike = valueNoise(u * 4, 7, s + 3, period * 4);
      for (let y = 0; y < h; y++) {
        const yy = y;
        const t = spike > 0.7 ? (spike - 0.7) * 160 : 0;
        if (yy < top + t || yy > bot - t * 0.6) {
          const shade = valueNoise(x * 0.08, y * 0.08, s + 5) * 0.3 + 0.85;
          const r = Math.min(255, ((col >> 16) & 255) * shade);
          const g = Math.min(255, ((col >> 8) & 255) * shade);
          const b = Math.min(255, (col & 255) * shade);
          data[y * w + x] = abgr(r, g, b);
        }
      }
    }
    layers.push({ w, h, data, factor: factors[li] });
  }
  return { layers: layers.reverse(), top: z.bgTop, bottom: z.bgBottom };
}

// ---------- 공통 도구 ----------
function carveCircle(w: World, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const x = cx + dx;
    const y = cy + dy;
    if (x < 3 || y < 3 || x >= w.W - 3 || y >= w.H - 3) continue;
    w.setRaw(x, y, M.EMPTY);
  }
}

function fillRect(w: World, x0: number, y0: number, ww: number, hh: number, m: number): void {
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) {
    if (x < 2 || y < 2 || x >= w.W - 2 || y >= w.H - 2) continue;
    w.setRaw(x, y, m);
  }
}

function blob(w: World, rng: Rng, cx: number, cy: number, r: number, m: number, onlySolid: boolean): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy) + rng.next() * 1.2;
    if (d > r) continue;
    const x = cx + dx;
    const y = cy + dy;
    if (x < 3 || y < 3 || x >= w.W - 3 || y >= w.H - 3) continue;
    const o = w.mat[y * w.W + x];
    if (onlySolid && (CAT[o] !== Cat.SOLID || o === M.BEDROCK)) continue;
    w.setRaw(x, y, m);
  }
}

function frame(w: World, t = 3): void {
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    if (x < t || y < t || x >= w.W - t || y >= w.H - t) w.setRaw(x, y, M.BEDROCK);
  }
}

function isEmptyRect(w: World, x0: number, y0: number, ww: number, hh: number): boolean {
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) {
    if (!w.inBounds(x, y) || w.mat[y * w.W + x] !== M.EMPTY) return false;
  }
  return true;
}

function isSolidRect(w: World, x0: number, y0: number, ww: number, hh: number): boolean {
  for (let y = y0; y < y0 + hh; y += 2) for (let x = x0; x < x0 + ww; x += 2) {
    if (!w.inBounds(x, y)) return false;
    const m = w.mat[y * w.W + x];
    if (CAT[m] !== Cat.SOLID || m === M.BEDROCK) return false;
  }
  return true;
}

/** 바닥 위치 찾기 (서 있을 공간 확보) */
function findFloor(w: World, rng: Rng, x0: number, y0: number, x1: number, y1: number, need = 14, tries = 200): { x: number; y: number } | null {
  for (let t = 0; t < tries; t++) {
    const x = rng.int(x0, x1);
    let y = rng.int(y0, y1);
    if (!w.inBounds(x, y) || w.mat[y * w.W + x] !== M.EMPTY) continue;
    while (y < w.H - 2 && w.mat[(y + 1) * w.W + x] === M.EMPTY) y++;
    if (y >= y1 + 40) continue;
    const below = w.mat[(y + 1) * w.W + x];
    if (!BLOCKS[below]) continue;
    if (!isEmptyRect(w, x - 4, y - need, 9, need)) continue;
    return { x, y: y + 1 };
  }
  return null;
}

/** 분지(웅덩이)에 액체 채우기. 넘치면 취소 */
function fillBasin(w: World, rng: Rng, m: number, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let t = 0; t < 40; t++) {
    let x = rng.int(x0, x1);
    let y = rng.int(y0, y1);
    if (!w.inBounds(x, y) || w.mat[y * w.W + x] !== M.EMPTY) continue;
    while (y < w.H - 3 && w.mat[(y + 1) * w.W + x] === M.EMPTY) y++;
    const level = y - rng.int(3, 12);
    const limit = 1400;
    const visited = new Set<number>();
    const stack = [y * w.W + x];
    visited.add(stack[0]);
    let ok = true;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % w.W;
      const cy = (c - cx) / w.W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (ny < level || !w.inBounds(nx, ny)) continue;
        const j = ny * w.W + nx;
        if (visited.has(j) || w.mat[j] !== M.EMPTY) continue;
        visited.add(j);
        stack.push(j);
        if (visited.size > limit) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok || visited.size < 30) continue;
    for (const c of visited) {
      const cx = c % w.W;
      w.setRaw(cx, (c - cx) / w.W, m);
    }
    void x;
    x = 0;
    return true;
  }
  return false;
}

// ---------- 방 조각 (미리 설계한 템플릿) ----------
// 범례: ' ' 비움, '.' 유지, '#' 구역 벽, 'w' 나무, 'm' 금속, 'g' 화약, '~' 물, 'o' 기름, 'p' 독액, 'l' 용암, 'i' 얼음,
//       'G' 금, 'f' 버섯, 's' 모래, 'c' 결정, 'C' 보물 상자, 'K' 카드, 'H' 생명의 정수
const T_VAULT = [
  '########################',
  '########################',
  '##                    ##',
  '##  G              G  ##',
  '##                    ##',
  '##         C          ##',
  '##      ########      ##',
  '##GG                GG##',
  '##GGGG    H       GGGG##',
  '########################',
  '########################',
];
const T_BRIDGE = [
  '                                                ',
  '                                                ',
  '                                                ',
  '                       C                        ',
  'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  ' w           w            w            w      w ',
  ' w           w            w            w      w ',
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
  'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
  '################################################',
];
const T_POWDER_ROOM = [
  '..##############################..',
  '.##                            ##.',
  '##                              ##',
  '#      w        C        w       #',
  '#      w    wwwwwwwww    w       #',
  '#      w                 w       #',
  '#gggggggggggggggggggggggggggggggg#',
  '#gggggggggggggggggggggggggggggggg#',
  '##################################',
];
const T_FORGE = [
  '                                        ',
  '                                        ',
  '                  C   K                 ',
  '            mmmmmmmmmmmmmmmm            ',
  '            m              m            ',
  '            m              m            ',
  'llllllllllllllllllllllllllllllllllllllll',
  'llllllllllllllllllllllllllllllllllllllll',
  'llllllllllllllllllllllllllllllllllllllll',
  '########################################',
];
const T_GROTTO = [
  '..ffffffffffffffffffffffff..',
  '.ff                      ff.',
  'ff                        ff',
  'f            C             f',
  'f       ##########         f',
  'f                          f',
  'fpppppppppppppppppppppppppppf',
  'fpppppppppppppppppppppppppppf',
  '############################',
];
const T_ICE_LAKE = [
  '                                          ',
  '                                          ',
  '                   C                      ',
  '              iiiiiiiiii                  ',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '##########################################',
];
const T_SHRINE = [
  '..........................',
  '.                        .',
  '    cc              cc    ',
  '    cc       C      cc    ',
  '    cc   ########   cc    ',
  '    cc              cc    ',
  '##########################',
];

interface StampOut {
  chests: { x: number; y: number }[];
  cards: { x: number; y: number }[];
  hearts: { x: number; y: number }[];
}

function stamp(w: World, tpl: string[], x0: number, y0: number, wall: number, liquid: number, out: StampOut): void {
  for (let ty = 0; ty < tpl.length; ty++) {
    const row = tpl[ty];
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      const x = x0 + tx;
      const y = y0 + ty;
      if (x < 3 || y < 3 || x >= w.W - 3 || y >= w.H - 3) continue;
      let m: number | null = null;
      switch (ch) {
        case '.': m = null; break;
        case ' ': m = M.EMPTY; break;
        case '#': m = wall; break;
        case 'w': m = M.WOOD; break;
        case 'm': m = M.METAL; break;
        case 'g': m = M.GUNPOWDER; break;
        case '~': m = M.WATER; break;
        case 'o': m = M.OIL; break;
        case 'p': m = M.POISON; break;
        case 'l': m = M.LAVA; break;
        case 'i': m = M.ICE; break;
        case 'G': m = M.GOLD; break;
        case 'f': m = M.FUNGUS; break;
        case 's': m = M.SAND; break;
        case 'c': m = M.CRYSTAL; break;
        case 'L': m = liquid; break;
        case 'C': m = M.EMPTY; out.chests.push({ x, y: y + 1 }); break;
        case 'K': m = M.EMPTY; out.cards.push({ x, y: y + 1 }); break;
        case 'H': m = M.EMPTY; out.hearts.push({ x, y: y + 1 }); break;
      }
      if (m !== null) w.setRaw(x, y, m);
    }
  }
}

// ---------- 구역 생성 ----------
export function generateZone(index: number, seed: number): Level {
  const z = ZONES[index];
  const rng = new Rng(seed * 7919 + index * 104729);
  const W = ZONE_W;
  const H = ZONE_H;
  const w = new World(W, H, seed + index);
  w.ambient = z.ambient;
  const s = seed + index * 31;
  // 1. 노이즈 동굴
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.016, y * 0.022, s, 4);
      const r = 1 - Math.abs(fbm(x * 0.01, y * 0.013, s + 99, 3) * 2 - 1);
      const cave = n > 0.58 || r > 0.93;
      if (cave) {
        w.setRaw(x, y, M.EMPTY);
        continue;
      }
      const a = fbm(x * 0.03, y * 0.03, s + 7, 3);
      let m = z.base;
      if (a > 0.62) m = z.alt;
      // 구역별 지층
      if (index === 0 && a < 0.3) m = M.STONE;
      if (index === 1 && valueNoise(x * 0.05, y * 0.12, s + 3) > 0.72) m = M.ICE;
      if (index === 3) {
        const band = Math.sin(y * 0.09 + fbm(x * 0.02, y * 0.02, s + 5, 2) * 6);
        if (band > 0.82) m = M.GUNPOWDER;
        else if (band < -0.9) m = M.DIRT;
      }
      if (index === 4 && a > 0.66) m = M.METAL;
      if (index === 2 && a < 0.25) m = M.STONE;
      w.setRaw(x, y, m);
    }
  }
  // 2. 보장된 하강 경로
  let px = W / 2;
  let py = 30;
  let tx = rng.int(80, W - 80);
  const pathPts: { x: number; y: number }[] = [];
  while (py < H - 70) {
    if (Math.abs(px - tx) < 10 || rng.chance(0.01)) tx = rng.int(60, W - 60);
    px += Math.sign(tx - px) * rng.range(0.5, 2.2) + rng.range(-1, 1);
    py += rng.range(0.4, 1.6);
    px = Math.max(30, Math.min(W - 30, px));
    const r = rng.int(7, 11);
    carveCircle(w, Math.floor(px), Math.floor(py), r);
    pathPts.push({ x: px, y: py });
  }
  // 3. 시작 방 / 출구 방
  const startX = W / 2;
  fillRect(w, startX - 40, 14, 80, 36, M.EMPTY);
  fillRect(w, startX - 44, 50, 88, 6, M.STONE);
  fillRect(w, startX - 6, 50, 12, 6, M.EMPTY); // 아래로 내려가는 구멍
  const exitX = Math.floor(px);
  const exitY = H - 40;
  fillRect(w, exitX - 34, exitY - 34, 68, 34, M.EMPTY);
  fillRect(w, exitX - 38, exitY, 76, 8, M.STONE);

  // 4. 구역 특징
  const out: StampOut = { chests: [], cards: [], hearts: [] };
  const liquidOf = [M.WATER, M.WATER, M.POISON, M.OIL, M.LAVA][index];
  // 방 조각
  const templates: string[][] = [T_SHRINE];
  if (index === 0) templates.push(T_BRIDGE, T_BRIDGE);
  if (index === 1) templates.push(T_ICE_LAKE, T_ICE_LAKE);
  if (index === 2) templates.push(T_GROTTO, T_GROTTO);
  if (index === 3) templates.push(T_POWDER_ROOM, T_POWDER_ROOM, T_BRIDGE);
  if (index === 4) templates.push(T_FORGE, T_FORGE, T_BRIDGE);
  for (const tpl of templates) {
    for (let t = 0; t < 30; t++) {
      const x0 = rng.int(20, W - tpl[0].length - 20);
      const y0 = rng.int(90, H - tpl.length - 90);
      // 동굴과 겹치는 곳에 배치 (진입 가능)
      let empty = 0;
      for (let k = 0; k < 20; k++) if (w.get(x0 + rng.int(0, tpl[0].length - 1), y0 + rng.int(0, tpl.length - 1)) === M.EMPTY) empty++;
      if (empty < 5) continue;
      stamp(w, tpl, x0, y0, z.base === M.DIRT ? M.STONE : z.base, liquidOf, out);
      break;
    }
  }
  // 비밀 금고 (벽 속에 숨김)
  const secrets: { x: number; y: number }[] = [];
  for (let k = 0; k < 2; k++) {
    for (let t = 0; t < 200; t++) {
      const x0 = rng.int(20, W - 44);
      const y0 = rng.int(100, H - 100);
      if (!isSolidRect(w, x0 - 4, y0 - 4, T_VAULT[0].length + 8, T_VAULT.length + 8)) continue;
      // 근처에 동굴이 있어야 발견 가능
      let near = false;
      for (let d = 0; d < 40 && !near; d += 4) {
        if (w.get(x0 - 8 - d, y0 + 5) === M.EMPTY || w.get(x0 + T_VAULT[0].length + 8 + d, y0 + 5) === M.EMPTY || w.get(x0 + 10, y0 - 8 - d) === M.EMPTY) near = true;
      }
      if (!near) continue;
      const before = out.chests.length;
      stamp(w, T_VAULT, x0, y0, z.base === M.DIRT ? M.STONE : z.base, liquidOf, out);
      for (let c = before; c < out.chests.length; c++) secrets.push(out.chests[c]);
      break;
    }
  }
  // 재질 웅덩이
  const pools: [number, number][] = [];
  if (index === 0) pools.push([M.WATER, 7], [M.OIL, 4], [M.SAND, 0]);
  if (index === 1) pools.push([M.WATER, 6], [M.ICE, 4]);
  if (index === 2) pools.push([M.POISON, 9], [M.WATER, 3], [M.ACID, 2]);
  if (index === 3) pools.push([M.OIL, 5], [M.WATER, 3]);
  if (index === 4) pools.push([M.LAVA, 10], [M.OIL, 1], [M.WATER, 2]);
  for (const [m, n] of pools) for (let k = 0; k < n; k++) fillBasin(w, rng, m, 20, 80, W - 20, H - 80);
  // 나무뿌리 (1구역) / 지지대 (4구역)
  if (index === 0 || index === 2) {
    for (let k = 0; k < 70; k++) {
      let rx = rng.int(10, W - 10);
      let ry = rng.int(60, H - 60);
      if (w.get(rx, ry) === M.EMPTY || w.get(rx, ry + 1) !== M.EMPTY) continue;
      const len = rng.int(10, 40);
      for (let s2 = 0; s2 < len; s2++) {
        if (w.get(rx, ry) === M.BEDROCK) break;
        w.setRaw(rx, ry, index === 0 ? M.WOOD : M.FUNGUS);
        if (rng.chance(0.4)) w.setRaw(rx + 1, ry, index === 0 ? M.WOOD : M.FUNGUS);
        ry++;
        rx += rng.int(-1, 1);
      }
    }
  }
  if (index === 2) {
    // 버섯 군락 + 독가스 주머니
    for (let k = 0; k < 120; k++) {
      const f = findFloor(w, rng, 10, 60, W - 10, H - 60, 4, 20);
      if (!f) continue;
      const hgt = rng.int(3, 8);
      for (let yy = 0; yy < hgt; yy++) w.setRaw(f.x, f.y - 1 - yy, M.FUNGUS);
      for (let xx = -2; xx <= 2; xx++) w.setRaw(f.x + xx, f.y - hgt - 1, M.FUNGUS);
    }
    for (let k = 0; k < 12; k++) {
      const x = rng.int(20, W - 20);
      const y = rng.int(80, H - 80);
      if (w.get(x, y) !== M.EMPTY) continue;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -10; dx <= 10; dx++) if (w.get(x + dx, y + dy) === M.EMPTY && rng.chance(0.5)) w.setRaw(x + dx, y + dy, M.TOXGAS);
    }
  }
  if (index === 3) {
    // 광산 지지대: 동굴 안의 나무 기둥과 들보
    for (let k = 0; k < 60; k++) {
      const f = findFloor(w, rng, 10, 60, W - 10, H - 60, 20, 30);
      if (!f) continue;
      let top = f.y - 1;
      while (top > 4 && w.get(f.x, top - 1) === M.EMPTY && f.y - top < 40) top--;
      if (f.y - top < 10 || f.y - top >= 40) continue;
      const span = rng.int(10, 22);
      for (let yy = top; yy < f.y; yy++) {
        w.setRaw(f.x, yy, M.WOOD);
        if (w.get(f.x + span, yy) === M.EMPTY) w.setRaw(f.x + span, yy, M.WOOD);
      }
      for (let xx = 0; xx <= span; xx++) if (w.get(f.x + xx, top) === M.EMPTY) w.setRaw(f.x + xx, top, M.WOOD);
      if (rng.chance(0.4)) for (let xx = 2; xx < span - 1; xx++) if (w.get(f.x + xx, f.y - 1) === M.EMPTY) w.setRaw(f.x + xx, f.y - 1, M.GUNPOWDER);
    }
  }
  if (index === 1) {
    // 얼음 고드름
    for (let k = 0; k < 90; k++) {
      const x = rng.int(10, W - 10);
      const y = rng.int(60, H - 60);
      if (w.get(x, y) === M.EMPTY || w.get(x, y + 1) !== M.EMPTY) continue;
      const len = rng.int(4, 14);
      for (let yy = 1; yy <= len; yy++) {
        w.setRaw(x, y + yy, M.ICE);
        if (yy < len / 2) w.setRaw(x + 1, y + yy, M.ICE);
      }
    }
  }
  // 금 광맥
  for (let k = 0; k < 30; k++) {
    for (let t = 0; t < 30; t++) {
      const x = rng.int(10, W - 10);
      const y = rng.int(60, H - 40);
      if (CAT[w.get(x, y)] !== Cat.SOLID) continue;
      let near = false;
      for (let d = 1; d < 8; d++) if (w.get(x + d, y) === M.EMPTY || w.get(x - d, y) === M.EMPTY || w.get(x, y - d) === M.EMPTY) near = true;
      if (!near) continue;
      blob(w, rng, x, y, rng.int(2, 3), M.GOLD, true);
      break;
    }
  }
  // 경로 재확보 (구조물이 막지 않도록 일부만)
  for (let k = 0; k < pathPts.length; k += 6) {
    const p = pathPts[k];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const m = w.get(Math.floor(p.x) + dx, Math.floor(p.y) + dy);
      if (m !== M.BEDROCK && BLOCKS[m] && dx * dx + dy * dy <= 16 && m !== M.GUNPOWDER) w.setRaw(Math.floor(p.x) + dx, Math.floor(p.y) + dy, M.EMPTY);
    }
  }
  // 시작/출구 다시 정리
  fillRect(w, startX - 40, 14, 80, 36, M.EMPTY);
  fillRect(w, exitX - 34, exitY - 34, 68, 34, M.EMPTY);
  fillRect(w, exitX - 38, exitY, 76, 8, M.STONE);
  frame(w);

  // 5. 아이템
  const items: Item[] = [];
  const tier = index + 1;
  const portal = new Item('portal', exitX, exitY, true);
  items.push(portal);
  const mkChest = (x: number, y: number, secret: boolean): void => {
    const c = new Item('chest', x, y);
    c.tier = tier + (secret ? 1 : 0);
    c.secret = secret;
    items.push(c);
  };
  for (const c of out.chests) mkChest(c.x, c.y, secrets.includes(c));
  for (const c of out.cards) {
    const it = new Item('card', c.x, c.y);
    it.cardId = randomCard(tier + 1, () => rng.next());
    items.push(it);
  }
  for (const h of out.hearts) items.push(new Item('heart', h.x, h.y));
  for (let k = 0; k < 6; k++) {
    const f = findFloor(w, rng, 20, 100, W - 20, H - 80);
    if (f) mkChest(f.x, f.y, false);
  }
  for (let k = 0; k < 3; k++) {
    const f = findFloor(w, rng, 20, 100, W - 20, H - 80);
    if (!f) continue;
    const it = new Item('card', f.x, f.y);
    it.cardId = randomCard(tier, () => rng.next());
    items.push(it);
  }
  {
    const f = findFloor(w, rng, 20, 200, W - 20, H - 80);
    if (f) {
      const it = new Item('wand', f.x, f.y);
      it.wand = randomWand(tier, () => rng.next());
      items.push(it);
    }
  }
  // 6. 적
  const enemies: { kind: EnemyKind; x: number; y: number }[] = [];
  const total = z.enemies.reduce((a, e) => a + e[1], 0);
  for (let k = 0; k < z.enemyCount; k++) {
    let r = rng.next() * total;
    let kind: EnemyKind = z.enemies[0][0];
    for (const [ek, wt] of z.enemies) {
      r -= wt;
      if (r <= 0) {
        kind = ek;
        break;
      }
    }
    const f = findFloor(w, rng, 20, 120, W - 20, H - 60, 18);
    if (!f) continue;
    if (Math.hypot(f.x - startX, f.y - 50) < 120) continue;
    enemies.push({ kind, x: f.x, y: f.y });
  }
  w.wakeAll();
  return {
    world: w, zone: z, spawnX: startX, spawnY: 49, items, enemies, bg: makeBg(z, seed + index), kind: 'zone', index, bossX: 0, bossY: 0,
  };
}

// ---------- 성소 ----------
export function generateSanctuary(index: number, seed: number, offerTier: number): Level {
  const W = 400;
  const H = 240;
  const rng = new Rng(seed * 31 + index * 977 + 5);
  const w = new World(W, H, seed + 900 + index);
  w.ambient = 20;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.setRaw(x, y, M.STONE);
  for (let y = 40; y < 196; y++) for (let x = 16; x < W - 16; x++) {
    const arch = y < 70 ? Math.abs(x - W / 2) > 170 - (y - 40) * 3 : false;
    if (!arch) w.setRaw(x, y, M.EMPTY);
  }
  fillRect(w, 16, 196, W - 32, 4, M.GLASS);
  // 결정 장식 기둥
  for (const x of [60, 140, 260, 340]) {
    for (let y = 150; y < 196; y++) {
      w.setRaw(x, y, M.CRYSTAL);
      w.setRaw(x + 1, y, M.CRYSTAL);
    }
    for (let k = -3; k <= 4; k++) w.setRaw(x + k, 149, M.CRYSTAL);
  }
  // 분수
  fillRect(w, 180, 190, 40, 6, M.EMPTY);
  fillRect(w, 178, 190, 2, 6, M.GLASS);
  fillRect(w, 220, 190, 2, 6, M.GLASS);
  fillRect(w, 180, 192, 40, 4, M.WATER);
  frame(w, 2);
  const items: Item[] = [];
  const floorY = 196;
  const altar = new Item('altar', 40, floorY, true);
  items.push(altar);
  // 상점: 카드 3, 지팡이 2
  const shopX = [100, 120, 160, 240, 290];
  for (let k = 0; k < 3; k++) {
    const it = new Item('shopCard', shopX[k], floorY, true);
    it.cardId = randomCard(offerTier + 1, () => rng.next());
    it.price = Math.round(card(it.cardId).price * (0.9 + rng.next() * 0.3));
    items.push(it);
  }
  for (let k = 3; k < 5; k++) {
    const it = new Item('shopWand', shopX[k], floorY, true);
    const wd: Wand = randomWand(offerTier + 1, () => rng.next());
    it.wand = wd;
    it.price = wandValue(wd) + offerTier * 25;
    items.push(it);
  }
  // 무료 선택 3장
  for (let k = 0; k < 3; k++) {
    const it = new Item('freeCard', 315 + k * 14, floorY, true);
    it.cardId = randomCard(offerTier + 1, () => rng.next());
    it.group = 1;
    items.push(it);
  }
  items.push(new Item('portal', 372, floorY, true));
  w.wakeAll();
  return {
    world: w, zone: { ...SANCTUARY_ZONE, name: `성소 ${index + 1}` }, spawnX: 24, spawnY: floorY - 1, items, enemies: [], bg: makeBg(SANCTUARY_ZONE, seed + 500), kind: 'sanctuary', index, bossX: 0, bossY: 0,
  };
}

// ---------- 보스방 ----------
export function generateBossArena(seed: number): Level {
  const W = 480;
  const H = 300;
  const rng = new Rng(seed * 13 + 7);
  const w = new World(W, H, seed + 4242);
  w.ambient = BOSS_ZONE.ambient;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.05, y * 0.05, seed + 11, 3);
    w.setRaw(x, y, n > 0.6 ? M.CRYSTAL : M.STONE);
  }
  // 내부 공간
  for (let y = 24; y < 262; y++) for (let x = 22; x < W - 22; x++) {
    const edge = fbm(x * 0.06, y * 0.06, seed + 3, 2) * 10;
    if (x > 22 + edge && x < W - 22 - edge && y > 24 + edge) w.setRaw(x, y, M.EMPTY);
  }
  // 바닥: 두꺼운 돌층
  fillRect(w, 10, 262, W - 20, 30, M.STONE);
  for (let x = 10; x < W - 10; x++) for (let y = 262; y < 268; y++) if (rng.chance(0.15)) w.setRaw(x, y, M.CRYSTAL);
  // 발판
  const plats: [number, number, number][] = [[60, 215, 46], [374, 215, 46], [150, 175, 36], [294, 175, 36], [40, 150, 30], [410, 150, 30]];
  for (const [x, y, len] of plats) {
    fillRect(w, x, y, len, 4, M.STONE);
    fillRect(w, x + 2, y + 4, len - 4, 2, M.STONE);
  }
  // 금속 기둥 (전도 경로)
  for (const x of [120, 356]) fillRect(w, x, 200, 4, 62, M.METAL);
  // 결정 고드름
  for (let k = 0; k < 40; k++) {
    const x = rng.int(30, W - 30);
    let y = 25;
    while (y < 120 && w.get(x, y) !== M.EMPTY) y++;
    const len = rng.int(3, 12);
    for (let yy = 0; yy < len; yy++) w.setRaw(x, y + yy, M.CRYSTAL);
  }
  frame(w, 3);
  const items: Item[] = [];
  w.wakeAll();
  return {
    world: w, zone: BOSS_ZONE, spawnX: 50, spawnY: 261, items, enemies: [], bg: makeBg(BOSS_ZONE, seed + 999), kind: 'boss', index: 5, bossX: W / 2, bossY: 110,
  };
}

// ---------- 타이틀 데모 장면 ----------
export function generateDemo(seed: number): Level {
  const W = 400;
  const H = 225;
  const rng = new Rng(seed);
  const w = new World(W, H, seed);
  w.ambient = 20;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ground = 170 + fbm(x * 0.02, 1, seed, 3) * 30;
    const ceil = 18 + fbm(x * 0.03, 5, seed, 3) * 20;
    if (y > ground) w.setRaw(x, y, y > ground + 12 ? M.STONE : M.DIRT);
    else if (y < ceil) w.setRaw(x, y, M.STONE);
  }
  // 물탱크 (위) → 흘러내림
  fillRect(w, 40, 40, 70, 4, M.STONE);
  fillRect(w, 40, 20, 4, 24, M.STONE);
  fillRect(w, 106, 20, 4, 24, M.STONE);
  fillRect(w, 44, 24, 62, 16, M.WATER);
  fillRect(w, 104, 30, 2, 10, M.EMPTY);
  // 나무 집
  const hx = 160;
  for (let y = 120; y < 172; y++) {
    w.setRaw(hx, y, M.WOOD);
    w.setRaw(hx + 70, y, M.WOOD);
  }
  for (let x = hx; x <= hx + 70; x++) {
    w.setRaw(x, 120, M.WOOD);
    w.setRaw(x, 145, M.WOOD);
  }
  for (let k = 0; k < 20; k++) for (let x = hx - 5 + k; x <= hx + 75 - k; x++) w.setRaw(x, 119 - k, M.WOOD);
  fillRect(w, hx + 5, 140, 60, 5, M.OIL);
  // 화약 더미
  for (let x = 250; x < 290; x++) for (let y = 160; y < 175; y++) if (w.get(x, y) === M.EMPTY && y > 172 - (20 - Math.abs(x - 270)) * 0.6) w.setRaw(x, y, M.GUNPOWDER);
  // 용암 분지
  fillRect(w, 320, 150, 70, 30, M.EMPTY);
  fillRect(w, 316, 180, 80, 10, M.STONE);
  fillRect(w, 322, 168, 66, 12, M.LAVA);
  // 모래 언덕, 얼음, 산
  for (let k = 0; k < 6; k++) blob(w, rng, rng.int(10, 140), rng.int(150, 168), 4, M.SAND, false);
  fillRect(w, 120, 60, 25, 6, M.ICE);
  // 불씨
  w.setRaw(hx + 2, 171, M.FIRE);
  w.setRaw(hx + 3, 171, M.FIRE);
  frame(w, 1);
  w.wakeAll();
  return {
    world: w, zone: ZONES[0], spawnX: 0, spawnY: 0, items: [], enemies: [], bg: makeBg(ZONES[0], 3), kind: 'demo', index: -1, bossX: 0, bossY: 0,
  };
}

/** 보물 상자 내용물 결정 */
export function chestLoot(tier: number, rng: () => number): { gold: number; cards: string[]; wand: Wand | null; heart: boolean } {
  const gold = Math.floor(20 + rng() * 30 + tier * 12);
  const cards: string[] = [];
  let wand: Wand | null = null;
  let heart = false;
  const roll = rng();
  if (roll < 0.55) {
    cards.push(randomCard(tier, rng));
    if (rng() < 0.4) cards.push(randomCard(tier, rng));
  } else if (roll < 0.75) {
    wand = randomWand(tier, rng);
  } else {
    heart = true;
    if (rng() < 0.5) cards.push(randomCard(tier, rng));
  }
  return { gold, cards, wand, heart };
}
