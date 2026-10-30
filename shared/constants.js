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

// --- Loot, interactions and the match ----------------------------------------
export const REACH = 1.5;            // how close you must be to interact (m)
export const MATCH_DURATION = 8 * 60; // seconds; thieves still inside at the end lose their loot
export const KNOCKOUT_DROP_SHARE = 0.5; // share of carried cash dropped when knocked out
// Seconds of holding E for each action.
export const ACTION_TIME = {
  grabCash: 1.0, grabPainting: 2.5, grabGold: 1.5, escape: 1.5,
  closeDoor: 0.15, lockDoor: 1.2, pickLock: 4, hide: 0.5, unhide: 0.3, lights: 1.0,
};

// Bulky loot has WEIGHT. Carrying any weight means you can't run.
// You can carry at most MAX_CARRY_WEIGHT: one painting, or up to 3 gold bars.
export const LOOT_WEIGHT = { cash: 0, painting: 3, gold: 1 };
export const MAX_CARRY_WEIGHT = 3;

// Noises made while doing things (radius in metres, every second while busy)
export const ACTION_NOISE = { pickLock: 2, crack: 3, vault: 6, vaultStage: 12, lights: 4, door: 2.5 };
export const ALARM_VAULT_STAGE = 6;   // + alarm per finished vault stage
export const DARK_VISION_RANGE = 4;   // guards' flashlight range in a dark room (m)
export const LIGHTS_FIX_DELAY = 20;   // seconds before a guard goes to turn the lights back on

// --- Noise ---------------------------------------------------------------------
// How far (m) a noise carries. Guards inside the radius come to investigate;
// other thieves see a ripple. Walls muffle noise (radius x WALL_MUFFLE).
export const NOISE_RADIUS = { sneak: 0, walk: 2.5, run: 8 };
export const NOISE_PULSE_INTERVAL = 0.6; // a moving thief "emits" a noise this often (s)
export const WALL_MUFFLE = 0.6;
export const PLAYER_HEARING_BONUS = 4;   // thieves hear noises this much further than guards

// --- Alarm & police -------------------------------------------------------------
export const ALARM = {
  guardHearsNoise: 1.5,   // + per noise a guard reacts to
  guardStartsChase: 12,   // + when a guard starts chasing someone
  chasePerSecond: 1,      // + per second while any guard is chasing
  cameraPerSecond: 9,     // + per second while a camera sees a thief
  knockout: 5,            // + when someone gets knocked out
};
export const POLICE_COUNTDOWN = 60; // seconds to escape once the alarm hits 100%

// --- Security cameras ---------------------------------------------------------------
export const CAMERA = { range: 10, halfAngle: 0.42, sweepPeriod: 9 };
