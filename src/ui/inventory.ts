// 인벤토리: 지팡이 4개의 슬롯과 가방 카드를 드래그 앤 드롭으로 편집. 툴팁 표시.
import type { Game } from '../game/game';
import type { Input } from '../input';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { card, KIND_NAME } from '../game/spells';
import { text, panel, hover, wrap, button } from './draw';
import { drawCard, kindColor } from './icons';
import { sound } from '../audio/audio';

type SlotRef = { kind: 'wand'; w: number; s: number } | { kind: 'bag'; s: number };

export class Inventory {
  held: { id: string; from: SlotRef } | null = null;

  private getId(g: Game, r: SlotRef): string | null {
    if (r.kind === 'bag') return g.player.bag[r.s];
    return g.player.wands[r.w]?.slots[r.s] ?? null;
  }

  private setId(g: Game, r: SlotRef, id: string | null): void {
    if (r.kind === 'bag') g.player.bag[r.s] = id;
    else {
      const wd = g.player.wands[r.w];
      if (wd) {
        wd.slots[r.s] = id;
        wd.resetCycle();
      }
    }
  }

  /** 닫을 때 들고 있는 카드는 제자리로 */
  close(g: Game): void {
    if (this.held) {
      this.setId(g, this.held.from, this.held.id);
      this.held = null;
    }
  }

  /** 반환: true 면 닫기 요청 */
  draw(ctx: CanvasRenderingContext2D, g: Game, input: Input): boolean {
    ctx.fillStyle = 'rgba(4,2,10,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text(ctx, '인벤토리 — 카드를 끌어서 지팡이 슬롯에 넣으세요', VIEW_W / 2, 13, { size: 7.5, align: 'center', bold: true, color: '#e8d8ff' });
    text(ctx, '바깥으로 끌어놓으면 카드를 버립니다 · 시전 순서: 왼쪽 → 오른쪽', VIEW_W / 2, 22, { size: 5.2, align: 'center', color: '#a898c0' });
    let hoverRef: SlotRef | null = null;
    let tooltip: string | null = null;
    const p = g.player;
    const CS = 14;
    // 지팡이
    for (let k = 0; k < 4; k++) {
      const x = 8;
      const y = 28 + k * 44;
      const w = p.wands[k];
      panel(ctx, x, y, 262, 41, 0.85, k === p.cur ? '#d8b8ff' : '#4a3a6a');
      if (!w) {
        text(ctx, `${k + 1}. 빈 지팡이 칸`, x + 6, y + 12, { size: 6, color: '#605070' });
        continue;
      }
      text(ctx, `${k + 1}. ${w.name}`, x + 5, y + 9, { size: 6.5, bold: true, color: '#f0e0ff' });
      const stats = `슬롯 ${w.capacity} · 마나 ${w.manaMax} · 회복 ${w.manaRegen}/초 · 시전 지연 ${(w.castDelay / 60).toFixed(2)}초 · 재장전 ${(w.reload / 60).toFixed(2)}초 · 퍼짐 ${w.spread}°`;
      text(ctx, stats, x + 5, y + 17, { size: 4.6, color: '#a898c0' });
      for (let s = 0; s < w.slots.length; s++) {
        const sx = x + 5 + s * (CS + 2);
        const sy = y + 21;
        const ref: SlotRef = { kind: 'wand', w: k, s };
        const hv = hover(input, sx, sy, CS, CS);
        ctx.fillStyle = hv ? 'rgba(160,120,255,0.35)' : 'rgba(0,0,0,0.55)';
        ctx.fillRect(sx, sy, CS, CS);
        ctx.strokeStyle = '#5a4a7a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.25, sy + 0.25, CS - 0.5, CS - 0.5);
        const id = w.slots[s];
        if (id) drawCard(ctx, id, sx + 1, sy + 1, CS - 2);
        if (hv) {
          hoverRef = ref;
          if (id) tooltip = id;
        }
      }
    }
    // 가방
    const bx = 278;
    const by = 28;
    panel(ctx, bx, by, 114, 100, 0.85);
    text(ctx, '가방', bx + 5, by + 9, { size: 6.5, bold: true, color: '#f0e0ff' });
    for (let s = 0; s < p.bag.length; s++) {
      const sx = bx + 6 + (s % 4) * 26;
      const sy = by + 14 + Math.floor(s / 4) * 21;
      const hv = hover(input, sx, sy, 18, 18);
      ctx.fillStyle = hv ? 'rgba(160,120,255,0.35)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx, sy, 18, 18);
      ctx.strokeStyle = '#5a4a7a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(sx + 0.25, sy + 0.25, 17.5, 17.5);
      const id = p.bag[s];
      if (id) drawCard(ctx, id, sx + 1, sy + 1, 16);
      if (hv) {
        hoverRef = { kind: 'bag', s };
        if (id) tooltip = id;
      }
    }
    // 플레이어 정보
    panel(ctx, bx, 132, 114, 40, 0.85);
    text(ctx, `체력 ${Math.ceil(p.hp)}/${p.maxHp}`, bx + 6, 142, { size: 5.5, color: '#ff9090' });
    text(ctx, `금 ${p.gold}`, bx + 6, 150, { size: 5.5, color: '#ffd84a' });
    text(ctx, `처치 ${p.kills}`, bx + 6, 158, { size: 5.5, color: '#c0c0d0' });
    text(ctx, `${g.level.zone.name}`, bx + 6, 166, { size: 5, color: '#a898c0' });
    const closeClicked = button(ctx, input, bx, 178, 114, 14, '닫기 (Tab)', false, 6.5);

    // 드래그 앤 드롭
    if (input.clicked && hoverRef && !this.held) {
      const id = this.getId(g, hoverRef);
      if (id) {
        this.held = { id, from: hoverRef };
        this.setId(g, hoverRef, null);
        sound.click();
      }
    } else if (this.held && (input.released || !input.mouseDown)) {
      if (hoverRef) {
        // 원래 칸에 다시 놓는 경우(그냥 클릭)에도 카드가 지워지지 않도록 원래 칸을 먼저 채운다
        const existing = this.getId(g, hoverRef);
        this.setId(g, this.held.from, existing);
        this.setId(g, hoverRef, this.held.id);
        sound.click();
      } else {
        const inPanel = input.mouseX < 272 && input.mouseY > 26 && input.mouseY < 205;
        const inBag = input.mouseX >= 278 && input.mouseY > 26 && input.mouseY < 196;
        if (inPanel || inBag) this.setId(g, this.held.from, this.held.id);
        else {
          g.dropCard(this.held.id);
          sound.fizzle();
        }
      }
      this.held = null;
    }
    if (this.held) {
      drawCard(ctx, this.held.id, input.mouseX - 7, input.mouseY - 7, 14);
      tooltip = input.touchMode ? this.held.id : null;
    }
    if (tooltip) this.tooltip(ctx, tooltip, input.mouseX, input.mouseY);
    return closeClicked;
  }

