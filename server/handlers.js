// ============================================================================
// server/handlers.js
// ----------------------------------------------------------------------------
// What the server does with each message a player sends. Kept separate from
// index.js so the same code also runs inside the browser for the offline
// preview (see client/src/net/LocalSocket.js).
// ============================================================================

/**
 * Wire up one connected player.
 * @param {object} socket - the player's connection (Socket.io, or the local stand-in)
 * @param {RoomManager} rooms
 */
export function handleConnection(socket, rooms) {
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
}
