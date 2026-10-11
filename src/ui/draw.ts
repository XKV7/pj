// UI 그리기 도우미 (400x225 논리 좌표계, 벡터 텍스트라 확대해도 선명).
import type { Input } from '../input';

export const FONT = "'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo','WenQuanYi Zen Hei',sans-serif";

export interface TextOpt {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
  shadow?: boolean;
  alpha?: number;
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpt = {}): void {
  ctx.font = `${o.bold ? 'bold ' : ''}${o.size ?? 7}px ${FONT}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(s, x + 0.6, y + 0.6);
  }
  ctx.fillStyle = o.color ?? '#e8e4f0';
  ctx.fillText(s, x, y);
  ctx.globalAlpha = 1;
}

export function measure(ctx: CanvasRenderingContext2D, s: string, size = 7, bold = false): number {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  return ctx.measureText(s).width;
}

export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number, size = 7): string[] {
  ctx.font = `${size}px ${FONT}`;
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const ch of para.split(/(\s+)/)) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line.trim()) {
        out.push(line.trim());
        line = ch.trimStart();
        // 공백 없는 긴 단어(한글 문장) 처리
        while (ctx.measureText(line).width > maxW) {
          let k = line.length - 1;
          while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      } else line = test;
    }
    out.push(line.trim());
  }
  return out;
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.82, border = '#5a4a7a'): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0c0a14';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = border;
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x + 0.35, y + 0.35, w - 0.7, h - 0.7);
}

export function hover(input: Input, x: number, y: number, w: number, h: number): boolean {
  return input.mouseX >= x && input.mouseX < x + w && input.mouseY >= y && input.mouseY < y + h;
}

export function button(ctx: CanvasRenderingContext2D, input: Input, x: number, y: number, w: number, h: number, label: string, selected = false, size = 8): boolean {
  const hv = hover(input, x, y, w, h);
  ctx.fillStyle = hv || selected ? 'rgba(120,80,200,0.55)' : 'rgba(20,14,34,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hv || selected ? '#d8b8ff' : '#6a5a8a';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(x + 0.35, y + 0.35, w - 0.7, h - 0.7);
  text(ctx, label, x + w / 2, y + h / 2 + 0.5, { size, align: 'center', baseline: 'middle', color: hv || selected ? '#fff' : '#d0c8e0', bold: hv });
  return hv && input.clicked;
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string, bg = 'rgba(0,0,0,0.6)'): void {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, f)) * w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
}
