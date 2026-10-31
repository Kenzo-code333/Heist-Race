// ============================================================================
// client/src/game/ThirdPersonCamera.js
// ----------------------------------------------------------------------------
// Keeps the camera behind and slightly above the thief, over the right
// shoulder. The mouse controls two angles:
//   yaw   = turning left/right (around the vertical axis)
//   pitch = looking up/down
//
// Indoors, walls would often get between the camera and the thief. So every
// frame we cast an invisible ray ("raycast") from the thief's head towards the
// camera's ideal spot; if it hits a wall, the camera moves in closer.
// ============================================================================

import * as THREE from 'three';
import { WALL_HEIGHT } from '../../../shared/constants.js';

const DISTANCE = 4.0;          // ideal distance behind the thief (m)
const SHOULDER_OFFSET = 0.45;  // shift to the right, for an over-the-shoulder view
const HEAD_HEIGHT = 1.55;      // camera aims at this height when standing
const CROUCH_HEAD_HEIGHT = 1.05;
const MIN_PITCH = -0.45;       // looking up limit (radians)
const MAX_PITCH = 1.1;         // looking down limit
const WALL_PADDING = 0.2;      // stay this far in front of anything the ray hits

export class ThirdPersonCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Box3[]} blockers - boxes the camera can't pass through
   */
  constructor(camera, blockers) {
    this.camera = camera;
    this.blockers = blockers;
    this.yaw = 0;               // radians; 0 = looking towards -z
    this.pitch = 0.3;           // radians; positive = camera above, looking down
    this.headHeight = HEAD_HEIGHT;
    this.currentDistance = DISTANCE;
    this._ray = new THREE.Ray();
    this._hit = new THREE.Vector3();
  }

  /** Apply mouse movement (in pixels) to the view angles. */
  rotate(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sensitivity, MIN_PITCH, MAX_PITCH);
  }

  /** Distance along a ray to the nearest blocker, or maxDist if nothing is hit. */
  castRay(origin, direction, maxDist) {
    this._ray.set(origin, direction);
    let nearest = maxDist;
    for (const box of this.blockers) {
      if (box.containsPoint(origin)) continue; // ignore boxes we're inside
      if (this._ray.intersectBox(box, this._hit)) {
        const d = this._hit.distanceTo(origin);
        if (d < nearest) nearest = d;
      }
    }
    return nearest;
  }

  /**
   * Move the camera for this frame.
   * @param {number} dt - seconds since last frame
   * @param {{x: number, z: number}} target - thief position on the floor plan
   * @param {boolean} crouching
   */
  update(dt, target, crouching) {
    // Smoothly move the aim point down when crouching.
    const wantedHead = crouching ? CROUCH_HEAD_HEIGHT : HEAD_HEIGHT;
    this.headHeight += (wantedHead - this.headHeight) * (1 - Math.exp(-dt * 8));
    const head = new THREE.Vector3(target.x, this.headHeight, target.z);

    // Direction vectors for the current yaw.
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // 1) Shift to the shoulder (shorter if a wall is right next to us).
    const shoulderDist = this.castRay(head, right, SHOULDER_OFFSET + WALL_PADDING) - WALL_PADDING;
    const pivot = head.clone().addScaledVector(right, Math.max(0, shoulderDist));

    // 2) Direction from the pivot back to the camera (behind and above).
    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    // 3) Pull the camera in if something is in the way. Moving in is instant
    //    (never see through walls); moving back out is smooth.
    const free = this.castRay(pivot, back, DISTANCE + WALL_PADDING) - WALL_PADDING;
    const wanted = Math.max(0.3, Math.min(DISTANCE, free));
    if (wanted < this.currentDistance) this.currentDistance = wanted;
    else this.currentDistance += (wanted - this.currentDistance) * (1 - Math.exp(-dt * 4));

    const position = pivot.clone().addScaledVector(back, this.currentDistance);
    // Never go through the ceiling or the floor.
    position.y = THREE.MathUtils.clamp(position.y, 0.25, WALL_HEIGHT - 0.12);

    this.camera.position.copy(position);
    // Look past the pivot, in the direction of `-back`.
    this.camera.lookAt(pivot.clone().addScaledVector(back, -10));
  }
}
