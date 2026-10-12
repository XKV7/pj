// 진입점: 앱 상태 머신 + 고정 시간 간격 루프.
import { Renderer, VIEW_W, VIEW_H } from './render/renderer';
import { Input } from './input';
import { sound } from './audio/audio';
import { Game } from './game/game';
import { generateDemo, generateZone, generateSanctuary, generateBossArena, type Level } from './game/worldgen';
import { Inventory } from './ui/inventory';
import { Sandbox } from './ui/sandbox';
import { drawHud } from './ui/hud';
import { drawTouchControls, drawRotateHint } from './ui/touch';
import { text } from './ui/draw';
import { drawSettings, drawTitle, drawControls, drawRecords, drawPause, drawDead, drawEnding } from './ui/screens';
import { loadRecords, saveRecords, type Records } from './save';
import { loadSettings } from './settings';

type State = 'title' | 'controls' | 'settings' | 'records' | 'game' | 'paused' | 'inventory' | 'dead' | 'ending' | 'sandbox';

class App {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  input: Input;
  state: State = 'title';
  prevState: State = 'title';
  game: Game | null = null;
  sandbox: Sandbox | null = null;
  demo: Level;
  demoT = 0;
  inventory = new Inventory();
  records: Records;
  fps = 60;
  private last = performance.now();
  private acc = 0;
  private frames = 0;
  private fpsT = 0;
  overT = 0;
  newBest = false;
  recorded = false;
  errors: string[] = [];

