// WebAudio 절차적 사운드 합성: 효과음, 지속 환경음(불/물), 구역 드론, 보스 시퀀서.

type Osc = OscillatorType;

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;
  private last = new Map<string, number>();
  // 지속음
  private fireGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private droneOsc: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private bossOn = false;
  private bossStep = 0;
  private bossNext = 0;
  private bossTimer: number | null = null;
  private bossIntensity = 1;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
    this.setupLoops();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  private setupLoops(): void {
    const ctx = this.ctx!;
    // 불 타는 소리: 고역 노이즈 + 크랙클
    const fsrc = ctx.createBufferSource();
    fsrc.buffer = this.noiseBuf;
    fsrc.loop = true;
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 900;
    fbp.Q.value = 0.6;
    const flo = ctx.createBiquadFilter();
    flo.type = 'lowshelf';
    flo.frequency.value = 200;
    flo.gain.value = 8;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    fsrc.connect(fbp).connect(flo).connect(this.fireGain).connect(this.sfxBus);
    fsrc.start();
    // 물 흐르는 소리
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.noiseBuf;
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.7;
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'bandpass';
    this.waterFilter.frequency.value = 500;
    this.waterFilter.Q.value = 3;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    wsrc.connect(this.waterFilter).connect(this.waterGain).connect(this.sfxBus);
    wsrc.start();
    // 구역 드론
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 400;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain).connect(this.musicBus);
    const types: Osc[] = ['sawtooth', 'sine', 'triangle'];
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = types[k];
      o.frequency.value = 55;
      o.connect(this.droneFilter);
      o.start();
      this.droneOsc.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(this.droneFilter.frequency);
    lfo.start();
  }

  /** 지속 환경음 강도 갱신 (매 프레임) */
  setAmbience(fireCells: number, movingLiquid: number): void {
    if (!this.ctx || !this.fireGain || !this.waterGain || !this.waterFilter) return;
    const t = this.ctx.currentTime;
    const fg = Math.min(0.5, Math.sqrt(fireCells) * 0.018);
    this.fireGain.gain.setTargetAtTime(fg * (0.7 + Math.random() * 0.6), t, 0.05);
    const wg = Math.min(0.28, Math.sqrt(movingLiquid) * 0.012);
    this.waterGain.gain.setTargetAtTime(wg, t, 0.15);
    this.waterFilter.frequency.setTargetAtTime(400 + Math.random() * 500, t, 0.08);
  }

  /** 구역별 드론 톤. zone -1 = 끔 */
  setZone(zone: number): void {
    if (!this.ctx || !this.droneGain) return;
    const t = this.ctx.currentTime;
    const roots = [55, 61.7, 49, 46.2, 41.2, 36.7, 65.4];
    if (zone < 0) {
      this.droneGain.gain.setTargetAtTime(0, t, 0.5);
      return;
    }
    const r = roots[zone % roots.length];
    const ratios = [[1, 1.5, 2.003], [1, 1.2, 2.01], [1, 1.414, 1.995], [1, 1.335, 2], [1, 1.059, 1.5], [1, 1.19, 1.5], [1, 1.25, 1.5]][zone % 7];
    this.droneOsc.forEach((o, k) => o.frequency.setTargetAtTime(r * ratios[k], t, 1.2));
    this.droneGain.gain.setTargetAtTime(zone === 6 ? 0.08 : 0.13, t, 1.0);
  }

  // ---------- 보스 시퀀서 ----------
  startBossMusic(): void {
    if (!this.ctx || this.bossOn) return;
    this.bossOn = true;
    this.bossStep = 0;
    this.bossNext = this.ctx.currentTime + 0.1;
    this.bossTimer = window.setInterval(() => this.scheduleBoss(), 25);
  }

  setBossIntensity(phase: number): void {
    this.bossIntensity = phase;
  }

  stopBossMusic(): void {
    this.bossOn = false;
    if (this.bossTimer !== null) window.clearInterval(this.bossTimer);
    this.bossTimer = null;
  }

  private scheduleBoss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bossOn) return;
    const bpm = 120 + this.bossIntensity * 14;
    const stepDur = 60 / bpm / 4;
    const bass = [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 12, 0, 7, 5, 3, 2];
    const roots = [36.7, 36.7, 41.2, 32.7];
    while (this.bossNext < ctx.currentTime + 0.12) {
      const s = this.bossStep % 16;
      const bar = Math.floor(this.bossStep / 16) % 4;
      const t = this.bossNext;
      if (s % 4 === 0) this.kick(t);
      if (s % 8 === 4) this.snare(t);
      if (this.bossIntensity >= 2 || s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);
      const n = bass[s];
      const f = roots[bar] * Math.pow(2, n / 12) * 2;
      this.tone(t, f, stepDur * 0.9, 'sawtooth', 0.09, this.musicBus, 600 + this.bossIntensity * 300);
      if (this.bossIntensity >= 3 && s % 4 === 3) this.tone(t, f * 4, stepDur * 0.5, 'square', 0.03, this.musicBus, 2400);
      this.bossNext += stepDur;
      this.bossStep++;
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private snare(t: number): void {
    this.noise(t, 0.14, 0.22, 'highpass', 1500, this.musicBus);
    this.tone(t, 190, 0.08, 'triangle', 0.15, this.musicBus);
  }

  private hat(t: number, v: number): void {
    this.noise(t, 0.04, v, 'highpass', 7000, this.musicBus);
  }

  // ---------- 원시 합성 ----------
  private tone(t: number, f: number, dur: number, type: Osc, vol: number, out?: AudioNode, lp = 0, fEnd = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fEnd > 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lp > 0) {
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = lp;
      node.connect(f2);
      node = f2;
    }
    node.connect(g).connect(out ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, vol: number, ftype: BiquadFilterType, freq: number, out?: AudioNode, fEnd = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(freq, t);
    if (fEnd > 0) f.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private ok(name: string, minGap = 0.04): boolean {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    const l = this.last.get(name) ?? -1;
    if (now - l < minGap) return false;
    this.last.set(name, now);
    return true;
  }

  // ---------- 효과음 ----------
  cast(kind: string): void {
    if (!this.ok('cast' + kind, 0.05)) return;
    const t = this.ctx!.currentTime;
    switch (kind) {
      case 'fire':
        this.noise(t, 0.25, 0.25, 'bandpass', 600, undefined, 2000);
        this.tone(t, 180, 0.2, 'sawtooth', 0.06, undefined, 900, 90);
        break;
      case 'ice':
        this.tone(t, 1800, 0.18, 'sine', 0.08, undefined, 0, 900);
        this.tone(t, 2600, 0.12, 'triangle', 0.04);
        break;
      case 'elec':
        this.noise(t, 0.15, 0.3, 'highpass', 3000);
        this.tone(t, 90, 0.15, 'square', 0.06, undefined, 3000, 60);
        break;
      case 'bomb':
        this.tone(t, 300, 0.12, 'square', 0.06, undefined, 1200, 150);
        break;
      case 'water':
        this.noise(t, 0.12, 0.12, 'bandpass', 900, undefined, 400);
        break;
      case 'dig':
        this.noise(t, 0.08, 0.15, 'lowpass', 600);
        break;
      case 'acid':
        this.tone(t, 500, 0.15, 'sine', 0.06, undefined, 0, 200);
        this.noise(t, 0.1, 0.06, 'bandpass', 2500);
        break;
      case 'summon':
        this.tone(t, 260, 0.2, 'triangle', 0.08, undefined, 0, 520);
        break;
      default:
        this.tone(t, 880, 0.1, 'square', 0.05, undefined, 2500, 440);
        this.tone(t, 1320, 0.08, 'sine', 0.04);
    }
  }

  explosion(size: number): void {
    if (!this.ok('exp', 0.03)) return;
    const t = this.ctx!.currentTime;
    const v = Math.min(0.9, 0.25 + size * 0.04);
    this.noise(t, 0.4 + size * 0.04, v, 'lowpass', 1800, undefined, 120);
    this.tone(t, 90, 0.35 + size * 0.02, 'sine', v * 0.8, undefined, 0, 30);
  }

  hit(): void {
    if (!this.ok('hit', 0.03)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 320, 0.07, 'square', 0.06, undefined, 1500, 160);
    this.noise(t, 0.05, 0.1, 'bandpass', 1500);
  }

  hurt(): void {
    if (!this.ok('hurt', 0.12)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 260, 0.25, 'sawtooth', 0.12, undefined, 1200, 90);
  }

  shock(): void {
    if (!this.ok('shock', 0.09)) return;
    const t = this.ctx!.currentTime;
    for (let k = 0; k < 3; k++) this.noise(t + k * 0.04, 0.05, 0.2, 'highpass', 2500 + k * 800);
    this.tone(t, 60, 0.2, 'square', 0.08, undefined, 4000);
  }

  enemyDie(): void {
    if (!this.ok('edie', 0.05)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 420, 0.3, 'triangle', 0.1, undefined, 0, 70);
    this.noise(t, 0.2, 0.1, 'bandpass', 800, undefined, 200);
  }

  gold(): void {
    if (!this.ok('gold', 0.06)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 1568, 0.08, 'square', 0.035, undefined, 4000);
    this.tone(t + 0.05, 2093, 0.12, 'square', 0.035, undefined, 4000);
  }

  pickup(): void {
    if (!this.ok('pick', 0.1)) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1046].forEach((f, k) => this.tone(t + k * 0.06, f, 0.12, 'triangle', 0.08));
  }

  jump(): void {
    if (!this.ok('jump', 0.1)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 220, 0.1, 'sine', 0.05, undefined, 0, 440);
  }

  fizzle(): void {
    if (!this.ok('fizzle', 0.25)) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.15, 0.06, 'bandpass', 1200, undefined, 300);
  }

  click(): void {
    if (!this.ok('click', 0.04)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 660, 0.05, 'square', 0.04, undefined, 2000);
  }

  splash(): void {
    if (!this.ok('splash', 0.25)) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.3, 0.18, 'bandpass', 700, undefined, 250);
  }

  portal(): void {
    if (!this.ok('portal', 0.5)) return;
    const t = this.ctx!.currentTime;
    for (let k = 0; k < 6; k++) this.tone(t + k * 0.07, 300 + k * 120, 0.4, 'sine', 0.06);
  }

  chest(): void {
    if (!this.ok('chest', 0.3)) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.15, 0.12, 'lowpass', 500);
    [392, 523, 659, 784, 1046].forEach((f, k) => this.tone(t + 0.1 + k * 0.05, f, 0.2, 'triangle', 0.07));
  }

  heal(): void {
    if (!this.ok('heal', 0.4)) return;
    const t = this.ctx!.currentTime;
    [523, 784, 1046, 1568].forEach((f, k) => this.tone(t + k * 0.09, f, 0.35, 'sine', 0.07));
  }

  buy(): void {
    if (!this.ok('buy', 0.2)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 988, 0.08, 'square', 0.05, undefined, 3000);
    this.tone(t + 0.08, 1319, 0.2, 'square', 0.05, undefined, 3000);
  }

  phase(): void {
    if (!this.ok('phase', 1)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 55, 1.6, 'sawtooth', 0.25, undefined, 800, 220);
    this.noise(t, 1.2, 0.3, 'bandpass', 200, undefined, 3000);
  }

  roar(): void {
    if (!this.ok('roar', 0.5)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 70, 0.8, 'sawtooth', 0.18, undefined, 500, 40);
    this.tone(t, 105, 0.8, 'square', 0.06, undefined, 400, 52);
  }

  warn(): void {
    if (!this.ok('warn', 0.2)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, 880, 0.12, 'square', 0.05, undefined, 2000);
    this.tone(t + 0.14, 880, 0.12, 'square', 0.05, undefined, 2000);
  }

  death(): void {
    if (!this.ok('death', 1)) return;
    const t = this.ctx!.currentTime;
    [392, 370, 330, 262].forEach((f, k) => this.tone(t + k * 0.22, f, 0.4, 'triangle', 0.12));
  }

  victory(): void {
    if (!this.ok('victory', 1)) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, k) => this.tone(t + k * 0.14, f, 0.4, 'triangle', 0.1));
  }
}

export const sound = new Sound();
