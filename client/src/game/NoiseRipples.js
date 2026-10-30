// ============================================================================
// client/src/game/NoiseRipples.js
// ----------------------------------------------------------------------------
// Noises you hear show up as expanding rings on the floor where they happened.
// That's how you notice a rival running in the next room — or how loud you are.
// ============================================================================

import * as THREE from 'three';

const LIFETIME = 1.1; // seconds a ripple is visible

export class NoiseRipples {
  constructor(scene) {
    this.scene = scene;
    this.ripples = [];
    this.geometry = new THREE.RingGeometry(0.92, 1, 64);
    this.geometry.rotateX(-Math.PI / 2);
  }

  /** @param {'run'|'walk'|'noise'|string} kind - picks the colour */
  add(x, z, radius, kind) {
    const color = kind === 'run' || kind === 'loud' ? 0xff6a4a : kind === 'self' ? 0x9fc4ff : 0xffd27a;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(this.geometry, material);
    ring.position.set(x, 0.05, z);
    ring.renderOrder = 3;
    this.scene.add(ring);
    this.ripples.push({ ring, radius, age: 0 });
  }

  update(dt) {
    for (const r of this.ripples) {
      r.age += dt;
      const t = r.age / LIFETIME;
      const size = Math.max(0.05, r.radius * (0.15 + 0.85 * t));
      r.ring.scale.set(size, 1, size);
      r.ring.material.opacity = 0.8 * (1 - t);
    }
    // Remove finished ripples
    this.ripples = this.ripples.filter((r) => {
      if (r.age < LIFETIME) return true;
      this.scene.remove(r.ring);
      r.ring.material.dispose();
      return false;
    });
  }

  dispose() {
    for (const r of this.ripples) this.scene.remove(r.ring);
    this.ripples = [];
  }
}
