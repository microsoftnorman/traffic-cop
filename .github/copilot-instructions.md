# Project Guidelines

## Overview

3D traffic cop game — a modular browser game where the player uses webcam hand gestures to direct traffic at an intersection. Built with Three.js + MediaPipe Hands, served by a zero-dependency Node.js server.

## Build and Test

```bash
node server.js        # Serve on http://localhost:8080 (or npm start)
node tests.js         # Run vehicle mechanics tests (exit code 0 = pass)
npx playwright test   # Run e2e browser tests (25 tests)
```

No `npm install` needed — zero runtime dependencies, all libraries via CDN.

**Port conflicts**: If `node server.js` fails with EADDRINUSE, kill existing node processes first:
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Architecture

**Modular ES modules.** HTML/CSS live in `index.html`, game JS is split across ES module files in `js/`. No build step — modules loaded natively via browser `<script type="module">`.

| File | Description |
|------|-------------|
| `index.html` | HTML/CSS shell + importmap for Three.js CDN |
| `js/main.js` | Hub entry point: game flow, main loop, init, callback wiring |
| `js/constants.js` | All game constants (dimensions, directions, signal states) |
| `js/state.js` | Single mutable state object shared across modules |
| `js/audio.js` | Web Audio API procedural sound system |
| `js/scene.js` | Three.js scene setup, intersection, cop model, buildings |
| `js/vehicles.js` | Vehicle meshes, spawning, movement, brake lights, blinkers |
| `js/pedestrians.js` | Pedestrian meshes, ambient peds, bus passengers |
| `js/collisions.js` | Collision detection, crash effects, emergency vehicles |
| `js/weather.js` | Rain/snow canvas overlay system |
| `js/night.js` | Day/night mode with lighting changes |
| `js/difficulty.js` | Wave progression, difficulty scaling, sidewalk network |
| `js/gestures.js` | MediaPipe Hands gesture detection + gesture-driven UI |
| `js/controls.js` | Cop animation, camera, signal markers, keyboard controls |

### Module Dependency Order

```
constants → state → audio → weather → night → difficulty → scene →
vehicles → pedestrians → collisions → gestures → controls → main
```

### State Pattern

All mutable game state lives in a single `state` object exported from `js/state.js`. Modules import `state` and access properties as `state.xxx` (e.g., `state.cars`, `state.score`, `state.signalState`).

### Callback Pattern

For circular dependencies (e.g., `pedestrians.js` needs `triggerGameOver` from `main.js`), modules export a `setCallbacks()` function. `main.js` wires these during init.

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

- **Module syntax errors** cause silent failure — the entire module chain stops loading with no visible error. Check brace balance and import paths carefully.
- **Constants are mirrored in tests.js** — when changing constants in `js/constants.js`, update `tests.js` too.
- **No module exports to tests** — tests re-implement core logic as pure functions rather than importing from the game modules.
- **Gesture coordinates are mirrored** — `wrist.x < 0.5` = user's left side due to webcam mirror.
- **`getUserMedia` requires localhost** — the game must be served via the Node server, not opened as a file.
- **State mutations** — always use `state.xxx = value`, never reassign destructured state variables locally.
