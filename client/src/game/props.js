// ============================================================================
// client/src/game/props.js
// ----------------------------------------------------------------------------
// PROPS = furniture and decorations, each assembled from many simple shapes
// (boxes, cylinders, spheres...). Every builder returns a THREE.Group.
//
// LOCAL SPACE CONVENTION for every builder:
//   - the object is centred on x = 0, z = 0 and stands on y = 0
//   - `w` is its width along x, `d` its depth along z, `h` its height
//   - its FRONT faces +z
// LevelBuilder.js then rotates and moves each group into place.
//
// Wall-mounted decorations instead have their BACK at z = 0 (the wall surface)
// and their origin at the item's centre height.
//
// Later, any builder here can be swapped for a real 3D model without touching
// the rest of the game.
// ============================================================================

import * as THREE from 'three';
import { boxMesh, cylinderMesh, mesh, roundedBoxGeo, floorPlane } from './geometry.js';
import { getMaterial, colorMaterial } from './materials.js';
import { makeRng, paintingTexture } from './textures.js';

// Small helper: put a shape inside a group and return the group (for chaining).
function group(...children) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

// Text drawn onto a canvas, used for signs. Returns a texture.
function labelTexture(text, background, foreground, width = 256, height = 96, font = 'bold 56px sans-serif') {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = foreground;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===========================================================================
// FURNITURE
// ===========================================================================

/** Swivel office chair. Faces +z (the way you'd sit). */
function officeChair(rng) {
  const g = new THREE.Group();
  // Five-star base with casters
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const leg = boxMesh(0.035, 0.03, 0.3, 'blackPlastic', [Math.sin(angle) * 0.15, 0.065, Math.cos(angle) * 0.15], g);
    leg.rotation.y = angle;
    mesh(new THREE.SphereGeometry(0.026, 10, 8), 'blackPlastic', [Math.sin(angle) * 0.29, 0.026, Math.cos(angle) * 0.29], g);
  }
  cylinderMesh(0.024, 0.024, 0.32, 'chrome', [0, 0.23, 0], g, 12);          // gas lift
  mesh(roundedBoxGeo(0.5, 0.08, 0.47, 0.03), 'chairFabric', [0, 0.44, 0], g); // seat
  mesh(roundedBoxGeo(0.46, 0.52, 0.07, 0.03), 'chairFabric', [0, 0.82, -0.23], g).rotation.x = -0.12; // backrest
  boxMesh(0.06, 0.32, 0.03, 'blackPlastic', [0, 0.58, -0.25], g);          // back support
  for (const side of [-1, 1]) {
    boxMesh(0.03, 0.18, 0.03, 'blackPlastic', [side * 0.25, 0.56, 0], g);    // armrest post
    mesh(roundedBoxGeo(0.06, 0.03, 0.26, 0.012), 'blackPlastic', [side * 0.25, 0.66, 0.02], g); // armrest pad
  }
  g.rotation.y = (rng() - 0.5) * 0.6; // chairs are never perfectly straight
  return g;
}

/** Computer monitor on a stand, screen facing +z. */
function monitor() {
  const g = new THREE.Group();
  boxMesh(0.22, 0.012, 0.16, 'blackPlastic', [0, 0.006, 0], g);
  boxMesh(0.04, 0.26, 0.025, 'blackPlastic', [0, 0.14, -0.035], g);
  boxMesh(0.6, 0.36, 0.028, 'blackPlastic', [0, 0.34, -0.01], g);
  const screen = mesh(new THREE.PlaneGeometry(0.56, 0.32), 'screen', [0, 0.34, 0.0045], g);
  screen.castShadow = false;
  return g;
}

