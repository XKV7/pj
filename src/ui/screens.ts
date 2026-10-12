// 타이틀, 조작법, 기록, 일시정지, 사망, 엔딩 화면.
import type { Input } from '../input';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { text, panel, button, wrap } from './draw';
import { formatTime, type Records } from '../save';
import type { RunSummary } from '../game/game';
import { ZONES } from '../game/worldgen';
import { settings, saveSettings } from '../settings';

export type TitleAction = 'start' | 'controls' | 'records' | 'sandbox' | 'settings' | null;

export function drawTitle(ctx: CanvasRenderingContext2D, input: Input, t: number): TitleAction {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const glow = 0.75 + 0.25 * Math.sin(t * 0.05);
  text(ctx, '연금의 심연', VIEW_W / 2, 52, { size: 30, align: 'center', bold: true, color: `rgba(${Math.floor(220 * glow + 35)},${Math.floor(170 * glow)},255,1)` });
  text(ctx, 'ALCHEMIC ABYSS', VIEW_W / 2, 66, { size: 8, align: 'center', color: '#b8a0e0' });
  text(ctx, '모든 픽셀이 살아 움직이는 심연으로 내려가라', VIEW_W / 2, 78, { size: 6, align: 'center', color: '#d8c8f0' });
  let action: TitleAction = null;
  const bw = 120;
  const bx = (VIEW_W - bw) / 2;
  if (button(ctx, input, bx, 88, bw, 17, '게임 시작', false, 8.5)) action = 'start';
  if (button(ctx, input, bx, 108, bw, 17, '조작법', false, 8.5)) action = 'controls';
  if (button(ctx, input, bx, 128, bw, 17, '설정', false, 8.5)) action = 'settings';
  if (button(ctx, input, bx, 148, bw, 17, '최고 기록', false, 8.5)) action = 'records';
  if (button(ctx, input, bx, 168, bw, 17, '시뮬레이션 놀이터', false, 8.5)) action = 'sandbox';
  text(ctx, 'Enter: 시작   ·   M: 음소거   ·   F3: 디버그', VIEW_W / 2, VIEW_H - 8, { size: 5.5, align: 'center', color: '#9080b0' });
  if (input.pressed('Enter')) action = 'start';
  return action;
}

const CONTROLS: [string, string][] = [
  ['A / D', '좌우 이동'],
  ['W / Space', '점프 · 공중에서 누르고 있으면 부양 (부양 게이지 소모)'],
  ['마우스', '조준 · 좌클릭: 주문 시전 (누르고 있으면 연사)'],
  ['1 ~ 4 / 휠', '지팡이 교체'],
  ['E', '상호작용 (상자, 아이템, 상점, 포털)'],
  ['Tab', '인벤토리 — 카드를 끌어 지팡이에 장착'],
  ['Esc', '일시정지'],
  ['M', '음소거'],
  ['F3', '디버그 오버레이 (FPS, 청크)'],
];

export function drawControls(ctx: CanvasRenderingContext2D, input: Input): boolean {
  ctx.fillStyle = 'rgba(4,2,10,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 30, 12, VIEW_W - 60, VIEW_H - 24, 0.9);
  text(ctx, '조작법', VIEW_W / 2, 28, { size: 10, align: 'center', bold: true, color: '#e8d8ff' });
  CONTROLS.forEach(([k, d], i) => {
    text(ctx, k, 50, 44 + i * 10, { size: 6.5, color: '#ffd890', bold: true });
    text(ctx, d, 115, 44 + i * 10, { size: 6.5, color: '#e0d8f0' });
  });
  const tips = '팁: 젖으면 불에 강하지만 전기에 약해집니다. 기름이 묻으면 불이 잘 붙습니다. 트리거 + 물 분사 + 번개 볼트 조합으로 적을 적신 뒤 감전시켜 보세요. 벽 너머의 비밀 공간에는 보물이 숨겨져 있습니다.';
  wrap(ctx, tips, VIEW_W - 100, 5.8).forEach((l, i) => text(ctx, l, 50, 140 + i * 8, { size: 5.8, color: '#b8a8d0' }));
  const back = button(ctx, input, VIEW_W / 2 - 40, VIEW_H - 32, 80, 14, '돌아가기', false, 7);
  return back || input.pressed('Escape');
}

