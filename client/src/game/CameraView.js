// ============================================================================
// client/src/game/CameraView.js
// ----------------------------------------------------------------------------
// A security camera as seen in the game: the camera body (turning with the
// server's sweep), a red vision cone on the floor and a blinking LED.
// ============================================================================

import * as THREE from 'three';
import { boxMesh, cylinderMesh } from './geometry.js';
import { VisionCone } from './VisionCone.js';
import { CAMERA } from '../../../shared/constants.js';
import { VISION_BLOCKERS_STANDING } from '../../../shared/map.js';

export class CameraView {
  constructor(scene, def) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(def.x, def.y, def.z);
    // Ceiling mount
    cylinderMesh(0.05, 0.05, 0.25, 'whitePaint', [0, 0.17, 0], this.group, 12);
    // Rotating head: front faces -z, like our characters
    this.head = new THREE.Group();
    this.group.add(this.head);
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.5; // looking down
    this.head.add(tilt);
    boxMesh(0.13, 0.11, 0.3, 'whitePaint', [0, 0, 0], tilt);
    boxMesh(0.15, 0.015, 0.34, 'whitePaint', [0, 0.065, -0.02], tilt); // sun hood
    const lens = cylinderMesh(0.035, 0.04, 0.04, 'blackPlastic', [0, 0, -0.16], tilt, 16);
    lens.rotation.x = Math.PI / 2;
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 3 }));
    this.led.position.set(0.045, 0.035, -0.15);
    tilt.add(this.led);
    scene.add(this.group);

    // Floor cone starting below the camera
    this.cone = new VisionCone(CAMERA.range, CAMERA.halfAngle, VISION_BLOCKERS_STANDING);
    this.cone.setColor(0xff5a5a);
    scene.add(this.cone.mesh);
    this.def = def;
  }

  /** @param {{f, on, off}} c - camera state from the snapshot */
  update(c, range = CAMERA.range) {
    this.head.rotation.y = c.f;
    const blink = Math.floor(performance.now() / (c.on ? 120 : 700)) % 2 === 0;
    this.led.material.emissiveIntensity = c.off ? 0 : blink ? 4 : 0.3;
    this.cone.mesh.visible = !c.off && range > 0;
    this.cone.setColor(c.on ? 0xff2a2a : 0xff8080);
    if (this.cone.mesh.visible) this.cone.update(this.def.x, this.def.z, c.f, range);
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.cone.mesh);
  }
}
