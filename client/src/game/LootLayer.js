// ============================================================================
// client/src/game/LootLayer.js
// ----------------------------------------------------------------------------
// Draws all the loot lying around (cash stacks, dropped bags...) and keeps it
// in sync with the server's list: new items appear, grabbed items disappear.
// The item you would interact with gets a pulsing golden ring under it.
// ============================================================================

import * as THREE from 'three';
import { boxMesh, mesh, roundedBoxGeo } from './geometry.js';
import { makeRng } from './textures.js';

// Banknote texture: drawn once, shared by every bundle.
let billMaterial = null;
function getBillMaterial() {
  if (billMaterial) return billMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7d9b6a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#3e5a37';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = '#5c7a4e';
  ctx.beginPath(); ctx.ellipse(128, 64, 34, 42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f4a2b';
  ctx.font = 'bold 34px serif';
  ctx.fillText('100', 20, 50);
  ctx.fillText('100', 180, 112);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  billMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
  return billMaterial;
}

/** A small pile of banknote bundles held by paper bands. */
function cashStack(seed) {
  const rng = makeRng(seed);
  const g = new THREE.Group();
  const count = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const bundle = new THREE.Group();
    mesh(new THREE.BoxGeometry(0.156, 0.03, 0.066), getBillMaterial(), [0, 0.015, 0], bundle);
    boxMesh(0.03, 0.032, 0.068, 'paper', [0, 0.015, 0], bundle); // paper band
    const layer = Math.floor(i / 2);
    bundle.position.set((i % 2) * 0.08 - 0.04 + (rng() - 0.5) * 0.02, layer * 0.031, (rng() - 0.5) * 0.04);
    bundle.rotation.y = (rng() - 0.5) * 0.5;
    g.add(bundle);
  }
  return g;
}

/** A dropped loot bag with a few bundles spilling out. */
function droppedBag(seed) {
  const g = new THREE.Group();
  const bag = mesh(roundedBoxGeo(0.4, 0.2, 0.26, 0.09), 'thiefBag', [0, 0.1, 0], g);
  bag.rotation.y = 0.4;
  const spill = cashStack(seed);
  spill.position.set(0.28, 0, 0.05);
  g.add(spill);
  return g;
}

function buildItem(item, seed) {
  if (item.type === 'cash') return item.dropped ? droppedBag(seed) : cashStack(seed);
  // Unknown types: a visible placeholder
  return boxMesh(0.2, 0.2, 0.2, 'gold', [0, 0.1, 0]);
}

export class LootLayer {
  constructor(scene) {
    this.scene = scene;
    this.views = new Map(); // item id -> Object3D
    // Highlight ring under the item you can grab
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  /**
   * @param {Array} items - loot list from the latest snapshot
   * @param {string|null} highlightId - item to put the ring under
   */
  sync(items, highlightId) {
    const present = new Set();
    for (const item of items) {
      present.add(item.id);
      if (!this.views.has(item.id)) {
        const view = buildItem(item, hashString(item.id));
        view.position.set(item.x, item.y ?? 0, item.z);
        this.scene.add(view);
        this.views.set(item.id, view);
      }
    }
    for (const [id, view] of this.views) {
      if (!present.has(id)) {
        this.scene.remove(view);
        this.views.delete(id);
      }
    }
    const target = highlightId && this.views.get(highlightId);
    this.ring.visible = !!target;
    if (target) {
      this.ring.position.set(target.position.x, target.position.y + 0.01, target.position.z);
      const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
      this.ring.scale.set(pulse, pulse, pulse);
    }
  }

  dispose() {
    for (const view of this.views.values()) this.scene.remove(view);
    this.views.clear();
    this.scene.remove(this.ring);
  }
}

function hashString(s) {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
