---
description: "Use when writing, updating, or reviewing tests for game mechanics. Covers test structure, simulation patterns, and conventions for the traffic cop game."
applyTo: "**/tests*.js"
---
# Testing Conventions

## Structure

- Tests are plain Node.js scripts — no test frameworks (no Jest, Mocha, etc.)
- Use the built-in `test(name, fn)` / `assert(condition, message)` / `assertApprox(actual, expected, tolerance, message)` harness already in `tests.js`
- Exit with code 0 on success, code 1 on failure
- Run with `node tests.js`

## Extracting Game Logic

- Game code lives in ES module files under `js/` (e.g., `js/vehicles.js`, `js/constants.js`)
- Extract the function under test into `tests.js` as a standalone pure function — no DOM, no Three.js, no browser APIs
- Mirror all constants (STOP_LINE_DIST, SPAWN_DIST, etc.) from `js/constants.js` at the top of the test file
- Mock car objects with `makeCar(dirKey, posAlongAxis, opts)` — use plain `{ x, y, z }` for mesh positions, not Three.js objects

## Writing Tests

- One `test()` block per behavior — use descriptive names like "Two cars queue up — second car stops behind first"
- Use `simulate(cars, signalState, frames, dt)` to advance time for physics/movement tests
- Always test all 4 directions (NORTH, SOUTH, EAST, WEST) when verifying positional behavior
- Use `assertApprox` with a tolerance for floating-point position checks
- Test both the steady state AND the transitions (e.g., car stops at red, then resumes on green)

## What to Test

- Stop-line positions: cars stop at the correct coordinate on their approach side
- Queuing: cars behind a stopped car maintain proper spacing and don't overlap
- Signal obedience: cars respect the correct signal state for their axis
- State transitions: waiting → moving on green, moving → through in intersection
- Edge cases: emergency vehicles ignoring signals, through-cars unaffected by signal changes
- No teleporting: max per-frame position change stays reasonable
