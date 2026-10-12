// 한 번의 플레이(런)를 관리: 레벨 로드, 업데이트 순서, 전투/피해, 연출, 상호작용.
import { M, CAT, Cat, type DamageType } from '../sim/materials';
import type { World, ExplosionInfo } from '../sim/world';
import { Renderer, VIEW_W, VIEW_H } from '../render/renderer';
import { sound } from '../audio/audio';
import type { Input } from '../input';
import { lineOfSight, type Body } from './entity';
import { Player, BAG_SIZE } from './player';
import { Enemy, type EnemyKind } from './enemies';
import { Boss } from './boss';
import { Item } from './items';
import { ProjectileSystem, type Owner } from './projectiles';
import { FlowField } from './pathfind';
import { card, newMods, type CastNode, type Wand } from './spells';
import { generateZone, generateSanctuary, generateBossArena, chestLoot, ZONES, type Level } from './worldgen';

export interface Target {
  body: Body;
  dead: boolean;
  hitTest(x: number, y: number, r: number): boolean;
}

export type Stage = 'zone' | 'sanctuary' | 'boss';

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface FlashLight {
  x: number;
  y: number;
  r: number;
  cr: number;
  cg: number;
  cb: number;
  life: number;
  max: number;
}

export interface RunSummary {
  victory: boolean;
  cause: string;
  zoneName: string;
  zoneIndex: number;
  kills: number;
  frames: number;
  gold: number;
  wands: { name: string; cards: string[] }[];
}

export class Game {
  renderer: Renderer;
  input: Input;
  sound = sound;
  level!: Level;
  world!: World;
  player: Player;
  enemies: Enemy[] = [];
  items: Item[] = [];
  boss: Boss | null = null;
  projectiles = new ProjectileSystem();
  flow = new FlowField();
  time = 0;
  runFrames = 0;
  stage: Stage = 'zone';
  stageIndex = 0; // 구역 0..4, 보스 5
  seed: number;
  shake = 0;
  hitstop = 0;
  texts: FloatText[] = [];
  flashes: FlashLight[] = [];
  banner: { title: string; sub: string; t: number; max: number } | null = null;
  uiCapturesMouse = false;
  explored: Uint8Array = new Uint8Array(1);
  exploredW = 1;
  exploredH = 1;
  lastPlayerExplosion = -9999;
  over: 'dead' | 'victory' | null = null;
  overT = 0;
  summary: RunSummary | null = null;
  prompt = '';
  fireCount = 0;
  liquidCount = 0;
  transition = 0; // 페이드
  pendingNext = false;
  debug = false;
  freeTaken = false;
  goldFlash = 0;
  bossDefeated = false;
  /** 죽은 적 객체 풀 (재사용) */
  enemyPool: Enemy[] = [];
  private explosionDmg = new Map<string, { dmg: number; owner: Owner | 'boss' }>();
  private bodyHitCd = new WeakMap<object, number>();

  constructor(renderer: Renderer, input: Input, seed: number) {
    this.renderer = renderer;
    this.input = input;
    this.seed = seed;
    this.player = new Player(0, 0);
    this.loadLevel(generateZone(0, seed), 'zone', 0);
  }

  // ---------- 레벨 ----------
  loadLevel(level: Level, stage: Stage, index: number): void {
    this.level = level;
    this.world = level.world;
    this.stage = stage;
    this.stageIndex = index;
    this.time = 0;
    for (const e of this.enemies) if (this.enemyPool.length < 64) this.enemyPool.push(e);
    this.enemies = [];
    this.items = level.items;
    this.boss = null;
    this.projectiles.clear();
    this.texts = [];
    this.flashes = [];
    this.freeTaken = false;
    this.world.onExplosion = (e) => this.onWorldExplosion(e);
    const p = this.player;
    p.body.x = level.spawnX - (level.kind === 'zone' ? 26 : 0) - p.body.w / 2;
    p.body.y = level.spawnY - p.body.h - 1;
    p.body.vx = 0;
    p.body.vy = 0;
    p.burning = 0;
    for (const e of level.enemies) this.spawnEnemy(e.kind, e.x, e.y - 1);
    if (level.kind === 'boss') this.boss = new Boss(level.bossX, level.bossY);
    this.exploredW = Math.ceil(this.world.W / 4);
    this.exploredH = Math.ceil(this.world.H / 4);
    this.explored = new Uint8Array(this.exploredW * this.exploredH);
    this.renderer.camX = p.body.cx - VIEW_W / 2;
    this.renderer.camY = p.body.cy - VIEW_H / 2;
    this.clampCamera();
    this.showBanner(level.zone.name, level.zone.sub, 220);
    sound.setZone(stage === 'boss' ? 6 : stage === 'sanctuary' ? 5 : index);
    if (stage !== 'boss') sound.stopBossMusic();
    this.transition = 1;
    // 성소 진입 시 완전 회복
    if (stage === 'sanctuary') {
      p.hp = p.maxHp;
      p.burning = 0;
      for (const wd of p.wands) if (wd) wd.mana = wd.manaMax;
    }
  }

