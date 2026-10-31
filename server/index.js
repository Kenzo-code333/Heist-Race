// ============================================================================
// server/index.js
// ----------------------------------------------------------------------------
// The game server:
//   1. serves the built game files in production (`npm run build && npm start`)
//   2. handles Socket.io messages: create/join rooms, start matches, inputs.
// The actual game rules live in Room.js → Match.js (authoritative simulation).
// ============================================================================

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { SERVER_PORT } from '../shared/constants.js';
import { RoomManager } from './RoomManager.js';
import { handleConnection } from './handlers.js';

const app = express();
const httpServer = createServer(app);   // plain HTTP server; Socket.io attaches to it
// pingTimeout: how long the server waits for a silent player before deciding
// they left. 60 s tolerates slow computers (building the level freezes the
// page for a moment) and short internet hiccups.
const io = new Server(httpServer, { pingTimeout: 60000 });

// In production, serve the files produced by `vite build` (the /dist folder).
// In development Vite serves the client itself, on port 5173.
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// A tiny health-check URL: open http://localhost:3000/health to test the server.
app.get('/health', (req, res) => res.json({ ok: true }));

const rooms = new RoomManager(io);

// Every browser tab that connects gets the standard message handlers.
io.on('connection', (socket) => handleConnection(socket, rooms));

const port = process.env.PORT || SERVER_PORT;
httpServer.listen(port, () => {
  console.log(`[server] Heist Race server listening on http://localhost:${port}`);
});
