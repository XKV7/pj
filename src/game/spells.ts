// 주문 카드 정의, 지팡이, 시전 파서.
import type { DamageType } from '../sim/materials';

export type CardKind = 'proj' | 'mod' | 'multi';

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  desc: string;
  mana: number;
  price: number;
  tier: number; // 1~5, 등장 구역
  color: number; // 아이콘/투사체 색 (rgb)
  delay: number; // 시전 지연 추가 (프레임)
  // 투사체
  speed?: number;
  dmg?: number;
  dmgType?: DamageType;
  life?: number;
  gravity?: number;
  size?: number;
  spread?: number; // 고유 퍼짐(도)
  bounce?: number;
  pierce?: number;
  hidden?: boolean; // 적 전용
  sound?: string;
}

const C: CardDef[] = [
  // ----- 투사체 -----
  { id: 'spark', name: '불꽃 볼트', kind: 'proj', desc: '빠르고 가벼운 마법 탄환.', mana: 5, price: 40, tier: 1, color: 0xffe080, delay: 3, speed: 7, dmg: 9, dmgType: 'magic', life: 40, size: 1, sound: 'magic' },
  { id: 'fireball', name: '불덩이', kind: 'proj', desc: '명중 지점에 불길을 퍼뜨린다. 나무와 기름을 태운다.', mana: 25, price: 90, tier: 1, color: 0xff7a20, delay: 12, speed: 4, dmg: 14, dmgType: 'fire', life: 90, gravity: 0.04, size: 2, sound: 'fire' },
  { id: 'acid', name: '산 방울', kind: 'proj', desc: '포물선을 그리며 날아가 산 웅덩이를 만든다. 지형을 녹인다.', mana: 20, price: 80, tier: 1, color: 0x8cff58, delay: 10, speed: 4.5, dmg: 6, dmgType: 'acid', life: 120, gravity: 0.12, size: 2, sound: 'acid' },
  { id: 'icelance', name: '얼음 창', kind: 'proj', desc: '적 하나를 관통하고 명중 지점을 얼린다. 물을 얼음 발판으로 만든다.', mana: 22, price: 100, tier: 2, color: 0xb8ecff, delay: 10, speed: 8, dmg: 16, dmgType: 'ice', life: 45, size: 1, pierce: 1, sound: 'ice' },
  { id: 'lightning', name: '번개 볼트', kind: 'proj', desc: '매우 빠른 전격. 물과 금속에 닿으면 연결된 전체로 전류가 흐른다.', mana: 30, price: 120, tier: 2, color: 0x9ad0ff, delay: 14, speed: 12, dmg: 18, dmgType: 'elec', life: 30, size: 1, sound: 'elec' },
  { id: 'bomb', name: '폭탄', kind: 'proj', desc: '튕기다가 잠시 후 폭발한다. 지형을 크게 파괴한다.', mana: 35, price: 110, tier: 1, color: 0x404040, delay: 25, speed: 3.5, dmg: 45, dmgType: 'explosion', life: 100, gravity: 0.15, size: 2, bounce: 99, sound: 'bomb' },
  { id: 'waterjet', name: '물 분사', kind: 'proj', desc: '물줄기를 뿌린다. 불을 끄고 적을 적신다 (젖으면 전기에 약해짐).', mana: 4, price: 50, tier: 1, color: 0x4a8af0, delay: 2, speed: 6, dmg: 1, dmgType: 'physical', life: 32, gravity: 0.1, size: 1, spread: 6, sound: 'water' },
  { id: 'dig', name: '굴착 광선', kind: 'proj', desc: '지형만 파괴하는 광선. 적에게는 피해를 주지 않는다.', mana: 7, price: 60, tier: 1, color: 0xd0a060, delay: 4, speed: 5, dmg: 0, dmgType: 'physical', life: 26, size: 1, sound: 'dig' },
  { id: 'sandball', name: '모래 소환', kind: 'proj', desc: '모래 덩어리를 소환한다. 발판이나 방벽으로 쓸 수 있다.', mana: 15, price: 45, tier: 1, color: 0xd8c088, delay: 10, speed: 4, dmg: 4, dmgType: 'physical', life: 40, gravity: 0.1, size: 2, sound: 'summon' },
  { id: 'oilball', name: '기름 소환', kind: 'proj', desc: '기름 덩어리를 소환한다. 불을 붙이면 크게 번진다.', mana: 15, price: 50, tier: 1, color: 0x6a5434, delay: 10, speed: 4, dmg: 2, dmgType: 'physical', life: 40, gravity: 0.1, size: 2, sound: 'summon' },
  { id: 'waterball', name: '물 덩어리 소환', kind: 'proj', desc: '많은 물을 소환한다. 용암을 돌로 굳힌다.', mana: 15, price: 50, tier: 1, color: 0x3a74e0, delay: 10, speed: 4, dmg: 2, dmgType: 'physical', life: 40, gravity: 0.1, size: 2, sound: 'summon' },
  { id: 'powderball', name: '화약 소환', kind: 'proj', desc: '화약 더미를 소환한다. 위험하다.', mana: 20, price: 70, tier: 3, color: 0x3a3634, delay: 12, speed: 4, dmg: 2, dmgType: 'physical', life: 40, gravity: 0.1, size: 2, sound: 'summon' },
  { id: 'missile', name: '마법 미사일', kind: 'proj', desc: '가속하는 강력한 미사일. 명중 시 폭발한다.', mana: 30, price: 140, tier: 2, color: 0xff60ff, delay: 15, speed: 3, dmg: 26, dmgType: 'magic', life: 70, size: 2, sound: 'magic' },
  { id: 'absorb', name: '흡수 구체', kind: 'proj', desc: '천천히 떠다니며 주변의 모든 재질을 삼킨다.', mana: 40, price: 160, tier: 3, color: 0x6040a0, delay: 30, speed: 1.4, dmg: 1, dmgType: 'magic', life: 140, size: 3, sound: 'magic' },
  { id: 'frostorb', name: '냉기 구체', kind: 'proj', desc: '냉기를 흩뿌리며 날아가 터진다. 용암을 굳히고 물을 얼린다.', mana: 25, price: 110, tier: 2, color: 0xd8f4ff, delay: 14, speed: 3, dmg: 8, dmgType: 'ice', life: 60, size: 2, sound: 'ice' },
  { id: 'teleport', name: '순간이동 볼트', kind: 'proj', desc: '명중 지점으로 순간이동한다.', mana: 40, price: 130, tier: 2, color: 0x60ffe0, delay: 20, speed: 9, dmg: 0, dmgType: 'magic', life: 40, size: 1, sound: 'magic' },
  // ----- 수정자 -----
  { id: 'dmgup', name: '데미지 증가', kind: 'mod', desc: '다음 투사체의 피해 ×1.6 +5.', mana: 10, price: 70, tier: 1, color: 0xff4040, delay: 2 },
  { id: 'pierce', name: '관통', kind: 'mod', desc: '다음 투사체가 적을 관통한다.', mana: 15, price: 80, tier: 2, color: 0xe0e0e0, delay: 0 },
  { id: 'bounce', name: '튕김', kind: 'mod', desc: '다음 투사체가 벽에 3번 튕긴다.', mana: 5, price: 50, tier: 1, color: 0x80ff80, delay: 0 },
  { id: 'homing', name: '유도', kind: 'mod', desc: '다음 투사체가 가까운 적을 추적한다.', mana: 20, price: 110, tier: 2, color: 0xffa0ff, delay: 0 },
  { id: 'nograv', name: '중력 무시', kind: 'mod', desc: '다음 투사체가 중력의 영향을 받지 않는다.', mana: 3, price: 40, tier: 1, color: 0xa0a0ff, delay: 0 },
  { id: 'speedup', name: '속도 증가', kind: 'mod', desc: '다음 투사체의 속도 ×1.7.', mana: 5, price: 40, tier: 1, color: 0xffff80, delay: 0 },
  { id: 'duration', name: '지속시간 증가', kind: 'mod', desc: '다음 투사체의 수명 ×2.', mana: 8, price: 45, tier: 1, color: 0x80ffff, delay: 0 },
  { id: 'trigger', name: '트리거', kind: 'mod', desc: '다음 투사체가 명중하면 그 다음 주문을 명중 지점에서 발동한다.', mana: 10, price: 120, tier: 1, color: 0xffd040, delay: 0 },
  { id: 'firetrail', name: '불꽃 궤적', kind: 'mod', desc: '다음 투사체가 지나간 자리에 불을 남긴다.', mana: 12, price: 70, tier: 2, color: 0xff8030, delay: 0 },
  { id: 'explosive', name: '폭발성', kind: 'mod', desc: '다음 투사체가 명중 시 폭발한다.', mana: 25, price: 120, tier: 2, color: 0xff6020, delay: 5 },
  // ----- 다중 시전 -----
  { id: 'double', name: '이중 시전', kind: 'multi', desc: '다음 주문 2개를 동시에 시전한다.', mana: 2, price: 90, tier: 1, color: 0x60c0ff, delay: 0 },
  { id: 'triple', name: '삼중 시전', kind: 'multi', desc: '다음 주문 3개를 동시에 시전한다.', mana: 5, price: 150, tier: 2, color: 0x40a0ff, delay: 0 },
  { id: 'scatter', name: '산탄 시전', kind: 'multi', desc: '다음 주문 4개를 넓게 흩뿌린다.', mana: 4, price: 110, tier: 2, color: 0x80e0a0, delay: 0 },
  { id: 'circle', name: '원형 분사', kind: 'multi', desc: '다음 주문 하나를 8방향으로 시전한다.', mana: 25, price: 170, tier: 3, color: 0xc080ff, delay: 8 },
  // ----- 적 전용 -----
  { id: 'e_bolt', name: '어둠 볼트', kind: 'proj', desc: '', mana: 0, price: 0, tier: 9, color: 0xff3060, delay: 0, speed: 3.2, dmg: 10, dmgType: 'magic', life: 120, size: 2, hidden: true },
  { id: 'e_fire', name: '적 불덩이', kind: 'proj', desc: '', mana: 0, price: 0, tier: 9, color: 0xff7a20, delay: 0, speed: 3, dmg: 12, dmgType: 'fire', life: 120, gravity: 0.03, size: 2, hidden: true },
  { id: 'e_shard', name: '결정 파편', kind: 'proj', desc: '', mana: 0, price: 0, tier: 9, color: 0xd0a0ff, delay: 0, speed: 4.2, dmg: 14, dmgType: 'magic', life: 140, size: 2, hidden: true },
  { id: 'e_acid', name: '산성 침', kind: 'proj', desc: '', mana: 0, price: 0, tier: 9, color: 0x8cff58, delay: 0, speed: 3.5, dmg: 8, dmgType: 'acid', life: 140, gravity: 0.08, size: 2, hidden: true },
  { id: 'e_lava', name: '용암 방울', kind: 'proj', desc: '', mana: 0, price: 0, tier: 9, color: 0xff8a20, delay: 0, speed: 0.5, dmg: 15, dmgType: 'fire', life: 300, gravity: 0.12, size: 2, hidden: true },
];

