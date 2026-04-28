// ============================================================
// js/controls.js — Cop animation, camera, signal markers, keyboard controls
// ============================================================
import * as THREE from 'three';
import { SIGNAL_STATES, FACING_ANGLES, FACING_NAMES, DIRECTIONS } from './constants.js';
import { state } from './state.js';
import { setWeather } from './weather.js';
import { setNightMode } from './night.js';
import { showWaveAnnouncement } from './difficulty.js';
import { spawnEmergencyVehicle, isCarSignaledToStop } from './vehicles.js';
import { startTutorial, rotateCop } from './gestures.js';

let _startGame = null;
let _resetToStartScreen = null;

export function setCallbacks({ startGame, resetToStartScreen }) {
  _startGame = startGame;
  _resetToStartScreen = resetToStartScreen;
}

// ============================================================
// COP ANIMATION
// ============================================================
export function updateCopAnimation(dt) {
  // Cop body rotation follows facing direction (smooth)
  const targetBodyY = FACING_ANGLES[state.copFacingIndex];
  state.copModel.rotation.y = lerpAngle(state.copModel.rotation.y, targetBodyY, 0.1);

  // Arms based on signal
  if (state.signalState === SIGNAL_STATES.ALL_STOP) {
    // All stop — arms up (blocking)
    state.copLeftArm.rotation.z = THREE.MathUtils.lerp(state.copLeftArm.rotation.z, Math.PI / 4, 0.15);
    state.copRightArm.rotation.z = THREE.MathUtils.lerp(state.copRightArm.rotation.z, -Math.PI / 4, 0.15);
    state.copLeftArm.rotation.x = THREE.MathUtils.lerp(state.copLeftArm.rotation.x, -Math.PI / 3, 0.15);
    state.copRightArm.rotation.x = THREE.MathUtils.lerp(state.copRightArm.rotation.x, -Math.PI / 3, 0.15);
  } else if (state.signalState === SIGNAL_STATES.EW_GO || state.signalState === SIGNAL_STATES.NS_GO) {
    // Directing traffic — arms out to sides
    state.copLeftArm.rotation.z = THREE.MathUtils.lerp(state.copLeftArm.rotation.z, Math.PI / 2, 0.1);
    state.copRightArm.rotation.z = THREE.MathUtils.lerp(state.copRightArm.rotation.z, -Math.PI / 2, 0.1);
    state.copLeftArm.rotation.x = THREE.MathUtils.lerp(state.copLeftArm.rotation.x, -Math.PI / 2, 0.1);
    state.copRightArm.rotation.x = THREE.MathUtils.lerp(state.copRightArm.rotation.x, -Math.PI / 2, 0.1);
  } else {
    // ALL_GO — arms down, relaxed
    state.copLeftArm.rotation.z = THREE.MathUtils.lerp(state.copLeftArm.rotation.z, 0.1, 0.1);
    state.copRightArm.rotation.z = THREE.MathUtils.lerp(state.copRightArm.rotation.z, -0.1, 0.1);
    state.copLeftArm.rotation.x = THREE.MathUtils.lerp(state.copLeftArm.rotation.x, 0, 0.1);
    state.copRightArm.rotation.x = THREE.MathUtils.lerp(state.copRightArm.rotation.x, 0, 0.1);
  }
}

export function updateCamera(dt) {
  // Smoothly orbit camera to match cop facing
  state.currentCameraAngle = lerpAngle(state.currentCameraAngle, state.targetCameraAngle, 0.06);
  const camDist = 35;
  const camHeight = 40;
  state.camera.position.x = Math.sin(state.currentCameraAngle) * camDist;
  state.camera.position.z = Math.cos(state.currentCameraAngle) * camDist;
  state.camera.position.y = camHeight;
  state.camera.lookAt(0, 0, 0);

  // Update turn cooldown
  if (state.turnCooldown > 0) state.turnCooldown -= dt;
}

