// ============================================================================
// shared/constants.js
// ----------------------------------------------------------------------------
// Numbers used by BOTH the client (browser) and the server (Node.js).
// Keeping them in one place guarantees both sides agree on the rules.
//
// Units: distances are in METRES, times in SECONDS, speeds in METRES/SECOND.
// ============================================================================

// --- Player body ------------------------------------------------------------
export const PLAYER_RADIUS = 0.35; // the thief is a circle of this radius on the floor plan

// --- Movement speeds (m/s) --------------------------------------------------
// Sneaking is silent and slow, walking is quiet, running is loud (noise = M5).
export const SPEED = {
  sneak: 1.4,
  walk: 3.0,
  run: 5.6,
};

// --- Building dimensions ----------------------------------------------------
export const WALL_HEIGHT = 3.0;    // floor to ceiling
export const WALL_THICKNESS = 0.2;
export const DOOR_WIDTH = 1.4;     // width of a doorway gap
export const DOOR_HEIGHT = 2.2;    // height of a doorway (wall continues above it)

// --- Networking (used from Milestone 2) -------------------------------------
export const TICK_RATE = 20;       // server state updates per second
export const SERVER_PORT = 3000;
