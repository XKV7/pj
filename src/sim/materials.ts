// 재질 정의 테이블. 시뮬레이션의 모든 셀은 이 테이블의 ID 하나를 가진다.
// 핫 루프에서 쓰기 위해 속성을 TypedArray(재질 ID 인덱스)로 펼쳐 둔다.

export const Cat = {
  EMPTY: 0,
  SOLID: 1,
  POWDER: 2,
  LIQUID: 3,
  GAS: 4,
  ENERGY: 5,
} as const;

export const M = {
  EMPTY: 0,
  STONE: 1,
  DIRT: 2,
  WOOD: 3,
  METAL: 4,
  ICE: 5,
  SAND: 6,
  ASH: 7,
  GUNPOWDER: 8,
  WATER: 9,
  OIL: 10,
  ACID: 11,
  LAVA: 12,
  POISON: 13,
  STEAM: 14,
  SMOKE: 15,
  TOXGAS: 16,
  FIRE: 17,
  SPARK: 18,
  GOLD: 19,
  GOLD_DUST: 20,
  GOLD_LIQ: 21,
  BEDROCK: 22,
  GLASS: 23,
  FUNGUS: 24,
  FROST: 25,
  CRYSTAL: 26,
} as const;

export const NUM_MATS = 27;

export type DamageType = 'magic' | 'fire' | 'acid' | 'ice' | 'elec' | 'explosion' | 'poison' | 'physical';

export interface MatDef {
  id: number;
  name: string;
  cat: number;
  density: number;
  colors: number[];
  hardness: number; // 굴착/폭발 저항 (255 = 파괴 불가)
  cond: number; // 열전도 0..255
  tempInit?: number; // 생성 시 온도 (없으면 주변 온도)
  heat?: number; // 고정 온도 열원
  flammable?: number; // 불 접촉 시 점화 확률
  ignite?: number; // 발화점
  burnLife?: [number, number];
  burnInto?: number; // 연소 후 남는 재질
  explosive?: number; // 점화 시 폭발 반경
  meltAt?: number;
  meltInto?: number;
  freezeAt?: number;
  freezeInto?: number;
  boilAt?: number;
  boilInto?: number;
  life?: [number, number];
  decayInto?: number;
  decayChance?: number; // 수명 종료 시 decayInto 가 될 확률 (나머지는 빈칸)
  dispersion?: number;
  viscosity?: number; // 프레임당 정지 확률
  conductive?: boolean;
  light?: [number, number, number];
  damage?: number; // 초당 접촉 피해
  dmgType?: DamageType;
  digInto?: number; // 굴착 시 변환 재질
  coolShift?: number; // 주변 온도로 식는 속도 (클수록 느림)
}

const D: MatDef[] = [];
function def(d: MatDef): void {
  D[d.id] = d;
}

