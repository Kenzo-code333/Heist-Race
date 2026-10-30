// ============================================================================
// client/src/input/Input.js
// ----------------------------------------------------------------------------
// Reads the keyboard and mouse and turns them into a simple "input" object:
//   { forward, back, left, right, run, crouch }  (all true/false)
// plus accumulated mouse movement for the camera.
//
// We use `event.code` (the PHYSICAL key position), so WASD also works as
// ZQSD on a French AZERTY keyboard without any setting.
//
// "Pointer lock" hides the cursor and gives us raw mouse movement, like in any
// 3D game. The browser requires a click before it allows it.
// ============================================================================

export class Input {
  /** @param {HTMLElement} lockElement - element that captures the mouse */
  constructor(lockElement) {
    this.lockElement = lockElement;
    this.keys = new Set();      // physical keys currently held down
    this.crouchToggled = false; // C toggles crouch on/off
    this.mouseDX = 0;           // mouse movement since last frame (pixels)
    this.mouseDY = 0;
    this.locked = false;
    this.onLockChange = () => {}; // callback set by main.js

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear()); // tab switched: release everything
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockElement;
      if (!this.locked) this.keys.clear();
      this.onLockChange(this.locked);
    });
  }

  /** Ask the browser to capture the mouse (must be called from a click). */
  requestLock() {
    this.lockElement.requestPointerLock();
  }

  onKeyDown(e) {
    // Tab normally moves focus between page elements; reserve it for the
    // blueprint tablet (Milestone 7).
    if (e.code === 'Tab') e.preventDefault();
    if (!this.locked) return;
    if (e.code === 'KeyC' && !e.repeat) this.crouchToggled = !this.crouchToggled;
    this.keys.add(e.code);
  }

  /** Current movement intent as plain true/false flags. */
  getMovement() {
    const k = this.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      run: k.has('ShiftLeft') || k.has('ShiftRight'),
      crouch: this.crouchToggled,
    };
  }

  /** Return mouse movement since the last call, then reset it. */
  consumeMouse() {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return delta;
  }
}
