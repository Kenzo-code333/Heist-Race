// ============================================================================
// client/src/game/textures.js
// ----------------------------------------------------------------------------
// PROCEDURAL TEXTURES: instead of loading image files, we "paint" textures
// pixel by pixel with math (noise functions) at startup. This gives us wood
// grain, marble veins, carpet fibres, concrete, etc. with zero external assets.
//
// Each generator returns TWO images:
//   - color : what the surface looks like
//   - height: a grey-scale "bump" image (white = raised, black = sunken) that
//             the renderer uses to fake small surface relief (grooves, grout).
//
// All textures TILE seamlessly, so they can repeat across a big floor.
// ============================================================================

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Random numbers you can REPEAT: the same seed always gives the same sequence
// (like Python's random.seed). "mulberry32" is a tiny, well-known generator.
// ---------------------------------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // float in [0, 1)
  };
}

// Hash two integers to a pseudo-random float in [0, 1). Used for "one random
// value per plank / per tile".
function hash2(a, b) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
const fract = (v) => v - Math.floor(v);

// ---------------------------------------------------------------------------
// Tileable "value noise": a grid of random numbers, smoothly blended between.
// Sampling coordinates wrap around every `period` units, so the result tiles.
// fbm() ("fractal Brownian motion") adds several layers of finer noise for a
// natural, organic look.
// ---------------------------------------------------------------------------
class TileNoise {
  constructor(seed, period = 64) {
    this.period = period;
    const rng = makeRng(seed);
    this.grid = new Float32Array(period * period).map(() => rng());
  }

  // (px, py) = after how many cells the pattern repeats. For a seamless tile,
  // pass the number of cells that span the texture (must be whole numbers).
  sample(x, y, px = this.period, py = this.period) {
    const p = this.period;
    const wrap = (i, n) => (((i % n) + n) % n) % p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const x0 = wrap(xi, px), y0 = wrap(yi, py);
    const x1 = wrap(xi + 1, px), y1 = wrap(yi + 1, py);
    const g = this.grid;
    const top = lerp(g[y0 * p + x0], g[y0 * p + x1], fx);
    const bottom = lerp(g[y1 * p + x0], g[y1 * p + x1], fx);
    return lerp(top, bottom, fy); // 0..1
  }

  // u, v in [0,1) texture space; sx, sy = how many noise cells across (integers keep tiling)
  fbm(u, v, sx, sy, octaves = 4) {
    let total = 0, amplitude = 0.5, norm = 0, freq = 1;
    for (let o = 0; o < octaves; o++) {
      total += amplitude * this.sample(u * sx * freq + o * 17, v * sy * freq + o * 31, sx * freq, sy * freq);
      norm += amplitude;
      amplitude *= 0.5;
      freq *= 2;
    }
    return total / norm; // 0..1
  }
}

// ---------------------------------------------------------------------------
// Core painter: calls `pixel(u, v)` for every pixel. `pixel` returns
// [r, g, b, height] with r/g/b in 0..255 and height in 0..1.
// ---------------------------------------------------------------------------
function paint(size, pixel) {
  const colorCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = heightCanvas.width = heightCanvas.height = size;
  const cctx = colorCanvas.getContext('2d');
  const hctx = heightCanvas.getContext('2d');
  const cimg = cctx.createImageData(size, size);
  const himg = hctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = pixel(x / size, y / size);
      const i = (y * size + x) * 4;
      cimg.data[i] = r; cimg.data[i + 1] = g; cimg.data[i + 2] = b; cimg.data[i + 3] = 255;
      const hv = clamp01(h) * 255;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv; himg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  hctx.putImageData(himg, 0, 0);
  return { color: toTexture(colorCanvas, true), height: toTexture(heightCanvas, false) };
}

// Highest texture sharpness the GPU supports when seen at a grazing angle.
// Set once by the renderer (see Renderer.js) before textures are created.
let maxAnisotropy = 4;
export function setMaxAnisotropy(value) { maxAnisotropy = value; }

