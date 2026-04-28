// ============================================================
// js/gestures.js — Gesture detection (MediaPipe Hands) + gesture-driven UI
// ============================================================
import { SIGNAL_STATES, HOLD_DURATION } from './constants.js';
import { state } from './state.js';
import { playWhistle } from './audio.js';

let _startGame = null;
let _resetToStartScreen = null;

export function setCallbacks({ startGame, resetToStartScreen }) {
  _startGame = startGame;
  _resetToStartScreen = resetToStartScreen;
}

export async function initGestureDetection() {
  const webcamContainer = document.getElementById('webcamContainer');
  const gestureLabel = document.getElementById('gestureLabel');
  const keyboardHint = document.getElementById('keyboardHint');

  try {
    const video = document.getElementById('webcam');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });
    video.srcObject = stream;
    await video.play();
    webcamContainer.classList.remove('hidden');

    // Use MediaPipe Hands loaded via script tag
    const hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onGestureResults);
    state.handsRef = hands;
    state.gestureActive = true;

    // Process frames continuously (even on menus for gesture-driven UI)
    async function processFrame() {
      if (video.readyState >= 2) {
        await hands.send({ image: video });
      }
      requestAnimationFrame(processFrame);
    }
    processFrame();

  } catch (err) {
    console.warn('Webcam/MediaPipe not available, using keyboard controls:', err);
    state.gestureActive = false;
    keyboardHint.classList.remove('hidden');
    gestureLabel.textContent = 'No webcam';
  }
}

export function isFist(landmarks) {
  // Check if most fingers are curled (tip below pip in Y = curled)
  // Require at least 3 of 4 fingers curled (thumb excluded — unreliable)
  const curledCount =
    (landmarks[8].y > landmarks[6].y ? 1 : 0) +   // index
    (landmarks[12].y > landmarks[10].y ? 1 : 0) +  // middle
    (landmarks[16].y > landmarks[14].y ? 1 : 0) +  // ring
    (landmarks[20].y > landmarks[18].y ? 1 : 0);   // pinky
  return curledCount >= 3;
}

function onGestureResults(results) {
  const gestureLabel = document.getElementById('gestureLabel');
  const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

  if (numHands === 0) {
    state.currentGesture = 'NONE';
    gestureLabel.textContent = '😴 No hands — ALL GO';
    if (state.appPhase === 'playing') state.pendingSignal = SIGNAL_STATES.ALL_GO;
    updateGestureUI();
    return;
  }

  // Position-based detection: use wrist X position (landmark 0)
  // Screen is mirrored, so left side of video = right side of user
  // We use 0.5 as the center cutoff
  if (numHands >= 2) {
    state.currentGesture = 'BOTH';
    gestureLabel.textContent = '🙌 Both Hands — ALL STOP';
    if (state.appPhase === 'playing') state.pendingSignal = SIGNAL_STATES.ALL_STOP;
  } else {
    // One hand: use its horizontal position to pick EW vs NS
    const wrist = results.multiHandLandmarks[0][0];
    // In mirrored video: wrist.x < 0.5 = hand is on RIGHT side of video = user's LEFT
    if (wrist.x < 0.5) {
      state.currentGesture = 'RIGHT';
      gestureLabel.textContent = '✋ Hand Right → N/S GO';
      if (state.appPhase === 'playing') state.pendingSignal = SIGNAL_STATES.NS_GO;
    } else {
      state.currentGesture = 'LEFT';
      gestureLabel.textContent = '🤚 Hand Left → E/W GO';
      if (state.appPhase === 'playing') state.pendingSignal = SIGNAL_STATES.EW_GO;
    }
  }

  updateGestureUI();
}

export function rotateCop(direction) {
  // Rotation disabled — fixed camera angle
}

