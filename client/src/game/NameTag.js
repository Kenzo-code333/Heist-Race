// ============================================================================
// client/src/game/NameTag.js
// ----------------------------------------------------------------------------
// A floating name label above a character: text drawn on a canvas, shown on a
// "sprite" (a flat picture that always faces the camera).
// ============================================================================

import * as THREE from 'three';

export function createNameTag(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 30px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(250, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(10,10,12,0.6)';
  ctx.fillRect((256 - width) / 2, 10, width, 44);
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect((256 - width) / 2, 50, width, 4);
  ctx.fillStyle = '#f2efe8';
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.0, 0.25, 1);
  sprite.renderOrder = 10;
  return sprite;
}