function toTexture(canvas, isColor) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  // Colour images are stored in sRGB; data images (height) are linear.
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

// Mix two RGB colours (arrays [r,g,b]) by t.
function mixRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ===========================================================================
// THE GENERATORS. Each comment says how many metres one texture tile covers;
// materials.js uses that to keep real-world scale.
// ===========================================================================

/** Oak parquet floor, planks 12.5 cm wide. One tile = 2 m. */
export function parquet(seed = 11) {
  const noise = new TileNoise(seed, 64);
  const rows = 16, plankLength = 0.5; // in tile units (0.5 = 1 m)
  return paint(512, (u, v) => {
    const row = Math.floor(v * rows);
    const rowOffset = hash2(row, 7) * plankLength;
    const along = (u + rowOffset) / plankLength;
    const plank = Math.floor(along);
    const localU = fract(along);
    const localV = fract(v * rows);
    const tone = hash2(row, plank);                     // each plank a bit different
    const grain = noise.fbm(u + tone * 3, v, 4, 96, 4); // stretched along the plank
    const fine = noise.sample(u * 512, v * 512);
    const base = mixRgb([118, 74, 42], [168, 112, 66], tone);
    const shade = 0.75 + grain * 0.45 + fine * 0.06;
    // Dark seams between planks
    const seam = localV < 0.05 || localV > 0.95 || localU < 0.01 || localU > 0.99;
    const k = seam ? 0.35 : shade;
    return [base[0] * k, base[1] * k, base[2] * k, seam ? 0.1 : 0.55 + grain * 0.3];
  });
}

/** Polished marble tiles (2 x 2 tiles per texture). One tile = 2 m. */
export function marble(seed, baseColor, veinColor) {
  const noise = new TileNoise(seed, 32);
  return paint(512, (u, v) => {
    const tileU = fract(u * 2), tileV = fract(v * 2);
    const tileId = Math.floor(u * 2) * 3 + Math.floor(v * 2);
    const warp = noise.fbm(u, v, 4, 4, 5);
    // Veins: thin lines where a warped sine wave crosses zero.
    const wave = Math.sin((u + v + hash2(tileId, 3)) * Math.PI * 2 + warp * 7);
    const vein = Math.pow(1 - Math.abs(wave), 28);
    const cloud = noise.fbm(u, v, 8, 8, 4);
    let c = mixRgb(baseColor, veinColor, clamp01(vein * 0.9 + (cloud - 0.5) * 0.25));
    const grout = tileU < 0.004 || tileU > 0.996 || tileV < 0.004 || tileV > 0.996;
    if (grout) c = mixRgb(c, [40, 40, 40], 0.6);
    return [c[0], c[1], c[2], grout ? 0.0 : 0.6];
  });
}

/** Commercial loop carpet (corridor). One tile = 1 m. */
export function carpet(seed = 21) {
  const noise = new TileNoise(seed, 64);
  return paint(256, (u, v) => {
    const fibres = noise.sample(u * 256, v * 256);
    const mottling = noise.fbm(u, v, 4, 4, 3);
    const loops = (Math.sin(u * Math.PI * 128) * Math.sin(v * Math.PI * 128) + 1) / 2;
    const k = 0.7 + fibres * 0.3 + mottling * 0.2;
    return [46 * k, 52 * k, 66 * k, 0.4 + loops * 0.3 + fibres * 0.3];
  });
}

