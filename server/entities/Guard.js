// ============================================================================
// server/entities/Guard.js
// ----------------------------------------------------------------------------
// A security guard, controlled by the server. Its behaviour is a small
// STATE MACHINE — at any moment the guard is in exactly one state:
//
//   patrol      walk the patrol route, pausing at some waypoints
//   suspicious  saw something: stops and stares while the alert level fills up
//   chase       alert reached 100%: runs after the thief
//   search      lost the thief: goes to the last place they were seen, looks around
//   return      walks back to the patrol route
//
// Each tick, `update()` looks at the world and decides whether to switch state.
// ============================================================================

import { GUARD } from '../../shared/constants.js';
import { resolveCircleVsBoxes } from '../../shared/collision.js';
import { hasLineOfSight, inViewCone } from '../../shared/sight.js';
import { visionBlockers } from '../../shared/map.js';
import { facingFromDirection } from '../../shared/movement.js';

const REPATH_INTERVAL = 0.4; // seconds between path recalculations while chasing

export class Guard {
  /**
   * @param {object} route - { id, waypoints: [{x, z, wait}] } from shared/map.js
   * @param {NavGrid} nav - pathfinding grid
   */
  constructor(route, nav) {
    this.id = route.id;
    this.waypoints = route.waypoints;
    this.nav = nav;
    this.x = this.waypoints[0].x;
    this.z = this.waypoints[0].z;
    this.facing = 0;
    this.state = 'patrol';
    this.alert = 0;            // 0..1: how sure the guard is that someone is there
    this.targetId = null;      // thief being watched or chased
    this.lastSeen = null;      // { x, z } where the target was last seen
    this.waypointIndex = 0;
    this.waitTimer = 0;
    this.stateTimer = 0;
    this.path = [];
    this.repathTimer = 0;
    this.moving = false;
  }

  // ------------------------------------------------------------- perception
  /**
   * Can this guard see the thief right now?
   * Considers the vision cone, distance, walls/furniture and darkness.
   */
  canSee(thief, match) {
    if (!thief.isTargetable(match.time)) return false;
    const range = match.visionRangeAt(thief.x, thief.z);
    if (!inViewCone(this.x, this.z, this.facing, thief.x, thief.z, range, GUARD.visionHalfAngle)) return false;
    return hasLineOfSight(this.x, this.z, thief.x, thief.z, match.visionBlockersFor(thief.crouching));
  }

  /** The closest thief this guard can see, or null. */
  findVisibleThief(match) {
    let best = null, bestDist = Infinity;
    for (const thief of match.thieves.values()) {
      if (!this.canSee(thief, match)) continue;
      const d = Math.hypot(thief.x - this.x, thief.z - this.z);
      if (d < bestDist) { bestDist = d; best = thief; }
    }
    return best ? { thief: best, dist: bestDist } : null;
  }

  // ------------------------------------------------------------- main update
  update(dt, match) {
    this.stateTimer += dt;
    const seen = this.findVisibleThief(match);
    this.moving = false;

    switch (this.state) {
      case 'patrol':
      case 'return':
      case 'search':
      case 'investigate':
        if (seen) this.becomeSuspicious(seen);
        break;
      default:
        break;
    }

    switch (this.state) {
      case 'patrol': this.updatePatrol(dt); break;
      case 'suspicious': this.updateSuspicious(dt, seen, match); break;
      case 'chase': this.updateChase(dt, seen, match); break;
      case 'search': this.updateSearch(dt); break;
      case 'return': this.updateReturn(dt); break;
      case 'investigate': this.updateInvestigate(dt); break;
      default: break;
    }

    // Keep the guard out of walls whatever happened.
    ({ x: this.x, z: this.z } = resolveCircleVsBoxes(this.x, this.z, GUARD.radius, match.colliders));
  }

  setState(state) {
    this.state = state;
    this.stateTimer = 0;
    this.path = [];
  }

  becomeSuspicious(seen) {
    this.targetId = seen.thief.id;
    this.setState('suspicious');
  }