def({ id: M.EMPTY, name: '공기', cat: Cat.EMPTY, density: 0, colors: [0x000000], hardness: 0, cond: 0 });
def({ id: M.STONE, name: '돌', cat: Cat.SOLID, density: 50, colors: [0x55525a, 0x5d5963, 0x4c4950, 0x625e68, 0x47444b], hardness: 6, cond: 60 });
def({ id: M.DIRT, name: '흙', cat: Cat.SOLID, density: 40, colors: [0x5a3f2a, 0x644630, 0x4f3724, 0x6b4c34, 0x553b27], hardness: 3, cond: 40 });
def({
  id: M.WOOD, name: '나무', cat: Cat.SOLID, density: 7, colors: [0x6e4a26, 0x7a532b, 0x634221, 0x845d33],
  hardness: 3, cond: 50, flammable: 0.12, ignite: 210, burnLife: [90, 170], burnInto: M.ASH,
});
def({ id: M.METAL, name: '금속', cat: Cat.SOLID, density: 80, colors: [0x7d8590, 0x8a929c, 0x737a84, 0x949ca6], hardness: 9, cond: 230, conductive: true, meltAt: 1500, meltInto: M.LAVA });
def({ id: M.ICE, name: '얼음', cat: Cat.SOLID, density: 9, colors: [0xa8d8f0, 0xb8e2f6, 0x98cce8, 0xc6ecfa], hardness: 3, cond: 120, tempInit: -15, meltAt: 3, meltInto: M.WATER });
def({ id: M.SAND, name: '모래', cat: Cat.POWDER, density: 15, colors: [0xd8c088, 0xccb47c, 0xe2ca92, 0xc4ac72], hardness: 1, cond: 40, meltAt: 1000, meltInto: M.GLASS });
def({ id: M.ASH, name: '재', cat: Cat.POWDER, density: 5, colors: [0x6a6a6a, 0x7a7876, 0x5c5b5a, 0x878581], hardness: 1, cond: 30 });
def({
  id: M.GUNPOWDER, name: '화약', cat: Cat.POWDER, density: 13, colors: [0x2e2c2c, 0x3a3634, 0x262424, 0x45403c],
  hardness: 1, cond: 60, flammable: 1, ignite: 170, explosive: 5,
});
def({
  id: M.WATER, name: '물', cat: Cat.LIQUID, density: 10, colors: [0x2a5cb8, 0x2f64c2, 0x2656ae, 0x3369c8],
  hardness: 0, cond: 120, freezeAt: -1, freezeInto: M.ICE, boilAt: 100, boilInto: M.STEAM, dispersion: 5, conductive: true, coolShift: 6,
});
def({
  id: M.OIL, name: '기름', cat: Cat.LIQUID, density: 8, colors: [0x3a2c18, 0x45341c, 0x332714, 0x4c3a22],
  hardness: 0, cond: 50, flammable: 0.35, ignite: 190, burnLife: [40, 80], burnInto: M.SMOKE, dispersion: 3, viscosity: 0.25,
});
def({
  id: M.ACID, name: '산', cat: Cat.LIQUID, density: 12, colors: [0x7cf04a, 0x8cff58, 0x6ad83c, 0x98ff6a],
  hardness: 0, cond: 80, dispersion: 4, conductive: true, light: [0.15, 0.4, 0.08], damage: 35, dmgType: 'acid', boilAt: 220, boilInto: M.TOXGAS,
});
def({
  id: M.LAVA, name: '용암', cat: Cat.LIQUID, density: 22, colors: [0xff6a10, 0xff8a20, 0xe84808, 0xffb040, 0xd83a04],
  hardness: 0, cond: 255, heat: 1100, dispersion: 2, viscosity: 0.65, light: [1.0, 0.45, 0.1], damage: 70, dmgType: 'fire',
});
def({
  id: M.POISON, name: '독액', cat: Cat.LIQUID, density: 11, colors: [0x8a3cc0, 0x9a48d0, 0x7a30ae, 0xa858de],
  hardness: 0, cond: 70, dispersion: 3, viscosity: 0.15, boilAt: 140, boilInto: M.TOXGAS, light: [0.18, 0.05, 0.25], damage: 14, dmgType: 'poison',
});
def({
  id: M.STEAM, name: '증기', cat: Cat.GAS, density: 2, colors: [0xc8ccd4, 0xd4d8e0, 0xbcc0c8, 0xe0e4ea],
  hardness: 0, cond: 40, tempInit: 130, freezeAt: 55, freezeInto: M.WATER, life: [260, 520], decayInto: M.WATER, decayChance: 0.35, coolShift: 7, damage: 6, dmgType: 'fire',
});
def({ id: M.SMOKE, name: '연기', cat: Cat.GAS, density: 3, colors: [0x3c3a3c, 0x484648, 0x323032, 0x524f52], hardness: 0, cond: 10, life: [70, 200], decayInto: M.EMPTY, decayChance: 0 });
def({
  id: M.TOXGAS, name: '독가스', cat: Cat.GAS, density: 4, colors: [0x6aa83a, 0x78b844, 0x5e9832, 0x86c852],
  hardness: 0, cond: 10, life: [400, 800], decayInto: M.EMPTY, decayChance: 0, flammable: 1, ignite: 300, explosive: 4, damage: 10, dmgType: 'poison',
});
def({
  id: M.FIRE, name: '불', cat: Cat.ENERGY, density: 1, colors: [0xff5a10, 0xff8a1a, 0xffc030, 0xff3c08, 0xffe070],
  hardness: 0, cond: 255, heat: 650, life: [18, 45], decayInto: M.SMOKE, decayChance: 0.25, light: [1.0, 0.55, 0.15], damage: 18, dmgType: 'fire',
});
def({
  id: M.SPARK, name: '전기', cat: Cat.ENERGY, density: 1, colors: [0xe8f4ff, 0x9ad0ff, 0xffffff, 0x7ab8ff],
  hardness: 0, cond: 0, life: [5, 12], decayInto: M.EMPTY, decayChance: 0, light: [0.55, 0.75, 1.0], damage: 40, dmgType: 'elec',
});
def({ id: M.GOLD, name: '금', cat: Cat.SOLID, density: 60, colors: [0xe8b830, 0xf8d050, 0xd8a420, 0xffe070], hardness: 4, cond: 200, conductive: true, meltAt: 950, meltInto: M.GOLD_LIQ, digInto: M.GOLD_DUST, light: [0.08, 0.06, 0.0] });
def({ id: M.GOLD_DUST, name: '금가루', cat: Cat.POWDER, density: 19, colors: [0xf0c040, 0xffd860, 0xd8a828, 0xfff090], hardness: 1, cond: 200, conductive: true, meltAt: 950, meltInto: M.GOLD_LIQ, light: [0.06, 0.05, 0.0] });
def({
  id: M.GOLD_LIQ, name: '녹은 금', cat: Cat.LIQUID, density: 19, colors: [0xffb030, 0xffc848, 0xf09820, 0xffe080],
  hardness: 0, cond: 200, tempInit: 1050, freezeAt: 900, freezeInto: M.GOLD_DUST, dispersion: 2, viscosity: 0.4, light: [0.9, 0.6, 0.1], damage: 40, dmgType: 'fire', coolShift: 6, conductive: true,
});
def({ id: M.BEDROCK, name: '기반암', cat: Cat.SOLID, density: 255, colors: [0x1c1a20, 0x221f26, 0x18161b, 0x262329], hardness: 255, cond: 0 });
def({ id: M.GLASS, name: '유리', cat: Cat.SOLID, density: 40, colors: [0x9ec8d0, 0xb0d8de, 0x8cbcc4, 0xc4e6ea], hardness: 4, cond: 60 });
def({
  id: M.FUNGUS, name: '버섯', cat: Cat.SOLID, density: 20, colors: [0x5ac090, 0x6ad8a0, 0x4aa87c, 0x86e8b8, 0xb05ac8],
  hardness: 1, cond: 40, flammable: 0.08, ignite: 200, burnLife: [40, 90], burnInto: M.TOXGAS, light: [0.05, 0.22, 0.14],
});
def({
  id: M.FROST, name: '냉기', cat: Cat.ENERGY, density: 3, colors: [0xd8f4ff, 0xb8e8ff, 0xf0faff, 0xa0dcf8],
  hardness: 0, cond: 255, heat: -80, life: [30, 70], decayInto: M.EMPTY, decayChance: 0, light: [0.1, 0.25, 0.35], damage: 6, dmgType: 'ice',
});
def({ id: M.CRYSTAL, name: '결정', cat: Cat.SOLID, density: 70, colors: [0x9a5ae8, 0xb47cf8, 0x8448d0, 0xd0a0ff], hardness: 8, cond: 100, light: [0.25, 0.1, 0.4] });

