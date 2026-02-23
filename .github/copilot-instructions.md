# Project Guidelines

## Overview

3D traffic cop game — a single-file browser game where the player uses webcam hand gestures to direct traffic at an intersection. Built with Three.js + MediaPipe Hands, served by a zero-dependency Node.js server.

## Build and Test

```bash
node server.js        # Serve on http://localhost:8080 (or npm start)
node tests.js         # Run vehicle mechanics tests (exit code 0 = pass)
```

No `npm install` needed — zero runtime dependencies, all libraries via CDN.

**Port conflicts**: If `node server.js` fails with EADDRINUSE, kill existing node processes first:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Architecture

**Single-file game.** All HTML, CSS, and JS live in `index.html` (~3000 lines) as an inline `<script type="module">`. There are no separate JS/CSS files and no build step.

| Component | Description |
|-----------|-------------|
| Three.js scene | 3D intersection, cars, cop model, lighting |
| Car system | Spawn, movement, queuing, collision (AABB) |
| Gesture detection | MediaPipe Hands → signal state machine |
| Weather | Rain/snow canvas overlay tied to wave progression |
| Difficulty | 10 named waves with ramping speed/spawn rate |

## Conventions

### Direction Model

`DIRECTIONS` maps `NORTH/SOUTH/EAST/WEST` to `{ axis, sign, perpAxis, laneOffset, angle }`. Movement along the main axis uses `position[axis] -= dir.sign * speed * dt`. The `sign` determines which side the car approaches from:

- NORTH: axis=z, sign=-1 (approaches from negative z)
- SOUTH: axis=z, sign=+1 (approaches from positive z)
- EAST: axis=x, sign=-1, WEST: axis=x, sign=+1

### Signal States

`ALL_GO` = no signal (all traffic free-flows), `ALL_STOP`, `NS_GO` (N/S flows, E/W stops), `EW_GO` (E/W flows, N/S stops).

### Car State Machine

`moving` → `waiting` (at stop line) → `moving` (signal changes) → `through` (in intersection, immune to new stops) → removed at EXIT_DIST.

### Naming

- `UPPER_SNAKE_CASE` for constants and signal enums
- `camelCase` for variables and functions
- No TypeScript, no linter — be careful with typos

## Key Pitfalls

- **Duplicate function declarations** in the module script cause silent failure (no error in browser, entire module doesn't execute). Always check for existing declarations before adding functions.
- **Constants are mirrored in tests.js** — when changing constants in `index.html`, update `tests.js` too.
- **No module exports** — tests re-implement core logic as pure functions rather than importing from the game.
- **Gesture coordinates are mirrored** — `wrist.x < 0.5` = user's left side due to webcam mirror.
- **`getUserMedia` requires localhost** — the game must be served via the Node server, not opened as a file.
