// camera.js — smooth side-scrolling camera that follows the player
(function () {
  const C = window.GAME.CONST;

  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.worldW = 0;
      this.worldH = C.VIEW_H;
    }

    setBounds(worldW, worldH) {
      this.worldW = worldW;
      this.worldH = worldH;
    }

    // Snap immediately (used on respawn / level start)
    snapTo(targetX, targetY) {
      this.x = this._clampX(targetX - C.VIEW_W / 2);
      this.y = this._clampY(targetY - C.VIEW_H / 2);
    }

    follow(targetX, targetY) {
      const desiredX = targetX - C.VIEW_W * 0.42; // player slightly left of center
      const desiredY = targetY - C.VIEW_H * 0.55;
      // smooth (ease) toward target
      this.x = window.GAME.lerp(this.x, this._clampX(desiredX), 0.12);
      this.y = window.GAME.lerp(this.y, this._clampY(desiredY), 0.12);
    }

    _clampX(x) {
      return window.GAME.clamp(x, 0, Math.max(0, this.worldW - C.VIEW_W));
    }
    _clampY(y) {
      return window.GAME.clamp(y, 0, Math.max(0, this.worldH - C.VIEW_H));
    }
  }

  window.GAME.Camera = Camera;
})();
