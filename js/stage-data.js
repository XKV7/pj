// stage-data.js — Platform runtime class + all stage/section level data (data-driven)
(function () {
  const C = window.GAME.CONST;
  const WORLD_H = 540;
  const GY = 480; // ground surface Y (floor fills GY..540)

  // ---------------------------------------------------------------------------
  // Platform: runtime object built from a plain data def. Handles moving /
  // crumbling / bouncy / cloud behaviours and exposes dx,dy so the player can
  // ride it. `solid` toggles whether it currently blocks (crumble disappearing).
  // ---------------------------------------------------------------------------
  class Platform {
    constructor(def) {
      this.type = def.type || "solid";
      this.baseX = def.x; this.baseY = def.y;
      this.x = def.x; this.y = def.y;
      this.w = def.w; this.h = def.h;
      this.oneWay = def.oneWay || false;
      this.range = def.range || 0;
      this.speed = def.speed || 0.028;
      this.t = def.phase || 0;
      this.dx = 0; this.dy = 0;
      this.solid = true;
      this.stood = false;

      // crumble state machine
      this.crumbleDelay = 70;   // frames standing before it collapses (~1.2s)
      this.respawnTime = 150;   // frames until it reforms
      this.state = "idle";      // idle -> crumbling -> gone -> idle
      this.timer = 0;
      this.shake = 0;

      // cloud sink
      this.sinkSpeed = 1.3;
      this.recoverSpeed = 0.9;
      this.maxSink = 70;
    }

    onStand() {
      this.stood = true;
      if (this.type === "crumble" && this.state === "idle") {
        this.state = "crumbling";
        this.timer = this.crumbleDelay;
      }
    }

    update() {
      const px = this.x, py = this.y;
      switch (this.type) {
        case "moveH":
          this.t += this.speed;
          this.x = this.baseX + Math.sin(this.t) * this.range;
          break;
        case "moveV":
          this.t += this.speed;
          this.y = this.baseY + Math.sin(this.t) * this.range;
          break;
        case "crumble":
          if (this.state === "crumbling") {
            this.timer--;
            this.shake = (this.shake + 1) % 4;
            if (this.timer <= 0) { this.solid = false; this.state = "gone"; this.timer = this.respawnTime; }
          } else if (this.state === "gone") {
            this.timer--;
            if (this.timer <= 0) { this.solid = true; this.state = "idle"; this.shake = 0; }
          }
          break;
        case "cloud":
          if (this.stood) {
            this.y = Math.min(this.baseY + this.maxSink, this.y + this.sinkSpeed);
          } else if (this.y > this.baseY) {
            this.y = Math.max(this.baseY, this.y - this.recoverSpeed);
          }
          break;
      }
      this.dx = this.x - px;
      this.dy = this.y - py;
      this.stood = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Build helpers
  // ---------------------------------------------------------------------------
  function P(x, y, w, h, type, o) { return Object.assign({ x, y, w, h, type: type || "solid" }, o || {}); }
  function ground(x, w, y) { y = y == null ? GY : y; return P(x, y, w, WORLD_H - y, "solid", { oneWay: false }); }
  function block(x, y, w, h) { return P(x, y, w, h, "solid", { oneWay: false }); }   // hills / walls / ceilings
  function ledge(x, y, w) { return P(x, y, w, 18, "solid", { oneWay: true }); }       // thin one-way platform
  function moveH(x, y, w, range, speed) { return P(x, y, w, 18, "moveH", { oneWay: true, range, speed: speed || 0.022, phase: (x % 7) }); }
  function moveV(x, y, w, range, speed) { return P(x, y, w, 18, "moveV", { oneWay: true, range, speed: speed || 0.026, phase: (x % 5) }); }
  function crumble(x, y, w) { return P(x, y, w || 100, 18, "crumble", { oneWay: true }); }
  function bounce(x, y, w) { return P(x, y, w || 80, 16, "bounce", { oneWay: true }); }
  function cloud(x, y, w) { return P(x, y, w || 120, 16, "cloud", { oneWay: true }); }

  // Chain of stepping platforms with controlled, guaranteed-jumpable spacing.
  // step = start-to-start distance; gap (step - w) is kept small. wave = vertical zig-zag amplitude.
  function platChain(x0, y0, n, w, step, type, wave) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      const y = Math.round(y0 + (wave ? Math.sin(i * 0.95) * wave : 0));
      out.push(type === "cloud" ? cloud(x, y, w) : type === "crumble" ? crumble(x, y, w) : ledge(x, y, w));
    }
    return out;
  }

  function En(type, x, yTop, lo, hi) { return { type, x, yTop, lo, hi }; }  // ground: yTop=surface; air-V: yTop=lo
  function spike(x, y, w) { return { x, y: y == null ? GY - 22 : y, w: w || 40, h: 22, type: "spike" }; }
  function lava(x, w) { return { x, y: 502, w, h: WORLD_H - 502, type: "lava" }; }
  function coinRow(x, y, n, gap) { const a = []; gap = gap || 36; for (let i = 0; i < n; i++) a.push({ x: x + i * gap, y }); return a; }

  // ---------------------------------------------------------------------------
  const THEMES = {
    1: { name: "초원 / 평원", bg: "#74b9e0", bg2: "#cdeaff", ground: "#6ab04c", ground2: "#4a8233", deco: "cloud" },
    2: { name: "동굴 / 지하", bg: "#171423", bg2: "#2a2438", ground: "#4a4258", ground2: "#2e2940", deco: "crystal" },
    3: { name: "사막", bg: "#e2b56e", bg2: "#f7e6b0", ground: "#cf9b54", ground2: "#a87838", deco: "dune" },
    4: { name: "하늘 / 구름", bg: "#7fbcf5", bg2: "#d7eeff", ground: "#cdd8ee", ground2: "#9aacce", deco: "cloud" },
    5: { name: "화산 / 용암", bg: "#2e1311", bg2: "#5e1e16", ground: "#4a2a24", ground2: "#2f1d19", deco: "ember" },
  };

  // ===========================================================================
  // STAGE 1 — Plains (tutorial). Gentle hills, simple jumps, 1-2 slimes.
  // ===========================================================================
  function s1a() {
    const platforms = [
      ground(0, 860),
      ground(1000, 560, 440),       // hill (top 440)  gap 860..1000 = 140
      ground(1700, 640),            // gap 1560..1700 = 140
      ground(2480, 640),            // gap 2340..2480 = 140
      ground(3120, 420, 420),       // hill (top 420), adjacent step-up
      ground(3680, 1320),           // gap 3540..3680 = 140  -> goal area
      ledge(1080, 360, 170), ledge(1740, 350, 180), ledge(2520, 350, 170),
    ];
    const enemies = [En("slime", 1720, GY, 1720, 2320), En("slime", 3720, GY, 3720, 4400)];
    const hazards = [spike(2700, null, 80)]; // sits on ground 2480..3120
    const coins = coinRow(1060, 322, 4).concat(coinRow(1760, 312, 4), coinRow(2540, 312, 4), coinRow(1040, 402, 3));
    return { width: 5000, spawn: { x: 80, y: 420 }, goal: { x: 4860, y: GY }, platforms, enemies, hazards, coins };
  }
  function s1b() {
    const platforms = [
      ground(0, 560),
      ledge(680, 400, 150), ledge(940, 340, 150), ledge(1200, 400, 150), // hop over pit 560..1420
      ground(1420, 520),            // slime
      ground(2080, 540),            // gap 1940..2080 = 140
      ground(2760, 520),            // gap 2620..2760 = 140 ; spike here
      ground(3420, 520),            // gap 3280..3420 = 140
      ledge(3650, 360, 150),
      ground(4080, 1320),           // gap 3940..4080 = 140 ; goal
    ];
    const enemies = [En("slime", 1440, GY, 1440, 1920), En("slime", 2780, GY, 2780, 3260), En("slime", 4100, GY, 4100, 4900)];
    const hazards = [spike(3000, null, 80)]; // on ground 2760..3280
    const coins = coinRow(700, 372, 3).concat(coinRow(960, 312, 3), coinRow(1220, 372, 3), coinRow(3670, 322, 4));
    return { width: 5400, spawn: { x: 70, y: 420 }, goal: { x: 5260, y: GY }, platforms, enemies, hazards, coins };
  }

  // ===========================================================================
  // STAGE 2 — Cave (low ceilings, bats, bounce pads).
  // ===========================================================================
  function s2a() {
    const platforms = [
      ground(0, 1140),
      block(720, 0, 260, 150),      // hanging ceiling
      ground(1280, 700),            // gap 1140..1280 = 140
      bounce(1500, 430, 90),
      ledge(1760, 340, 150),
      ground(2120, 740),            // gap 1980..2120 = 140
      block(2360, 0, 220, 170),     // ceiling
      ground(3000, 820),            // gap 2860..3000 = 140
      ledge(3220, 360, 160),
      ground(3960, 1240),           // gap 3820..3960 = 140 ; goal
      block(4200, 0, 260, 170),
    ];
    const enemies = [En("bat", 1300, 300, 1300, 1900), En("slime", 3020, GY, 3020, 3800), En("bat", 4000, 250, 4000, 4700)];
    const hazards = [];
    const coins = coinRow(1480, 380, 3).concat(coinRow(1780, 300, 3), coinRow(3240, 320, 3), coinRow(2740, 430, 4));
    return { width: 5200, spawn: { x: 70, y: 420 }, goal: { x: 5060, y: GY }, platforms, enemies, hazards, coins };
  }
  function s2b() {
    const platforms = [
      ground(0, 560),
      block(0, 0, 5600, 60),        // ceiling spanning the section
      block(900, 0, 200, 180), block(2640, 0, 220, 180), block(4060, 0, 240, 180), // low passages
      // main ledge path (all normal-jump reachable) over pit 560..1500
      ledge(700, 390, 150), ledge(960, 360, 150), ledge(1240, 390, 150),
      ground(1500, 520),            // spike, bat above
      ledge(2120, 380, 150), ledge(2380, 350, 150), // pit 2020..2640
      ground(2640, 520),
      ledge(3300, 380, 150), ledge(3560, 360, 150), // pit 3160..3820
      ground(3820, 520),            // spike
      ledge(4460, 380, 150),        // pit 4340..4720
      ground(4720, 880),            // goal
      // OPTIONAL bounce bonus: launch up to a coin ledge
      bounce(1740, 440, 80), ledge(1700, 250, 130),
    ];
    const enemies = [En("bat", 1560, 230, 1560, 2080), En("bat", 2700, 200, 2700, 3220), En("slime", 3840, GY, 3840, 4300), En("bat", 4200, 210, 4200, 4700)];
    const hazards = [spike(1700, null, 80), spike(4000, null, 80)]; // both on ground
    const coins = coinRow(700, 352, 3).concat(coinRow(2120, 342, 2), coinRow(3300, 342, 2), coinRow(1710, 222, 3));
    return { width: 5600, spawn: { x: 60, y: 420 }, goal: { x: 5460, y: GY }, platforms, enemies, hazards, coins };
  }

  // ===========================================================================
  // STAGE 3 — Desert (crumbling platforms, cactus soldiers, spikes).
  // ===========================================================================
  function s3a() {
    const platforms = [
      ground(0, 820),
      ...platChain(900, 400, 3, 110, 230, "crumble"), // bridge pit 820..1600 (x 900,1130,1360)
      ground(1600, 660),            // cactus ; entry 1470..1600 = 130
      ground(2260, 640),            // gap 2260 adjacent step? -> gap 2260..2260 none; actually adjacent
      ...platChain(2980, 380, 3, 110, 210, "crumble"), // bridge pit 2900..3460 (2980,3190,3400)
      ground(3460, 720),            // slime, spike
      ground(4380, 920),            // gap 4180..4380 = 200 -> bridged below
      ledge(4220, 380, 150),        // stepping ledge over the 4180..4380 gap
      ledge(3600, 350, 160),
    ];
    const enemies = [En("cactus", 1620, GY, 1620, 2240), En("slime", 3480, GY, 3480, 4160), En("cactus", 4400, GY, 4400, 5100)];
    const hazards = [spike(3800, null, 80)]; // on ground 3460..4180
    const coins = coinRow(900, 360, 3).concat(coinRow(2980, 340, 3), coinRow(3620, 312, 3), coinRow(4240, 342, 2));
    return { width: 5300, spawn: { x: 70, y: 420 }, goal: { x: 5160, y: GY }, platforms, enemies, hazards, coins };
  }
  function s3b() {
    const platforms = [
      ground(0, 520),
      ...platChain(600, 400, 4, 100, 200, "crumble"), // bridge pit 520..1300 (600,800,1000,1200)
      ground(1300, 460),            // cactus, spike
      moveH(1900, 380, 120, 110),   // moving bridge over pit 1760..2200
      ground(2200, 460),            // slime
      ...platChain(2740, 380, 4, 100, 200, "crumble"), // bridge pit 2660..3460 (2740..3340)
      ground(3460, 460),            // spike
      moveV(4040, 380, 110, 70),    // vertical platform over pit 3920..4260
      ground(4260, 1240),           // goal
    ];
    const enemies = [En("cactus", 1320, GY, 1320, 1760), En("slime", 2220, GY, 2220, 2660), En("slime", 4300, GY, 4300, 4840), En("cactus", 4860, GY, 4860, 5400)];
    const hazards = [spike(1500, null, 80), spike(3700, null, 80)]; // on ground 1300..1760 / 3460..3920
    const coins = coinRow(620, 360, 3).concat(coinRow(2760, 340, 3), coinRow(1880, 340, 2), coinRow(4040, 340, 2));
    return { width: 5500, spawn: { x: 60, y: 420 }, goal: { x: 5360, y: GY }, platforms, enemies, hazards, coins };
  }

  // ===========================================================================
  // STAGE 4 — Sky (sinking clouds, moving platforms, fall pits, cloud monsters).
  // ===========================================================================
  function s4a() {
    const platforms = [
      ground(0, 520),
      ...platChain(620, 400, 3, 120, 210, "cloud", 40), // 620,830,1040
      moveH(1300, 360, 120, 120),
      ...platChain(1620, 380, 2, 120, 210, "cloud", 30), // 1620,1830
      ground(2020, 360),
      bounce(2280, 420, 80),
      ...platChain(2520, 360, 3, 120, 210, "cloud", 40), // 2520,2730,2940
      moveV(3160, 360, 110, 70),
      ground(3400, 360),
      ...platChain(3840, 380, 2, 120, 210, "cloud", 30), // 3840,4050
      ground(4320, 980),            // goal ; from cloud 4170 -> 4320 = 150
    ];
    const enemies = [En("bat", 1300, 240, 1300, 1900), En("cloud", 2400, 180, 180, 420), En("bat", 3500, 230, 3500, 4060)];
    const hazards = [];
    const coins = coinRow(640, 360, 3).concat(coinRow(2540, 320, 3), coinRow(3860, 340, 2), coinRow(2300, 360, 2));
    return { width: 5300, spawn: { x: 70, y: 360 }, goal: { x: 5160, y: GY }, platforms, enemies, hazards, coins };
  }
  function s4b() {
    // Every moving-platform handoff is reachable from the platform's CENTER
    // position (<=150px), so timing is forgiving (no extreme-position precision).
    const platforms = [
      ground(0, 420),
      moveH(560, 400, 110, 120),   // covers ~440..790 ; entry from ground edge 420
      cloud(820, 380, 120),        // from moveH center-right(670) = 150
      cloud(1040, 360, 120),       // 100
      moveV(1280, 360, 110, 90),   // 120
      cloud(1540, 340, 120),       // 150
      cloud(1760, 320, 120),       // 100
      ground(2000, 360),           // 120 ; bonus bounce here
      cloud(2440, 360, 120),       // 80
      cloud(2680, 360, 120),       // 120 (static so the prior cloud->here->cloud handoff is deterministic)
      cloud(2940, 340, 120),       // 140
      cloud(3160, 320, 120),       // 100
      moveV(3420, 340, 110, 100),  // 140
      cloud(3660, 340, 120),       // 130
      cloud(3880, 360, 120),       // 100
      ground(4120, 360),           // 120
      cloud(4560, 360, 120),       // 80
      cloud(4780, 360, 120),       // 100
      ground(5000, 800),           // 100 ; goal
      bounce(2200, 420, 80),       // optional bonus (on ground 2000..2360)
    ];
    const enemies = [
      En("bat", 820, 260, 820, 1120), En("cloud", 2200, 200, 200, 440),
      En("bat", 2940, 250, 2940, 3300), En("cloud", 3880, 180, 180, 420),
      En("bat", 4560, 260, 4560, 4900),
    ];
    const hazards = [];
    const coins = coinRow(820, 340, 3).concat(coinRow(2940, 300, 3), coinRow(3660, 300, 2), coinRow(1540, 300, 2));
    return { width: 5800, spawn: { x: 60, y: 360 }, goal: { x: 5660, y: GY }, platforms, enemies, hazards, coins };
  }

  // ===========================================================================
  // STAGE 5 — Volcano (lava pools, golems, everything combined — hardest).
  // ===========================================================================
  function s5a() {
    const platforms = [
      ground(0, 720), lava(720, 150),
      ground(870, 550),             // golem
      ground(1420, 300, 430),       // hill
      moveH(1840, 400, 120, 120), lava(1760, 360), // moving bridge over lava 1760..2120
      ground(2120, 520),            // slime, spike
      ...platChain(2720, 380, 2, 110, 230, "crumble"), lava(2640, 540), // crumble bridge over lava 2640..3180
      ground(3180, 560),            // golem
      lava(3740, 150),
      ground(3890, 1410),           // goal ; moveV decoration for coins
      moveV(4200, 360, 120, 80),
    ];
    const enemies = [En("golem", 900, GY, 900, 1400), En("slime", 2160, GY, 2160, 2600), En("golem", 3920, GY, 3920, 4500)];
    const hazards = [spike(2400, null, 80)]; // on ground 2120..2640
    const coins = coinRow(960, 430, 4).concat(coinRow(2720, 340, 2), coinRow(4180, 320, 3));
    return { width: 5300, spawn: { x: 70, y: 420 }, goal: { x: 5160, y: GY }, platforms, enemies, hazards, coins };
  }
  function s5b() {
    const platforms = [
      ground(0, 460), lava(460, 140),
      ground(600, 520),             // golem, spike
      lava(1120, 140),
      ground(1260, 520),
      lava(1780, 140),
      ground(1920, 520),            // golem
      lava(2440, 140),
      ground(2580, 520),            // slime, spike
      lava(3100, 140),
      ground(3240, 520),            // golem
      lava(3760, 140),
      ground(3900, 520),            // cactus, spike
      lava(4420, 140),
      ground(4560, 940),            // goal
      // high bonus route (coins)
      ledge(1400, 340, 140), ledge(2080, 330, 140), moveH(2700, 330, 110, 100), ledge(3400, 340, 140),
    ];
    const enemies = [
      En("golem", 600, GY, 600, 1120), En("golem", 1920, GY, 1920, 2440),
      En("slime", 2600, GY, 2600, 3100), En("golem", 3240, GY, 3240, 3760),
      En("cactus", 3920, GY, 3920, 4420),
    ];
    const hazards = [spike(850, null, 80), spike(2850, null, 80), spike(4150, null, 80)]; // all on ground
    const coins = coinRow(1400, 312, 2).concat(coinRow(2080, 302, 2), coinRow(3400, 312, 2), coinRow(2680, 302, 2));
    return { width: 5500, spawn: { x: 60, y: 420 }, goal: { x: 5360, y: GY }, platforms, enemies, hazards, coins };
  }

  // ---------------------------------------------------------------------------
  const STAGES = [
    { id: 1, theme: THEMES[1], sections: [s1a(), s1b()] },
    { id: 2, theme: THEMES[2], sections: [s2a(), s2b()] },
    { id: 3, theme: THEMES[3], sections: [s3a(), s3b()] },
    { id: 4, theme: THEMES[4], sections: [s4a(), s4b()] },
    { id: 5, theme: THEMES[5], sections: [s5a(), s5b()] },
  ];

  window.GAME.Platform = Platform;
  window.GAME.STAGES = STAGES;
  window.GAME.WORLD_H = WORLD_H;
  window.GAME.GY = GY;
})();
