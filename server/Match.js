// ============================================================================
// server/Match.js
// ----------------------------------------------------------------------------
// The heist simulation for one room. The server runs it TICK_RATE times per
// second. Clients only send inputs; everything else is decided here:
// movement, guards, cameras, noise, the alarm, doors, loot, safes, the vault,
// hiding, lights and the end of the match.
// ============================================================================

import { Thief } from './entities/Thief.js';
import { Guard } from './entities/Guard.js';
import { SecurityCamera } from './entities/SecurityCamera.js';
import { NavGrid } from './ai/NavGrid.js';
import {
  COLLIDERS, WALLS, ENTRY_POINTS, GUARD_ROUTES, LOOT, EXITS, SECURITY_CAMERAS, DOORS, SAFES, VAULT,
  CLOSET_IDS, LIGHT_SWITCHES, VISION_BLOCKERS_STANDING, VISION_BLOCKERS_CROUCHED,
  withClosedDoors, doorBox, frontOf, roomAt,
} from '../shared/map.js';
import {
  GUARD, CAMERA, MATCH_DURATION, KNOCKOUT_DROP_SHARE, NOISE_RADIUS, NOISE_PULSE_INTERVAL, WALL_MUFFLE,
  PLAYER_HEARING_BONUS, ALARM, POLICE_COUNTDOWN, PLAYER_RADIUS, LOOT_WEIGHT, MAX_CARRY_WEIGHT,
  ACTION_NOISE, ALARM_VAULT_STAGE, DARK_VISION_RANGE, LIGHTS_FIX_DELAY,
  GADGETS, SMOKE, DECOY, JAMMER, SIGHT, SPAWN_IMMUNITY,
} from '../shared/constants.js';
import { hasLineOfSight, raycast } from '../shared/sight.js';
import { findInteraction, carriedWeight } from '../shared/interactions.js';
import { resolveCircleVsBoxes } from '../shared/collision.js';

// The pathfinding grid only depends on the static map (doors count as
// passable: guards have keys). Build it once.
const NAV = new NavGrid(COLLIDERS, 30, 20, GUARD.radius);

const ACTION_CANCEL_DISTANCE = 0.6; // moving further than this cancels a hold-E action
const SAFE_FRONT = new Map(SAFES.map((s) => [s.id, frontOf(s.id, 0.95)]));
const CLOSET_FRONT = new Map(CLOSET_IDS.map((id) => [id, frontOf(id)]));

export class Match {
  /**
   * @param {Array<{id, name, color, plan?: {entry, gadgets}}>} players
   * @param {(results, reason) => void} onEnd - called once when the match is over
   */
  constructor(players, onEnd) {
    this.time = 0;
    this.onEnd = onEnd;
    this.over = false;
    this.thieves = new Map();
    // Each thief starts at their secretly chosen entry point.
    const usedSpawns = new Map(); // entry id -> how many spawned there so far
    for (const p of players) {
      const entry = ENTRY_POINTS.find((e) => e.id === p.plan?.entry) ?? ENTRY_POINTS[0];
      const n = usedSpawns.get(entry.id) ?? 0;
      usedSpawns.set(entry.id, n + 1);
      const thief = new Thief(p, entry.spawns[n % entry.spawns.length]);
      thief.gadgets = (p.plan?.gadgets ?? []).map((type) => ({ type, used: false }));
      thief.immuneUntil = SPAWN_IMMUNITY;
      this.thieves.set(p.id, thief);
    }
    this.smokes = [];  // active smoke clouds { x, z, until }
    this.decoys = [];  // thrown decoys waiting to go off { x, z, at }
    this.guards = GUARD_ROUTES.map((route) => new Guard(route, NAV));
    this.cameras = SECURITY_CAMERAS.map((def) => new SecurityCamera(def));

    // Loot: copied so we can remove grabbed items and add dropped ones.
    this.loot = new Map(LOOT.map((item) => [item.id, { ...item }]));
    this.nextLootId = 1;
    this.exits = EXITS;

    // Doors (all start closed), safes, vault, closets, lights
    this.doors = new Map(DOORS.map((d) => [d.id, { ...d, open: false }]));
    this.safes = new Map(SAFES.map((s) => [s.id, { ...s, progress: 0, open: false }]));
    this.vault = { stage: 0, progress: 0, open: false };
    this.closets = new Map(CLOSET_IDS.map((id) => [id, null])); // closet id -> thief id hiding inside
    this.darkRooms = new Map(); // room id -> { since, fixerSentAt }

    this.alarm = 0;              // 0..100, shared by the whole building
    this.policeTimer = null;     // seconds until the police storm in (null = not called yet)
    this.refreshDoors();
  }