export const CARDS = new Map<string, CardDef>(C.map((c) => [c.id, c]));
export const PLAYER_CARDS = C.filter((c) => !c.hidden);

export function card(id: string): CardDef {
  const c = CARDS.get(id);
  if (!c) throw new Error('unknown card ' + id);
  return c;
}

export const KIND_NAME: Record<CardKind, string> = { proj: '투사체', mod: '수정자', multi: '다중 시전' };

// ---------- 수정자 상태 ----------
export interface Mods {
  dmgMul: number;
  dmgAdd: number;
  pierce: number;
  bounce: number;
  homing: boolean;
  noGrav: boolean;
  speedMul: number;
  lifeMul: number;
  fireTrail: boolean;
  explosive: boolean;
}

export function newMods(): Mods {
  return { dmgMul: 1, dmgAdd: 0, pierce: 0, bounce: 0, homing: false, noGrav: false, speedMul: 1, lifeMul: 1, fireTrail: false, explosive: false };
}

function applyMod(m: Mods, id: string): void {
  switch (id) {
    case 'dmgup': m.dmgMul *= 1.6; m.dmgAdd += 5; break;
    case 'pierce': m.pierce += 3; break;
    case 'bounce': m.bounce += 3; break;
    case 'homing': m.homing = true; break;
    case 'nograv': m.noGrav = true; break;
    case 'speedup': m.speedMul *= 1.7; break;
    case 'duration': m.lifeMul *= 2; break;
    case 'firetrail': m.fireTrail = true; break;
    case 'explosive': m.explosive = true; break;
  }
}

