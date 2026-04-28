// ============================================================
// js/state.js — Mutable game state (single object export)
// ============================================================
import { SIGNAL_STATES } from './constants.js';

export const state = {
  // Three.js core
  scene: null,
  camera: null,
  renderer: null,
  clock: null,

  // Game objects
  cars: [],
  ambientPeds: [],
  crashDebris: [],

  // Scores
  score: 0,
  carsCleared: 0,
  wave: 1,
  highScoreValue: 0,

  // Game flow
  gameRunning: false,
  gameOver: false,
  gameOverTimeout: null,
  appPhase: 'start',

  // Signals
  signalState: SIGNAL_STATES.ALL_GO,
  signalDebounceTimer: 0,
  pendingSignal: SIGNAL_STATES.ALL_GO,

  // Spawning
  spawnTimer: 0,
  difficultyTimer: 0,
  spawnInterval: 4.0,
  carSpeed: 6,
  maxCarsPerSpawn: 1,
  impatienceChance: 0,

  // Weather
  weatherType: 'clear',
  weatherParticles: [],
  weatherCanvas: null,
  weatherCtx: null,
  weatherIntensity: 0,

  // Night mode
  isNightMode: false,
  skyDomeMesh: null,
  sunLight: null,
  fillLight: null,
  ambientLight: null,
  hemiLight: null,
  streetLights: [],
  lampGlowMesh: null,
  buildingMeshes: [],

  // Scene objects
  gestureActive: false,
  intersectionGroup: null,
  signalMarkers: {},
  copModel: null,
  copLeftArm: null,
  copRightArm: null,

  // Honking
  honkTimer: 0,
  honkInterval: 2.5,
  nearMissFlashTimer: 0,

  // Gesture-driven UI
  currentGesture: 'NONE',
  gestureHoldTimer: 0,
  gestureHoldTarget: '',
  tutorialStep: 0,
  handsRef: null,

  // Cop facing / camera orbit
  copFacingIndex: 0,
  targetCameraAngle: 0,
  currentCameraAngle: 0,
  turnCooldown: 0,
  lastFistGesture: 'NONE',

  // Secret controls
  secretTimeScale: 1,
  secretPaused: false,

  // Emergency (legacy)
  emergencyActive: false,
  emergencyTimer: 0,
  emergencyInterval: 30,
};

// Initialize highScore from localStorage (safe in browser context)
try { state.highScoreValue = parseInt(localStorage.getItem('trafficCopHighScore') || '0'); } catch(e) { /* Node.js */ }
