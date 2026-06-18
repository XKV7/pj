// player.js — player entity: physics, collision, jump, damage, rendering
(function () {
  const C = window.GAME.CONST;
  const aabb = window.GAME.aabb;

  class Player {
    constructor(x, y) {
      this.reset(x, y);
      this.w = C.PLAYER_W;
      this.h = C.PLAYER_H;
    }

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.ground = null;     // platform object currently stood on (for riding)
      this.facing = 1;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.invuln = 0;
      this.hp = C.MAX_HP;
      this.dead = false;      // flagged for respawn this frame
      this.jumping = false;   // true mid player-jump (for variable jump height)
      this.animTime = 0;
    }

    hurt(amount) {
      if (this.invuln > 0) return false;
      this.hp -= amount;
      this.invuln = C.INVULN_FRAMES;
      this.vy = -7;           // small knockback pop
      if (this.hp <= 0) this.dead = true;
      return true;
    }

    kill() { // instant death (fall / lava / golem)
      this.hp = 0;
      this.dead = true;
    }

    bounce(v) { this.vy = v; this.coyote = 0; this.jumping = false; }

    // solids: array of platform objects with current {x,y,w,h,oneWay,dx,dy}
    update(solids) {
      const Input = window.GAME.Input;
      this.animTime++;

      // --- ride moving platform from previous frame ---
      if (this.ground && this.ground.dx !== undefined) {
        this.x += this.ground.dx;
        this.y += this.ground.dy;
      }

      // --- horizontal input ---
      let dir = 0;
      if (Input.left()) dir -= 1;
      if (Input.right()) dir += 1;
      this.vx = dir * C.MOVE_SPEED;
      if (dir !== 0) this.facing = dir;

      // --- jump (with coyote time + input buffering) ---
      if (Input.consume("Space")) this.jumpBuffer = C.JUMP_BUFFER;
      if (this.jumpBuffer > 0) this.jumpBuffer--;
      if (this.coyote > 0) this.coyote--;

      if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        this.vy = C.JUMP_V;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumping = true;       // only player-initiated jumps are variable-height
      }
      // variable jump height: release space -> cut upward velocity.
      // Applies ONLY to jumps, never to bounce pads / stomp pops (jumping=false there).
      if (this.jumping && !Input.jumpHeld() && this.vy < -5) { this.vy = -5; this.jumping = false; }
      if (this.vy >= 0) this.jumping = false;

      // --- gravity ---
      this.vy += C.GRAVITY;
      if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;

      const wasOnGround = this.onGround;
      this.onGround = false;
      this.ground = null;

      // --- horizontal move & resolve ---
      this.x += this.vx;
      for (const p of solids) {
        if (p.oneWay) continue; // one-way platforms never block horizontally
        if (aabb(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
          if (this.vx > 0) this.x = p.x - this.w;
          else if (this.vx < 0) this.x = p.x + p.w;
          this.vx = 0;
        }
      }

      // --- vertical move & resolve ---
      const prevBottom = this.y + this.h - this.vy; // approx bottom before this move
      this.y += this.vy;
      for (const p of solids) {
        if (!aabb(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) continue;
        if (this.vy > 0) {
          // landing on top
          if (p.oneWay && prevBottom > p.y + 8) continue; // came from below/side
          this.y = p.y - this.h;
          this.vy = 0;
          this.onGround = true;
          this.ground = p;
          if (p.onStand) p.onStand();
          if (p.type === "bounce") { this.vy = C.BOUNCE_V; this.onGround = false; this.ground = null; this.jumping = false; }
        } else if (this.vy < 0) {
          if (p.oneWay) continue; // pass through bottom
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }

      if (wasOnGround && !this.onGround && this.vy >= 0) this.coyote = C.COYOTE;

      if (this.invuln > 0) this.invuln--;
    }

    draw(ctx, cam) {
      // blink while invulnerable
      if (this.invuln > 0 && Math.floor(this.invuln / 5) % 2 === 0) return;

      const x = Math.round(this.x - cam.x);
      const y = Math.round(this.y - cam.y);
      const w = this.w, h = this.h;
      const squash = this.onGround && Math.abs(this.vx) > 0.1
        ? Math.sin(this.animTime * 0.4) * 1.5 : 0;

      // body
      ctx.fillStyle = "#ff5a4d";
      ctx.fillRect(x, y + squash, w, h - squash);
      // overalls
      ctx.fillStyle = "#3a6ee0";
      ctx.fillRect(x, y + h * 0.5, w, h * 0.5 - squash * 0.5);
      // face
      ctx.fillStyle = "#ffd9b8";
      ctx.fillRect(x + 3, y + 6 + squash, w - 6, 9);
      // eye (faces direction)
      ctx.fillStyle = "#11151c";
      const eye = this.facing > 0 ? x + w - 8 : x + 4;
      ctx.fillRect(eye, y + 8 + squash, 4, 4);
      // cap
      ctx.fillStyle = "#cf3a30";
      ctx.fillRect(x - 1, y + squash, w + 2, 6);
    }
  }

  window.GAME.Player = Player;
})();