export function lerpAngle(a, b, t) {
  // Shortest path angle lerp
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// ============================================================
// SIGNAL MARKERS (visual feedback at stop lines)
// ============================================================
let _lastSignalForMarkers = '';
export function updateSignalMarkers(time) {
  const pulse = 0.8 + Math.sin(time * 0.005) * 0.2;
  const changed = state.signalState !== _lastSignalForMarkers;
  if (changed) _lastSignalForMarkers = state.signalState;
  for (const dirKey in state.signalMarkers) {
    const marker = state.signalMarkers[dirKey];
    const isStopped = isCarSignaledToStop({ dirData: DIRECTIONS[dirKey] });
    if (isStopped) {
      if (changed) {
        marker.material.color.setHex(0xff2222);
        marker.material.emissive.setHex(0xff2222);
      }
      marker.material.emissiveIntensity = pulse;
    } else {
      if (changed) {
        marker.material.color.setHex(0x22ff44);
        marker.material.emissive.setHex(0x22ff44);
        marker.material.emissiveIntensity = 0.6;
      }
    }
  }
}

// ============================================================
// KEYBOARD CONTROLS (fallback)
// ============================================================
export function initKeyboardControls() {
  document.addEventListener('keydown', (e) => {
    // In-game controls
    if (state.gameRunning) {
      if (!e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'a': state.pendingSignal = SIGNAL_STATES.EW_GO; break;
          case 'd': state.pendingSignal = SIGNAL_STATES.NS_GO; break;
          case 's': state.pendingSignal = SIGNAL_STATES.ALL_STOP; break;
          case 'w': state.pendingSignal = SIGNAL_STATES.ALL_GO; break;
          case 'q': rotateCop(-1); break;
          case 'e': rotateCop(1); break;
        }
      }

      // Secret controls (Shift + key, not shown in UI)
      if (e.shiftKey) {
        const code = e.code; // use e.code for digits since Shift changes e.key
        switch (code) {
          // Shift+1-9 = jump to wave, Shift+0 = wave 10
          case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
          case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
            state.wave = parseInt(code.slice(-1));
            state.difficultyTimer = (state.wave - 1) * 18;
            state.spawnInterval = Math.max(0.6, 3.5 - (state.wave - 1) * 0.22);
            state.carSpeed = Math.min(18, 6 + (state.wave - 1) * 0.9);
            state.maxCarsPerSpawn = Math.min(4, 1 + Math.floor(state.wave / 3));
            if (state.wave < 3) setWeather('clear', 0);
            else if (state.wave < 6) setWeather('rain', 0.25 + (state.wave - 3) * 0.2);
            else setWeather('snow', Math.min(1.0, 0.35 + (state.wave - 6) * 0.12));
            setNightMode(state.wave >= 5);
            showWaveAnnouncement(state.wave);
            break;
          case 'Digit0':
            state.wave = 10;
            state.difficultyTimer = 9 * 18;
            state.spawnInterval = Math.max(0.6, 3.5 - 9 * 0.22);
            state.carSpeed = Math.min(18, 6 + 9 * 0.9);
            state.maxCarsPerSpawn = Math.min(4, 1 + Math.floor(10 / 3));
            setWeather('snow', Math.min(1.0, 0.35 + 4 * 0.12));
            setNightMode(true);
            showWaveAnnouncement(10);
            break;
        }
        switch (e.key) {
          // Shift+N = toggle night mode
          case 'N':
            setNightMode(!state.isNightMode);
            break;
          // Shift+P = toggle pause
          case 'P':
            state.secretPaused = !state.secretPaused;
            if (!state.secretPaused) { state.clock.getDelta(); } // discard accumulated time
            break;
          // Shift+F = spawn emergency firetruck
          case 'F':
            spawnEmergencyVehicle();
            break;
          // Shift+R = cycle weather (clear → rain → snow → clear)
          case 'R':
            if (state.weatherType === 'clear') setWeather('rain', 0.6);
            else if (state.weatherType === 'rain') setWeather('snow', 0.6);
            else setWeather('clear', 0);
            break;
          // Shift+= (+) = speed up, Shift+- (_) = slow down
          case '+':
            state.secretTimeScale = Math.min(3, state.secretTimeScale + 0.25);
            break;
          case '_':
            state.secretTimeScale = Math.max(0.25, state.secretTimeScale - 0.25);
            break;
          // Shift+Backspace = reset time scale
          case 'Backspace':
            state.secretTimeScale = 1;
            break;
          // Shift+X = clear all cars from the scene
          case 'X':
            state.cars.forEach(c => {
              state.scene.remove(c.mesh);
              c.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                  if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                  else child.material.dispose();
                }
              });
            });
            state.cars = [];
            break;
        }
      }
    }
    // Space for UI navigation
    if (e.key === ' ') {
      e.preventDefault();
      if (state.appPhase === 'start') startTutorial();
      else if (state.appPhase === 'tutorial') {
        // Skip tutorial
        document.getElementById('tutorialScreen').classList.add('hidden');
        _startGame();
      }
      else if (state.appPhase === 'gameover') _resetToStartScreen();
    }
  });
}