export interface CastNode {
  card: CardDef;
  mods: Mods;
  payload: CastNode[] | null;
  angle: number;
}

// ---------- 지팡이 ----------
export interface WandStats {
  name: string;
  capacity: number;
  manaMax: number;
  manaRegen: number; // 초당
  castDelay: number; // 프레임
  reload: number; // 프레임
  spread: number; // 도
  color: number;
}

export class Wand implements WandStats {
  name: string;
  capacity: number;
  manaMax: number;
  manaRegen: number;
  castDelay: number;
  reload: number;
  spread: number;
  color: number;
  slots: (string | null)[];
  mana: number;
  ptr = 0;
  cooldown = 0;
  reloading = false;
  cooldownMax = 1;

  constructor(s: WandStats, cards: (string | null)[] = []) {
    this.name = s.name;
    this.capacity = s.capacity;
    this.manaMax = s.manaMax;
    this.manaRegen = s.manaRegen;
    this.castDelay = s.castDelay;
    this.reload = s.reload;
    this.spread = s.spread;
    this.color = s.color;
    this.slots = [];
    for (let k = 0; k < s.capacity; k++) this.slots.push(cards[k] ?? null);
    this.mana = s.manaMax;
  }

  tick(): void {
    this.mana = Math.min(this.manaMax, this.mana + this.manaRegen / 60);
    if (this.cooldown > 0) {
      this.cooldown--;
      if (this.cooldown <= 0) this.reloading = false;
    }
  }