/** Burgundy rug with gold borders. `runner` = long corridor runner. One tile = whole rug. */
export function rug(seed = 23, runner = false) {
  const noise = new TileNoise(seed, 64);
  return paint(512, (u, v) => {
    const fibres = noise.sample(u * 512, v * 512);
    // Distance to the nearest edge (borders run along both edges)
    const edgeV = Math.min(v, 1 - v);
    const edgeU = runner ? 1 : Math.min(u, 1 - u);
    const edge = Math.min(edgeU, edgeV);
    let c = [112, 24, 30];
    if (edge < 0.04) c = [60, 12, 16];
    else if (edge < 0.07) c = [176, 132, 58];
    else if (edge < 0.1) c = [70, 14, 18];
    else {
      // Inner diamond pattern
      const pu = runner ? u * 24 : u * 6, pv = runner ? v * 3 : v * 6;
      const d = Math.abs(fract(pu) - 0.5) + Math.abs(fract(pv) - 0.5);
      if (d > 0.42 && d < 0.48) c = [150, 108, 50];
    }
    const k = 0.78 + fibres * 0.3;
    return [c[0] * k, c[1] * k, c[2] * k, 0.5 + fibres * 0.5];
  });
}

/** Grey concrete with stains and speckles. One tile = 3 m. */
export function concrete(seed = 31) {
  const noise = new TileNoise(seed, 64);
  const speck = new TileNoise(seed + 1, 128);
  return paint(512, (u, v) => {
    const big = noise.fbm(u, v, 4, 4, 5);
    const stains = Math.pow(noise.fbm(u + 0.37, v + 0.71, 2, 2, 3), 2.2);
    const s = speck.sample(u * 512, v * 512);
    const k = 0.55 + big * 0.35 - stains * 0.25 + (s > 0.93 ? 0.12 : 0) - (s < 0.04 ? 0.1 : 0);
    return [150 * k, 150 * k, 146 * k, big * 0.7 + s * 0.3];
  });
}

/** Steel diamond-plate floor (vault room). One tile = 0.6 m. */
export function diamondPlate(seed = 41) {
  const noise = new TileNoise(seed, 64);
  return paint(512, (u, v) => {
    // Raised elongated bumps alternating direction in a checker grid
    const cells = 6;
    const cu = Math.floor(u * cells), cv = Math.floor(v * cells);
    let lu = fract(u * cells) - 0.5, lv = fract(v * cells) - 0.5;
    if ((cu + cv) % 2 === 0) [lu, lv] = [lv, -lu];
    const r1 = lu + lv, r2 = lu - lv; // rotate 45 degrees
    const bump = Math.max(0, 1 - Math.hypot(r1 / 0.42, r2 / 0.11));
    const wear = noise.fbm(u, v, 4, 4, 4);
    const scratches = noise.sample(u * 4, v * 512, 4, 512);
    const k = 0.42 + wear * 0.2 + bump * 0.18 + scratches * 0.05;
    return [140 * k, 146 * k, 154 * k, bump * 0.9 + 0.05];
  });
}

/** Painted plaster: near-white so it can be tinted per room. One tile = 2 m. */
export function plaster(seed = 51) {
  const noise = new TileNoise(seed, 64);
  return paint(256, (u, v) => {
    const n = noise.fbm(u, v, 16, 16, 4);
    const k = 228 + (n - 0.5) * 22;
    return [k, k, k, n];
  });
}

/** Acoustic ceiling tiles in a metal grid (60 cm tiles). One tile = 1.2 m. */
export function ceilingTiles(seed = 61) {
  const noise = new TileNoise(seed, 128);
  return paint(256, (u, v) => {
    const tu = fract(u * 2), tv = fract(v * 2);
    const grid = tu < 0.02 || tu > 0.98 || tv < 0.02 || tv > 0.98;
    if (grid) return [196, 198, 200, 0.2];
    const pits = noise.sample(u * 256, v * 256);
    const k = 214 + (pits - 0.5) * 30;
    return [k, k, k - 4, pits > 0.8 ? 0.3 : 0.7];
  });
}

