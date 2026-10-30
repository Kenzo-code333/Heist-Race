// ============================================================================
// client/src/game/CharacterModel.js
// ----------------------------------------------------------------------------
// A 3D character (thief or guard), built from simple shapes arranged as a
// little "skeleton" of joints (hips, knees, ankles, shoulders, elbows).
// Animating = rotating those joints a bit every frame.
//
//   root (on the floor, turns to face the movement direction)
//    └─ body (tips over when knocked out)
//        └─ pelvis (moves down when crouching)
//            ├─ left/right hip → thigh → knee → shin → ankle → shoe
//            └─ torso (leans forward when crouching/running)
//                ├─ jacket, backpack (thief) / badge (guard), neck, head
//                └─ left/right shoulder → upper arm → elbow → forearm + hand
//
// The front of a character faces -z in its own space, matching the camera's
// convention (yaw = 0 looks towards -z).
// ============================================================================

import * as THREE from 'three';
import { mesh, cylinderMesh, roundedBoxGeo } from './geometry.js';

const HIP_HEIGHT = 0.92;   // standing hip height (m)
const THIGH = 0.44;        // thigh length
const SHIN = 0.44;         // shin length
const ANKLE = 0.04;        // ankle height above the floor (sole thickness)
const CROUCH_HIP = 0.58;   // hip height when crouched

// Material names for each outfit (see materials.js).
const OUTFITS = {
  thief: { jacket: 'thiefJacket', pants: 'thiefPants', head: 'thiefKnit', shoe: 'thiefShoe', hand: 'thiefGlove' },
  guard: { jacket: 'guardShirt', pants: 'guardPants', head: 'skin', shoe: 'thiefShoe', hand: 'skin' },
};

// A capsule (pill shape) hanging DOWN from a joint, `length` long overall.
function limb(radius, length, material, parent) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 12);
  geo.translate(0, -length / 2, 0); // hang from the top end
  return mesh(geo, material, [0, 0, 0], parent);
}

