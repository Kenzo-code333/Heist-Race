// ============================================================================
// server/entities/Thief.js
// ----------------------------------------------------------------------------
// The server's copy of one player's thief. The server is the AUTHORITY: it
// receives the player's inputs (keys pressed + camera direction), applies the
// shared movement rules, and decides where the thief really is.
// ============================================================================

import { stepMovement, facingFromDirection } from '../../shared/movement.js';
import { INPUT_DT } from '../../shared/constants.js';

const MAX_QUEUED_INPUTS = 60;

export class Thief {
  constructor({ id, name, color }, spawn) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = spawn.x;
    this.z = spawn.z;
    this.facing = 0;
    this.moveMode = 'idle';
    this.crouching = false;
    this.lastSeq = -1;       // number of the last input we applied (sent back to the client)
    this.inputQueue = [];
    this.idleTime = 0;
  }

  /** Store an input until the next tick. Inputs are validated first. */
  queueInput(raw) {
    if (!raw || typeof raw !== 'object') return;
    const seq = Number(raw.seq);
    if (!Number.isInteger(seq) || seq <= this.lastSeq) return; // old or bogus
    if (this.inputQueue.length >= MAX_QUEUED_INPUTS) return;  // flooding: ignore
    const yaw = Number(raw.yaw);
    this.inputQueue.push({
      seq,
      forward: !!raw.forward, back: !!raw.back, left: !!raw.left, right: !!raw.right,
      run: !!raw.run, crouch: !!raw.crouch,
      yaw: Number.isFinite(yaw) ? yaw : 0,
    });
  }

  /**
   * Apply queued inputs. Each input is exactly 1/60 s of movement, and we only
   * allow about as many inputs as real time has passed, so a cheating client
   * can't move faster by sending more inputs.
   */
  processInputs(dt, colliders) {
    const allowed = Math.ceil(dt / INPUT_DT) + 2;
    let processed = 0;
    while (this.inputQueue.length > 0 && processed < allowed) {
      const input = this.modifyInput(this.inputQueue.shift());
      this.applyInput(input, colliders);
      processed++;
    }
    // If the player stops sending inputs (lag), show them as idle after a moment.
    this.idleTime = processed > 0 ? 0 : this.idleTime + dt;
    if (this.idleTime > 0.25) this.moveMode = 'idle';
  }

  /** Hook for later milestones (e.g. can't run while carrying heavy loot). */
  modifyInput(input) {
    return input;
  }

  applyInput(input, colliders) {
    const result = stepMovement(this, input, INPUT_DT, colliders);
    this.x = result.x;
    this.z = result.z;
    this.moveMode = result.moveMode;
    this.crouching = input.crouch;
    if (result.moveMode !== 'idle') this.facing = facingFromDirection(result.dirX, result.dirZ);
    this.lastSeq = input.seq;
  }

  /** What OTHER players receive about this thief (kept small: sent 20x/s). */
  publicState() {
    return { id: this.id, x: round(this.x), z: round(this.z), f: round(this.facing), m: this.moveMode, c: this.crouching };
  }

  /** What the owning player receives about themself. */
  privateState() {
    return { ...this.publicState(), seq: this.lastSeq };
  }
}

const round = (v) => Math.round(v * 100) / 100;
