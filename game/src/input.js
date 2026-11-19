// Keyboard and mouse input. Held keys give movement and driving; one-shot
// presses (enter a car, punch, pause, mute) are queued as flags and taken once
// by the loop, so a press between two frames is never lost and never counted
// twice. The mouse aims the pistol: the loop turns its screen position into a
// world position through the renderer's projection.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RADIO = 8;
export const ACTION_HORN = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const MUTE = new Set(['KeyM']);
const RADIO = new Set(['KeyR']);
const HORN = new Set(['KeyH']);
const WEAPON = new Set(['KeyQ']);

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;
  let interactPressed = false;
  let punchPressed = false;
  let hornPressed = false;
  let weaponPressed = false;

  function isDown(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      keys.add(event.code);
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (INTERACT.has(event.code)) {
      keys.add(event.code);
      interactPressed = true;
      event.preventDefault();
    } else if (PUNCH.has(event.code)) {
      punchPressed = true;
      event.preventDefault();
    } else if (RADIO.has(event.code)) {
      actions |= ACTION_RADIO;
      event.preventDefault();
    } else if (HORN.has(event.code)) {
      hornPressed = true;
      event.preventDefault();
    } else if (WEAPON.has(event.code)) {
      weaponPressed = true;
      event.preventDefault();
    } else if (RUN.has(event.code) || MUTE.has(event.code)) {
      keys.add(event.code);
      if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Whether a key is held down right now, by its code (for the pause screen's S). */
    isKeyDown(code) {
      return keys.has(code);
    },
    /**
     * The per-frame snapshot. `toWorld` turns a screen point into a world point (the
     * renderer owns that maths); `inCar` decides whether the keys drive or walk.
     */
    snapshot(toWorld, inCar) {
      const moveX = (isDown(RIGHT) ? 1 : 0) - (isDown(LEFT) ? 1 : 0);
      const moveY = (isDown(DOWN) ? 1 : 0) - (isDown(UP) ? 1 : 0);
      const aim = toWorld(mouse.x, mouse.y);
      const snap = {
        moveX, moveY,
        run: isDown(RUN),
        steer: moveX,
        throttle: isDown(UP) ? 1 : 0,
        brake: (isDown(DOWN) ? 1 : 0) || (isDown(CONFIRM) && inCar ? 1 : 0),
        interact: interactPressed,
        interactHeld: isDown(INTERACT),
        punch: punchPressed,
        horn: hornPressed,
        weapon: weaponPressed,
        shoot: mouse.down,
        aimX: aim.x,
        aimY: aim.y,
      };
      interactPressed = false;
      punchPressed = false;
      hornPressed = false;
      weaponPressed = false;
      return snap;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