export class CharacterModel {
  /**
   * @param {object} options
   * @param {'thief'|'guard'} options.outfit
   * @param {number} [options.accentColor] - thief's player colour (armband + straps)
   */
  constructor({ outfit = 'thief', accentColor = 0xe8b04a } = {}) {
    this.outfit = outfit;
    const o = OUTFITS[outfit];
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.walkPhase = 0;       // where we are in the walk cycle (radians)
    this.crouchAmount = 0;    // 0 = standing, 1 = fully crouched (smoothed)
    this.koAmount = 0;        // 0 = upright, 1 = lying on the floor (smoothed)
    this.speedSmoothed = 0;   // smoothed movement speed for blending

    const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, emissive: accentColor, emissiveIntensity: 0.15 });

    // ---------------- Pelvis & legs ----------------
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = HIP_HEIGHT;
    this.body.add(this.pelvis);
    mesh(roundedBoxGeo(0.34, 0.16, 0.2, 0.06), o.pants, [0, 0, 0], this.pelvis);
    mesh(roundedBoxGeo(0.36, 0.05, 0.22, 0.02), 'thiefGlove', [0, 0.07, 0], this.pelvis); // belt
    if (outfit === 'guard') {
      mesh(roundedBoxGeo(0.06, 0.1, 0.05, 0.015), 'blackPlastic', [0.17, 0.04, 0.02], this.pelvis);  // radio
      mesh(roundedBoxGeo(0.05, 0.08, 0.06, 0.015), 'blackPlastic', [-0.17, 0.04, 0.02], this.pelvis); // pouch
    }

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, -0.04, 0);
      this.pelvis.add(hip);
      limb(0.075, THIGH, o.pants, hip);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      limb(0.06, SHIN, o.pants, knee);
      // Ankle joint keeps the shoe flat on the floor whatever the leg does.
      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);
      mesh(roundedBoxGeo(0.11, 0.08, 0.27, 0.035), o.shoe, [0, 0, -0.05], ankle); // toe points forward (-z)
      return { hip, knee, ankle };
    });

    // ---------------- Torso ----------------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.06;
    this.pelvis.add(this.torso);
    const jacket = mesh(new THREE.CapsuleGeometry(0.17, 0.28, 8, 16), o.jacket, [0, 0.27, 0], this.torso);
    jacket.scale.set(1.12, 1, 0.72);
    if (outfit === 'thief') {
      mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), 'chrome', [0, 0.27, -0.124], this.torso); // zip
      // Backpack (on the back = +z) with straps in the player's colour
      mesh(roundedBoxGeo(0.3, 0.38, 0.15, 0.05), 'thiefBag', [0, 0.3, 0.19], this.torso);
      mesh(roundedBoxGeo(0.24, 0.14, 0.06, 0.025), 'thiefBag', [0, 0.18, 0.28], this.torso);
      for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.36, 0.02), accent, [side * 0.09, 0.32, -0.125], this.torso);
    } else {
      mesh(new THREE.BoxGeometry(0.05, 0.06, 0.01), 'gold', [-0.09, 0.4, -0.125], this.torso);              // badge
      mesh(new THREE.BoxGeometry(0.008, 0.36, 0.01), 'blackPlastic', [0, 0.28, -0.124], this.torso);      // shirt buttons line
      for (const side of [-1, 1]) mesh(roundedBoxGeo(0.1, 0.03, 0.12, 0.01), o.jacket, [side * 0.17, 0.5, 0], this.torso); // epaulettes
    }

    // ---------------- Head ----------------
    cylinderMesh(0.055, 0.065, 0.1, o.head, [0, 0.56, 0], this.torso, 12); // neck
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    const skull = mesh(new THREE.SphereGeometry(0.12, 24, 18), o.head, [0, 0, 0], this.head);
    skull.scale.set(0.95, 1.08, 1.0);
    for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.012, 10, 8), 'eye', [side * 0.035, 0.02, -0.118], this.head);
    if (outfit === 'thief') {
      // Balaclava eye opening and a beanie
      mesh(roundedBoxGeo(0.15, 0.045, 0.05, 0.02), 'skin', [0, 0.02, -0.098], this.head);
      mesh(new THREE.SphereGeometry(0.128, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'thiefKnit', [0, 0.04, 0], this.head);
      cylinderMesh(0.13, 0.13, 0.05, 'thiefKnit', [0, 0.045, 0], this.head, 24);
    } else {
      // Hair, nose and a peaked security cap
      mesh(new THREE.SphereGeometry(0.124, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), 'hair', [0, 0.02, 0.01], this.head);
      mesh(roundedBoxGeo(0.03, 0.05, 0.04, 0.012), 'skin', [0, -0.01, -0.12], this.head);
      cylinderMesh(0.13, 0.135, 0.08, 'guardCap', [0, 0.09, 0], this.head, 24);
      const visor = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24, 1, false, Math.PI / 2, Math.PI), 'blackPlastic', [0, 0.055, -0.07], this.head);
      visor.rotation.x = 0.1;
      mesh(new THREE.BoxGeometry(0.04, 0.03, 0.01), 'gold', [0, 0.1, -0.135], this.head); // cap badge
    }

    // Dizzy stars shown when knocked out (hidden otherwise)
    this.stars = new THREE.Group();
    this.stars.position.y = 0.22;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      mesh(new THREE.OctahedronGeometry(0.035), 'dizzyStar', [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], this.stars).castShadow = false;
    }
    this.stars.visible = false;
    this.head.add(this.stars);

    // ---------------- Arms ----------------
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.23, 0.46, 0);
      this.torso.add(shoulder);
      limb(0.058, 0.3, o.jacket, shoulder);
      if (side === 1 && outfit === 'thief') mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), accent, [0, -0.12, 0], shoulder); // armband
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      limb(0.05, 0.27, o.jacket, elbow);
      mesh(new THREE.SphereGeometry(0.052, 12, 10), o.hand, [0, -0.29, 0], elbow);
      shoulder.rotation.z = side * 0.08; // arms slightly away from the body
      return { shoulder, elbow, side };
    });

    // Guards hold a flashlight in the right hand. `flashlightTip` marks where
    // the beam starts (the real light is added by GuardView).
    if (outfit === 'guard') {
      const hand = new THREE.Group();
      hand.position.set(0, -0.3, -0.02);
      this.arms[1].elbow.add(hand);
      const torch = cylinderMesh(0.022, 0.028, 0.2, 'blackPlastic', [0, 0, 0], hand, 12);
      torch.rotation.x = Math.PI / 2;
      const lens = cylinderMesh(0.03, 0.03, 0.01, 'flashLens', [0, 0, -0.105], hand, 16);
      lens.rotation.x = Math.PI / 2;
      lens.castShadow = false;
      this.flashlightTip = new THREE.Object3D();
      this.flashlightTip.position.set(0, 0, -0.12);
      hand.add(this.flashlightTip);
      this.flashlightHand = hand;
    }
  }

  /**
   * Animate the character for one frame.
   * @param {number} dt - seconds since last frame
   * @param {number} speed - current ground speed in m/s
   * @param {boolean} crouching
   * @param {boolean} [knockedOut]
   */
  update(dt, speed, crouching, knockedOut = false) {
    // Smooth transitions so the pose never "snaps".
    const blend = 1 - Math.exp(-dt * 10);
    this.crouchAmount += ((crouching && !knockedOut ? 1 : 0) - this.crouchAmount) * blend;
    this.koAmount += ((knockedOut ? 1 : 0) - this.koAmount) * (1 - Math.exp(-dt * 6));
    this.speedSmoothed += ((knockedOut ? 0 : speed) - this.speedSmoothed) * blend;
    const s = this.speedSmoothed;

    // Knocked out: tip over onto the back, stars spinning around the head.
    this.body.rotation.x = this.koAmount * (Math.PI / 2);
    this.body.position.y = this.koAmount * 0.14;
    this.stars.visible = this.koAmount > 0.5;
    if (this.stars.visible) this.stars.rotation.y += dt * 4;

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

    // Guards point the flashlight forward with the right arm.
    if (this.outfit === 'guard') {
      const right = this.arms[1];
      right.shoulder.rotation.x = 0.75 + Math.sin(phase) * 0.05;
      right.elbow.rotation.x = 0.75;
      // Keep the torch pointing forward, slightly down: cancel the arm angles.
      this.flashlightHand.rotation.x = -(right.shoulder.rotation.x + right.elbow.rotation.x) - 0.08;
    }
  }
}
