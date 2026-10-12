// 투사체 (오브젝트 풀링). 카드별 비행/명중 효과.
import { M, BLOCKS, CAT, Cat, CONDUCTIVE, HARD } from '../sim/materials';
import { hexAbgr } from '../render/renderer';
import type { Renderer } from '../render/renderer';
import { newMods, type CastNode, type CardDef, type Mods } from './spells';
import type { Game, Target } from './game';

export type Owner = 'player' | 'enemy';

export class Projectile {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  card!: CardDef;
  mods: Mods = newMods();
  payload: CastNode[] | null = null;
  life = 0;
  maxLife = 0;
  owner: Owner = 'player';
  dmg = 0;
  bounces = 0;
  pierce = 0;
  hit: Target[] = [];
  trailX = new Float32Array(8);
  trailY = new Float32Array(8);
  trailN = 0;
  age = 0;
  lastFreeX = 0;
  lastFreeY = 0;
  color = 0;
  gravity = 0;
  triggered = false;
  causeName = '';
}

const POOL = 400;

export class ProjectileSystem {
  pool: Projectile[] = [];
  constructor() {
    for (let k = 0; k < POOL; k++) this.pool.push(new Projectile());
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }

  activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  spawn(g: Game, c: CardDef, mods: Mods, payload: CastNode[] | null, x: number, y: number, angle: number, owner: Owner, cause = ''): Projectile | null {
    const p = this.pool.find((q) => !q.active);
    if (!p) return null;
    const sp = (c.speed ?? 4) * mods.speedMul;
    p.active = true;
    p.card = c;
    p.mods = mods;
    p.payload = payload;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * sp;
    p.vy = Math.sin(angle) * sp;
    p.life = Math.round((c.life ?? 60) * mods.lifeMul);
    p.maxLife = p.life;
    p.owner = owner;
    p.dmg = ((c.dmg ?? 0) + mods.dmgAdd) * mods.dmgMul;
    if (c.dmg === 0) p.dmg = 0;
    p.bounces = (c.bounce ?? 0) + mods.bounce;
    p.pierce = (c.pierce ?? 0) + mods.pierce;
    p.hit.length = 0;
    p.trailN = 0;
    p.age = 0;
    p.lastFreeX = x;
    p.lastFreeY = y;
    p.color = hexAbgr(c.color);
    p.gravity = mods.noGrav ? 0 : c.gravity ?? 0;
    p.triggered = false;
    p.causeName = cause;
    void g;
    return p;
  }