  nextStage(): void {
    if (this.stage === 'zone') {
      this.loadLevel(generateSanctuary(this.stageIndex, this.seed, this.stageIndex + 1), 'sanctuary', this.stageIndex);
    } else if (this.stage === 'sanctuary') {
      const n = this.stageIndex + 1;
      if (n >= ZONES.length) this.loadLevel(generateBossArena(this.seed), 'boss', 5);
      else this.loadLevel(generateZone(n, this.seed), 'zone', n);
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const zone = Math.min(5, this.stageIndex);
    const pi = this.enemyPool.findIndex((q) => q.kind === kind);
    let e: Enemy;
    if (pi >= 0) {
      e = this.enemyPool[pi];
      this.enemyPool.splice(pi, 1);
      e.reset(x, y, zone);
    } else e = new Enemy(kind, x, y, zone);
    e.body.x = x - e.body.w / 2;
    e.body.y = y - e.body.h;
    this.enemies.push(e);
    return e;
  }

  // ---------- 메인 업데이트 ----------
  update(): void {
    const input = this.input;
    if (input.pressed('F3')) this.debug = !this.debug;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - 0.04);
    if (this.banner) {
      this.banner.t++;
      if (this.banner.t > this.banner.max) this.banner = null;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake * 0.88 - 0.05);
    if (this.renderer.flash > 0) this.renderer.flash = Math.max(0, this.renderer.flash - 0.06);
    if (this.goldFlash > 0) this.goldFlash--;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    this.time++;
    if (!this.over) this.runFrames++;
    const w = this.world;
    const p = this.player;

    // 활성 영역: 화면 주변만 시뮬레이션 (먼 청크는 슬립)
    const r = this.renderer;
    w.setActiveRegion(Math.floor(r.camX) - 32, Math.floor(r.camY) - 32, Math.floor(r.camX) + VIEW_W + 32, Math.floor(r.camY) + VIEW_H + 32);

    p.update(this, input);
    if (!p.dead && !this.over) this.interact();

    if (this.time % 15 === 1 && !p.dead) this.flow.build(w, p.body.cx, p.body.cy);
    for (const e of this.enemies) {
      const far = Math.abs(e.body.cx - p.body.cx) > 420 || Math.abs(e.body.cy - p.body.cy) > 320;
      if (far && this.time % 8 !== 0) continue;
      e.update(this);
    }
    if (this.boss) this.boss.update(this);
    this.projectiles.update(this);
    for (const it of this.items) it.update(w);

    w.step();
    this.rigidDamage();

    // 사망 처리
    for (let k = this.enemies.length - 1; k >= 0; k--) {
      const e = this.enemies[k];
      if (e.dead) {
        e.onDeath(this);
        if (!p.dead) p.kills++;
        if (Math.random() < (e.kind === 'mage' ? 0.25 : 0.04)) {
          const it = new Item('card', e.body.cx, e.body.y + e.body.h);
          it.cardId = cardFor(this.stageIndex + 1);
          it.body.vy = -2;
          this.items.push(it);
        }
        this.enemies.splice(k, 1);
        if (this.enemyPool.length < 64) this.enemyPool.push(e);
      }
    }
    if (p.dead && !this.over) {
      this.over = 'dead';
      this.overT = 0;
      sound.death();
      sound.stopBossMusic();
      this.summary = this.makeSummary(false);
    }
    if (this.over) this.overT++;

    // 떠다니는 텍스트 / 섬광
    for (let k = this.texts.length - 1; k >= 0; k--) {
      const t = this.texts[k];
      t.y -= 0.35;
      if (--t.life <= 0) this.texts.splice(k, 1);
    }
    for (let k = this.flashes.length - 1; k >= 0; k--) if (--this.flashes[k].life <= 0) this.flashes.splice(k, 1);

    this.updateCamera();
    this.updateExplored();
    if (this.time % 10 === 0) this.measureAmbience();
    sound.setAmbience(this.fireCount, this.liquidCount);

    if (this.pendingNext) {
      this.pendingNext = false;
      this.nextStage();
    }
  }

