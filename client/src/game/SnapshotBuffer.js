// ============================================================================
// client/src/game/SnapshotBuffer.js
// ----------------------------------------------------------------------------
// INTERPOLATION. The server only sends 20 snapshots per second, but we draw
// ~60 frames per second. If we just jumped other players to each new position
// they would stutter. Instead we keep the last few snapshots and draw the
// world slightly in the past (INTERPOLATION_DELAY = 100 ms), smoothly blending
// ("interpolating") between the two snapshots around that moment.
// ============================================================================

export class SnapshotBuffer {
  constructor(delaySeconds) {
    this.delay = delaySeconds * 1000;
    this.snapshots = []; // [{ time (ms, local clock), data }]
  }

  push(data) {
    this.snapshots.push({ time: performance.now(), data });
    // Keep only about one second of history.
    while (this.snapshots.length > 30) this.snapshots.shift();
  }

  /**
   * Find the two snapshots around (now - delay).
   * @returns {{ older, newer, alpha } | null} alpha = 0..1 blend between them
   */
  sample() {
    const n = this.snapshots.length;
    if (n === 0) return null;
    const renderTime = performance.now() - this.delay;
    for (let i = n - 1; i > 0; i--) {
      const older = this.snapshots[i - 1];
      const newer = this.snapshots[i];
      if (older.time <= renderTime) {
        const span = newer.time - older.time || 1;
        const alpha = Math.min(1, (renderTime - older.time) / span);
        return { older: older.data, newer: newer.data, alpha };
      }
    }
    const first = this.snapshots[0].data;
    return { older: first, newer: first, alpha: 0 };
  }
}

/** Blend between two angles the short way round. */
export function lerpAngle(a, b, t) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}