  constructor() {
    this.canvas = document.getElementById('screen') as HTMLCanvasElement;
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.input.onFirstGesture = () => sound.init();
    this.records = loadRecords();
    loadSettings();
    this.demo = generateDemo(Math.floor(Math.random() * 1e6));
    this.demo.world.setFullActiveRegion();
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('mousedown', () => sound.init());
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(t: number): void {
    const dt = Math.min(100, t - this.last);
    this.last = t;
    this.acc += dt;
    this.fpsT += dt;
    this.frames++;
    if (this.fpsT >= 500) {
      this.fps = (this.frames * 1000) / this.fpsT;
      this.fpsT = 0;
      this.frames = 0;
    }
    this.input.gameplayTouch = this.state === 'game';
    const step = 1000 / 60;
    let n = 0;
    while (this.acc >= step && n < 3) {
      this.acc -= step;
      this.tick();
      n++;
    }
    if (n === 3) this.acc = 0;
    try {
      this.draw(n > 0);
    } catch (e) {
      this.reportError(e);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  private reportError(e: unknown): void {
    const msg = e instanceof Error ? e.stack ?? e.message : String(e);
    if (this.errors.length < 5) {
      this.errors.push(msg);
      console.error(e);
    }
  }

  newGame(): void {
    this.game = new Game(this.renderer, this.input, Math.floor(Math.random() * 1e9));
    this.state = 'game';
    this.recorded = false;
    this.newBest = false;
    sound.init();
  }

  private tick(): void {
    const input = this.input;
    try {
      if (input.pressed('KeyM')) sound.toggleMute();
      switch (this.state) {
        case 'title':
        case 'controls':
        case 'settings':
        case 'records':
          this.demoT++;
          this.demo.world.step();
          if (this.demoT % 2400 === 0) this.resetDemo();
          sound.setAmbience(this.demoT % 10 === 0 ? this.demo.world.countMat(17) : 0, 30);
          sound.setZone(-1);
          break;
        case 'game': {
          const g = this.game!;
          if (input.pressed('Escape') && !g.over) {
            this.state = 'paused';
            break;
          }
          if (input.pressed('Tab') && !g.over) {
            this.state = 'inventory';
            break;
          }
          g.uiCapturesMouse = false;
          g.update();
          if (g.over === 'dead' && g.overT > 90) {
            this.state = 'dead';
            this.overT = 0;
            this.record(false);
          }
          if (g.over === 'victory') {
            this.state = 'ending';
            this.overT = 0;
            this.record(true);
          }
          break;
        }
        case 'paused':
          if (input.pressed('Escape')) this.state = 'game';
          break;
        case 'inventory':
          if (input.pressed('Tab') || input.pressed('Escape')) {
            this.inventory.close(this.game!);
            this.state = 'game';
          }
          break;
        case 'dead':
        case 'ending':
          this.overT++;
          this.game!.update();
          break;
        case 'sandbox':
          if (this.sandbox!.update(input, this.sandbox!.isOverUi(input))) this.exitSandbox();
          break;
      }
    } catch (e) {
      this.reportError(e);
    }
    // UI 클릭은 draw 단계에서 소비하므로 여기서는 입력을 지우지 않음
  }

  /** 자동화 테스트용: 특정 단계로 이동 (0~4 구역, 5 보스, 10+n 성소 n) */
  debugStage(n: number): void {
    if (!this.game) this.newGame();
    const g = this.game!;
    if (n === 5) g.loadLevel(generateBossArena(g.seed), 'boss', 5);
    else if (n >= 10) g.loadLevel(generateSanctuary(n - 10, g.seed, n - 9), 'sanctuary', n - 10);
    else g.loadLevel(generateZone(n, g.seed), 'zone', n);
    this.state = 'game';
  }

  private resetDemo(): void {
    this.demo = generateDemo(Math.floor(Math.random() * 1e6));
    this.demo.world.setFullActiveRegion();
  }

  private exitSandbox(): void {
    this.sandbox = null;
    this.state = 'title';
  }

  private record(victory: boolean): void {
    if (this.recorded || !this.game?.summary) return;
    this.recorded = true;
    const s = this.game.summary;
    const r = this.records;
    r.runs++;
    r.totalKills += s.kills;
    r.bestZone = Math.max(r.bestZone, s.zoneIndex);
    r.mostGold = Math.max(r.mostGold, s.gold);
    if (victory) {
      r.clears++;
      if (!r.bestClearFrames || s.frames < r.bestClearFrames) {
        r.bestClearFrames = s.frames;
        this.newBest = true;
      }
    }
    const d = new Date();
    r.history.unshift({ date: `${d.getMonth() + 1}/${d.getDate()}`, victory, zone: s.zoneName, frames: s.frames, kills: s.kills });
    r.history = r.history.slice(0, 10);
    saveRecords(r);
  }

  private drawDemo(): void {
    const r = this.renderer;
    const w = this.demo.world;
    r.camX = 0;
    r.camY = 0;
    r.beginLights(0.62, 1, 0.95, 1.05);
    r.renderWorld(w, this.demo.bg, this.demoT);
    for (let k = 0; k < w.particles.count; k++) r.plot(w.particles.x[k], w.particles.y[k], w.particles.color[k]);
    r.accumulateEmissive(w);
    r.applyLighting();
    r.present();
  }

  private draw(ticked: boolean): void {
    const input = this.input;
    const r = this.renderer;
    switch (this.state) {
      case 'title': {
        this.drawDemo();
        const ctx = r.uiBegin();
        const a = drawTitle(ctx, input, this.demoT);
        if (a) sound.click();
        if (a === 'start') this.newGame();
        else if (a === 'controls' || a === 'settings') {
          this.prevState = 'title';
          this.state = a;
        }
        else if (a === 'records') {
          this.records = loadRecords();
          this.state = 'records';
        } else if (a === 'sandbox') {
          this.sandbox = new Sandbox();
          this.state = 'sandbox';
        }
        break;
      }
      case 'controls': {
        if (this.game && this.prevState === 'paused') this.game.render();
        else this.drawDemo();
        const ctx = r.uiBegin();
        if (drawControls(ctx, input)) this.state = this.game && this.prevState === 'paused' ? 'paused' : 'title';
        break;
      }
      case 'settings': {
        if (this.game && this.prevState === 'paused') this.game.render();
        else this.drawDemo();
        const ctx = r.uiBegin();
        if (drawSettings(ctx, input, sound.muted, () => sound.toggleMute())) this.state = this.game && this.prevState === 'paused' ? 'paused' : 'title';
        break;
      }
      case 'records': {
        this.drawDemo();
        const ctx = r.uiBegin();
        if (drawRecords(ctx, input, this.records)) this.state = 'title';
        break;
      }
      case 'game':
      case 'paused':
      case 'inventory':
      case 'dead':
      case 'ending': {
        const g = this.game!;
        g.render();
        const ctx = r.uiBegin();
        if (this.state !== 'dead' && this.state !== 'ending') drawHud(ctx, g, this.fps);
        if (this.state === 'game' && input.touchMode) drawTouchControls(ctx, input, g);
        if (this.state === 'paused') {
          const a = drawPause(ctx, input, sound.muted);
          if (a === 'resume') this.state = 'game';
          else if (a === 'controls' || a === 'settings') {
            this.prevState = 'paused';
            this.state = a;
          } else if (a === 'mute') sound.toggleMute();
          else if (a === 'title') {
            if (g.summary === null) {
              g.player.lastCause = '스스로 포기함';
            }
            sound.stopBossMusic();
            this.game = null;
            this.state = 'title';
          }
        } else if (this.state === 'inventory') {
          g.uiCapturesMouse = true;
          if (this.inventory.draw(ctx, g, input)) {
            this.inventory.close(g);
            this.state = 'game';
          }
        } else if (this.state === 'dead') {
          const a = drawDead(ctx, input, g.summary!, this.overT);
          if (a === 'retry') this.newGame();
          else if (a === 'title') {
            this.game = null;
            this.state = 'title';
          }
        } else if (this.state === 'ending') {
          const a = drawEnding(ctx, input, g.summary!, this.overT, this.newBest);
          if (a === 'title') {
            this.game = null;
            this.state = 'title';
          }
        }
        break;
      }
      case 'sandbox': {
        const sb = this.sandbox!;
        sb.render(r);
        const ctx = r.uiBegin();
        if (sb.drawUi(ctx, input, this.fps) === 'exit') this.exitSandbox();
        break;
      }
    }
    if (input.touchMode && window.innerHeight > window.innerWidth) drawRotateHint(r.uiBegin());
    if (this.errors.length) {
      const ctx = r.uiBegin();
      text(ctx, '오류: ' + this.errors[0].split('\n')[0], 4, VIEW_H - 4, { size: 5, color: '#ff6060' });
    }
    void VIEW_W;
    input.endFrame(ticked);
  }
}

const app = new App();

// 설치형 웹앱(PWA): 오프라인 지원 서비스 워커 등록. 지원하지 않거나 막힌 환경(예: 아티팩트 프레임)에서는 조용히 건너뛴다.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
(window as unknown as { __app: App }).__app = app;
