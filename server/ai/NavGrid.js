// ============================================================================
// server/ai/NavGrid.js
// ----------------------------------------------------------------------------
// PATHFINDING for guards. The floor plan is cut into a grid of small squares
// ("cells", 0.5 m). A cell is blocked if a guard standing in its centre would
// touch a wall or furniture. To go from A to B we run the A* ("A-star")
// algorithm: it explores cells outwards from A, always trying the most
// promising cell first (distance so far + straight-line distance left), until
// it reaches B. Then we "smooth" the path by skipping waypoints that can be
// reached in a straight line.
// ============================================================================

import { resolveCircleVsBoxes } from '../../shared/collision.js';

const CELL = 0.5;

export class NavGrid {
  /**
   * @param {Array} boxes - obstacles (walls + furniture)
   * @param {number} width - building size along x (m)
   * @param {number} depth - building size along z (m)
   * @param {number} agentRadius - how fat the walker is
   */
  constructor(boxes, width, depth, agentRadius) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(depth / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows); // 1 = blocked
    const r = agentRadius + 0.05;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const { x, z } = this.cellCentre(col, row);
        // If the collision code would push a circle here, the cell is blocked.
        const pushed = resolveCircleVsBoxes(x, z, r, boxes);
        if (Math.abs(pushed.x - x) > 1e-6 || Math.abs(pushed.z - z) > 1e-6) this.blocked[row * this.cols + col] = 1;
      }
    }
  }

  cellCentre(col, row) {
    return { x: (col + 0.5) * CELL, z: (row + 0.5) * CELL };
  }

  cellOf(x, z) {
    return {
      col: Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL))),
      row: Math.max(0, Math.min(this.rows - 1, Math.floor(z / CELL))),
    };
  }

  isFree(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows && !this.blocked[row * this.cols + col];
  }

  /** Nearest free cell to (x, z) — targets are often right next to a wall. */
  nearestFree(x, z) {
    const start = this.cellOf(x, z);
    if (this.isFree(start.col, start.row)) return start;
    for (let radius = 1; radius < 6; radius++) {
      let best = null, bestD = Infinity;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = start.col + dc, r = start.row + dr;
          if (!this.isFree(c, r)) continue;
          const p = this.cellCentre(c, r);
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < bestD) { bestD = d; best = { col: c, row: r }; }
        }
      }
      if (best) return best;
    }
    return start;
  }

  /**
   * Find a path from (x1, z1) to (x2, z2).
   * @returns {Array<{x, z}>} waypoints to walk through (empty if unreachable)
   */
  findPath(x1, z1, x2, z2) {
    const start = this.nearestFree(x1, z1);
    const goal = this.nearestFree(x2, z2);
    const key = (c, r) => r * this.cols + c;
    const goalKey = key(goal.col, goal.row);
    const heuristic = (c, r) => Math.hypot(c - goal.col, r - goal.row);

    // open = cells to explore. A simple array is fast enough for this map size.
    const open = [{ c: start.col, r: start.row, f: heuristic(start.col, start.row) }];
    const cameFrom = new Map();
    const cost = new Map([[key(start.col, start.row), 0]]);
    const closed = new Set();

    while (open.length > 0) {
      // Take the most promising cell (lowest f = cost so far + estimate left).
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIndex].f) bestIndex = i;
      const current = open.splice(bestIndex, 1)[0];
      const currentKey = key(current.c, current.r);
      if (currentKey === goalKey) return this.smooth(this.rebuild(cameFrom, currentKey), x1, z1, x2, z2);
      if (closed.has(currentKey)) continue;
      closed.add(currentKey);

      // Visit the 8 neighbours (diagonals only if both sides are free: no corner cutting).
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const c = current.c + dc, r = current.r + dr;
          if (!this.isFree(c, r)) continue;
          if (dc !== 0 && dr !== 0 && (!this.isFree(current.c + dc, current.r) || !this.isFree(current.c, current.r + dr))) continue;
          const k = key(c, r);
          if (closed.has(k)) continue;
          const newCost = cost.get(currentKey) + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
          if (newCost < (cost.get(k) ?? Infinity)) {
            cost.set(k, newCost);
            cameFrom.set(k, currentKey);
            open.push({ c, r, f: newCost + heuristic(c, r) });
          }
        }
      }
    }
    return []; // no path
  }

  rebuild(cameFrom, endKey) {
    const cells = [];
    let k = endKey;
    while (k !== undefined) {
      cells.push(this.cellCentre(k % this.cols, Math.floor(k / this.cols)));
      k = cameFrom.get(k);
    }
    return cells.reverse();
  }

  /** True if a straight walk between two points only crosses free cells. */
  walkable(x1, z1, x2, z2) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.ceil(dist / (CELL * 0.25));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const { col, row } = this.cellOf(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t);
      if (!this.isFree(col, row)) return false;
    }
    return true;
  }

  /** Remove unnecessary zig-zag points ("string pulling"). */
  smooth(cells, x1, z1, x2, z2) {
    const points = [...cells];
    // Replace the final cell centre by the exact goal if it is reachable.
    if (points.length && this.walkable(points[points.length - 1].x, points[points.length - 1].z, x2, z2)) {
      points[points.length - 1] = { x: x2, z: z2 };
    }
    const result = [];
    let from = { x: x1, z: z1 };
    let i = 0;
    while (i < points.length) {
      // Jump to the furthest point we can walk to in a straight line.
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.walkable(from.x, from.z, points[j].x, points[j].z)) { furthest = j; break; }
      }
      result.push(points[furthest]);
      from = points[furthest];
      i = furthest + 1;
    }
    return result;
  }
}
