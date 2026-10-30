// ============================================================================
// server/RoomManager.js
// ----------------------------------------------------------------------------
// Keeps track of every open room (lobby or match) by its 4-letter code, and
// runs ONE shared game loop that ticks all rooms TICK_RATE times per second.
// ============================================================================

import { Room } from './Room.js';
import { TICK_RATE } from '../shared/constants.js';

// No 0/O or 1/I so codes are easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // code -> Room
    this.lastTick = performance.now();
    setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  makeCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom() {
    const code = this.makeCode();
    const room = new Room(code, this.io, () => {
      this.rooms.delete(code);
      console.log(`[rooms] room ${code} closed (empty)`);
    });
    this.rooms.set(code, room);
    console.log(`[rooms] room ${code} created`);
    return room;
  }

  getRoom(code) {
    return typeof code === 'string' ? this.rooms.get(code.trim().toUpperCase()) : undefined;
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000); // seconds since last tick
    this.lastTick = now;
    for (const room of this.rooms.values()) room.tick(dt);
  }
}
