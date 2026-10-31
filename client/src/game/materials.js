// ============================================================================
// client/src/game/materials.js
// ----------------------------------------------------------------------------
// A MATERIAL describes how a surface reacts to light: its colour, how rough or
// shiny it is (roughness), whether it is metal (metalness), whether it glows
// (emissive), and which textures it uses.
//
// We use "physically based" materials (MeshStandardMaterial), which behave
// like real-world surfaces under the scene lights and reflections.
//
// Materials are created on first use and then cached (re-used), so asking for
// getMaterial('walnut') a hundred times only builds it once.
//
// UV CONVENTION: all our geometry has texture coordinates measured in METRES
// (see geometry.js). Each texture's `repeat` is set to 1 / (metres one tile
// covers), so a 2 m parquet tile looks 2 m wide everywhere.
// ============================================================================

import * as THREE from 'three';
import * as T from './textures.js';

const cache = new Map();

// ---------------------------------------------------------------------------
// CARTOON ("toon") SHADING. Instead of smooth realistic lighting, toon
// materials light surfaces in a few flat bands, like a comic or a cartoon.
// It is cheaper for the graphics card AND it makes simple shapes look
// deliberate instead of "blocky". The gradient map defines the bands:
// 4 brightness steps from shadow to fully lit.
// ---------------------------------------------------------------------------
const TOON_STEPS = (() => {
  const steps = new Uint8Array([105, 165, 215, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; // hard edges between bands
  tex.needsUpdate = true;
  return tex;
})();

/**
 * Turn a realistic material into a toon one with the same colour and textures.
 * See-through (glass) and unlit materials are kept as they are.
 */
function toonify(m) {
  if (m.transparent || m.isMeshBasicMaterial || m.isMeshToonMaterial) return m;
  const toon = new THREE.MeshToonMaterial({
    color: m.color, map: m.map, bumpMap: m.bumpMap, bumpScale: m.bumpScale,
    emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
    side: m.side, gradientMap: TOON_STEPS,
  });
  m.dispose();
  return toon;
}

// Helper: apply real-world scale to a generated {color, height} texture pair.
function scaled(pair, tileMetres) {
  for (const tex of [pair.color, pair.height]) tex.repeat.set(1 / tileMetres, 1 / tileMetres);
  return pair;
}

// Helper: a standard textured material.
function textured(pair, tileMetres, options) {
  const p = scaled(pair, tileMetres);
  return new THREE.MeshStandardMaterial({ map: p.color, bumpMap: p.height, ...options });
}

// Shared textures that several materials tint differently (created once).
let plasterPair, fabricPair, metalPair;
const plasterTex = () => (plasterPair ??= scaled(T.plaster(), 2));
const fabricTex = () => (fabricPair ??= scaled(T.fabric(), 0.25));
const metalTex = () => (metalPair ??= scaled(T.brushedMetal(), 1));

// Painted wall: plaster texture tinted with a room colour.
function paintedWall(color) {
  const p = plasterTex();
  return new THREE.MeshStandardMaterial({ color, map: p.color, bumpMap: p.height, bumpScale: 0.6, roughness: 0.88 });
}

function fabricMat(color, roughness = 0.9) {
  const p = fabricTex();
  return new THREE.MeshStandardMaterial({ color, map: p.color, bumpMap: p.height, bumpScale: 0.8, roughness });
}

function metalMat(color, roughness) {
  const p = metalTex();
  return new THREE.MeshStandardMaterial({ color, map: p.color, bumpMap: p.height, bumpScale: 0.2, metalness: 1, roughness });
}

// ---------------------------------------------------------------------------
// The catalogue. Each entry is a small function that builds the material.
// ---------------------------------------------------------------------------
const FACTORIES = {
  // ----- Floors -----
  parquet: () => textured(T.parquet(), 2, { roughness: 0.42, bumpScale: 1.2 }),
  darkMarble: () => textured(T.marble(13, [26, 30, 29], [176, 168, 150]), 2, { roughness: 0.1, bumpScale: 0.6 }),
  whiteMarble: () => textured(T.marble(17, [226, 222, 214], [128, 124, 120]), 2, { roughness: 0.12, bumpScale: 0.6 }),
  carpet: () => textured(T.carpet(), 1, { roughness: 0.98, bumpScale: 1.5 }),
  concrete: () => textured(T.concrete(), 3, { roughness: 0.86, bumpScale: 1.0 }),
  steelFloor: () => textured(T.diamondPlate(), 0.6, { roughness: 0.42, metalness: 0.85, bumpScale: 3.0 }),
  rug: () => { const p = T.rug(23, false); return new THREE.MeshStandardMaterial({ map: p.color, bumpMap: p.height, bumpScale: 1.5, roughness: 0.97 }); },
  runner: () => { const p = T.rug(29, true); p.color.repeat.set(14, 1); p.height.repeat.set(14, 1); return new THREE.MeshStandardMaterial({ map: p.color, bumpMap: p.height, bumpScale: 1.5, roughness: 0.97 }); },

  // ----- Walls (one per room) and ceilings -----
  officeWall: () => paintedWall(0xd4c8b0),
  galleryWall: () => paintedWall(0x6a2228),
  corridorWall: () => paintedWall(0xa7aeb3),
  lobbyWall: () => paintedWall(0xece4d4),
  storageWall: () => textured(T.concrete(37), 3, { color: 0xb8b8b0, roughness: 0.9, bumpScale: 1.2 }),
  vaultWall: () => metalMat(0x8a9099, 0.5),
  plaster: () => paintedWall(0xdedad2),
  ceiling: () => textured(T.ceilingTiles(), 1.2, { roughness: 0.95, bumpScale: 0.8 }),
  trim: () => new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.45 }),

  // ----- Woods -----
  walnut: () => textured(T.walnut(), 1, { roughness: 0.38, bumpScale: 0.6 }),
  pine: () => textured(T.walnut(73), 1, { color: 0xf0c48a, roughness: 0.8, bumpScale: 1.2 }),

  // ----- Metals -----
  brushedSteel: () => metalMat(0xc9ccd1, 0.32),
  darkSteel: () => metalMat(0x4b5058, 0.45),
  paintedMetal: () => new THREE.MeshStandardMaterial({ color: 0x6f7780, roughness: 0.55, metalness: 0.5 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd9ab4c, roughness: 0.22, metalness: 1 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 1 }),

  // ----- Plastics, glass, ceramics -----
  blackPlastic: () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.45 }),
  greyPlastic: () => new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.5 }),
  whitePaint: () => new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5 }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: 0xddeeff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16,
    clearcoat: 1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2,
  }),
  ceramic: () => new THREE.MeshPhysicalMaterial({ color: 0xece8df, roughness: 0.25, clearcoat: 0.8 }),
  terracotta: () => new THREE.MeshStandardMaterial({ color: 0x9c5a3c, roughness: 0.85 }),
  soil: () => new THREE.MeshStandardMaterial({ color: 0x2b1e14, roughness: 1 }),
  leaf: () => new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 0.6, side: THREE.DoubleSide }),
  paper: () => new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.9 }),
  cardboard: () => textured(T.concrete(43), 1, { color: 0xc49a64, roughness: 0.95, bumpScale: 0.3 }),
  tape: () => new THREE.MeshStandardMaterial({ color: 0xc8a978, roughness: 0.4 }),
  redPaint: () => new THREE.MeshStandardMaterial({ color: 0xb3161b, roughness: 0.35, metalness: 0.2 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.9 }),

  // ----- Fabrics -----
  leather: () => fabricMat(0x3b2418, 0.55),
  sofaFabric: () => fabricMat(0x34495e),
  chairFabric: () => fabricMat(0x2a2d33),
  velvet: () => fabricMat(0x5a0f1a, 0.95),

  // ----- Glowing (emissive) surfaces -----
  lightPanel: () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 3 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x0a1020, emissive: 0x2a5aa8, emissiveIntensity: 0.9, roughness: 0.2 }),
  redLed: () => new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 4 }),
  greenLed: () => new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x20ff60, emissiveIntensity: 3 }),
  goldGlow: () => new THREE.MeshStandardMaterial({ color: 0x664411, emissive: 0xffb84a, emissiveIntensity: 3 }),

  // ----- Thief outfit -----
  thiefJacket: () => fabricMat(0x1c1e23, 0.85),
  thiefPants: () => fabricMat(0x2b2e36, 0.9),
  thiefKnit: () => fabricMat(0x202227, 1.0),
  thiefGlove: () => new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.5 }),
  thiefShoe: () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
  thiefBag: () => fabricMat(0x3d4231, 0.8),
  skin: () => new THREE.MeshStandardMaterial({ color: 0xc8957a, roughness: 0.6 }),
  hair: () => new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 }),

  // ----- Guard uniform -----
  guardShirt: () => fabricMat(0x24375c, 0.85),
  guardPants: () => fabricMat(0x1c1f26, 0.9),
  guardCap: () => fabricMat(0x161c2b, 0.8),
  flashLens: () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 5 }),
  dizzyStar: () => new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0xffc020, emissiveIntensity: 2.5 }),
  eye: () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 }),
};

/** Get a material by name (built once, then re-used). */
export function getMaterial(name) {
  if (!cache.has(name)) {
    const factory = FACTORIES[name];
    if (!factory) throw new Error(`Unknown material: ${name}`);
    cache.set(name, toonify(factory()));
  }
  return cache.get(name);
}

/** A one-off material with a specific colour (not cached), e.g. book covers. */
export function colorMaterial(color, roughness = 0.6, metalness = 0) {
  return toonify(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}

export { toonify };
