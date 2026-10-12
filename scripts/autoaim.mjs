// 자동 조준 점검: 설정 화면에서 켜고, 적이 조준 방향 근처에 있을 때 각도가 보정되는지 확인.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 5184;
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('Local') && res()));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(800);
const r = await page.evaluate(() => { const b = document.getElementById('screen').getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / 400 }; });
const click = async (x, y) => { await page.mouse.click(r.x + x * r.s, r.y + y * r.s); await page.waitForTimeout(200); };
const st = () => page.evaluate(() => window.__app.state);
await click(200, 136); // 설정
console.log('state', await st());
await page.screenshot({ path: 'screenshots/settings.png' });
await click(310, 60); // 자동 조준 토글
const saved = await page.evaluate(() => localStorage.getItem('alchemic-abyss-settings-v1'));
console.log('saved', saved);
await click(200, 192); // 돌아가기
console.log('state', await st());
// 평평한 맵에서 적을 배치
await page.evaluate(() => {
  const app = window.__app;
  app.debugStage(10);
  const g = app.game;
  g.world.clear();
  for (let x = 0; x < 400; x++) for (let y = 196; y < 240; y++) g.world.set(x, y, 1);
  g.world.frameBedrock();
  g.items = [];
  g.player.body.x = 150; g.player.body.y = 183;
  g.player.invuln = 1e9;
  g.spawnEnemy('golem', 250, 195);
});
await page.waitForTimeout(300);
// 마우스는 적보다 약간 위를 가리킴
const res = await page.evaluate(async () => {
  const g = window.__app.game;
  const cam = g.renderer;
  const e = g.enemies[0];
  return { ex: e.body.cx, ey: e.body.cy, camX: cam.camX, camY: cam.camY };
});
// 약 13° 위: 좁혀진 범위(±10°) 밖이므로 보정되지 않아야 함
await page.mouse.move(r.x + (res.ex - res.camX) * r.s, r.y + (res.ey - res.camY - 22) * r.s);
await page.waitForTimeout(300);
console.log('13deg locked:', await page.evaluate(() => !!window.__app.game.aimTarget));
// 약 7° 위: 범위 안이므로 보정되어야 함
await page.mouse.move(r.x + (res.ex - res.camX) * r.s, r.y + (res.ey - res.camY - 12) * r.s);
await page.waitForTimeout(300);
const out = await page.evaluate(() => {
  const g = window.__app.game;
  const p = g.player;
  const h = p.handPos();
  const e = g.enemies[0];
  const raw = Math.atan2(g.renderer.camY + g.input.mouseY - h.y, g.renderer.camX + g.input.mouseX - h.x);
  const toEnemy = Math.atan2(e.body.cy - h.y, e.body.cx - h.x);
  return { raw: raw.toFixed(3), toEnemy: toEnemy.toFixed(3), aim: p.aimAngle.toFixed(3), locked: g.aimTarget === e };
});
console.log('auto aim on:', JSON.stringify(out));
await page.screenshot({ path: 'screenshots/autoaim.png' });
// 끄고 다시 확인
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await click(200, 124); // 일시정지 → 설정
await click(310, 60);
await click(200, 192);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const off = await page.evaluate(() => ({ aim: window.__app.game.player.aimAngle.toFixed(3), locked: !!window.__app.game.aimTarget, state: window.__app.state }));
console.log('auto aim off:', JSON.stringify(off));
console.log('errors', errors);
await browser.close();
server.kill();
process.exit(0);
