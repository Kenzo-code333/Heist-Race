// ============================================================================
// client/src/game/LevelBuilder.js
// ----------------------------------------------------------------------------
// Reads the building DATA from shared/map.js and builds the 3D scene from it:
// floors, ceilings, walls (with trim), door frames, lights and all the props.
//
// It also returns `cameraBlockers`: 3D boxes the camera must not pass through
// (so the third-person camera never ends up inside or behind a wall).
// ============================================================================

import * as THREE from 'three';
import { ROOMS, WALLS, DOORWAYS, OBSTACLES, DECOR, roomAt } from '../../../shared/map.js';
import { WALL_HEIGHT, WALL_THICKNESS, DOOR_HEIGHT } from '../../../shared/constants.js';
import { boxGeo, boxMesh, mesh, floorPlane } from './geometry.js';
import { getMaterial } from './materials.js';
import { buildProp } from './props.js';

// Which way an object faces → rotation around the vertical (y) axis.
// Our props face +z by default ("south" on the floor plan).
const FACE_ROTATION = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

/**
 * Build the whole level and add it to the scene.
 * @param {THREE.Scene} scene
 * @returns {{ cameraBlockers: THREE.Box3[] }}
 */
export function buildLevel(scene) {
  const level = new THREE.Group();
  level.name = 'level';
  const cameraBlockers = [];

  buildFloorsAndCeilings(level);
  buildWalls(level, cameraBlockers);
  buildDoorways(level, cameraBlockers);
  buildLights(level);
  buildObstacles(level, cameraBlockers);
  buildDecor(level);

  scene.add(level);
  return { cameraBlockers };
}

// ---------------------------------------------------------------------------
function buildFloorsAndCeilings(level) {
  for (const room of ROOMS) {
    const w = room.maxX - room.minX;
    const d = room.maxZ - room.minZ;
    const cx = (room.minX + room.maxX) / 2;
    const cz = (room.minZ + room.maxZ) / 2;

    const floor = mesh(floorPlane(w, d), room.floor, [cx, 0, cz], level);
    floor.castShadow = false;

    // The ceiling is the same rectangle, flipped to face downwards.
    const ceilingGeo = floorPlane(w, d);
    ceilingGeo.rotateX(Math.PI);
    const ceiling = mesh(ceilingGeo, 'ceiling', [cx, WALL_HEIGHT, cz], level);
    ceiling.castShadow = false;
  }
}

// Pick the material for one side of a wall: look a little way out from that
// side, find which room is there, and use that room's wall finish.
function wallMaterialAt(x, z) {
  const room = roomAt(x, z);
  return getMaterial(room ? room.walls : 'plaster');
}

// Build a box whose 4 side faces each get the right room's wall material.
// Box face order in Three.js: +x, -x, +y, -y, +z, -z.
function roomAwareBox(minX, maxX, minY, maxY, minZ, maxZ) {
  const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const probe = 0.3; // how far out from the face we look for a room
  const materials = [
    wallMaterialAt(maxX + probe, cz), // +x face
    wallMaterialAt(minX - probe, cz), // -x face
    getMaterial('plaster'),           // top (hidden by the ceiling)
    getMaterial('plaster'),           // bottom
    wallMaterialAt(cx, maxZ + probe), // +z face
    wallMaterialAt(cx, minZ - probe), // -z face
  ];
  const m = new THREE.Mesh(boxGeo(w, h, d), materials);
  m.position.set(cx, cy, cz);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// A long wall (e.g. the whole north side) can border several rooms. To give
// each room its own wall finish, cut the wall into pieces at room boundaries.
const ROOM_EDGES_X = [...new Set(ROOMS.flatMap((r) => [r.minX, r.maxX]))];
const ROOM_EDGES_Z = [...new Set(ROOMS.flatMap((r) => [r.minZ, r.maxZ]))];

function splitAtRoomEdges(wall) {
  const alongX = wall.maxX - wall.minX > wall.maxZ - wall.minZ;
  const [start, end] = alongX ? [wall.minX, wall.maxX] : [wall.minZ, wall.maxZ];
  const cuts = (alongX ? ROOM_EDGES_X : ROOM_EDGES_Z)
    .filter((c) => c > start + 0.15 && c < end - 0.15)
    .sort((a, b) => a - b);
  const bounds = [start, ...cuts, end];
  const pieces = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    pieces.push(alongX
      ? { ...wall, minX: bounds[i], maxX: bounds[i + 1] }
      : { ...wall, minZ: bounds[i], maxZ: bounds[i + 1] });
  }
  return pieces;
}

function buildWalls(level, cameraBlockers) {
  for (const wall of WALLS) {
    for (const piece of splitAtRoomEdges(wall)) {
      level.add(roomAwareBox(piece.minX, piece.maxX, 0, piece.h, piece.minZ, piece.maxZ));
    }

    // Skirting board (bottom) and crown moulding (top): slightly thicker boxes.
    const w = wall.maxX - wall.minX;
    const d = wall.maxZ - wall.minZ;
    const cx = (wall.minX + wall.maxX) / 2;
    const cz = (wall.minZ + wall.maxZ) / 2;
    const grow = 0.025;
    boxMesh(w + grow * 2, 0.12, d + grow * 2, 'trim', [cx, 0.06, cz], level);
    boxMesh(w + grow * 1.2, 0.07, d + grow * 1.2, 'trim', [cx, WALL_HEIGHT - 0.035, cz], level);

    cameraBlockers.push(new THREE.Box3(
      new THREE.Vector3(wall.minX, 0, wall.minZ),
      new THREE.Vector3(wall.maxX, wall.h, wall.maxZ),
    ));
  }
}