export const MATS: readonly MatDef[] = D;

// ---- 핫 루프용 펼친 속성 배열 ----
export const CAT = new Uint8Array(NUM_MATS);
export const DENS = new Int16Array(NUM_MATS);
export const HARD = new Uint8Array(NUM_MATS);
export const COND = new Int16Array(NUM_MATS);
export const IS_SOURCE = new Uint8Array(NUM_MATS);
export const HEAT = new Int16Array(NUM_MATS);
export const TINIT = new Int16Array(NUM_MATS); // -32768 = 주변 온도
export const DISP = new Uint8Array(NUM_MATS);
export const VISC = new Float32Array(NUM_MATS);
export const CONDUCTIVE = new Uint8Array(NUM_MATS);
export const BLOCKS = new Uint8Array(NUM_MATS); // 엔티티 충돌 (고체+가루)
export const IS_FLUIDISH = new Uint8Array(NUM_MATS); // 액체/기체/에너지
export const COOLDIV = new Int32Array(NUM_MATS);
export const COOLMASK = new Uint8Array(NUM_MATS);
export const FLAM = new Float32Array(NUM_MATS);
export const IGN = new Int16Array(NUM_MATS);
export const MELT_AT = new Int16Array(NUM_MATS);
export const MELT_INTO = new Uint8Array(NUM_MATS);
export const FREEZE_AT = new Int16Array(NUM_MATS);
export const FREEZE_INTO = new Uint8Array(NUM_MATS);
export const BOIL_AT = new Int16Array(NUM_MATS);
export const BOIL_INTO = new Uint8Array(NUM_MATS);
export const BURN_INTO = new Uint8Array(NUM_MATS);
export const EXPLOSIVE = new Uint8Array(NUM_MATS);
export const LIFE_MIN = new Uint16Array(NUM_MATS);
export const LIFE_RANGE = new Uint16Array(NUM_MATS);
export const DECAY_INTO = new Uint8Array(NUM_MATS);
export const DECAY_CHANCE = new Float32Array(NUM_MATS);
export const LIGHT_R = new Float32Array(NUM_MATS);
export const LIGHT_G = new Float32Array(NUM_MATS);
export const LIGHT_B = new Float32Array(NUM_MATS);
export const EMISSIVE = new Uint8Array(NUM_MATS);

