// ============================================================================
// client/src/game/Effects.js
// ----------------------------------------------------------------------------
// Visual effects for gadgets and chat:
//   SmokeLayer  – billowing smoke clouds (many soft, semi-transparent sprites)
//   DecoyLayer  – the little ticking device a thrown decoy leaves on the floor
//   createBubble – a speech bubble shown above a thief for a few seconds
// ============================================================================

import * as THREE from 'three';
import { SMOKE } from '../../../shared/constants.js';
import { cylinderMesh } from './geometry.js';

// One soft round "puff" texture shared by all smoke sprites.
let puffTexture = null;
function getPuffTexture() {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  puffTexture = new THREE.CanvasTexture(canvas);
  return puffTexture;
}

export class SmokeLayer {
  constructor(scene) {
    this.scene = scene;
    this.clouds = new Map(); // key "x,z" -> { group, puffs, left }
  }

  /** @param {Array<{x, z, left}>} smokes - active clouds from the snapshot */
  sync(smokes, dt) {
    const present = new Set();
    for (const s of smokes) {
      const key = `${s.x.toFixed(2)},${s.z.toFixed(2)}`;
      present.add(key);
      let cloud = this.clouds.get(key);
      if (!cloud) cloud = this.create(key, s);
      cloud.left = s.left;
      cloud.age += dt;
      const grow = Math.min(1, cloud.age / 1.2);           // puffs out quickly
      const fade = Math.min(1, cloud.left / 2);             // fades in the last 2 s
      for (const p of cloud.puffs) {
        p.angle += dt * p.spin;
        p.sprite.position.set(Math.cos(p.angle) * p.r * grow, p.y + Math.sin(cloud.age * 0.6 + p.phase) * 0.15, Math.sin(p.angle) * p.r * grow);
        p.sprite.material.opacity = 0.55 * fade;
        p.sprite.material.rotation += dt * p.spin * 0.3;
      }
    }
    for (const [key, cloud] of this.clouds) {
      if (present.has(key)) continue;
      this.scene.remove(cloud.group);
      this.clouds.delete(key);
    }
  }

  create(key, s) {
    const group = new THREE.Group();
    group.position.set(s.x, 0, s.z);
    const puffs = [];
    for (let i = 0; i < 40; i++) {
      const material = new THREE.SpriteMaterial({ map: getPuffTexture(), color: 0xb8bcc4, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      const size = 1.2 + Math.random() * 1.4;
      sprite.scale.set(size, size, 1);
      group.add(sprite);
      puffs.push({ sprite, r: Math.random() * SMOKE.radius * 0.8, angle: Math.random() * Math.PI * 2, y: 0.3 + Math.random() * 2.2, spin: (Math.random() - 0.5) * 0.5, phase: Math.random() * 6 });
    }
    this.scene.add(group);
    const cloud = { group, puffs, left: s.left, age: 0 };
    this.clouds.set(key, cloud);
    return cloud;
  }

  dispose() {
    for (const cloud of this.clouds.values()) this.scene.remove(cloud.group);
    this.clouds.clear();
  }
}

export class DecoyLayer {
  constructor(scene) {
    this.scene = scene;
    this.devices = new Map();
  }

  sync(decoys) {
    const present = new Set();
    for (const d of decoys) {
      const key = `${d.x},${d.z}`;
      present.add(key);
      if (!this.devices.has(key)) {
        const g = new THREE.Group();
        cylinderMesh(0.05, 0.05, 0.08, 'blackPlastic', [0, 0.04, 0], g, 12);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshStandardMaterial({ emissive: 0xff2010, emissiveIntensity: 4 }));
        led.position.y = 0.09;
        g.add(led);
        g.position.set(d.x, 0, d.z);
        this.scene.add(g);
        this.devices.set(key, g);
      }
    }
    for (const [key, g] of this.devices) {
      if (present.has(key)) continue;
      this.scene.remove(g);
      this.devices.delete(key);
    }
  }

  dispose() {
    for (const g of this.devices.values()) this.scene.remove(g);
    this.devices.clear();
  }
}

/** A white speech bubble sprite with text. */
export function createBubble(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  const w = Math.min(300, ctx.measureText(text).width + 36);
  const x = (320 - w) / 2;
  ctx.fillStyle = '#f7f4ec';
  ctx.beginPath();
  ctx.roundRect(x, 6, w, 58, 14);
  ctx.moveTo(150, 64); ctx.lineTo(160, 86); ctx.lineTo(172, 64);
  ctx.fill();
  ctx.fillStyle = '#17130a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 36);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(1.4, 0.42, 1);
  sprite.renderOrder = 11;
  return sprite;
}
