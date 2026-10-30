// ============================================================================
// shared/collision.js
// ----------------------------------------------------------------------------
// Collision on the 2D floor plan. The thief is a CIRCLE; walls and furniture
// are axis-aligned RECTANGLES ("boxes"). If the circle overlaps a box, we push
// the circle out along the shortest path. Used by client and server.
// ============================================================================

// Keep a value between min and max (like Python's max(lo, min(v, hi))).
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Push a circle out of any boxes it overlaps.
 * @param {number} x - circle centre x
 * @param {number} z - circle centre z
 * @param {number} radius - circle radius
 * @param {Array} boxes - list of { minX, maxX, minZ, maxZ }
 * @returns {{x: number, z: number}} corrected position
 */
export function resolveCircleVsBoxes(x, z, radius, boxes) {
  // Pushing out of one box can push us into another (e.g. in a corner),
  // so we repeat a few times until nothing overlaps.
  for (let iteration = 0; iteration < 4; iteration++) {
    let anyPush = false;

    for (const box of boxes) {
      // Closest point of the box to the circle centre.
      const closestX = clamp(x, box.minX, box.maxX);
      const closestZ = clamp(z, box.minZ, box.maxZ);
      const dx = x - closestX;
      const dz = z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq >= radius * radius) continue; // not touching this box

      if (distSq > 1e-12) {
        // Centre is outside the box: push straight away from the closest point.
        const dist = Math.sqrt(distSq);
        const push = (radius - dist) / dist;
        x += dx * push;
        z += dz * push;
      } else {
        // Centre is INSIDE the box (rare): exit through the nearest side.
        const toLeft = x - box.minX, toRight = box.maxX - x;
        const toTop = z - box.minZ, toBottom = box.maxZ - z;
        const smallest = Math.min(toLeft, toRight, toTop, toBottom);
        if (smallest === toLeft) x = box.minX - radius;
        else if (smallest === toRight) x = box.maxX + radius;
        else if (smallest === toTop) z = box.minZ - radius;
        else z = box.maxZ + radius;
      }
      anyPush = true;
    }

    if (!anyPush) break;
  }
  return { x, z };
}
