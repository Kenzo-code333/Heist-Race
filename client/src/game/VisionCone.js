// ============================================================================
// client/src/game/VisionCone.js
// ----------------------------------------------------------------------------
// The visible "flashlight cone" on the floor in front of a guard (or camera).
// Every frame we cast a fan of rays from the guard; each ray stops at the first
// wall it hits. Joining the hit points gives the exact area the guard can see,
// drawn as a translucent shape that fades with distance.
// ============================================================================

import * as THREE from 'three';
import { raycast } from '../../../shared/sight.js';

const RAYS = 40;

export class VisionCone {
  /**
   * @param {number} range - metres
   * @param {number} halfAngle - radians
   * @param {Array} blockers - boxes that stop the rays (walls, tall furniture)
   */
  constructor(range, halfAngle, blockers) {
    this.range = range;
    this.halfAngle = halfAngle;
    this.blockers = blockers;

    // A "fan" of triangles: vertex 0 is the guard, then one vertex per ray.
    const positions = new Float32Array((RAYS + 2) * 3);
    const colors = new Float32Array((RAYS + 2) * 4); // r, g, b, alpha per vertex
    const indices = [];
    for (let i = 1; i <= RAYS; i++) indices.push(0, i, i + 1);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.geometry.setIndex(indices);

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; // shape changes every frame
    this.mesh.renderOrder = 1;
    this.color = new THREE.Color(0xfff0b0);
  }

  setColor(hex) {
    this.color.setHex(hex);
  }

  /** Rebuild the shape for a viewer at (x, z) facing `facing`. */
  update(x, z, facing, range = this.range) {
    const pos = this.geometry.attributes.position;
    const col = this.geometry.attributes.color;
    const y = 0.03; // just above the floor
    pos.setXYZ(0, x, y, z);
    col.setXYZW(0, this.color.r, this.color.g, this.color.b, 0.28);
    for (let i = 0; i <= RAYS; i++) {
      const angle = facing - this.halfAngle + (2 * this.halfAngle * i) / RAYS;
      const dx = -Math.sin(angle), dz = -Math.cos(angle);
      const dist = raycast(x, z, dx, dz, range, this.blockers);
      pos.setXYZ(i + 1, x + dx * dist, y, z + dz * dist);
      // Fade out towards the far end of the cone.
      const fade = 0.28 * (1 - dist / range) + 0.02;
      col.setXYZW(i + 1, this.color.r, this.color.g, this.color.b, fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