/** Dark walnut wood for furniture and frames. One tile = 1 m. */
export function walnut(seed = 71) {
  const noise = new TileNoise(seed, 64);
  return paint(512, (u, v) => {
    const warp = noise.fbm(u, v, 2, 8, 3);
    const rings = fract((v + warp * 0.12) * 40);
    const ringLine = Math.pow(Math.abs(rings - 0.5) * 2, 6);
    const fine = noise.sample(u * 32, v * 512, 32, 512);
    const k = 0.75 + ringLine * 0.35 + fine * 0.12;
    return [78 * k, 48 * k, 30 * k, 0.5 + ringLine * 0.3 + fine * 0.2];
  });
}

/** Brushed metal (streaks along u). One tile = 1 m. */
export function brushedMetal(seed = 81) {
  const noise = new TileNoise(seed, 128);
  return paint(256, (u, v) => {
    const streak = noise.fbm(u, v, 2, 128, 3);
    const k = 0.8 + streak * 0.25;
    return [170 * k, 174 * k, 180 * k, streak];
  });
}

/** Woven fabric (sofas, clothing). One tile = 0.25 m. Grey so it can be tinted. */
export function fabric(seed = 91) {
  const noise = new TileNoise(seed, 64);
  return paint(256, (u, v) => {
    const warpThread = (Math.sin(u * Math.PI * 64) + 1) / 2;
    const weftThread = (Math.sin(v * Math.PI * 64) + 1) / 2;
    const over = (Math.floor(u * 32) + Math.floor(v * 32)) % 2 === 0;
    const weave = over ? warpThread : weftThread;
    const fuzz = noise.sample(u * 256, v * 256);
    const k = 170 + weave * 50 + (fuzz - 0.5) * 30;
    return [k, k, k, weave * 0.7 + fuzz * 0.3];
  });
}

// ---------------------------------------------------------------------------
// PAINTINGS: little procedural artworks for the gallery. These are drawn with
// the canvas 2D drawing API (shapes and gradients) rather than per pixel.
// ---------------------------------------------------------------------------
export function paintingTexture(seed) {
  const rng = makeRng(seed * 977);
  const w = 512, h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const hue = Math.floor(rng() * 360);

  if (seed % 2 === 1) {
    // --- Landscape: sky gradient, sun, layered hills ---
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `hsl(${hue}, 45%, 28%)`);
    sky.addColorStop(1, `hsl(${(hue + 40) % 360}, 65%, 70%)`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `hsla(${(hue + 60) % 360}, 90%, 85%, 0.9)`;
    ctx.beginPath();
    ctx.arc(w * (0.2 + rng() * 0.6), h * (0.25 + rng() * 0.15), 30 + rng() * 25, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 0; layer < 4; layer++) {
      const baseY = h * (0.45 + layer * 0.14);
      ctx.fillStyle = `hsl(${(hue + 180 + layer * 12) % 360}, ${30 + layer * 8}%, ${38 - layer * 8}%)`;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = baseY - Math.sin(x * 0.01 + layer * 2 + rng() * 0.2) * 20 - Math.sin(x * 0.033 + layer) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    }
  } else {
    // --- Abstract colour fields (gallery "modern art") ---
    ctx.fillStyle = `hsl(${hue}, 40%, 18%)`;
    ctx.fillRect(0, 0, w, h);
    const fields = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < fields; i++) {
      ctx.filter = 'blur(6px)';
      ctx.fillStyle = `hsla(${(hue + 30 + i * 70) % 360}, ${50 + rng() * 30}%, ${35 + rng() * 25}%, 0.92)`;
      const top = 30 + (i * (h - 60)) / fields;
      ctx.fillRect(36, top + 8, w - 72, (h - 60) / fields - 22);
    }
    ctx.filter = 'none';
  }

  // Brush-stroke texture over everything
  for (let i = 0; i < 1400; i++) {
    ctx.strokeStyle = `rgba(${rng() > 0.5 ? 255 : 0},${rng() > 0.5 ? 255 : 0},${rng() > 0.5 ? 255 : 0},0.035)`;
    ctx.lineWidth = 1 + rng() * 3;
    const x = rng() * w, y = rng() * h, len = 6 + rng() * 14, ang = rng() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