// ============================================================
// GESTURE-DRIVEN UI LOGIC
// ============================================================
let lastGestureUITime = 0;
export function updateGestureUI() {
  const now = performance.now() / 1000;
  const dt = lastGestureUITime ? Math.min(now - lastGestureUITime, 0.2) : 0.033;
  lastGestureUITime = now;

  if (state.appPhase === 'start') {
    if (state.currentGesture === 'BOTH') {
      state.gestureHoldTimer = Math.min(state.gestureHoldTimer + dt, HOLD_DURATION);
    } else {
      state.gestureHoldTimer = Math.max(0, state.gestureHoldTimer - dt * 0.5);
    }
    updateRing('startRingFg', state.gestureHoldTimer / HOLD_DURATION);
    if (state.gestureHoldTimer >= HOLD_DURATION) {
      state.gestureHoldTimer = 0;
      startTutorial();
    }
  } else if (state.appPhase === 'tutorial') {
    const expectedGestures = ['LEFT', 'RIGHT', 'BOTH'];
    const expected = expectedGestures[state.tutorialStep];
    const tutDetect = document.getElementById('tutDetectLabel');
    const gestureNames = { NONE: 'No hands', LEFT: '🤚 Hand Left', RIGHT: '✋ Hand Right', BOTH: '🙌 Both Hands' };
    tutDetect.textContent = 'Detected: ' + (gestureNames[state.currentGesture] || state.currentGesture);

    const isMatch = (state.currentGesture === expected);

    if (isMatch) {
      state.gestureHoldTimer = Math.min(state.gestureHoldTimer + dt, HOLD_DURATION);
    } else {
      state.gestureHoldTimer = Math.max(0, state.gestureHoldTimer - dt * 0.5);
    }
    updateRing('tutRingFg', state.gestureHoldTimer / HOLD_DURATION);
    if (state.gestureHoldTimer >= HOLD_DURATION) {
      completeTutorialStep();
    }
  } else if (state.appPhase === 'gameover') {
    if (state.currentGesture === 'BOTH') {
      state.gestureHoldTimer = Math.min(state.gestureHoldTimer + dt, HOLD_DURATION);
    } else {
      state.gestureHoldTimer = Math.max(0, state.gestureHoldTimer - dt * 0.5);
    }
    updateRing('restartRingFg', state.gestureHoldTimer / HOLD_DURATION);
    if (state.gestureHoldTimer >= HOLD_DURATION) {
      state.gestureHoldTimer = 0;
      _resetToStartScreen();
    }
  }
}

function updateRing(id, progress) {
  const el = document.getElementById(id);
  if (!el) return;
  const circumference = 2 * Math.PI * 36; // r=36
  el.style.strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, progress)));
}

export function startTutorial() {
  const startScreen = document.getElementById('startScreen');
  state.appPhase = 'tutorial';
  state.tutorialStep = 0;
  state.gestureHoldTimer = 0;
  startScreen.classList.add('hidden');
  document.getElementById('tutorialScreen').classList.remove('hidden');
  // Mirror webcam into tutorial large view
  const tutVid = document.getElementById('webcamTutorial');
  const mainVid = document.getElementById('webcam');
  if (mainVid.srcObject) tutVid.srcObject = mainVid.srcObject;
  updateTutorialUI();
}

function updateTutorialUI() {
  const steps = [document.getElementById('tutStep1'), document.getElementById('tutStep2'), document.getElementById('tutStep3')];
  const checks = [document.getElementById('tutCheck1'), document.getElementById('tutCheck2'), document.getElementById('tutCheck3')];
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i < state.tutorialStep) { s.classList.add('done'); checks[i].textContent = '✅'; }
    else if (i === state.tutorialStep) { s.classList.add('active'); checks[i].textContent = '⬜'; }
    else { checks[i].textContent = '⬜'; }
  });
  const ring = document.getElementById('tutHoldRing');
  ring.style.display = state.tutorialStep < 4 ? 'block' : 'none';
}

function completeTutorialStep() {
  state.gestureHoldTimer = 0;
  state.tutorialStep++;
  playWhistle();
  if (state.tutorialStep >= 3) {
    // Tutorial complete, start game after brief pause
    setTimeout(() => {
      document.getElementById('tutorialScreen').classList.add('hidden');
      _startGame();
    }, 600);
  }
  updateTutorialUI();
}