/** Office desk with drawers, monitor, keyboard, clutter and a chair. */
function desk({ w, d, h, seed }) {
  const rng = makeRng(seed * 31 + 7);
  const g = new THREE.Group();
  const top = 0.04;
  boxMesh(w, top, d, 'walnut', [0, h - top / 2, 0], g);                               // desktop
  for (const side of [-1, 1]) boxMesh(0.04, h - top, d - 0.08, 'darkSteel', [side * (w / 2 - 0.06), (h - top) / 2, 0], g); // side panels
  boxMesh(w - 0.16, 0.4, 0.02, 'darkSteel', [0, h - top - 0.25, -d / 2 + 0.06], g);   // modesty panel

  // Drawer pedestal on the right with three drawers
  const pw = 0.42;
  const px = w / 2 - 0.08 - pw / 2;
  const ph = h - top - 0.02;
  boxMesh(pw, ph, d - 0.12, 'walnut', [px, ph / 2 + 0.01, 0], g);
  const drawerH = (ph - 0.03) / 3;
  for (let i = 0; i < 3; i++) {
    const y = 0.025 + drawerH * (i + 0.5);
    boxMesh(pw - 0.03, drawerH - 0.015, 0.014, 'walnut', [px, y, d / 2 - 0.06 + 0.007], g);
    boxMesh(0.14, 0.012, 0.02, 'chrome', [px, y + drawerH * 0.28, d / 2 - 0.06 + 0.024], g);
  }

  // Desktop items
  const m = monitor();
  m.position.set(-0.15, h, -d / 2 + 0.2);
  g.add(m);
  boxMesh(0.44, 0.018, 0.14, 'greyPlastic', [-0.15, h + 0.009, -d / 2 + 0.44], g);    // keyboard
  mesh(roundedBoxGeo(0.06, 0.03, 0.1, 0.014), 'blackPlastic', [0.17, h + 0.015, -d / 2 + 0.44], g); // mouse
  cylinderMesh(0.04, 0.036, 0.1, 'ceramic', [w / 2 - 0.22, h + 0.05, -d / 2 + 0.22], g, 16); // coffee mug
  for (let i = 0; i < 3; i++) {                                                          // scattered papers
    const sheet = boxMesh(0.21, 0.003, 0.297, 'paper', [0.4 + rng() * 0.15, h + 0.002 + i * 0.003, 0.05 + rng() * 0.08], g);
    sheet.rotation.y = (rng() - 0.5) * 0.8;
  }

  // Chair pulled up to the front (+z) side, facing the desk
  const chair = officeChair(rng);
  chair.position.set(-0.15, 0, d / 2 + 0.35);
  chair.rotation.y += Math.PI;
  g.add(chair);
  return g;
}

/** Metal four-drawer filing cabinet. */
function cabinet({ w, d, h }) {
  const g = new THREE.Group();
  boxMesh(w, h, d, 'paintedMetal', [0, h / 2, 0], g);
  const drawerH = (h - 0.04) / 4;
  for (let i = 0; i < 4; i++) {
    const y = 0.02 + drawerH * (i + 0.5);
    boxMesh(w - 0.03, drawerH - 0.016, 0.012, 'paintedMetal', [0, y, d / 2 + 0.006], g);
    boxMesh(0.16, 0.016, 0.025, 'chrome', [0, y + drawerH * 0.12, d / 2 + 0.022], g);
    boxMesh(0.08, 0.035, 0.004, 'paper', [0, y + drawerH * 0.32, d / 2 + 0.014], g);
  }
  return g;
}

/** Wooden bookshelf filled with books (drawn efficiently as one "instanced" mesh). */
function bookshelf({ w, d, h, seed }) {
  const rng = makeRng(seed * 13 + 3);
  const g = new THREE.Group();
  for (const side of [-1, 1]) boxMesh(0.03, h, d, 'walnut', [side * (w / 2 - 0.015), h / 2, 0], g);
  boxMesh(w, 0.03, d, 'walnut', [0, h - 0.015, 0], g);
  boxMesh(w, 0.06, d, 'walnut', [0, 0.03, 0], g);
  boxMesh(w - 0.06, h, 0.015, 'walnut', [0, h / 2, -d / 2 + 0.0075], g);

  const levels = 5;
  const spacing = (h - 0.09) / levels;
  const coverColors = [0x6b1f1f, 0x1f3b6b, 0x2d5a3a, 0x7a5a1e, 0x3b2a4a, 0x1a1a1a, 0x8a7d66, 0x5c3a21];
  const books = [];
  for (let level = 0; level < levels; level++) {
    const shelfY = 0.06 + level * spacing;
    if (level > 0) boxMesh(w - 0.06, 0.022, d - 0.02, 'walnut', [0, shelfY, 0.005], g);
    // Fill the shelf from left to right with books of random size
    let x = -w / 2 + 0.045;
    while (x < w / 2 - 0.08) {
      const bw = 0.025 + rng() * 0.035;
      const bh = Math.min(spacing - 0.05, 0.17 + rng() * 0.12);
      const bd = 0.15 + rng() * 0.07;
      if (rng() < 0.06) { x += 0.06; continue; } // occasional gap
      const lean = rng() < 0.05 ? 0.25 : 0;
      books.push({ x: x + bw / 2, y: shelfY + 0.011 + bh / 2, z: d / 2 - 0.03 - bd / 2, bw, bh, bd, lean, color: coverColors[Math.floor(rng() * coverColors.length)] });
      x += bw + 0.002;
    }
  }
  // One InstancedMesh draws all books in a single GPU call (much faster).
  const bookMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), colorMaterial(0xffffff, 0.75), books.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  books.forEach((b, i) => {
    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, 0, b.lean);
    dummy.scale.set(b.bw, b.bh, b.bd);
    dummy.updateMatrix();
    bookMesh.setMatrixAt(i, dummy.matrix);
    bookMesh.setColorAt(i, color.setHex(b.color).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
  });
  bookMesh.castShadow = bookMesh.receiveShadow = true;
  g.add(bookMesh);
  return g;
}

