// ============================================================================
// server/Room.js
// ----------------------------------------------------------------------------
// One room = a group of players sharing a code. A room goes through phases:
//
//   'lobby'    → players gather, the host presses Start
//   'planning' → 60 s: each player SECRETLY picks an entry point + 2 gadgets
//   'playing'  → a Match (the actual heist simulation) is running
//   'ended'   → everyone sees the scoreboard; the host can go back to the lobby
//
// The room relays messages between the sockets and its Match, and sends each
// player a personal state "snapshot" every tick.
// ============================================================================

import { Match } from './Match.js';
import { MAX_PLAYERS, MAX_NAME_LENGTH, PLAYER_COLORS, PLANNING_TIME, GADGETS, GADGET_SLOTS, EMOTES } from '../shared/constants.js';
import { ENTRY_POINTS } from '../shared/map.js';

export class Room {
  constructor(code, io, onEmpty) {
    this.code = code;
    this.io = io;
    this.onEmpty = onEmpty;
    this.players = new Map(); // socket id -> { id, name, color, socket }
    this.hostId = null;
    this.phase = 'lobby';
    this.match = null;
    this.planning = null; // { timeLeft, choices: Map(id -> { entry, gadgets, ready }) }
    this.lastEmote = new Map(); // id -> time of last emote (anti-spam)
  }

  /** Try to add a player. Returns { ok, error? } for the client. */
  addPlayer(socket, rawName) {
    if (this.phase !== 'lobby') return { ok: false, error: 'This heist has already started — try again in a minute.' };
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
    this.planning?.choices.delete(id);

    if (this.players.size === 0) {
      this.onEmpty();
      return;
    }
    // If the host left, the next player becomes host.
    if (this.hostId === id) this.hostId = this.players.keys().next().value;
    this.broadcastRoomState();
  }

  /** Host pressed Start: begin the planning phase. */
  start(byId) {
    if (byId !== this.hostId || this.phase !== 'lobby') return;
    this.phase = 'planning';
    const choices = new Map();
    for (const id of this.players.keys()) choices.set(id, { entry: 'main', gadgets: ['smoke', 'lockpick'], ready: false });
    this.planning = { timeLeft: PLANNING_TIME, choices, lastSent: -1 };
    this.broadcastRoomState();
    this.sendPlanningState();
  }

  /** A player changed their plan. Everything is validated (never trust the client). */
  choosePlan(id, msg) {
    const choice = this.planning?.choices.get(id);
    if (!choice || choice.ready) return;
    const gadgets = Array.isArray(msg?.gadgets)
      ? [...new Set(msg.gadgets.filter((g) => typeof g === 'string' && GADGETS[g]))].slice(0, GADGET_SLOTS)
      : choice.gadgets;
    const entry = ENTRY_POINTS.find((e) => e.id === msg?.entry) ? msg.entry : choice.entry;
    choice.gadgets = gadgets;
    // The skylight needs the grappling hook.
    const entryDef = ENTRY_POINTS.find((e) => e.id === entry);
    choice.entry = entryDef.requires && !gadgets.includes(entryDef.requires) ? 'main' : entry;
    this.sendPlanningState();
  }

  setReady(id) {
    const choice = this.planning?.choices.get(id);
    if (!choice) return;
    choice.ready = true;
    this.sendPlanningState();
    if ([...this.planning.choices.values()].every((c) => c.ready)) this.beginHeist();
  }

  /** Each player only learns their OWN choices (+ how many are ready). */
  sendPlanningState() {
    if (!this.planning) return;
    const choices = [...this.planning.choices.values()];
    const readyCount = choices.filter((c) => c.ready).length;
    for (const [id, choice] of this.planning.choices) {
      this.players.get(id)?.socket.emit('plan:state', {
        timeLeft: Math.ceil(this.planning.timeLeft), you: choice, readyCount, total: choices.length,
      });
    }
  }

  beginHeist() {
    const plans = this.planning.choices;
    this.planning = null;
    this.phase = 'playing';
    const players = [...this.players.values()].map((p) => ({ ...p, plan: plans.get(p.id) ?? { entry: 'main', gadgets: [] } }));
    this.match = new Match(players, (results, reason) => this.endMatch(results, reason));
    this.io.to(this.code).emit('match:start', { roster: this.roster() });
    this.broadcastRoomState();
  }

  handleGadget(id, msg) {
    if (this.phase === 'playing') this.match.useGadget(id, msg);
  }

  /** Chat-wheel message: everyone sees it in the feed; the bubble shows only where the sender is visible. */
  handleEmote(id, msg) {
    if (this.phase !== 'playing' || !EMOTES.find((e) => e.id === msg?.id)) return;
    const now = Date.now();
    if (now - (this.lastEmote.get(id) ?? 0) < 1000) return; // max one per second
    this.lastEmote.set(id, now);
    this.io.to(this.code).emit('emote', { from: id, id: msg.id });
  }

  handleInput(id, input) {
    if (this.phase === 'playing') this.match.handleInput(id, input);
  }

  handleInteract(id, down) {
    if (this.phase === 'playing') this.match.handleInteract(id, down);
  }

  /** Called by the Match when it's over. */
  endMatch(results, reason) {
    this.phase = 'ended';
    // Send one last snapshot so everyone sees the final state, then the results.
    for (const player of this.players.values()) player.socket.emit('snap', this.match.snapshotFor(player.id));
    this.io.to(this.code).emit('match:end', { results, reason });
    this.match = null;
    this.broadcastRoomState();
  }

  /** Host pressed "Back to lobby" on the scoreboard. */
  backToLobby(byId) {
    if (byId !== this.hostId || this.phase !== 'ended') return;
    this.phase = 'lobby';
    this.broadcastRoomState();
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
    if (this.phase === 'planning') {
      this.planning.timeLeft -= dt;
      if (this.planning.timeLeft <= 0) return this.beginHeist();
      // Refresh everyone's countdown once per second.
      const second = Math.ceil(this.planning.timeLeft);
      if (second !== this.planning.lastSent) {
        this.planning.lastSent = second;
        this.sendPlanningState();
      }
      return;
    }
    if (this.phase !== 'playing') return;
    this.match.tick(dt);
    if (this.phase !== 'playing') return; // the match just ended during this tick
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
