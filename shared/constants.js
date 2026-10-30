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

// --- Networking ---------------------------------------------------------------
export const TICK_RATE = 20;        // server simulation + state updates per second
export const SERVER_PORT = 3000;
export const INPUT_RATE = 60;       // the client samples and sends inputs 60 times per second
export const INPUT_DT = 1 / INPUT_RATE; // so every input = 1/60 s of movement
export const INTERPOLATION_DELAY = 0.1; // other players are drawn 100 ms "in the past" for smoothness

// --- Rooms -------------------------------------------------------------------
export const MAX_PLAYERS = 6;
export const MAX_NAME_LENGTH = 16;
// One colour per player slot (armband + name tag)
export const PLAYER_COLORS = [0xe8b04a, 0x4aa8e8, 0xe84a6f, 0x5fd37a, 0xb07ae8, 0xf07c3a];

// --- Guards ------------------------------------------------------------------
export const GUARD = {
  radius: 0.32,
  speed: { patrol: 1.5, chase: 4.4, search: 1.2, return: 1.8, investigate: 2.2 },
  visionRange: 9,            // metres, in a lit room
  visionHalfAngle: 0.6,      // radians (≈ 34° each side, 68° cone)
  instantSpotDistance: 2.2,  // closer than this and in the cone = spotted at once
  catchDistance: 0.85,       // close enough to grab a thief
  searchTime: 4,             // seconds spent looking around a lost thief's last position
};

// --- Thieves getting caught ---------------------------------------------------
export const KNOCKOUT_TIME = 5;     // seconds a caught thief stays down
export const KNOCKOUT_IMMUNITY = 4; // extra seconds after waking up when guards ignore you
export const EYE_HEIGHT = { standing: 1.5, crouching: 0.9 };
