// util.js — shared constants and small helpers (global namespace, no modules)
window.GAME = window.GAME || {};

GAME.CONST = {
  VIEW_W: 960,
  VIEW_H: 540,

  // Physics (px / frame, assuming ~60fps fixed step)
  GRAVITY: 0.62,
  MAX_FALL: 16,
  MOVE_SPEED: 4.2,
  JUMP_V: -13.6,
  BOUNCE_V: -20.5,      // bouncy platform launch
  STOMP_V: -10.5,       // bounce after stomping an enemy
  COYOTE: 6,            // frames of coyote time after leaving ground
  JUMP_BUFFER: 6,       // frames a jump press is remembered

  PLAYER_W: 26,
  PLAYER_H: 36,

  INVULN_FRAMES: 90,    // ~1.5s of invulnerability after a hit
  MAX_HP: 3,

  TILE: 40,             // reference unit for level building
};

// Axis-Aligned Bounding Box overlap test
GAME.aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
};

GAME.clamp = function (v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
};

GAME.lerp = function (a, b, t) {
  return a + (b - a) * t;
};

// Tiny seeded RNG so background decorations stay stable per draw
GAME.mulberry32 = function (seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
