# Heist Race

Browser-based online multiplayer 3D stealth heist game. 2–6 rival thieves break into
the same building at the same time; only loot carried out through an exit counts.

Three.js + Vite on the client, Node.js + Socket.io (authoritative server) on the back end.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, create a room and share the link (or the 4-letter code).
To try multiplayer alone, open the link in a second browser tab or window.

## How to play

1. **Plan (60 s):** pick a secret entry point and two gadgets.
2. **Steal:** cash, safes, paintings (heavy) and the vault (loud, three stages).
3. **Stay quiet:** sneaking is silent, walking is quiet, running is loud. Guards
   investigate noise; cameras and guards raise the shared alarm.
4. **Escape:** at 100% alarm the police arrive in 60 s. Only what you carry out counts.

| Key | Action |
|---|---|
| W A S D (Z Q S D on AZERTY) | Move |
| Shift | Run (loud) |
| C | Toggle crouch-sneak (silent) |
| E (tap / hold) | Doors, hiding / grab loot, crack safes, pick locks, cut lights, escape |
| 1 / 2 | Use gadget |
| Tab | Blueprint tablet with your fog of war |
| Q (A on AZERTY), hold | Chat wheel |

If it runs slowly: http://localhost:5173/?quality=low

See [CLAUDE.md](CLAUDE.md) for the architecture.