  // ------------------------------------------------------------- input from players
  handleInput(id, input) {
    const thief = this.thieves.get(id);
    if (thief?.isActive()) thief.queueInput(input);
  }

  /** E pressed (down = true) or released (down = false). */
  handleInteract(id, down) {
    const thief = this.thieves.get(id);
    if (!thief?.isActive() || thief.isKnockedOut(this.time)) return;
    thief.interactHeld = !!down;
    if (down) {
      // Start immediately, so even a very quick tap is noticed.
      if (!thief.action) this.startAction(thief);
    } else {
      // Released early: some actions do something else on a tap (doors open).
      const action = thief.action;
      thief.action = null;
      if (action?.tapKind && action.progress < action.duration) this.completeAction(thief, { ...action, kind: action.tapKind });
    }
  }

  removeThief(id) {
    const thief = this.thieves.get(id);
    if (thief?.hiddenIn) this.closets.set(thief.hiddenIn, null);
    this.thieves.delete(id);
  }

  // ------------------------------------------------------------- main loop
  tick(dt) {
    if (this.over) return;
    this.time += dt;
    for (const thief of this.thieves.values()) {
      if (!thief.isActive()) continue;
      thief.processInputs(dt, this.colliders, this.time);
      this.updateAction(thief, dt);
      this.updateFootsteps(thief, dt);
    }
    for (const guard of this.guards) {
      this.guardUsesDoors(guard);
      guard.update(dt, this);
    }
    for (const camera of this.cameras) {
      camera.update(dt, this);
      if (camera.seeing) this.raiseAlarm(ALARM.cameraPerSecond * dt);
    }
    if (this.guards.some((g) => g.state === 'chase')) this.raiseAlarm(ALARM.chasePerSecond * dt);
    this.updateGadgets();
    this.updateLights();
    this.updatePolice(dt);
    this.checkEnd();
  }

  // ------------------------------------------------------------- doors
  /** Rebuild collision & vision lists after a door opened or closed. */
  refreshDoors() {
    const closed = [...this.doors.values()].filter((d) => !d.open).map((d) => d.id);
    this.colliders = withClosedDoors(COLLIDERS, closed);
    this.blockersStanding = withClosedDoors(VISION_BLOCKERS_STANDING, closed);
    this.blockersCrouched = withClosedDoors(VISION_BLOCKERS_CROUCHED, closed);
    this.soundBlockers = withClosedDoors(WALLS, closed);
  }

  setDoor(door, open, locked = door.locked) {
    door.open = open;
    door.locked = open ? false : locked;
    this.refreshDoors();
  }

  /** Is anybody standing in a doorway (closing it would trap them)? */
  doorwayBlocked(door) {
    const box = doorBox(door);
    const bodies = [...this.thieves.values()].filter((t) => t.isActive()).map((t) => ({ x: t.x, z: t.z, r: PLAYER_RADIUS }))
      .concat(this.guards.map((g) => ({ x: g.x, z: g.z, r: GUARD.radius })));
    return bodies.some((b) => {
      const pushed = resolveCircleVsBoxes(b.x, b.z, b.r, [box]);
      return pushed.x !== b.x || pushed.z !== b.z;
    });
  }