  // --- patrol: walk from waypoint to waypoint, waiting where told to ---
  updatePatrol(dt) {
    const wp = this.waypoints[this.waypointIndex];
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this.lookAround(dt);
      if (this.waitTimer <= 0) this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      return;
    }
    if (this.walkTo(wp.x, wp.z, GUARD.speed.patrol, dt)) {
      if (wp.wait > 0) this.waitTimer = wp.wait;
      else this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
    }
  }

  // --- suspicious: stand still, stare, fill the alert meter ---
  updateSuspicious(dt, seen, match) {
    if (seen && seen.thief.id === this.targetId) {
      const thief = seen.thief;
      this.faceTowards(thief.x, thief.z, dt * 6);
      this.lastSeen = { x: thief.x, z: thief.z };
      if (seen.dist < GUARD.instantSpotDistance) {
        this.alert = 1;
      } else {
        // Closer = faster. Crouching halves it, running makes you obvious.
        const closeness = 1 - seen.dist / match.visionRangeAt(thief.x, thief.z);
        let rate = 0.6 + 2.2 * Math.max(0, closeness);
        if (thief.crouching) rate *= 0.5;
        if (thief.moveMode === 'run') rate *= 1.6;
        this.alert = Math.min(1, this.alert + rate * dt);
      }
      if (this.alert >= 1) this.startChase(thief, match);
    } else if (seen) {
      this.targetId = seen.thief.id; // a different thief caught the eye
    } else {
      this.alert -= dt * 0.35;
      if (this.alert <= 0) {
        this.alert = 0;
        this.setState(this.lastSeen ? 'search' : 'return');
      }
    }
  }

  startChase(thief, match) {
    this.alert = 1;
    this.targetId = thief.id;
    this.setState('chase');
    match.onGuardSpotted(this, thief);
  }

  // --- chase: run at the target; catch them if close enough ---
  updateChase(dt, seen, match) {
    const target = match.thieves.get(this.targetId);
    if (!target || !target.isTargetable(match.time)) {
      this.setState('return');
      this.alert = 0.4;
      return;
    }
    const visible = this.canSee(target, match) || Math.hypot(target.x - this.x, target.z - this.z) < 1.5;
    if (visible) this.lastSeen = { x: target.x, z: target.z };

    const goal = this.lastSeen;
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.path = this.nav.findPath(this.x, this.z, goal.x, goal.z);
      this.repathTimer = REPATH_INTERVAL;
    }
    const arrived = this.followPath(GUARD.speed.chase, dt);

    if (visible && Math.hypot(target.x - this.x, target.z - this.z) < GUARD.catchDistance) {
      match.knockOut(target, this);
      this.alert = 0.3;
      this.setState('return');
      this.waitTimer = 1.5; // pause a moment after the catch
      return;
    }
    if (!visible && arrived) this.setState('search');
  }

  // --- search: look around where the thief was last seen ---
  updateSearch(dt) {
    if (this.lastSeen && this.stateTimer < 1.5 && !this.reachedSearchSpot) {
      if (this.walkTo(this.lastSeen.x, this.lastSeen.z, GUARD.speed.search, dt)) this.reachedSearchSpot = true;
    } else {
      this.lookAround(dt * 1.6);
    }
    if (this.stateTimer > GUARD.searchTime) {
      this.reachedSearchSpot = false;
      this.lastSeen = null;
      this.alert = 0;
      this.setState('return');
    }
  }

  // --- return: walk back to the closest patrol waypoint ---
  updateReturn(dt) {
    if (this.waitTimer > 0) { this.waitTimer -= dt; return; }
    if (this.path.length === 0 && this.stateTimer < 0.1) this.waypointIndex = this.closestWaypoint();
    const wp = this.waypoints[this.waypointIndex];
    if (this.walkTo(wp.x, wp.z, GUARD.speed.return, dt)) {
      this.targetId = null;
      this.alert = 0;
      this.setState('patrol');
    }
  }

  // --- investigate: walk to a point of interest (used from Milestone 5) ---
  updateInvestigate(dt) {
    if (!this.investigateSpot) { this.setState('return'); return; }
    if (this.walkTo(this.investigateSpot.x, this.investigateSpot.z, GUARD.speed.investigate, dt)) {
      this.lastSeen = this.investigateSpot;
      this.reachedSearchSpot = true;
      this.investigateSpot = null;
      this.setState('search');
    }
  }

  closestWaypoint() {
    let best = 0, bestD = Infinity;
    this.waypoints.forEach((wp, i) => {
      const d = Math.hypot(wp.x - this.x, wp.z - this.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // ------------------------------------------------------------- movement helpers
  /** Walk along a path to (x, z). Returns true once arrived. */
  walkTo(x, z, speed, dt) {
    const end = this.path[this.path.length - 1];
    if (!end || Math.hypot(end.x - x, end.z - z) > 0.6) this.path = this.nav.findPath(this.x, this.z, x, z);
    return this.followPath(speed, dt);
  }

  /** Move along this.path. Returns true when the path is finished. */
  followPath(speed, dt) {
    let budget = speed * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const dx = next.x - this.x, dz = next.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= budget) {
        this.x = next.x;
        this.z = next.z;
        budget -= dist;
        this.path.shift();
      } else {
        this.x += (dx / dist) * budget;
        this.z += (dz / dist) * budget;
        this.faceTowards(next.x, next.z, dt * 8);
        budget = 0;
        this.moving = true;
      }
    }
    return this.path.length === 0;
  }

  /** Turn towards a point by at most `maxTurn` radians. */
  faceTowards(x, z, maxTurn) {
    const dx = x - this.x, dz = z - this.z;
    if (Math.hypot(dx, dz) < 1e-3) return;
    const target = facingFromDirection(dx, dz);
    const diff = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
    this.facing += Math.max(-maxTurn, Math.min(maxTurn, diff));
  }

  /** Slowly sweep the flashlight left and right. */
  lookAround(dt) {
    this.lookPhase = (this.lookPhase ?? 0) + dt;
    this.facing += Math.sin(this.lookPhase * 1.4) * dt * 1.2;
  }

  /** What clients receive about this guard. */
  publicState(viewerId) {
    return {
      id: this.id,
      x: Math.round(this.x * 100) / 100,
      z: Math.round(this.z * 100) / 100,
      f: Math.round(this.facing * 100) / 100,
      s: this.state,
      a: Math.round(this.alert * 100) / 100,
      mv: this.moving,
      me: this.targetId === viewerId && (this.state === 'chase' || this.state === 'suspicious'),
    };
  }
}
