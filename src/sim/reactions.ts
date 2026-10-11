// 반응 규칙 데이터 테이블.
// a = 능동 재질 (업데이트되는 셀), b = 이웃 재질. 매 틱 무작위 이웃 하나를 검사한다.
// toA/toB: 결과 재질 (KEEP = 그대로, IGNITE = 점화(연소 상태로 전환))
import { M, NUM_MATS } from './materials';

export const KEEP = -1;
export const IGNITE = -2;

export interface Reaction {
  name: string;
  a: number;
  b: number;
  chance: number;
  toA: number;
  toB: number;
  explode?: number; // b 위치에서 폭발 반경
}

export const REACTIONS: Reaction[] = [
  // --- 연소 ---
  { name: '불 + 나무 → 확산 연소', a: M.FIRE, b: M.WOOD, chance: 0.12, toA: KEEP, toB: IGNITE },
  { name: '불 + 기름 → 확산 연소', a: M.FIRE, b: M.OIL, chance: 0.45, toA: KEEP, toB: IGNITE },
  { name: '불 + 버섯 → 연소 (독가스 방출)', a: M.FIRE, b: M.FUNGUS, chance: 0.08, toA: KEEP, toB: IGNITE },
  { name: '불 + 화약 → 폭발', a: M.FIRE, b: M.GUNPOWDER, chance: 0.9, toA: KEEP, toB: M.EMPTY, explode: 5 },
  { name: '불 + 독가스 → 폭발', a: M.FIRE, b: M.TOXGAS, chance: 0.6, toA: KEEP, toB: M.EMPTY, explode: 4 },
  { name: '불 + 얼음 → 물', a: M.FIRE, b: M.ICE, chance: 0.15, toA: M.STEAM, toB: M.WATER },
  { name: '불 + 독액 → 독가스', a: M.FIRE, b: M.POISON, chance: 0.08, toA: KEEP, toB: M.TOXGAS },
  // --- 물 ---
  { name: '물 + 용암 → 돌 + 증기', a: M.WATER, b: M.LAVA, chance: 0.6, toA: M.STEAM, toB: M.STONE },
  { name: '물 + 불 → 증기', a: M.WATER, b: M.FIRE, chance: 0.7, toA: KEEP, toB: M.STEAM },
  { name: '물 + 녹은 금 → 금가루 + 증기', a: M.WATER, b: M.GOLD_LIQ, chance: 0.5, toA: M.STEAM, toB: M.GOLD_DUST },
  { name: '물 + 독액 → 오염', a: M.POISON, b: M.WATER, chance: 0.004, toA: KEEP, toB: M.POISON },
  // --- 용암 ---
  { name: '용암 + 나무 → 점화', a: M.LAVA, b: M.WOOD, chance: 0.1, toA: KEEP, toB: IGNITE },
  { name: '용암 + 기름 → 점화', a: M.LAVA, b: M.OIL, chance: 0.6, toA: KEEP, toB: IGNITE },
  { name: '용암 + 화약 → 폭발', a: M.LAVA, b: M.GUNPOWDER, chance: 0.9, toA: KEEP, toB: M.EMPTY, explode: 5 },
  { name: '용암 + 독가스 → 폭발', a: M.LAVA, b: M.TOXGAS, chance: 0.6, toA: KEEP, toB: M.EMPTY, explode: 4 },
  { name: '용암 + 얼음 → 돌 + 물', a: M.LAVA, b: M.ICE, chance: 0.3, toA: M.STONE, toB: M.WATER },
  { name: '용암 + 모래 → 유리', a: M.LAVA, b: M.SAND, chance: 0.02, toA: KEEP, toB: M.GLASS },
  { name: '용암 + 독액 → 독가스 + 돌', a: M.LAVA, b: M.POISON, chance: 0.3, toA: M.STONE, toB: M.TOXGAS },
  { name: '용암 + 산 → 독가스', a: M.LAVA, b: M.ACID, chance: 0.3, toA: KEEP, toB: M.TOXGAS },
  // --- 산 (소모되며 녹임) ---
  { name: '산 + 돌 → 녹임', a: M.ACID, b: M.STONE, chance: 0.06, toA: M.EMPTY, toB: M.EMPTY },
  { name: '산 + 흙 → 녹임', a: M.ACID, b: M.DIRT, chance: 0.12, toA: M.EMPTY, toB: M.EMPTY },
  { name: '산 + 나무 → 녹임 (연기)', a: M.ACID, b: M.WOOD, chance: 0.1, toA: M.EMPTY, toB: M.SMOKE },
  { name: '산 + 금속 → 느리게 녹임', a: M.ACID, b: M.METAL, chance: 0.006, toA: M.EMPTY, toB: M.EMPTY },
  { name: '산 + 얼음 → 물', a: M.ACID, b: M.ICE, chance: 0.12, toA: M.WATER, toB: M.WATER },
  { name: '산 + 모래 → 녹임', a: M.ACID, b: M.SAND, chance: 0.1, toA: M.EMPTY, toB: M.EMPTY },
  { name: '산 + 재 → 녹임', a: M.ACID, b: M.ASH, chance: 0.15, toA: KEEP, toB: M.EMPTY },
  { name: '산 + 버섯 → 녹임', a: M.ACID, b: M.FUNGUS, chance: 0.15, toA: M.EMPTY, toB: M.TOXGAS },
  { name: '산 + 결정 → 아주 느리게 녹임', a: M.ACID, b: M.CRYSTAL, chance: 0.003, toA: M.EMPTY, toB: M.EMPTY },
  { name: '산 + 물 → 희석', a: M.ACID, b: M.WATER, chance: 0.003, toA: M.WATER, toB: KEEP },
  // --- 증기 / 냉기 ---
  { name: '증기 + 얼음 → 응결', a: M.STEAM, b: M.ICE, chance: 0.2, toA: M.WATER, toB: KEEP },
  { name: '냉기 + 물 → 얼음', a: M.FROST, b: M.WATER, chance: 0.5, toA: KEEP, toB: M.ICE },
  { name: '냉기 + 용암 → 돌', a: M.FROST, b: M.LAVA, chance: 0.35, toA: M.STEAM, toB: M.STONE },
  { name: '냉기 + 불 → 소화', a: M.FROST, b: M.FIRE, chance: 0.6, toA: KEEP, toB: M.SMOKE },
  { name: '냉기 + 증기 → 물', a: M.FROST, b: M.STEAM, chance: 0.4, toA: KEEP, toB: M.WATER },
  { name: '냉기 + 녹은 금 → 금가루', a: M.FROST, b: M.GOLD_LIQ, chance: 0.4, toA: KEEP, toB: M.GOLD_DUST },
  { name: '냉기 + 산 → 얼음', a: M.FROST, b: M.ACID, chance: 0.1, toA: KEEP, toB: M.ICE },
  // --- 전기 ---
  { name: '전기 + 기름 → 점화', a: M.SPARK, b: M.OIL, chance: 0.5, toA: KEEP, toB: IGNITE },
  { name: '전기 + 나무 → 점화', a: M.SPARK, b: M.WOOD, chance: 0.08, toA: KEEP, toB: IGNITE },
  { name: '전기 + 화약 → 폭발', a: M.SPARK, b: M.GUNPOWDER, chance: 0.9, toA: KEEP, toB: M.EMPTY, explode: 5 },
  { name: '전기 + 독가스 → 폭발', a: M.SPARK, b: M.TOXGAS, chance: 0.7, toA: KEEP, toB: M.EMPTY, explode: 4 },
  // --- 기타 ---
  { name: '녹은 금 + 나무 → 점화', a: M.GOLD_LIQ, b: M.WOOD, chance: 0.1, toA: KEEP, toB: IGNITE },
  { name: '녹은 금 + 얼음 → 굳음', a: M.GOLD_LIQ, b: M.ICE, chance: 0.3, toA: M.GOLD_DUST, toB: M.WATER },
];

/** RX[a * NUM_MATS + b] = 반응 인덱스 (-1 없음) */
export const RX = new Int16Array(NUM_MATS * NUM_MATS).fill(-1);
/** 능동 재질 여부 */
export const REACTS = new Uint8Array(NUM_MATS);

REACTIONS.forEach((r, idx) => {
  RX[r.a * NUM_MATS + r.b] = idx;
  REACTS[r.a] = 1;
});
