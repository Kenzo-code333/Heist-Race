// ============================================================================
// client/src/game/ThiefModel.js
// ----------------------------------------------------------------------------
// The 3D thief character, built from simple shapes arranged as a little
// "skeleton" of joints (hips, knees, shoulders, elbows). Animating the game
// character = rotating those joints a bit every frame.
//
//   root (on the floor, turns to face the movement direction)
//    └─ pelvis (moves down when crouching)
//        ├─ left/right hip → thigh → knee → shin + shoe
//        └─ torso (leans forward when crouching/running)
//            ├─ jacket, backpack, neck, head (balaclava + beanie)
//            └─ left/right shoulder → upper arm → elbow → forearm + glove
//
// The front of the thief faces -z in its own space, matching the camera's
// convention (yaw = 0 looks towards -z).
// ============================================================================

import * as THREE from 'three';
import { mesh, cylinderMesh, roundedBoxGeo } from './geometry.js';
import { getMaterial } from './materials.js';

const HIP_HEIGHT = 0.92;   // standing hip height (m)
const THIGH = 0.44;        // thigh length
const SHIN = 0.44;         // shin length
const ANKLE = 0.04;        // ankle height above the floor (sole thickness)
const CROUCH_HIP = 0.58;   // hip height when crouched

// A capsule (pill shape) hanging DOWN from a joint, `length` long overall.
function limb(radius, length, material, parent) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 12);
  geo.translate(0, -length / 2, 0); // hang from the top end
  return mesh(geo, material, [0, 0, 0], parent);
}

