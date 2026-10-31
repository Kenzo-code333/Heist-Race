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

// Called every time a browser tab connects. `socket` is that tab's connection.
io.on('connection', (socket) => {
  let room = null; // the room this tab is in (null = main menu)

  // Wrap ack callbacks: clients may forget to pass one.
  const reply = (ack, data) => typeof ack === 'function' && ack(data);
  const leaveCurrent = () => { room?.removePlayer(socket.id); room = null; };

  socket.on('room:create', (msg, ack) => {
    leaveCurrent();
    room = rooms.createRoom();
    reply(ack, room.addPlayer(socket, msg?.name));
  });

  socket.on('room:join', (msg, ack) => {
    leaveCurrent();
    const target = rooms.getRoom(msg?.code);
    if (!target) return reply(ack, { ok: false, error: 'No room with that code.' });
    const result = target.addPlayer(socket, msg?.name);
    if (result.ok) room = target;
    reply(ack, result);
  });

  socket.on('room:leave', leaveCurrent);
  socket.on('room:start', () => room?.start(socket.id));
  socket.on('room:lobby', () => room?.backToLobby(socket.id));
  socket.on('interact', (msg) => room?.handleInteract(socket.id, msg?.down));
  socket.on('plan:choose', (msg) => room?.choosePlan(socket.id, msg));
  socket.on('plan:ready', () => room?.setReady(socket.id));
  socket.on('gadget', (msg) => room?.handleGadget(socket.id, msg));
  socket.on('emote', (msg) => room?.handleEmote(socket.id, msg));
  socket.on('inputs', (list) => {
    if (!Array.isArray(list)) return;
    for (const input of list.slice(0, 10)) room?.handleInput(socket.id, input);
  });
  socket.on('disconnect', leaveCurrent);
});

const port = process.env.PORT || SERVER_PORT;
httpServer.listen(port, () => {
  console.log(`[server] Heist Race server listening on http://localhost:${port}`);
});
