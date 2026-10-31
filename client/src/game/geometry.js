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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

/**
 * PERFORMANCE: fuse all still meshes of a group into one mesh per material.
 * The graphics card pays a fixed cost for every separate object it draws
 * ("draw call"); one big mesh instead of 300 small ones is much faster.
 *
 * Meshes that can't be merged this way (instanced meshes, meshes with several
 * materials) and non-mesh objects (lights) are kept as they are.
 * @param {THREE.Group} group - its contents are consumed
 * @returns {THREE.Group} a new group holding the merged result
 */
export function mergeStaticMeshes(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(); // material -> list of geometries (in world space)
  const keep = [];
  group.traverse((object) => {
    if (object === group) return;
    if (object.isMesh && !object.isInstancedMesh && !Array.isArray(object.material)) {
      // Copy the geometry, move it to where the mesh really is, keep only the
      // attributes every geometry has (position, normal, uv).
      let geo = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geo.applyMatrix4(object.matrixWorld);
      for (const name of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      geo.morphAttributes = {};
      if (!buckets.has(object.material)) buckets.set(object.material, []);
      buckets.get(object.material).push(geo);
    } else if (object.isInstancedMesh || object.isMesh || object.isLight || object.isSprite) {
      keep.push(object);
    }
  });

  const result = new THREE.Group();
  result.name = 'level-merged';
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.matrixAutoUpdate = false; // never moves
    result.add(m);
  }
  // attach() moves an object to a new parent while keeping its world position.
  for (const object of keep) {
    if (object.parent && !keep.includes(object.parent)) result.attach(object);
  }
  return result;
}
