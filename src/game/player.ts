// 플레이어 마법사: 이동/점프/부양/수영, 지팡이 시전, 상태이상 시각화.
import { M } from '../sim/materials';
import { Creature, moveBody, unstick, PLAYER_CAUSES } from './entity';
import { starterWands, type Wand } from './spells';
import { PLAYER } from '../render/sprites';
import { hexAbgr, type Renderer } from '../render/renderer';
import type { Input } from '../input';
import type { Game, Target } from './game';

export const BAG_SIZE = 16;

export class Player extends Creature implements Target {
  facing = 1;
  animT = 0;
  levit = 100;
  levitMax = 100;
  wands: (Wand | null)[];
  cur = 0;
  bag: (string | null)[] = new Array(BAG_SIZE).fill(null);
  gold = 0;
  kills = 0;
  aimAngle = 0;
  coyote = 0;
  jumpBuffer = 0;
  jumpReleased = true;
  levitating = false;
  swimming = false;
  goldSoundT = 0;
  deathT = 0;
  castFlash = 0;

  constructor(x: number, y: number) {
    super(x, y, 6, 12, 100);
    const ws = starterWands();
    this.wands = [ws[0], ws[1], ws[2], null];
  }

  get wand(): Wand | null {
    return this.wands[this.cur];
  }

  hitTest(x: number, y: number, r: number): boolean {
    const b = this.body;
    return x + r >= b.x && x - r <= b.x + b.w && y + r >= b.y && y - r <= b.y + b.h;
  }

  handPos(): { x: number; y: number } {
    return { x: this.body.cx + this.facing * 1.5, y: this.body.y + 7 };
  }

  tipPos(): { x: number; y: number } {
    const h = this.handPos();
    return { x: h.x + Math.cos(this.aimAngle) * 8, y: h.y + Math.sin(this.aimAngle) * 8 };
  }

  update(g: Game, input: Input): void {
    const w = g.world;
    const b = this.body;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.castFlash > 0) this.castFlash--;
    if (this.dead) {
      this.deathT++;
      b.vx *= 0.9;
      b.vy = Math.min(5, b.vy + 0.2);
      moveBody(w, b, 0);
      return;
    }
    unstick(w, b);
    // 조준
    const mx = g.renderer.camX + input.mouseX;
    const my = g.renderer.camY + input.mouseY;
    const hand = this.handPos();
    this.aimAngle = Math.atan2(my - hand.y, mx - hand.x);
    this.facing = mx >= b.cx ? 1 : -1;

