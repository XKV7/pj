// 키보드/마우스/터치 입력 상태
import { VIEW_W, VIEW_H } from './render/renderer';

/** 터치 컨트롤 배치 (뷰 좌표 400x225) */
export const TOUCH = {
  stick: { x: 48, y: 158, r: 26 },
  aim: { x: 346, y: 150, r: 26 },
  jump: { x: 382, y: 203, r: 13 },
  use: { x: 344, y: 207, r: 10 },
  bag: { x: 302, y: 74, w: 46, h: 14 },
  pause: { x: 352, y: 74, w: 44, h: 14 },
};

type TouchRole =
  | { kind: 'stick' }
  | { kind: 'aimstick' }
  | { kind: 'key'; code: string }
  | { kind: 'aim' }
  | { kind: 'mouse' };

export class Input {
  private keys = new Set<string>();
  private pressedKeys = new Set<string>();
  mouseX = 0; // 뷰 좌표 (400x225)
  mouseY = 0;
  mouseDown = false;
  rightDown = false;
  clicked = false;
  rightClicked = false;
  released = false;
  wheel = 0;
  /** 터치 입력이 한 번이라도 들어오면 true (가상 컨트롤 표시) */
  touchMode = false;
  /** 게임 플레이 중이면 true: 터치를 가상 조이스틱/버튼으로 해석, 아니면 마우스처럼 */
  gameplayTouch = false;
  stickX = 0;
  stickY = 0;
  stickActive = false;
  /** 오른쪽 조준 조이스틱: 누른 채 방향을 정하고 떼면 발사 */
  aimStickActive = false;
  aimDX = 0;
  aimDY = 0;
  aimAngle = 0;
  /** 마지막 조준 입력 출처 */
  aimSource: 'pointer' | 'stick' = 'pointer';
  private aimFire = false;
  private touches = new Map<number, TouchRole>();
  private canvas: HTMLCanvasElement;
  onFirstGesture: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F3'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      this.gesture();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    canvas.addEventListener('mousemove', (e) => this.updateMouse(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => {
      this.updateMouse(e.clientX, e.clientY);
      if (e.button === 0) {
        this.mouseDown = true;
        this.clicked = true;
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rightClicked = true;
      }
      this.gesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.released = true;
      } else if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    // 터치
    const opt = { passive: false } as AddEventListenerOptions;
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), opt);
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), opt);
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), opt);
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opt);
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private toView(cx: number, cy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) * VIEW_W) / Math.max(1, r.width), y: ((cy - r.top) * VIEW_H) / Math.max(1, r.height) };
  }

  private updateMouse(cx: number, cy: number): void {
    this.aimSource = 'pointer';
    const p = this.toView(cx, cy);
    this.mouseX = p.x;
    this.mouseY = p.y;
  }

  // ---------- 터치 ----------
  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.touchMode = true;
    this.gesture();
    for (const t of Array.from(e.changedTouches)) {
      const p = this.toView(t.clientX, t.clientY);
      const role = this.gameplayTouch ? this.gameRole(p.x, p.y) : this.touches.size === 0 ? ({ kind: 'mouse' } as TouchRole) : null;
      if (!role) continue;
      this.touches.set(t.identifier, role);
      if (role.kind === 'stick') this.updateStick(p.x, p.y);
      else if (role.kind === 'aimstick') this.updateAim(p.x, p.y);
      else if (role.kind === 'key') this.simulateKey(role.code, true);
      else {
        if (role.kind === 'aim') this.aimSource = 'pointer';
        this.mouseX = p.x;
        this.mouseY = p.y;
        this.mouseDown = true;
        this.clicked = true;
      }
    }
  }

  private gameRole(x: number, y: number): TouchRole {
    const T = TOUCH;
    const near = (c: { x: number; y: number; r: number }, pad: number): boolean => Math.hypot(x - c.x, y - c.y) <= c.r + pad;
    const inRect = (b: { x: number; y: number; w: number; h: number }): boolean => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2;
    if (inRect(T.bag)) return { kind: 'key', code: 'Tab' };
    if (inRect(T.pause)) return { kind: 'key', code: 'Escape' };
    if (near(T.jump, 6)) return { kind: 'key', code: 'Space' };
    if (near(T.aim, 10) && !this.aimStickActive) return { kind: 'aimstick' };
    if (near(T.use, 6)) return { kind: 'key', code: 'KeyE' };
    if (y >= VIEW_H - 24 && x < 251) return { kind: 'key', code: 'Digit' + Math.min(4, 1 + Math.floor((x - 3) / 62)) };
    if (x < 130 && y > 90 && !this.stickActive) return { kind: 'stick' };
    for (const r of this.touches.values()) if (r.kind === 'aim') return { kind: 'key', code: '__none' };
    return { kind: 'aim' };
  }

  private updateStick(x: number, y: number): void {
    const s = TOUCH.stick;
    let dx = (x - s.x) / s.r;
    let dy = (y - s.y) / s.r;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    this.stickX = dx;
    this.stickY = dy;
    this.stickActive = true;
    this.setKey('KeyA', dx < -0.3);
    this.setKey('KeyD', dx > 0.3);
    this.setKey('KeyW', dy < -0.6);
  }

  private updateAim(x: number, y: number): void {
    const s = TOUCH.aim;
    let dx = (x - s.x) / s.r;
    let dy = (y - s.y) / s.r;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    this.aimDX = dx;
    this.aimDY = dy;
    this.aimStickActive = true;
    if (l > 0.25) {
      this.aimAngle = Math.atan2(dy, dx);
      this.aimSource = 'stick';
    }
  }

  /** 조준 조이스틱이 충분히 기울어져 있는지 */
  aimReady(): boolean {
    return this.aimStickActive && Math.hypot(this.aimDX, this.aimDY) > 0.25;
  }

  /** 조준 조이스틱을 떼서 발사 요청이 있었는지 (한 번 읽으면 사라짐) */
  consumeAimFire(): boolean {
    const f = this.aimFire;
    this.aimFire = false;
    return f;
  }

  private setKey(code: string, on: boolean): void {
    if (on === this.keys.has(code)) return;
    this.simulateKey(code, on);
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const role = this.touches.get(t.identifier);
      if (!role) continue;
      const p = this.toView(t.clientX, t.clientY);
      if (role.kind === 'stick') this.updateStick(p.x, p.y);
      else if (role.kind === 'aimstick') this.updateAim(p.x, p.y);
      else if (role.kind === 'aim' || role.kind === 'mouse') {
        if (role.kind === 'aim') this.aimSource = 'pointer';
        this.mouseX = p.x;
        this.mouseY = p.y;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const role = this.touches.get(t.identifier);
      if (!role) continue;
      this.touches.delete(t.identifier);
      if (role.kind === 'stick') {
        this.stickActive = false;
        this.stickX = 0;
        this.stickY = 0;
        this.setKey('KeyA', false);
        this.setKey('KeyD', false);
        this.setKey('KeyW', false);
      } else if (role.kind === 'aimstick') {
        if (e.type === 'touchend' && this.aimReady()) this.aimFire = true;
        this.aimStickActive = false;
        this.aimDX = 0;
        this.aimDY = 0;
      } else if (role.kind === 'key') this.simulateKey(role.code, false);
      else {
        this.mouseDown = false;
        this.released = true;
      }
    }
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  /** 가상 입력 (터치 버튼, 테스트 자동화) */
  simulateKey(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.keys.has(code)) this.pressedKeys.add(code);
      this.keys.add(code);
    } else this.keys.delete(code);
  }

  /** 프레임 끝. 키 입력은 고정 틱이 한 번이라도 돌았을 때만 소비한다 (고주사율 모니터 대응) */
  endFrame(ticked: boolean): void {
    if (ticked) {
      this.pressedKeys.clear();
      this.wheel = 0;
    }
    this.clicked = false;
    this.rightClicked = false;
    this.released = false;
  }
}
