// 최종 보스 「연금 심장」: 페이즈마다 환경을 다른 재질로 바꾸며, 모든 공격에 예고 연출이 있다.
import { M } from '../sim/materials';
import { Creature, ENEMY_CAUSES, sampleEnv } from './entity';
import type { Renderer } from '../render/renderer';
import type { Game, Target } from './game';

type AttackKind = 'shards' | 'nova' | 'summon' | 'lavarain' | 'acidflood' | 'flood';

interface Telegraph {
  kind: AttackKind;
  t: number;
  max: number;
  angles: number[];
  xs: number[];
}

export const BOSS_NAME = '연금 심장';
export const PHASE_TITLES = ['1페이즈: 범람', '2페이즈: 용암의 비', '3페이즈: 산의 붕괴'];

export class Boss extends Creature implements Target {
  phase = 1;
  state: 'dormant' | 'intro' | 'fight' | 'transition' | 'dying' | 'dead' = 'dormant';
  stateT = 0;
  cooldown = 120;
  tele: Telegraph | null = null;
  homeX: number;
  homeY: number;
  t = 0;
  radius = 18;
  waterPoured = 0;
  envT = 0;
  attackIdx = 0;
  fallen = false;

  constructor(x: number, y: number) {
    super(x - 18, y - 18, 36, 36, 1800);
    this.homeX = x;
    this.homeY = y;
    this.canBurn = false;
    this.resist = { fire: 0.6, poison: 0, physical: 0.5 };
  }

  get cx(): number {
    return this.body.x + 18;
  }
  get cy(): number {
    return this.body.y + 18;
  }

  hitTest(x: number, y: number, r: number): boolean {
    const dx = x - this.cx;
    const dy = y - this.cy;
    return dx * dx + dy * dy <= (this.radius + r) * (this.radius + r);
  }

  invulnerable(): boolean {
    return this.state !== 'fight';
  }

  setPhaseResist(): void {
    if (this.phase === 1) this.resist = { fire: 0.6, poison: 0, physical: 0.5, elec: 1.2 };
    else if (this.phase === 2) this.resist = { fire: 0, poison: 0, physical: 0.5, ice: 2.2, elec: 1 };
    else this.resist = { fire: 0.8, poison: 0, physical: 0.6, acid: 2, ice: 1.2, elec: 1 };
  }

