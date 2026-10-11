// 월드 오브젝트: 보물 상자, 지팡이/카드 아이템, 상점, 치유 제단, 무료 주문 선택, 포털.
import { Body, moveBody } from './entity';
import { CHEST, CHEST_OPEN, PEDESTAL, ALTAR } from '../render/sprites';
import { hexAbgr, type Renderer } from '../render/renderer';
import { card, type Wand } from './spells';
import type { World } from '../sim/world';

export type ItemKind = 'chest' | 'wand' | 'card' | 'heart' | 'portal' | 'shopCard' | 'shopWand' | 'altar' | 'freeCard';

export class Item {
  kind: ItemKind;
  body: Body;
  wand: Wand | null = null;
  cardId: string | null = null;
  price = 0;
  opened = false;
  used = false;
  isStatic: boolean;
  group = 0; // 무료 선택 그룹
  t = Math.random() * 100;
  tier = 1;
  secret = false;

  constructor(kind: ItemKind, x: number, y: number, isStatic = false) {
    this.kind = kind;
    const size: Record<ItemKind, [number, number]> = {
      chest: [12, 8], wand: [8, 4], card: [6, 8], heart: [7, 6], portal: [16, 24], shopCard: [8, 10], shopWand: [10, 6], altar: [14, 13], freeCard: [8, 10],
    };
    const [w, h] = size[kind];
    this.body = new Body(x - w / 2, y - h, w, h);
    this.isStatic = isStatic;
  }

  get label(): string {
    switch (this.kind) {
      case 'chest': return this.opened ? '' : '[E] 보물 상자 열기';
      case 'wand': return `[E] ${this.wand?.name ?? '지팡이'} 줍기`;
      case 'card': return `[E] 주문 카드: ${card(this.cardId!).name}`;
      case 'heart': return '[E] 생명의 정수 (체력 +40, 최대 체력 +10)';
      case 'portal': return '[E] 포털로 들어가기';
      case 'shopCard': return `[E] ${card(this.cardId!).name} 구매 (${this.price}금)`;
      case 'shopWand': return `[E] ${this.wand?.name ?? '지팡이'} 구매 (${this.price}금)`;
      case 'altar': return this.used ? '치유의 제단 (사용함)' : '[E] 치유의 제단: 체력 완전 회복';
      case 'freeCard': return `[E] 무료 선택: ${card(this.cardId!).name}`;
    }
  }

  update(w: World): void {
    this.t++;
    if (this.isStatic) return;
    const b = this.body;
    b.vy = Math.min(4, b.vy + 0.15);
    b.vx *= 0.9;
    moveBody(w, b, 1);
  }

  render(r: Renderer, time: number): void {
    const b = this.body;
    const bob = Math.sin((time + this.t) * 0.08) * 1.5;
    switch (this.kind) {
      case 'chest':
        r.sprite(this.opened ? CHEST_OPEN : CHEST, b.x, b.y, false);
        if (!this.opened) r.addLight(b.cx, b.cy, 22, 0.5, 0.4, 0.1);
        break;
      case 'wand':
      case 'shopWand': {
        const col = hexAbgr(this.wand?.color ?? 0x8a5a2a);
        const y0 = b.y + (this.kind === 'shopWand' ? bob - 6 : 0);
        r.line(b.x, y0 + 4, b.x + 8, y0, col);
        r.plot(b.x + 8, y0, 0xff80f0ff);
        r.addLight(b.x + 8, y0, 18, 0.5, 0.5, 0.3);
        if (this.kind === 'shopWand') r.sprite(PEDESTAL, b.cx - 6, b.y + b.h - 1, false);
        break;
      }
      case 'card':
      case 'shopCard':
      case 'freeCard': {
        const c = card(this.cardId!);
        const y0 = b.y + bob - (this.kind === 'card' ? 0 : 6);
        const x0 = b.cx - 3;
        const kc = c.kind === 'proj' ? 0xff3060c0 : c.kind === 'mod' ? 0xff30a050 : 0xffa04080;
        r.rectFill(x0, y0, 6, 8, kc);
        r.rectFill(x0 + 1, y0 + 1, 4, 6, hexAbgr(c.color));
        r.plot(x0 + 2, y0 + 3, 0xffffffff);
        r.addLight(b.cx, y0 + 4, 20, ((c.color >> 16) & 255) / 400, ((c.color >> 8) & 255) / 400, (c.color & 255) / 400);
        if (this.kind !== 'card') r.sprite(PEDESTAL, b.cx - 6, b.y + b.h - 1, false);
        break;
      }
      case 'heart': {
        const y0 = b.y + bob;
        const rows = ['.rr.rr.', 'rRRrrrr', 'rRrrrrr', '.rrrrr.', '..rrr..', '...r...'];
        rows.forEach((row, yy) => {
          for (let xx = 0; xx < row.length; xx++) {
            if (row[xx] === 'r') r.plot(b.x + xx, y0 + yy, 0xff3030e0);
            else if (row[xx] === 'R') r.plot(b.x + xx, y0 + yy, 0xffc0c0ff);
          }
        });
        r.addLight(b.cx, y0 + 3, 22, 0.8, 0.15, 0.2);
        break;
      }
      case 'portal': {
        const cx = b.cx;
        const cy = b.cy;
        for (let k = 0; k < 60; k++) {
          const a = (k / 60) * Math.PI * 2 + time * 0.05;
          const rr = 7 + Math.sin(a * 3 + time * 0.1) * 1.5;
          r.plot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.4, k % 3 ? 0xffff80c0 : 0xffffe0ff);
        }
        for (let k = 0; k < 25; k++) {
          const a = (k / 25) * Math.PI * 2 - time * 0.08;
          const rr = 3 + ((k * 7 + time) % 5);
          r.plot(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.4, 0xffffa0ff);
        }
        r.addLight(cx, cy, 70, 0.7, 0.4, 0.9);
        break;
      }
      case 'altar':
        r.sprite(ALTAR, b.x, b.y, false);
        if (!this.used) r.addLight(b.cx, b.y + 2, 40, 0.9, 0.3, 0.4);
        break;
    }
  }
}