/** Potted plant with a trunk and dozens of leaves. */
function plant({ h, seed }) {
  const rng = makeRng(seed * 17 + 5);
  const g = new THREE.Group();
  const potMat = seed % 2 === 0 ? 'ceramic' : 'terracotta';
  cylinderMesh(0.24, 0.18, 0.45, potMat, [0, 0.225, 0], g, 28);
  cylinderMesh(0.255, 0.255, 0.035, potMat, [0, 0.44, 0], g, 28);
  cylinderMesh(0.22, 0.22, 0.02, 'soil', [0, 0.445, 0], g, 20);
  const trunkMat = colorMaterial(0x4a3626, 0.9);
  const trunk = cylinderMesh(0.018, 0.028, h * 0.55, trunkMat, [0, 0.45 + h * 0.27, 0], g, 8);
  trunk.rotation.z = 0.04;

  // Leaf shape: a squashed sphere, shifted so it grows out from its base.
  const leafGeo = new THREE.SphereGeometry(1, 10, 6);
  leafGeo.translate(0, 0, 1);
  const count = 70;
  const leaves = new THREE.InstancedMesh(leafGeo, getMaterial('leaf'), count);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ'; // first turn around, then tilt
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = rng();                              // 0 = low on the plant, 1 = top
    const y = 0.55 + t * (h - 0.6);
    const radius = 0.05 + (1 - Math.abs(t - 0.55)) * 0.18 * rng();
    const angle = rng() * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dummy.rotation.set(-0.3 + rng() * 0.9, angle + Math.PI / 2 + (rng() - 0.5), (rng() - 0.5) * 0.6);
    const size = 0.8 + rng() * 0.5;
    dummy.scale.set(0.05 * size, 0.006, 0.09 * size);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, color.setHSL(0.3 + rng() * 0.05, 0.45 + rng() * 0.2, 0.75 + rng() * 0.4));
  }
  leaves.castShadow = leaves.receiveShadow = true;
  g.add(leaves);
  return g;
}

