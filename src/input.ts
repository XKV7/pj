// 키보드/마우스 입력 상태
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
  private canvas: HTMLCanvasElement;
  private getScale: () => number;
  onFirstGesture: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, getScale: () => number) {
    this.canvas = canvas;
    this.getScale = getScale;
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
    canvas.addEventListener('mousemove', (e) => this.updateMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this.updateMouse(e);
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
  }

  private gesture(): void {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  private updateMouse(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    const s = this.getScale();
    this.mouseX = (e.clientX - r.left) / s;
    this.mouseY = (e.clientY - r.top) / s;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  /** 테스트/자동화용 가상 입력 */
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
