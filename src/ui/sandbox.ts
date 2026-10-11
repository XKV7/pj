// 시뮬레이션 놀이터: 재질 팔레트로 그리기, 브러시 크기, 일시정지/한 프레임, 전체 지우기, 속도 조절.
import { World } from '../sim/world';
import { M, MATS, NUM_MATS, COLOR_TABLE } from '../sim/materials';
import { Renderer, VIEW_W, VIEW_H } from '../render/renderer';
import type { Input } from '../input';
import { text, panel, button, hover } from './draw';
import { makeBg, SANCTUARY_ZONE } from '../game/worldgen';
import type { BgTheme } from '../render/renderer';
import { sound } from '../audio/audio';
import { drawDebug } from './hud';

type Tool = number | 'erase' | 'explode' | 'heat' | 'cold';
const SPEEDS = [0.25, 0.5, 1, 2, 4];

export class Sandbox {
  world: World;
  tool: Tool = M.SAND;
  brush = 4;
  paused = false;
  speedIdx = 2;
  private acc = 0;
  private lastX = -1;
  private lastY = -1;
  private bg: BgTheme;
  time = 0;
  debug = false;
  private stepOnce = false;
  private prevDown = false;

  constructor() {
    this.world = new World(VIEW_W, VIEW_H, 99);
    this.bg = makeBg(SANCTUARY_ZONE, 77);
    this.reset();
  }

  reset(): void {
    const w = this.world;
    w.clear();
    for (let x = 0; x < w.W; x++) for (let y = w.H - 30; y < w.H; y++) w.set(x, y, y > w.H - 26 ? M.BEDROCK : M.STONE);
    w.frameBedrock();
    w.setFullActiveRegion();
    w.wakeAll();
  }

