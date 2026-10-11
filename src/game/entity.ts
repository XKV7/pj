// 픽셀 지형과 충돌하는 AABB 물리 + 상태이상/환경 피해를 공유하는 생명체 기반 클래스.
import type { World } from '../sim/world';
import { M, BLOCKS, CAT, Cat, MATS, type DamageType } from '../sim/materials';

export class Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx = 0;
  vy = 0;
  onGround = false;
  liquidFrac = 0;
  liquidMat = 0;
  onIce = false;
  hitWallX = false;
  constructor(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
}

export function rectBlocked(w: World, x: number, y: number, bw: number, bh: number): boolean {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  for (let yy = y0; yy < y0 + bh; yy++) {
    for (let xx = x0; xx < x0 + bw; xx++) {
      if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H) return true;
      if (BLOCKS[w.mat[yy * w.W + xx]]) return true;
    }
  }
  return false;
}

/** 끼임 해소: 위/옆으로 밀어내고, 그래도 안 되면 겹친 가루/고체를 파편으로 날린다 */
export function unstick(w: World, b: Body): void {
  if (!rectBlocked(w, b.x, b.y, b.w, b.h)) return;
  for (let d = 1; d <= 6; d++) {
    if (!rectBlocked(w, b.x, b.y - d, b.w, b.h)) {
      b.y -= d;
      return;
    }
    if (!rectBlocked(w, b.x - d, b.y, b.w, b.h)) {
      b.x -= d;
      return;
    }
    if (!rectBlocked(w, b.x + d, b.y, b.w, b.h)) {
      b.x += d;
      return;
    }
  }
  const x0 = Math.floor(b.x);
  const y0 = Math.floor(b.y);
  for (let yy = y0; yy < y0 + b.h; yy++) {
    for (let xx = x0; xx < x0 + b.w; xx++) {
      if (!w.inBounds(xx, yy)) continue;
      const m = w.mat[yy * w.W + xx];
      if (BLOCKS[m] && m !== M.BEDROCK) {
        w.particles.spawnMat(xx, yy - 1, (Math.random() - 0.5) * 2, -1.5, m, w.shade[yy * w.W + xx], w.temp[yy * w.W + xx]);
        w.set(xx, yy, M.EMPTY);
      }
    }
  }
}

/** 이동 + 충돌. 경사 1~2픽셀 자동 오르기. */
export function moveBody(w: World, b: Body, stepUp = 2): void {
  b.hitWallX = false;
  // X
  let dx = b.vx;
  const sx = Math.sign(dx);
  while (dx !== 0) {
    const step = Math.abs(dx) >= 1 ? sx : dx;
    const nx = b.x + step;
    if (Math.floor(nx) === Math.floor(b.x) || !rectBlocked(w, nx, b.y, b.w, b.h)) {
      b.x = nx;
    } else {
      let climbed = false;
      if (b.onGround || b.liquidFrac > 0.2) {
        for (let s = 1; s <= stepUp; s++) {
          if (!rectBlocked(w, nx, b.y - s, b.w, b.h)) {
            b.x = nx;
            b.y -= s;
            climbed = true;
            break;
          }
        }
      }
      if (!climbed) {
        b.vx = 0;
        b.hitWallX = true;
        break;
      }
    }
    dx -= step;
    if (Math.abs(dx) < 1e-6) dx = 0;
  }
  // Y
  let dy = b.vy;
  const sy = Math.sign(dy);
  b.onGround = false;
  while (dy !== 0) {
    const step = Math.abs(dy) >= 1 ? sy : dy;
    const ny = b.y + step;
    if (Math.floor(ny) === Math.floor(b.y) || !rectBlocked(w, b.x, ny, b.w, b.h)) {
      b.y = ny;
    } else {
      if (sy > 0) b.onGround = true;
      b.vy = 0;
      break;
    }
    dy -= step;
    if (Math.abs(dy) < 1e-6) dy = 0;
  }
  if (!b.onGround && b.vy >= 0 && rectBlocked(w, b.x, b.y + 1, b.w, b.h)) b.onGround = true;
  // 발밑 재질
  b.onIce = false;
  if (b.onGround) {
    const fy = Math.floor(b.y) + b.h;
    const m = w.get(Math.floor(b.cx), fy);
    b.onIce = m === M.ICE;
  }
}

