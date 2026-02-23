# Traffic Cop 3D - Game Requirements

## Overview
A browser-based 3D traffic cop game where the player stands at a four-way intersection and directs traffic using real-time hand gestures detected via webcam. The game progressively increases in difficulty as traffic volume ramps up. An accident means game over.

## Core Requirements

### Technology
- **Pure HTML/CSS/JavaScript** — no build tools or server required
- **Three.js** for 3D rendering in the browser (loaded via CDN)
- **MediaPipe Hands** (via CDN) for real-time webcam hand-gesture recognition
- Single `index.html` file that can be opened directly or served locally

### Gameplay
- Player is a **traffic cop** standing at the center of a **four-way intersection**
- The camera is positioned behind/above the cop looking down at the intersection
- **Cars approach from all four directions** (North, South, East, West)
- Player uses **hand gestures** to signal which lanes may proceed:
  - **Point Left** → allow East-West traffic to flow
  - **Point Right** → allow North-South traffic to flow
  - **Open Palm (Stop)** → all traffic stops
  - **Both hands out** → all traffic stops (emergency stop)
- Cars obey (or attempt to obey) the player's signals
- If two cars from conflicting directions collide → **ACCIDENT → Game Over**

### Difficulty Progression
- Game starts with **light traffic** (few cars, slow speed)
- Over time:
  - More cars spawn per wave
  - Cars arrive more frequently
  - Cars move faster
  - Some cars may be "impatient" and creep forward even on stop
- **Score** increases based on how many cars are safely directed through
- **Level/wave indicator** shows current difficulty

### 3D Scene
- A four-way intersection with roads, lane markings, and sidewalks
- Simple low-poly 3D car models (colored boxes/shapes)
- A traffic cop character model at the center (simple humanoid)
- Basic environment: ground plane, sky, optional buildings
- Day-time lighting with shadows

### Hand Gesture Detection
- Webcam feed displayed as a small overlay (picture-in-picture style)
- MediaPipe Hands used for real-time hand landmark detection
- Gesture classification based on hand landmark positions:
  - Detect pointing direction (index finger extended, others curled)
  - Detect open palm (all fingers extended)
  - Detect fist (all fingers curled)
- Visual feedback showing detected gesture on screen

### UI / HUD
- **Score** display (top of screen)
- **Level/Wave** indicator
- **Current gesture** indicator (what the system thinks you're doing)
- **Webcam feed** small overlay in corner
- **Start screen** with instructions
- **Game Over screen** with final score and restart button
- **Countdown timer** or stress meter (optional)

### Audio (Optional/Stretch)
- Car engine sounds
- Whistle blow on gesture change
- Crash sound on accident
- Background city ambiance

## Non-Functional Requirements
- Must run in modern browsers (Chrome, Edge, Firefox)
- Smooth 60fps target
- Webcam permission prompt handled gracefully
- Works on desktop with a webcam
- No server-side code required — fully client-side

## Stretch Goals
- Night mode with headlights
- Pedestrians crossing
- Emergency vehicles (must always be given right-of-way)
- Multiplayer score leaderboard (localStorage)
- Mobile support with touch controls as fallback
