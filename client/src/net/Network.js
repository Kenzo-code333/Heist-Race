// ============================================================================
// client/src/net/Network.js
// ----------------------------------------------------------------------------
// Everything that talks to the server goes through this class.
//
// Socket.io sends named messages ("events") both ways:
//   client → server : room:create, room:join, room:leave, room:start, inputs
//   server → client : room:state, match:start, snap (20x per second)
//
// Some requests expect an answer ("acknowledgement"); we wrap those in
// Promises so the caller can write: const result = await network.createRoom(name)
// (a Promise is like a Python awaitable / future).
// ============================================================================

import { io } from 'socket.io-client';

export class Network {
  constructor() {
    // No URL = connect to the same address the page came from. In development
    // Vite forwards /socket.io to the Node server (see vite.config.js).
    this.socket = io();
  }

  get id() {
    return this.socket.id;
  }

  /** Subscribe to a server message, e.g. network.on('snap', (data) => ...) */
  on(event, callback) {
    this.socket.on(event, callback);
  }

  off(event, callback) {
    this.socket.off(event, callback);
  }

  /** Send a message and wait for the server's reply. */
  request(event, data) {
    return new Promise((resolve) => {
      this.socket.timeout(5000).emit(event, data, (err, reply) => {
        resolve(err ? { ok: false, error: 'The server did not answer.' } : reply);
      });
    });
  }

  createRoom(name) { return this.request('room:create', { name }); }
  joinRoom(code, name) { return this.request('room:join', { code, name }); }
  leaveRoom() { this.socket.emit('room:leave'); }
  startMatch() { this.socket.emit('room:start'); }

  /**
   * Send this frame's inputs (usually 1, sometimes 2-3) in one message.
   * Inputs must not get lost: the server replays them in order.
   */
  sendInputs(inputs) { if (inputs.length) this.socket.emit('inputs', inputs); }
}