    // 이동
    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');
    const jumpHeld = input.down('KeyW') || input.down('Space') || input.down('ArrowUp');
    const jumpPressed = input.pressed('KeyW') || input.pressed('Space') || input.pressed('ArrowUp');
    const inLiquid = b.liquidFrac > 0.35;
    this.swimming = inLiquid;
    let maxSp = 1.55;
    if (this.chilled > 0) maxSp *= 0.55;
    if (inLiquid) maxSp *= 0.7;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const accel = b.onGround ? (b.onIce ? 0.06 : 0.35) : 0.2;
    if (dir !== 0) {
      b.vx += dir * accel;
      if (Math.abs(b.vx) > maxSp) b.vx = Math.sign(b.vx) * Math.max(maxSp, Math.abs(b.vx) - 0.2);
    } else {
      const fr = b.onGround ? (b.onIce ? 0.985 : 0.7) : 0.93;
      b.vx *= fr;
      if (Math.abs(b.vx) < 0.02) b.vx = 0;
    }
    if (b.onGround) {
      this.coyote = 6;
      this.levit = Math.min(this.levitMax, this.levit + 2.5);
    } else if (this.coyote > 0) this.coyote--;
    if (jumpPressed) this.jumpBuffer = 7;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (!jumpHeld) this.jumpReleased = true;
    this.levitating = false;
    if (inLiquid) {
      // 수영 / 부력
      b.vy += 0.06;
      b.vy -= 0.12 * Math.min(1, b.liquidFrac);
      if (jumpHeld) b.vy -= 0.28;
      b.vx *= 0.92;
      b.vy *= 0.9;
      if (b.vy > 1.5) b.vy = 1.5;
      if (b.vy < -2.2) b.vy = -2.2;
      this.levit = Math.min(this.levitMax, this.levit + 1);
    } else {
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        b.vy = -3.3;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumpReleased = false;
        g.sound.jump();
      } else if (jumpHeld && !b.onGround && this.coyote === 0 && this.levit > 0 && (this.jumpReleased || b.vy > -0.6)) {
        this.levitating = true;
        b.vy = Math.max(-2.1, b.vy - 0.42);
        this.levit = Math.max(0, this.levit - 1.15);
        if ((g.time & 1) === 0) w.particles.spawnFx(b.cx + (Math.random() - 0.5) * 4, b.y + b.h, (Math.random() - 0.5) * 0.4, 0.8, 0xffffd080, 14, 0.02, 1);
      }
      b.vy += 0.2;
      if (b.vy > 5.5) b.vy = 5.5;
    }
    moveBody(w, b, 2);

    // 환경
    const env = this.envTick(w, PLAYER_CAUSES);
    b.liquidFrac = env.liquid;
    b.liquidMat = env.liquidMat;
    if (env.liquid > 0.2 && Math.abs(b.vy) > 2) g.sound.splash();
    if (env.charged > 0) g.sound.shock();
    // 불 붙은 플레이어는 주변에 불씨를 떨어뜨림
    if (this.burning > 0) {
      if ((g.time & 3) === 0) w.particles.spawnFx(b.x + Math.random() * b.w, b.y + Math.random() * b.h, (Math.random() - 0.5) * 0.5, -0.8, (g.time & 4) ? 0xff20a0ff : 0xff3060ff, 18, -0.02, 1);
      if ((g.time & 31) === 0) {
        const fx = Math.floor(b.x + Math.random() * b.w);
        const fy = Math.floor(b.y + b.h);
        if (w.get(fx, fy - 1) === M.EMPTY) w.set(fx, fy - 1, M.FIRE);
      }
    }
    if (this.wet > 0 && (g.time % 9) === 0) w.particles.spawnFx(b.x + Math.random() * b.w, b.y + 4 + Math.random() * 6, 0, 0.5, 0xffe08040, 20, 0.12);
    if (this.oily > 0 && (g.time % 13) === 0) w.particles.spawnFx(b.x + Math.random() * b.w, b.y + 6 + Math.random() * 4, 0, 0.3, 0xff1c2c3a, 24, 0.1);

    // 금 줍기
    this.collectGold(g);

    // 지팡이
    for (const wd of this.wands) if (wd) wd.tick();
    for (let k = 0; k < 4; k++) if (input.pressed('Digit' + (k + 1)) && this.wands[k]) this.cur = k;
    if (input.wheel !== 0) {
      for (let s = 1; s <= 4; s++) {
        const n = (this.cur + (input.wheel > 0 ? s : 4 - s)) % 4;
        if (this.wands[n]) {
          this.cur = n;
          break;
        }
      }
    }
    const wd = this.wand;
    if (wd && input.mouseDown && !g.uiCapturesMouse) {
      const res = wd.tryCast();
      if (res === 'fizzle') g.sound.fizzle();
      else if (res) {
        const tip = this.tipPos();
        g.castNodes(res, tip.x, tip.y, this.aimAngle, wd.spread, 'player', false);
        this.castFlash = 4;
        b.vx -= Math.cos(this.aimAngle) * 0.15;
        g.noise(b.cx, b.cy, 90);
      }
    }
    this.animT += Math.abs(b.vx) > 0.2 && b.onGround ? Math.abs(b.vx) * 0.12 : 0.03;
  }

  private collectGold(g: Game): void {
    const w = g.world;
    const b = this.body;
    const x0 = Math.floor(b.x) - 2;
    const y0 = Math.floor(b.y) - 2;
    let n = 0;
    for (let yy = y0; yy < y0 + b.h + 4; yy++) {
      for (let xx = x0; xx < x0 + b.w + 4; xx++) {
        if (w.get(xx, yy) === M.GOLD_DUST) {
          w.set(xx, yy, M.EMPTY);
          n++;
        }
      }
    }
    if (n > 0) {
      this.gold += n;
      g.goldPopup(n);
      g.sound.gold();
    }
  }

  render(r: Renderer, time: number): void {
    const b = this.body;
    let spr = PLAYER.idle[Math.floor(time / 30) % 2];
    if (this.dead) spr = PLAYER.dead;
    else if (!b.onGround && !this.swimming) spr = b.vy < 0 ? PLAYER.jump : PLAYER.fall;
    else if (Math.abs(b.vx) > 0.2) spr = PLAYER.walk[Math.floor(this.animT) % 4];
    if (!this.dead && this.invuln > 0 && (time & 4)) return;
    let tint = 0;
    let ta = 0;
    if (this.flash > 0) {
      tint = 0xffffffff;
      ta = 0.85;
    } else if (this.shocked > 0) {
      tint = time & 2 ? 0xffffffff : 0xff40ffff;
      ta = 0.7;
    } else if (this.burning > 0) {
      tint = time & 4 ? 0xff2080ff : 0xff20c0ff;
      ta = 0.35;
    } else if (this.chilled > 0) {
      tint = 0xfff0e0b0;
      ta = 0.4;
    } else if (this.wet > 0) {
      tint = 0xffd08040;
      ta = 0.22;
    } else if (this.oily > 0) {
      tint = 0xff102030;
      ta = 0.3;
    }
    const flip = this.facing < 0;
    if (this.dead) {
      r.sprite(spr, b.x - 4, b.y + b.h - spr.h, false, tint, ta);
      return;
    }
    r.sprite(spr, b.x - 2, b.y - 2, flip, tint, ta);
    // 지팡이
    const wd = this.wand;
    if (wd) {
      const h = this.handPos();
      const tx = h.x + Math.cos(this.aimAngle) * 8;
      const ty = h.y + Math.sin(this.aimAngle) * 8;
      r.line(h.x, h.y, tx, ty, hexAbgr(wd.color));
      const tipCol = this.castFlash > 0 ? 0xffffffff : wd.reloading ? 0xff6060a0 : 0xffffe080;
      r.plot(tx, ty, tipCol);
      r.addLight(tx, ty, this.castFlash > 0 ? 40 : 14, 0.6, 0.5, 0.3);
    }
  }
}