  /** Guards have keys: they open doors in their way, then close (and re-lock) them behind. */
  guardUsesDoors(guard) {
    for (const door of this.doors.values()) {
      const dist = Math.hypot(door.x - guard.x, door.z - guard.z);
      if (!door.open && dist < 1.1) {
        guard.doorsToClose.set(door.id, door.locked);
        this.setDoor(door, true);
        this.makeNoise(door.x, door.z, ACTION_NOISE.door, 'guard', 'door');
      } else if (door.open && guard.doorsToClose.has(door.id) && dist > 1.8 && guard.state !== 'chase') {
        if (!this.doorwayBlocked(door)) {
          this.setDoor(door, false, guard.doorsToClose.get(door.id));
          this.makeNoise(door.x, door.z, ACTION_NOISE.door, 'guard', 'door');
        }
        guard.doorsToClose.delete(door.id);
      }
    }
  }

  // ------------------------------------------------------------- hold-E actions
  /** Snapshot of everything findInteraction() needs. */
  interactionWorld() {
    const doors = {};
    for (const d of this.doors.values()) doors[d.id] = { open: d.open, locked: d.locked };
    const safes = {};
    for (const s of this.safes.values()) safes[s.id] = { progress: s.progress, open: s.open };
    const closets = {};
    for (const [id, occupant] of this.closets) closets[id] = occupant;
    return {
      loot: [...this.loot.values()], exits: this.exits, doors, safes, closets,
      vault: this.vault, darkRooms: new Set(this.darkRooms.keys()),
    };
  }

  startAction(thief) {
    const found = findInteraction(thief.actorView(), this.interactionWorld());
    if (!found || !found.kind) return;
    thief.action = { ...found, progress: 0, fraction: 0, startX: thief.x, startZ: thief.z, noiseTimer: 0 };
  }

  updateAction(thief, dt) {
    if (thief.isKnockedOut(this.time)) { thief.action = null; return; }
    if (!thief.interactHeld) return;
    if (!thief.action) this.startAction(thief);
    const action = thief.action;
    if (!action) return;

    // Walking away cancels it (the player must press E again).
    if (Math.hypot(thief.x - action.startX, thief.z - action.startZ) > ACTION_CANCEL_DISTANCE) {
      thief.action = null;
      thief.interactHeld = false;
      return;
    }

    const speed = thief.actionSpeed(action.kind);
    action.progress += dt;

    // Noisy actions make a sound every second.
    const noise = { pick: ACTION_NOISE.pickLock, crack: ACTION_NOISE.crack, vault: ACTION_NOISE.vault }[action.kind];
    if (noise) {
      action.noiseTimer -= dt;
      if (action.noiseTimer <= 0) {
        action.noiseTimer = 1;
        this.makeNoise(thief.x, thief.z, noise, thief.id, action.kind === 'vault' ? 'loud' : 'tool');
      }
    }

    // Safes and the vault keep their progress even if you stop.
    if (action.kind === 'crack') {
      const safe = this.safes.get(action.targetId);
      safe.progress = Math.min(1, safe.progress + (dt * speed) / safe.crackTime);
      action.fraction = safe.progress;
      if (safe.progress >= 1) this.finishAction(thief, action);
      return;
    }
    if (action.kind === 'vault') {
      this.vault.progress = Math.min(1, this.vault.progress + (dt * speed) / VAULT.stageTime);
      action.fraction = this.vault.progress;
      if (this.vault.progress >= 1) this.finishAction(thief, action);
      return;
    }

    action.fraction = Math.min(1, action.progress / action.duration);
    if (action.progress >= action.duration) this.finishAction(thief, action);
  }

  finishAction(thief, action) {
    thief.action = null;
    thief.interactHeld = false; // one action per press
    this.completeAction(thief, action);
  }

