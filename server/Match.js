// ============================================================================
// server/Match.js
// ----------------------------------------------------------------------------
// The heist simulation for one room. The server runs it TICK_RATE times per
// second. Clients only send inputs; everything else is decided here.
// ============================================================================

import { Thief } from './entities/Thief.js';
import { Guard } from './entities/Guard.js';
import { NavGrid } from './ai/NavGrid.js';
import { COLLIDERS, WALLS, SPAWN_POINTS, GUARD_ROUTES, LOOT, EXITS, SECURITY_CAMERAS, visionBlockers } from '../shared/map.js';
import { SecurityCamera } from './entities/SecurityCamera.js';
import {
  GUARD, CAMERA, MATCH_DURATION, KNOCKOUT_DROP_SHARE, NOISE_RADIUS, NOISE_PULSE_INTERVAL, WALL_MUFFLE,
  PLAYER_HEARING_BONUS, ALARM, POLICE_COUNTDOWN,
} from '../shared/constants.js';
import { hasLineOfSight } from '../shared/sight.js';
import { findInteraction } from '../shared/interactions.js';

// The pathfinding grid only depends on the (static) map: build it once.
const NAV = new NavGrid(COLLIDERS, 30, 20, GUARD.radius);

const ACTION_CANCEL_DISTANCE = 0.6; // moving further than this cancels a hold-E action

export class Match {
  /**
   * @param {Array<{id, name, color}>} players
   * @param {(results) => void} onEnd - called once when the match is over
   */
  constructor(players, onEnd) {
    this.time = 0;
    this.onEnd = onEnd;
    this.over = false;
    this.colliders = COLLIDERS;
    this.thieves = new Map();
    players.forEach((p, i) => this.thieves.set(p.id, new Thief(p, SPAWN_POINTS[i % SPAWN_POINTS.length])));
    this.guards = GUARD_ROUTES.map((route) => new Guard(route, NAV));
    // Copy the loot list: items get removed when grabbed, and added when dropped.
    this.loot = new Map(LOOT.map((item) => [item.id, { ...item }]));
    this.nextLootId = 1;
    this.exits = EXITS;
    this.cameras = SECURITY_CAMERAS.map((def) => new SecurityCamera(def));
    this.alarm = 0;              // 0..100, shared by the whole building
    this.policeTimer = null;     // seconds until the police storm in (null = not called yet)
  }

  handleInput(id, input) {
    const thief = this.thieves.get(id);
    if (thief?.isActive()) thief.queueInput(input);
  }

  handleInteract(id, down) {
    const thief = this.thieves.get(id);
    if (!thief?.isActive()) return;
    thief.interactHeld = !!down;
    if (!down) thief.action = null; // letting go of E cancels the action
  }

  removeThief(id) {
    this.thieves.delete(id);
  }