  update(g: Game): void {
    this.t++;
    this.stateT++;
    if (this.flash > 0) this.flash--;
    const w = g.world;
    const p = g.player;
    if (this.state === 'dormant') {
      if (Math.abs(p.body.cx - this.cx) < 210 || this.stateT > 240) {
        this.state = 'intro';
        this.stateT = 0;
        g.showBanner(BOSS_NAME, '심연을 지배하는 결정의 심장이 깨어난다', 200);
        g.sound.roar();
        g.sound.startBossMusic();
        g.sound.setBossIntensity(1);
        g.addShake(6);
      }
      return;
    }
    if (this.state === 'intro') {
      if (this.stateT > 150) {
        this.state = 'fight';
        this.stateT = 0;
        this.setPhaseResist();
        g.showBanner(PHASE_TITLES[0], '방이 물로 차오른다 — 물을 얼려 발판을 만들고, 젖은 심장에 번개를!', 200);
      }
      this.hover(0.6);
      return;
    }
    if (this.state === 'dying') {
      this.hover(0.2);
      if (this.stateT % 9 === 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 26;
        g.explode(Math.floor(this.cx + Math.cos(a) * r), Math.floor(this.cy + Math.sin(a) * r), 6 + Math.floor(Math.random() * 5), 3, '연금 심장의 붕괴에 휘말림', 'boss', 0);
      }
      if (this.stateT === 170) {
        g.renderer.flash = 1;
        g.renderer.flashColor = [1, 0.9, 1];
        g.addShake(12);
        g.sound.explosion(14);
        for (let k = 0; k < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = Math.random() * 5;
          w.particles.spawnMat(this.cx, this.cy, Math.cos(a) * sp, Math.sin(a) * sp - 1, k % 3 === 0 ? M.GOLD_DUST : M.CRYSTAL, Math.floor(Math.random() * 255), 20);
        }
        this.state = 'dead';
        this.stateT = 0;
        this.dead = true;
        g.sound.stopBossMusic();
        g.onBossDefeated();
      }
      return;
    }
    if (this.state === 'dead') return;

    // 환경 피해 (전기/산 등) — 몸에 닿은 셀
    const env = sampleEnv(w, this.body);
    if (env.water > 6) this.wet = 120;
    else if (this.wet > 0) this.wet--;
    if (this.state === 'fight') {
      if (env.charged > 0) {
        this.applyDamage(70 / 60 * Math.min(3, 1 + env.charged / 40), 'elec', '');
        this.shocked = 6;
        if (this.t % 6 === 0) g.sound.shock();
      }
      if (env.acid > 0) this.applyDamage(25 / 60, 'acid', '');
      if (env.frost > 0) this.applyDamage(12 / 60, 'ice', '');
    }
    if (this.shocked > 0) this.shocked--;
    void ENEMY_CAUSES;

    if (this.state === 'transition') {
      this.hover(0.3);
      if (this.stateT === 1) {
        g.renderer.flash = 0.9;
        g.renderer.flashColor = this.phase === 2 ? [1, 0.5, 0.2] : [0.5, 1, 0.3];
        g.addShake(10);
        g.sound.phase();
        g.hitstop = 10;
        g.showBanner(PHASE_TITLES[this.phase - 1], this.phase === 2 ? '천장에서 용암이 쏟아진다 — 냉기에 약해진 심장을 노려라!' : '모든 것이 산에 녹아내린다 — 무너지는 바닥을 조심하라!', 220);
        g.sound.setBossIntensity(this.phase);
      }
      if (this.stateT > 150) {
        this.state = 'fight';
        this.stateT = 0;
        this.setPhaseResist();
        this.cooldown = 60;
      }
      return;
    }

    // 페이즈 전환 체크
    if (this.phase === 1 && this.hp < this.maxHp * 0.66) return this.toPhase(2);
    if (this.phase === 2 && this.hp < this.maxHp * 0.33) return this.toPhase(3);
    if (this.hp <= 0 || this.dead) {
      this.dead = false;
      this.state = 'dying';
      this.stateT = 0;
      this.tele = null;
      g.showBanner('연금 심장이 무너진다', '', 160);
      return;
    }

    this.hover(this.phase === 3 ? 1.6 : 1);
    this.environment(g);

    // 공격
    if (this.tele) {
      this.tele.t++;
      if (this.tele.t >= this.tele.max) {
        this.execute(g, this.tele);
        this.tele = null;
        this.cooldown = this.phase === 3 ? 55 : this.phase === 2 ? 70 : 90;
      }
    } else if (--this.cooldown <= 0) {
      this.startAttack(g);
    }
  }

  private toPhase(n: number): void {
    this.phase = n;
    this.state = 'transition';
    this.stateT = 0;
    this.tele = null;
    this.envT = 0;
  }

  private hover(speed: number): void {
    const a = this.t * 0.012 * speed;
    const tx = this.homeX + Math.sin(a) * 120;
    const ty = this.homeY + Math.sin(a * 2) * 26 + (this.phase === 1 ? 0 : -8);
    this.body.x += (tx - 18 - this.body.x) * 0.03;
    this.body.y += (ty - 18 - this.body.y) * 0.03;
  }

  /** 페이즈별 환경 변화 */
  private environment(g: Game): void {
    const w = g.world;
    this.envT++;
    if (this.phase === 1) {
      // 양쪽 천장 배수구에서 물이 쏟아짐 (일정량까지)
      if (this.waterPoured < 16000) {
        for (const sx of [70, w.W - 70]) {
          for (let k = 0; k < 4; k++) {
            const x = sx + Math.floor(Math.random() * 6) - 3;
            if (w.get(x, 30) === M.EMPTY) {
              w.set(x, 30, M.WATER);
              this.waterPoured++;
            }
          }
        }
      }
    } else if (this.phase === 2) {
      if (this.envT % 150 === 0 && !this.tele) {
        const xs: number[] = [];
        for (let k = 0; k < 5; k++) xs.push(40 + Math.floor(Math.random() * (w.W - 80)));
        xs.push(Math.floor(g.player.body.cx));
        this.tele = { kind: 'lavarain', t: 0, max: 60, angles: [], xs };
        g.sound.warn();
      }
    } else {
      if (this.envT % 170 === 0 && !this.tele) {
        const xs: number[] = [];
        for (let k = 0; k < 3; k++) xs.push(50 + Math.floor(Math.random() * (w.W - 100)));
        this.tele = { kind: 'acidflood', t: 0, max: 70, angles: [], xs };
        g.sound.warn();
      }
      if (this.envT % 45 === 0) w.requestSupportCheck(20, 20, w.W - 20, w.H - 4);
    }
  }

