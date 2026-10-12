// 터치 기기용 가상 컨트롤: 왼쪽 조이스틱, 점프/상호작용 버튼, 가방/일시정지 버튼.
import { TOUCH, type Input } from '../input';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { text } from './draw';
import type { Game } from '../game/game';

/** 조준 조이스틱을 누르고 있는 동안 지팡이 끝에서 조준선을 그린다 */
function drawAimLine(ctx: CanvasRenderingContext2D, input: Input, g: Game): void {
  if (!input.aimReady()) return;
  const tip = g.player.tipPos();
  const sx = tip.x - g.renderer.camX;
  const sy = tip.y - g.renderer.camY;
  const a = input.aimAngle;
  const ready = !!g.player.wand && g.player.wand.cooldown <= 0;
  ctx.fillStyle = ready ? '#fff0b0' : '#a090c0';
  for (let k = 1; k <= 14; k++) {
    const d = k * 7;
    ctx.globalAlpha = 0.9 - k * 0.055;
    ctx.fillRect(sx + Math.cos(a) * d - 0.75, sy + Math.sin(a) * d - 0.75, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

export function drawTouchControls(ctx: CanvasRenderingContext2D, input: Input, g: Game): void {
  drawAimLine(ctx, input, g);
  const s = TOUCH.stick;
  ctx.save();
  // 조이스틱
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#1a1428';
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#b8a0e8';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.globalAlpha = input.stickActive ? 0.85 : 0.55;
  ctx.fillStyle = '#d8c8ff';
  ctx.beginPath();
  ctx.arc(s.x + input.stickX * s.r * 0.75, s.y + input.stickY * s.r * 0.75, s.r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, '이동 · 위로 밀면 점프', s.x, s.y + s.r + 7, { size: 4.5, align: 'center', color: '#b8a8d0', alpha: 0.8 });
  // 조준 조이스틱
  const a = TOUCH.aim;
  const ready = input.aimReady();
  ctx.globalAlpha = ready ? 0.5 : 0.35;
  ctx.fillStyle = ready ? '#4a1c30' : '#1a1428';
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = ready ? '#ffb070' : '#e0a0c0';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 데드존 표시
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.r * 0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = input.aimStickActive ? 0.9 : 0.55;
  ctx.fillStyle = ready ? '#ffd0a0' : '#f0c8e0';
  ctx.beginPath();
  ctx.arc(a.x + input.aimDX * a.r * 0.75, a.y + input.aimDY * a.r * 0.75, a.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, ready ? '떼면 발사 · 가운데로 돌리면 취소' : '조준 · 떼면 발사', a.x, a.y - a.r - 4, { size: 4.5, align: 'center', color: ready ? '#ffd0a0' : '#d0b8d8', alpha: 0.85 });
  // 둥근 버튼
  const round = (c: { x: number; y: number; r: number }, label: string, held: boolean): void => {
    ctx.globalAlpha = held ? 0.75 : 0.45;
    ctx.fillStyle = held ? '#7a50d0' : '#2a2040';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#d8c0ff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    text(ctx, label, c.x, c.y + 0.5, { size: c.r > 14 ? 6 : 5.5, align: 'center', baseline: 'middle', bold: true, color: '#fff' });
  };
  round(TOUCH.jump, '점프', input.down('Space'));
  round(TOUCH.use, 'E', input.down('KeyE'));
  // 사각 버튼
  const rect = (b: { x: number; y: number; w: number; h: number }, label: string): void => {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#1a1428';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#b8a0e8';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(b.x + 0.3, b.y + 0.3, b.w - 0.6, b.h - 0.6);
    ctx.globalAlpha = 1;
    text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 0.5, { size: 5.5, align: 'center', baseline: 'middle', color: '#fff' });
  };
  rect(TOUCH.bag, '가방');
  rect(TOUCH.pause, '일시정지');
  text(ctx, '빈 화면을 누르고 있으면 그쪽으로 연사', VIEW_W - 4, 100, { size: 4.5, align: 'right', color: '#b8a8d0', alpha: 0.7 });
  ctx.restore();
}

export function drawRotateHint(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, VIEW_H / 2 - 14, VIEW_W, 28);
  text(ctx, '기기를 가로로 돌리면 더 크게 플레이할 수 있습니다', VIEW_W / 2, VIEW_H / 2 + 3, { size: 9, align: 'center', bold: true, color: '#f0e0ff' });
}