  completeAction(thief, action) {
    switch (action.kind) {
      case 'grab': return this.grabLoot(thief, action.targetId);
      case 'escape': return this.escape(thief);
      case 'openDoor': {
        const door = this.doors.get(action.targetId);
        if (door && !door.open && !door.locked) {
          this.setDoor(door, true);
          this.makeNoise(door.x, door.z, ACTION_NOISE.door, thief.id, 'door');
        }
        return;
      }
      case 'closeDoor': {
        const door = this.doors.get(action.targetId);
        if (!door?.open) return;
        if (this.doorwayBlocked(door)) { thief.events.push({ type: 'info', text: 'Someone is in the doorway.' }); return; }
        this.setDoor(door, false, false);
        this.makeNoise(door.x, door.z, ACTION_NOISE.door, thief.id, 'door');
        return;
      }
      case 'lockDoor': {
        const door = this.doors.get(action.targetId);
        if (door && !door.open) {
          door.locked = true;
          thief.events.push({ type: 'info', text: 'Door locked behind you.' });
        }
        return;
      }
      case 'pick': {
        const door = this.doors.get(action.targetId);
        if (door && door.locked) {
          this.setDoor(door, true);
          thief.events.push({ type: 'info', text: 'Lock picked!' });
        }
        return;
      }
      case 'crack': {
        const safe = this.safes.get(action.targetId);
        if (!safe || safe.open) return;
        safe.open = true;
        const spot = SAFE_FRONT.get(safe.id);
        this.dropLoot({ type: 'cash', value: safe.value, fromSafe: true }, spot.x, spot.z);
        thief.events.push({ type: 'info', text: `Safe cracked! ${'$' + safe.value} inside.` });
        return;
      }
      case 'vault': return this.finishVaultStage(thief);
      case 'hide': {
        if (this.closets.get(action.targetId)) return; // somebody got there first
        this.closets.set(action.targetId, thief.id);
        thief.hiddenIn = action.targetId;
        thief.events.push({ type: 'info', text: 'Hidden. Guards and cameras can\'t see you.' });
        return;
      }
      case 'unhide': {
        this.closets.set(thief.hiddenIn, null);
        const spot = CLOSET_FRONT.get(thief.hiddenIn);
        thief.hiddenIn = null;
        if (spot) { thief.x = spot.x; thief.z = spot.z; }
        return;
      }
      case 'lights': return this.setLights(action.targetId, this.darkRooms.has(action.targetId), thief);
      default: return undefined;
    }
  }

  grabLoot(thief, itemId) {
    const item = this.loot.get(itemId);
    if (!item) return; // someone else was faster!
    const weight = LOOT_WEIGHT[item.type] ?? 0;
    if (carriedWeight(thief.items) + weight > MAX_CARRY_WEIGHT) return;
    this.loot.delete(item.id);
    if (item.type === 'cash') thief.cash += item.value;
    else thief.items.push({ type: item.type, value: item.value, seed: item.seed, w: item.w, h: item.h });
    thief.events.push({ type: 'grabbed', value: item.value, itemType: item.type });
  }

  escape(thief) {
    thief.banked += thief.carriedValue();
    thief.cash = 0;
    thief.items = [];
    thief.escaped = true;
    thief.events.push({ type: 'escaped', banked: thief.banked });
  }

  finishVaultStage(thief) {
    const v = this.vault;
    v.stage += 1;
    v.progress = 0;
    this.makeNoise(VAULT.x, VAULT.z, ACTION_NOISE.vaultStage, thief.id, 'loud');
    this.raiseAlarm(ALARM_VAULT_STAGE);
    if (v.stage >= VAULT.stages) {
      v.open = true;
      VAULT.gold.forEach((spot) => this.dropLoot({ type: 'gold', value: VAULT.goldValue }, spot.x, spot.z, false));
      thief.events.push({ type: 'info', text: 'The vault is open! Gold bars inside.' });
    } else {
      thief.events.push({ type: 'info', text: `Vault stage ${v.stage}/${VAULT.stages} done.` });
    }
  }