// ---------- 환경 샘플 ----------
export interface EnvSample {
  liquid: number; // 액체 셀 비율
  liquidMat: number;
  water: number;
  oil: number;
  fire: number;
  lava: number;
  acid: number;
  poison: number;
  toxgas: number;
  frost: number;
  steam: number;
  spark: number;
  charged: number;
  goldLiq: number;
  total: number;
}

export function sampleEnv(w: World, b: Body): EnvSample {
  const s: EnvSample = { liquid: 0, liquidMat: 0, water: 0, oil: 0, fire: 0, lava: 0, acid: 0, poison: 0, toxgas: 0, frost: 0, steam: 0, spark: 0, charged: 0, goldLiq: 0, total: 0 };
  const x0 = Math.floor(b.x);
  const y0 = Math.floor(b.y);
  let liq = 0;
  let n = 0;
  const counts = new Uint16Array(32);
  for (let yy = y0; yy < y0 + b.h; yy++) {
    for (let xx = x0; xx < x0 + b.w; xx++) {
      if (xx < 0 || yy < 0 || xx >= w.W || yy >= w.H) continue;
      n++;
      const i = yy * w.W + xx;
      const m = w.mat[i];
      if (w.charge[i] > 0) s.charged++;
      if (m === 0) continue;
      counts[m]++;
      if (CAT[m] === Cat.LIQUID) liq++;
    }
  }
  s.total = n;
  s.liquid = n ? liq / n : 0;
  let best = 0;
  for (let m = 1; m < 32; m++) {
    if (CAT[m] === Cat.LIQUID && counts[m] > best) {
      best = counts[m];
      s.liquidMat = m;
    }
  }
  s.water = counts[M.WATER];
  s.oil = counts[M.OIL];
  s.fire = counts[M.FIRE];
  s.lava = counts[M.LAVA];
  s.acid = counts[M.ACID];
  s.poison = counts[M.POISON];
  s.toxgas = counts[M.TOXGAS];
  s.frost = counts[M.FROST];
  s.steam = counts[M.STEAM];
  s.spark = counts[M.SPARK];
  s.goldLiq = counts[M.GOLD_LIQ];
  return s;
}

export type Resist = Partial<Record<DamageType, number>>;

export const DMG_NAME: Record<DamageType, string> = {
  magic: '마법', fire: '화염', acid: '산', ice: '냉기', elec: '전기', explosion: '폭발', poison: '독', physical: '물리',
};

/** 상태이상과 환경 피해를 가지는 생명체 */
export class Creature {
  body: Body;
  hp: number;
  maxHp: number;
  resist: Resist = {};
  dead = false;
  invuln = 0;
  flash = 0;
  wet = 0;
  oily = 0;
  burning = 0;
  chilled = 0;
  shocked = 0;
  lastCause = '';
  envCauseText: Partial<Record<string, string>> = {};
  canBurn = true;

  constructor(x: number, y: number, w: number, h: number, hp: number) {
    this.body = new Body(x, y, w, h);
    this.hp = hp;
    this.maxHp = hp;
  }

  /** 상태이상 반영 배율 */
  damageMul(type: DamageType): number {
    let m = this.resist[type] ?? 1;
    if (type === 'elec' && this.wet > 0) m *= 2;
    if (type === 'fire' && this.wet > 0) m *= 0.5;
    if (type === 'fire' && this.oily > 0) m *= 1.5;
    if (type === 'ice' && this.wet > 0) m *= 1.3;
    return m;
  }

  /** 피해 적용. 반환: 실제 피해량 */
  applyDamage(amount: number, type: DamageType, cause: string): number {
    if (this.dead || amount <= 0) return 0;
    const dmg = amount * this.damageMul(type);
    if (dmg <= 0) return 0;
    this.hp -= dmg;
    this.lastCause = cause;
    if (dmg >= 1) this.flash = 6;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return dmg;
  }

