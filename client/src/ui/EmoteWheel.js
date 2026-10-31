// ============================================================================
// client/src/ui/EmoteWheel.js
// ----------------------------------------------------------------------------
// The chat wheel: hold Q, move the mouse towards a message, release Q to send.
// Messages are suggestions (alliances, warnings…) — the game never enforces
// them, so betrayal is always an option.
// ============================================================================

import { EMOTES } from '../../../shared/constants.js';

const RADIUS = 125;

export class EmoteWheel {
  constructor() {
    this.root = document.getElementById('wheel');
    this.items = EMOTES.map((emote, i) => {
      const angle = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2; // first item at the top
      const el = document.createElement('div');
      el.className = 'wheel-item';
      el.textContent = emote.text;
      el.style.left = `${180 + Math.cos(angle) * RADIUS}px`;
      el.style.top = `${180 + Math.sin(angle) * RADIUS}px`;
      this.root.appendChild(el);
      return { emote, angle, el };
    });
    this.active = false;
    this.pointer = { x: 0, y: 0 };
    this.selected = null;
  }

  openWheel() {
    this.active = true;
    this.pointer = { x: 0, y: 0 };
    this.selected = null;
    this.root.classList.remove('hidden');
    this.refresh();
  }

  /** Mouse movement while open moves an invisible pointer from the centre. */
  move(dx, dy) {
    this.pointer.x = Math.max(-200, Math.min(200, this.pointer.x + dx));
    this.pointer.y = Math.max(-200, Math.min(200, this.pointer.y + dy));
    if (Math.hypot(this.pointer.x, this.pointer.y) < 30) {
      this.selected = null;
    } else {
      const angle = Math.atan2(this.pointer.y, this.pointer.x);
      let best = null, bestDiff = Infinity;
      for (const item of this.items) {
        const diff = Math.abs(Math.atan2(Math.sin(angle - item.angle), Math.cos(angle - item.angle)));
        if (diff < bestDiff) { bestDiff = diff; best = item; }
      }
      this.selected = best;
    }
    this.refresh();
  }

  refresh() {
    for (const item of this.items) item.el.classList.toggle('selected', item === this.selected);
  }

  /** Close; returns the chosen emote id (or null if none). */
  closeWheel() {
    this.active = false;
    this.root.classList.add('hidden');
    return this.selected?.emote.id ?? null;
  }
}