// Above each door gap there is still wall (the "lintel"), plus a wooden frame.
function buildDoorways(level, cameraBlockers) {
  const half = WALL_THICKNESS / 2;
  const casing = 0.08;         // width of the wooden frame trim
  const casingDepth = WALL_THICKNESS + 0.05;

  for (const door of DOORWAYS) {
    const alongX = door.axis === 'x';
    const halfGap = door.width / 2;
    // Lintel box above the gap
    const minX = alongX ? door.x - halfGap : door.x - half;
    const maxX = alongX ? door.x + halfGap : door.x + half;
    const minZ = alongX ? door.z - half : door.z - halfGap;
    const maxZ = alongX ? door.z + half : door.z + halfGap;
    level.add(roomAwareBox(minX, maxX, DOOR_HEIGHT, WALL_HEIGHT, minZ, maxZ));
    cameraBlockers.push(new THREE.Box3(new THREE.Vector3(minX, DOOR_HEIGHT, minZ), new THREE.Vector3(maxX, WALL_HEIGHT, maxZ)));

    // Wooden door frame: two side jambs + a head piece. Built along x, then
    // rotated for doors in walls that run along z.
    const frame = new THREE.Group();
    for (const side of [-1, 1]) {
      boxMesh(casing, DOOR_HEIGHT, casingDepth, 'walnut', [side * (halfGap + casing / 2 - 0.02), DOOR_HEIGHT / 2, 0], frame);
    }
    boxMesh(door.width + casing * 2 - 0.04, casing, casingDepth, 'walnut', [0, DOOR_HEIGHT + casing / 2, 0], frame);
    // Brass threshold strip on the floor
    const threshold = boxMesh(door.width, 0.008, WALL_THICKNESS + 0.02, 'brass', [0, 0.004, 0], frame);
    threshold.castShadow = false;
    frame.position.set(door.x, 0, door.z);
    if (!alongX) frame.rotation.y = Math.PI / 2;
    level.add(frame);
  }
}

// One ceiling light fixture + a real light source per entry in room.lights.
// Only the FIRST light in each room casts shadows (shadows are expensive).
function buildLights(level) {
  for (const room of ROOMS) {
    room.lights.forEach(([x, z], index) => {
      // Visible fixture: a recessed glowing panel with a metal rim.
      boxMesh(0.66, 0.03, 0.66, 'brushedSteel', [x, WALL_HEIGHT - 0.01, z], level).castShadow = false;
      const panel = boxMesh(0.6, 0.02, 0.6, 'lightPanel', [x, WALL_HEIGHT - 0.025, z], level);
      panel.castShadow = false;

      // The light itself: a spotlight pointing straight down with soft edges.
      const light = new THREE.SpotLight(room.mood.color, 45 * room.mood.intensity);
      light.position.set(x, WALL_HEIGHT - 0.05, z);
      light.target.position.set(x, 0, z);
      light.angle = Math.PI / 3;
      light.penumbra = 0.9;
      light.decay = 2;
      if (index === 0) {
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.02;
        light.shadow.radius = 4;
        light.shadow.camera.near = 0.2;
        light.shadow.camera.far = 12;
      }
      level.add(light, light.target);
    });

    // One weak omni light per room, just under the ceiling, so the upper walls
    // and the ceiling aren't pitch black (real rooms have light bouncing around).
    const fill = new THREE.PointLight(room.mood.color, 2.2 * room.mood.intensity, 14, 1.5);
    fill.position.set((room.minX + room.maxX) / 2, WALL_HEIGHT - 0.7, (room.minZ + room.maxZ) / 2);
    level.add(fill);
  }
}

function placeOnPlan(object, x, y, z, face) {
  object.position.set(x, y, z);
  object.rotation.y = FACE_ROTATION[face] ?? 0;
}

function buildObstacles(level, cameraBlockers) {
  OBSTACLES.forEach((o, index) => {
    // Map sizes are in world axes. If the object is turned sideways (faces
    // east/west), its own width is the world depth and vice versa.
    const sideways = o.face === 'e' || o.face === 'w';
    const params = { w: sideways ? o.d : o.w, d: sideways ? o.w : o.d, h: o.h, seed: index + 1 };
    const prop = buildProp(o.type, params);
    placeOnPlan(prop, o.x, 0, o.z, o.face);
    level.add(prop);

    cameraBlockers.push(new THREE.Box3(
      new THREE.Vector3(o.x - o.w / 2, 0, o.z - o.d / 2),
      new THREE.Vector3(o.x + o.w / 2, o.h, o.z + o.d / 2),
    ));
  });
}

function buildDecor(level) {
  DECOR.forEach((item, index) => {
    const prop = buildProp(item.type, { seed: index + 1, ...item });
    placeOnPlan(prop, item.x, item.y ?? 0, item.z, item.face);
    level.add(prop);
  });
}
