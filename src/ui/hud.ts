// 인게임 HUD: 체력/마나/부양, 지팡이와 슬롯, 금, 구역, 미니맵, 보스 체력바, 배너, 디버그.
import type { Game } from '../game/game';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { COLOR_TABLE, M } from '../sim/materials';
import { text, bar, panel, measure } from './draw';
import { drawCard } from './icons';
import { BOSS_NAME, PHASE_TITLES } from '../game/boss';

const mini = document.createElement('canvas');
const MW = 96;
const MH = 64;
mini.width = MW;
mini.height = MH;
const mctx = mini.getContext('2d')!;
const mimg = mctx.createImageData(MW, MH);
const mbuf = new Uint32Array(mimg.data.buffer);

function updateMinimap(g: Game): void {
  const w = g.world;
  const p = g.player.body;
  const S = 4;
  const ox = Math.floor(p.cx / S) - MW / 2;
  const oy = Math.floor(p.cy / S) - MH / 2;
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const ex = ox + x;
      const ey = oy + y;
      let c = 0xff000000;
      if (ex >= 0 && ey >= 0 && ex < g.exploredW && ey < g.exploredH && g.explored[ey * g.exploredW + ex]) {
        const m = w.get(ex * S + 2, ey * S + 2);
        c = m === M.EMPTY ? 0xff1a1414 : COLOR_TABLE[m * 256 + 40];
      }
      mbuf[y * MW + x] = c;
    }
  }
  // 포털
  for (const it of g.items) {
    if (it.kind !== 'portal') continue;
    const x = Math.floor(it.body.cx / S) - ox;
    const y = Math.floor(it.body.cy / S) - oy;
    const ex = Math.floor(it.body.cx / S);
    const ey = Math.floor(it.body.cy / S);
    const seen = ex >= 0 && ey >= 0 && ex < g.exploredW && ey < g.exploredH && g.explored[ey * g.exploredW + ex];
    if (seen && x >= 0 && y >= 0 && x < MW && y < MH) for (let k = -1; k <= 1; k++) {
      mbuf[y * MW + Math.max(0, Math.min(MW - 1, x + k))] = 0xffff60ff;
      mbuf[Math.max(0, Math.min(MH - 1, y + k)) * MW + x] = 0xffff60ff;
    }
  }
  for (const e of g.enemies) {
    const x = Math.floor(e.body.cx / S) - ox;
    const y = Math.floor(e.body.cy / S) - oy;
    if (x >= 0 && y >= 0 && x < MW && y < MH && e.alert > 0) mbuf[y * MW + x] = 0xff3030ff;
  }
  mbuf[(MH / 2) * MW + MW / 2] = 0xffffffff;
  mbuf[(MH / 2 - 1) * MW + MW / 2] = 0xffffffff;
  mctx.putImageData(mimg, 0, 0);
}

