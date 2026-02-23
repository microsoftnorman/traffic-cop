# Traffic Cop 3D - Implementation Plan

## Architecture

Single `index.html` file containing all HTML, CSS, and JavaScript. External dependencies loaded via CDN:
- **Three.js r160** — 3D rendering
- **MediaPipe Hands + Camera Utils** — hand tracking via webcam

## Module Breakdown (all inline in index.html)

### 1. Scene Setup (`initScene`)
- Create Three.js scene, camera (perspective, angled top-down), renderer
- Add directional light + ambient light with shadows
- Build the intersection geometry:
  - Ground plane (green/gray)
  - Four roads (dark gray planes with white lane markings)
  - Sidewalks / curbs
  - Optional low-poly building boxes around perimeter
- Place traffic cop model at center (simple cylinder + sphere humanoid)

### 2. Car System (`CarManager`)
- Car class: colored box geometry with wheels, direction, speed, state (waiting/moving/crashed)
- Spawn logic: cars appear at road entry points (N/S/E/W edges)
- Movement: cars drive toward intersection, stop at stop-line if signaled, proceed through if allowed
- Collision detection: axis-aligned bounding box checks between cars in the intersection
- Car queue: cars line up behind stopped cars

### 3. Gesture Detection (`GestureDetector`)
- Initialize MediaPipe Hands with webcam stream
- On each frame, extract hand landmarks
- Classify gesture:
  - **Point Left**: index finger extended leftward, other fingers curled
  - **Point Right**: index finger extended rightward, other fingers curled
  - **Open Palm / Stop**: all fingers extended, hand facing camera
  - **No gesture / Fist**: default, no clear signal
- Map gesture → traffic signal state:
  - Point Left → East-West traffic GO, North-South STOP
  - Point Right → North-South traffic GO, East-West STOP
  - Open Palm → ALL STOP
- Expose current signal state for car system to read

### 4. Traffic Signal State Machine (`TrafficController`)
- States: ALL_STOP, EAST_WEST_GO, NORTH_SOUTH_GO
- Driven by gesture detector output
- Small delay/debounce to prevent flickering
- Visual indicators on road (green/red markers at stop lines)

### 5. Difficulty Manager (`DifficultyManager`)
- Track elapsed time and cars successfully passed
- Gradually increase:
  - Spawn rate (shorter intervals between car spawns)
  - Car speed
  - Number of simultaneous cars
  - Chance of "impatient" cars that creep forward
- Level/wave thresholds for UI display

### 6. Collision & Game Over (`CollisionSystem`)
- Each frame, check all moving cars for AABB intersection
- If collision detected:
  - Freeze game
  - Play crash animation (cars stop, red flash)
  - Show Game Over overlay with score

### 7. Scoring (`ScoreManager`)
- +10 points per car that safely exits the intersection
- Bonus points for streak (consecutive cars without near-miss)
- Track high score in localStorage

### 8. UI / HUD (`UIManager`)
- HTML overlay elements positioned over the canvas:
  - Score (top-left)
  - Level (top-right)
  - Gesture indicator (bottom-right, next to webcam feed)
  - Webcam video element (bottom-right corner, small)
- Start screen: title, instructions, "Start" button
- Game Over screen: score, high score, "Play Again" button

## Build Order

1. **HTML skeleton + CSS** — canvas, overlays, webcam element
2. **Three.js scene** — intersection, lighting, camera
3. **Car spawning & movement** — basic cars driving through
4. **Traffic signal logic** — manual keyboard controls first (for testing)
5. **Gesture detection** — integrate MediaPipe, replace keyboard controls
6. **Collision detection** — detect crashes, trigger game over
7. **Difficulty progression** — ramp up over time
8. **Scoring & UI** — HUD, start screen, game over screen
9. **Polish** — animations, visual effects, sound (stretch)

## File Structure

```
traffic-cop/
├── game.md              # Requirements document
├── plan.md              # This implementation plan
└── index.html           # The entire game (single file)
```
