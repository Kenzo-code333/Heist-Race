// ============================================================================
// server/Room.js
// ----------------------------------------------------------------------------
// One room = a group of players sharing a code. A room goes through phases:
//
//   'lobby'   → players gather, the host presses Start
//   'playing' → a Match (the actual heist simulation) is running
//
// The room relays messages between the sockets and its Match, and sends each
// player a personal state "snapshot" every tick.
// ============================================================================

import { Match } from './Match.js';
import { MAX_PLAYERS, MAX_NAME_LENGTH, PLAYER_COLORS } from '../shared/constants.js';

export class Room {
  constructor(code, io, onEmpty) {
    this.code = code;
    this.io = io;
    this.onEmpty = onEmpty;
    this.players = new Map(); // socket id -> { id, name, color, socket }
    this.hostId = null;
    this.phase = 'lobby';
    this.match = null;
  }

  /** Try to add a player. Returns { ok, error? } for the client. */
  addPlayer(socket, rawName) {
    if (this.phase !== 'lobby') return { ok: false, error: 'This heist has already started.' };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'This room is full (6 players).' };

    // Give the player the first colour nobody else is using.
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c));
    const name = cleanName(rawName) || `Thief ${this.players.size + 1}`;

    this.players.set(socket.id, { id: socket.id, name, color, socket });
    socket.join(this.code); // Socket.io "room": lets us broadcast to everyone in it
    if (!this.hostId) this.hostId = socket.id;
    this.broadcastRoomState();
    return { ok: true, code: this.code, yourId: socket.id };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.socket.leave(this.code);
    this.players.delete(id);
    this.match?.removeThief(id);

    if (this.players.size === 0) {
      this.onEmpty();
      return;
    }
    // If the host left, the next player becomes host.
    if (this.hostId === id) this.hostId = this.players.keys().next().value;
    this.broadcastRoomState();
  }

  /** Host pressed Start. */
  start(byId) {
    if (byId !== this.hostId || this.phase !== 'lobby') return;
    this.phase = 'playing';
    this.match = new Match([...this.players.values()]);
    this.io.to(this.code).emit('match:start', { roster: this.roster() });
    this.broadcastRoomState();
  }

  handleInput(id, input) {
    if (this.phase === 'playing') this.match.handleInput(id, input);
  }

  /** Public info about everyone (no sockets!) */
  roster() {
    return [...this.players.values()].map(({ id, name, color }) => ({ id, name, color }));
  }

  broadcastRoomState() {
    this.io.to(this.code).emit('room:state', {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      players: this.roster(),
    });
  }

  /** Called by the RoomManager every tick. */
  tick(dt) {
    if (this.phase !== 'playing') return;
    this.match.tick(dt);
    // Each player gets their OWN snapshot (later: filtered by what they can see).
    for (const player of this.players.values()) {
      player.socket.emit('snap', this.match.snapshotFor(player.id));
    }
  }
}

// Keep names short and free of odd characters.
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
}