for (let m = 0; m < NUM_MATS; m++) {
  const d = D[m];
  CAT[m] = d.cat;
  DENS[m] = d.density;
  HARD[m] = d.hardness;
  COND[m] = d.cond;
  IS_SOURCE[m] = d.heat !== undefined ? 1 : 0;
  HEAT[m] = d.heat ?? 0;
  TINIT[m] = d.heat ?? d.tempInit ?? -32768;
  DISP[m] = d.dispersion ?? 0;
  VISC[m] = d.viscosity ?? 0;
  CONDUCTIVE[m] = d.conductive ? 1 : 0;
  BLOCKS[m] = d.cat === Cat.SOLID || d.cat === Cat.POWDER ? 1 : 0;
  IS_FLUIDISH[m] = d.cat === Cat.LIQUID || d.cat === Cat.GAS || d.cat === Cat.ENERGY ? 1 : 0;
  const shift = d.coolShift ?? (d.cat === Cat.GAS ? 7 : 5);
  COOLDIV[m] = 1 << shift;
  COOLMASK[m] = d.cat === Cat.SOLID || d.cat === Cat.POWDER ? 31 : d.cat === Cat.LIQUID ? 7 : 3;
  FLAM[m] = d.flammable ?? 0;
  IGN[m] = d.ignite ?? 32767;
  MELT_AT[m] = d.meltAt ?? 32767;
  MELT_INTO[m] = d.meltInto ?? 0;
  FREEZE_AT[m] = d.freezeAt ?? -32768;
  FREEZE_INTO[m] = d.freezeInto ?? 0;
  BOIL_AT[m] = d.boilAt ?? 32767;
  BOIL_INTO[m] = d.boilInto ?? 0;
  BURN_INTO[m] = d.burnInto ?? 0;
  EXPLOSIVE[m] = d.explosive ?? 0;
  LIFE_MIN[m] = d.life ? d.life[0] : 0;
  LIFE_RANGE[m] = d.life ? d.life[1] - d.life[0] + 1 : 0;
  DECAY_INTO[m] = d.decayInto ?? 0;
  DECAY_CHANCE[m] = d.decayChance ?? 0;
  if (d.light) {
    LIGHT_R[m] = d.light[0];
    LIGHT_G[m] = d.light[1];
    LIGHT_B[m] = d.light[2];
    EMISSIVE[m] = 1;
  }
}

/** 재질별 256단계 색 변이 테이블 (ABGR, ImageData Uint32 뷰용) */
export const COLOR_TABLE = new Uint32Array(NUM_MATS * 256);
export function rgbToAbgr(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
for (let m = 0; m < NUM_MATS; m++) {
  const cols = D[m].colors;
  for (let s = 0; s < 256; s++) {
    const base = cols[s % cols.length];
    const j = ((s >> 4) & 7) - 3;
    const r = Math.max(0, Math.min(255, ((base >> 16) & 255) + j * 3));
    const g = Math.max(0, Math.min(255, ((base >> 8) & 255) + j * 3));
    const b = Math.max(0, Math.min(255, (base & 255) + j * 3));
    COLOR_TABLE[m * 256 + s] = rgbToAbgr((r << 16) | (g << 8) | b);
  }
}

export function matName(m: number): string {
  return D[m]?.name ?? '?';
}
