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
import { COLLIDERS, EXITS, SECURITY_CAMERAS, roomAt } from '../../../shared/map.js';
import { NoiseRipples } from './NoiseRipples.js';
import { CameraView } from './CameraView.js';
import { Sounds } from './Sounds.js';
import { findInteraction } from '../../../shared/interactions.js';
import { LootLayer } from './LootLayer.js';
import { INPUT_DT, INTERPOLATION_DELAY, NOISE_RADIUS, NOISE_PULSE_INTERVAL } from '../../../shared/constants.js';
import { CharacterModel } from './CharacterModel.js';
import { GuardView } from './GuardView.js';
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
    this.myModel = new CharacterModel({ outfit: 'thief', accentColor: me?.color ?? 0xe8b04a });
    renderer.scene.add(this.myModel.root);
    this.hasSpawned = false;
    this.seq = 0;
    this.pendingInputs = [];
    this.accumulator = 0;

    // Latest official facts about ourselves from the server
    this.myState = { koLeft: 0, immune: false, cash: 0, items: [], banked: 0, escaped: false };
    this.timeLeft = 0;
    this.loot = new LootLayer(renderer.scene);
    this.lootList = [];
    this.alarm = 0;
    this.police = null;
    this.ripples = new NoiseRipples(renderer.scene);
    this.ownNoiseTimer = 0;
    this.sounds = new Sounds();
    this.cameraViews = new Map(SECURITY_CAMERAS.map((def) => [def.id, new CameraView(renderer.scene, def)]));

    // --- Everyone else (interpolated) ---
    this.others = new Map(); // id -> { model, tag, facing, lastX, lastZ, speed }
    this.guards = new Map(); // id -> GuardView
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
    for (const guard of this.guards.values()) guard.dispose();
    this.guards.clear();
    this.loot.dispose();
    this.ripples.dispose();
    for (const view of this.cameraViews.values()) view.dispose();
    this.sounds.setSiren(false);
  }

  // ------------------------------------------------------------------ network
  handleSnapshot(snap) {
    this.buffer.push(snap);
    const you = snap.you;
    if (!you) return;
    this.myState = you;
    this.timeLeft = snap.timeLeft;
    this.alarm = snap.alarm ?? 0;
    this.police = snap.police ?? null;
    this.sounds.setSiren(this.police !== null);
    for (const c of snap.cameras ?? []) this.cameraViews.get(c.id)?.update(c);
    this.lootList = snap.loot ?? [];
    for (const event of snap.events ?? []) this.handleEvent(event);

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

  /** One-off messages from the server. */
  handleEvent(event) {
    if (event.type === 'spotted') { this.hud.toast('A guard spotted you — RUN!'); this.sounds.beep(980, 0.25); }
    if (event.type === 'camera') this.hud.toast('A security camera sees you!', 2);
    if (event.type === 'noise') this.ripples.add(event.x, event.z, event.r, event.kind);
    if (event.type === 'police') this.hud.toast('ALARM 100% — the police are coming! Get out!', 5);
    if (event.type === 'knockedOut') {
      this.hud.toast(event.dropped > 0 ? `Knocked out! You dropped $${event.dropped}.` : 'A guard knocked you out!', 4);
    }
    if (event.type === 'grabbed') this.hud.toast(`+$${event.value}`, 1.5);
    if (event.type === 'escaped') this.hud.toast(`You escaped with $${event.banked}!`, 5);
  }

  /** Apply the same restrictions the server applies (see Thief.modifyInput). */
  restrictInput(inp) {
    if (this.myState.koLeft > 0) return { ...inp, forward: false, back: false, left: false, right: false };
    return inp;
  }

  applyLocalInput(inp) {
    const result = stepMovement(this.me, this.restrictInput(inp), INPUT_DT, COLLIDERS);
    this.me.x = result.x;
    this.me.z = result.z;
    return result;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!this.hasSpawned) return;
    if (this.myState.escaped) {
      this.updateSpectator(dt);
      return;
    }

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
    const knockedOut = this.myState.koLeft > 0;
    this.myModel.update(dt, this.me.speed, this.me.crouching, knockedOut);
    this.camera.update(dt, { x: drawX, z: drawZ }, this.me.crouching);

    // 3) Other players and guards
    const sample = this.buffer.sample();
    if (sample) {
      this.updateOthers(dt, sample);
      this.updateGuards(dt, sample);
    }

    // Show your own footstep noise as a faint blue ring (same rules as the server).
    this.ownNoiseTimer -= dt;
    const ownRadius = knockedOut ? 0 : NOISE_RADIUS[this.me.moveMode] ?? 0;
    if (ownRadius > 0 && this.ownNoiseTimer <= 0) {
      this.ownNoiseTimer = NOISE_PULSE_INTERVAL;
      this.ripples.add(drawX, drawZ, ownRadius, 'self');
    }
    this.ripples.update(dt);

    // 4) Loot and the "E" prompt
    const option = knockedOut ? null : findInteraction({ x: drawX, z: drawZ }, { loot: this.lootList, exits: EXITS });
    const act = this.myState.act;
    if (act) this.hud.setPrompt(act.label, act.p);
    else this.hud.setPrompt(option?.label ?? null);
    this.loot.sync(this.lootList, option?.kind === 'grab' ? option.targetId : null);

    // 5) HUD
    this.hud.setTimer(this.timeLeft);
    this.hud.setAlarm(this.alarm, this.police);
    this.hud.setLoot(this.carriedValue(), this.myState.banked);
    this.hud.setRoom(roomAt(drawX, drawZ)?.name ?? '—');
    this.hud.setStance(this.me.moveMode, this.me.crouching);
    this.hud.setCenter(knockedOut ? `KNOCKED OUT\n${Math.ceil(this.myState.koLeft)}` : '');
    const chased = sample?.newer.guards?.some((g) => g.me && g.s === 'chase');
    this.hud.setDanger(!!chased);
  }

  carriedValue() {
    return this.myState.cash + (this.myState.items ?? []).reduce((sum, item) => sum + item.value, 0);
  }

  /**
   * After escaping: watch the rest of the heist from above. The camera sits
   * above the building; ceilings are only visible from below, so we look
   * straight into every room like a doll's house.
   */
  updateSpectator(dt) {
    this.myModel.root.visible = false;
    const cam = this.renderer.camera;
    const t = performance.now() / 1000;
    cam.position.set(15 + Math.sin(t * 0.05) * 3, 24, 25);
    cam.lookAt(15, 0, 10);
    const sample = this.buffer.sample();
    if (sample) {
      this.updateOthers(dt, sample);
      this.updateGuards(dt, sample);
    }
    this.loot.sync(this.lootList, null);
    this.ripples.update(dt);
    this.hud.setAlarm(this.alarm, this.police);
    this.hud.setPrompt(null);
    this.hud.setDanger(false);
    this.hud.setTimer(this.timeLeft);
    this.hud.setLoot(0, this.myState.banked);
    this.hud.setRoom('Escaped');
    this.hud.setCenter(`ESCAPED\nwaiting for the others…`);
  }

  updateGuards(dt, { older, newer, alpha }) {
    const olderById = new Map((older.guards ?? []).map((g) => [g.id, g]));
    for (const g of newer.guards ?? []) {
      let view = this.guards.get(g.id);
      if (!view) {
        view = new GuardView(this.renderer.scene);
        this.guards.set(g.id, view);
      }
      const a = olderById.get(g.id) ?? g;
      view.update({
        ...g,
        x: a.x + (g.x - a.x) * alpha,
        z: a.z + (g.z - a.z) * alpha,
        f: lerpAngle(a.f, g.f, alpha),
      }, dt);
    }
  }

  updateOthers(dt, { older, newer, alpha }) {
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
      other.model.update(dt, other.speed, p.c, p.ko);
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
    const model = new CharacterModel({ outfit: 'thief', accentColor: info.color });
    const tag = createNameTag(info.name, info.color);
    tag.position.y = 2.15;
    model.root.add(tag);
    this.renderer.scene.add(model.root);
    const other = { model, tag, facing: p.f, lastX: p.x, lastZ: p.z, speed: 0 };
    this.others.set(id, other);
    return other;
  }
}
