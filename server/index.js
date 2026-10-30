// ============================================================================
// server/index.js
// ----------------------------------------------------------------------------
// The game server. Right now (Milestone 1) it only:
//   1. serves the built game files in production (`npm run build && npm start`)
//   2. accepts Socket.io connections so the client can show "server online".
// From Milestone 2 it becomes the authoritative simulation (rooms, players...).
// ============================================================================

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { SERVER_PORT } from '../shared/constants.js';

const app = express();
const httpServer = createServer(app);   // plain HTTP server; Socket.io attaches to it
const io = new Server(httpServer);

// In production, serve the files produced by `vite build` (the /dist folder).
// In development Vite serves the client itself, on port 5173.
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// A tiny health-check URL: open http://localhost:3000/health to test the server.
app.get('/health', (req, res) => res.json({ ok: true }));

// Called every time a browser tab connects.
io.on('connection', (socket) => {
  console.log(`[server] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[server] client disconnected: ${socket.id}`);
  });
});

const port = process.env.PORT || SERVER_PORT;
httpServer.listen(port, () => {
  console.log(`[server] Heist Race server listening on http://localhost:${port}`);
});
