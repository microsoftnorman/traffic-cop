// ============================================================
// js/audio.js — Audio system (Web Audio API - procedural sounds)
// ============================================================

let audioCtx;
const soundBuffers = {};  // name → AudioBuffer (decoded, ready to play)
const MAX_CONCURRENT = 6; // max simultaneous sound effects
let activeSources = 0;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Pre-load all sound files as decoded AudioBuffers
export const SOUND_FILES = {
  whistle:          'sounds/whistle_coach.mp3',
  carHorn1:         'sounds/car_horn_honking.mp3',
  carHorn2:         'sounds/car_horn_takes.mp3',
  carHorn3:         'sounds/car_horn_suzuki.mp3',
  truckHorn1:       'sounds/truck_horn_short.mp3',
  truckHorn2:       'sounds/truck_horn_powerful.mp3',
  truckHorn3:       'sounds/truck_horn_double.mp3',
};

export async function preloadSounds() {
  ensureAudio();
  const entries = Object.entries(SOUND_FILES);
  await Promise.all(entries.map(async ([name, url]) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const arr = await resp.arrayBuffer();
      soundBuffers[name] = await audioCtx.decodeAudioData(arr);
    } catch (e) { /* sound loading is non-critical */ }
  }));
}

// Play a pre-loaded sound with volume & playback-rate variation
export function playSound(name, volume = 0.3, rateMin = 0.95, rateMax = 1.05) {
  if (!audioCtx || !soundBuffers[name]) return;
  if (activeSources >= MAX_CONCURRENT) return; // protect FPS
  const source = audioCtx.createBufferSource();
  source.buffer = soundBuffers[name];
  source.playbackRate.value = rateMin + Math.random() * (rateMax - rateMin);
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  activeSources++;
  source.onended = () => { activeSources--; };
  source.start();
}

// --- Game sound events ---

export const CAR_HORN_KEYS = ['carHorn1', 'carHorn2', 'carHorn3'];
export const TRUCK_HORN_KEYS = ['truckHorn1', 'truckHorn2', 'truckHorn3'];
export const BIG_VEHICLE_NAMES = ['bus', 'semi', 'firetruck', 'pickup', 'icecream'];

export function playWhistle(long) {
  playSound('whistle', long ? 0.04 : 0.025, long ? 0.85 : 1.0, long ? 0.9 : 1.1);
}

export function playHonk(vehicleType) {
  const isBig = BIG_VEHICLE_NAMES.includes(vehicleType);
  const keys = isBig ? TRUCK_HORN_KEYS : CAR_HORN_KEYS;
  const key = keys[Math.floor(Math.random() * keys.length)];
  playSound(key, 0.12 + Math.random() * 0.08, 0.9, 1.1);
}

export function playAngryHonk(vehicleType) {
  const isBig = BIG_VEHICLE_NAMES.includes(vehicleType);
  const keys = isBig ? TRUCK_HORN_KEYS : CAR_HORN_KEYS;
  const key = keys[Math.floor(Math.random() * keys.length)];
  playSound(key, 0.22 + Math.random() * 0.08, 0.75, 0.9); // lower pitch = angrier
}

export function playCrash() {
  ensureAudio();
  const bufferSize = audioCtx.sampleRate * 0.8;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

export function playScore() {
  ensureAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523, audioCtx.currentTime);
  osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.15);
}

// Siren for emergency vehicles — dual-tone wailing oscillator
let sirenOsc1 = null, sirenOsc2 = null, sirenGain = null;
export function startSiren() {
  ensureAudio();
  if (sirenOsc1) return;
  sirenGain = audioCtx.createGain();
  sirenGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
  sirenGain.connect(audioCtx.destination);
  // Primary tone — sine wail
  sirenOsc1 = audioCtx.createOscillator();
  sirenOsc1.type = 'sine';
  sirenOsc1.frequency.setValueAtTime(600, audioCtx.currentTime);
  sirenOsc1.connect(sirenGain);
  sirenOsc1.start();
  // Secondary tone — square, one octave up, quieter for harmonic richness
  sirenOsc2 = audioCtx.createOscillator();
  sirenOsc2.type = 'square';
  sirenOsc2.frequency.setValueAtTime(1200, audioCtx.currentTime);
  const osc2Gain = audioCtx.createGain();
  osc2Gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
  sirenOsc2.connect(osc2Gain);
  osc2Gain.connect(sirenGain);
  sirenOsc2.start();
}
export function updateSiren(t) {
  if (!sirenOsc1) return;
  // Wail sweep: slow sine modulation between ~600–1000 Hz
  const freq = 800 + Math.sin(t * 3.5) * 200;
  sirenOsc1.frequency.setValueAtTime(freq, audioCtx.currentTime);
  sirenOsc2.frequency.setValueAtTime(freq * 2, audioCtx.currentTime);
}
export function stopSiren() {
  if (sirenOsc1) { sirenOsc1.stop(); sirenOsc1.disconnect(); sirenOsc1 = null; }
  if (sirenOsc2) { sirenOsc2.stop(); sirenOsc2.disconnect(); sirenOsc2 = null; }
  if (sirenGain) { sirenGain.disconnect(); sirenGain = null; }
}
