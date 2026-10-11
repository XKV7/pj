import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { M } from '../src/sim/materials';
import { REACTIONS } from '../src/sim/reactions';

function box(w: World): void {
  w.frameBedrock();
}

function fresh(W = 64, H = 64): World {
  const w = new World(W, H, 7);
  w.setFullActiveRegion();
  box(w);
  return w;
}

describe('반응 테이블', () => {
  it('25개 이상의 반응 규칙을 데이터로 정의한다', () => {
    expect(REACTIONS.length).toBeGreaterThanOrEqual(25);
  });
});

describe('핵심 반응', () => {
  it('물 + 용암 → 돌 + 증기', () => {
    const w = fresh();
    for (let x = 10; x < 50; x++) for (let y = 50; y < 62; y++) w.set(x, y, M.LAVA);
    for (let x = 10; x < 50; x++) for (let y = 40; y < 50; y++) w.set(x, y, M.WATER);
    let sawSteam = false;
    for (let k = 0; k < 40; k++) {
      w.step();
      if (w.countMat(M.STEAM) > 0) sawSteam = true;
    }
    expect(w.countMat(M.STONE)).toBeGreaterThan(5);
    expect(sawSteam).toBe(true);
  });

  it('불은 나무를 따라 번지고 재를 남긴다', () => {
    const w = fresh();
    for (let x = 5; x < 59; x++) for (let y = 40; y < 46; y++) w.set(x, y, M.WOOD);
    const wood0 = w.countMat(M.WOOD);
    w.set(6, 39, M.FIRE);
    w.set(7, 39, M.FIRE);
    w.ignite(6, 40);
    w.run(400);
    expect(w.countMat(M.WOOD)).toBeLessThan(wood0 * 0.7);
  });

  it('불 + 화약 → 폭발 (연쇄)', () => {
    const w = fresh();
    let explosions = 0;
    w.onExplosion = () => explosions++;
    for (let x = 10; x < 54; x++) for (let y = 56; y < 63; y++) w.set(x, y, M.GUNPOWDER);
    w.run(5);
    w.fillCircle(30, 54, 1, M.FIRE);
    w.run(120);
    expect(explosions).toBeGreaterThan(2);
    expect(w.countMat(M.GUNPOWDER)).toBeLessThan(100);
  });

  it('산은 돌을 녹이며 소모된다', () => {
    const w = fresh();
    for (let x = 1; x < 63; x++) for (let y = 40; y < 63; y++) w.set(x, y, M.STONE);
    const stone0 = w.countMat(M.STONE);
    for (let x = 20; x < 40; x++) for (let y = 30; y < 40; y++) w.set(x, y, M.ACID);
    const acid0 = w.countMat(M.ACID);
    w.run(300);
    expect(w.countMat(M.STONE)).toBeLessThan(stone0);
    expect(w.countMat(M.ACID)).toBeLessThan(acid0);
  });

  it('산은 금속을 아주 느리게 녹인다', () => {
    const w = fresh();
    for (let x = 1; x < 63; x++) for (let y = 40; y < 63; y++) w.set(x, y, M.METAL);
    for (let x = 20; x < 40; x++) for (let y = 34; y < 40; y++) w.set(x, y, M.ACID);
    const acid0 = w.countMat(M.ACID);
    w.run(60);
    expect(w.countMat(M.ACID)).toBeGreaterThan(acid0 * 0.6);
  });

  it('얼음 + 열 → 물', () => {
    const w = fresh();
    for (let x = 20; x < 40; x++) for (let y = 50; y < 60; y++) w.set(x, y, M.ICE);
    w.heatArea(30, 55, 12, 60);
    w.run(10);
    expect(w.countMat(M.WATER)).toBeGreaterThan(20);
  });

  it('물 + 냉기 → 얼음', () => {
    const w = fresh();
    for (let x = 1; x < 63; x++) for (let y = 50; y < 63; y++) w.set(x, y, M.WATER);
    w.fillCircle(30, 46, 5, M.FROST);
    w.run(60);
    expect(w.countMat(M.ICE)).toBeGreaterThan(10);
  });

  it('주변 온도가 영하면 물이 얼어붙는다', () => {
    const w = new World(32, 32, 3);
    w.ambient = -15;
    w.setFullActiveRegion();
    w.frameBedrock();
    for (let x = 1; x < 31; x++) for (let y = 25; y < 31; y++) w.set(x, y, M.WATER);
    for (let x = 1; x < 31; x++) for (let y = 25; y < 31; y++) w.temp[y * 32 + x] = 10;
    w.run(1500);
    expect(w.countMat(M.ICE)).toBeGreaterThan(100);
  });

  it('전기는 연결된 물 전체로 전도된다', () => {
    const w = fresh(128, 32);
    for (let x = 1; x < 127; x++) for (let y = 24; y < 31; y++) w.set(x, y, M.WATER);
    w.run(5);
    w.set(3, 22, M.SPARK);
    w.set(3, 23, M.SPARK);
    w.step();
    w.step();
    // 멀리 떨어진 물도 대전
    let far = 0;
    for (let x = 100; x < 127; x++) for (let y = 26; y < 31; y++) if (w.charge[y * 128 + x] > 0) far++;
    expect(far).toBeGreaterThan(20);
  });

  it('전기는 금속을 따라 전도되어 화약을 터뜨린다', () => {
    const w = fresh(128, 32);
    let explosions = 0;
    w.onExplosion = () => explosions++;
    for (let x = 5; x < 120; x++) w.set(x, 20, M.METAL);
    for (let x = 116; x < 122; x++) for (let y = 15; y < 20; y++) w.set(x, y, M.GUNPOWDER);
    w.run(30);
    w.set(5, 19, M.SPARK);
    w.run(30);
    expect(explosions).toBeGreaterThan(0);
  });

  it('증기는 식으면 물로 응결된다', () => {
    const w = fresh();
    for (let x = 20; x < 40; x++) for (let y = 40; y < 50; y++) w.set(x, y, M.STEAM);
    w.run(900);
    expect(w.countMat(M.WATER)).toBeGreaterThan(5);
  });

  it('연기는 시간이 지나면 소멸한다', () => {
    const w = fresh();
    for (let x = 20; x < 40; x++) for (let y = 40; y < 50; y++) w.set(x, y, M.SMOKE);
    w.run(260);
    expect(w.countMat(M.SMOKE)).toBe(0);
  });

  it('독가스 + 불 → 폭발', () => {
    const w = fresh();
    let explosions = 0;
    w.onExplosion = () => explosions++;
    for (let x = 20; x < 40; x++) for (let y = 30; y < 40; y++) w.set(x, y, M.TOXGAS);
    w.set(30, 41, M.FIRE);
    w.fillCircle(30, 42, 2, M.FIRE);
    w.run(60);
    expect(explosions).toBeGreaterThan(0);
  });

  it('기름은 물 위에 뜬다 (밀도 층 분리)', () => {
    const w = fresh(32, 64);
    for (let x = 1; x < 31; x++) for (let y = 10; y < 20; y++) w.set(x, y, M.WATER);
    for (let x = 1; x < 31; x++) for (let y = 20; y < 30; y++) w.set(x, y, M.OIL);
    w.run(600);
    let oilY = 0;
    let waterY = 0;
    let no = 0;
    let nw = 0;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 32; x++) {
        const m = w.mat[y * 32 + x];
        if (m === M.OIL) { oilY += y; no++; }
        if (m === M.WATER) { waterY += y; nw++; }
      }
    expect(oilY / no).toBeLessThan(waterY / nw);
  });

  it('모래는 떨어져 쌓인다', () => {
    const w = fresh();
    w.fillCircle(32, 10, 4, M.SAND);
    w.run(200);
    let low = 0;
    for (let y = 55; y < 63; y++) for (let x = 0; x < 64; x++) if (w.mat[y * 64 + x] === M.SAND) low++;
    expect(low).toBeGreaterThan(20);
  });

  it('지지대 없는 돌 덩어리는 강체로 떨어진다', () => {
    const w = fresh();
    for (let x = 20; x < 30; x++) for (let y = 10; y < 16; y++) w.set(x, y, M.STONE);
    w.requestSupportCheck(18, 8, 32, 18);
    w.run(16);
    expect(w.rigid.detachedTotal).toBe(1);
    w.run(120);
    let low = 0;
    for (let y = 50; y < 63; y++) for (let x = 20; x < 30; x++) if (w.mat[y * 64 + x] === M.STONE) low++;
    expect(low).toBe(60);
  });

  it('용암은 화약을 가열해 폭발시킨다', () => {
    const w = fresh();
    let explosions = 0;
    w.onExplosion = () => explosions++;
    for (let x = 20; x < 40; x++) for (let y = 56; y < 62; y++) w.set(x, y, M.GUNPOWDER);
    w.fillCircle(30, 50, 3, M.LAVA);
    w.run(100);
    expect(explosions).toBeGreaterThan(0);
  });

  it('잔잔해진 월드는 청크가 잠든다', () => {
    const w = fresh(128, 128);
    for (let x = 1; x < 127; x++) for (let y = 100; y < 127; y++) w.set(x, y, M.STONE);
    for (let x = 30; x < 60; x++) for (let y = 90; y < 100; y++) w.set(x, y, M.SAND);
    w.run(300);
    expect(w.stats.activeChunks).toBe(0);
  });

  it('녹은 금은 식어 금가루가 된다', () => {
    const w = fresh();
    w.fillCircle(30, 50, 3, M.GOLD_LIQ);
    w.fillCircle(30, 40, 3, M.FROST);
    w.run(400);
    expect(w.countMat(M.GOLD_DUST)).toBeGreaterThan(5);
  });
});
