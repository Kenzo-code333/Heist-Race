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

// Quality switches. Set to false for a big speed-up on weak computers.
// They can also be changed from the address bar without editing code, e.g.
//   http://localhost:5173/?quality=low      (everything off, fastest)
//   http://localhost:5173/?ao=0&bloom=0     (individual switches)
const params = new URLSearchParams(window.location.search);
const low = params.get('quality') === 'low';
const flag = (name, fallback) => (params.has(name) ? params.get(name) !== '0' : fallback);
export const GRAPHICS = {
  shadows: flag('shadows', !low),
  ambientOcclusion: flag('ao', !low),
  bloom: flag('bloom', !low),
  maxPixelRatio: low ? 1 : 2, // 1 = faster, 2 = sharper on high-DPI ("Retina") screens
};

export class Renderer {
  /** @param {HTMLElement} container - the element the canvas goes into */
  constructor(container) {
    // --- The WebGL renderer ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping squeezes very bright and very dark values into what a screen
    // can show, like a film camera. AgX gives natural, filmic colours.
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = GRAPHICS.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // --- Scene and camera ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050506);
    // field of view 65°, aspect ratio, near & far clipping distances (metres)
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 120);

    // --- Reflections: a soft generic "room" environment map ---
    // Shiny surfaces (marble, chrome, glass) reflect this, which is what makes
    // them read as polished. Kept dim because the heist happens at night.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;

    // --- A faint blue-ish ambient fill (moonlight leaking in at night) ---
    this.scene.add(new THREE.HemisphereLight(0x8090b0, 0x201a14, 0.12));

    // --- Post-processing chain ---
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
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
