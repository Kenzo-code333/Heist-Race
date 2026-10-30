// ============================================================================
// shared/map.js
// ----------------------------------------------------------------------------
// The building layout, described as plain DATA (numbers and lists), not 3D.
//
//   - The client reads it to BUILD the 3D scene (walls, floors, furniture).
//   - The server will read it (Milestone 2+) to run COLLISIONS.
//
// Because both use this exact file, what you see is what the server simulates.
//
// COORDINATES (looking at the floor plan from above):
//   x grows to the RIGHT (east), z grows DOWN the page (south).
//   In 3D, y is UP. A point on the floor plan (x, z) is (x, 0, z) in 3D.
//   The building spans x = 0..30 and z = 0..20 (30 m x 20 m).
//
//   z=0  +-----------+------------------------+
//        |  OFFICE   |        GALLERY         |
//        |           D                        |
//   z=8  +----D------+-----------D------------+
//        |               CORRIDOR             |
//   z=12 +----D------+---D---+------D---------+
//        |  LOBBY    D STORE |   VAULT ROOM   |
//        |  (spawn)  |       |               V|
//   z=20 +---[ENTRANCE]------+----------------+
//       x=0         x=12    x=19            x=30
//   (D = doorway, V = vault door)
// ============================================================================

import { WALL_THICKNESS, WALL_HEIGHT, DOOR_WIDTH, EYE_HEIGHT } from './constants.js';

// ---------------------------------------------------------------------------
// 1) ROOMS: rectangles used for floor/ceiling materials, lights and labels.
//    `lights` = ceiling light positions [x, z]. `mood` = light colour/strength.
// ---------------------------------------------------------------------------
export const ROOMS = [
  {
    id: 'office', name: 'Office',
    minX: 0, maxX: 12, minZ: 0, maxZ: 8,
    floor: 'parquet', walls: 'officeWall',
    lights: [[3.5, 4], [8.5, 4]], mood: { color: 0xfff1dc, intensity: 1.0 },
  },
  {
    id: 'gallery', name: 'Gallery',
    minX: 12, maxX: 30, minZ: 0, maxZ: 8,
    floor: 'darkMarble', walls: 'galleryWall',
    lights: [[16, 4], [21, 4], [26, 4]], mood: { color: 0xffe2b8, intensity: 0.9 },
  },
  {
    id: 'corridor', name: 'Corridor',
    minX: 0, maxX: 30, minZ: 8, maxZ: 12,
    floor: 'carpet', walls: 'corridorWall',
    lights: [[5, 10], [15, 10], [25, 10]], mood: { color: 0xdce8ff, intensity: 0.6 },
  },
  {
    id: 'lobby', name: 'Lobby',
    minX: 0, maxX: 12, minZ: 12, maxZ: 20,
    floor: 'whiteMarble', walls: 'lobbyWall',
    lights: [[3.5, 16], [8.5, 16]], mood: { color: 0xfff4e6, intensity: 1.0 },
  },
  {
    id: 'storage', name: 'Storage',
    minX: 12, maxX: 19, minZ: 12, maxZ: 20,
    floor: 'concrete', walls: 'storageWall',
    lights: [[15.5, 16]], mood: { color: 0xe8f0ff, intensity: 0.7 },
  },
  {
    id: 'vaultRoom', name: 'Vault Room',
    minX: 19, maxX: 30, minZ: 12, maxZ: 20,
    floor: 'steelFloor', walls: 'vaultWall',
    lights: [[22, 16], [27, 16]], mood: { color: 0xd8e6ff, intensity: 0.9 },
  },
];

