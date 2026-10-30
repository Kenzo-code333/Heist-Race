// ============================================================================
// shared/sight.js
// ----------------------------------------------------------------------------
// LINE OF SIGHT on the 2D floor plan: "can point A see point B, or is a wall
// (or tall furniture) in the way?" Used by the server for guard vision and by
// the client to draw flashlight cones that stop at walls.
// ============================================================================

/**
 * Cast a ray from (x, z) in direction (dx, dz) (must be normalised) and return
 * the distance to the first box it hits, or maxDist if it hits nothing.
 * Uses the classic "slab" method: the ray is inside the box where it is
 * between both x-sides AND between both z-sides at the same time.
 */
export function raycast(x, z, dx, dz, maxDist, boxes) {
  let nearest = maxDist;
  for (const b of boxes) {
    let tMin = 0, tMax = nearest;
    // x slab
    if (Math.abs(dx) < 1e-9) {
      if (x < b.minX || x > b.maxX) continue;
    } else {
      let t1 = (b.minX - x) / dx, t2 = (b.maxX - x) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }
    // z slab
    if (Math.abs(dz) < 1e-9) {
      if (z < b.minZ || z > b.maxZ) continue;
    } else {
      let t1 = (b.minZ - z) / dz, t2 = (b.maxZ - z) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    }
    if (tMin < nearest) nearest = tMin;
  }
  return nearest;
}

/** True if nothing in `boxes` blocks the straight line between two points. */
export function hasLineOfSight(x1, z1, x2, z2, boxes) {
  const dist = Math.hypot(x2 - x1, z2 - z1);
  if (dist < 1e-6) return true;
  return raycast(x1, z1, (x2 - x1) / dist, (z2 - z1) / dist, dist, boxes) >= dist - 1e-6;
}

/**
 * Is a target inside a viewer's vision cone (ignoring walls)?
 * @param {number} facing - viewer heading (0 = looking towards -z)
 * @param {number} halfAngle - half the cone's opening angle, in radians
 */
export function inViewCone(viewerX, viewerZ, facing, targetX, targetZ, range, halfAngle) {
  const dx = targetX - viewerX, dz = targetZ - viewerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (dist < 1e-6) return true;
  const lookX = -Math.sin(facing), lookZ = -Math.cos(facing);
  const cos = (dx * lookX + dz * lookZ) / dist;
  return cos >= Math.cos(halfAngle);
}
