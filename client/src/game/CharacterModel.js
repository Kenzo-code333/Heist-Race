// ============================================================================
// client/src/game/CharacterModel.js
// ----------------------------------------------------------------------------
// A 3D character (thief or guard), using Kenney's cartoon character model
// (MIT license, see client/src/assets/kenney/LICENSE.md) with its built-in
// "idle" and "walk" animations.
//
//   root (on the floor, turns to face the movement direction)
//    ├─ blob shadow (a soft dark disc: much cheaper than real shadows)
//    └─ body (squashes when crouching, tips over when knocked out)
//        └─ the Kenney model + accessories (mask, beanie, cap, flashlight…)
//
// Thieves are tinted in their player colour; guards are dark blue with a cap
// and a flashlight. The front of a character faces -z (same as the camera).
//
// The model file is loaded ONCE at start-up by loadCharacterAssets(); every
// character then makes a cheap copy of it.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mesh, cylinderMesh } from './geometry.js';
import { getMaterial, toonify } from './materials.js';
import { buildProp } from './props.js';
import characterUrl from '../assets/kenney/character.glb?url';
import colormapUrl from '../assets/kenney/colormap.png?url';

const MODEL_SCALE = 1.45; // the model is ~1.1 m tall; this makes it ~1.6 m

let template = null; // { scene, clips, colormap } once loaded

