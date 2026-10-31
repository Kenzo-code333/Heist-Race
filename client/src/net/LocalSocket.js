// ============================================================================
// client/src/net/LocalSocket.js
// ----------------------------------------------------------------------------
// OFFLINE PREVIEW: runs the real game server INSIDE the browser.
//
// Normally the browser talks to the Node server through Socket.io. Here we
// build a tiny stand-in with the same few methods (emit / on / off / join...),
// and plug the unchanged server code (RoomManager → Room → Match) into it.
// Messages are delivered on the next tick (setTimeout 0), like a very fast
// network, so the game code behaves exactly as it does online.
//
// Used by the single-file build that can be shown inside Claude (an Artifact),
// where no real server is available. Only one player: you vs. the guards.
// ============================================================================

import { RoomManager } from '../../../server/RoomManager.js';
import { handleConnection } from '../../../server/handlers.js';

const later = (fn) => setTimeout(fn, 0);

/** A minimal "subscribe / publish" helper (like a dict of callback lists). */
class Listeners {
  constructor() {
    this.map = new Map();
  }
  on(event, fn) {
    if (!this.map.has(event)) this.map.set(event, []);
    this.map.get(event).push(fn);
  }
  off(event, fn) {
    const list = this.map.get(event);
    if (list) this.map.set(event, list.filter((f) => f !== fn));
  }
  call(event, ...args) {
    for (const fn of this.map.get(event) ?? []) fn(...args);
  }
}

/**
 * Create a connected pair and return the CLIENT side, which has the same
 * shape as a Socket.io client socket (as far as our game uses it).
 */
export function createLocalSocket() {
  const id = 'local-player';
  const clientListeners = new Listeners(); // events the game listens to
  const serverListeners = new Listeners(); // events the server code listens to
  const joinedRooms = new Set();

  // --- What the SERVER code sees as "the player's socket" ---
  const serverSocket = {
    id,
    on: (event, fn) => serverListeners.on(event, fn),
    join: (code) => joinedRooms.add(code),
    leave: (code) => joinedRooms.delete(code),
    emit: (event, data) => later(() => clientListeners.call(event, data)), // server → browser
  };

  // --- What the server code sees as "io" (for io.to(roomCode).emit(...)) ---
  const io = {
    to: (code) => ({
      emit: (event, data) => {
        if (joinedRooms.has(code)) serverSocket.emit(event, data);
      },
    }),
  };

  // --- What the GAME sees as its socket ---
  const send = (event, data, ack) => later(() => serverListeners.call(event, data, ack)); // browser → server
  const clientSocket = {
    id,
    connected: true,
    emit: send,
    on: (event, fn) => clientListeners.on(event, fn),
    off: (event, fn) => clientListeners.off(event, fn),
    // Socket.io's "emit with a timeout": the callback gets (error, reply).
    timeout: () => ({ emit: (event, data, cb) => send(event, data, (reply) => cb(null, reply)) }),
  };

  // Start the in-browser server and "connect".
  const rooms = new RoomManager(io);
  handleConnection(serverSocket, rooms);
  later(() => clientListeners.call('connect'));
  return clientSocket;
}