  /** 환경(셀) 접촉 처리. 반환: 이번 프레임 환경 피해 (표시용) */
  envTick(w: World, causes: EnvCauses): EnvSample {
    const e = sampleEnv(w, this.body);
    const dt = 1 / 60;
    if (this.wet > 0) this.wet--;
    if (this.oily > 0) this.oily--;
    if (this.chilled > 0) this.chilled--;
    if (this.shocked > 0) this.shocked--;
    if (e.water > 2) {
      this.wet = 360;
      this.burning = 0;
    }
    if (e.oil > 2) this.oily = 600;
    if (e.frost > 0) this.chilled = 120;
    if (e.acid > 0) this.applyDamage(MATS[M.ACID].damage! * dt * Math.min(1, e.acid / 8 + 0.3), 'acid', causes.acid);
    if (e.lava > 0) {
      this.applyDamage(MATS[M.LAVA].damage! * dt * Math.min(1, e.lava / 6 + 0.4), 'fire', causes.lava);
      if (this.canBurn) this.burning = Math.max(this.burning, 240);
    }
    if (e.goldLiq > 0) this.applyDamage(MATS[M.GOLD_LIQ].damage! * dt, 'fire', causes.lava);
    if (e.poison > 0) this.applyDamage(MATS[M.POISON].damage! * dt, 'poison', causes.poison);
    if (e.toxgas > 0) this.applyDamage(MATS[M.TOXGAS].damage! * dt * Math.min(1, e.toxgas / 10 + 0.3), 'poison', causes.toxgas);
    if (e.steam > 3) this.applyDamage(MATS[M.STEAM].damage! * dt, 'fire', causes.steam);
    if (e.frost > 0) this.applyDamage(MATS[M.FROST].damage! * dt, 'ice', causes.frost);
    if (e.fire > 0) {
      this.applyDamage(MATS[M.FIRE].damage! * dt * Math.min(1, e.fire / 6 + 0.3), 'fire', causes.fire);
      if (this.canBurn && this.wet <= 0) this.burning = Math.max(this.burning, this.oily > 0 ? 360 : 150);
    }
    if (e.charged > 0 || e.spark > 0) {
      this.applyDamage(MATS[M.SPARK].damage! * dt * (e.charged > 0 ? 1.5 : 1), 'elec', causes.elec);
      this.shocked = 8;
    }
    if (this.burning > 0) {
      this.burning--;
      if (this.wet > 0 || e.water > 0) this.burning = 0;
      this.applyDamage(9 * dt, 'fire', causes.burning);
    }
    return e;
  }
}

export interface EnvCauses {
  acid: string;
  lava: string;
  poison: string;
  toxgas: string;
  steam: string;
  frost: string;
  fire: string;
  elec: string;
  burning: string;
}

export const PLAYER_CAUSES: EnvCauses = {
  acid: '산에 녹아내림',
  lava: '용암에 빠져 타 죽음',
  poison: '독액에 중독됨',
  toxgas: '독가스를 들이마심',
  steam: '뜨거운 증기에 데임',
  frost: '냉기에 얼어붙음',
  fire: '불길에 휩싸임',
  elec: '감전사',
  burning: '온몸에 불이 붙어 타 죽음',
};

export const ENEMY_CAUSES: EnvCauses = {
  acid: 'acid', lava: 'lava', poison: 'poison', toxgas: 'toxgas', steam: 'steam', frost: 'frost', fire: 'fire', elec: 'elec', burning: 'burning',
};

/** 시야 판정: 두 점 사이에 막는 셀이 없는지 */
export function lineOfSight(w: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2);
  for (let k = 1; k < n; k++) {
    const x = Math.floor(x0 + (dx * k) / n);
    const y = Math.floor(y0 + (dy * k) / n);
    if (w.isBlocked(x, y)) return false;
  }
  return true;
}
