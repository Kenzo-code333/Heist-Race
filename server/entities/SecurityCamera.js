// ============================================================================
// server/entities/SecurityCamera.js
// ----------------------------------------------------------------------------
// A ceiling camera that sweeps left and right. While it sees a thief, the
// building's alarm rises quickly and the nearest guard is sent to look.
// ============================================================================

import { CAMERA } from '../../shared/constants.js';
import { hasLineOfSight, inViewCone } from '../../shared/sight.js';

export class SecurityCamera {
  constructor(def) {
    this.id = def.id;
    this.x = def.x;
    this.z = def.z;
    this.baseYaw = def.yaw;
    this.sweep = def.sweep;
    this.facing = def.yaw;
    this.seeing = false;      // sees a thief right now?
    this.disabledUntil = 0;   // jammed (Milestone 7)
    this.callTimer = 0;
  }

  update(dt, match) {
    // Smooth back-and-forth sweep (a sine wave over time).
    this.facing = this.baseYaw + Math.sin((match.time / CAMERA.sweepPeriod) * Math.PI * 2) * this.sweep;
    this.seeing = false;
    if (match.time < this.disabledUntil) return;

    const range = match.cameraRangeAt(this.x, this.z);
    if (range <= 0) return; // lights out in this room: the camera sees nothing
    for (const thief of match.thieves.values()) {
      if (!thief.isTargetable(match.time)) continue;
      if (!inViewCone(this.x, this.z, this.facing, thief.x, thief.z, range, CAMERA.halfAngle)) continue;
      if (!hasLineOfSight(this.x, this.z, thief.x, thief.z, match.visionBlockersFor(thief.crouching))) continue;
      this.seeing = true;
      // Every 2 seconds while it sees someone, call the nearest guard over.
      this.callTimer -= dt;
      if (this.callTimer <= 0) {
        this.callTimer = 2;
        match.callNearestGuard(thief.x, thief.z);
        thief.events.push({ type: 'camera' });
      }
      break;
    }
    if (!this.seeing) this.callTimer = 0;
  }

  publicState(time) {
    return { id: this.id, f: Math.round(this.facing * 100) / 100, on: this.seeing, off: time < this.disabledUntil };
  }
}
