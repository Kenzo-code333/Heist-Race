// ============================================================================
// server/Match.js
// ----------------------------------------------------------------------------
// The heist simulation for one room. The server runs it TICK_RATE times per
// second. Clients only send inputs; everything else is decided here.
// ============================================================================

import { Thief } from './entities/Thief.js';
import { Guard } from './entities/Guard.js';
import { NavGrid } from './ai/NavGrid.js';
import { COLLIDERS, SPAWN_POINTS, GUARD_ROUTES, visionBlockers } from '../shared/map.js';
import { GUARD } from '../shared/constants.js';

// The pathfinding grid only depends on the (static) map: build it once.
const NAV = new NavGrid(COLLIDERS, 30, 20, GUARD.radius);

export class Match {
  /** @param {Array<{id, name, color}>} players */
  constructor(players) {
    this.time = 0;
    this.colliders = COLLIDERS;
    this.thieves = new Map();
    players.forEach((p, i) => this.thieves.set(p.id, new Thief(p, SPAWN_POINTS[i % SPAWN_POINTS.length])));
    this.guards = GUARD_ROUTES.map((route) => new Guard(route, NAV));
  }

  handleInput(id, input) {
    this.thieves.get(id)?.queueInput(input);
  }

  removeThief(id) {
    this.thieves.delete(id);
  }

  tick(dt) {
    this.time += dt;
    for (const thief of this.thieves.values()) thief.processInputs(dt, this.colliders, this.time);
    for (const guard of this.guards) guard.update(dt, this);
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

  knockOut(thief) {
    thief.knockOut(this.time);
    thief.events.push({ type: 'knockedOut' });
  }

  /** The personal state message for one player. */
  snapshotFor(id) {
    const you = this.thieves.get(id);
    const players = [];
    for (const thief of this.thieves.values()) {
      if (thief.id !== id) players.push(thief.publicState());
    }
    const snap = {
      t: Math.round(this.time * 1000),
      you: you?.privateState(),
      players,
      guards: this.guards.map((g) => g.publicState(id)),
    };
    if (you?.events.length) {
      snap.events = you.events;
      you.events = [];
    }
    return snap;
  }
}
