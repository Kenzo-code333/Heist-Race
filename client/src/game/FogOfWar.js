// ============================================================================
// client/src/game/FogOfWar.js
// ----------------------------------------------------------------------------
// PERSONAL FOG OF WAR for the blueprint tablet. The floor is divided into
// 0.5 m cells, each in one of three states:
//   unknown   – never seen (dark on the tablet)
//   explored  – seen before, not right now (dim: you see what you REMEMBER)
//   visible   – in your line of sight right now (bright, live information)
//
// Several times per second we cast rays all around the thief; every cell a
// ray passes through before hitting a wall becomes visible. The fog also
// remembers what you saw: loot positions, door states, cameras, dark rooms.
// ============================================================================

import { raycast } from '../../../shared/sight.js';
import { SECURITY_CAMERAS, ROOMS, DOORS } from '../../../shared/map.js';

const CELL = 0.5;
const COLS = 60, ROWS = 40;   // 30 m x 20 m
const RAYS = 200;
const RANGE = 16;

export class FogOfWar {
  constructor() {
    this.explored = new Uint8Array(COLS * ROWS);
    this.visible = new Uint8Array(COLS * ROWS);
    this.timer = 0;
    // Memory of things seen
    this.loot = new Map();       // id -> { x, z, type }
    this.doors = {};             // id -> { open, locked }
    this.cameras = new Set();    // camera ids spotted
    this.darkRooms = new Set();  // rooms known to be dark
    // Small canvas: one pixel per cell, scaled up when drawn (smooth edges)
    this.canvas = document.createElement('canvas');
    this.canvas.width = COLS;
    this.canvas.height = ROWS;
    this.image = this.canvas.getContext('2d').createImageData(COLS, ROWS);
  }

  cellIndex(x, z) {
    const c = Math.floor(x / CELL), r = Math.floor(z / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    return r * COLS + c;
  }

  isVisible(x, z) {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.visible[i] === 1;
  }

  isExplored(x, z) {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.explored[i] === 1;
  }

  /**
   * Recompute what is visible from (x, z) (a few times per second is enough).
   * @param {Array} blockers - walls and closed doors (you can see over furniture)
   */
  update(dt, x, z, blockers, world) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;

    this.visible.fill(0);
    for (let i = 0; i < RAYS; i++) {
      const angle = (i / RAYS) * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const dist = raycast(x, z, dx, dz, RANGE, blockers);
      for (let d = 0; d <= dist + 0.3; d += CELL * 0.6) {
        const idx = this.cellIndex(x + dx * Math.min(d, dist + 0.25), z + dz * Math.min(d, dist + 0.25));
        if (idx >= 0) { this.visible[idx] = 1; this.explored[idx] = 1; }
      }
    }
    this.remember(world);
  }

  /** Update memories for everything currently in sight. */
  remember({ loot, doors, darkRooms }) {
    const present = new Set();
    for (const item of loot) {
      present.add(item.id);
      if (this.isVisible(item.x, item.z)) this.loot.set(item.id, { x: item.x, z: item.z, type: item.type });
    }
    // Remembered loot that is now visibly gone (someone took it)
    for (const [id, item] of this.loot) {
      if (!present.has(id) && this.isVisible(item.x, item.z)) this.loot.delete(id);
    }
    // A door is "seen" if either side of it is in sight.
    for (const door of DOORS) {
      const nx = door.axis === 'z' ? 0.3 : 0, nz = door.axis === 'x' ? 0.3 : 0;
      if (doors[door.id] && (this.isVisible(door.x + nx, door.z + nz) || this.isVisible(door.x - nx, door.z - nz))) {
        this.doors[door.id] = { ...doors[door.id] };
      }
    }
    for (const cam of SECURITY_CAMERAS) if (this.isVisible(cam.x - 0.4, cam.z + 0.4) || this.isVisible(cam.x, cam.z)) this.cameras.add(cam.id);
    for (const room of ROOMS) {
      const cx = (room.minX + room.maxX) / 2, cz = (room.minZ + room.maxZ) / 2;
      if (this.isVisible(cx, cz)) {
        if (darkRooms.has(room.id)) this.darkRooms.add(room.id);
        else this.darkRooms.delete(room.id);
      }
    }
  }

  /** The fog as a tiny image: transparent where visible, dark elsewhere. */
  overlayCanvas() {
    const data = this.image.data;
    for (let i = 0; i < COLS * ROWS; i++) {
      const alpha = this.visible[i] ? 0 : this.explored[i] ? 130 : 225;
      data[i * 4] = 4; data[i * 4 + 1] = 10; data[i * 4 + 2] = 22; data[i * 4 + 3] = alpha;
    }
    this.canvas.getContext('2d').putImageData(this.image, 0, 0);
    return this.canvas;
  }
}
