// ============================================================================
// client/src/ui/Hud.js
// ----------------------------------------------------------------------------
// The HUD (heads-up display) is plain HTML laid over the 3D view (see
// index.html + style.css). This class just updates its text and bars.
// ============================================================================

// What each movement mode shows: label and how many of the 3 noise bars light up.
const STANCES = {
  idle:   { label: 'STANDING', bars: 0 },
  crouch: { label: 'CROUCHED', bars: 0 },
  sneak:  { label: 'SNEAKING', bars: 0 },
  walk:   { label: 'WALKING',  bars: 1 },
  run:    { label: 'RUNNING',  bars: 3 },
};

export class Hud {
  constructor() {
    this.roomEl = document.getElementById('hud-room');
    this.stanceEl = document.getElementById('hud-stance-label');
    this.barsEl = document.getElementById('hud-stance-bars');
    this.serverDot = document.getElementById('hud-server-dot');
    this.serverText = document.getElementById('hud-server-text');
    this.root = document.getElementById('hud');
    this.centerEl = document.getElementById('hud-center');
    this.toastEl = document.getElementById('hud-toast');
    this.toastTimer = null;
    this.last = {}; // only touch the page when something changed (cheaper)
  }

  setRoom(name) {
    if (this.last.room === name) return;
    this.last.room = name;
    this.roomEl.textContent = name;
  }

  /** @param {string} moveMode - idle | sneak | walk | run  @param {boolean} crouching */
  setStance(moveMode, crouching) {
    const key = moveMode === 'idle' && crouching ? 'crouch' : moveMode;
    if (this.last.stance === key) return;
    this.last.stance = key;
    const stance = STANCES[key];
    this.stanceEl.textContent = stance.label;
    [...this.barsEl.children].forEach((bar, i) => bar.classList.toggle('on', i < stance.bars));
    this.barsEl.classList.toggle('loud', stance.bars >= 3);
  }

  setServerStatus(online) {
    this.serverDot.className = `dot ${online ? 'online' : 'offline'}`;
    this.serverText.textContent = online ? 'Server: online' : 'Server: offline';
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.setDanger(false);
  }

  /** Big text in the middle of the screen ('' to clear). */
  setCenter(text) {
    if (this.last.center === text) return;
    this.last.center = text;
    this.centerEl.textContent = text;
  }

  /** A short message near the top that fades after a few seconds. */
  toast(text, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  /** Red pulsing screen edges while a guard is chasing you. */
  setDanger(on) {
    if (this.last.danger === on) return;
    this.last.danger = on;
    document.body.classList.toggle('danger', on);
  }
}