/** Museum display: white plinth, glass case with brass edges, an artefact inside. */
function displayCase({ seed }) {
  const g = new THREE.Group();
  boxMesh(0.84, 0.06, 0.84, 'blackPlastic', [0, 0.03, 0], g);
  boxMesh(0.8, 0.92, 0.8, 'whitePaint', [0, 0.52, 0], g);
  boxMesh(0.84, 0.03, 0.84, 'walnut', [0, 0.995, 0], g);
  boxMesh(0.2, 0.06, 0.006, 'brass', [0, 0.82, 0.403], g); // little name plaque

  // Glass box
  const caseW = 0.7, caseH = 0.55, baseY = 1.01;
  const glass = boxMesh(caseW, caseH, caseW, 'glass', [0, baseY + caseH / 2, 0], g);
  glass.castShadow = false;
  glass.renderOrder = 2; // draw transparent glass after the things inside it
  // Brass edges: 4 verticals + 4 top edges
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) boxMesh(0.014, caseH, 0.014, 'brass', [sx * caseW / 2, baseY + caseH / 2, sz * caseW / 2], g);
    boxMesh(0.014, 0.014, caseW, 'brass', [sx * caseW / 2, baseY + caseH, 0], g);
    boxMesh(caseW, 0.014, 0.014, 'brass', [0, baseY + caseH, sx * caseW / 2], g);
  }

  // The artefact: vase, jewel or statuette depending on the seed
  const kind = seed % 3;
  if (kind === 0) {
    // Golden vase made by spinning a profile line around the vertical axis
    const profile = [[0, 0], [0.08, 0], [0.1, 0.05], [0.12, 0.15], [0.09, 0.26], [0.05, 0.3], [0.06, 0.34], [0.07, 0.36]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    mesh(new THREE.LatheGeometry(profile, 32), 'gold', [0, baseY, 0], g);
  } else if (kind === 1) {
    // Gem on a velvet cushion
    mesh(roundedBoxGeo(0.3, 0.07, 0.3, 0.03), 'velvet', [0, baseY + 0.035, 0], g);
    const gemMat = new THREE.MeshPhysicalMaterial({ color: 0xc21835, roughness: 0, metalness: 0, clearcoat: 1, envMapIntensity: 3, emissive: 0x300008 });
    const gem = mesh(new THREE.OctahedronGeometry(0.08, 0), gemMat, [0, baseY + 0.16, 0], g);
    gem.scale.y = 1.3;
    gem.rotation.y = 0.5;
  } else {
    // Small marble bust: pedestal, shoulders, neck, head
    const stone = 'ceramic';
    cylinderMesh(0.07, 0.09, 0.06, stone, [0, baseY + 0.03, 0], g);
    mesh(roundedBoxGeo(0.22, 0.12, 0.12, 0.05), stone, [0, baseY + 0.12, 0], g);
    cylinderMesh(0.035, 0.04, 0.06, stone, [0, baseY + 0.2, 0], g, 12);
    const head = mesh(new THREE.SphereGeometry(0.075, 20, 16), stone, [0, baseY + 0.29, 0.01], g);
    head.scale.set(0.9, 1.15, 1);
  }
  return g;
}

/** Gallery bench: leather cushion on chrome legs. */
function bench({ w, d }) {
  const g = new THREE.Group();
  mesh(roundedBoxGeo(w, 0.1, d, 0.04), 'leather', [0, 0.4, 0], g);
  for (const side of [-1, 1]) {
    boxMesh(0.05, 0.35, d - 0.06, 'chrome', [side * (w / 2 - 0.18), 0.175, 0], g);
    boxMesh(0.05, 0.02, d - 0.04, 'rubber', [side * (w / 2 - 0.18), 0.01, 0], g);
  }
  return g;
}

/** Reception desk: walnut front, marble counter, glowing gold strip, staff monitor. */
function receptionDesk({ w, d, h }) {
  const g = new THREE.Group();
  boxMesh(w, h - 0.05, 0.06, 'walnut', [0, (h - 0.05) / 2, d / 2 - 0.03], g);        // front panel
  for (const side of [-1, 1]) boxMesh(0.06, h - 0.05, d, 'walnut', [side * (w / 2 - 0.03), (h - 0.05) / 2, 0], g);
  boxMesh(w + 0.08, 0.05, 0.38, 'whiteMarble', [0, h - 0.025, d / 2 - 0.13], g);     // marble counter
  boxMesh(w - 0.12, 0.03, d - 0.1, 'walnut', [0, 0.74, -0.03], g);                    // low work surface
  const strip = boxMesh(w - 0.24, 0.025, 0.012, 'goldGlow', [0, h - 0.14, d / 2 + 0.006], g);
  strip.castShadow = false;
  // Vertical walnut fins for detail on the front
  for (let i = -3; i <= 3; i++) boxMesh(0.03, h - 0.28, 0.02, 'walnut', [i * (w / 8), (h - 0.28) / 2 + 0.04, d / 2 + 0.01], g);
  // Staff monitor facing the back
  const m = monitor();
  m.position.set(-0.5, 0.755, -0.05);
  m.rotation.y = Math.PI;
  g.add(m);
  // Service bell on the counter
  mesh(new THREE.SphereGeometry(0.045, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'chrome', [0.8, h + 0.006, d / 2 - 0.13], g);
  cylinderMesh(0.055, 0.055, 0.008, 'blackPlastic', [0.8, h + 0.004, d / 2 - 0.13], g);
  return g;
}

/** Three-seat sofa with cushions, arms, little legs and a throw pillow. */
function sofa({ w, d, h }) {
  const g = new THREE.Group();
  const legH = 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cylinderMesh(0.025, 0.018, legH, 'walnut', [sx * (w / 2 - 0.1), legH / 2, sz * (d / 2 - 0.1)], g, 10);
  }
  mesh(roundedBoxGeo(w, 0.24, d, 0.04), 'sofaFabric', [0, legH + 0.12, 0], g);           // base
  mesh(roundedBoxGeo(w, h - legH - 0.2, 0.16, 0.05), 'sofaFabric', [0, legH + 0.2 + (h - legH - 0.2) / 2, -d / 2 + 0.08], g); // back frame
  for (const side of [-1, 1]) mesh(roundedBoxGeo(0.18, 0.58, d, 0.06), 'sofaFabric', [side * (w / 2 - 0.09), legH + 0.29, 0], g); // arms
  const seatW = (w - 0.36) / 3;
  for (let i = -1; i <= 1; i++) {
    mesh(roundedBoxGeo(seatW - 0.012, 0.14, d - 0.2, 0.05), 'sofaFabric', [i * seatW, legH + 0.31, 0.07], g); // seat cushion
    const back = mesh(roundedBoxGeo(seatW - 0.012, 0.42, 0.16, 0.06), 'sofaFabric', [i * seatW, legH + 0.58, -d / 2 + 0.22], g);
    back.rotation.x = -0.14;
  }
  const pillow = mesh(roundedBoxGeo(0.38, 0.38, 0.11, 0.06), 'velvet', [w / 2 - 0.36, legH + 0.55, -d / 2 + 0.36], g);
  pillow.rotation.set(-0.3, 0.3, 0.15);
  return g;
}