  /** 슬롯 편집 시 포인터 초기화 */
  resetCycle(): void {
    this.ptr = 0;
  }

  /** 시전 시도. 성공하면 노드 목록, 마나 부족이면 'fizzle', 대기 중이면 null */
  tryCast(): CastNode[] | 'fizzle' | null {
    if (this.cooldown > 0) return null;
    const n = this.slots.length;
    if (!this.slots.some((s) => s)) return null;
    let ptr = this.ptr;
    let wrapped = false;
    const used = new Set<number>();
    let cost = 0;
    let extraDelay = 0;
    const next = (): CardDef | null => {
      for (let guard = 0; guard < n * 2 + 2; guard++) {
        if (ptr >= n) {
          if (wrapped) return null;
          wrapped = true;
          ptr = 0;
        }
        const idx = ptr++;
        const id = this.slots[idx];
        if (!id || used.has(idx)) continue;
        used.add(idx);
        const c = card(id);
        cost += c.mana;
        extraDelay += c.delay;
        return c;
      }
      return null;
    };
    const parse = (depth: number): CastNode[] => {
      if (depth > 24) return [];
      const c = next();
      if (!c) return [];
      if (c.kind === 'proj') return [{ card: c, mods: newMods(), payload: null, angle: 0 }];
      if (c.kind === 'mod') {
        const nodes = parse(depth + 1);
        if (c.id === 'trigger') {
          const payload = parse(depth + 1);
          if (payload.length) for (const nd of nodes) nd.payload = payload;
        } else {
          for (const nd of nodes) applyMod(nd.mods, c.id);
        }
        return nodes;
      }
      // 다중 시전
      if (c.id === 'circle') {
        const nodes = parse(depth + 1);
        const out: CastNode[] = [];
        for (let a = 0; a < 8; a++) {
          for (const nd of nodes) out.push({ card: nd.card, mods: { ...nd.mods }, payload: nd.payload, angle: nd.angle + (a * Math.PI) / 4 });
        }
        return out;
      }
      const k = c.id === 'double' ? 2 : c.id === 'triple' ? 3 : 4;
      const spreadDeg = c.id === 'double' ? 5 : c.id === 'triple' ? 8 : 30;
      const out: CastNode[] = [];
      for (let s = 0; s < k; s++) {
        const sub = parse(depth + 1);
        const off = (s / (k - 1) - 0.5) * 2 * spreadDeg * (Math.PI / 180);
        for (const nd of sub) {
          nd.angle += off;
          out.push(nd);
        }
      }
      return out;
    };
    const nodes = parse(0);
    if (nodes.length === 0) {
      // 투사체가 없는 구성: 순환만 진행
      this.ptr = 0;
      this.cooldown = this.reload;
      this.cooldownMax = this.cooldown;
      this.reloading = true;
      return null;
    }
    if (this.mana < cost) {
      this.cooldown = 12;
      this.cooldownMax = 12;
      return 'fizzle';
    }
    this.mana -= cost;
    // 다음 카드가 남았는지 확인
    let remaining = false;
    if (!wrapped) for (let k = ptr; k < n; k++) if (this.slots[k]) remaining = true;
    if (wrapped || !remaining) {
      this.ptr = 0;
      this.cooldown = Math.max(this.castDelay + extraDelay, this.reload);
      this.reloading = true;
    } else {
      this.ptr = ptr;
      this.cooldown = Math.max(1, this.castDelay + extraDelay);
    }
    this.cooldownMax = this.cooldown;
    return nodes;
  }
}