export function drawHud(ctx: CanvasRenderingContext2D, g: Game, fps: number): void {
  const p = g.player;
  // 상태 바
  panel(ctx, 3, 3, 108, 41, 0.6);
  text(ctx, '체력', 6, 10, { size: 5.5, color: '#ff9090' });
  bar(ctx, 24, 6, 84, 5, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 && (g.time & 16) ? '#ff2020' : '#d03040');
  text(ctx, `${Math.ceil(p.hp)}/${p.maxHp}`, 66, 10.3, { size: 4.5, align: 'center', color: '#fff' });
  const wd = p.wand;
  text(ctx, '마나', 6, 17, { size: 5.5, color: '#90b0ff' });
  bar(ctx, 24, 13, 84, 5, wd ? wd.mana / wd.manaMax : 0, '#3060d0');
  if (wd) text(ctx, `${Math.floor(wd.mana)}/${wd.manaMax}`, 66, 17.3, { size: 4.5, align: 'center', color: '#fff' });
  text(ctx, '부양', 6, 24, { size: 5.5, color: '#e0e080' });
  bar(ctx, 24, 20, 84, 4, p.levit / p.levitMax, '#c0c040');
  // 금
  text(ctx, `금 ${p.gold}`, 6, 33, { size: 6.5, color: g.goldFlash > 0 ? '#fff6b0' : '#ffd84a', bold: true });
  // 상태이상
  const st: [boolean, string, string][] = [
    [p.wet > 0, '젖음', '#60a0ff'], [p.oily > 0, '기름', '#a08050'], [p.burning > 0, '불붙음', '#ff7030'], [p.chilled > 0, '냉기', '#a0e8ff'], [p.shocked > 0, '감전', '#ffffa0'],
  ];
  let sx = 6;
  for (const [on, name, col] of st) {
    if (!on) continue;
    text(ctx, name, sx, 41, { size: 5, color: col, bold: true });
    sx += measure(ctx, name, 5, true) + 4;
  }

  // 지팡이
  const by = VIEW_H - 24;
  for (let k = 0; k < 4; k++) {
    const w = p.wands[k];
    const x = 3 + k * 62;
    const sel = k === p.cur;
    panel(ctx, x, by, 60, 21, sel ? 0.85 : 0.5, sel ? '#d8b8ff' : '#4a3a6a');
    text(ctx, String(k + 1), x + 3, by + 7, { size: 5.5, color: sel ? '#fff' : '#a090c0', bold: true });
    if (!w) {
      text(ctx, '비어 있음', x + 30, by + 13, { size: 5, align: 'center', color: '#605070' });
      continue;
    }
    const name = w.name.length > 8 ? w.name.slice(0, 8) + '…' : w.name;
    text(ctx, name, x + 9, by + 7, { size: 4.8, color: sel ? '#f0e0ff' : '#a090c0' });
    const n = w.slots.length;
    const cs = Math.min(7, Math.floor(56 / Math.max(1, n)) - 0.5);
    for (let s = 0; s < n; s++) {
      const cx = x + 2.5 + s * (cs + 0.5);
      const cy = by + 9.5;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx, cy, cs, cs);
      const id = w.slots[s];
      if (id) drawCard(ctx, id, cx, cy, cs);
      if (sel && s === w.ptr && !w.reloading) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cs, cs);
      }
    }
    // 재장전/지연
    if (w.cooldown > 0) {
      ctx.fillStyle = w.reloading ? '#c06040' : '#8080c0';
      ctx.fillRect(x + 2, by + 18.5, 56 * (w.cooldown / Math.max(1, w.cooldownMax)), 1);
    }
  }

  // 구역 이름
  text(ctx, g.level.zone.name, VIEW_W / 2, 9, { size: 6, align: 'center', color: '#c0b0d8' });

  // 미니맵
  if (g.time % 12 === 0 || g.time < 3) updateMinimap(g);
  panel(ctx, VIEW_W - MW - 4, 3, MW + 2, MH + 2, 0.8);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini, VIEW_W - MW - 3, 4);

  // 보스
  const b = g.boss;
  if (b && b.state !== 'dormant' && b.state !== 'dead') {
    const bw = 200;
    const bx = (VIEW_W - bw) / 2;
    text(ctx, BOSS_NAME, VIEW_W / 2, 18, { size: 7.5, align: 'center', color: '#e8c8ff', bold: true });
    bar(ctx, bx, 21, bw, 5, b.hp / b.maxHp, b.state === 'transition' ? '#ffffff' : b.phase === 1 ? '#5a8aff' : b.phase === 2 ? '#ff7030' : '#70ff50');
    for (const f of [0.33, 0.66]) {
      ctx.fillStyle = '#000';
      ctx.fillRect(bx + bw * f, 21, 0.6, 5);
    }
    text(ctx, PHASE_TITLES[b.phase - 1], VIEW_W / 2, 32, { size: 5, align: 'center', color: '#b0a0c8' });
  }

  // 상호작용 안내
  if (g.prompt) {
    const wdt = measure(ctx, g.prompt, 6) + 10;
    panel(ctx, (VIEW_W - wdt) / 2, VIEW_H - 40, wdt, 11, 0.8);
    text(ctx, g.prompt, VIEW_W / 2, VIEW_H - 32.5, { size: 6, align: 'center', color: '#fff0c0' });
  }

  // 상점 가격표
  for (const it of g.items) {
    if (it.kind !== 'shopCard' && it.kind !== 'shopWand') continue;
    const sx = it.body.cx - g.renderer.camX;
    const sy = it.body.y - g.renderer.camY - 12;
    if (sx < -20 || sx > VIEW_W + 20 || sy < -10 || sy > VIEW_H) continue;
    text(ctx, `${it.price}금`, sx, sy, { size: 5, align: 'center', color: p.gold >= it.price ? '#ffd84a' : '#a07060' });
  }
  for (const it of g.items) {
    if (it.kind !== 'freeCard' || g.freeTaken) continue;
    const sx = it.body.cx - g.renderer.camX;
    const sy = it.body.y - g.renderer.camY - 12;
    text(ctx, '무료', sx, sy, { size: 5, align: 'center', color: '#a0ffa0' });
  }
  g.drawTexts(ctx);

  // 배너
  if (g.banner) {
    const bn = g.banner;
    const a = Math.min(1, bn.t / 20, (bn.max - bn.t) / 30);
    ctx.globalAlpha = Math.max(0, a) * 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 56, VIEW_W, 34);
    ctx.globalAlpha = 1;
    text(ctx, bn.title, VIEW_W / 2, 74, { size: 13, align: 'center', color: '#f0e0ff', bold: true, alpha: Math.max(0, a) });
    if (bn.sub) text(ctx, bn.sub, VIEW_W / 2, 85, { size: 6, align: 'center', color: '#c0b0d8', alpha: Math.max(0, a) });
  }

  // 조준선
  const mx = g.input.mouseX;
  const my = g.input.mouseY;
  ctx.strokeStyle = 'rgba(255,240,200,0.8)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(mx - 4, my);
  ctx.lineTo(mx - 1.5, my);
  ctx.moveTo(mx + 1.5, my);
  ctx.lineTo(mx + 4, my);
  ctx.moveTo(mx, my - 4);
  ctx.lineTo(mx, my - 1.5);
  ctx.moveTo(mx, my + 1.5);
  ctx.lineTo(mx, my + 4);
  ctx.stroke();

  if (g.debug) drawDebug(ctx, g, fps);

  // 페이드
  if (g.transition > 0) {
    ctx.globalAlpha = g.transition;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
}

export function drawDebug(ctx: CanvasRenderingContext2D, g: Game, fps: number): void {
  const w = g.world;
  const lines = [
    `FPS ${fps.toFixed(0)}`,
    `활성 청크 ${w.stats.activeChunks}/${w.CW * w.CH}`,
    `갱신 셀 ${w.stats.cells}`,
    `자유 입자 ${w.particles.count}`,
    `강체 ${w.rigid.bodies.length}`,
    `투사체 ${g.projectiles.activeCount()}`,
    `적 ${g.enemies.length}`,
    `폭발 대기 ${w.pendingExplosions()}`,
    `플레이어 ${Math.floor(g.player.body.x)},${Math.floor(g.player.body.y)}`,
  ];
  panel(ctx, 3, 48, 80, lines.length * 7 + 4, 0.75, '#40ff40');
  lines.forEach((l, k) => text(ctx, l, 6, 54 + k * 7, { size: 5.5, color: '#80ff80' }));
}