/** Coffee table: walnut frame, glass top, magazines and a vase. */
function coffeeTable({ w, d, h, seed }) {
  const rng = makeRng(seed * 7 + 1);
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxMesh(0.04, h - 0.015, 0.04, 'walnut', [sx * (w / 2 - 0.04), (h - 0.015) / 2, sz * (d / 2 - 0.04)], g);
  boxMesh(w - 0.06, 0.02, d - 0.06, 'walnut', [0, 0.12, 0], g);
  boxMesh(w - 0.04, 0.04, d - 0.04, 'walnut', [0, h - 0.04, 0], g); // apron under the glass
  const top = boxMesh(w, 0.012, d, 'glass', [0, h - 0.006, 0], g);
  top.castShadow = false;
  for (let i = 0; i < 3; i++) {
    const mag = boxMesh(0.21, 0.006, 0.28, colorMaterial([0xc0392b, 0x2c3e50, 0xe6d8b8][i], 0.4), [-0.2 + rng() * 0.1, 0.134 + i * 0.006, rng() * 0.05], g);
    mag.rotation.y = (rng() - 0.5) * 0.7;
  }
  const vaseProfile = [[0, 0], [0.04, 0], [0.06, 0.06], [0.035, 0.16], [0.03, 0.2], [0.04, 0.22]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(vaseProfile, 24), 'ceramic', [0.3, h, 0], g);
  return g;
}

/** Industrial storage rack with boxes and paint cans. */
function shelf({ w, d, h, seed }) {
  const rng = makeRng(seed * 19 + 11);
  const g = new THREE.Group();
  const beamMat = colorMaterial(0xd2661e, 0.5, 0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxMesh(0.05, h, 0.05, 'paintedMetal', [sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025)], g);
  const levels = [0.12, 0.8, 1.48, 2.15];
  for (const y of levels) {
    boxMesh(w - 0.02, 0.025, d - 0.02, 'brushedSteel', [0, y, 0], g);
    for (const sz of [-1, 1]) boxMesh(w, 0.06, 0.03, beamMat, [0, y - 0.04, sz * (d / 2 - 0.015)], g);
  }
  // Items on the lower three levels
  for (const y of levels.slice(0, 3)) {
    let x = -w / 2 + 0.08;
    while (x < w / 2 - 0.2) {
      if (rng() < 0.7) {
        const bw = 0.3 + rng() * 0.25, bh = 0.2 + rng() * 0.3, bd = Math.min(d - 0.1, 0.3 + rng() * 0.2);
        if (x + bw > w / 2 - 0.05) break;
        const box = boxMesh(bw, bh, bd, 'cardboard', [x + bw / 2, y + 0.0125 + bh / 2, (rng() - 0.5) * 0.05], g);
        box.rotation.y = (rng() - 0.5) * 0.15;
        boxMesh(bw + 0.002, 0.003, 0.05, 'tape', [0, bh / 2, 0], box); // tape strip on top
        x += bw + 0.04;
      } else {
        const r = 0.09;
        cylinderMesh(r, r, 0.24, 'brushedSteel', [x + r, y + 0.0125 + 0.12, 0], g, 20);
        cylinderMesh(r + 0.002, r + 0.002, 0.12, colorMaterial([0x2e86c1, 0xc0392b, 0xf1c40f][Math.floor(rng() * 3)], 0.5), [x + r, y + 0.0125 + 0.12, 0], g, 20);
        x += r * 2 + 0.05;
      }
    }
  }
  return g;
}