  private measureAmbience(): void {
    const w = this.world;
    const r = this.renderer;
    const x0 = Math.max(0, Math.floor(r.camX));
    const y0 = Math.max(0, Math.floor(r.camY));
    const x1 = Math.min(w.W - 1, x0 + VIEW_W);
    const y1 = Math.min(w.H - 1, y0 + VIEW_H);
    let fire = 0;
    let liq = 0;
    for (let y = y0; y <= y1; y += 2) {
      const row = y * w.W;
      for (let x = x0; x <= x1; x += 2) {
        const m = w.mat[row + x];
        if (m === M.FIRE) fire++;
        else if (CAT[m] === Cat.LIQUID && w.stamp[row + x] !== 0 && w.chunkActive[(y >> 6) * w.CW + (x >> 6)]) liq++;
      }
    }
    this.fireCount = fire * 4;
    this.liquidCount = Math.min(3000, liq);
  }

  // ---------- 카메라 ----------
  private updateCamera(): void {
    const r = this.renderer;
    const p = this.player.body;
    const stick = this.input.aimSource === 'stick';
    const mx = stick ? Math.cos(this.input.aimAngle) * 200 : this.input.mouseX - VIEW_W / 2;
    const my = stick ? Math.sin(this.input.aimAngle) * 140 : this.input.mouseY - VIEW_H / 2;
    const tx = p.cx - VIEW_W / 2 + Math.max(-60, Math.min(60, mx * 0.25));
    const ty = p.cy - VIEW_H / 2 + Math.max(-40, Math.min(40, my * 0.25));
    r.camX += (tx - r.camX) * 0.12;
    r.camY += (ty - r.camY) * 0.12;
    this.clampCamera();
  }

  private clampCamera(): void {
    const r = this.renderer;
    const w = this.world;
    r.camX = Math.max(0, Math.min(w.W - VIEW_W, r.camX));
    r.camY = Math.max(0, Math.min(w.H - VIEW_H, r.camY));
    if (w.W < VIEW_W) r.camX = (w.W - VIEW_W) / 2;
    if (w.H < VIEW_H) r.camY = (w.H - VIEW_H) / 2;
  }

