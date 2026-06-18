// game.js — main loop, state machine, rendering, stage-select menu
(function () {
  const G = window.GAME;
  const C = G.CONST;
  const aabb = G.aabb;
  const WORLD_H = G.WORLD_H;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const SAVE_KEY = "pj_platformer_progress_v1";

  class Game {
    constructor() {
      this.state = "menu";       // menu | play | transition | win
      this.menuIndex = 0;
      this.cleared = this.loadProgress(); // number of fully cleared stages
      this.coins = 0;
      this.camera = new G.Camera();
      this.player = new G.Player(0, 0);
      this.stageIdx = 0;
      this.sectionIdx = 0;
      this.transTimer = 0;
      this.transText = "";
      this.transNext = null;
      this.bannerTime = 0;

      this.loop = this.loop.bind(this);
      this.acc = 0;
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    // -------- persistence --------
    loadProgress() {
      try { return Math.max(0, parseInt(localStorage.getItem(SAVE_KEY) || "0", 10)) || 0; }
      catch (e) { return 0; }
    }
    saveProgress() {
      try { localStorage.setItem(SAVE_KEY, String(this.cleared)); } catch (e) {}
    }
    isUnlocked(i) { return i <= this.cleared; }

    // -------- section loading --------
    loadSection(stageIdx, sectionIdx, keepCoins) {
      this.stageIdx = stageIdx;
      this.sectionIdx = sectionIdx;
      const stage = G.STAGES[stageIdx];
      const data = stage.sections[sectionIdx];
      this.theme = stage.theme;
      this.data = data;

      this.platforms = data.platforms.map((d) => new G.Platform(d));
      this.enemies = data.enemies.map((e) => {
        const en = new G.Enemy(e.type, e.x, e.yTop, e.lo, e.hi);
        if (en.def.axis === "x") { en.y = e.yTop - en.h; en.startY = en.y; } // feet rest on surface
        return en;
      });
      this.coinObjs = data.coins.map((c) => ({ x: c.x, y: c.y, got: false }));

      this.goal = { x: data.goal.x, y: data.goal.y };
      this.player.reset(data.spawn.x, data.spawn.y);
      this.camera.setBounds(data.width, WORLD_H);
      this.camera.snapTo(this.player.x, this.player.y);
      this.state = "play";
    }

    startStage(stageIdx) {
      this.coins = 0;
      this.loadSection(stageIdx, 0, false);
    }

    respawn() {
      // back to current section start; revive enemies & reset platforms, keep coins
      this.loadSection(this.stageIdx, this.sectionIdx, true);
    }

    reachGoal() {
      const stage = G.STAGES[this.stageIdx];
      if (this.sectionIdx === 0) {
        this.banner("구간 A 완료!  →  구간 B", 70, () => this.loadSection(this.stageIdx, 1, true));
      } else {
        // stage cleared
        if (this.stageIdx + 1 > this.cleared) { this.cleared = this.stageIdx + 1; this.saveProgress(); }
        if (this.stageIdx + 1 < G.STAGES.length) {
          this.banner("STAGE " + (this.stageIdx + 1) + " CLEAR!", 90, () => this.startStage(this.stageIdx + 1));
        } else {
          this.banner("ALL CLEAR!  축하합니다!", 150, () => { this.state = "win"; });
        }
      }
    }

    banner(text, time, next) {
      this.state = "transition";
      this.transText = text;
      this.transTimer = time;
      this.transNext = next;
    }

    // -------- main loop (fixed 60fps step) --------
    loop(now) {
      let dt = now - this.last;
      this.last = now;
      if (dt > 100) dt = 100;
      this.acc += dt;
      const STEP = 1000 / 60;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) { this.update(); this.acc -= STEP; steps++; }
      this.render();
      requestAnimationFrame(this.loop);
    }

    update() {
      this.bannerTime++;
      if (this.state === "menu") return this.updateMenu();
      if (this.state === "win") {
        if (G.Input.consume("Enter") || G.Input.consume("Escape")) { this.state = "menu"; }
        return;
      }
      if (this.state === "transition") {
        this.transTimer--;
        if (this.transTimer <= 0 && this.transNext) { const n = this.transNext; this.transNext = null; n(); }
        return;
      }
      if (this.state !== "play") return;

      if (G.Input.consume("Escape")) { this.state = "menu"; return; }

      // platforms
      for (const p of this.platforms) p.update();
      // player vs solid platforms
      const solids = this.platforms.filter((p) => p.solid);
      this.player.update(solids);

      // enemies
      for (const e of this.enemies) { e.update(); G.Enemy.resolve(this.player, e); }

      // hazards (all instant death)
      for (const h of this.data.hazards) {
        if (aabb(this.player.x, this.player.y, this.player.w, this.player.h, h.x, h.y, h.w, h.h)) {
          this.player.kill(); break;
        }
      }

      // coins
      for (const c of this.coinObjs) {
        if (c.got) continue;
        if (aabb(this.player.x, this.player.y, this.player.w, this.player.h, c.x - 12, c.y - 12, 24, 24)) {
          c.got = true; this.coins++;
        }
      }

      // fall out of world
      if (this.player.y > WORLD_H + 60) this.player.kill();

      // death -> respawn
      if (this.player.dead) { this.respawn(); return; }

      // goal
      if (Math.abs((this.player.x + this.player.w / 2) - this.goal.x) < 40 &&
          this.player.y + this.player.h > this.goal.y - 120) {
        this.reachGoal();
        return;
      }

      this.camera.follow(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
    }

    updateMenu() {
      const n = G.STAGES.length;
      if (G.Input.consume("ArrowLeft") || G.Input.consume("KeyA")) this.menuIndex = (this.menuIndex + n - 1) % n;
      if (G.Input.consume("ArrowRight") || G.Input.consume("KeyD")) this.menuIndex = (this.menuIndex + 1) % n;
      if (G.Input.consume("Enter") || G.Input.consume("Space")) {
        if (this.isUnlocked(this.menuIndex)) this.startStage(this.menuIndex);
      }
    }

    // =======================================================================
    // RENDERING
    // =======================================================================
    render() {
      if (this.state === "menu") return this.renderMenu();
      if (this.state === "win") return this.renderWin();

      const cam = this.camera, t = this.theme;
      this.drawBackground(cam, t);

      // platforms
      for (const p of this.platforms) this.drawPlatform(p, cam, t);
      // hazards
      for (const h of this.data.hazards) this.drawHazard(h, cam);
      // coins
      for (const c of this.coinObjs) this.drawCoin(c, cam);
      // goal
      this.drawGoal(cam);
      // enemies
      for (const e of this.enemies) e.draw(ctx, cam);
      // player
      this.player.draw(ctx, cam);

      this.drawHUD();

      if (this.state === "transition") this.drawBanner(this.transText);
    }

    drawBackground(cam, t) {
      // sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
      g.addColorStop(0, t.bg);
      g.addColorStop(1, t.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

      // parallax decorations
      const rnd = G.mulberry32(this.stageIdx * 131 + this.sectionIdx * 17 + 5);
      const count = 16;
      for (let i = 0; i < count; i++) {
        const wx = rnd() * this.data.width;
        const wy = 40 + rnd() * 320;
        const px = wx - cam.x * 0.4;     // parallax factor
        if (px < -120 || px > C.VIEW_W + 120) continue;
        this.drawDeco(t.deco, px, wy, 0.6 + rnd() * 0.8);
      }
    }

    drawDeco(kind, x, y, s) {
      ctx.save();
      ctx.translate(x, y);
      if (kind === "cloud") {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, 70 * s, 22 * s);
        ctx.fillRect(16 * s, -12 * s, 40 * s, 22 * s);
      } else if (kind === "crystal") {
        ctx.fillStyle = "rgba(140,120,220,0.35)";
        ctx.fillRect(0, 0, 16 * s, 46 * s);
        ctx.fillStyle = "rgba(180,160,255,0.25)";
        ctx.fillRect(20 * s, 10 * s, 12 * s, 30 * s);
      } else if (kind === "dune") {
        ctx.fillStyle = "rgba(220,180,110,0.35)";
        ctx.fillRect(0, 60 * s, 160 * s, 60 * s);
      } else if (kind === "ember") {
        ctx.fillStyle = "rgba(255,140,60,0.5)";
        ctx.fillRect(0, (Math.sin(this.bannerTime * 0.05 + x) * 6), 5 * s, 5 * s);
      }
      ctx.restore();
    }

    drawPlatform(p, cam, t) {
      if (p.type === "crumble" && p.state === "gone") return;
      let x = Math.round(p.x - cam.x);
      let y = Math.round(p.y - cam.y);
      const w = p.w, h = p.h;
      if (x > C.VIEW_W || x + w < 0) return;

      if (p.type === "crumble" && p.state === "crumbling") x += (p.shake % 2 === 0 ? 1 : -1);

      switch (p.type) {
        case "solid":
          ctx.fillStyle = t.ground2;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = t.ground;
          ctx.fillRect(x, y, w, Math.min(14, h));
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(x, y, w, 4);
          break;
        case "moveH":
        case "moveV": {
          ctx.fillStyle = "#5b6472";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#828c9c";
          ctx.fillRect(x, y, w, 5);
          ctx.fillStyle = "#cfd6e0";
          const cx = x + w / 2;
          if (p.type === "moveH") { ctx.fillRect(x + 4, y + 7, 4, 4); ctx.fillRect(x + w - 8, y + 7, 4, 4); }
          else { ctx.fillRect(cx - 2, y + 4, 4, 4); ctx.fillRect(cx - 2, y + h - 8, 4, 4); }
          break;
        }
        case "crumble":
          ctx.fillStyle = "#caa15e";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#a87838";
          ctx.fillRect(x + 8, y + 6, 6, 6);
          ctx.fillRect(x + w - 18, y + 4, 6, 8);
          ctx.fillRect(x + w / 2, y + 8, 5, 6);
          break;
        case "bounce":
          ctx.fillStyle = "#2bb673";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#8ff0c0";
          ctx.fillRect(x, y, w, 5);
          ctx.fillStyle = "#127a4a";
          ctx.fillRect(x + 6, y + 7, w - 12, 4);
          break;
        case "cloud": {
          const sink = p.y - p.baseY;
          ctx.fillStyle = sink > 2 ? "rgba(220,228,255,0.85)" : "rgba(255,255,255,0.95)";
          ctx.fillRect(x, y, w, h);
          ctx.fillRect(x + 10, y - 6, w - 20, h + 6);
          break;
        }
      }
    }

    drawHazard(h, cam) {
      const x = Math.round(h.x - cam.x), y = Math.round(h.y - cam.y);
      if (x > C.VIEW_W || x + h.w < 0) return;
      if (h.type === "spike") {
        ctx.fillStyle = "#3a3f49";
        const n = Math.max(1, Math.floor(h.w / 16));
        const sw = h.w / n;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * sw, y + h.h);
          ctx.lineTo(x + i * sw + sw / 2, y);
          ctx.lineTo(x + i * sw + sw, y + h.h);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "#aeb6c2";
        for (let i = 0; i < n; i++) ctx.fillRect(x + i * sw + sw / 2 - 1, y + 4, 2, 6);
      } else if (h.type === "lava") {
        const bob = Math.sin(this.bannerTime * 0.08 + h.x) * 3;
        ctx.fillStyle = "#e8531f";
        ctx.fillRect(x, y + bob, h.w, h.h);
        ctx.fillStyle = "#ffb648";
        ctx.fillRect(x, y + bob, h.w, 6);
        ctx.fillStyle = "#fff2a0";
        for (let i = 0; i < h.w; i += 40) {
          ctx.fillRect(x + i + (this.bannerTime * 0.5 % 40), y + bob + 2, 8, 3);
        }
      }
    }

    drawCoin(c, cam) {
      if (c.got) return;
      const bob = Math.sin(this.bannerTime * 0.12 + c.x) * 3;
      const x = Math.round(c.x - cam.x), y = Math.round(c.y - cam.y + bob);
      if (x < -20 || x > C.VIEW_W + 20) return;
      ctx.fillStyle = "#f5c518";
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b8860b";
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = "#b8860b"; ctx.stroke();
      ctx.fillStyle = "#fff7d6";
      ctx.fillRect(x - 3, y - 5, 2, 8);
    }

    drawGoal(cam) {
      const gx = Math.round(this.goal.x - cam.x);
      const top = Math.round(this.goal.y - cam.y) - 130;
      // pole
      ctx.fillStyle = "#dfe6ee";
      ctx.fillRect(gx, top, 6, 130);
      // flag
      const wave = Math.sin(this.bannerTime * 0.1) * 4;
      ctx.fillStyle = "#ff3b30";
      ctx.beginPath();
      ctx.moveTo(gx + 6, top + 6);
      ctx.lineTo(gx + 54 + wave, top + 18);
      ctx.lineTo(gx + 6, top + 34);
      ctx.closePath(); ctx.fill();
      // base
      ctx.fillStyle = "#9aa4b0";
      ctx.fillRect(gx - 10, top + 124, 26, 8);
    }

    drawHUD() {
      // panel
      ctx.fillStyle = "rgba(8,12,18,0.55)";
      ctx.fillRect(10, 10, 280, 40);
      // hearts
      for (let i = 0; i < C.MAX_HP; i++) {
        ctx.fillStyle = i < this.player.hp ? "#ff4d4d" : "#4a3030";
        const hx = 22 + i * 26, hy = 22;
        ctx.fillRect(hx, hy + 3, 16, 12);
        ctx.fillRect(hx + 2, hy, 5, 5);
        ctx.fillRect(hx + 9, hy, 5, 5);
        ctx.beginPath();
        ctx.moveTo(hx, hy + 12); ctx.lineTo(hx + 8, hy + 20); ctx.lineTo(hx + 16, hy + 12);
        ctx.closePath(); ctx.fill();
      }
      // coins
      ctx.fillStyle = "#f5c518";
      ctx.beginPath(); ctx.arc(120, 30, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px Courier New";
      ctx.textBaseline = "middle";
      ctx.fillText("x " + this.coins, 134, 31);

      // stage label (right)
      ctx.fillStyle = "rgba(8,12,18,0.55)";
      ctx.fillRect(C.VIEW_W - 330, 10, 320, 40);
      ctx.fillStyle = "#cfe0f0";
      ctx.font = "16px Courier New";
      ctx.textAlign = "right";
      ctx.fillText("STAGE " + (this.stageIdx + 1) + " · " + this.theme.name +
                   "  [구간 " + (this.sectionIdx === 0 ? "A" : "B") + "]", C.VIEW_W - 20, 31);
      ctx.textAlign = "left";
    }

    drawBanner(text) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, C.VIEW_H / 2 - 50, C.VIEW_W, 100);
      ctx.fillStyle = "#ffe066";
      ctx.font = "bold 40px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(text, C.VIEW_W / 2, C.VIEW_H / 2);
      ctx.textAlign = "left";
    }

    // -------- menu --------
    renderMenu() {
      const g = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
      g.addColorStop(0, "#10243f"); g.addColorStop(1, "#1d3a5f");
      ctx.fillStyle = g; ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

      ctx.fillStyle = "#ffe066";
      ctx.font = "bold 46px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("PIXEL PLATFORMER", C.VIEW_W / 2, 80);
      ctx.fillStyle = "#9fb6cc";
      ctx.font = "16px Courier New";
      ctx.fillText("스테이지를 선택하세요  ( ← →  이동,  Enter  시작 )", C.VIEW_W / 2, 118);

      const n = G.STAGES.length;
      const cw = 150, gap = 24;
      const totalW = n * cw + (n - 1) * gap;
      const startX = (C.VIEW_W - totalW) / 2;
      const cy = 200;
      for (let i = 0; i < n; i++) {
        const x = startX + i * (cw + gap);
        const unlocked = this.isUnlocked(i);
        const cleared = i < this.cleared;
        const sel = i === this.menuIndex;
        ctx.fillStyle = sel ? "#2e4a6e" : "#1a2c44";
        ctx.fillRect(x, cy, cw, 190);
        ctx.lineWidth = sel ? 4 : 2;
        ctx.strokeStyle = sel ? "#ffe066" : "#3a5474";
        ctx.strokeRect(x, cy, cw, 190);

        // theme swatch
        const th = G.STAGES[i].theme;
        ctx.fillStyle = th.bg; ctx.fillRect(x + 14, cy + 16, cw - 28, 70);
        ctx.fillStyle = th.ground; ctx.fillRect(x + 14, cy + 70, cw - 28, 16);

        ctx.fillStyle = unlocked ? "#ffffff" : "#5e6b7a";
        ctx.font = "bold 22px Courier New";
        ctx.fillText("STAGE " + (i + 1), x + cw / 2, cy + 118);
        ctx.font = "13px Courier New";
        ctx.fillStyle = unlocked ? "#bcd0e4" : "#4f5b6a";
        ctx.fillText(th.name, x + cw / 2, cy + 142);

        if (!unlocked) {
          ctx.fillStyle = "#cfd6e0"; ctx.font = "26px Courier New";
          ctx.fillText("🔒", x + cw / 2, cy + 172);
        } else if (cleared) {
          ctx.fillStyle = "#5fe08a"; ctx.font = "bold 16px Courier New";
          ctx.fillText("✓ CLEAR", x + cw / 2, cy + 172);
        } else {
          ctx.fillStyle = "#ffe066"; ctx.font = "13px Courier New";
          ctx.fillText("도전!", x + cw / 2, cy + 172);
        }
      }

      ctx.fillStyle = "#7f93a8";
      ctx.font = "14px Courier New";
      ctx.fillText("진행 상황은 브라우저에 자동 저장됩니다 · 클리어한 스테이지: " + this.cleared + " / " + n,
                   C.VIEW_W / 2, 470);
      ctx.textAlign = "left";
    }

    renderWin() {
      const g = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
      g.addColorStop(0, "#2a1a3f"); g.addColorStop(1, "#41265e");
      ctx.fillStyle = g; ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe066"; ctx.font = "bold 54px Courier New";
      ctx.fillText("🎉 ALL CLEAR! 🎉", C.VIEW_W / 2, 220);
      ctx.fillStyle = "#ffffff"; ctx.font = "22px Courier New";
      ctx.fillText("5개 스테이지를 모두 클리어했습니다!", C.VIEW_W / 2, 280);
      ctx.fillStyle = "#9fb6cc"; ctx.font = "16px Courier New";
      ctx.fillText("Enter 를 눌러 스테이지 선택으로 돌아가기", C.VIEW_W / 2, 340);
      ctx.textAlign = "left";
    }
  }

  window.GAME.Game = Game; // exported for testing/debugging
  window.addEventListener("load", () => { new Game(); });
})();