  // ------------------------------------------------------------- gadgets
  /** Keys 1 / 2: use the gadget in that slot (active gadgets work once). */
  useGadget(id, msg) {
    const thief = this.thieves.get(id);
    if (!thief?.isActive() || thief.hiddenIn || thief.isKnockedOut(this.time)) return;
    const gadget = thief.gadgets[msg?.slot];
    if (!gadget || gadget.used || !GADGETS[gadget.type]?.active) return;
    const yaw = Number.isFinite(msg?.yaw) ? msg.yaw : thief.facing;
    gadget.used = true;

    if (gadget.type === 'smoke') {
      this.smokes.push({ x: thief.x, z: thief.z, until: this.time + SMOKE.duration });
      this.makeNoise(thief.x, thief.z, 3, thief.id, 'tool');
      thief.events.push({ type: 'info', text: 'Smoke bomb! Guards and cameras can\'t see through it.' });
    } else if (gadget.type === 'decoy') {
      // Thrown forward; stops at the first wall in the way.
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      const dist = Math.max(0.5, raycast(thief.x, thief.z, dx, dz, DECOY.distance, this.colliders) - 0.3);
      this.decoys.push({ x: thief.x + dx * dist, z: thief.z + dz * dist, at: this.time + DECOY.delay });
      thief.events.push({ type: 'info', text: 'Decoy thrown…' });
    } else if (gadget.type === 'jammer') {
      let count = 0;
      for (const cam of this.cameras) {
        if (Math.hypot(cam.x - thief.x, cam.z - thief.z) <= JAMMER.radius) {
          cam.disabledUntil = this.time + JAMMER.duration;
          count++;
        }
      }
      thief.events.push({ type: 'info', text: count ? `${count} camera(s) jammed for ${JAMMER.duration} s.` : 'No camera in range… jammer wasted.' });
    }
  }

  updateGadgets() {
    this.smokes = this.smokes.filter((s) => s.until > this.time);
    for (const decoy of this.decoys) {
      if (decoy.at <= this.time) this.makeNoise(decoy.x, decoy.z, DECOY.radius, null, 'loud');
    }
    this.decoys = this.decoys.filter((d) => d.at > this.time);
  }

  /** Does any smoke cloud cut the line between two points? */
  smokeBlocks(x1, z1, x2, z2) {
    for (const s of this.smokes) {
      // Distance from the cloud centre to the segment
      const dx = x2 - x1, dz = z2 - z1;
      const lenSq = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((s.x - x1) * dx + (s.z - z1) * dz) / lenSq));
      if (Math.hypot(x1 + dx * t - s.x, z1 + dz * t - s.z) < SMOKE.radius) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- fog of war
  /**
   * May `viewer` be told where `other` is? Only if they could plausibly see
   * them: close enough, nothing in between, not hidden in the dark or smoke.
   * This is what stops a modified client from showing every rival.
   */
  canPlayerSee(viewer, other) {
    if (viewer.escaped) return true; // spectators see everything
    const d = Math.hypot(other.x - viewer.x, other.z - viewer.z);
    if (d <= SIGHT.closeRange) return true;
    if (d > (this.isDark(other.x, other.z) ? SIGHT.darkRange : SIGHT.range)) return false;
    if (this.smokeBlocks(viewer.x, viewer.z, other.x, other.z)) return false;
    return hasLineOfSight(viewer.x, viewer.z, other.x, other.z, this.visionBlockersFor(other.crouching));
  }

  /** Guards carry flashlights: visible further, but still not through walls. */
  canPlayerSeeGuard(viewer, guard) {
    if (viewer.escaped) return true;
    const d = Math.hypot(guard.x - viewer.x, guard.z - viewer.z);
    if (d <= SIGHT.closeRange) return true;
    return hasLineOfSight(viewer.x, viewer.z, guard.x, guard.z, this.blockersStanding);
  }

  // ------------------------------------------------------------- lights
  /** Turn a room's lights on or off. */
  setLights(roomId, on, byThief = null) {
    const sw = LIGHT_SWITCHES.find((s) => s.room === roomId);
    if (on) this.darkRooms.delete(roomId);
    else this.darkRooms.set(roomId, { since: this.time, fixerSentAt: null });
    if (sw) this.makeNoise(sw.x, sw.z, ACTION_NOISE.lights, byThief ? byThief.id : 'guard', 'click');
  }

  /** After a while in the dark, a guard comes to turn the lights back on. */
  updateLights() {
    for (const [roomId, info] of this.darkRooms) {
      if (this.time - info.since < LIGHTS_FIX_DELAY) continue;
      if (info.fixerSentAt !== null && this.time - info.fixerSentAt < 15) continue;
      const sw = LIGHT_SWITCHES.find((s) => s.room === roomId);
      const calm = this.guards.filter((g) => g.state !== 'chase' && g.state !== 'suspicious');
      calm.sort((a, b) => Math.hypot(a.x - sw.x, a.z - sw.z) - Math.hypot(b.x - sw.x, b.z - sw.z));
      if (calm[0]?.hearNoise(sw.x, sw.z)) {
        calm[0].fixLightsRoom = roomId;
        info.fixerSentAt = this.time;
      }
    }
  }

