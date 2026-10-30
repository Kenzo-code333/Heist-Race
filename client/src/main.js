// ============================================================================
// client/src/main.js — ENTRY POINT of the browser game
// ----------------------------------------------------------------------------
// Creates the long-lived pieces (renderer + building, network, input, UI) and
// switches between the app's states:
//
//   menu  → (create / join)  → lobby → (host starts) → match
//
// During a match, a GameSession does the per-frame work (see GameSession.js).
// Outside a match, the camera slowly drifts through the building as a backdrop.
// ============================================================================

import { Renderer } from './game/Renderer.js';
import { buildLevel } from './game/LevelBuilder.js';
import { GameSession } from './game/GameSession.js';
import { Input } from './input/Input.js';
import { Hud } from './ui/Hud.js';
import { Screens } from './ui/Screens.js';
import { Network } from './net/Network.js';

const hud = new Hud();
const renderer = new Renderer(document.getElementById('game'));
const network = new Network();
const input = new Input(renderer.renderer.domElement);

let level = null;        // handles from buildLevel(): camera blockers, doors, props, lights
let session = null;      // the current GameSession, or null outside a match
let roomState = null;    // latest lobby info from the server

// ---------------------------------------------------------------- UI actions
const screens = new Screens({
  async onCreate(name) {
    screens.setBusy(true);
    const result = await network.createRoom(name);
    screens.setBusy(false);
    handleJoinResult(result);
  },
  async onJoin(code, name) {
    if (!code.trim()) return screens.showError('Type the 4-letter room code first.');
    screens.setBusy(true);
    const result = await network.joinRoom(code, name);
    screens.setBusy(false);
    handleJoinResult(result);
  },
  onStart() {
    network.startMatch();
  },
  onLeave() {
    network.leaveRoom();
    roomState = null;
    screens.show('menu');
  },
  onResume() {
    input.requestLock();
  },
  onBackToLobby() {
    network.backToLobby();
  },
});

function handleJoinResult(result) {
  if (!result?.ok) return screens.showError(result?.error ?? 'Something went wrong.');
  screens.showError('');
  // Put the room code in the address bar so a refresh / copy-paste keeps it.
  history.replaceState(null, '', `?room=${result.code}`);
  screens.show('lobby');
}

// ---------------------------------------------------------------- server events
network.on('connect', () => hud.setServerStatus(true));
network.on('disconnect', () => {
  hud.setServerStatus(false);
  endSession();
  screens.show('menu');
  screens.showError('Lost connection to the server.');
});

network.on('room:state', (state) => {
  roomState = state;
  screens.updateLobby(state, network.id);
  screens.setScoreboardHost(state.hostId === network.id);
  // The host sent everyone back from the scoreboard to the lobby.
  if (state.phase === 'lobby' && screens.current === 'scoreboard') screens.show('lobby');
});

network.on('match:end', ({ results, reason }) => {
  endSession();
  screens.showScoreboard(results, roomState?.hostId === network.id, reason);
});

// E pressed / released → tell the server (it decides what happens).
input.onInteract = (down) => {
  if (session) network.sendInteract(down);
};

network.on('match:start', ({ roster }) => {
  endSession();
  session = new GameSession({ renderer, network, input, hud, level }, roster);
  hud.setVisible(true);
  screens.show('pause');
  input.requestLock(); // may be refused without a click; the pause screen covers that
});

function endSession() {
  session?.dispose();
  session = null;
  hud.setVisible(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

// Mouse captured = playing; released = show the pause screen (match only).
input.onLockChange = (locked) => {
  if (session) screens.show(locked ? null : 'pause');
};

// ---------------------------------------------------------------- start-up
// Building the level generates many textures, which takes a moment. We wait
// one frame first so the "Building the vault…" text can appear on screen.
requestAnimationFrame(() => setTimeout(start, 0));

function start() {
  level = buildLevel(renderer.scene);
  renderer.renderer.compile(renderer.scene, renderer.camera); // pre-compile shaders: no stutter later
  screens.setBusy(false);
  screens.show('menu');

  // Handy for debugging in the browser console (development only).
  if (import.meta.env.DEV) window.heist = { renderer, network, input, get session() { return session; } };

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// Backdrop camera for the menu: a slow pan across the gallery.
function idleCamera(now) {
  const t = now / 1000;
  const cam = renderer.camera;
  cam.position.set(19 + Math.sin(t * 0.07) * 5, 2.3, 7.2);
  cam.lookAt(21 + Math.sin(t * 0.07 + 1) * 4, 1.3, 1.5);
}

let lastTime = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000); // seconds since the previous frame
  lastTime = now;
  if (session) session.update(dt);
  else idleCamera(now);
  renderer.render();
  requestAnimationFrame(loop);
}