  tick(dt) {
    if (this.over) return;
    this.time += dt;
    for (const thief of this.thieves.values()) {
      if (!thief.isActive()) continue;
      thief.processInputs(dt, this.colliders, this.time);
      this.updateAction(thief, dt);
      this.updateFootsteps(thief, dt);
    }
    for (const guard of this.guards) guard.update(dt, this);
    for (const camera of this.cameras) {
      camera.update(dt, this);
      if (camera.seeing) this.raiseAlarm(ALARM.cameraPerSecond * dt);
    }
    if (this.guards.some((g) => g.state === 'chase')) this.raiseAlarm(ALARM.chasePerSecond * dt);
    this.updatePolice(dt);
    this.checkEnd();
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
   * Walls muffle it. Calm guards who hear it come and investigate; other
   * thieves nearby see a ripple (that's how you can "hear" rivals).
   * @param {string|null} sourceId - thief who made it (they don't get their own ripple)
   */
  makeNoise(x, z, radius, sourceId = null, kind = 'noise') {
    const effectiveRadius = (lx, lz) => (hasLineOfSight(x, z, lx, lz, WALLS) ? radius : radius * WALL_MUFFLE);

    // Guards: the closest calm guard that hears it goes to look.
    let closest = null, closestDist = Infinity;
    for (const guard of this.guards) {
      const d = Math.hypot(guard.x - x, guard.z - z);
      if (d <= effectiveRadius(guard.x, guard.z) && d < closestDist) { closest = guard; closestDist = d; }
    }
    if (closest && sourceId !== 'guard' && closest.hearNoise(x, z)) this.raiseAlarm(ALARM.guardHearsNoise);

    // Thieves: remember the noise to send as a ripple in their next snapshot.
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

  // ------------------------------------------------------------- hold-E actions
  /** What the interaction finder needs to know about the world. */
  interactionWorld() {
    return { loot: [...this.loot.values()], exits: this.exits };
  }

  updateAction(thief, dt) {
    if (thief.isKnockedOut(this.time)) { thief.action = null; return; }
    if (!thief.interactHeld) return;

    // Start a new action if E is held and none is running.
    if (!thief.action) {
      const found = findInteraction(thief, this.interactionWorld());
      if (!found) return;
      thief.action = { ...found, progress: 0, startX: thief.x, startZ: thief.z };
    }

    const action = thief.action;
    // Walking away cancels it (the player must hold E again).
    if (Math.hypot(thief.x - action.startX, thief.z - action.startZ) > ACTION_CANCEL_DISTANCE) {
      thief.action = null;
      thief.interactHeld = false;
      return;
    }
    action.progress += dt;
    if (action.progress >= action.duration) {
      thief.action = null;
      thief.interactHeld = false; // one action per press
      this.completeAction(thief, action);
    }
  }

  completeAction(thief, action) {
    switch (action.kind) {
      case 'grab': {
        const item = this.loot.get(action.targetId);
        if (!item) return; // someone else was faster!
        this.loot.delete(item.id);
        if (item.type === 'cash') thief.cash += item.value;
        thief.events.push({ type: 'grabbed', value: item.value, itemType: item.type });
        break;
      }
      case 'escape': {
        thief.banked += thief.carriedValue();
        thief.cash = 0;
        thief.items = [];
        thief.escaped = true;
        thief.events.push({ type: 'escaped', banked: thief.banked });
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------- world queries (used by guards)
  /** How far guards can see at a spot (Milestone 6 makes dark rooms shorter). */
  visionRangeAt() {
    return GUARD.visionRange;
  }

  visionBlockersFor(crouching) {
    return visionBlockers(crouching);
  }

  // ------------------------------------------------------------- game events
  onGuardSpotted(guard, thief) {
    thief.events.push({ type: 'spotted' });
    this.raiseAlarm(ALARM.guardStartsChase);
  }

  /** How far cameras see at a spot (Milestone 6: 0 in dark rooms). */
  cameraRangeAt() {
    return CAMERA.range;
  }

  /** A guard caught a thief: they drop part of their loot on the floor. */
  knockOut(thief) {
    thief.knockOut(this.time);
    thief.action = null;
    const dropped = Math.floor(thief.cash * KNOCKOUT_DROP_SHARE);
    if (dropped > 0) {
      thief.cash -= dropped;
      this.dropLoot({ type: 'cash', value: dropped }, thief.x, thief.z);
    }
    thief.events.push({ type: 'knockedOut', dropped });
    this.raiseAlarm(ALARM.knockout);
  }

  /** Put an item on the floor near (x, z), up for grabs by anyone. */
  dropLoot(item, x, z) {
    const id = `d${this.nextLootId++}`;
    this.loot.set(id, { ...item, id, x, z, y: 0, dropped: true });
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
      if (thief.id !== id && thief.isActive()) players.push(thief.publicState());
    }
    const snap = {
      t: Math.round(this.time * 1000),
      timeLeft: Math.max(0, Math.round(MATCH_DURATION - this.time)),
      you: you?.privateState(),
      players,
      guards: this.guards.map((g) => g.publicState(id)),
      cameras: this.cameras.map((c) => c.publicState(this.time)),
      alarm: Math.floor(this.alarm),
      police: this.policeTimer === null ? null : Math.ceil(this.policeTimer),
      loot: [...this.loot.values()].map((l) => ({ id: l.id, type: l.type, x: l.x, y: l.y, z: l.z, value: l.value, dropped: l.dropped })),
    };
    if (you?.events.length) {
      snap.events = you.events;
      you.events = [];
    }
    return snap;
  }
}
