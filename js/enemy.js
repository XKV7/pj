// enemy.js — patrol-only enemies (NO player-tracking AI; back-and-forth only)
(function () {
  const aabb = window.GAME.aabb;

  // Per-type config. Patrol bounds are explicit (minX/maxX or minY/maxY),
  // which represents the platform extent / patrol corridor and reliably
  // mimics "turn around at edge/wall" without fragile edge probing.
  const DEFS = {
    slime:  { w: 34, h: 26, speed: 1.1, axis: "x", stompable: true,  deadly: false, color: "#39c267", color2: "#2a9e51" },
    bat:    { w: 30, h: 22, speed: 1.8, axis: "x", stompable: true,  deadly: false, color: "#7d5ba6", color2: "#4b3570" },
    cactus: { w: 28, h: 38, speed: 2.6, axis: "x", stompable: true,  deadly: false, color: "#3f9d4a", color2: "#2c6e34" },
    cloud:  { w: 40, h: 32, speed: 1.6, axis: "y", stompable: true,  deadly: false, color: "#c9d6ff", color2: "#8aa0d8" },
    golem:  { w: 46, h: 46, speed: 0.7, axis: "x", stompable: false, deadly: true,  color: "#b23b2e", color2: "#7d231a" },
  };

  class Enemy {
    constructor(type, x, y, lo, hi) {
      const d = DEFS[type] || DEFS.slime;
      this.type = type;
      this.def = d;
      this.x = x;
      this.y = y;
      this.startX = x;
      this.startY = y;
      this.w = d.w;
      this.h = d.h;
      this.lo = lo;             // min bound on patrol axis
      this.hi = hi;             // max bound on patrol axis
      this.dir = 1;
      this.alive = true;
      this.t = Math.random() * Math.PI * 2;
    }

    update() {
      if (!this.alive) return;
      const d = this.def;
      this.t += 0.08;
      if (d.axis === "x") {
        this.x += this.dir * d.speed;
        if (this.x <= this.lo) { this.x = this.lo; this.dir = 1; }
        if (this.x + this.w >= this.hi) { this.x = this.hi - this.w; this.dir = -1; }
        if (this.type === "bat") this.y = this.startY + Math.sin(this.t) * 10; // gentle bob, fixed altitude
      } else {
        this.y += this.dir * d.speed;
        if (this.y <= this.lo) { this.y = this.lo; this.dir = 1; }
        if (this.y + this.h >= this.hi) { this.y = this.hi - this.h; this.dir = -1; }
      }
    }

    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

    draw(ctx, cam) {
      if (!this.alive) return;
      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      const w = this.w, h = this.h;
      const d = this.def;

      ctx.fillStyle = d.color;
      switch (this.type) {
        case "slime": {
          const sq = Math.sin(this.t) * 2;
          ctx.fillRect(x, y + sq, w, h - sq);
          ctx.fillStyle = "#fff";
          ctx.fillRect(x + 6, y + 6 + sq, 5, 5);
          ctx.fillRect(x + w - 11, y + 6 + sq, 5, 5);
          ctx.fillStyle = "#11151c";
          ctx.fillRect(x + 8, y + 8 + sq, 2, 2);
          ctx.fillRect(x + w - 9, y + 8 + sq, 2, 2);
          break;
        }
        case "bat": {
          const flap = Math.sin(this.t * 2) * 6;
          ctx.fillStyle = d.color2;
          ctx.fillRect(x - 8, y + 4 - flap, 10, 8);          // left wing
          ctx.fillRect(x + w - 2, y + 4 - flap, 10, 8);      // right wing
          ctx.fillStyle = d.color;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#ff5a4d";
          ctx.fillRect(x + 6, y + 7, 4, 4);
          ctx.fillRect(x + w - 10, y + 7, 4, 4);
          break;
        }
        case "cactus": {
          ctx.fillRect(x + 6, y, w - 12, h);                 // trunk
          ctx.fillRect(x, y + 10, 8, 6);                     // left arm
          ctx.fillRect(x + w - 8, y + 6, 8, 6);              // right arm
          ctx.fillStyle = "#11151c";
          ctx.fillRect(x + 10, y + 12, 3, 3);
          ctx.fillRect(x + w - 13, y + 12, 3, 3);
          break;
        }
        case "cloud": {
          ctx.fillRect(x, y + 8, w, h - 12);
          ctx.fillRect(x + 6, y, w - 12, h);
          ctx.fillStyle = "#39406b";
          ctx.fillRect(x + 9, y + 12, 5, 5);
          ctx.fillRect(x + w - 14, y + 12, 5, 5);
          break;
        }
        case "golem": {
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = d.color2;
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          // glowing cracks
          ctx.fillStyle = "#ffb648";
          ctx.fillRect(x + 8, y + 14, w - 16, 4);
          ctx.fillRect(x + 14, y + 26, 5, 12);
          ctx.fillStyle = "#fff2c2";
          ctx.fillRect(x + 10, y + 10, 6, 6);
          ctx.fillRect(x + w - 16, y + 10, 6, 6);
          break;
        }
      }
    }
  }

  // Resolve player <-> enemy interaction. Returns nothing; mutates player & enemy.
  Enemy.resolve = function (player, enemy) {
    if (!enemy.alive) return;
    if (!aabb(player.x, player.y, player.w, player.h, enemy.x, enemy.y, enemy.w, enemy.h)) return;

    if (enemy.def.deadly) { player.kill(); return; }       // golem: contact = instant death

    const stomping = player.vy > 0 && (player.y + player.h) - enemy.y < player.h * 0.6;
    if (enemy.def.stompable && stomping) {
      enemy.alive = false;
      player.bounce(window.GAME.CONST.STOMP_V);
    } else {
      player.hurt(1);
    }
  };

  window.GAME.Enemy = Enemy;
})();
