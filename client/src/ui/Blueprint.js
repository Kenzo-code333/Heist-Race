// ============================================================================
// client/src/ui/Blueprint.js
// ----------------------------------------------------------------------------
// Draws the building as a 2D architectural "blueprint" on an HTML <canvas>.
// Used by the planning screen and by the in-game tablet (Tab).
//
// A canvas is a picture you draw on with commands like fillRect / arc / lineTo.
// The building is 30 m x 20 m; toPx() converts metres to canvas pixels.
// ============================================================================

import { ROOMS, WALLS, DOORS, OBSTACLES, EXITS } from '../../../shared/map.js';
import { CAMERA } from '../../../shared/constants.js';

const COLORS = {
  background: '#0b2340',
  grid: 'rgba(120,170,230,0.07)',
  room: 'rgba(120,170,230,0.06)',
  wall: '#cfe3ff',
  furniture: 'rgba(160,200,255,0.25)',
  label: 'rgba(190,220,255,0.55)',
  exit: '#3dff8a',
};

export class BlueprintPainter {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const pad = 24;
    this.scale = Math.min((canvas.width - pad * 2) / 30, (canvas.height - pad * 2) / 20);
    this.offsetX = (canvas.width - 30 * this.scale) / 2;
    this.offsetY = (canvas.height - 20 * this.scale) / 2;
  }

  /** Metres on the floor plan → canvas pixels. */
  toPx(x, z) {
    return [this.offsetX + x * this.scale, this.offsetY + z * this.scale];
  }

  /** Canvas pixels → metres (for mouse clicks). */
  toWorld(px, py) {
    return [(px - this.offsetX) / this.scale, (py - this.offsetY) / this.scale];
  }

  rect(minX, minZ, maxX, maxZ) {
    const [x, y] = this.toPx(minX, minZ);
    return [x, y, (maxX - minX) * this.scale, (maxZ - minZ) * this.scale];
  }

  /** Background, grid, rooms, furniture outlines, walls and room names. */
  drawBase({ hints = {} } = {}) {
    const { ctx, canvas } = this;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= 30; x++) { const [px] = this.toPx(x, 0); ctx.beginPath(); ctx.moveTo(px, this.offsetY); ctx.lineTo(px, this.offsetY + 20 * this.scale); ctx.stroke(); }
    for (let z = 0; z <= 20; z++) { const [, py] = this.toPx(0, z); ctx.beginPath(); ctx.moveTo(this.offsetX, py); ctx.lineTo(this.offsetX + 30 * this.scale, py); ctx.stroke(); }

    for (const room of ROOMS) {
      ctx.fillStyle = COLORS.room;
      ctx.fillRect(...this.rect(room.minX, room.minZ, room.maxX, room.maxZ));
    }
    ctx.strokeStyle = COLORS.furniture;
    for (const o of OBSTACLES) {
      if (o.type === 'entranceDoors') continue;
      ctx.strokeRect(...this.rect(o.x - o.w / 2, o.z - o.d / 2, o.x + o.w / 2, o.z + o.d / 2));
    }
    ctx.fillStyle = COLORS.wall;
    for (const w of WALLS) ctx.fillRect(...this.rect(w.minX, w.minZ, w.maxX, w.maxZ));

    ctx.font = `600 ${Math.round(this.scale * 0.55)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of ROOMS) {
      const [cx, cy] = this.toPx((room.minX + room.maxX) / 2, room.minZ + 1);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(room.name.toUpperCase(), cx, cy);
      if (hints[room.id]) {
        ctx.font = `${Math.round(this.scale * 0.45)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(232,176,74,0.8)';
        ctx.fillText(hints[room.id], cx, cy + this.scale * 0.7);
        ctx.font = `600 ${Math.round(this.scale * 0.55)}px "Segoe UI", system-ui, sans-serif`;
      }
    }
  }

  /** Doors as short lines: grey = closed, green = open, red = locked. */
  drawDoors(doorStates = {}) {
    const { ctx } = this;
    for (const door of DOORS) {
      const s = doorStates[door.id];
      const half = door.width / 2;
      ctx.strokeStyle = !s ? 'rgba(207,227,255,0.35)' : s.open ? '#30ff60' : s.locked ? '#ff4a3a' : '#cfe3ff';
      ctx.lineWidth = Math.max(2, this.scale * 0.15);
      ctx.beginPath();
      if (door.axis === 'x') { ctx.moveTo(...this.toPx(door.x - half, door.z)); ctx.lineTo(...this.toPx(door.x + half, door.z)); }
      else { ctx.moveTo(...this.toPx(door.x, door.z - half)); ctx.lineTo(...this.toPx(door.x, door.z + half)); }
      ctx.stroke();
    }
  }

  /** Exits / entry points. `selectedId` is drawn bigger; locked ones dashed. */
  drawExits({ selectedId = null, available = () => true, labels = false } = {}) {
    const { ctx } = this;
    for (const exit of EXITS) {
      const [px, py] = this.toPx(exit.x, exit.z);
      const ok = available(exit);
      const r = this.scale * (exit.id === selectedId ? 0.9 : 0.6);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = exit.id === selectedId ? 'rgba(61,255,138,0.35)' : 'rgba(61,255,138,0.12)';
      ctx.fill();
      ctx.setLineDash(ok ? [] : [4, 4]);
      ctx.strokeStyle = ok ? COLORS.exit : 'rgba(61,255,138,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      if (labels) {
        ctx.font = `600 ${Math.round(this.scale * 0.42)}px "Segoe UI", system-ui, sans-serif`;
        ctx.fillStyle = ok ? COLORS.exit : 'rgba(61,255,138,0.5)';
        const above = exit.z > 10 ? -1 : 1;
        ctx.fillText(exit.name, px + (exit.x < 2 ? this.scale * 2 : 0), py + above * this.scale * 1.3);
      }
    }
  }

  /** Grey-out unexplored / out-of-sight areas using the fog grid. */
  drawFog(fog) {
    const img = fog.overlayCanvas();
    const { ctx } = this;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, this.offsetX, this.offsetY, 30 * this.scale, 20 * this.scale);
    ctx.restore();
  }

  dot(x, z, radius, color, outline = null) {
    const { ctx } = this;
    const [px, py] = this.toPx(x, z);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke(); }
  }

  /** A filled wedge (vision cone) from (x, z) facing `facing`. */
  wedge(x, z, facing, range, halfAngle, color) {
    const { ctx } = this;
    const [px, py] = this.toPx(x, z);
    // Our facing: 0 = towards -z (up on the map). Canvas angle 0 = right.
    const centre = Math.atan2(-Math.cos(facing), -Math.sin(facing));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, range * this.scale, centre - halfAngle, centre + halfAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** A triangle pointing in the facing direction (the player). */
  arrow(x, z, facing, color) {
    const { ctx } = this;
    const [px, py] = this.toPx(x, z);
    const size = this.scale * 0.55;
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    ctx.beginPath();
    ctx.moveTo(px + fx * size * 1.3, py + fz * size * 1.3);
    ctx.lineTo(px - fz * size * 0.8 - fx * size * 0.6, py + fx * size * 0.8 - fz * size * 0.6);
    ctx.lineTo(px + fz * size * 0.8 - fx * size * 0.6, py - fx * size * 0.8 - fz * size * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ring(x, z, radius, color, alpha) {
    const { ctx } = this;
    const [px, py] = this.toPx(x, z);
    ctx.beginPath();
    ctx.arc(px, py, radius * this.scale, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  glyph(x, z, text, color) {
    const { ctx } = this;
    const [px, py] = this.toPx(x, z);
    ctx.font = `700 ${Math.round(this.scale * 0.6)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
  }

  /** Security cameras the player has spotted, with their current view. */
  drawCamera(def, facing, jammed) {
    if (!jammed) this.wedge(def.x, def.z, facing, CAMERA.range, CAMERA.halfAngle, 'rgba(255,80,80,0.18)');
    this.dot(def.x, def.z, this.scale * 0.25, jammed ? '#666' : '#ff5050');
  }
}
