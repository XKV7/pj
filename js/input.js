// input.js — keyboard state tracking
(function () {
  const keys = {};
  const pressed = {}; // edge-triggered: true only on the frame a key went down

  const Input = {
    keys,
    pressed,
    left() { return keys["ArrowLeft"] || keys["KeyA"]; },
    right() { return keys["ArrowRight"] || keys["KeyD"]; },
    jumpHeld() { return keys["Space"]; },
    // edge helpers (consumed by game loop each frame)
    consume(code) {
      if (pressed[code]) { pressed[code] = false; return true; }
      return false;
    },
    clearFrame() { /* edges are consumed explicitly */ },
  };

  window.addEventListener("keydown", (e) => {
    // prevent page scroll on arrows / space
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (!keys[e.code]) pressed[e.code] = true; // only on initial press
    keys[e.code] = true;
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  window.GAME.Input = Input;
})();