export class ThiefModel {
  /** @param {number} accentColor - player colour (armband + backpack strap) */
  constructor(accentColor = 0xe8b04a) {
    this.root = new THREE.Group();
    this.walkPhase = 0;       // where we are in the walk cycle (radians)
    this.crouchAmount = 0;    // 0 = standing, 1 = fully crouched (smoothed)
    this.speedSmoothed = 0;   // smoothed movement speed for blending

    const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, emissive: accentColor, emissiveIntensity: 0.15 });

    // ---------------- Pelvis & legs ----------------
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = HIP_HEIGHT;
    this.root.add(this.pelvis);
    mesh(roundedBoxGeo(0.34, 0.16, 0.2, 0.06), 'thiefPants', [0, 0, 0], this.pelvis);
    mesh(roundedBoxGeo(0.36, 0.05, 0.22, 0.02), 'thiefGlove', [0, 0.07, 0], this.pelvis); // belt

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, -0.04, 0);
      this.pelvis.add(hip);
      limb(0.075, THIGH, 'thiefPants', hip);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      limb(0.06, SHIN, 'thiefPants', knee);
      // Ankle joint keeps the shoe flat on the floor whatever the leg does.
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      mesh(roundedBoxGeo(0.11, 0.08, 0.27, 0.035), 'thiefShoe', [0, 0, -0.05], ankle); // toe points forward (-z)
      return { hip, knee, ankle };
    });

    // ---------------- Torso ----------------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.06;
    this.pelvis.add(this.torso);
    const jacket = mesh(new THREE.CapsuleGeometry(0.17, 0.28, 8, 16), 'thiefJacket', [0, 0.27, 0], this.torso);
    jacket.scale.set(1.12, 1, 0.72);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), 'chrome', [0, 0.27, -0.124], this.torso); // zip
    // Backpack (on the back = +z) with straps
    mesh(roundedBoxGeo(0.3, 0.38, 0.15, 0.05), 'thiefBag', [0, 0.3, 0.19], this.torso);
    mesh(roundedBoxGeo(0.24, 0.14, 0.06, 0.025), 'thiefBag', [0, 0.18, 0.28], this.torso);
    for (const side of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.04, 0.36, 0.02), accent, [side * 0.09, 0.32, -0.125], this.torso);
    }

    // ---------------- Head ----------------
    cylinderMesh(0.055, 0.065, 0.1, 'thiefKnit', [0, 0.56, 0], this.torso, 12); // neck
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.12, 24, 18), 'thiefKnit', [0, 0, 0], this.head);
    skull.scale.set(0.95, 1.08, 1.0);
    // Eye opening of the balaclava, with two eyes
    mesh(roundedBoxGeo(0.15, 0.045, 0.05, 0.02), 'skin', [0, 0.02, -0.098], this.head);
    for (const side of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.012, 10, 8), 'eye', [side * 0.035, 0.02, -0.122], this.head);
    }
    // Beanie: a dome with a folded rim
    mesh(new THREE.SphereGeometry(0.128, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'thiefKnit', [0, 0.04, 0], this.head);
    cylinderMesh(0.13, 0.13, 0.05, 'thiefKnit', [0, 0.045, 0], this.head, 24);

    // ---------------- Arms ----------------
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.23, 0.46, 0);
      this.torso.add(shoulder);
      limb(0.058, 0.3, 'thiefJacket', shoulder);
      if (side === 1) mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), accent, [0, -0.12, 0], shoulder); // armband
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      limb(0.05, 0.27, 'thiefJacket', elbow);
      mesh(new THREE.SphereGeometry(0.052, 12, 10), 'thiefGlove', [0, -0.29, 0], elbow);
      shoulder.rotation.z = side * 0.08; // arms slightly away from the body
      return { shoulder, elbow, side };
    });
  }

  /**
   * Animate the thief for one frame.
   * @param {number} dt - seconds since last frame
   * @param {number} speed - current ground speed in m/s
   * @param {boolean} crouching
   */
  update(dt, speed, crouching) {
    // Smooth transitions so the pose never "snaps".
    const blend = 1 - Math.exp(-dt * 10);
    this.crouchAmount += ((crouching ? 1 : 0) - this.crouchAmount) * blend;
    this.speedSmoothed += (speed - this.speedSmoothed) * blend;
    const s = this.speedSmoothed;

    // Walk cycle: phase advances with distance travelled (stride ~1.4 m).
    this.walkPhase += dt * s * (Math.PI * 2 / 1.4) * (crouching ? 1.5 : 1);
    const swingAmount = Math.min(1, s / 3) * (crouching ? 0.45 : 0.55) + Math.max(0, (s - 3) / 3) * 0.25;
    const phase = this.walkPhase;

    // --- Crouch: lower the hips and bend the knees so feet stay on the floor.
    // Simple trigonometry: two equal leg segments, foot below the hip.
    const hipY = THREE.MathUtils.lerp(HIP_HEIGHT, CROUCH_HIP, this.crouchAmount);
    const bob = Math.abs(Math.sin(phase)) * 0.03 * Math.min(1, s / 3);
    this.pelvis.position.y = hipY - bob;
    const legReach = Math.min(THIGH + SHIN, hipY - ANKLE); // vertical hip-to-ankle distance
    const kneeBend = Math.acos(Math.min(1, legReach / (THIGH + SHIN))); // angle of each segment

    // --- Legs: thigh swings forward/back, knee bends more on the back swing.
    for (const [i, leg] of this.legs.entries()) {
      const legPhase = phase + (i === 0 ? 0 : Math.PI);
      const swing = Math.sin(legPhase) * swingAmount;
      leg.hip.rotation.x = kneeBend + swing;  // positive x rotation = thigh forward (-z)
      const liftBend = Math.max(0, -Math.cos(legPhase)) * swingAmount * 1.2;
      leg.knee.rotation.x = -kneeBend * 2 - liftBend;
      // Undo the hip + knee angles so the foot stays level (slight toe-off when walking).
      leg.ankle.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x) + liftBend * 0.3;
    }

    // --- Torso: lean forward when crouching or running, slight breathing idle.
    const lean = this.crouchAmount * 0.45 + Math.max(0, (s - 3) / 3) * 0.22;
    this.torso.rotation.x = -lean; // negative = lean towards -z (forward)
    this.torso.position.y = 0.06 + Math.sin(performance.now() / 700) * 0.004;
    this.head.rotation.x = lean * 0.6; // keep looking ahead

    // --- Arms swing opposite to the legs; bent elbows when crouching.
    for (const arm of this.arms) {
      const armPhase = phase + (arm.side === -1 ? Math.PI : 0);
      // Positive x rotation = limb swings forward (-z).
      arm.shoulder.rotation.x = Math.sin(armPhase) * swingAmount * 0.9 + this.crouchAmount * 0.35;
      arm.elbow.rotation.x = 0.25 + this.crouchAmount * 0.8 + Math.max(0, Math.sin(armPhase)) * swingAmount * 0.6;
    }
  }
}
