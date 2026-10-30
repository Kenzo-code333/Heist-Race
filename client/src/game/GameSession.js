// ============================================================================
// client/src/game/GameSession.js
// ----------------------------------------------------------------------------
// One match, seen from this browser. Created when the server says
// "match:start", thrown away when the match ends.
//
// Two techniques make online movement feel good:
//
// 1) CLIENT-SIDE PREDICTION (your own thief)
//    Waiting for the server before moving would feel laggy. So we move our
//    thief immediately with the same shared movement code the server uses,
//    and remember each input we sent (numbered with `seq`). When a snapshot
//    arrives, it says "I applied your inputs up to number N, you are at (x,z)".
//    We jump to that official position and re-apply our inputs after N.
//    Normally the result is exactly where we already were, so nothing visible
//    happens; if the server disagreed (e.g. you got caught), we get corrected.
//
// 2) INTERPOLATION (everyone else) — see SnapshotBuffer.js.
// ============================================================================

import * as THREE from 'three';
import { stepMovement, facingFromDirection } from '../../../shared/movement.js';
import { COLLIDERS, roomAt } from '../../../shared/map.js';
import { INPUT_DT, INTERPOLATION_DELAY } from '../../../shared/constants.js';
import { ThiefModel } from './ThiefModel.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { SnapshotBuffer, lerpAngle } from './SnapshotBuffer.js';
import { createNameTag } from './NameTag.js';