// ---------------------------------------------------------------------------
// 2) WALL LINES: each wall is a straight line (its centre line) with optional
//    door positions along it. A helper below cuts gaps for the doors and turns
//    everything into rectangles ("boxes") the collision code understands.
//      axis 'x' = wall runs along x (horizontal on the plan), fixed z
//      axis 'z' = wall runs along z (vertical on the plan), fixed x
//      doors    = centre positions of doorway gaps along the wall, or
//                 { at, width } for a gap that isn't the standard width
// ---------------------------------------------------------------------------
const WALL_LINES = [
  // Exterior walls
  { axis: 'x', at: 0,  from: 0, to: 30, doors: [] },   // north
  { axis: 'x', at: 20, from: 0, to: 30, doors: [{ at: 6, width: 2.2 }] }, // south: main entrance (glass doors, closed for now)
  { axis: 'z', at: 0,  from: 0, to: 20, doors: [] },   // west
  { axis: 'z', at: 30, from: 0, to: 20, doors: [] },   // east
  // Interior walls
  { axis: 'x', at: 8,  from: 0, to: 30, doors: [6, 21] },        // office/gallery | corridor
  { axis: 'x', at: 12, from: 0, to: 30, doors: [6, 15.5, 25] },  // corridor | lobby/storage/vault
  { axis: 'z', at: 12, from: 0, to: 8,  doors: [4] },            // office | gallery
  { axis: 'z', at: 12, from: 12, to: 20, doors: [16] },          // lobby | storage
  { axis: 'z', at: 19, from: 12, to: 20, doors: [] },            // storage | vault room
];

// ---------------------------------------------------------------------------
// 3) FURNITURE / OBSTACLES: things you bump into.
//    x, z = centre on the floor plan; w = size along x; d = size along z;
//    h = height; face = which way the front of the object points
//    ('n' = -z, 's' = +z, 'e' = +x, 'w' = -x). Only right angles are used,
//    so every obstacle's footprint is a simple axis-aligned rectangle.
// ---------------------------------------------------------------------------
export const OBSTACLES = [
  // --- Office ---
  { type: 'desk', x: 2.6, z: 2.2, w: 1.6, d: 0.8, h: 0.76, face: 's' },
  { type: 'desk', x: 6.0, z: 2.2, w: 1.6, d: 0.8, h: 0.76, face: 's' },
  { type: 'desk', x: 2.6, z: 5.4, w: 1.6, d: 0.8, h: 0.76, face: 'n' },
  { type: 'cabinet', x: 10.4, z: 0.45, w: 0.5, d: 0.6, h: 1.32, face: 's' },
  { type: 'cabinet', x: 11.0, z: 0.45, w: 0.5, d: 0.6, h: 1.32, face: 's' },
  { type: 'bookshelf', x: 0.33, z: 5.6, w: 0.42, d: 2.0, h: 2.1, face: 'e' },
  { type: 'plant', x: 11.35, z: 7.3, w: 0.55, d: 0.55, h: 1.4, face: 's' },

  // --- Gallery ---
  { type: 'displayCase', x: 16, z: 2.5, w: 1.0, d: 1.0, h: 1.55, face: 's' },
  { type: 'displayCase', x: 21, z: 2.5, w: 1.0, d: 1.0, h: 1.55, face: 's' },
  { type: 'displayCase', x: 26, z: 2.5, w: 1.0, d: 1.0, h: 1.55, face: 's' },
  { type: 'displayCase', x: 18.5, z: 5.6, w: 1.0, d: 1.0, h: 1.55, face: 's' },
  { type: 'displayCase', x: 23.5, z: 5.6, w: 1.0, d: 1.0, h: 1.55, face: 's' },
  { type: 'bench', x: 21, z: 4.25, w: 2.0, d: 0.5, h: 0.45, face: 's' },

  // --- Corridor ---
  { type: 'plant', x: 0.5, z: 8.6, w: 0.55, d: 0.55, h: 1.4, face: 'e' },
  { type: 'plant', x: 29.5, z: 11.4, w: 0.55, d: 0.55, h: 1.4, face: 'w' },

  // --- Lobby ---
  { type: 'entranceDoors', x: 6, z: 20, w: 2.2, d: 0.2, h: 2.2, face: 'n' }, // closed glass doors fill the entrance gap
  { type: 'receptionDesk', x: 3.0, z: 15.2, w: 3.2, d: 0.9, h: 1.1, face: 's' },
  { type: 'sofa', x: 9.6, z: 19.2, w: 2.2, d: 0.9, h: 0.85, face: 'n' },
  { type: 'coffeeTable', x: 9.6, z: 17.8, w: 1.2, d: 0.6, h: 0.42, face: 'n' },
  { type: 'plant', x: 0.5, z: 19.4, w: 0.55, d: 0.55, h: 1.4, face: 'n' },
  { type: 'plant', x: 11.5, z: 12.6, w: 0.55, d: 0.55, h: 1.4, face: 'w' },

  // --- Storage ---
  { type: 'shelf', x: 18.55, z: 16.0, w: 0.6, d: 3.0, h: 2.2, face: 'w' },
  { type: 'shelf', x: 15.6, z: 19.55, w: 3.0, d: 0.6, h: 2.2, face: 'n' },
  { type: 'crate', x: 13.0, z: 13.0, w: 0.9, d: 0.9, h: 0.9, face: 's' },
  { type: 'crate', x: 12.85, z: 19.1, w: 1.0, d: 1.0, h: 1.0, face: 'n' },

  // --- Vault room ---
  { type: 'vaultDoor', x: 29.55, z: 16.0, w: 0.7, d: 3.4, h: 2.8, face: 'w' },
  { type: 'depositBoxes', x: 24.5, z: 19.75, w: 6.0, d: 0.4, h: 2.4, face: 'n' },
  { type: 'desk', x: 21.0, z: 13.6, w: 1.6, d: 0.8, h: 0.76, face: 's' },
];