  update(g: Game): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      this.step(g, p);
    }
  }

  private step(g: Game, p: Projectile): void {
    const w = g.world;
    p.age++;
    p.life--;
    p.vy += p.gravity;
    const id = p.card.id;
    if (id === 'missile') {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp < 9) {
        p.vx *= 1.06;
        p.vy *= 1.06;
      }
    }
    if (p.mods.homing) {
      const t = g.nearestTarget(p.x, p.y, 140, p.owner);
      if (t) {
        const want = Math.atan2(t.body.cy - p.y, t.body.cx - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + Math.max(-0.14, Math.min(0.14, d));
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
      }
    }
    // 궤적 기록
    for (let k = Math.min(7, p.trailN); k > 0; k--) {
      p.trailX[k] = p.trailX[k - 1];
      p.trailY[k] = p.trailY[k - 1];
    }
    p.trailX[0] = p.x;
    p.trailY[0] = p.y;
    if (p.trailN < 8) p.trailN++;

    // 지속 효과
    if (id === 'absorb' && (p.age & 1) === 0) {
      const ix = Math.floor(p.x);
      const iy = Math.floor(p.y);
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy > 25) continue;
        const m = w.get(ix + dx, iy + dy);
        if (m !== M.EMPTY && m !== M.BEDROCK && HARD[m] < 9 && (w.rnd() & 1)) w.set(ix + dx, iy + dy, M.EMPTY);
      }
      w.requestSupportCheck(ix - 7, iy - 7, ix + 7, iy + 7);
    }
    if (id === 'frostorb' && (p.age % 3) === 0) {
      w.fillCircle(Math.floor(p.x - p.vx * 2), Math.floor(p.y - p.vy * 2), 1, M.FROST, 'fluid', 0.6);
    }
    if (p.mods.fireTrail && (p.age % 2) === 0) {
      const tx = Math.floor(p.x - p.vx);
      const ty = Math.floor(p.y - p.vy);
      if (w.get(tx, ty) === M.EMPTY) w.set(tx, ty, M.FIRE);
    }
    if (id === 'e_lava' && (p.age % 4) === 0) {
      g.renderer.addLight(p.x, p.y, 10, 0.5, 0.2, 0.05);
    }

    // 이동 (서브스텝)
    const sp = Math.hypot(p.vx, p.vy);
    const steps = Math.max(1, Math.ceil(sp));
    const sx = p.vx / steps;
    const sy = p.vy / steps;
    for (let s = 0; s < steps; s++) {
      const px = p.x;
      const py = p.y;
      p.x += sx;
      p.y += sy;
      const ix = Math.floor(p.x);
      const iy = Math.floor(p.y);
      if (!w.inBounds(ix, iy)) {
        this.kill(g, p, false);
        return;
      }
      if (id === 'dig') {
        w.dig(ix, iy, 3, 6, 0.04);
        if (w.get(ix, iy) === M.BEDROCK) {
          this.kill(g, p, false);
          return;
        }
        continue;
      }
      const m = w.mat[iy * w.W + ix];
      // 액체와의 특수 상호작용
      if (m !== 0 && CAT[m] === Cat.LIQUID) {
        if (id === 'lightning' && CONDUCTIVE[m]) {
          this.impact(g, p, ix, iy);
          return;
        }
        if ((id === 'fireball' || id === 'e_fire') && m === M.WATER) {
          w.set(ix, iy, M.STEAM);
          g.puff(p.x, p.y, 0xc8ccd4, 6);
          this.kill(g, p, false);
          return;
        }
        if (id === 'icelance' && m === M.WATER) w.set(ix, iy, M.ICE);
      }
      if (id === 'absorb') {
        // 지형 통과
      } else if (BLOCKS[m]) {
        if (p.bounces > 0) {
          p.bounces--;
          const bx = w.isBlocked(Math.floor(p.x), Math.floor(py));
          const by = w.isBlocked(Math.floor(px), Math.floor(p.y));
          p.x = px;
          p.y = py;
          if (bx && !by) p.vx = -p.vx * 0.8;
          else if (by && !bx) p.vy = -p.vy * 0.6;
          else {
            p.vx = -p.vx * 0.7;
            p.vy = -p.vy * 0.6;
          }
          if (id === 'bomb') g.sound.click();
          break;
        }
        p.x = px;
        p.y = py;
        this.impact(g, p, ix, iy);
        return;
      } else {
        p.lastFreeX = p.x;
        p.lastFreeY = p.y;
      }
      // 대상 충돌
      if (p.dmg > 0 || id === 'teleport' || id === 'bomb') {
        const r = (p.card.size ?? 1) + 1;
        const t = g.targetAt(p.x, p.y, r, p.owner, p.hit);
        if (t) {
          if (id === 'bomb') {
            // 폭탄은 적에 닿으면 바로 터짐
            this.impact(g, p, ix, iy);
            return;
          }
          p.hit.push(t);
          g.damageTarget(t, p.dmg, p.card.dmgType ?? 'magic', p.owner === 'player' ? '자신의 주문' : p.causeName, p.vx * 0.4, p.vy * 0.4 - 0.5, p.owner);
          this.onHitTarget(p, t);
          if (p.pierce > 0) {
            p.pierce--;
          } else {
            this.impact(g, p, ix, iy);
            return;
          }
        }
      }
    }
    if (p.life <= 0) {
      const expireEffect = ['bomb', 'sandball', 'oilball', 'waterball', 'powderball', 'frostorb', 'teleport', 'missile', 'e_lava'].includes(id);
      if (expireEffect) this.impact(g, p, Math.floor(p.x), Math.floor(p.y));
      else this.kill(g, p, true);
    }
  }

  private onHitTarget(p: Projectile, t: Target): void {
    const id = p.card.id;
    const c = t as unknown as { wet?: number; burning?: number; chilled?: number; oily?: number; canBurn?: boolean };
    if (id === 'waterjet' && c.wet !== undefined) {
      c.wet = 360;
      c.burning = 0;
    }
    if ((id === 'fireball' || id === 'e_fire') && c.burning !== undefined && c.canBurn && !(c.wet && c.wet > 0)) c.burning = 120;
    if ((id === 'icelance' || id === 'frostorb') && c.chilled !== undefined) c.chilled = 150;
  }

  /** 명중/소멸 효과 */
  impact(g: Game, p: Projectile, ix: number, iy: number): void {
    const w = g.world;
    const id = p.card.id;
    const fx = Math.floor(p.lastFreeX);
    const fy = Math.floor(p.lastFreeY);
    const mine = p.owner === 'player';
    const cause = mine ? '자신의 폭발에 휘말림' : p.causeName || '폭발에 휘말림';
    switch (id) {
      case 'spark':
        g.puff(p.x, p.y, 0xffe080, 5);
        break;
      case 'e_bolt':
        g.puff(p.x, p.y, 0xff3060, 6);
        break;
      case 'e_shard':
        g.puff(p.x, p.y, 0xd0a0ff, 8);
        w.fillCircle(fx, fy, 1, M.CRYSTAL, 'empty', 0.3);
        break;
      case 'fireball':
      case 'e_fire':
        w.fillCircle(fx, fy, 4, M.FIRE, 'empty', 0.7);
        for (let k = 0; k < 10; k++) w.ignite(ix + Math.floor(w.rand01() * 7 - 3), iy + Math.floor(w.rand01() * 7 - 3));
        w.heatArea(ix, iy, 3, 250);
        g.areaDamage(p.x, p.y, 8, p.dmg * 0.5, 'fire', cause, p.owner);
        g.flashLight(p.x, p.y, 40, 1, 0.5, 0.15);
        g.sound.cast('fire');
        g.addShake(1.5);
        break;
      case 'acid':
      case 'e_acid':
        w.fillCircle(fx, fy, 3, M.ACID, 'fluid', 0.9);
        g.sound.cast('acid');
        break;
      case 'icelance':
        w.fillCircle(fx, fy, 3, M.FROST, 'fluid', 0.8);
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          if (w.get(ix + dx, iy + dy) === M.WATER && dx * dx + dy * dy <= 16) w.set(ix + dx, iy + dy, M.ICE);
        }
        g.puff(p.x, p.y, 0xd8f4ff, 8);
        break;
      case 'lightning': {
        w.fillCircle(fx, fy, 2, M.SPARK, 'fluid', 0.8);
        let n = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const m = w.get(ix + dx, iy + dy);
          if (CONDUCTIVE[m] && w.charge[(iy + dy) * w.W + ix + dx] === 0) n += w.conduct(ix + dx, iy + dy);
        }
        g.areaDamage(p.x, p.y, 7, p.dmg * 0.5, 'elec', mine ? '자신의 번개에 감전됨' : '번개에 감전됨', p.owner);
        g.flashLight(p.x, p.y, 50, 0.6, 0.8, 1.2);
        g.sound.shock();
        if (n > 50) g.addShake(2);
        break;
      }
      case 'bomb':
        g.explode(ix, iy, 12, 6, cause, p.owner);
        break;
      case 'waterjet':
        w.fillCircle(fx, fy, 2, M.WATER, 'fluid', 0.8);
        break;
      case 'sandball':
        w.fillCircle(fx, fy, 5, M.SAND, 'fluid');
        break;
      case 'oilball':
        w.fillCircle(fx, fy, 5, M.OIL, 'fluid');
        break;
      case 'waterball':
        w.fillCircle(fx, fy, 6, M.WATER, 'fluid');
        g.sound.splash();
        break;
      case 'powderball':
        w.fillCircle(fx, fy, 4, M.GUNPOWDER, 'empty');
        break;
      case 'missile':
        g.explode(ix, iy, 5, 4, cause, p.owner, p.dmg * 0.6);
        break;
      case 'absorb':
        g.puff(p.x, p.y, 0x6040a0, 12);
        break;
      case 'frostorb':
        w.fillCircle(fx, fy, 6, M.FROST, 'fluid', 0.85);
        g.areaDamage(p.x, p.y, 10, p.dmg, 'ice', cause, p.owner);
        g.sound.cast('ice');
        break;
      case 'teleport':
        if (mine) g.teleportPlayer(p.lastFreeX, p.lastFreeY);
        break;
      case 'e_lava':
        w.fillCircle(fx, fy, 2, M.LAVA, 'fluid', 0.9);
        break;
    }
    if (p.mods.explosive) g.explode(ix, iy, 6, 4, cause, p.owner, 20);
    if (p.payload && !p.triggered) {
      p.triggered = true;
      const ang = Math.atan2(p.vy, p.vx);
      g.castNodes(p.payload, p.lastFreeX, p.lastFreeY, ang, 0, p.owner, true);
    }
    this.kill(g, p, false);
  }

  private kill(g: Game, p: Projectile, fade: boolean): void {
    p.active = false;
    if (fade) g.puff(p.x, p.y, p.card.color, 3);
  }

  render(r: Renderer, time: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const id = p.card.id;
      const col = p.color;
      // 궤적
      for (let k = 1; k < p.trailN; k++) {
        r.line(p.trailX[k - 1], p.trailY[k - 1], p.trailX[k], p.trailY[k], col, Math.max(0.1, 0.7 - k * 0.1));
      }
      const sz = p.card.size ?? 1;
      if (id === 'bomb') {
        r.circle(p.x, p.y, 2, 0xff303030, 1, true);
        r.plot(p.x + 1, p.y - 3, (time >> 2) & 1 ? 0xff40e0ff : 0xff2080ff);
        r.addLight(p.x, p.y - 3, 14, 0.5, 0.35, 0.1);
      } else if (id === 'absorb') {
        r.circle(p.x, p.y, 4, 0xff000000, 1, true);
        r.circle(p.x, p.y, 5 + Math.sin(time * 0.3), 0xffff60c0, 1);
        r.addLight(p.x, p.y, 30, 0.4, 0.2, 0.6);
      } else if (id === 'dig') {
        r.circle(p.x, p.y, 2, col, 0.6, true);
        r.addLight(p.x, p.y, 16, 0.4, 0.3, 0.15);
      } else {
        if (sz >= 2) r.circle(p.x, p.y, sz - 1, col, 1, true);
        r.plot(p.x, p.y, 0xffffffff);
        const c = p.card.color;
        r.addLight(p.x, p.y, 18 + sz * 8, ((c >> 16) & 255) / 255 * 0.8, ((c >> 8) & 255) / 255 * 0.8, (c & 255) / 255 * 0.8);
      }
    }
  }
}
