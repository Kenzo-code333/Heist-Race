# Heist Race — project guide

Browser-based online multiplayer 3D stealth heist game. 2–6 rival thieves rob the
same building in real time; only loot carried out through an exit counts.

The owner knows beginner/intermediate Python, **not JavaScript**: keep code clean,
heavily commented, organised in small classes/modules, and explain changes in plain
language. Don't add features beyond the current milestone; when something is
ambiguous pick the simplest option and say so.

## Current milestone

**Milestone 2 — DONE:** room codes + shareable links (`?room=CODE`), lobby with
host-only Start, up to 6 players, server-authoritative movement (clients send
numbered inputs at 60 Hz, server simulates at 20 Hz and sends personal snapshots),
client-side prediction + reconciliation for your own thief, 100 ms interpolation
for others, name tags, host migration, pause screen.

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Setup, one floor, single player movement + camera + collision | ✅ |
| 2 | Multiplayer: room links, lobby, 2+ players in sync | ✅ |
| 3 | One guard: patrol, vision cone, chase, knockout | ⏳ |
| 4 | Cash loot, exit, scoring, scoreboard (MVP) | |
| 5 | Noise, alarm meter, police escape timer | |
| 6 | Locks, safes, paintings, vault, hiding, sabotage | |
| 7 | Planning phase, gadgets, blueprint tablet + fog of war, emote wheel | |

## Stack

- **Client:** Three.js (r187) bundled with **Vite**. Plain JavaScript ES modules (no TypeScript).
- **Server:** Node.js 22 + Express + Socket.io (authoritative from Milestone 2).
- **Shared code** (`/shared`) is imported by both client and server — map data,
  constants, collision and movement rules — so both always agree.
- Dev runner: `concurrently` + Node's built-in `--watch`.

## How to run

```bash
npm install
npm run dev        # server on :3000 + Vite client on :5173 → open http://localhost:5173
```

- `npm run build && npm start` — production: the Node server serves `/dist` on :3000.
- Graphics switches via URL: `?quality=low`, or individually `?ao=0`, `?bloom=0`, `?shadows=0`.
- Server health check: http://localhost:3000/health
- In dev, the browser console exposes `window.heist` (renderer, network, input, session).
- **Two players on one computer:** open http://localhost:5173 in two tabs/windows; create a
  room in one, paste the link (or type the code) in the other.

## Architecture

```
shared/                 used by BOTH sides
  constants.js          speeds, sizes, tick rate, port
  map.js                building as DATA: ROOMS, wall lines (+doors), OBSTACLES, DECOR,
                        SPAWN_POINTS → derived WALLS, DOORWAYS, COLLIDERS, roomAt()
  collision.js          circle-vs-axis-aligned-box push-out (2D floor plan)
  movement.js           stepMovement(state, input, dt, colliders) — pure function, sub-stepped
server/
  index.js              Express + Socket.io event wiring (+ /health)
  RoomManager.js        rooms by 4-letter code, one shared tick loop (TICK_RATE)
  Room.js               lobby → playing phases, host, roster, sends per-player snapshots
  Match.js              the authoritative heist simulation for one room
  entities/Thief.js     server-side thief: validated input queue, rate-limited replay
client/
  index.html            canvas container, HUD, start overlay
  src/main.js           entry point: app states (menu → lobby → match), render loop, idle menu camera
  src/style.css
  src/game/
    Renderer.js         WebGLRenderer, scene, camera, env reflections, GTAO + bloom post-processing, GRAPHICS flags
    LevelBuilder.js     map data → floors, ceilings, walls (per-room finish), trim, door frames, lights, props
    props.js            furniture/decor builders (PROP_BUILDERS registry), local space: front = +z
    materials.js        cached PBR material catalogue (getMaterial(name))
    textures.js         procedural, tileable canvas textures (value noise) + painting generator
    geometry.js         helpers: boxGeo (UVs in metres), roundedBoxGeo, floorPlane, mesh()
    ThiefModel.js       jointed character + procedural walk/run/crouch animation
    ThirdPersonCamera.js yaw/pitch orbit camera, shoulder offset, ray-vs-Box3 wall avoidance
    GameSession.js      one match on the client: prediction/reconciliation (own thief), interpolation (others)
    SnapshotBuffer.js   snapshot history + sampling at now - INTERPOLATION_DELAY
    NameTag.js          canvas sprite labels
  src/input/Input.js    keyboard (event.code → AZERTY-safe) + pointer-lock mouse
  src/ui/Hud.js         room name, stance/noise bars, server status
  src/ui/Screens.js     menu / lobby / pause panels
  src/net/Network.js    Socket.io client wrapper (requests with acks as Promises)

### Network protocol (Socket.io events)

- client → server: `room:create {name}` (ack), `room:join {code,name}` (ack), `room:leave`,
  `room:start` (host only), `inputs [{seq, forward, back, left, right, run, crouch, yaw}]`
- server → client: `room:state {code, hostId, phase, players}`, `match:start {roster}`,
  `snap {t, you:{...,seq}, players:[{id,x,z,f,m,c}]}` (20 Hz, personal per player)
- Every input = exactly 1/60 s of movement; the server replays at most ~real-time worth per tick.
```

### Conventions

- Units: metres, seconds. Floor plan (x, z), y is up. Building spans x 0..30, z 0..20.
- Yaw 0 = looking towards **-z** ("north"). Forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw).
- Obstacles are axis-aligned rectangles only (`face` ∈ n/s/e/w); props are built facing +z and rotated.
- All geometry UVs are in metres; each material's texture `repeat` = 1 / tile size in metres.
- Only the first ceiling light per room casts shadows (performance).
- Controls: WASD move, Shift run, C toggle crouch-sneak. (Planned: E interact, Tab tablet.)

## JavaScript for Python developers (cheat sheet)

| Python | JavaScript |
|---|---|
| `import x from y` / `from y import x` | `import x from './y.js'` / `import { x } from './y.js'` |
| `def f(a, b=1):` | `function f(a, b = 1) { ... }` or `const f = (a, b = 1) => ...` |
| `class A(B): def __init__(self)` | `class A extends B { constructor() { super(); ... } }` |
| `self.x` | `this.x` |
| `None` | `null` / `undefined` |
| `dict` `{"a": 1}` | object `{ a: 1 }` |
| `list` `[1, 2]`, `len(l)` | array `[1, 2]`, `arr.length` |
| `for x in items:` | `for (const x of items) { ... }` |
| `[f(x) for x in l]` | `l.map((x) => f(x))` |
| `f"hi {name}"` | `` `hi ${name}` `` |
| `and / or / not` | `&& / \|\| / !` |
| `x if c else y` | `c ? x : y` |
| `a or default` | `a ?? defaultValue` (only for null/undefined) |
| constant / variable | `const` (can't reassign) / `let` |

## Git

Work on the designated branch; commit after each working milestone with a clear message.