// ---------------------------------------------------------------------------
// 4) DECORATIONS: wall-mounted or flat things you can't bump into.
//    For wall items, (x, z) is the wall surface point and `face` is the
//    direction the item faces (into the room). y = height of its centre.
// ---------------------------------------------------------------------------
export const DECOR = [
  // Paintings in the gallery (they become stealable loot in Milestone 6)
  { type: 'painting', x: 15, z: 0.1, y: 1.65, w: 1.6, h: 1.1, face: 's', seed: 1 },
  { type: 'painting', x: 19, z: 0.1, y: 1.65, w: 1.2, h: 1.5, face: 's', seed: 2 },
  { type: 'painting', x: 23, z: 0.1, y: 1.65, w: 2.0, h: 1.2, face: 's', seed: 3 },
  { type: 'painting', x: 27, z: 0.1, y: 1.65, w: 1.3, h: 1.0, face: 's', seed: 4 },
  { type: 'painting', x: 29.9, z: 4, y: 1.65, w: 1.8, h: 1.3, face: 'w', seed: 5 },
  // A couple of paintings elsewhere
  { type: 'painting', x: 0.1, z: 2.0, y: 1.6, w: 0.9, h: 0.7, face: 'e', seed: 6 },
  { type: 'painting', x: 0.1, z: 16, y: 1.7, w: 1.4, h: 1.0, face: 'e', seed: 7 },
  // Corridor details
  { type: 'exitSign', x: 6, z: 11.9, y: 2.5, face: 'n' },
  { type: 'extinguisher', x: 10, z: 8.1, y: 0.5, face: 's' },
  { type: 'extinguisher', x: 20, z: 11.9, y: 0.5, face: 'n' },
  { type: 'securityCamera', x: 29.9, z: 8.2, y: 2.75, face: 'w' },
  { type: 'securityCamera', x: 12.1, z: 0.2, y: 2.75, face: 'e' },
  // Lobby rug
  { type: 'rug', x: 9.6, z: 18.4, w: 3.2, d: 2.4 },
  // Long carpet runner down the corridor
  { type: 'rug', x: 15, z: 10, w: 28, d: 1.6, style: 'runner' },
];

