// ============================================================================
// client/src/ui/Planning.js
// ----------------------------------------------------------------------------
// The 60-second planning screen: a blueprint with PARTIAL information (rooms,
// exits and rumours of what's inside — no guards, no exact loot), a choice of
// entry point and two gadgets, and a Ready button. Every change is sent to the
// server, which keeps the choices secret from the other players.
// ============================================================================

import { BlueprintPainter } from './Blueprint.js';
import { ENTRY_POINTS, EXITS } from '../../../shared/map.js';
import { GADGETS, GADGET_SLOTS } from '../../../shared/constants.js';

const $ = (id) => document.getElementById(id);

// Rumours written on the blueprint (partial info).
const HINTS = { office: 'safe?', gallery: 'art · camera', vaultRoom: 'VAULT · safe?', corridor: 'patrols', storage: 'loading dock' };

export class Planning {
  /** @param {object} network - Network instance */
  constructor(network) {
    this.network = network;
    this.painter = new BlueprintPainter($('plan-map'));
    this.choice = { entry: 'main', gadgets: [], ready: false };

    $('plan-ready').addEventListener('click', () => this.network.socket.emit('plan:ready'));
    // Clicking near an exit on the map selects that entry point.
    $('plan-map').addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * e.target.width;
      const py = ((e.clientY - rect.top) / rect.height) * e.target.height;
      const [x, z] = this.painter.toWorld(px, py);
      const nearest = EXITS.map((ex) => ({ ex, d: Math.hypot(ex.x - x, ex.z - z) })).sort((a, b) => a.d - b.d)[0];
      if (nearest.d < 2.5) this.pickEntry(nearest.ex.id);
    });
  }

  pickEntry(id) {
    if (this.choice.ready) return;
    const entry = ENTRY_POINTS.find((e) => e.id === id);
    if (entry.requires && !this.choice.gadgets.includes(entry.requires)) return;
    this.send({ entry: id, gadgets: this.choice.gadgets });
  }

  toggleGadget(type) {
    if (this.choice.ready) return;
    let gadgets = [...this.choice.gadgets];
    if (gadgets.includes(type)) gadgets = gadgets.filter((g) => g !== type);
    else if (gadgets.length < GADGET_SLOTS) gadgets.push(type);
    else gadgets = [gadgets[1], type]; // replace the oldest pick
    this.send({ entry: this.choice.entry, gadgets });
  }

  send(choice) {
    this.network.socket.emit('plan:choose', choice);
  }

  /** Server sent our current plan + countdown. */
  update(state) {
    this.choice = state.you;
    $('plan-timer').textContent = state.timeLeft;
    $('plan-status').textContent = `${state.readyCount} / ${state.total} thieves ready`;
    $('plan-ready').disabled = this.choice.ready;
    $('plan-ready').textContent = this.choice.ready ? 'Ready — waiting for the others…' : "I'm ready";
    $('plan-gadget-count').textContent = `(${this.choice.gadgets.length}/${GADGET_SLOTS})`;
    this.renderEntries();
    this.renderGadgets();
    this.drawMap();
  }

  renderEntries() {
    const list = $('plan-entries');
    list.innerHTML = '';
    for (const entry of ENTRY_POINTS) {
      const button = document.createElement('button');
      button.className = `plan-option${entry.id === this.choice.entry ? ' selected' : ''}`;
      button.disabled = this.choice.ready || (entry.requires && !this.choice.gadgets.includes(entry.requires));
      button.textContent = entry.name;
      const small = document.createElement('small');
      small.textContent = entry.hint;
      button.appendChild(small);
      button.addEventListener('click', () => this.pickEntry(entry.id));
      list.appendChild(button);
    }
  }

  renderGadgets() {
    const list = $('plan-gadgets');
    list.innerHTML = '';
    for (const [type, gadget] of Object.entries(GADGETS)) {
      const button = document.createElement('button');
      button.className = `plan-option${this.choice.gadgets.includes(type) ? ' selected' : ''}`;
      button.disabled = this.choice.ready;
      button.textContent = `${gadget.name}${gadget.active ? '' : ' (passive)'}`;
      const small = document.createElement('small');
      small.textContent = gadget.desc;
      button.appendChild(small);
      button.addEventListener('click', () => this.toggleGadget(type));
      list.appendChild(button);
    }
  }

  drawMap() {
    this.painter.drawBase({ hints: HINTS });
    this.painter.drawDoors();
    this.painter.drawExits({
      selectedId: this.choice.entry,
      available: (exit) => !exit.requires || this.choice.gadgets.includes(exit.requires),
      labels: true,
    });
  }
}