  isDark(x, z) {
    const room = roomAt(x, z);
    return !!room && this.darkRooms.has(room.id);
  }

  // ------------------------------------------------------------- noise
  /** Walking and running make footstep noise every NOISE_PULSE_INTERVAL seconds. */
  updateFootsteps(thief, dt) {
    thief.noiseTimer -= dt;
    const radius = NOISE_RADIUS[thief.moveMode] ?? 0;
    if (radius <= 0 || thief.noiseTimer > 0) return;
    thief.noiseTimer = NOISE_PULSE_INTERVAL;
    this.makeNoise(thief.x, thief.z, radius, thief.id, thief.moveMode);
  }

  /**
   * Something made a noise at (x, z) audible up to `radius` metres.
   * Walls and closed doors muffle it. The closest calm guard who hears it
   * comes to investigate; other thieves nearby see a ripple.
   * @param {string|null} sourceId - who made it ('guard' = a guard; thieves don't hear their own)
   */
  makeNoise(x, z, radius, sourceId = null, kind = 'noise') {
    const effectiveRadius = (lx, lz) => (hasLineOfSight(x, z, lx, lz, this.soundBlockers) ? radius : radius * WALL_MUFFLE);

    if (sourceId !== 'guard') {
      let closest = null, closestDist = Infinity;
      for (const guard of this.guards) {
        const d = Math.hypot(guard.x - x, guard.z - z);
        if (d <= effectiveRadius(guard.x, guard.z) && d < closestDist) { closest = guard; closestDist = d; }
      }
      if (closest?.hearNoise(x, z)) this.raiseAlarm(ALARM.guardHearsNoise);
    }

    for (const thief of this.thieves.values()) {
      if (thief.id === sourceId || !thief.isActive()) continue;
      const d = Math.hypot(thief.x - x, thief.z - z);
      if (d <= effectiveRadius(thief.x, thief.z) + PLAYER_HEARING_BONUS) {
        thief.events.push({ type: 'noise', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: radius, kind });
      }
    }
  }

  /** Send the nearest calm guard to check a spot (used by cameras). */
  callNearestGuard(x, z) {
    const calm = this.guards.filter((g) => g.state !== 'chase' && g.state !== 'suspicious');
    calm.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    calm[0]?.hearNoise(x, z);
  }

  // ------------------------------------------------------------- alarm & police
  raiseAlarm(amount) {
    if (this.alarm >= 100) return;
    this.alarm = Math.min(100, this.alarm + amount);
    if (this.alarm >= 100 && this.policeTimer === null) {
      this.policeTimer = POLICE_COUNTDOWN;
      for (const thief of this.thieves.values()) thief.events.push({ type: 'police' });
    }
  }

  updatePolice(dt) {
    if (this.policeTimer === null) return;
    this.policeTimer -= dt;
    if (this.policeTimer <= 0) {
      this.policeTimer = 0;
      this.finish('police');
    }
  }

  // ------------------------------------------------------------- world queries (used by guards & cameras)
  /** How far guards can see a thief standing at (x, z): short in the dark. */
  visionRangeAt(x, z) {
    return this.isDark(x, z) ? DARK_VISION_RANGE : GUARD.visionRange;
  }

  /** How far a camera mounted at (x, z) sees: nothing in a dark room. */
  cameraRangeAt(x, z) {
    return this.isDark(x, z) ? 0 : CAMERA.range;
  }

  visionBlockersFor(crouching) {
    return crouching ? this.blockersCrouched : this.blockersStanding;
  }

  // ------------------------------------------------------------- game events
  onGuardSpotted(guard, thief) {
    thief.events.push({ type: 'spotted' });
    this.raiseAlarm(ALARM.guardStartsChase);
  }

