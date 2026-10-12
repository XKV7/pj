// 적 7종: 시뮬레이션과 상호작용하며, 순찰/감지/추적/도주 AI와 흐름장 길찾기를 사용한다.
import { M, type DamageType } from '../sim/materials';
import { Creature, moveBody, unstick, ENEMY_CAUSES, lineOfSight, type Resist } from './entity';
import { SLIME, BAT, SPIRIT, BOMBER, MAGE, GOLEM, type Sprite } from '../render/sprites';
import type { Renderer } from '../render/renderer';
import type { Game, Target } from './game';

export type EnemyKind = 'slime' | 'bat' | 'worm' | 'spirit' | 'bomber' | 'mage' | 'golem';

interface EnemyDef {
  name: string;
  hp: number;
  w: number;
  h: number;
  flying: boolean;
  speed: number;
  resist: Resist;
  contact: number;
  contactType: DamageType;
  gold: number;
  sight: number;
  cause: string;
  canBurn: boolean;
  sprites: Sprite[] | null;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  slime: { name: '산성 슬라임', hp: 34, w: 10, h: 7, flying: false, speed: 0.45, resist: { acid: 0, fire: 1.5, poison: 0.5 }, contact: 8, contactType: 'acid', gold: 7, sight: 120, cause: '산성 슬라임에게 녹아내림', canBurn: true, sprites: SLIME },
  bat: { name: '불꽃 박쥐', hp: 20, w: 9, h: 6, flying: true, speed: 1.3, resist: { fire: 0, ice: 2, physical: 1.2 }, contact: 7, contactType: 'fire', gold: 6, sight: 150, cause: '불꽃 박쥐에게 불태워짐', canBurn: false, sprites: BAT },
  worm: { name: '굴착 벌레', hp: 70, w: 8, h: 8, flying: true, speed: 1.15, resist: { physical: 0.5, explosion: 1.3, acid: 1.2 }, contact: 14, contactType: 'physical', gold: 14, sight: 170, cause: '굴착 벌레에게 먹힘', canBurn: true, sprites: null },
  spirit: { name: '얼음 정령', hp: 36, w: 9, h: 10, flying: true, speed: 0.7, resist: { ice: 0, fire: 2.2, elec: 0.8 }, contact: 6, contactType: 'ice', gold: 10, sight: 150, cause: '얼음 정령에게 얼어붙음', canBurn: false, sprites: SPIRIT },
  bomber: { name: '폭탄 운반자', hp: 26, w: 7, h: 10, flying: false, speed: 0.75, resist: { explosion: 0.3 }, contact: 0, contactType: 'explosion', gold: 9, sight: 130, cause: '폭탄 운반자의 자폭에 휘말림', canBurn: true, sprites: BOMBER },
  mage: { name: '어둠 마법사', hp: 32, w: 7, h: 12, flying: false, speed: 0.7, resist: { magic: 0.5 }, contact: 4, contactType: 'magic', gold: 16, sight: 190, cause: '어둠 마법사의 주문에 맞음', canBurn: true, sprites: MAGE },
  golem: { name: '석상 골렘', hp: 170, w: 12, h: 16, flying: false, speed: 0.32, resist: { acid: 2.5, magic: 0.5, explosion: 0.6, fire: 0.4, physical: 0.3, elec: 0.7, ice: 0.7 }, contact: 18, contactType: 'physical', gold: 30, sight: 140, cause: '석상 골렘에게 짓눌림', canBurn: false, sprites: GOLEM },
};

export class Enemy extends Creature implements Target {
  kind: EnemyKind;
  def: EnemyDef;
  facing = 1;
  state: 'patrol' | 'chase' | 'flee' | 'attack' = 'patrol';
  alert = 0;
  timer = 0;
  animT = 0;
  contactCd = 0;
  attackT = 0;
  cooldown = 60;
  fleeT = 0;
  wanderA = Math.random() * Math.PI * 2;
  segX: number[] = [];
  segY: number[] = [];
  hvx = 0;
  hvy = 0;
  fuse = 0;
  zone: number;
  dropCard = false;

