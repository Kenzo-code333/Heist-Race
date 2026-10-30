// ============================================================================
// client/src/net/Network.js
// ----------------------------------------------------------------------------
// Connection to the game server via Socket.io. In Milestone 1 it only tells us
// whether the server is reachable; Milestone 2 adds rooms, inputs and state.
// ============================================================================

import { io } from 'socket.io-client';

export class Network {
  /** @param {(online: boolean) => void} onStatus - called when connection changes */
  constructor(onStatus) {
    // No URL = connect to the same address the page came from. In development
    // Vite forwards /socket.io to the Node server (see vite.config.js).
    this.socket = io();
    this.socket.on('connect', () => onStatus(true));
    this.socket.on('disconnect', () => onStatus(false));
    this.socket.on('connect_error', () => onStatus(false));
  }
}
