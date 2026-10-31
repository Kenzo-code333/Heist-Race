// ============================================================================
// client/src/game/Renderer.js
// ----------------------------------------------------------------------------
// Sets up everything needed to DRAW the 3D world on screen:
//   - the WebGL renderer (talks to the graphics card)
//   - the scene (container for every 3D object) and the camera
//   - image quality features: soft shadows, realistic tone mapping,
//     environment reflections, ambient occlusion and bloom (glow).
//
// "Post-processing" = effects applied to the finished image, like filters:
//   GTAO  : darkens creases and corners where light can't reach (realism!)
//   Bloom : bright things (lamps, LEDs, signs) softly glow
// Switch them off in GRAPHICS below if the game runs slowly on your machine.
// ============================================================================

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setMaxAnisotropy } from './textures.js';

// Quality switches. The default is FAST: no shadow maps, no post-processing.
// From the address bar:
//   ?quality=low    → also lowers the resolution (weak laptops, the Claude preview)
//   ?quality=high   → adds ambient occlusion + glow (strong graphics cards)
//   ?ao=1 / ?bloom=1 → individual switches
const params = new URLSearchParams(window.location.search);
const quality = params.get('quality') ?? 'normal';
const flag = (name, fallback) => (params.has(name) ? params.get(name) !== '0' : fallback);
export const GRAPHICS = {
  ambientOcclusion: flag('ao', quality === 'high'),
  bloom: flag('bloom', quality === 'high'),
  // How many screen pixels per CSS pixel. High-DPI screens would otherwise make
  // the GPU draw up to 4x more pixels — the most common cause of low frame rates.
  maxPixelRatio: quality === 'low' ? 0.75 : quality === 'high' ? 2 : 1.25,
  antialias: quality !== 'low',
};

export class Renderer {
  /** @param {HTMLElement} container - the element the canvas goes into */
  constructor(container) {
    // --- The WebGL renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: GRAPHICS.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping squeezes bright and dark values into what a screen can show.
    // "Neutral" keeps the cartoon colours bright and saturated.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // No real-time shadow maps (they are expensive); characters get a cheap
    // "blob" shadow under their feet instead (see CharacterModel.js).
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // --- Scene and camera ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14121c);
    // field of view 65°, aspect ratio, near & far clipping distances (metres)
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 120);

    // --- Soft reflections for the few shiny materials (glass, gold) ---
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    // --- General soft light: blue-ish from above (night), warm from below ---
    // Each room adds its own lamp (LevelBuilder.js); cutting a room's lights
    // leaves only this dim fill there.
    this.ambient = new THREE.HemisphereLight(0x9aa8d8, 0x3a2e28, 0.55);
    this.scene.add(this.ambient);

    // --- Optional post-processing (only with ?quality=high) ---
    this.composer = null;
    if (!GRAPHICS.ambientOcclusion && !GRAPHICS.bloom) {
      window.addEventListener('resize', () => this.onResize());
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (GRAPHICS.ambientOcclusion) {
      this.aoPass = new GTAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      this.aoPass.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
      this.aoPass.blendIntensity = 0.85;
      // The AO pass treats everything as solid. Hide see-through things while it
      // works (smoke, glass, vision cones, labels), or they'd cast dark squares.
      const aoPass = this.aoPass;
      const originalOverride = aoPass._overrideVisibility.bind(aoPass);
      aoPass._overrideVisibility = () => {
        originalOverride();
        aoPass.scene.traverse((object) => {
          const m = object.material;
          const seeThrough = object.isSprite || (m && !Array.isArray(m) && m.transparent && m.depthWrite === false);
          if (seeThrough && object.visible) {
            object.visible = false;
            aoPass._visibilityCache.push(object);
          }
        });
      };
      this.composer.addPass(this.aoPass);
    }
    if (GRAPHICS.bloom) {
      // (resolution, strength, radius, threshold). The threshold is in "HDR"
      // brightness (before tone mapping), so only real light sources glow,
      // not a brightly lit white floor.
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.35, 2.2));
    }
    this.composer.addPass(new OutputPass()); // applies tone mapping + colour space

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
