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
    this.onInteract = () => {};   // called with true (E pressed) / false (E released)
    this.onTablet = () => {};     // Tab pressed
    this.onWheel = () => {};      // Q pressed (true) / released (false)
    this.onGadget = () => {};     // 1 or 2 pressed (slot 0 or 1)
    this.onDragLook = () => {};   // pointer lock refused: switched to drag-look
    this.dragLook = false;
    this.interactDown = false;

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.setInteract(false);
      if (e.code === 'KeyQ' && this.wheelDown) { this.wheelDown = false; this.onWheel(false); }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.setInteract(false); }); // tab switched: release everything
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Drag-look mode (no pointer lock): only look while the left button is held.
      if (this.dragLook && !(e.buttons & 1)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockElement;
      if (this.locked) this.dragLook = false; // real mouse capture works after all
      if (!this.locked) { this.keys.clear(); this.setInteract(false); }
      this.onLockChange(this.locked);
    });
  }

  /**
   * Ask the browser to capture the mouse. Browsers only allow it right after
   * a click. Some embedded pages (like a preview inside Claude) refuse it even
   * then: in that case, after a real click, we switch to "drag-look": hold the
   * left mouse button and drag to look around.
   * @param {boolean} fromClick - true when called from a button click
   */
  requestLock(fromClick = false) {
    const refused = () => { if (fromClick) this.startDragLook(); };
    try {
      const result = this.lockElement.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(refused); // newer browsers return a Promise
    } catch {
      refused();
    }
    if (fromClick) document.addEventListener('pointerlockerror', refused, { once: true });
  }

  startDragLook() {
    if (this.dragLook && this.locked) return;
    this.dragLook = true;
    this.locked = true;
    this.onDragLook();
    this.onLockChange(true);
  }

  onKeyDown(e) {
    // Tab normally moves focus between page elements; here it opens the tablet.
    if (e.code === 'Tab') e.preventDefault();
    if (!this.locked) return;
    // In drag-look mode there is no browser "Esc releases the mouse": do it ourselves.
    if (e.code === 'Escape' && this.dragLook) {
      this.locked = false;
      this.keys.clear();
      this.setInteract(false);
      this.onLockChange(false);
      return;
    }
    if (e.code === 'Tab' && !e.repeat) this.onTablet();
    if (e.code === 'KeyQ' && !e.repeat) { this.wheelDown = true; this.onWheel(true); }
    if ((e.code === 'Digit1' || e.code === 'Digit2') && !e.repeat) this.onGadget(e.code === 'Digit1' ? 0 : 1);
    if (e.code === 'KeyC' && !e.repeat) this.crouchToggled = !this.crouchToggled;
    if (e.code === 'KeyE' && !e.repeat) this.setInteract(true);
    this.keys.add(e.code);
  }

  /** Report E presses/releases once (key repeat is ignored). */
  setInteract(down) {
    if (this.interactDown === down) return;
    this.interactDown = down;
    this.onInteract(down);
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
