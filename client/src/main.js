// ============================================================================
// client/src/main.js — ENTRY POINT of the browser game
// ----------------------------------------------------------------------------
// Wires all the pieces together and runs the GAME LOOP: ~60 times per second
//   1. read input (keyboard + mouse)
//   2. move the thief using the shared movement rules (with collisions)
//   3. animate the thief model and move the camera
//   4. update the HUD and draw the frame
//
// Milestone 1 runs movement here in the browser. In Milestone 2 the server
// becomes the authority, running the very same shared/movement.js code.
// ============================================================================

import { Renderer } from './game/Renderer.js';
import { buildLevel } from './game/LevelBuilder.js';
import { ThiefModel } from './game/ThiefModel.js';
import { ThirdPersonCamera } from './game/ThirdPersonCamera.js';
import { Input } from './input/Input.js';
import { Hud } from './ui/Hud.js';
import { Network } from './net/Network.js';
import { stepMovement } from '../../shared/movement.js';
import { COLLIDERS, SPAWN_POINTS, roomAt } from '../../shared/map.js';

const hud = new Hud();
const renderer = new Renderer(document.getElementById('game'));
new Network((online) => hud.setServerStatus(online));
const input = new Input(renderer.renderer.domElement);

// The player's state. (In JavaScript, `const` means the variable can't be
// re-assigned, but the object's fields can still change — like a Python dict.)
const spawn = SPAWN_POINTS[0];
const player = { x: spawn.x, z: spawn.z, moveMode: 'idle', crouching: false, facing: 0, speed: 0 };

let thief, camera;

// Building the level generates many textures, which takes a moment. We wait
// one frame first so the "Building the vault…" text can appear on screen.
requestAnimationFrame(() => setTimeout(start, 0));

function start() {
  const { cameraBlockers } = buildLevel(renderer.scene);

  thief = new ThiefModel(0xe8b04a);
  renderer.scene.add(thief.root);

  camera = new ThirdPersonCamera(renderer.camera, cameraBlockers);
  camera.yaw = 0; // spawn facing north, towards the corridor

  // Compile all shaders now, so the first frames don't stutter.
  renderer.renderer.compile(renderer.scene, renderer.camera);

  // Start / pause handling: click to capture the mouse, Esc to release it.
  hud.playButton.addEventListener('click', () => input.requestLock());
  input.onLockChange = (locked) => hud.showOverlay(!locked);
  hud.setReady();

  // Handy for debugging in the browser console (development only).
  if (import.meta.env.DEV) window.heist = { player, camera, renderer, input };

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// Turn smoothly from angle `current` towards `target` (handles wrap-around).
function turnTowards(current, target, maxStep) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round, -PI..PI
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

let lastTime = 0;
function loop(now) {
  // dt = seconds since the previous frame (capped so a pause doesn't cause a huge jump)
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // 1) Input
  const { dx, dy } = input.consumeMouse();
  camera.rotate(dx, dy);
  const move = input.getMovement();

  // 2) Movement (shared rules + collision)
  const before = { x: player.x, z: player.z };
  const result = stepMovement(player, { ...move, yaw: camera.yaw }, dt, COLLIDERS);
  player.x = result.x;
  player.z = result.z;
  player.moveMode = result.moveMode;
  player.crouching = move.crouch;
  player.speed = dt > 0 ? Math.hypot(player.x - before.x, player.z - before.z) / dt : 0;

  // Face the direction we're moving in (yaw convention: 0 = facing -z).
  if (result.moveMode !== 'idle') {
    const targetFacing = Math.atan2(-result.dirX, -result.dirZ);
    player.facing = turnTowards(player.facing, targetFacing, dt * 12);
  }

  // 3) Visuals
  thief.root.position.set(player.x, 0, player.z);
  thief.root.rotation.y = player.facing;
  thief.update(dt, player.speed, player.crouching);
  camera.update(dt, player, player.crouching);

  // 4) HUD + draw
  hud.setRoom(roomAt(player.x, player.z)?.name ?? '—');
  hud.setStance(player.moveMode, player.crouching);
  renderer.render();

  requestAnimationFrame(loop);
}
