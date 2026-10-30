// ============================================================================
// server/Match.js
// ----------------------------------------------------------------------------
// The heist simulation for one room. The server runs it TICK_RATE times per
// second. Clients only send inputs; everything else is decided here.
// ============================================================================

import { Thief } from './entities/Thief.js';
import { COLLIDERS, SPAWN_POINTS } from '../shared/map.js';

export class Match {
  /** @param {Array<{id, name, color}>} players */
  constructor(players) {
    this.time = 0;
    this.thieves = new Map();
    players.forEach((p, i) => this.thieves.set(p.id, new Thief(p, SPAWN_POINTS[i % SPAWN_POINTS.length])));
  }

  handleInput(id, input) {
    this.thieves.get(id)?.queueInput(input);
  }

  removeThief(id) {
    this.thieves.delete(id);
  }

  tick(dt) {
    this.time += dt;
    for (const thief of this.thieves.values()) thief.processInputs(dt, COLLIDERS);
  }

  /** The personal state message for one player. */
  snapshotFor(id) {
    const you = this.thieves.get(id);
    const players = [];
    for (const thief of this.thieves.values()) {
      if (thief.id !== id) players.push(thief.publicState());
    }
    return { t: Math.round(this.time * 1000), you: you?.privateState(), players };
  }
}
