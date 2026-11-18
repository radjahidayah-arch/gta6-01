// Keyboard and pointer input. Held keys are read every frame; one-shot presses
// (confirm, pause, enter car, punch, mute) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice.
// Mouse position is kept in canvas (screen) pixels for aiming; clicks are queued.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_SHOOT = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || HANDBRAKE.has(event.code) || CONFIRM.has(event.code) || PAUSE.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    if (event.button === 0) actions |= ACTION_SHOOT;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  const has = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    mouse,
    /** -1/0/1 forward (W/S or Up/Down). */
    throttle() {
      return (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0);
    },
    /** -1/0/1 steering (A/D or Left/Right). */
    steer() {
      return (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
    },
    sprint() {
      return has(SPRINT);
    },
    handbrake() {
      return has(HANDBRAKE);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