  constructor(kind: EnemyKind, x: number, y: number, zone: number) {
    const d = ENEMY_DEFS[kind];
    const hpScale = 1 + zone * 0.18;
    super(x, y, d.w, d.h, Math.round(d.hp * hpScale));
    this.kind = kind;
    this.def = d;
    this.resist = { ...d.resist };
    this.canBurn = d.canBurn;
    this.zone = zone;
    this.cooldown = 60 + Math.floor(Math.random() * 90);
    if (kind === 'worm') {
      for (let k = 0; k < 9; k++) {
        this.segX.push(x + 4);
        this.segY.push(y + 4 + k * 4);
      }
      this.hvy = -1;
    }
  }

  /** 오브젝트 풀 재사용을 위한 초기화 */
  reset(x: number, y: number, zone: number): void {
    const d = this.def;
    this.maxHp = Math.round(d.hp * (1 + zone * 0.18));
    this.hp = this.maxHp;
    this.zone = zone;
    this.dead = false;
    this.body.x = x;
    this.body.y = y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.flash = this.invuln = this.wet = this.oily = this.burning = this.chilled = this.shocked = 0;
    this.state = 'patrol';
    this.alert = this.timer = this.animT = this.contactCd = this.attackT = this.fleeT = this.fuse = 0;
    this.cooldown = 60 + Math.floor(Math.random() * 90);
    if (this.kind === 'worm') {
      for (let k = 0; k < this.segX.length; k++) {
        this.segX[k] = x + 4;
        this.segY[k] = y + 4 + k * 4;
      }
      this.hvx = 0;
      this.hvy = -1;
    }
  }

  hitTest(x: number, y: number, r: number): boolean {
    if (this.kind === 'worm') {
      for (let k = 0; k < this.segX.length; k++) {
        const dx = this.segX[k] - x;
        const dy = this.segY[k] - y;
        if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return true;
      }
      return false;
    }
    const b = this.body;
    return x + r >= b.x && x - r <= b.x + b.w && y + r >= b.y && y - r <= b.y + b.h;
  }

  update(g: Game): void {
    if (this.dead) return;
    const w = g.world;
    const b = this.body;
    const p = g.player;
    if (this.flash > 0) this.flash--;
    if (this.contactCd > 0) this.contactCd--;
    if (this.invuln > 0) this.invuln--;
    this.animT++;
    const env = this.envTick(w, ENEMY_CAUSES);
    b.liquidFrac = env.liquid;
    if (this.kind === 'bat' && env.water > 2) this.applyDamage(25 / 60, 'physical', 'water');
    if (this.kind === 'spirit' && (env.lava > 0 || env.fire > 0)) this.applyDamage(30 / 60, 'fire', 'fire');
    if (this.dead) return;

    // 감지 (시야 / 소리)
    const dx = p.body.cx - b.cx;
    const dy = p.body.cy - b.cy;
    const dist = Math.hypot(dx, dy);
    if ((this.animT % 10) === 0 && !p.dead) {
      if (dist < this.def.sight && lineOfSight(w, b.cx, b.cy, p.body.cx, p.body.cy)) this.alert = 240;
    }
    if (this.alert > 0) this.alert--;
    if (p.dead) this.alert = 0;
    if (this.fleeT > 0) this.fleeT--;
    if (this.hp < this.maxHp * 0.25 && (this.kind === 'slime' || this.kind === 'bat' || this.kind === 'mage') && this.fleeT === 0 && this.state !== 'flee') this.fleeT = 150;
    if (this.state !== 'attack') this.state = this.fleeT > 0 ? 'flee' : this.alert > 0 ? 'chase' : 'patrol';

    switch (this.kind) {
      case 'slime': this.updateSlime(g, dist); break;
      case 'bat': this.updateBat(g, dist); break;
      case 'worm': this.updateWorm(g, dist); break;
      case 'spirit': this.updateSpirit(g, dist); break;
      case 'bomber': this.updateBomber(g, dist); break;
      case 'mage': this.updateMage(g, dist); break;
      case 'golem': this.updateGolem(g, dist); break;
    }

    // 접촉 피해
    if (this.def.contact > 0 && this.contactCd === 0 && !p.dead && this.touches(p)) {
      g.damageTarget(p, this.def.contact * (1 + this.zone * 0.1), this.def.contactType, this.def.cause, Math.sign(dx) * 2, -1.5, 'enemy');
      this.contactCd = 45;
      if (this.kind === 'bat') {
        if (p.wet <= 0) p.burning = Math.max(p.burning, 90);
        this.fleeT = 50;
      }
      if (this.kind === 'spirit') p.chilled = 150;
    }
  }

