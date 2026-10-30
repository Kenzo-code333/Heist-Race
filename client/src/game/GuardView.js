// ============================================================================
// client/src/game/GuardView.js
// ----------------------------------------------------------------------------
// Everything you SEE of one guard: the character model, a real flashlight
// (a spotlight), the vision cone on the floor and a "?" / "!" alert icon.
// The server decides what the guard does; this class just shows it.
// ============================================================================

import * as THREE from 'three';
import { CharacterModel } from './CharacterModel.js';
import { VisionCone } from './VisionCone.js';
import { GUARD } from '../../../shared/constants.js';
import { VISION_BLOCKERS_STANDING } from '../../../shared/map.js';
import { GRAPHICS } from './Renderer.js';

// Cone colour per guard state.
const STATE_COLORS = {
  patrol: 0xfff0b0, return: 0xfff0b0, search: 0xffc060, investigate: 0xffc060,
  suspicious: 0xff9a30, chase: 0xff3020,
};

function iconSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 104px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, 64, 70);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(0.45, 0.45, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class GuardView {
  constructor(scene) {
    this.scene = scene;
    this.model = new CharacterModel({ outfit: 'guard' });
    scene.add(this.model.root);

    // Real flashlight: a narrow spotlight from the torch, casting shadows.
    this.light = new THREE.SpotLight(0xfff2d6, 30, GUARD.visionRange + 2, GUARD.visionHalfAngle, 0.45, 1.6);
    this.light.castShadow = GRAPHICS.shadows;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.03;
    this.model.flashlightTip.add(this.light);
    this.light.position.set(0, 0, 0);
    this.light.target.position.set(0, -0.6, -5);
    this.model.flashlightTip.add(this.light.target);

    this.cone = new VisionCone(GUARD.visionRange, GUARD.visionHalfAngle, VISION_BLOCKERS_STANDING);
    scene.add(this.cone.mesh);

    this.icons = { '?': iconSprite('?', '#ffb03a'), '!': iconSprite('!', '#ff3b2a') };
    for (const icon of Object.values(this.icons)) {
      icon.position.y = 2.25;
      icon.visible = false;
      this.model.root.add(icon);
    }
    this.lastX = null;
    this.lastZ = null;
  }

  /**
   * @param {object} g - interpolated guard state { x, z, f, s (state), a (alert), mv }
   * @param {number} dt
   * @param {number} visionRange - current range (shorter in dark rooms, Milestone 6)
   */
  update(g, dt, visionRange = GUARD.visionRange) {
    const speed = this.lastX === null || dt <= 0 ? 0 : Math.min(6, Math.hypot(g.x - this.lastX, g.z - this.lastZ) / dt);
    this.lastX = g.x;
    this.lastZ = g.z;
    this.model.root.position.set(g.x, 0, g.z);
    this.model.root.rotation.y = g.f;
    this.model.update(dt, speed, false);

    this.cone.setColor(STATE_COLORS[g.s] ?? 0xfff0b0);
    this.cone.update(g.x, g.z, g.f, visionRange);

    // "?" while suspicious or searching, "!" while chasing (pulsing).
    const icon = g.s === 'chase' ? '!' : (g.s === 'suspicious' || g.s === 'search' || g.s === 'investigate') ? '?' : null;
    this.icons['?'].visible = icon === '?';
    this.icons['!'].visible = icon === '!';
    if (icon) {
      const pulse = 1 + Math.sin(performance.now() / 120) * 0.08;
      const grow = icon === '?' ? 0.6 + 0.4 * g.a : 1;
      this.icons[icon].scale.set(0.45 * pulse * grow, 0.45 * pulse * grow, 1);
    }
  }

  dispose() {
    this.scene.remove(this.model.root);
    this.scene.remove(this.cone.mesh);
    this.cone.geometry.dispose();
  }
}