export function drawRecords(ctx: CanvasRenderingContext2D, input: Input, r: Records): boolean {
  ctx.fillStyle = 'rgba(4,2,10,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 30, 12, VIEW_W - 60, VIEW_H - 24, 0.9);
  text(ctx, '최고 기록', VIEW_W / 2, 28, { size: 10, align: 'center', bold: true, color: '#e8d8ff' });
  const best = r.bestZone < 0 ? '없음' : r.bestZone >= 5 ? '연금 심장' : ZONES[r.bestZone].name;
  const rows: [string, string][] = [
    ['도전 횟수', String(r.runs)],
    ['클리어 횟수', String(r.clears)],
    ['최고 도달 구역', best],
    ['최단 클리어 시간', r.bestClearFrames ? formatTime(r.bestClearFrames) : '-'],
    ['누적 처치 수', String(r.totalKills)],
    ['최다 보유 금', String(r.mostGold)],
  ];
  rows.forEach(([k, v], i) => {
    text(ctx, k, 60, 46 + i * 10, { size: 6.5, color: '#ffd890' });
    text(ctx, v, 170, 46 + i * 10, { size: 6.5, color: '#e0d8f0' });
  });
  text(ctx, '최근 기록', 60, 115, { size: 6.5, bold: true, color: '#c8b8e8' });
  r.history.slice(0, 6).forEach((h, i) => {
    text(ctx, `${h.date}  ${h.victory ? '클리어' : '사망'}  ${h.zone}  ${formatTime(h.frames)}  처치 ${h.kills}`, 60, 125 + i * 8, { size: 5.5, color: h.victory ? '#a0ffb0' : '#d0c0d8' });
  });
  if (!r.history.length) text(ctx, '아직 기록이 없습니다.', 60, 125, { size: 5.5, color: '#8070a0' });
  const back = button(ctx, input, VIEW_W / 2 - 40, VIEW_H - 32, 80, 14, '돌아가기', false, 7);
  return back || input.pressed('Escape');
}

export type PauseAction = 'resume' | 'controls' | 'settings' | 'title' | null;

export function drawPause(ctx: CanvasRenderingContext2D, input: Input, muted: boolean): PauseAction | 'mute' {
  ctx.fillStyle = 'rgba(4,2,10,0.65)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  text(ctx, '일시정지', VIEW_W / 2, 62, { size: 16, align: 'center', bold: true, color: '#e8d8ff' });
  const bw = 120;
  const bx = (VIEW_W - bw) / 2;
  if (button(ctx, input, bx, 76, bw, 16, '계속하기', false, 8)) return 'resume';
  if (button(ctx, input, bx, 96, bw, 16, '조작법', false, 8)) return 'controls';
  if (button(ctx, input, bx, 116, bw, 16, '설정', false, 8)) return 'settings';
  if (button(ctx, input, bx, 136, bw, 16, muted ? '소리 켜기' : '음소거', false, 8)) return 'mute';
  if (button(ctx, input, bx, 156, bw, 16, '타이틀로 (포기)', false, 8)) return 'title';
  return null;
}

function summaryPanel(ctx: CanvasRenderingContext2D, s: RunSummary, y0: number): void {
  const rows: [string, string][] = [
    ['도달 구역', s.zoneName],
    ['처치 수', String(s.kills)],
    ['플레이 시간', formatTime(s.frames)],
    ['보유 금', String(s.gold)],
  ];
  rows.forEach(([k, v], i) => {
    text(ctx, k, 70, y0 + i * 9, { size: 6.5, color: '#ffd890' });
    text(ctx, v, 140, y0 + i * 9, { size: 6.5, color: '#f0e8ff' });
  });
  text(ctx, '최종 지팡이 구성', 70, y0 + 42, { size: 6.5, bold: true, color: '#c8b8e8' });
  s.wands.forEach((w, i) => {
    const line = `${w.name}: ${w.cards.join(' → ')}`;
    const l = wrap(ctx, line, VIEW_W - 150, 5.3)[0];
    text(ctx, l, 70, y0 + 51 + i * 8, { size: 5.3, color: '#d8d0e8' });
  });
}