  private tooltip(ctx: CanvasRenderingContext2D, id: string, mx: number, my: number): void {
    const c = card(id);
    const lines = wrap(ctx, c.desc, 120, 5.5);
    const stats: string[] = [`${KIND_NAME[c.kind]} · 마나 ${c.mana}`];
    if (c.kind === 'proj') {
      if (c.dmg) stats.push(`피해 ${c.dmg} · 속도 ${c.speed}`);
      if (c.delay) stats.push(`시전 지연 +${(c.delay / 60).toFixed(2)}초`);
    }
    const h = 16 + lines.length * 7 + stats.length * 6.5;
    const w = 130;
    let x = mx + 8;
    let y = my + 8;
    if (x + w > VIEW_W - 2) x = mx - w - 8;
    if (y + h > VIEW_H - 2) y = VIEW_H - h - 2;
    panel(ctx, x, y, w, h, 0.95, kindColor(c));
    drawCard(ctx, id, x + 3, y + 3, 10);
    text(ctx, c.name, x + 16, y + 10.5, { size: 7, bold: true, color: '#fff' });
    stats.forEach((s, k) => text(ctx, s, x + 4, y + 20 + k * 6.5, { size: 5, color: '#c8b8e0' }));
    lines.forEach((l, k) => text(ctx, l, x + 4, y + 21 + stats.length * 6.5 + k * 7, { size: 5.5, color: '#e8e0f0' }));
  }
}