// GUARD PATROL ROUTES: each guard walks between its waypoints in a loop
// (the server finds the way around walls by itself). `wait` = seconds spent
// standing and looking around at that point.
export const GUARD_ROUTES = [
  {
    id: 'g1',
    waypoints: [
      { x: 3, z: 10, wait: 2 }, { x: 27, z: 10, wait: 0 }, { x: 25.5, z: 6.2, wait: 2.5 },
      { x: 14.5, z: 6.5, wait: 0 }, { x: 8.5, z: 4.3, wait: 2 }, { x: 6, z: 9.8, wait: 0 },
    ],
  },
];

// Where players appear at the start: one spot per player slot (max 6).
export const SPAWN_POINTS = [
  { x: 6, z: 18 }, { x: 7.2, z: 18 }, { x: 4.8, z: 18 },
  { x: 6, z: 17 }, { x: 7.2, z: 17 }, { x: 4.8, z: 17 },
];

// ===========================================================================
// HELPER: turn the wall lines into solid boxes, cutting gaps for doors.
// Returns { walls, doorways }:
//   walls    = [{ minX, maxX, minZ, maxZ, h }]  (solid rectangles)
//   doorways = [{ x, z, axis, width }]          (centres of door gaps)
// ===========================================================================
function buildWalls(lines) {
  const half = WALL_THICKNESS / 2;
  const walls = [];
  const doorways = [];

  for (const line of lines) {
    // Work out the solid pieces between the door gaps, as [start, end] pairs.
    // We extend the outer ends by half a thickness so corners close neatly.
    const pieces = [];
    let cursor = line.from - half;
    // Normalise doors to { at, width } objects, sorted along the wall.
    const doors = line.doors
      .map((d) => (typeof d === 'number' ? { at: d, width: DOOR_WIDTH } : d))
      .sort((a, b) => a.at - b.at);
    for (const door of doors) {
      pieces.push([cursor, door.at - door.width / 2]);
      cursor = door.at + door.width / 2;
      doorways.push(line.axis === 'x'
        ? { x: door.at, z: line.at, axis: 'x', width: door.width }
        : { x: line.at, z: door.at, axis: 'z', width: door.width });
    }
    pieces.push([cursor, line.to + half]);

    // Convert each piece into a rectangle with real thickness.
    for (const [start, end] of pieces) {
      if (end - start < 0.01) continue; // skip zero-length leftovers
      if (line.axis === 'x') {
        walls.push({ minX: start, maxX: end, minZ: line.at - half, maxZ: line.at + half, h: WALL_HEIGHT });
      } else {
        walls.push({ minX: line.at - half, maxX: line.at + half, minZ: start, maxZ: end, h: WALL_HEIGHT });
      }
    }
  }
  return { walls, doorways };
}

const { walls, doorways } = buildWalls(WALL_LINES);
export const WALLS = walls;
export const DOORWAYS = doorways;

// Obstacles converted to the same rectangle format as walls.
const obstacleBoxes = OBSTACLES.map((o) => ({
  minX: o.x - o.w / 2, maxX: o.x + o.w / 2,
  minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2,
  h: o.h,
}));

// EVERYTHING the player can bump into. Collision code only needs this list.
export const COLLIDERS = [...WALLS, ...obstacleBoxes];

// What blocks a guard's VIEW of a thief: walls, plus furniture taller than the
// thief's eyes. So crouching behind the reception desk hides you, standing doesn't.
export function visionBlockers(targetCrouching) {
  return targetCrouching ? VISION_BLOCKERS_CROUCHED : VISION_BLOCKERS_STANDING;
}
export const VISION_BLOCKERS_STANDING = [...WALLS, ...obstacleBoxes.filter((b) => b.h >= EYE_HEIGHT.standing)];
export const VISION_BLOCKERS_CROUCHED = [...WALLS, ...obstacleBoxes.filter((b) => b.h >= EYE_HEIGHT.crouching)];

// Find which room a floor point is in (returns the room object or null).
export function roomAt(x, z) {
  return ROOMS.find((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) || null;
}
