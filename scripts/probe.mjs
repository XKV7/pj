// 내부 상태 점검: 구역별 업데이트 비용, 보스 페이즈 진행, 연쇄 폭발, 적 AI 동작.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 5181;
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => server.stdout.on('data', (d) => { process.stdout.write('[vite] ' + d); if (String(d).includes('Local')) res(); }));
console.log('server up');
const browser = await chromium.launch();
console.log('browser up');
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else console.log('[page]', m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(1000);
const arg = process.argv[2] ?? 'perf';
console.log('page loaded', arg);
try {
  const out = await page.evaluate(async (mode) => {
    const app = window.__app;
    const res = {};
    if (mode === 'perf') {
      for (const n of [0, 1, 2, 3, 4, 5]) {
        app.debugStage(n);
        const g = app.game;
        // 플레이어를 경로 중간쯤으로 이동시키며 측정
        let tot = 0, max = 0, rt = 0;
        for (let f = 0; f < 200; f++) {
          if (f % 20 === 0) console.log('stage', n, 'frame', f);
          if (f % 60 === 0 && n < 5) { g.player.body.y = Math.min(g.world.H - 120, 60 + f * 0.9); g.player.body.x = 100 + (f * 0.6) % 300; }
          const t0 = performance.now();
          g.update();
          const t1 = performance.now();
          g.render();
          const t2 = performance.now();
          tot += t1 - t0; rt += t2 - t1; max = Math.max(max, t1 - t0);
        }
        res['stage' + n] = { avgUpdate: +(tot / 200).toFixed(2), maxUpdate: +max.toFixed(1), avgRender: +(rt / 200).toFixed(2), active: g.world.stats.activeChunks, enemies: g.enemies.length, dead: g.player.dead, cause: g.player.lastCause };
        g.player.hp = g.player.maxHp; g.player.dead = false;
      }
    }
    if (mode === 'boss') {
      app.debugStage(5);
      const g = app.game;
      g.player.invuln = 99999;
      const log = [];
      for (let f = 0; f < 4000; f++) {
        g.player.invuln = 99999; g.player.hp = g.player.maxHp;
        if (f > 300 && f % 30 === 0 && g.boss.state === 'fight') g.boss.hp -= 40;
        g.update();
        if (f % 200 === 0) log.push(`${f}:${g.boss.state}/p${g.boss.phase}/hp${Math.round(g.boss.hp)}/water${g.world.countMat(9)}/acid${g.world.countMat(11)}/lava${g.world.countMat(12)}/rigid${g.world.rigid.detachedTotal}/en${g.enemies.length}`);
        if (g.over) { log.push('over ' + g.over); break; }
      }
      res.log = log;
      res.summary = g.summary;
      await new Promise((r) => setTimeout(r, 4500));
      res.over = g.over;
    }
    if (mode === 'ai') {
      app.debugStage(10);
      const g = app.game;
      g.player.body.x = 100;
      g.player.invuln = 99999;
      const e = g.enemies;
      res.kinds = e.map((q) => q.kind).join(',');
      // 플레이어를 각 적 근처로 옮겨 반응 관찰
      const report = [];
      for (const kind of ['slime', 'bat', 'bomber', 'mage', 'worm', 'spirit', 'golem']) {
        g.enemies = [];
        g.player.body.x = 160; g.player.body.y = 180; g.world.clear(); for (let x = 0; x < 400; x++) for (let y = 196; y < 240; y++) g.world.set(x, y, 1); g.world.frameBedrock(); const en = g.spawnEnemy(kind, 250, 195);
        const x0 = en.body.x;
        let dmg = 0;
        const hp0 = g.player.hp;
        for (let f = 0; f < 400; f++) { g.player.invuln = 0; g.update(); if (g.player.hp < hp0) dmg = hp0 - g.player.hp; g.player.hp = g.player.maxHp; if (g.player.dead) { g.player.dead = false; } }
        report.push(`${kind}: moved ${Math.round(en.body.x - x0)}, state ${en.state}, alert ${en.alert}, dealt ${Math.round(dmg)}, dead ${en.dead}`);
        g.over = null;
      }
      res.report = report;
    }
    if (mode === 'chain') {
      app.debugStage(3);
      const g = app.game;
      const w = g.world;
      let n = 0;
      const prev = w.onExplosion;
      w.onExplosion = (ev) => { n++; prev(ev); };
      for (let x = 100; x < 300; x++) for (let y = 300; y < 306; y++) w.set(x, y, 8);
      g.player.body.x = 200; g.player.body.y = 260;
      w.set(100, 299, 17);
      for (let f = 0; f < 400; f++) { g.player.invuln = 99999; g.update(); }
      res.explosions = n;
      res.powderLeft = w.countMat(8, 100, 295, 300, 310);
      res.rigid = w.rigid.detachedTotal;
    }
    return res;
  }, arg);
  console.log(JSON.stringify(out, null, 1));
} catch (e) { console.log('ERR', e.message); }
console.log('errors', errors);
await browser.close();
server.kill();
server.kill();
process.exit(0);