  private updateExplored(): void {
    const p = this.player.body;
    const cx = Math.floor(p.cx / 4);
    const cy = Math.floor(p.cy / 4);
    const R = 22;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= this.exploredW || y >= this.exploredH) continue;
      this.explored[y * this.exploredW + x] = 1;
    }
  }

  // ---------- 주문 ----------
  castNodes(nodes: CastNode[], x: number, y: number, angle: number, spreadDeg: number, owner: Owner, payload: boolean): void {
    const sounds = new Set<string>();
    for (const n of nodes) {
      const sp = ((spreadDeg + (n.card.spread ?? 0)) * Math.PI) / 180;
      const a = angle + n.angle + (Math.random() - 0.5) * sp;
      this.projectiles.spawn(this, n.card, n.mods, n.payload, x, y, a, owner);
      if (n.card.sound) sounds.add(n.card.sound);
    }
    if (!payload) for (const s of sounds) sound.cast(s);
  }

  enemyShoot(id: string, x: number, y: number, angle: number, cause: string): void {
    this.projectiles.spawn(this, card(id), newMods(), null, x, y, angle, 'enemy', cause);
  }

  /** 자동 조준이 현재 보정 중인 대상 (HUD 표시용) */
  aimTarget: Target | null = null;

  /** 자동 조준: 조준 방향 근처(±20°)에서 보이는 적을 찾아 그 방향으로 보정한 각도를 돌려준다 */
  aimAssist(x: number, y: number, angle: number): number {
    const MAX_DIFF = 0.35;
    const RANGE = 240;
    let best: Target | null = null;
    let bestScore = Infinity;
    let bestAngle = angle;
    for (const t of this.targets('player')) {
      const tx = t.body.cx;
      const ty = t.body.cy;
      const dist = Math.hypot(tx - x, ty - y);
      if (dist > RANGE || dist < 4) continue;
      const a = Math.atan2(ty - y, tx - x);
      let d = a - angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > MAX_DIFF) continue;
      if (!lineOfSight(this.world, x, y, tx, ty)) continue;
      const score = Math.abs(d) + dist / 1500;
      if (score < bestScore) {
        bestScore = score;
        best = t;
        bestAngle = a;
      }
    }
    this.aimTarget = best;
    return bestAngle;
  }

  // ---------- 대상/피해 ----------
  private targets(owner: Owner): Target[] {
    if (owner === 'enemy') return this.player.dead ? [] : [this.player];
    const out: Target[] = this.enemies.filter((e) => !e.dead);
    if (this.boss && this.boss.state !== 'dead' && this.boss.state !== 'dormant') out.push(this.boss);
    return out;
  }

  targetAt(x: number, y: number, r: number, owner: Owner, exclude: Target[]): Target | null {
    for (const t of this.targets(owner)) {
      if (exclude.includes(t)) continue;
      if (t.hitTest(x, y, r)) return t;
    }
    return null;
  }

  nearestTarget(x: number, y: number, range: number, owner: Owner): Target | null {
    let best: Target | null = null;
    let bd = range * range;
    for (const t of this.targets(owner)) {
      const dx = t.body.cx - x;
      const dy = t.body.cy - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  damageTarget(t: Target, amount: number, type: DamageType, cause: string, kx: number, ky: number, owner: Owner | 'boss'): void {
    if (t instanceof Boss) {
      if (t.invulnerable()) {
        this.texts.push({ x: t.cx, y: t.cy - 22, text: '무적', color: '#c0a0ff', life: 30 });
        return;
      }
      const d = t.applyDamage(amount, type, cause);
      if (t.dead) t.hp = 0;
      t.dead = false;
      this.dmgText(t.cx, t.cy - 20, d, type);
      if (d > 0) sound.hit();
      return;
    }
    const c = t as Player | Enemy;
    if (c === this.player) {
      if (this.player.invuln > 0 || this.over) return;
      if (owner === 'player' && cause === '자신의 주문') cause = '자신의 주문에 맞음';
      const d = c.applyDamage(amount, type, cause);
      if (d > 0) {
        this.player.invuln = 36;
        c.body.vx += kx;
        c.body.vy += ky;
        this.addShake(Math.min(6, 2 + d * 0.15));
        this.hitstop = Math.max(this.hitstop, 3);
        sound.hurt();
        this.dmgText(c.body.cx, c.body.y - 2, d, type, true);
      }
      return;
    }
    const e = c as Enemy;
    const d = e.applyDamage(amount, type, cause);
    if (d > 0) {
      e.body.vx += kx * 0.6;
      e.body.vy += ky * 0.6;
      e.alert = 300;
      this.dmgText(e.body.cx, e.body.y - 2, d, type);
      sound.hit();
      if (d >= 25) this.hitstop = Math.max(this.hitstop, 2);
    }
  }

  private dmgText(x: number, y: number, d: number, type: DamageType, isPlayer = false): void {
    if (d < 1) return;
    const colors: Record<DamageType, string> = { magic: '#ffe080', fire: '#ff9040', acid: '#90ff60', ice: '#a0e8ff', elec: '#c0e0ff', explosion: '#ffb060', poison: '#d080ff', physical: '#e0e0e0' };
    this.texts.push({ x: x + (Math.random() - 0.5) * 6, y, text: String(Math.round(d)), color: isPlayer ? '#ff5050' : colors[type], life: 40 });
  }

  areaDamage(x: number, y: number, r: number, dmg: number, type: DamageType, cause: string, owner: Owner | 'boss'): void {
    const list: Target[] = owner === 'enemy' ? [this.player] : [...this.targets('player'), this.player];
    for (const t of list) {
      if (t.dead) continue;
      const dx = t.body.cx - x;
      const dy = t.body.cy - y;
      const d = Math.hypot(dx, dy);
      if (d > r + Math.max(t.body.w, t.body.h) / 2) continue;
      const f = Math.max(0.3, 1 - d / (r + 8));
      if (t === this.player && owner === 'player' && type !== 'explosion') continue;
      this.damageTarget(t, dmg * f, type, cause, (dx / (d || 1)) * 2.5 * f, (dy / (d || 1)) * 2.5 * f - 1, owner);
    }
  }

  explode(x: number, y: number, r: number, power: number, cause: string, owner: Owner | 'boss', dmg?: number): void {
    this.explosionDmg.set(`${x},${y},${r}`, { dmg: dmg ?? r * 3.4 + power * 2, owner });
    if (owner === 'player') this.lastPlayerExplosion = this.time;
    this.world.explode(x, y, r, power, cause);
  }

  private onWorldExplosion(e: ExplosionInfo): void {
    const key = `${e.x},${e.y},${e.r}`;
    const info = this.explosionDmg.get(key);
    this.explosionDmg.delete(key);
    const dmg = info ? info.dmg : e.r * 3.4 + e.power * 2;
    let cause = e.cause;
    if (!info && this.time - this.lastPlayerExplosion < 300) cause = '자신이 일으킨 연쇄 폭발에 휘말림';
    const owner: Owner | 'boss' = info ? info.owner : 'player';
    if (dmg > 0) {
      const R = e.r * 1.8 + 4;
      const all: Target[] = [...this.enemies.filter((q) => !q.dead), this.player];
      if (this.boss && this.boss.state === 'fight') all.push(this.boss);
      for (const t of all) {
        if (t.dead) continue;
        const dx = t.body.cx - e.x;
        const dy = t.body.cy - e.y;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const f = Math.max(0.25, 1 - d / R);
        if (t === this.player) {
          this.damageTarget(t, dmg * f, 'explosion', cause, (dx / (d || 1)) * 4 * f, (dy / (d || 1)) * 4 * f - 2, owner === 'player' ? 'player' : 'enemy');
        } else {
          this.damageTarget(t, dmg * f, 'explosion', cause, (dx / (d || 1)) * 4 * f, (dy / (d || 1)) * 4 * f - 2, 'player');
        }
      }
    }
    const pd = Math.hypot(this.player.body.cx - e.x, this.player.body.cy - e.y);
    this.addShake(Math.min(10, e.r * 0.7) * Math.max(0.2, 1 - pd / 300));
    if (e.r >= 10) this.hitstop = Math.max(this.hitstop, 3);
    this.flashLight(e.x, e.y, e.r * 7, 1.6, 1.0, 0.5);
    if (pd < 140) {
      this.renderer.flash = Math.max(this.renderer.flash, Math.min(0.5, e.r * 0.03) * (1 - pd / 140));
      this.renderer.flashColor = [1, 0.85, 0.6];
    }
    for (let k = 0; k < e.r * 3; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * e.r * 0.4;
      this.world.particles.spawnFx(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, k & 1 ? 0xff40c0ff : 0xff80f0ff, 10 + Math.floor(Math.random() * 12), 0.02, 1);
    }
    sound.explosion(e.r);
    this.noise(e.x, e.y, e.r * 15);
  }

  /** 낙하 중인 강체가 생명체를 덮침 */
  private rigidDamage(): void {
    const bodies = this.world.rigid.bodies;
    if (!bodies.length) return;
    const all: (Player | Enemy)[] = [this.player, ...this.enemies];
    for (const rb of bodies) {
      if (rb.vy < 1.5) continue;
      for (const c of all) {
        if (c.dead) continue;
        const b = c.body;
        if (b.x + b.w < rb.x || b.x > rb.x + rb.w || b.y + b.h < rb.y || b.y > rb.y + rb.h + 1) continue;
        // 실제 셀 겹침 확인
        let hit = false;
        for (let yy = Math.floor(b.y); yy < b.y + b.h && !hit; yy++) for (let xx = Math.floor(b.x); xx < b.x + b.w; xx++) {
          const lx = xx - rb.x;
          const ly = yy - rb.y;
          if (lx >= 0 && ly >= 0 && lx < rb.w && ly < rb.h && rb.mats[ly * rb.w + lx]) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
        const cd = this.bodyHitCd.get(c) ?? 0;
        if (this.time < cd) continue;
        this.bodyHitCd.set(c, this.time + 20);
        this.damageTarget(c, 8 + rb.vy * 5 + Math.min(20, rb.cells / 40), 'physical', '무너진 바위에 깔림', 0, 2, 'enemy');
      }
    }
  }

  teleportPlayer(x: number, y: number): void {
    const b = this.player.body;
    this.puff(b.cx, b.cy, 0x60ffe0, 16);
    b.x = x - b.w / 2;
    b.y = y - b.h / 2;
    b.vx = 0;
    b.vy = 0;
    this.puff(x, y, 0x60ffe0, 16);
    sound.portal();
  }

  // ---------- 연출 ----------
  puff(x: number, y: number, rgb: number, n: number): void {
    const c = (0xff000000 | ((rgb & 255) << 16) | (((rgb >> 8) & 255) << 8) | ((rgb >> 16) & 255)) >>> 0;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 1.5;
      this.world.particles.spawnFx(x, y, Math.cos(a) * sp, Math.sin(a) * sp, c, 10 + Math.floor(Math.random() * 14), 0.03, 1);
    }
  }

  flashLight(x: number, y: number, r: number, cr: number, cg: number, cb: number): void {
    this.flashes.push({ x, y, r, cr, cg, cb, life: 12, max: 12 });
  }

  addShake(n: number): void {
    this.shake = Math.min(14, Math.max(this.shake, n));
  }

  noise(x: number, y: number, r: number): void {
    for (const e of this.enemies) {
      if (Math.hypot(e.body.cx - x, e.body.cy - y) < r) e.alert = Math.max(e.alert, 200);
    }
  }

  goldPopup(n: number): void {
    const b = this.player.body;
    const last = this.texts.find((t) => t.text.startsWith('+') && t.life > 25 && t.color === '#ffd84a');
    if (last) {
      last.text = '+' + (parseInt(last.text.slice(1), 10) + n) + '금';
      last.life = 40;
    } else this.texts.push({ x: b.cx, y: b.y - 6, text: '+' + n + '금', color: '#ffd84a', life: 40 });
    this.goldFlash = 20;
  }

  showBanner(title: string, sub: string, dur: number): void {
    this.banner = { title, sub, t: 0, max: dur };
  }

  onBossDefeated(): void {
    this.bossDefeated = true;
    sound.victory();
    this.showBanner('연금 심장을 쓰러뜨렸다!', '심연에 고요가 찾아온다', 240);
    window.setTimeout(() => {
      if (!this.over) {
        this.over = 'victory';
        this.overT = 0;
        this.summary = this.makeSummary(true);
      }
    }, 4000);
  }

  private makeSummary(victory: boolean): RunSummary {
    const p = this.player;
    return {
      victory,
      cause: victory ? '' : p.lastCause || '알 수 없는 원인',
      zoneName: this.level.zone.name,
      zoneIndex: this.stage === 'boss' ? 5 : this.stageIndex,
      kills: p.kills,
      frames: this.runFrames,
      gold: p.gold,
      wands: p.wands.filter((w): w is Wand => !!w).map((w) => ({ name: w.name, cards: w.slots.map((s) => (s ? card(s).name : '-')) })),
    };
  }

  // ---------- 상호작용 ----------
  nearestItem(): Item | null {
    const b = this.player.body;
    let best: Item | null = null;
    let bd = 18;
    for (const it of this.items) {
      if (it.used || (it.kind === 'chest' && it.opened)) continue;
      if (it.kind === 'altar' && it.used) continue;
      const d = Math.hypot(it.body.cx - b.cx, it.body.cy - b.cy);
      const range = it.kind === 'portal' ? 22 : 16;
      if (d < Math.min(bd, range)) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private interact(): void {
    const it = this.nearestItem();
    this.prompt = it ? it.label : '';
    if (!it || !this.input.pressed('KeyE')) return;
    const p = this.player;
    switch (it.kind) {
      case 'chest': {
        it.opened = true;
        const loot = chestLoot(it.tier, Math.random);
        sound.chest();
        this.puff(it.body.cx, it.body.cy, 0xffd84a, 20);
        const w = this.world;
        for (let k = 0; k < loot.gold; k++) {
          w.particles.spawnMat(it.body.cx, it.body.y - 2, (Math.random() - 0.5) * 2.5, -1 - Math.random() * 2.5, M.GOLD_DUST, Math.floor(Math.random() * 255), 20);
        }
        for (const cid of loot.cards) {
          const ci = new Item('card', it.body.cx + (Math.random() - 0.5) * 10, it.body.y);
          ci.cardId = cid;
          ci.body.vy = -2.5;
          ci.body.vx = (Math.random() - 0.5) * 3;
          this.items.push(ci);
        }
        if (loot.wand) {
          const wi = new Item('wand', it.body.cx, it.body.y);
          wi.wand = loot.wand;
          wi.body.vy = -2;
          this.items.push(wi);
        }
        if (loot.heart) {
          const hi = new Item('heart', it.body.cx, it.body.y);
          hi.body.vy = -2;
          this.items.push(hi);
        }
        if (it.secret) this.texts.push({ x: it.body.cx, y: it.body.y - 10, text: '비밀 보물!', color: '#ffd84a', life: 80 });
        break;
      }
      case 'wand':
        this.giveWand(it);
        break;
      case 'card':
        if (this.addCard(it.cardId!)) {
          it.used = true;
          sound.pickup();
          this.texts.push({ x: it.body.cx, y: it.body.y - 6, text: card(it.cardId!).name, color: '#a0e0ff', life: 60 });
        }
        break;
      case 'heart':
        it.used = true;
        p.maxHp += 10;
        p.hp = Math.min(p.maxHp, p.hp + 40);
        sound.heal();
        this.texts.push({ x: it.body.cx, y: it.body.y - 6, text: '최대 체력 +10', color: '#ff7090', life: 60 });
        break;
      case 'portal':
        sound.portal();
        if (this.stage === 'zone' || this.stage === 'sanctuary') this.pendingNext = true;
        break;
      case 'altar':
        it.used = true;
        p.hp = p.maxHp;
        p.burning = 0;
        sound.heal();
        this.texts.push({ x: it.body.cx, y: it.body.y - 6, text: '체력 완전 회복', color: '#ff7090', life: 60 });
        break;
      case 'shopCard':
        if (p.gold < it.price) {
          this.texts.push({ x: it.body.cx, y: it.body.y - 14, text: '금이 부족하다', color: '#ff6060', life: 50 });
          sound.fizzle();
          break;
        }
        if (this.addCard(it.cardId!)) {
          p.gold -= it.price;
          it.used = true;
          sound.buy();
        }
        break;
      case 'shopWand':
        if (p.gold < it.price) {
          this.texts.push({ x: it.body.cx, y: it.body.y - 14, text: '금이 부족하다', color: '#ff6060', life: 50 });
          sound.fizzle();
          break;
        }
        p.gold -= it.price;
        sound.buy();
        this.giveWand(it);
        break;
      case 'freeCard':
        if (this.freeTaken) break;
        if (this.addCard(it.cardId!)) {
          this.freeTaken = true;
          it.used = true;
          for (const o of this.items) if (o.kind === 'freeCard' && o !== it) {
            o.used = true;
            this.puff(o.body.cx, o.body.cy - 6, 0xa080ff, 10);
          }
          sound.pickup();
        }
        break;
    }
    this.items = this.items.filter((q) => !q.used || q.kind === 'altar');
  }

  private giveWand(it: Item): void {
    const p = this.player;
    const wd = it.wand!;
    const empty = p.wands.findIndex((w) => !w);
    if (empty >= 0) {
      p.wands[empty] = wd;
      p.cur = empty;
      it.used = true;
    } else {
      // 현재 지팡이와 교체 (기존 것은 바닥에)
      const old = p.wands[p.cur]!;
      p.wands[p.cur] = wd;
      it.wand = old;
      it.kind = 'wand';
      it.isStatic = false;
      it.price = 0;
    }
    sound.pickup();
    this.texts.push({ x: it.body.cx, y: it.body.y - 8, text: wd.name, color: '#ffe0a0', life: 60 });
  }

  addCard(id: string): boolean {
    const bag = this.player.bag;
    const k = bag.findIndex((s) => !s);
    if (k < 0) {
      this.texts.push({ x: this.player.body.cx, y: this.player.body.y - 10, text: '가방이 가득 찼다 (Tab)', color: '#ff8080', life: 60 });
      return false;
    }
    bag[k] = id;
    return true;
  }

  dropCard(id: string): void {
    const it = new Item('card', this.player.body.cx + this.player.facing * 8, this.player.body.y);
    it.cardId = id;
    it.body.vy = -1.5;
    this.items.push(it);
  }

  // ---------- 렌더 ----------
  render(): void {
    const r = this.renderer;
    const w = this.world;
    const z = this.level.zone;
    const shx = this.shake > 0.1 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0.1 ? (Math.random() - 0.5) * this.shake : 0;
    r.beginLights(z.light, z.tint[0], z.tint[1], z.tint[2]);
    r.renderWorld(w, this.level.bg, this.time);
    for (const it of this.items) it.render(r, this.time);
    for (const e of this.enemies) e.render(r, this.time);
    if (this.boss) this.boss.render(r, this.time);
    this.player.render(r, this.time);
    this.projectiles.render(r, this.time);
    this.renderParticles();
    r.accumulateEmissive(w);
    const p = this.player.body;
    r.addLight(p.cx, p.cy, 120, 0.6, 0.56, 0.5);
    for (const f of this.flashes) {
      const k = f.life / f.max;
      r.addLight(f.x, f.y, f.r, f.cr * k, f.cg * k, f.cb * k);
    }
    r.applyLighting();
    if (this.boss) this.boss.renderTelegraph(r, this);
    // 상호작용 대상 강조
    const it = this.nearestItem();
    if (it && !this.player.dead) {
      const b = it.body;
      const c = (this.time >> 3) & 1 ? 0xffffffff : 0xff80e0ff;
      r.plot(b.x - 2, b.y - 2, c);
      r.plot(b.x + b.w + 1, b.y - 2, c);
      r.plot(b.x - 2, b.y + b.h + 1, c);
      r.plot(b.x + b.w + 1, b.y + b.h + 1, c);
    }
    r.postFlash();
    if (this.debug) r.drawChunkGrid(w);
    r.present(shx, shy);
  }

  private renderParticles(): void {
    const ps = this.world.particles;
    const r = this.renderer;
    let lights = 0;
    for (let k = 0; k < ps.count; k++) {
      r.plot(ps.x[k], ps.y[k], ps.color[k]);
      if (ps.glow[k] && lights < 60 && (k & 3) === 0) {
        lights++;
        const c = ps.color[k];
        r.addLight(ps.x[k], ps.y[k], 10, (c & 255) / 400, ((c >> 8) & 255) / 400, ((c >> 16) & 255) / 400);
      }
      if (ps.mat[k] !== 0 && (ps.mat[k] === M.LAVA || ps.mat[k] === M.FIRE) && lights < 80) {
        lights++;
        r.addLight(ps.x[k], ps.y[k], 8, 0.5, 0.25, 0.05);
      }
    }
  }

  /** 월드 좌표의 플로팅 텍스트 (UI 단계에서 그림) */
  drawTexts(ctx: CanvasRenderingContext2D): void {
    const r = this.renderer;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const sx = t.x - r.camX;
      const sy = t.y - r.camY;
      ctx.globalAlpha = Math.min(1, t.life / 15);
      ctx.font = 'bold 6px sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, sx + 0.5, sy + 0.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  bagFull(): boolean {
    return this.player.bag.filter((s) => s).length >= BAG_SIZE;
  }
}

function cardFor(tier: number): string {
  const opts = ['spark', 'fireball', 'acid', 'icelance', 'lightning', 'bomb', 'dmgup', 'trigger', 'double', 'homing', 'bounce', 'waterjet'];
  const id = opts[Math.floor(Math.random() * Math.min(opts.length, 6 + tier * 2))];
  return id;
}