/** Wooden shipping crate with edge battens and diagonal braces. */
function crate({ w, d, h }) {
  const g = new THREE.Group();
  boxMesh(w - 0.04, h - 0.04, d - 0.04, 'pine', [0, h / 2, 0], g);
  const t = 0.06; // batten thickness
  // 12 edges of the box
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxMesh(t, h, t, 'pine', [sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)], g);
  for (const sy of [0, 1]) {
    const y = sy ? h - t / 2 : t / 2;
    for (const sz of [-1, 1]) boxMesh(w, t, t, 'pine', [0, y, sz * (d / 2 - t / 2)], g);
    for (const sx of [-1, 1]) boxMesh(t, t, d, 'pine', [sx * (w / 2 - t / 2), y, 0], g);
  }
  // Diagonal braces on front and back
  const diag = Math.hypot(w, h) - 0.12;
  for (const sz of [-1, 1]) {
    const brace = boxMesh(diag, 0.07, 0.02, 'pine', [0, h / 2, sz * (d / 2 - 0.005)], g);
    brace.rotation.z = Math.atan2(h, w) * sz;
  }
  return g;
}

/** The big round vault door, set in a steel frame, with bolts, wheel and keypad. */
function vaultDoor({ w, d, h }) {
  const g = new THREE.Group();
  const backZ = -d / 2;
  const centreY = 1.4;
  boxMesh(w, h, 0.3, 'darkSteel', [0, h / 2, backZ + 0.15], g);                   // wall frame
  const ring = cylinderMesh(1.28, 1.28, 0.1, 'brushedSteel', [0, centreY, backZ + 0.35], g, 64);
  ring.rotation.x = Math.PI / 2;
  const doorDisk = cylinderMesh(1.15, 1.15, 0.22, 'brushedSteel', [0, centreY, backZ + 0.46], g, 64);
  doorDisk.rotation.x = Math.PI / 2;
  const frontZ = backZ + 0.57;
  for (const [radius, tube] of [[0.95, 0.025], [0.6, 0.02]]) {                    // decorative rings
    mesh(new THREE.TorusGeometry(radius, tube, 10, 64), 'darkSteel', [0, centreY, frontZ], g);
  }
  for (let i = 0; i < 18; i++) {                                                  // locking bolts
    const a = (i / 18) * Math.PI * 2;
    const bolt = cylinderMesh(0.035, 0.035, 0.05, 'chrome', [Math.cos(a) * 1.06, centreY + Math.sin(a) * 1.06, frontZ + 0.01], g, 12);
    bolt.rotation.x = Math.PI / 2;
  }
  // Spoked wheel handle
  mesh(new THREE.TorusGeometry(0.34, 0.03, 12, 48), 'chrome', [0, centreY, frontZ + 0.14], g);
  for (let i = 0; i < 3; i++) {
    const spoke = boxMesh(0.68, 0.035, 0.035, 'chrome', [0, centreY, frontZ + 0.14], g);
    spoke.rotation.z = (i * Math.PI) / 3;
  }
  const hub = cylinderMesh(0.08, 0.08, 0.16, 'darkSteel', [0, centreY, frontZ + 0.07], g, 24);
  hub.rotation.x = Math.PI / 2;
  // Hinges on the right
  for (const y of [0.75, 2.05]) cylinderMesh(0.09, 0.09, 0.42, 'darkSteel', [1.2, y, frontZ - 0.08], g, 20);
  // Keypad on the left
  const padX = -1.5, padY = 1.35, padZ = backZ + 0.32;
  boxMesh(0.2, 0.3, 0.04, 'blackPlastic', [padX, padY, padZ], g);
  boxMesh(0.03, 0.03, 0.01, 'redLed', [padX + 0.06, padY + 0.11, padZ + 0.022], g).castShadow = false;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    boxMesh(0.04, 0.035, 0.012, 'greyPlastic', [padX - 0.05 + col * 0.05, padY + 0.05 - row * 0.045, padZ + 0.024], g);
  }
  return g;
}