  private startAttack(g: Game): void {
    const p = g.player.body;
    const base = Math.atan2(p.cy - this.cy, p.cx - this.cx);
    const order: AttackKind[] = this.phase === 1 ? ['shards', 'nova', 'shards'] : this.phase === 2 ? ['shards', 'summon', 'nova', 'shards'] : ['shards', 'nova', 'summon', 'shards', 'nova'];
    const kind = order[this.attackIdx++ % order.length];
    if (kind === 'shards') {
      const n = 3 + this.phase * 2;
      const angles: number[] = [];
      for (let k = 0; k < n; k++) angles.push(base + (k - (n - 1) / 2) * 0.16);
      this.tele = { kind, t: 0, max: 50, angles, xs: [] };
    } else if (kind === 'nova') {
      this.tele = { kind, t: 0, max: 70, angles: [], xs: [] };
    } else {
      const xs = [Math.floor(this.cx - 80 + Math.random() * 40), Math.floor(this.cx + 40 + Math.random() * 40)];
      this.tele = { kind, t: 0, max: 50, angles: [], xs };
    }
    g.sound.warn();
  }

  private execute(g: Game, t: Telegraph): void {
    const w = g.world;
    switch (t.kind) {
      case 'shards':
        for (const a of t.angles) g.enemyShoot('e_shard', this.cx + Math.cos(a) * 18, this.cy + Math.sin(a) * 18, a, '연금 심장의 결정 파편에 꿰뚫림');
        g.sound.cast('ice');
        break;
      case 'nova':
        g.areaDamage(this.cx, this.cy, 72, 24, 'magic', '연금 심장의 파동에 휩쓸림', 'enemy');
        g.addShake(7);
        g.sound.explosion(8);
        g.flashLight(this.cx, this.cy, 120, 0.8, 0.4, 1);
        for (let k = 0; k < 80; k++) {
          const a = (k / 80) * Math.PI * 2;
          w.particles.spawnFx(this.cx + Math.cos(a) * 20, this.cy + Math.sin(a) * 20, Math.cos(a) * 4, Math.sin(a) * 4, 0xffff80d0, 18, 0, 1);
        }
        if (this.phase >= 2) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.enemyShoot(this.phase === 2 ? 'e_fire' : 'e_acid', this.cx, this.cy, a, '연금 심장의 파동에 휩쓸림'); }
        break;
      case 'summon': {
        const kinds = this.phase === 2 ? (['bat', 'slime'] as const) : (['bomber', 'slime'] as const);
        t.xs.forEach((x, k) => {
          let y = Math.floor(this.cy);
          while (y < w.H - 5 && !w.isBlocked(x, y + 1)) y++;
          g.spawnEnemy(kinds[k % kinds.length], x, y - 12);
          g.puff(x, y - 8, 0xd0a0ff, 16);
        });
        g.sound.cast('summon');
        break;
      }
      case 'lavarain':
        for (const x of t.xs) {
          for (let k = 0; k < 3; k++) g.enemyShoot('e_lava', x + (k - 1) * 3, 34 + k * 2, Math.PI / 2, '연금 심장이 내린 용암 비에 녹아내림');
        }
        g.sound.cast('fire');
        break;
      case 'acidflood':
        for (const x of t.xs) w.fillCircle(x, 34, 6, M.ACID, 'fluid', 0.85);
        g.sound.cast('acid');
        break;
      case 'flood':
        break;
    }
  }

  /** 예고 연출 (조명 이후 오버레이) */
  renderTelegraph(r: Renderer, g: Game): void {
    const t = this.tele;
    if (!t) return;
    const blink = (t.t >> 2) & 1;
    const prog = t.t / t.max;
    switch (t.kind) {
      case 'shards':
        for (const a of t.angles) r.line(this.cx, this.cy, this.cx + Math.cos(a) * 260, this.cy + Math.sin(a) * 260, blink ? 0xffffa0ff : 0xffff60c0, 0.3 + prog * 0.5);
        break;
      case 'nova':
        r.circle(this.cx, this.cy, 72, blink ? 0xffffa0ff : 0xffa040ff, 0.5 + prog * 0.5);
        r.circle(this.cx, this.cy, Math.max(1, 72 * prog), 0xffffe0ff, 0.6);
        break;
      case 'summon':
        for (const x of t.xs) {
          let y = Math.floor(this.cy);
          while (y < g.world.H - 5 && !g.world.isBlocked(x, y + 1)) y++;
          r.circle(x, y - 6, 7, blink ? 0xffffa0d0 : 0xffd060a0, 0.8);
          r.circle(x, y - 6, Math.max(1, Math.round(7 * prog)), 0xffffe0ff, 0.6);
        }
        break;
      case 'lavarain':
        for (const x of t.xs) {
          for (let y = 30; y < g.world.H - 10; y += 6) r.plotBlend(x, y, 0xff2060ff, blink ? 0.8 : 0.4);
          r.rectFill(x - 3, 28, 7, 3, blink ? 0xff3080ff : 0xff2050d0);
        }
        break;
      case 'acidflood':
        for (const x of t.xs) {
          for (let y = 30; y < g.world.H - 10; y += 5) r.plotBlend(x + Math.sin(y * 0.2) * 3, y, 0xff40ff80, blink ? 0.8 : 0.4);
          r.rectFill(x - 6, 28, 13, 3, blink ? 0xff60ffa0 : 0xff30c060);
        }
        break;
      default:
        break;
    }
  }

  render(r: Renderer, time: number): void {
    if (this.state === 'dead') return;
    const cx = this.cx;
    const cy = this.cy + Math.sin(time * 0.05) * 1.5;
    const pulse = 0.5 + 0.5 * Math.sin(time * (this.phase === 3 ? 0.25 : 0.12));
    const pc = this.phase === 1 ? [90, 140, 255] : this.phase === 2 ? [255, 120, 50] : [120, 255, 90];
    const s = 17 + pulse * 1.5;
    for (let y = -20; y <= 20; y++) {
      for (let x = -20; x <= 20; x++) {
        const nx = x / s;
        const ny = -(y / s) + 0.25;
        const a = nx * nx + ny * ny - 1;
        const v = a * a * a - nx * nx * ny * ny * ny;
        if (v > 0) continue;
        // 결정 면 음영
        const facet = ((Math.floor((x + 20) / 5) + Math.floor((y + 20) / 4)) & 1) ? 0.8 : 1;
        const d = Math.sqrt(nx * nx + ny * ny);
        const core = Math.max(0, 1 - d * 1.4) * pulse;
        let R = (60 + pc[0] * 0.5 * facet + core * 180) | 0;
        let G = (30 + pc[1] * 0.35 * facet + core * 160) | 0;
        let B = (80 + pc[2] * 0.5 * facet + core * 160) | 0;
        if (v > -0.02) {
          R = 240;
          G = 220;
          B = 255;
        }
        if (this.flash > 0) {
          R = 255;
          G = 255;
          B = 255;
        } else if (this.shocked > 0 && (time & 2)) {
          R = 220;
          G = 240;
          B = 255;
        }
        R = Math.min(255, R);
        G = Math.min(255, G);
        B = Math.min(255, B);
        r.plot(cx + x, cy + y, (0xff000000 | (B << 16) | (G << 8) | R) >>> 0);
      }
    }
    // 궤도 결정
    for (let k = 0; k < 6; k++) {
      const a = time * 0.03 + (k / 6) * Math.PI * 2;
      const ox = cx + Math.cos(a) * 28;
      const oy = cy + Math.sin(a) * 12;
      r.rectFill(ox - 1, oy - 2, 2, 4, 0xffffa0d0);
    }
    r.addLight(cx, cy, 110 + pulse * 30, pc[0] / 255 * 1.2, pc[1] / 255 * 1.2, pc[2] / 255 * 1.2);
    if (this.wet > 0 && (time % 7) === 0) r.plot(cx + (Math.random() - 0.5) * 30, cy + 15, 0xffe08040);
  }
}