  private touches(p: { body: { x: number; y: number; w: number; h: number; cx: number; cy: number } }): boolean {
    if (this.kind === 'worm') return this.hitTest(p.body.cx, p.body.cy, 4);
    const a = this.body;
    const b = p.body;
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 지상 이동 공통 ----------
  private walk(g: Game, dir: number, speed: number, jumpV = -2.8): void {
    const b = this.body;
    const w = g.world;
    unstick(w, b);
    if (dir !== 0) this.facing = dir;
    const target = dir * speed * (this.chilled > 0 ? 0.5 : 1);
    b.vx += (target - b.vx) * 0.25;
    const inLiq = b.liquidFrac > 0.4;
    if (inLiq) {
      b.vy -= 0.1;
      b.vx *= 0.9;
    }
    // 앞이 막혔거나 위로 가야 하면 점프
    if (b.onGround && dir !== 0) {
      const ahead = dir > 0 ? b.x + b.w + 1 : b.x - 2;
      const wall = w.isBlocked(Math.floor(ahead), Math.floor(b.y + b.h - 4));
      if (wall) b.vy = jumpV;
    }
    b.vy = Math.min(5, b.vy + 0.2);
    moveBody(w, b, 2);
  }

  private ledgeAhead(g: Game, dir: number): boolean {
    const b = this.body;
    const x = Math.floor(dir > 0 ? b.x + b.w + 1 : b.x - 2);
    const y = Math.floor(b.y + b.h);
    for (let k = 0; k < 6; k++) if (g.world.isBlocked(x, y + k)) return false;
    return true;
  }

  private flowDir(g: Game): { dx: number; dy: number } {
    const d = g.flow.dirAt(this.body.cx, this.body.cy);
    if (d && (d.dx !== 0 || d.dy !== 0)) return d;
    const p = g.player.body;
    return { dx: Math.sign(p.cx - this.body.cx), dy: Math.sign(p.cy - this.body.cy) };
  }

  private patrolWalk(g: Game, speed: number): void {
    const b = this.body;
    if (this.timer-- <= 0) {
      this.timer = 90 + Math.floor(Math.random() * 120);
      this.facing = Math.random() < 0.5 ? -1 : 1;
    }
    if (b.hitWallX || (b.onGround && this.ledgeAhead(g, this.facing))) this.facing = -this.facing;
    this.walk(g, this.timer % 200 < 30 ? 0 : this.facing, speed);
  }

  private updateSlime(g: Game, _dist: number): void {
    void _dist;
    const b = this.body;
    const w = g.world;
    if (this.state === 'patrol') this.patrolWalk(g, this.def.speed);
    else {
      const away = this.state === 'flee';
      const fd = this.flowDir(g);
      const dir = away ? -Math.sign(g.player.body.cx - b.cx) || 1 : fd.dx || Math.sign(g.player.body.cx - b.cx);
      if (b.onGround && (this.animT % 50) === 0) {
        b.vy = -2.4;
        b.vx = dir * 1.4;
      }
      this.walk(g, dir, this.def.speed * 1.4);
    }
    // 산성 흔적
    if ((this.animT % 70) === 0 && b.onGround) {
      const x = Math.floor(b.cx);
      const y = Math.floor(b.y + b.h - 1);
      if (w.get(x, y) === M.EMPTY) w.set(x, y, M.ACID);
    }
  }

  private fly(g: Game, tx: number, ty: number, speed: number): void {
    const b = this.body;
    const w = g.world;
    const s = speed * (this.chilled > 0 ? 0.5 : 1);
    b.vx += (tx * s - b.vx) * 0.12;
    b.vy += (ty * s - b.vy) * 0.12;
    if (tx !== 0) this.facing = Math.sign(tx);
    unstick(w, b);
    moveBody(w, b, 0);
  }

  private updateBat(g: Game, dist: number): void {
    const b = this.body;
    const w = g.world;
    const p = g.player.body;
    if (this.state === 'patrol') {
      this.wanderA += (Math.random() - 0.5) * 0.3;
      if (b.hitWallX) this.wanderA += Math.PI;
      this.fly(g, Math.cos(this.wanderA) * 0.6, Math.sin(this.wanderA) * 0.4 + Math.sin(this.animT * 0.1) * 0.3, this.def.speed);
    } else if (this.state === 'flee') {
      this.fly(g, -Math.sign(p.cx - b.cx), -0.7, this.def.speed);
    } else {
      const fd = dist < 40 ? { dx: Math.sign(p.cx - b.cx), dy: Math.sign(p.cy - b.cy) } : this.flowDir(g);
      this.fly(g, fd.dx, fd.dy + Math.sin(this.animT * 0.15) * 0.4, this.def.speed);
    }
    // 닿는 곳에 불을 붙임
    if ((this.animT % 6) === 0) {
      const x = Math.floor(b.cx + (Math.random() - 0.5) * 10);
      const y = Math.floor(b.cy + (Math.random() - 0.5) * 8);
      const m = w.get(x, y);
      if (m === M.EMPTY && Math.random() < 0.25) w.set(x, y, M.FIRE);
      else if (m === M.WOOD || m === M.OIL || m === M.FUNGUS) w.ignite(x, y);
    }
    if ((this.animT % 3) === 0) w.particles.spawnFx(b.cx, b.cy, (Math.random() - 0.5) * 0.4, -0.3, 0xff2090ff, 12, -0.02, 1);
  }

  private updateWorm(g: Game, dist: number): void {
    const w = g.world;
    const p = g.player.body;
    let hx = this.segX[0];
    let hy = this.segY[0];
    let tx: number;
    let ty: number;
    if (this.state === 'chase' && dist < 260) {
      tx = p.cx;
      ty = p.cy;
    } else {
      this.wanderA += (Math.random() - 0.5) * 0.15;
      tx = hx + Math.cos(this.wanderA) * 40;
      ty = hy + Math.sin(this.wanderA) * 40;
      if (this.state === 'flee') {
        tx = hx - (p.cx - hx);
        ty = hy - (p.cy - hy);
      }
    }
    const inGround = w.isBlocked(Math.floor(hx), Math.floor(hy));
    const want = Math.atan2(ty - hy, tx - hx);
    const cur = Math.atan2(this.hvy, this.hvx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const sp = this.def.speed * (this.chilled > 0 ? 0.5 : 1);
    if (inGround || this.body.liquidFrac > 0.3) {
      const na = cur + Math.max(-0.07, Math.min(0.07, d));
      this.hvx = Math.cos(na) * sp;
      this.hvy = Math.sin(na) * sp;
    } else {
      // 공중: 포물선 낙하
      this.hvy = Math.min(3, this.hvy + 0.08);
      this.hvx *= 0.99;
    }
    hx += this.hvx;
    hy += this.hvy;
    if (hx < 4 || hx > w.W - 5) {
      this.hvx = -this.hvx;
      hx = Math.max(4, Math.min(w.W - 5, hx));
    }
    if (hy < 4 || hy > w.H - 5) {
      this.hvy = -this.hvy;
      hy = Math.max(4, Math.min(w.H - 5, hy));
    }
    this.segX[0] = hx;
    this.segY[0] = hy;
    if ((this.animT % 2) === 0) w.dig(Math.floor(hx), Math.floor(hy), 4, 6, 0.05);
    for (let k = 1; k < this.segX.length; k++) {
      const ax = this.segX[k - 1];
      const ay = this.segY[k - 1];
      const ddx = this.segX[k] - ax;
      const ddy = this.segY[k] - ay;
      const l = Math.hypot(ddx, ddy) || 1;
      if (l > 4) {
        this.segX[k] = ax + (ddx / l) * 4;
        this.segY[k] = ay + (ddy / l) * 4;
      }
    }
    this.body.x = hx - 4;
    this.body.y = hy - 4;
    this.facing = this.hvx >= 0 ? 1 : -1;
    if ((this.animT % 40) === 0 && dist < 200) g.sound.cast('dig');
  }

  private updateSpirit(g: Game, dist: number): void {
    const b = this.body;
    const w = g.world;
    const p = g.player.body;
    if (this.state === 'patrol') {
      this.wanderA += (Math.random() - 0.5) * 0.2;
      if (b.hitWallX) this.wanderA += Math.PI;
      this.fly(g, Math.cos(this.wanderA) * 0.5, Math.sin(this.animT * 0.04) * 0.5, this.def.speed);
    } else {
      // 거리 유지
      let tx = 0;
      let ty = 0;
      if (dist > 80) {
        const fd = this.flowDir(g);
        tx = fd.dx;
        ty = fd.dy;
      } else if (dist < 50) {
        tx = -Math.sign(p.cx - b.cx);
        ty = -0.3;
      }
      this.fly(g, tx, ty + Math.sin(this.animT * 0.06) * 0.4, this.def.speed);
      // 공격: 예고 후 냉기 구체
      if (this.state === 'chase' && dist < 140 && lineOfSight(w, b.cx, b.cy, p.cx, p.cy)) {
        this.cooldown--;
        if (this.cooldown === 30) g.sound.warn();
        if (this.cooldown <= 0) {
          const a = Math.atan2(p.cy - b.cy, p.cx - b.cx);
          for (let k = -1; k <= 1; k++) g.enemyShoot('frostorb', b.cx, b.cy, a + k * 0.25, this.def.cause);
          g.sound.cast('ice');
          this.cooldown = 150 + Math.floor(Math.random() * 60);
        }
      }
    }
    // 주변을 얼림
    if ((this.animT % 5) === 0) {
      const x = Math.floor(b.cx + (Math.random() - 0.5) * 14);
      const y = Math.floor(b.cy + (Math.random() - 0.5) * 14);
      const m = w.get(x, y);
      if (m === M.EMPTY && Math.random() < 0.3) w.set(x, y, M.FROST);
      else if (m === M.WATER) w.set(x, y, M.ICE);
    }
  }

  private updateBomber(g: Game, dist: number): void {
    const b = this.body;
    const w = g.world;
    if (this.fuse > 0) {
      this.fuse--;
      b.vx *= 0.8;
      b.vy = Math.min(5, b.vy + 0.2);
      moveBody(w, b, 0);
      if ((this.fuse % 8) === 0) g.sound.warn();
      w.particles.spawnFx(b.cx, b.y - 1, (Math.random() - 0.5), -1, 0xff40e0ff, 10, 0.05, 1);
      if (this.fuse === 0) {
        this.dead = true;
        this.hp = 0;
      }
      return;
    }
    if (this.state === 'patrol') this.patrolWalk(g, this.def.speed * 0.6);
    else {
      const fd = this.flowDir(g);
      this.walk(g, fd.dx || Math.sign(g.player.body.cx - b.cx), this.def.speed * 1.3);
      if (dist < 18 && !g.player.dead) {
        this.fuse = 55;
        g.sound.warn();
      }
    }
  }

  private updateMage(g: Game, dist: number): void {
    const b = this.body;
    const w = g.world;
    const p = g.player.body;
    if (this.state === 'patrol') {
      this.patrolWalk(g, this.def.speed * 0.6);
      return;
    }
    const los = lineOfSight(w, b.cx, b.y + 3, p.cx, p.cy);
    if (this.attackT > 0) {
      // 시전 예고 중: 정지
      this.attackT--;
      this.facing = Math.sign(p.cx - b.cx) || 1;
      this.walk(g, 0, 0);
      if (this.attackT === 0) {
        const a = Math.atan2(p.cy - (b.y + 3), p.cx - b.cx);
        const id = this.zone >= 2 ? 'e_fire' : 'e_bolt';
        g.enemyShoot(id, b.cx + this.facing * 5, b.y + 3, a, this.def.cause);
        if (this.zone >= 3) {
          g.enemyShoot(id, b.cx + this.facing * 5, b.y + 3, a + 0.2, this.def.cause);
          g.enemyShoot(id, b.cx + this.facing * 5, b.y + 3, a - 0.2, this.def.cause);
        }
        g.sound.cast(id === 'e_fire' ? 'fire' : 'magic');
        this.cooldown = 110 + Math.floor(Math.random() * 70);
      }
      return;
    }
    let dir = 0;
    if (this.state === 'flee' || dist < 60) dir = -Math.sign(p.cx - b.cx) || 1;
    else if (dist > 130 || !los) dir = this.flowDir(g).dx || Math.sign(p.cx - b.cx);
    if (dir !== 0 && b.onGround && this.ledgeAhead(g, dir) && dist < 60) dir = 0;
    this.walk(g, dir, this.def.speed);
    if (dir === 0) this.facing = Math.sign(p.cx - b.cx) || 1;
    if (this.cooldown > 0) this.cooldown--;
    if (this.cooldown <= 0 && los && dist < 190) {
      this.attackT = 40;
      g.sound.warn();
    }
  }

  private updateGolem(g: Game, dist: number): void {
    const b = this.body;
    const p = g.player.body;
    if (this.attackT > 0) {
      this.attackT--;
      this.walk(g, 0, 0);
      if (this.attackT === 0) {
        // 내려찍기
        g.areaDamage(b.cx, b.y + b.h, 22, 22 * (1 + this.zone * 0.1), 'physical', this.def.cause, 'enemy');
        g.addShake(5);
        g.sound.explosion(4);
        g.world.dig(Math.floor(b.cx + this.facing * 8), Math.floor(b.y + b.h + 1), 5, 3, 0.4);
        for (let k = 0; k < 20; k++) g.world.particles.spawnFx(b.cx + (Math.random() - 0.5) * 30, b.y + b.h, (Math.random() - 0.5) * 2, -Math.random() * 2, 0xff606070, 30, 0.12);
        this.cooldown = 100;
      }
      return;
    }
    if (this.state === 'patrol') {
      this.patrolWalk(g, this.def.speed);
      return;
    }
    if (this.cooldown > 0) this.cooldown--;
    const fd = this.flowDir(g);
    this.walk(g, dist < 14 ? 0 : fd.dx || Math.sign(p.cx - b.cx), this.def.speed, -3.2);
    if (dist < 26 && this.cooldown <= 0) {
      this.attackT = 45;
      this.facing = Math.sign(p.cx - b.cx) || 1;
      g.sound.roar();
    }
  }

  /** 사망 시 재질 입자로 흩어짐 */
  onDeath(g: Game): void {
    const w = g.world;
    const b = this.body;
    const cx = Math.floor(b.cx);
    const cy = Math.floor(b.cy);
    const scatter = (m: number, n: number, sp = 2): void => {
      for (let k = 0; k < n; k++) w.particles.spawnMat(cx + (Math.random() - 0.5) * b.w, cy + (Math.random() - 0.5) * b.h, (Math.random() - 0.5) * sp * 2, -Math.random() * sp * 1.5, m, Math.floor(Math.random() * 255), w.ambient);
    };
    scatter(M.GOLD_DUST, this.def.gold + Math.floor(Math.random() * this.def.gold), 1.6);
    switch (this.kind) {
      case 'slime':
        w.fillCircle(cx, cy, 4, M.ACID, 'empty', 0.8);
        scatter(M.ACID, 14);
        break;
      case 'bat':
        w.fillCircle(cx, cy, 3, M.FIRE, 'empty', 0.6);
        scatter(M.ASH, 8);
        break;
      case 'worm':
        for (let k = 0; k < this.segX.length; k++) {
          for (let j = 0; j < 4; j++) w.particles.spawnMat(this.segX[k], this.segY[k], (Math.random() - 0.5) * 2, -Math.random() * 2, M.DIRT, Math.floor(Math.random() * 255), w.ambient);
        }
        break;
      case 'spirit':
        scatter(M.ICE, 12);
        w.fillCircle(cx, cy, 5, M.FROST, 'empty', 0.5);
        break;
      case 'bomber':
        g.explode(cx, cy, 11, 5, this.def.cause, 'enemy', 40);
        break;
      case 'mage':
        w.fillCircle(cx, cy, 3, M.SMOKE, 'empty', 0.7);
        break;
      case 'golem':
        scatter(M.STONE, 30, 2.5);
        scatter(M.GOLD_DUST, 20, 2);
        break;
    }
    g.sound.enemyDie();
    for (let k = 0; k < 12; k++) w.particles.spawnFx(b.cx, b.cy, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0xffffffff, 12, 0.05, 1);
  }

  render(r: Renderer, time: number): void {
    const b = this.body;
    let tint = 0;
    let ta = 0;
    if (this.flash > 0) {
      tint = 0xffffffff;
      ta = 0.85;
    } else if (this.shocked > 0) {
      tint = time & 2 ? 0xffffffff : 0xff40ffff;
      ta = 0.7;
    } else if (this.fuse > 0 && (this.fuse & 4)) {
      tint = 0xff2020ff;
      ta = 0.7;
    } else if (this.attackT > 0 && this.kind === 'golem') {
      tint = 0xff2040ff;
      ta = 0.25 + 0.2 * Math.sin(time * 0.5);
    } else if (this.burning > 0) {
      tint = time & 4 ? 0xff2080ff : 0xff20c0ff;
      ta = 0.35;
    } else if (this.chilled > 0) {
      tint = 0xfff0e0b0;
      ta = 0.4;
    } else if (this.wet > 0) {
      tint = 0xffd08040;
      ta = 0.2;
    }
    if (this.kind === 'worm') {
      for (let k = this.segX.length - 1; k >= 0; k--) {
        const rad = k === 0 ? 4 : 3.5 - k * 0.15;
        const base = k % 2 ? 0xff5a4a8a : 0xff6a5aa0;
        r.circle(this.segX[k], this.segY[k], Math.round(rad), ta > 0 ? tint : base, 1, true);
      }
      const hx = this.segX[0];
      const hy = this.segY[0];
      const a = Math.atan2(this.hvy, this.hvx);
      for (const s of [-0.6, 0.6]) {
        r.line(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, hx + Math.cos(a + s) * 7, hy + Math.sin(a + s) * 7, 0xffd0e0f0);
      }
      r.plot(hx + Math.cos(a - 1.2) * 2, hy + Math.sin(a - 1.2) * 2, 0xff2020ff);
      return;
    }
    const sprites = this.def.sprites!;
    const fr = sprites[Math.floor(this.animT / (this.def.flying ? 8 : 16)) % sprites.length];
    const ox = b.x + (b.w - fr.w) / 2;
    const oy = b.y + b.h - fr.h;
    r.sprite(fr, ox, oy, this.facing < 0, tint, ta);
    if (this.kind === 'mage') {
      // 지팡이 + 시전 예고 구체
      const sx = b.cx + this.facing * 5;
      r.line(sx, b.y + 2, sx, b.y + b.h, 0xff4070a0);
      if (this.attackT > 0) {
        const rad = 1 + (40 - this.attackT) / 10;
        r.circle(sx, b.y + 1, Math.round(rad), this.zone >= 2 ? 0xff2080ff : 0xff6030ff, 1, true);
        r.addLight(sx, b.y + 1, 20 + (40 - this.attackT), 0.9, 0.2, 0.5);
      }
    }
    if (this.kind === 'bat') r.addLight(b.cx, b.cy, 28, 0.8, 0.4, 0.1);
    if (this.kind === 'spirit') r.addLight(b.cx, b.cy, 26, 0.2, 0.45, 0.6);
    if (this.kind === 'golem') r.addLight(b.cx, b.y + 3, 12, 0.6, 0.3, 0.05);
    if (this.kind === 'bomber' && this.fuse > 0) r.addLight(b.cx, b.y, 24, 1, 0.3, 0.1);
    // 체력바 (피해를 입었을 때)
    if (this.hp < this.maxHp) {
      const wbar = Math.max(8, b.w);
      const f = this.hp / this.maxHp;
      r.rectFill(b.cx - wbar / 2, b.y - 4, wbar, 1, 0xff202040);
      r.rectFill(b.cx - wbar / 2, b.y - 4, Math.max(1, Math.round(wbar * f)), 1, 0xff3030e0);
    }
    if (this.state === 'chase' && this.alert > 225) {
      r.plot(b.cx, b.y - 8, 0xff40d0ff);
      r.plot(b.cx, b.y - 7, 0xff40d0ff);
      r.plot(b.cx, b.y - 5, 0xff40d0ff);
    }
  }
}

