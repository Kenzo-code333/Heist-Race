// ============================================================================
// client/src/game/geometry.js
// ----------------------------------------------------------------------------
// Small helpers that build shapes (geometries) and meshes with less typing.
//
// The key trick: box() and floorPlane() give texture coordinates (UVs)
// measured in METRES. That way a texture keeps the same real-world size no
// matter how big the box is (a 10 m wall doesn't get a stretched texture).
// ============================================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getMaterial } from './materials.js';

/**
 * A box w (x) by h (y) by d (z), with UVs in metres on every face.
 * Three.js orders a box's 6 faces as: +x, -x, +y, -y, +z, -z (4 corners each).
 */
export function boxGeo(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // How many metres each face spans along its u and v directions:
  const faceSizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = faceSizes[face];
    for (let corner = 0; corner < 4; corner++) {
      const i = face * 4 + corner;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  return geo;
}

/** A box with softly rounded edges (cushions, cases). UVs roughly in metres. */
export function roundedBoxGeo(w, h, d, radius = 0.04) {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2));
  const uv = geo.attributes.uv;
  const scale = Math.max(w, h, d);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scale, uv.getY(i) * scale);
  return geo;
}

/** A flat horizontal rectangle lying on the floor (facing up). */
export function floorPlane(w, d, uvInMetres = true) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2); // PlaneGeometry starts vertical; lay it flat
  if (uvInMetres) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  }
  return geo;
}

/**
 * Create a mesh and (optionally) place it. Every mesh casts and receives
 * shadows by default, which is what makes the scene look grounded.
 * @param {THREE.BufferGeometry} geometry
 * @param {string|THREE.Material} material - material name or object
 * @param {number[]} [position] - [x, y, z]
 * @param {THREE.Object3D} [parent] - group to add it to
 */
export function mesh(geometry, material, position = [0, 0, 0], parent = null) {
  const mat = typeof material === 'string' ? getMaterial(material) : material;
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(position[0], position[1], position[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

/** Shortcut: a textured box mesh. Position is the box CENTRE. */
export function boxMesh(w, h, d, material, position, parent) {
  return mesh(boxGeo(w, h, d), material, position, parent);
}

/** Shortcut: a cylinder standing upright. Position is the cylinder CENTRE. */
export function cylinderMesh(radiusTop, radiusBottom, height, material, position, parent, segments = 24) {
  return mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material, position, parent);
}