/** A wall of safe-deposit boxes (grid of small steel doors with keyholes). */
function depositBoxes({ w, d, h }) {
  const g = new THREE.Group();
  boxMesh(w, h, d, 'darkSteel', [0, h / 2, 0], g);
  const cols = 16, rows = 9;
  const marginY = 0.12;
  const cellW = (w - 0.1) / cols, cellH = (h - marginY - 0.05) / rows;
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW - 0.015, cellH - 0.015, 0.014), getMaterial('brushedSteel'), cols * rows);
  const keyGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12);
  keyGeo.rotateX(Math.PI / 2);
  const keys = new THREE.InstancedMesh(keyGeo, getMaterial('brass'), cols * rows);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + 0.05 + cellW * (c + 0.5);
    const y = marginY + cellH * (r + 0.5);
    dummy.position.set(x, y, d / 2 + 0.007);
    dummy.updateMatrix();
    doors.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x + cellW * 0.3, y, d / 2 + 0.017);
    dummy.updateMatrix();
    keys.setMatrixAt(i, dummy.matrix);
    i++;
  }
  doors.castShadow = doors.receiveShadow = keys.receiveShadow = true;
  g.add(doors, keys);
  return g;
}

/** Closed glass double doors at the main entrance, plus a hint of night street outside. */
function entranceDoors({ w, h }) {
  const g = new THREE.Group();
  const leafW = w / 2;
  for (const side of [-1, 1]) {
    const cx = side * leafW / 2;
    const glass = boxMesh(leafW - 0.08, h - 0.1, 0.02, 'glass', [cx, h / 2, 0], g);
    glass.castShadow = false;
    glass.renderOrder = 2;
    // Chrome frame around each leaf
    boxMesh(leafW, 0.06, 0.05, 'chrome', [cx, 0.03, 0], g);
    boxMesh(leafW, 0.06, 0.05, 'chrome', [cx, h - 0.03, 0], g);
    for (const e of [-1, 1]) boxMesh(0.05, h, 0.05, 'chrome', [cx + e * (leafW / 2 - 0.025), h / 2, 0], g);
    boxMesh(leafW * 0.6, 0.035, 0.035, 'brushedSteel', [cx, 1.05, 0.07], g); // push bar
  }
  // Outside: dark pavement and a glowing "night city" backdrop (behind = -z)
  const pavement = mesh(floorPlane(4, 2), colorMaterial(0x1b1d22, 0.95), [0, -0.01, -1.1], g);
  pavement.castShadow = false;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#05070d');
  sky.addColorStop(1, '#1c2238');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  const rng = makeRng(99);
  for (let i = 0; i < 9; i++) {                       // distant buildings with lit windows
    const bx = rng() * 512, bw = 40 + rng() * 60, bh = 80 + rng() * 140;
    ctx.fillStyle = '#0b0e16';
    ctx.fillRect(bx, 256 - bh, bw, bh);
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,200,120,0.8)' : 'rgba(120,160,255,0.35)';
      ctx.fillRect(bx + 4 + rng() * (bw - 10), 256 - bh + 6 + rng() * (bh - 14), 4, 6);
    }
  }
  const backdropTex = new THREE.CanvasTexture(canvas);
  backdropTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: backdropTex }));
  backdrop.position.set(0, 1.4, -2.0);
  g.add(backdrop);
  return g;
}

// ===========================================================================
// WALL DECORATIONS (back at z = 0, origin at the item's centre height)
// ===========================================================================

/** Framed painting with a gilded frame, a picture light and a label. */
function painting({ w, h, seed }) {
  const g = new THREE.Group();
  const f = 0.08; // frame width
  boxMesh(w + f * 2, f, 0.05, 'gold', [0, h / 2 + f / 2, 0.025], g);
  boxMesh(w + f * 2, f, 0.05, 'gold', [0, -h / 2 - f / 2, 0.025], g);
  boxMesh(f, h, 0.05, 'gold', [-w / 2 - f / 2, 0, 0.025], g);
  boxMesh(f, h, 0.05, 'gold', [w / 2 + f / 2, 0, 0.025], g);
  boxMesh(w + 0.02, h + 0.02, 0.02, 'blackPlastic', [0, 0, 0.01], g); // backing / inner lip
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTexture(seed), roughness: 0.7 }));
  art.position.z = 0.022;
  art.receiveShadow = true;
  g.add(art);
  // Brass picture light above the frame
  boxMesh(0.02, 0.02, 0.18, 'brass', [0, h / 2 + 0.16, 0.09], g);
  const bar = cylinderMesh(0.025, 0.025, w * 0.55, 'brass', [0, h / 2 + 0.16, 0.18], g, 16);
  bar.rotation.z = Math.PI / 2;
  const glow = boxMesh(w * 0.5, 0.008, 0.02, 'goldGlow', [0, h / 2 + 0.135, 0.18], g);
  glow.castShadow = false;
  // Museum label to the side at eye height
  boxMesh(0.16, 0.09, 0.006, 'whitePaint', [w / 2 + 0.28, -0.3, 0.003], g);
  return g;
}

