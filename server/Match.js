// ============================================================================
// server/Match.js
// ----------------------------------------------------------------------------
// The heist simulation for one room. The server runs it TICK_RATE times per
// second. Clients only send inputs; everything else is decided here.
// ============================================================================

import { Thief } from './entities/Thief.js';
import { Guard } from './entities/Guard.js';
import { NavGrid } from './ai/NavGrid.js';
import { COLLIDERS, SPAWN_POINTS, GUARD_ROUTES, LOOT, EXITS, visionBlockers } from '../shared/map.js';
import { GUARD, MATCH_DURATION, KNOCKOUT_DROP_SHARE } from '../shared/constants.js';
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
    }
    for (const guard of this.guards) guard.update(dt, this);
    this.checkEnd();
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
  }

  /** Put an item on the floor near (x, z), up for grabs by anyone. */
  dropLoot(item, x, z) {
    const id = `d${this.nextLootId++}`;
    this.loot.set(id, { ...item, id, x, z, y: 0, dropped: true });
  }

  // ------------------------------------------------------------- end of match
  checkEnd() {
    const inside = [...this.thieves.values()].filter((t) => t.isActive());
    if (inside.length === 0 || this.time >= MATCH_DURATION) this.finish();
  }

  finish() {
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
    this.onEnd(results);
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
      loot: [...this.loot.values()].map((l) => ({ id: l.id, type: l.type, x: l.x, y: l.y, z: l.z, value: l.value, dropped: l.dropped })),
    };
    if (you?.events.length) {
      snap.events = you.events;
      you.events = [];
    }
    return snap;
  }
}