  private apply(x: number, y: number): void {
    const w = this.world;
    const t = this.tool;
    const r = this.brush;
    if (t === 'erase') {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx <= 0 || yy <= 0 || xx >= w.W - 1 || yy >= w.H - 1) continue;
        if (w.get(xx, yy) !== M.EMPTY) w.set(xx, yy, M.EMPTY);
      }
      w.requestSupportCheck(x - r - 2, y - r - 2, x + r + 2, y + r + 2);
    } else if (t === 'heat') w.heatArea(x, y, r, 40);
    else if (t === 'cold') w.heatArea(x, y, r, -40);
    else if (t === 'explode') {
      // 폭발은 클릭 시 한 번
    } else w.fillCircle(x, y, r, t, 'fluid', t === M.FIRE || t === M.SPARK ? 0.5 : 1);
  }

  /** 반환: true 면 놀이터 종료 */
  update(input: Input, uiBlocked: boolean): boolean {
    const w = this.world;
    if (input.pressed('Escape')) return true;
    if (input.pressed('Space')) this.paused = !this.paused;
    if (input.pressed('Period') || input.pressed('KeyN')) this.stepOnce = true;
    if (input.pressed('BracketRight') || input.pressed('Equal')) this.brush = Math.min(24, this.brush + 1);
    if (input.pressed('BracketLeft') || input.pressed('Minus')) this.brush = Math.max(0, this.brush - 1);
    if (input.wheel) this.brush = Math.max(0, Math.min(24, this.brush - input.wheel));
    if (input.pressed('KeyC')) this.reset();
    if (input.pressed('F3')) this.debug = !this.debug;
    const mx = Math.floor(input.mouseX);
    const my = Math.floor(input.mouseY);
    const overUi = uiBlocked || my < 16 || my > VIEW_H - 18;
    if ((input.mouseDown || input.rightDown) && !overUi) {
      const save = this.tool;
      if (input.rightDown) this.tool = 'erase';
      if (this.tool === 'explode') {
        if (!this.prevDown) {
          w.explode(mx, my, 6 + this.brush, 6, '폭발');
          sound.explosion(6 + this.brush);
        }
      } else if (this.lastX >= 0) {
        const n = Math.max(1, Math.ceil(Math.hypot(mx - this.lastX, my - this.lastY) / Math.max(1, this.brush / 2)));
        for (let k = 1; k <= n; k++) this.apply(Math.round(this.lastX + ((mx - this.lastX) * k) / n), Math.round(this.lastY + ((my - this.lastY) * k) / n));
      } else this.apply(mx, my);
      this.tool = save;
      this.lastX = mx;
      this.lastY = my;
    } else {
      this.lastX = -1;
      this.lastY = -1;
    }
    this.prevDown = input.mouseDown;
    if (!this.paused || this.stepOnce) {
      const sp = this.stepOnce ? 1 : SPEEDS[this.speedIdx];
      this.acc += sp;
      while (this.acc >= 1) {
        this.acc -= 1;
        w.step();
        this.time++;
      }
      this.stepOnce = false;
    }
    sound.setAmbience(w.countMat(M.FIRE) , 0);
    return false;
  }

  render(r: Renderer): void {
    const w = this.world;
    r.camX = 0;
    r.camY = 0;
    r.beginLights(0.85, 1, 1, 1);
    r.renderWorld(w, this.bg, this.time);
    for (let k = 0; k < w.particles.count; k++) r.plot(w.particles.x[k], w.particles.y[k], w.particles.color[k]);
    r.accumulateEmissive(w);
    r.applyLighting();
    if (this.debug) r.drawChunkGrid(w);
    r.present();
  }

  /** UI. 반환: 'exit' | null */
  drawUi(ctx: CanvasRenderingContext2D, input: Input, fps: number): 'exit' | null {
    const w = this.world;
    // 상단 바
    panel(ctx, 0, 0, VIEW_W, 15, 0.8);
    let res: 'exit' | null = null;
    if (button(ctx, input, 2, 2, 40, 11, this.paused ? '▶ 재생' : '❚❚ 정지', false, 5.5)) this.paused = !this.paused;
    if (button(ctx, input, 44, 2, 44, 11, '한 프레임', false, 5.5)) this.stepOnce = true;
    if (button(ctx, input, 90, 2, 40, 11, `속도 ×${SPEEDS[this.speedIdx]}`, false, 5.5)) this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
    if (button(ctx, input, 132, 2, 12, 11, '−', false, 6)) this.brush = Math.max(0, this.brush - 1);
    text(ctx, `브러시 ${this.brush}`, 165, 10, { size: 5.5, align: 'center' });
    if (button(ctx, input, 186, 2, 12, 11, '+', false, 6)) this.brush = Math.min(24, this.brush + 1);
    if (button(ctx, input, 200, 2, 44, 11, '전체 지우기', false, 5.5)) this.reset();
    if (button(ctx, input, VIEW_W - 42, 2, 40, 11, '나가기', false, 5.5)) res = 'exit';
    // 커서 정보
    const mx = Math.floor(input.mouseX);
    const my = Math.floor(input.mouseY);
    if (w.inBounds(mx, my)) {
      const i = my * w.W + mx;
      const m = w.mat[i];
      text(ctx, `${MATS[m].name} ${m ? w.temp[i] + '°' : ''}`, 250, 10, { size: 5.5, color: '#c8c0e0' });
    }
    // 팔레트
    const tools: Tool[] = [];
    for (let m = 1; m < NUM_MATS; m++) tools.push(m);
    tools.push('erase', 'explode', 'heat', 'cold');
    const y0 = VIEW_H - 16;
    panel(ctx, 0, y0 - 1, VIEW_W, 17, 0.85);
    const cs = 12;
    let hoverName = '';
    tools.forEach((t, k) => {
      const x = 2 + k * 13.2;
      const sel = this.tool === t;
      if (typeof t === 'number') {
        const c = COLOR_TABLE[t * 256 + 2];
        ctx.fillStyle = `rgb(${c & 255},${(c >> 8) & 255},${(c >> 16) & 255})`;
        ctx.fillRect(x, y0 + 1, cs, cs);
      } else {
        ctx.fillStyle = t === 'erase' ? '#302830' : t === 'explode' ? '#a03010' : t === 'heat' ? '#c04020' : '#2080c0';
        ctx.fillRect(x, y0 + 1, cs, cs);
        text(ctx, t === 'erase' ? '지' : t === 'explode' ? '폭' : t === 'heat' ? '열' : '냉', x + cs / 2, y0 + 9.5, { size: 6, align: 'center', bold: true });
      }
      ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = sel ? 1 : 0.5;
      ctx.strokeRect(x + 0.25, y0 + 1.25, cs - 0.5, cs - 0.5);
      if (hover(input, x, y0 + 1, cs, cs)) {
        hoverName = typeof t === 'number' ? MATS[t].name : t === 'erase' ? '지우개' : t === 'explode' ? '폭발' : t === 'heat' ? '가열' : '냉각';
        if (input.clicked) {
          this.tool = t;
          sound.click();
        }
      }
    });
    const selName = typeof this.tool === 'number' ? MATS[this.tool].name : this.tool === 'erase' ? '지우개' : this.tool === 'explode' ? '폭발' : this.tool === 'heat' ? '가열' : '냉각';
    text(ctx, hoverName || `선택: ${selName}  ·  좌클릭 그리기 · 우클릭 지우기 · 휠 브러시 · Space 정지 · N 한 프레임 · C 지우기 · Esc 나가기`, 4, y0 - 4, { size: 5, color: '#e0d8f0' });
    // 브러시 미리보기
    if (my > 15 && my < VIEW_H - 18) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(mx + 0.5, my + 0.5, Math.max(0.5, this.brush), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.debug) {
      const fake = { world: w, projectiles: { activeCount: () => 0 }, enemies: [], player: { body: { x: mx, y: my } } };
      drawDebug(ctx, fake as never, fps);
    }
    return res;
  }

  isOverUi(input: Input): boolean {
    return input.mouseY < 16 || input.mouseY > VIEW_H - 18;
  }
}
