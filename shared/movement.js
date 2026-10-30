// ============================================================================
// shared/movement.js
// ----------------------------------------------------------------------------
// The movement RULES: given a thief's state and the player's input, where does
// the thief end up after `dt` seconds? This is a pure function of its inputs,
// so the server (authoritative, from Milestone 2) and the client (for instant
// feedback) can run the exact same code and get the same answer.
// ============================================================================

import { SPEED, PLAYER_RADIUS } from './constants.js';
import { resolveCircleVsBoxes } from './collision.js';

// Never move more than this per collision check, so fast movement or a lag
// spike can't make the thief "teleport" through a thin wall.
const MAX_SUBSTEP_DISTANCE = 0.1;

/**
 * Decide the movement mode from the input.
 * Crouching always wins over running (you can't sneak and sprint at once).
 * @returns {'idle'|'sneak'|'walk'|'run'}
 */
export function getMoveMode(input) {
  const moving = input.forward || input.back || input.left || input.right;
  if (!moving) return 'idle';
  if (input.crouch) return 'sneak';
  if (input.run) return 'run';
  return 'walk';
}

/**
 * Advance one thief by `dt` seconds.
 *
 * @param {object} state - { x, z } current position (modified copy returned)
 * @param {object} input - { forward, back, left, right, run, crouch, yaw }
 *                         `yaw` = camera heading in radians; WASD is relative
 *                         to where the camera looks.
 * @param {number} dt - time step in seconds
 * @param {Array} colliders - boxes from shared/map.js (COLLIDERS)
 * @returns {object} new state { x, z, moveMode, dirX, dirZ }
 */
export function stepMovement(state, input, dt, colliders) {
  const moveMode = getMoveMode(input);

  // 1) Build a direction from the keys, in "camera space":
  //    forward = +1 / back = -1, right = +1 / left = -1.
  const forwardAmount = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const rightAmount = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // 2) Rotate that into world space using the camera yaw.
  //    With yaw = 0 the camera looks towards -z ("north" on the plan).
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let dirX = forwardAmount * -sin + rightAmount * cos;
  let dirZ = forwardAmount * -cos + rightAmount * -sin;

  // 3) Normalise so diagonal movement isn't faster than straight movement.
  const length = Math.hypot(dirX, dirZ);
  if (length > 0) {
    dirX /= length;
    dirZ /= length;
  }

  // 4) Move in small sub-steps, resolving collisions after each one.
  const speed = moveMode === 'idle' ? 0 : SPEED[moveMode];
  const totalDistance = speed * dt;
  const steps = Math.max(1, Math.ceil(totalDistance / MAX_SUBSTEP_DISTANCE));
  const stepDistance = totalDistance / steps;

  let x = state.x;
  let z = state.z;
  for (let i = 0; i < steps; i++) {
    x += dirX * stepDistance;
    z += dirZ * stepDistance;
    ({ x, z } = resolveCircleVsBoxes(x, z, PLAYER_RADIUS, colliders));
  }

  return { x, z, moveMode, dirX, dirZ };
}