/** Turn a file address into raw bytes. Works for normal URLs and "data:" URLs. */
async function loadBytes(url) {
  if (url.startsWith('data:')) {
    const base64 = url.slice(url.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return (await fetch(url)).arrayBuffer();
}

/** Load the character model and its colour palette (call once before a match). */
export async function loadCharacterAssets() {
  if (template) return;
  const [gltf, colormap] = await Promise.all([
    loadBytes(characterUrl).then((bytes) => new GLTFLoader().parseAsync(bytes, '')),
    new THREE.TextureLoader().loadAsync(colormapUrl),
  ]);
  colormap.colorSpace = THREE.SRGBColorSpace;
  colormap.flipY = false; // glTF models expect textures not flipped
  colormap.magFilter = THREE.NearestFilter; // palette texture: keep colours crisp
  template = { scene: gltf.scene, clips: gltf.animations, colormap };
}

// A soft round shadow texture, shared by all characters.
let shadowTexture = null;
function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}

export class CharacterModel {
  /**
   * @param {object} options
   * @param {'thief'|'guard'} options.outfit
   * @param {number} [options.accentColor] - thief's player colour
   */
  constructor({ outfit = 'thief', accentColor = 0xe8b04a } = {}) {
    if (!template) throw new Error('Call loadCharacterAssets() before creating characters');
    this.outfit = outfit;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.crouchAmount = 0;    // 0 = standing, 1 = crouched (smoothed)
    this.koAmount = 0;        // 0 = upright, 1 = lying down (smoothed)
    this.speedSmoothed = 0;

    // --- Blob shadow on the floor ---
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    shadow.scale.set(0.95, 0.95, 1);
    this.root.add(shadow);

    // --- The Kenney model (a copy of the loaded template) ---
    this.model = template.scene.clone(true);
    this.model.scale.setScalar(MODEL_SCALE);
    this.model.rotation.y = Math.PI; // the model faces +z; our characters face -z
    this.body.add(this.model);

    // One toon material per character, tinted: thieves in dark "night" clothes,
    // guards in uniform blue. (The player colour goes on the beanie and sack.)
    const tint = new THREE.Color(outfit === 'guard' ? 0x8aa4ff : 0x8b8d9c);
    const material = toonify(new THREE.MeshStandardMaterial({ map: template.colormap, color: tint }));
    this.nodes = {};
    this.model.traverse((node) => {
      this.nodes[node.name] = node;
      if (node.isMesh) node.material = material;
    });

    // --- Animations: blend "idle" and "walk" depending on speed ---
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (name) => template.clips.find((c) => c.name === name);
    this.idle = this.mixer.clipAction(clip('idle'));
    this.walk = this.mixer.clipAction(clip('walk'));
    this.idle.play();
    this.walk.play();
    this.walk.setEffectiveWeight(0);

    // --- Outfit accessories, attached to the torso (they move with it) ---
    const torso = this.nodes.torso;
    this.nodes.antenna.visible = false; // replaced by a beanie / cap
    // Accessory sizes are in the model's own units (it is scaled up by MODEL_SCALE).
    if (outfit === 'thief') {
      // Bandit mask: a black band at eye level with two eye holes, made of
      // three pieces with gaps where the eyes are, plus a strip above them.
      const maskY = 0.35, eyeX = 0.105, hole = 0.045;
      mesh(new THREE.BoxGeometry(0.31 - eyeX - hole, 0.1, 0.04), 'thiefKnit', [(0.31 + eyeX + hole) / 2, maskY, 0.33], torso);
      mesh(new THREE.BoxGeometry(0.31 - eyeX - hole, 0.1, 0.04), 'thiefKnit', [-(0.31 + eyeX + hole) / 2, maskY, 0.33], torso);
      mesh(new THREE.BoxGeometry((eyeX - hole) * 2, 0.1, 0.04), 'thiefKnit', [0, maskY, 0.33], torso);
      mesh(new THREE.BoxGeometry(0.62, 0.03, 0.04), 'thiefKnit', [0, maskY + 0.065, 0.33], torso);
      // Beanie and loot sack in the player's colour, so rivals are easy to tell apart
      const accent = new THREE.MeshToonMaterial({ color: accentColor });
      mesh(new THREE.SphereGeometry(0.27, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent, [0, 0.58, 0], torso); // beanie
      mesh(new THREE.TorusGeometry(0.27, 0.04, 8, 24), 'thiefKnit', [0, 0.6, 0], torso).rotation.x = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.06, 10, 8), accent, [0, 0.86, 0], torso);                        // pompom
      const sack = mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshToonMaterial({ color: 0x8a7350 }), [0, 0.3, -0.42], torso); // loot sack on the back
      sack.scale.set(1, 1.1, 0.8);
      mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 16), accent, [0, 0.52, -0.42], torso).rotation.x = Math.PI / 2; // tied with a coloured string
    } else {
      cylinderMesh(0.3, 0.31, 0.14, 'guardCap', [0, 0.66, 0], torso, 24);                          // cap
      const visor = mesh(new THREE.BoxGeometry(0.4, 0.03, 0.2), 'blackPlastic', [0, 0.6, 0.34], torso);
      visor.rotation.x = 0.15;
      mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), 'gold', [-0.15, 0.28, 0.34], torso);           // badge
      // Flashlight held forward at the right side
      const torch = cylinderMesh(0.045, 0.06, 0.32, 'blackPlastic', [-0.33, 0.2, 0.3], torso, 12);
      torch.rotation.x = Math.PI / 2;
      const lens = cylinderMesh(0.06, 0.06, 0.02, 'flashLens', [-0.33, 0.2, 0.47], torso, 16);
      lens.rotation.x = Math.PI / 2;
      // Where the real flashlight beam starts (GuardView adds the light). The
      // model is turned around, so its +z is our forward (-z) direction.
      this.flashlightTip = new THREE.Object3D();
      this.flashlightTip.position.set(-0.33, 0.2, 0.5);
      this.flashlightTip.rotation.y = Math.PI; // aim the light along our -z (forward)
      torso.add(this.flashlightTip);
    }

    // --- Dizzy stars shown when knocked out ---
    this.stars = new THREE.Group();
    this.stars.position.y = 1.35;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      mesh(new THREE.OctahedronGeometry(0.06), 'dizzyStar', [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], this.stars);
    }
    this.stars.visible = false;
    this.body.add(this.stars);
  }

  /**
   * Show carried loot: a painting strapped to the back, gold bars on the sack.
   * @param {number} paintingSeed - 0 = no painting
   * @param {number} goldCount
   */
  setCarrying(paintingSeed, goldCount) {
    if (this.outfit !== 'thief') return;
    if (paintingSeed !== (this.carriedSeed ?? 0)) {
      if (this.carriedPainting) this.body.remove(this.carriedPainting);
      this.carriedPainting = null;
      if (paintingSeed) {
        const art = buildProp('painting', { w: 0.8, h: 0.6, seed: paintingSeed });
        art.position.set(0, 0.85, 0.62); // on the back (+z), facing backwards
        art.rotation.z = 0.12;
        this.body.add(art);
        this.carriedPainting = art;
      }
      this.carriedSeed = paintingSeed;
    }
    if (goldCount !== (this.goldCount ?? 0)) {
      this.goldCount = goldCount;
      if (!this.goldGroup) {
        this.goldGroup = new THREE.Group();
        this.goldGroup.position.set(0, 0.95, 0.62);
        this.body.add(this.goldGroup);
      }
      this.goldGroup.clear();
      for (let i = 0; i < goldCount; i++) {
        const bar = mesh(new THREE.BoxGeometry(0.2, 0.07, 0.1), getMaterial('gold'), [(i - 1) * 0.1, i * 0.03, 0], this.goldGroup);
        bar.rotation.z = (i - 1) * 0.3;
      }
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
    const blend = 1 - Math.exp(-dt * 10);
    this.crouchAmount += ((crouching && !knockedOut ? 1 : 0) - this.crouchAmount) * blend;
    this.koAmount += ((knockedOut ? 1 : 0) - this.koAmount) * (1 - Math.exp(-dt * 6));
    this.speedSmoothed += ((knockedOut ? 0 : speed) - this.speedSmoothed) * blend;
    const s = this.speedSmoothed;

    // Walk animation fades in with speed and plays faster when running.
    const walkWeight = Math.min(1, s / 1.2);
    this.walk.setEffectiveWeight(walkWeight);
    this.idle.setEffectiveWeight(1 - walkWeight);
    this.walk.timeScale = Math.max(0.6, s / 2.2);
    this.mixer.update(dt);

    // Crouch: squash down and widen a little (cartoon style), lean forward.
    const c = this.crouchAmount;
    this.model.scale.set(MODEL_SCALE * (1 + 0.08 * c), MODEL_SCALE * (1 - 0.3 * c), MODEL_SCALE * (1 + 0.08 * c));
    this.model.rotation.x = -0.25 * c - Math.max(0, (s - 3) / 3) * 0.15; // lean into a run

    // Knocked out: tip over backwards, stars spinning above.
    this.body.rotation.x = this.koAmount * (Math.PI / 2);
    this.body.position.y = this.koAmount * 0.45;
    this.stars.visible = this.koAmount > 0.5;
    if (this.stars.visible) this.stars.rotation.y += dt * 4;
  }
}