export function drawDead(ctx: CanvasRenderingContext2D, input: Input, s: RunSummary, t: number): 'retry' | 'title' | null {
  const a = Math.min(1, t / 60);
  ctx.fillStyle = `rgba(20,0,4,${0.8 * a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (t < 30) return null;
  text(ctx, '사망', VIEW_W / 2, 36, { size: 20, align: 'center', bold: true, color: '#ff6060' });
  text(ctx, s.cause, VIEW_W / 2, 52, { size: 8, align: 'center', color: '#ffc0c0' });
  summaryPanel(ctx, s, 70);
  if (button(ctx, input, VIEW_W / 2 - 92, VIEW_H - 26, 88, 15, '다시 도전', false, 7.5)) return 'retry';
  if (button(ctx, input, VIEW_W / 2 + 4, VIEW_H - 26, 88, 15, '타이틀로', false, 7.5)) return 'title';
  if (input.pressed('Enter')) return 'retry';
  return null;
}

export function drawEnding(ctx: CanvasRenderingContext2D, input: Input, s: RunSummary, t: number, best: boolean): 'title' | null {
  const a = Math.min(1, t / 90);
  ctx.fillStyle = `rgba(6,4,14,${0.85 * a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (t < 40) return null;
  const glow = 0.8 + 0.2 * Math.sin(t * 0.06);
  text(ctx, '심연을 정복했다', VIEW_W / 2, 34, { size: 18, align: 'center', bold: true, color: `rgba(255,${Math.floor(220 * glow)},140,1)` });
  text(ctx, '연금 심장은 부서지고, 끓어오르던 심연은 마침내 잠잠해졌다.', VIEW_W / 2, 48, { size: 6.5, align: 'center', color: '#e8d8ff' });
  text(ctx, '당신의 이름은 연금술사들 사이에서 오래도록 전해질 것이다.', VIEW_W / 2, 57, { size: 6.5, align: 'center', color: '#c8b8e8' });
  if (best) text(ctx, '★ 최단 클리어 기록 갱신! ★', VIEW_W / 2, 67, { size: 7, align: 'center', bold: true, color: '#ffe060' });
  summaryPanel(ctx, s, 80);
  if (t > 90 && button(ctx, input, VIEW_W / 2 - 44, VIEW_H - 24, 88, 15, '타이틀로', false, 7.5)) return 'title';
  return null;
}

/** 설정 화면. 반환: true 면 닫기 */
export function drawSettings(ctx: CanvasRenderingContext2D, input: Input, muted: boolean, toggleMute: () => void): boolean {
  ctx.fillStyle = 'rgba(4,2,10,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx, 40, 20, VIEW_W - 80, VIEW_H - 40, 0.9);
  text(ctx, '설정', VIEW_W / 2, 38, { size: 10, align: 'center', bold: true, color: '#e8d8ff' });
  const row = (y: number, label: string, desc: string, on: boolean, onToggle: () => void): void => {
    text(ctx, label, 60, y + 9, { size: 7.5, bold: true, color: '#ffd890' });
    wrap(ctx, desc, 190, 5.5).forEach((l, i) => text(ctx, l, 60, y + 19 + i * 7, { size: 5.5, color: '#b8a8d0' }));
    if (button(ctx, input, VIEW_W - 120, y + 1, 60, 14, on ? '켜짐' : '꺼짐', on, 7)) onToggle();
  };
  row(52, '자동 조준', '조준 방향 근처(약 20°)에 적이 있으면 조준을 그 적에게 자동으로 맞춥니다. 벽에 가려 보이지 않는 적은 제외합니다. 보정된 대상에는 표시가 나타납니다.', settings.autoAim, () => {
    settings.autoAim = !settings.autoAim;
    saveSettings();
  });
  row(104, '소리', '효과음, 환경음, 음악을 켜거나 끕니다. 게임 중 M 키로도 바꿀 수 있습니다.', !muted, toggleMute);
  const back = button(ctx, input, VIEW_W / 2 - 40, VIEW_H - 40, 80, 14, '돌아가기', false, 7);
  return back || input.pressed('Escape');
}
