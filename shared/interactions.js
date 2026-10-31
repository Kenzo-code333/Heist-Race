// ============================================================================
// shared/interactions.js
// ----------------------------------------------------------------------------
// "What can I do here?" — given a thief and the world, find the best thing to
// interact with (pressing / holding E).
//
// The SERVER uses this to decide what actually happens. The CLIENT uses the
// exact same function to show the right prompt ("Hold E — Grab cash") before
// anything is sent, so the prompt and the result always match.
//
// Each option looks like:
//   { kind, targetId, duration, label, tapKind? }
//   - duration: seconds E must be held (progress bar)
//   - tapKind : if E is released early, do this instead (e.g. a door: tap =
//               open, hold = lock)
//   - kind null: nothing to do, but show the label (e.g. "Hands full")
// ============================================================================

import { REACH, ACTION_TIME, LOOT_WEIGHT, MAX_CARRY_WEIGHT } from './constants.js';
import { DOORS, SAFES, VAULT, CLOSET_IDS, LIGHT_SWITCHES, EXITS, frontOf } from './map.js';

// Positions where you stand to use each piece of furniture (computed once).
const SAFE_SPOTS = new Map(SAFES.map((s) => [s.id, frontOf(s.id)]));
const CLOSET_SPOTS = new Map(CLOSET_IDS.map((id) => [id, frontOf(id)]));

/** Total weight of the bulky items a thief carries. */
export function carriedWeight(items) {
  return (items ?? []).reduce((sum, item) => sum + (LOOT_WEIGHT[item.type] ?? 0), 0);
}

const money = (v) => `$${v.toLocaleString('en-US')}`;

/**
 * @param {object} actor - { x, z, items, hiddenIn, speed } — speed: action speed multiplier (gadgets)
 * @param {object} world - live state:
 *   { loot: [...], doors: { id: {open, locked} }, safes: { id: {progress, open} },
 *     vault: { stage, progress, open }, closets: { id: occupantId|null }, darkRooms: Set }
 * @returns {null | object} the best option (see top of file)
 */
export function findInteraction(actor, world) {
  const speed = actor.speed ?? {};
  const fast = (kind) => speed[kind] ?? 1;

  // While hidden, the only thing you can do is come out.
  if (actor.hiddenIn) {
    return { kind: 'unhide', targetId: actor.hiddenIn, duration: ACTION_TIME.unhide, label: 'Leave the closet' };
  }

  let best = null;
  let bestScore = Infinity;
  const consider = (dist, option) => {
    if (dist < bestScore) { bestScore = dist; best = option; }
  };
  const near = (x, z, reach = REACH) => {
    const d = Math.hypot(x - actor.x, z - actor.z);
    return d <= reach ? d : null;
  };
  const weight = carriedWeight(actor.items);

  // --- Loot lying around or hanging on walls
  for (const item of world.loot ?? []) {
    const d = near(item.x, item.z);
    if (d === null) continue;
    if (item.type === 'cash') {
      consider(d, { kind: 'grab', targetId: item.id, duration: ACTION_TIME.grabCash, label: `Grab cash (${money(item.value)})` });
    } else {
      const extra = LOOT_WEIGHT[item.type] ?? 0;
      const name = item.type === 'painting' ? 'painting' : 'gold bar';
      if (weight + extra > MAX_CARRY_WEIGHT) {
        consider(d, { kind: null, targetId: item.id, label: `Hands full — can't carry this ${name}` });
      } else {
        const time = item.type === 'painting' ? (item.dropped ? 1.5 : ACTION_TIME.grabPainting) : ACTION_TIME.grabGold;
        consider(d, { kind: 'grab', targetId: item.id, duration: time, label: `Take ${name} (${money(item.value)}) — heavy, no running` });
      }
    }
  }

  // --- Doors
  for (const door of DOORS) {
    const state = world.doors?.[door.id];
    if (!state) continue;
    const d = near(door.x, door.z, 1.3);
    if (d === null) continue;
    if (state.open) {
      consider(d + 0.3, { kind: 'closeDoor', targetId: door.id, duration: ACTION_TIME.closeDoor, label: 'Close the door' });
    } else if (state.locked) {
      consider(d + 0.3, { kind: 'pick', targetId: door.id, duration: ACTION_TIME.pickLock / fast('pick'), label: 'Pick the lock' });
    } else {
      consider(d + 0.3, { kind: 'lockDoor', tapKind: 'openDoor', targetId: door.id, duration: ACTION_TIME.lockDoor, label: 'Tap: open the door · Hold: lock it' });
    }
  }

  // --- Safes (progress is shared and saved)
  for (const safe of SAFES) {
    const state = world.safes?.[safe.id];
    if (!state || state.open) continue;
    const spot = SAFE_SPOTS.get(safe.id);
    const d = near(spot.x, spot.z, 1.0);
    if (d === null) continue;
    const left = Math.max(0.1, safe.crackTime * (1 - state.progress)) / fast('crack');
    consider(d, { kind: 'crack', targetId: safe.id, duration: left, label: `Crack the ${safe.name} (${Math.round(state.progress * 100)}%)` });
  }

  // --- The vault
  const vault = world.vault;
  if (vault && !vault.open) {
    const d = near(VAULT.x, VAULT.z, 1.3);
    if (d !== null) {
      const left = Math.max(0.1, VAULT.stageTime * (1 - vault.progress)) / fast('crack');
      consider(d, { kind: 'vault', targetId: VAULT.id, duration: left, label: `Drill the vault — stage ${vault.stage + 1}/${VAULT.stages} (LOUD)` });
    }
  }

  // --- Closets
  for (const id of CLOSET_IDS) {
    if (!world.closets || !(id in world.closets)) continue;
    const spot = CLOSET_SPOTS.get(id);
    const d = near(spot.x, spot.z, 1.0);
    if (d === null) continue;
    if (world.closets[id]) consider(d + 0.2, { kind: null, targetId: id, label: 'Closet locked from the inside…' });
    else consider(d + 0.2, { kind: 'hide', targetId: id, duration: ACTION_TIME.hide, label: 'Hide in the closet' });
  }

  // --- Light switches
  for (const sw of LIGHT_SWITCHES) {
    const d = near(sw.x, sw.z, 1.2);
    if (d === null) continue;
    const dark = world.darkRooms?.has(sw.room);
    consider(d + 0.1, { kind: 'lights', targetId: sw.room, duration: ACTION_TIME.lights, label: dark ? 'Turn the lights back on' : 'Cut the lights in this room' });
  }

  // --- Exits: always preferred when you are standing in one
  for (const exit of world.exits ?? EXITS) {
    if (exit.requires && !(actor.gadgets ?? []).includes(exit.requires)) continue;
    const d = Math.hypot(exit.x - actor.x, exit.z - actor.z);
    if (d > exit.radius) continue;
    consider(d - 100, { kind: 'escape', targetId: exit.id, duration: ACTION_TIME.escape, label: `Escape through the ${exit.name.toLowerCase()}` });
  }

  return best;
}
