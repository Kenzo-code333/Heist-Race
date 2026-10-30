// ============================================================================
// shared/interactions.js
// ----------------------------------------------------------------------------
// "What can I do here?" — given a thief's position and the world, find the
// best thing to interact with (pressing / holding E).
//
// The SERVER uses this to decide what actually happens. The CLIENT uses the
// exact same function to show the right prompt ("Hold E — Grab cash") before
// anything is sent, so prompt and result always match.
// ============================================================================

import { REACH, ACTION_TIME } from './constants.js';

/**
 * @param {{x, z}} actor - the thief
 * @param {object} world - { loot: [{id, type, x, z, value}], exits: [{id, x, z, radius, name}] }
 * @returns {null | { kind, targetId, duration, label }}
 */
export function findInteraction(actor, world) {
  let best = null;
  let bestDist = Infinity;
  const consider = (dist, option) => {
    if (dist < bestDist) { bestDist = dist; best = option; }
  };

  // Loot lying around
  for (const item of world.loot ?? []) {
    const d = Math.hypot(item.x - actor.x, item.z - actor.z);
    if (d > REACH) continue;
    if (item.type === 'cash') {
      consider(d, { kind: 'grab', targetId: item.id, duration: ACTION_TIME.grabCash, label: `Grab cash ($${item.value})` });
    }
  }

  // Exits: always preferred when you are standing in one
  for (const exit of world.exits ?? []) {
    const d = Math.hypot(exit.x - actor.x, exit.z - actor.z);
    if (d > exit.radius) continue;
    consider(d - 100, { kind: 'escape', targetId: exit.id, duration: ACTION_TIME.escape, label: `Escape through the ${exit.name.toLowerCase()}` });
  }

  return best;
}