/** Green illuminated EXIT sign. */
function exitSign() {
  const g = new THREE.Group();
  boxMesh(0.42, 0.17, 0.05, 'whitePaint', [0, 0, 0.025], g);
  const tex = labelTexture('EXIT  ➜', '#0c7a3a', '#ffffff');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.14), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 3 }));
  face.position.z = 0.051;
  g.add(face);
  return g;
}

/** Red fire extinguisher on a wall bracket, with a sign above. */
function extinguisher() {
  const g = new THREE.Group();
  const r = 0.08, z = r + 0.03;
  boxMesh(0.12, 0.05, 0.03, 'darkSteel', [0, 0.05, 0.015], g);                    // bracket
  cylinderMesh(r, r, 0.42, 'redPaint', [0, 0, z], g, 24);                          // body
  mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'redPaint', [0, 0.21, z], g);
  cylinderMesh(0.022, 0.026, 0.07, 'blackPlastic', [0, 0.3, z], g, 12);           // valve
  boxMesh(0.12, 0.015, 0.03, 'chrome', [0.03, 0.34, z], g).rotation.z = -0.25;   // handle
  const hose = cylinderMesh(0.01, 0.01, 0.34, 'rubber', [0.09, 0.14, z + 0.02], g, 8); // hose
  hose.rotation.z = 0.15;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: labelTexture('FIRE', '#b3161b', '#ffffff', 128, 128, 'bold 40px sans-serif'), roughness: 0.5 }));
  sign.position.set(0, 0.65, 0.004);
  g.add(sign);
  return g;
}

/** Ceiling-corner security camera (decorative for now). */
function securityCamera() {
  const g = new THREE.Group();
  boxMesh(0.08, 0.12, 0.02, 'whitePaint', [0, 0, 0.01], g);                       // wall plate
  boxMesh(0.03, 0.03, 0.2, 'whitePaint', [0, 0, 0.11], g);                        // arm
  const head = new THREE.Group();
  head.position.set(0, -0.04, 0.22);
  head.rotation.x = 0.45;                                                          // tilted down
  boxMesh(0.11, 0.09, 0.24, 'whitePaint', [0, 0, 0.06], head);
  const lens = cylinderMesh(0.03, 0.035, 0.03, 'blackPlastic', [0, 0, 0.19], head, 16);
  lens.rotation.x = Math.PI / 2;
  boxMesh(0.012, 0.012, 0.005, 'redLed', [0.035, 0.03, 0.18], head).castShadow = false;
  g.add(head);
  return g;
}

/** Flat rug lying on the floor. */
function rugProp({ w, d, style }) {
  const g = new THREE.Group();
  const r = mesh(floorPlane(w, d, false), style === 'runner' ? 'runner' : 'rug', [0, 0.006, 0], g);
  r.castShadow = false;
  return g;
}

// ---------------------------------------------------------------------------
// The registry: map a `type` name from shared/map.js to its builder function.
// ---------------------------------------------------------------------------
export const PROP_BUILDERS = {
  desk, cabinet, bookshelf, plant, displayCase, bench, receptionDesk, sofa,
  coffeeTable, shelf, crate, vaultDoor, depositBoxes, entranceDoors,
  painting, exitSign, extinguisher, securityCamera, rug: rugProp,
};

/** Build any prop by type name. Unknown types become a pink box (easy to spot). */
export function buildProp(type, params) {
  const builder = PROP_BUILDERS[type];
  if (!builder) {
    console.warn(`No builder for prop type "${type}"`);
    return group(boxMesh(params.w || 0.5, params.h || 0.5, params.d || 0.5, colorMaterial(0xff00ff), [0, (params.h || 0.5) / 2, 0]));
  }
  return builder(params);
}
