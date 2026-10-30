// ============================================================================
// client/src/ui/Tablet.js
// ----------------------------------------------------------------------------
// The blueprint tablet (Tab). Shows the map with your personal fog of war:
// live things where you can see, remembered things where you've been, and
// noise ripples you heard. The game keeps running underneath.
// ============================================================================

import { BlueprintPainter } from './Blueprint.js';
import { SECURITY_CAMERAS, ROOMS } from '../../../shared/map.js';
import { GUARD } from '../../../shared/constants.js';

const LOOT_GLYPH = { cash: ['$', '#7ddc6a'], painting: ['▣', '#e8b04a'], gold: ['◆', '#ffd34a'] };

export class Tablet {
  constructor() {
    this.root = document.getElementById('tablet');
    this.painter = new BlueprintPainter(document.getElementById('tablet-map'));
    this.open = false;
    this.noises = []; // { x, z, r, kind, time }
  }

  toggle() {
    this.open = !this.open;
    this.root.classList.toggle('hidden', !this.open);
  }

  close() {
    this.open = false;
    this.root.classList.add('hidden');
  }

  addNoise(x, z, r, kind) {
    this.noises.push({ x, z, r, kind, time: performance.now() });
  }

  /**
   * Redraw (only while open).
   * @param {object} view - { me, fog, guards, others, cameras, roster, gadgets }
   */
  draw({ me, fog, guards, others, cameras, roster, gadgetTypes }) {
    if (!this.open) return;
    const p = this.painter;
    p.drawBase();

    // Rooms known to be dark: a hatch pattern
    for (const room of ROOMS) {
      if (!fog.darkRooms.has(room.id)) continue;
      p.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      p.ctx.fillRect(...p.rect(room.minX, room.minZ, room.maxX, room.maxZ));
    }

    p.drawDoors(fog.doors);
    p.drawExits({ available: (exit) => !exit.requires || gadgetTypes.includes(exit.requires), labels: true });

    // Remembered loot (live where visible)
    for (const item of fog.loot.values()) {
      const [glyph, color] = LOOT_GLYPH[item.type] ?? ['?', '#fff'];
      p.glyph(item.x, item.z, glyph, color);
    }

    // Cameras you've spotted (their sweep is only shown while you can see them)
    for (const def of SECURITY_CAMERAS) {
      if (!fog.cameras.has(def.id)) continue;
      const live = cameras.find((c) => c.id === def.id);
      p.drawCamera(def, live && fog.isVisible(def.x, def.z) ? live.f : def.yaw, live?.off);
    }

    // The fog itself, then live entities on top
    p.drawFog(fog);

    for (const g of guards) {
      if (!fog.isVisible(g.x, g.z) && !g.me) continue;
      p.wedge(g.x, g.z, g.f, 3, GUARD.visionHalfAngle, g.s === 'chase' ? 'rgba(255,60,40,0.35)' : 'rgba(255,240,170,0.25)');
      p.dot(g.x, g.z, p.scale * 0.32, '#ff5a3c', '#000');
    }
    for (const o of others) {
      const info = roster.get(o.id);
      p.dot(o.x, o.z, p.scale * 0.3, `#${(info?.color ?? 0xffffff).toString(16).padStart(6, '0')}`, '#000');
    }

    // Noise ripples heard in the last 2 seconds
    const now = performance.now();
    this.noises = this.noises.filter((n) => now - n.time < 2000);
    for (const n of this.noises) {
      const t = (now - n.time) / 2000;
      p.ring(n.x, n.z, n.r * (0.2 + 0.8 * t), n.kind === 'run' || n.kind === 'loud' ? '#ff6a4a' : '#ffd27a', 1 - t);
    }

    p.arrow(me.x, me.z, me.facing, '#ffffff');
  }
}