// Turn smoothly from angle `current` towards `target` (handles wrap-around).
function turnTowards(current, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

export class GameSession {
  /**
   * @param {object} deps - { renderer, network, input, hud, cameraBlockers }
   * @param {Array} roster - [{ id, name, color }] everyone in the match
   */
  constructor({ renderer, network, input, hud, cameraBlockers }, roster) {
    this.renderer = renderer;
    this.network = network;
    this.input = input;
    this.hud = hud;
    this.myId = network.id;
    this.roster = new Map(roster.map((p) => [p.id, p]));

    // --- Our own thief (predicted) ---
    const me = this.roster.get(this.myId);
    this.me = { x: 0, z: 0, prevX: 0, prevZ: 0, moveMode: 'idle', crouching: false, facing: 0, speed: 0 };
    this.myModel = new ThiefModel(me?.color ?? 0xe8b04a);
    renderer.scene.add(this.myModel.root);
    this.hasSpawned = false;
    this.seq = 0;
    this.pendingInputs = [];
    this.accumulator = 0;

    // --- Everyone else (interpolated) ---
    this.others = new Map(); // id -> { model, tag, facing, lastX, lastZ, speed }
    this.buffer = new SnapshotBuffer(INTERPOLATION_DELAY);

    this.camera = new ThirdPersonCamera(renderer.camera, cameraBlockers);

    this.onSnap = (snap) => this.handleSnapshot(snap);
    network.on('snap', this.onSnap);
  }

  dispose() {
    this.network.off('snap', this.onSnap);
    this.renderer.scene.remove(this.myModel.root);
    for (const other of this.others.values()) this.renderer.scene.remove(other.model.root);
    this.others.clear();
  }

  // ------------------------------------------------------------------ network
  handleSnapshot(snap) {
    this.buffer.push(snap);
    const you = snap.you;
    if (!you) return;

    if (!this.hasSpawned) {
      // First snapshot: place ourselves and face into the building.
      this.hasSpawned = true;
      this.camera.yaw = you.f;
      this.me.prevX = you.x;
      this.me.prevZ = you.z;
    }

    // Reconciliation: start from the server's official position...
    this.me.x = you.x;
    this.me.z = you.z;
    // ...forget inputs the server already applied...
    this.pendingInputs = this.pendingInputs.filter((inp) => inp.seq > you.seq);
    // ...and replay the ones it hasn't seen yet.
    for (const inp of this.pendingInputs) this.applyLocalInput(inp);
  }

  applyLocalInput(inp) {
    const result = stepMovement(this.me, inp, INPUT_DT, COLLIDERS);
    this.me.x = result.x;
    this.me.z = result.z;
    return result;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.hasSpawned) return;

    // 1) Mouse → camera angles
    const { dx, dy } = this.input.consumeMouse();
    this.camera.rotate(dx, dy);

    // 2) Fixed-rate input steps (exactly 60 per second, like the server expects)
    this.accumulator += dt;
    const toSend = [];
    while (this.accumulator >= INPUT_DT) {
      this.accumulator -= INPUT_DT;
      const inp = { seq: ++this.seq, ...this.input.getMovement(), yaw: this.camera.yaw };
      toSend.push(inp);
      this.pendingInputs.push(inp);
      this.me.prevX = this.me.x;
      this.me.prevZ = this.me.z;
      const result = this.applyLocalInput(inp);
      this.me.moveMode = result.moveMode;
      this.me.crouching = inp.crouch;
      if (result.moveMode !== 'idle') this.me.targetFacing = facingFromDirection(result.dirX, result.dirZ);
    }
    this.network.sendInputs(toSend);

    // Smooth drawing between the 60 Hz steps (for 120/144 Hz screens)
    const t = this.accumulator / INPUT_DT;
    const drawX = this.me.prevX + (this.me.x - this.me.prevX) * t;
    const drawZ = this.me.prevZ + (this.me.z - this.me.prevZ) * t;
    const moved = Math.hypot(this.me.x - this.me.prevX, this.me.z - this.me.prevZ);
    this.me.speed = moved / INPUT_DT;
    if (this.me.moveMode !== 'idle' && this.me.targetFacing !== undefined) {
      this.me.facing = turnTowards(this.me.facing, this.me.targetFacing, dt * 12);
    }

    this.myModel.root.position.set(drawX, 0, drawZ);
    this.myModel.root.rotation.y = this.me.facing;
    this.myModel.update(dt, this.me.speed, this.me.crouching);
    this.camera.update(dt, { x: drawX, z: drawZ }, this.me.crouching);

    // 3) Other players
    this.updateOthers(dt);

    // 4) HUD
    this.hud.setRoom(roomAt(drawX, drawZ)?.name ?? '—');
    this.hud.setStance(this.me.moveMode, this.me.crouching);
  }

  updateOthers(dt) {
    const sample = this.buffer.sample();
    if (!sample) return;
    const { older, newer, alpha } = sample;
    const olderById = new Map(older.players.map((p) => [p.id, p]));
    const seen = new Set();

    for (const p of newer.players) {
      seen.add(p.id);
      const a = olderById.get(p.id) ?? p;
      let other = this.others.get(p.id);
      if (!other) other = this.createOther(p.id, p);
      const x = a.x + (p.x - a.x) * alpha;
      const z = a.z + (p.z - a.z) * alpha;
      other.speed = dt > 0 ? Math.min(8, Math.hypot(x - other.lastX, z - other.lastZ) / dt) : 0;
      other.lastX = x;
      other.lastZ = z;
      other.facing = lerpAngle(a.f, p.f, alpha);
      other.model.root.position.set(x, 0, z);
      other.model.root.rotation.y = other.facing;
      other.model.update(dt, other.speed, p.c);
    }

    // Remove players that are no longer in the snapshot (left / not visible)
    for (const [id, other] of this.others) {
      if (!seen.has(id)) {
        this.renderer.scene.remove(other.model.root);
        this.others.delete(id);
      }
    }
  }

  createOther(id, p) {
    const info = this.roster.get(id) ?? { name: '?', color: 0xffffff };
    const model = new ThiefModel(info.color);
    const tag = createNameTag(info.name, info.color);
    tag.position.y = 2.15;
    model.root.add(tag);
    this.renderer.scene.add(model.root);
    const other = { model, tag, facing: p.f, lastX: p.x, lastZ: p.z, speed: 0 };
    this.others.set(id, other);
    return other;
  }
}
