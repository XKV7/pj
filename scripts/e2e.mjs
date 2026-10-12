// 헤드리스 브라우저 스모크 테스트: 타이틀 → 게임 → 입력 → 인벤토리/일시정지 → 각 구역/보스 → 샌드박스.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5179;
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('dev server timeout')), 30000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('Local')) {
      clearTimeout(t);
      res();
    }
  });
});

const errors = [];
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('screenshot', name);
};
const scale = async () => page.evaluate(() => document.getElementById('screen').getBoundingClientRect().width / 400);
const box = async () => page.evaluate(() => {
  const r = document.getElementById('screen').getBoundingClientRect();
  return { x: r.left, y: r.top };
});
async function clickLogical(x, y) {
  const s = await scale();
  const b = await box();
  await page.mouse.click(b.x + x * s, b.y + y * s);
}
async function moveLogical(x, y) {
  const s = await scale();
  const b = await box();
  await page.mouse.move(b.x + x * s, b.y + y * s);
}
const state = () => page.evaluate(() => window.__app.state);
const appErrors = () => page.evaluate(() => window.__app.errors);

try {
  await page.goto(`http://localhost:${PORT}/`);
  await wait(2500);
  await shot('01-title');
  // 시작 버튼 클릭
  await clickLogical(200, 102);
  await wait(800);
  console.log('state after start:', await state());
  await shot('02-game-start');
  // 이동/점프/시전
  await moveLogical(300, 140);
  await page.keyboard.down('KeyD');
  await wait(700);
  await page.keyboard.press('Space');
  await wait(300);
  await page.keyboard.up('KeyD');
  await page.mouse.down();
  await wait(900);
  await page.mouse.up();
  await shot('03-casting');
  await page.keyboard.press('Digit2');
  await moveLogical(200, 200);
  await page.mouse.down();
  await wait(1200);
  await page.mouse.up();
  await page.keyboard.press('Digit3');
  await moveLogical(250, 180);
  await clickLogical(250, 180);
  await wait(2200);
  await shot('04-dig-bomb');
  await page.keyboard.press('KeyA');
  await page.keyboard.down('KeyA');
  await page.keyboard.down('Space');
  await wait(1200);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyA');
  await page.keyboard.press('Tab');
  await wait(300);
  await moveLogical(20, 60);
  await shot('05-inventory');
  // 드래그 앤 드롭: 지팡이1 슬롯1 → 가방 칸
  const s = await scale();
  const b = await box();
  await page.mouse.move(b.x + 20 * s, b.y + 56 * s);
  await wait(100);
  await page.mouse.down();
  await wait(100);
  await page.mouse.move(b.x + 293 * s, b.y + 51 * s, { steps: 5 });
  await wait(100);
  await page.mouse.up();
  await wait(200);
  const bag0 = await page.evaluate(() => window.__app.game.player.bag[0]);
  console.log('bag[0] after drag:', bag0);
  await page.mouse.move(b.x + 293 * s, b.y + 51 * s);
  await wait(100);
  await page.mouse.down();
  await wait(100);
  await page.mouse.move(b.x + 20 * s, b.y + 56 * s, { steps: 5 });
  await wait(100);
  await page.mouse.up();
  await wait(150);
  // 그냥 클릭(같은 칸에 놓기)해도 카드가 사라지지 않아야 함
  const before = await page.evaluate(() => window.__app.game.player.wands[0].slots.join(',') + '/' + window.__app.game.player.bag.filter(Boolean).length);
  await page.mouse.move(b.x + 36 * s, b.y + 56 * s);
  await wait(100);
  await page.mouse.down();
  await wait(80);
  await page.mouse.up();
  await wait(150);
  await page.mouse.click(b.x + 293 * s, b.y + 51 * s);
  await wait(150);
  const after = await page.evaluate(() => window.__app.game.player.wands[0].slots.join(',') + '/' + window.__app.game.player.bag.filter(Boolean).length);
  console.log('click keeps card:', before === after, before, '|', after);
  if (before !== after) errors.push('card lost on click');
  await page.keyboard.press('Tab');
  await wait(200);
  await page.keyboard.press('F3');
  await wait(800);
  await shot('06-debug');
  await page.keyboard.press('F3');
  await page.keyboard.press('Escape');
  await wait(300);
  await shot('07-pause');
  await page.keyboard.press('Escape');
  // 각 단계 렌더 확인
  for (const n of [1, 2, 3, 4, 10, 5]) {
    await page.evaluate((k) => window.__app.debugStage(k), n);
    await wait(1500);
    await moveLogical(300, 120);
    await page.mouse.down();
    await wait(600);
    await page.mouse.up();
    await wait(600);
    await shot(`08-stage-${n}`);
  }
  // 보스 진행
  await page.evaluate(() => {
    const g = window.__app.game;
    g.player.body.x = 200;
  });
  await wait(4000);
  await shot('09-boss-fight');
  const fps = await page.evaluate(() => window.__app.fps);
  console.log('fps in boss:', fps.toFixed(1));
  // 타이틀로 → 샌드박스
  await page.keyboard.press('Escape');
  await wait(200);
  await clickLogical(200, 164);
  await wait(500);
  console.log('state:', await state());
  await clickLogical(200, 176);
  await wait(500);
  console.log('state:', await state());
  // 모래, 물, 용암 그리기
  const paint = async (idx, x0, y0, x1, y1) => {
    await clickLogical(2 + idx * 13.2 + 6, 225 - 16 + 7);
    await moveLogical(x0, y0);
    await page.mouse.down();
    await moveLogical(x1, y1);
    await wait(150);
    await page.mouse.up();
  };
  await paint(5, 100, 60, 160, 70); // 모래
  await paint(8, 220, 60, 280, 70); // 물
  await paint(11, 300, 150, 340, 160); // 용암
  await paint(2, 40, 150, 90, 150); // 나무
  await paint(16, 45, 145, 50, 145); // 불
  await wait(2500);
  await shot('10-sandbox');
  console.log('sandbox fps:', (await page.evaluate(() => window.__app.fps)).toFixed(1));
  errors.push(...(await appErrors()).map((e) => 'app: ' + e));
} catch (e) {
  errors.push('script: ' + e.stack);
} finally {
  await browser.close();
  server.kill();
}
console.log('ERRORS:', errors.length);
for (const e of errors) console.log(e);
process.exit(errors.length ? 1 : 0);