// ---------- 지팡이 생성 ----------
const WAND_ADJ = ['낡은', '견고한', '빛나는', '저주받은', '고대의', '불안정한', '정교한', '거친', '신성한', '심연의'];
const WAND_NOUN = ['나뭇가지', '지팡이', '홀', '막대', '완드', '봉'];
const WAND_COLORS = [0x8a5a2a, 0x6a6a7a, 0xb08030, 0x5a3a8a, 0x2a7a6a, 0xa03a3a, 0x3a5aa0];

export function randomWand(tier: number, rnd: () => number): Wand {
  const t = Math.max(1, Math.min(6, tier));
  const capacity = Math.min(10, 2 + Math.floor(rnd() * (2 + t)) + Math.floor(t / 2));
  const stats: WandStats = {
    name: WAND_ADJ[Math.floor(rnd() * WAND_ADJ.length)] + ' ' + WAND_NOUN[Math.floor(rnd() * WAND_NOUN.length)],
    capacity,
    manaMax: Math.round(80 + t * 60 + rnd() * 120 * t),
    manaRegen: Math.round(20 + t * 12 + rnd() * 30 * t),
    castDelay: Math.max(2, Math.round(16 - t * 2 - rnd() * 8)),
    reload: Math.max(6, Math.round(50 - t * 6 - rnd() * 20)),
    spread: Math.round(rnd() * 8 - t),
    color: WAND_COLORS[Math.floor(rnd() * WAND_COLORS.length)],
  };
  stats.spread = Math.max(0, stats.spread);
  const w = new Wand(stats);
  // 무작위 카드 일부 장착
  const nCards = Math.min(capacity, 1 + Math.floor(rnd() * 3));
  const projs = PLAYER_CARDS.filter((c) => c.kind === 'proj' && c.tier <= t);
  const others = PLAYER_CARDS.filter((c) => c.kind !== 'proj' && c.tier <= t);
  for (let k = 0; k < nCards; k++) {
    const pool = k === nCards - 1 || rnd() < 0.6 ? projs : others;
    w.slots[k] = pool[Math.floor(rnd() * pool.length)].id;
  }
  if (!w.slots.some((s) => s && card(s).kind === 'proj')) w.slots[nCards - 1] = projs[0].id;
  return w;
}

export function randomCard(tier: number, rnd: () => number): string {
  const pool = PLAYER_CARDS.filter((c) => c.tier <= Math.max(1, tier));
  return pool[Math.floor(rnd() * pool.length)].id;
}

export function wandValue(w: Wand): number {
  return Math.round(60 + w.capacity * 25 + w.manaMax * 0.25 + w.manaRegen * 0.8 + (20 - w.castDelay) * 4 + (60 - w.reload) * 1.5);
}

export function starterWands(): Wand[] {
  return [
    new Wand({ name: '견습생의 지팡이', capacity: 4, manaMax: 140, manaRegen: 45, castDelay: 6, reload: 22, spread: 2, color: 0x8a5a2a }, ['spark', 'spark', 'fireball', null]),
    new Wand({ name: '광부의 지팡이', capacity: 3, manaMax: 120, manaRegen: 60, castDelay: 3, reload: 8, spread: 0, color: 0x6a6a7a }, ['dig', null, null]),
    new Wand({ name: '폭파공의 막대', capacity: 2, manaMax: 100, manaRegen: 22, castDelay: 10, reload: 30, spread: 3, color: 0xa03a3a }, ['bomb', null]),
  ];
}