  /** A guard caught a thief: they drop all bulky loot and half their cash. */
  knockOut(thief) {
    thief.knockOut(this.time);
    thief.action = null;
    const dropped = Math.floor(thief.cash * KNOCKOUT_DROP_SHARE);
    let offset = 0;
    if (dropped > 0) {
      thief.cash -= dropped;
      this.dropLoot({ type: 'cash', value: dropped }, thief.x, thief.z);
    }
    for (const item of thief.items) {
      offset += 0.35;
      this.dropLoot(item, thief.x + offset, thief.z);
    }
    const lostItems = thief.items.length;
    thief.items = [];
    thief.events.push({ type: 'knockedOut', dropped, lostItems });
    this.raiseAlarm(ALARM.knockout);
  }

  /** Put an item on the floor near (x, z), up for grabs by anyone. */
  dropLoot(item, x, z, dropped = true) {
    const id = `d${this.nextLootId++}`;
    // Keep dropped items out of walls so they stay reachable.
    const pos = resolveCircleVsBoxes(x, z, 0.2, this.colliders);
    this.loot.set(id, { ...item, id, x: pos.x, z: pos.z, y: 0, dropped });
  }

  // ------------------------------------------------------------- end of match
  checkEnd() {
    const inside = [...this.thieves.values()].filter((t) => t.isActive());
    if (inside.length === 0) this.finish('allOut');
    else if (this.time >= MATCH_DURATION) this.finish('time');
  }

  /** @param {'allOut'|'time'|'police'} reason */
  finish(reason) {
    if (this.over) return;
    this.over = true;
    // Thieves still inside lose everything they carry.
    const results = [...this.thieves.values()].map((t) => ({
      id: t.id, name: t.name, color: t.color,
      escaped: t.escaped,
      score: t.escaped ? t.banked : 0,
      lost: t.escaped ? 0 : t.carriedValue(),
    }));
    results.sort((a, b) => b.score - a.score);
    this.onEnd(results, reason);
  }

  // ------------------------------------------------------------- snapshots
  /** The personal state message for one player. */
  snapshotFor(id) {
    const you = this.thieves.get(id);
    const players = [];
    for (const thief of this.thieves.values()) {
      if (thief.id === id || !thief.isActive() || thief.hiddenIn) continue;
      if (you && !this.canPlayerSee(you, thief)) continue; // fog of war
      players.push(thief.publicState());
    }
    const snap = {
      t: Math.round(this.time * 1000),
      timeLeft: Math.max(0, Math.round(MATCH_DURATION - this.time)),
      you: you?.privateState(),
      players,
      // The guard chasing you is always sent: you can hear them coming.
      guards: this.guards.filter((g) => !you || g.targetId === id || this.canPlayerSeeGuard(you, g)).map((g) => g.publicState(id)),
      smokes: this.smokes.map((s) => ({ x: s.x, z: s.z, left: Math.round(s.until - this.time) })),
      decoys: this.decoys.map((d) => ({ x: Math.round(d.x * 10) / 10, z: Math.round(d.z * 10) / 10 })),
      cameras: this.cameras.map((c) => c.publicState(this.time)),
      alarm: Math.floor(this.alarm),
      police: this.policeTimer === null ? null : Math.ceil(this.policeTimer),
      loot: [...this.loot.values()].map((l) => ({
        id: l.id, type: l.type, x: l.x, y: l.y, z: l.z, value: l.value, dropped: l.dropped,
        w: l.w, h: l.h, face: l.face, seed: l.seed, fromSafe: l.fromSafe,
      })),
      doors: [...this.doors.values()].map((d) => ({ id: d.id, o: d.open, l: d.locked })),
      safes: [...this.safes.values()].map((s) => ({ id: s.id, p: Math.round(s.progress * 100) / 100, open: s.open })),
      vault: { stage: this.vault.stage, p: Math.round(this.vault.progress * 100) / 100, open: this.vault.open },
      closets: [...this.closets].map(([cid, occupant]) => ({ id: cid, occ: !!occupant })),
      dark: [...this.darkRooms.keys()],
    };
    if (you?.events.length) {
      snap.events = you.events;
      you.events = [];
    }
    return snap;
  }
}
