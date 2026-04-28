// ============================================================
// js/difficulty.js — Wave progression and difficulty scaling
// ============================================================
import { ROAD_WIDTH } from './constants.js';
import { state } from './state.js';
import { setWeather } from './weather.js';
import { setNightMode } from './night.js';

export const WAVE_DATA = [
  { name: 'Sunday Morning',        tip: 'Easy peasy. Just a few cars.',                       emoji: '☀️' },
  { name: 'School Run',            tip: 'A few more cars... you got this!',                   emoji: '🚸' },
  { name: 'Coffee Rush',           tip: 'Everyone needs their latte. Rain incoming!',         emoji: '☕' },
  { name: 'Lunch Hour Chaos',      tip: 'They\'re hangry and in a hurry.',                    emoji: '🍔' },
  { name: 'Road Rage Begins',      tip: 'Night falls. Headlights on!',                      emoji: '🌙' },
  { name: 'Snowpocalypse',         tip: 'Snow at night! Cars are slippery. Good luck!',      emoji: '❄️' },
  { name: 'Rush Hour From Hell',   tip: 'Darkness + chaos. Everything is fine.',              emoji: '🔥' },
  { name: 'Grand Theft Intersection', tip: 'Maximum night chaos. You asked for this.',        emoji: '💀' },
  { name: 'Are You Still Alive?!', tip: 'Streetlights are your only friend now.',             emoji: '🏆' },
  { name: 'Traffic God Mode',      tip: 'No mortal should see this wave.',                     emoji: '👑' },
];

let waveAnnounceTimeout = null;

export function getWaveData(w) {
  if (w <= WAVE_DATA.length) return WAVE_DATA[w - 1];
  // Beyond defined waves: cycle with escalating titles
  const extra = w - WAVE_DATA.length;
  return {
    name: 'Wave ' + w + ': WHY',
    tip: extra % 2 === 0 ? 'We ran out of wave names. You\'re a legend.' : 'Seriously, go outside.',
    emoji: ['🤯', '💀', '👽', '🦄', '🫠'][extra % 5]
  };
}

export function showWaveAnnouncement(w) {
  const data = getWaveData(w);
  const el = document.getElementById('waveAnnounce');
  el.querySelector('.wa-wave').textContent = data.emoji + ' Wave ' + w + ' ' + data.emoji;
  el.querySelector('.wa-name').textContent = '"' + data.name + '"';
  el.querySelector('.wa-tip').textContent = data.tip;

  el.classList.remove('show', 'hide');
  void el.offsetWidth; // force reflow
  el.classList.add('show');

  if (waveAnnounceTimeout) clearTimeout(waveAnnounceTimeout);
  waveAnnounceTimeout = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hide');
  }, 2200);
}

// Sidewalk network for ambient pedestrians
// Corners where sidewalks meet at the intersection
export const SWC = ROAD_WIDTH / 2 + 1.75; // 6.75 — center of sidewalk strip
export const SW_EDGE = 65;
export const SW_CORNERS = [
  { x: SWC, z: SWC },     // 0: NE
  { x: -SWC, z: SWC },    // 1: NW
  { x: SWC, z: -SWC },    // 2: SE
  { x: -SWC, z: -SWC }    // 3: SW
];
// Edge entry/exit points and which corner they connect to
export const SW_EDGES = [
  { x: SWC, z: SW_EDGE, corner: 0 },
  { x: -SWC, z: SW_EDGE, corner: 1 },
  { x: SWC, z: -SW_EDGE, corner: 2 },
  { x: -SWC, z: -SW_EDGE, corner: 3 },
  { x: SW_EDGE, z: SWC, corner: 0 },
  { x: SW_EDGE, z: -SWC, corner: 2 },
  { x: -SW_EDGE, z: SWC, corner: 1 },
  { x: -SW_EDGE, z: -SWC, corner: 3 }
];
// Adjacent corners (connected by crosswalks)
export const SW_ADJ = [[1, 2], [0, 3], [3, 0], [2, 1]];
// Which edge indices connect to each corner
export const CORNER_EDGES = [[0, 4], [1, 6], [2, 5], [3, 7]];

export function generateAmbientPedRoute() {
  const startIdx = Math.floor(Math.random() * SW_EDGES.length);
  const start = SW_EDGES[startIdx];
  const path = [{ x: start.x, z: start.z }];

  let curCorner = start.corner;
  path.push({ x: SW_CORNERS[curCorner].x, z: SW_CORNERS[curCorner].z });

  // 0–2 street crossings
  const maxCross = Math.random() < 0.4 ? 0 : (Math.random() < 0.6 ? 1 : 2);
  for (let i = 0; i < maxCross; i++) {
    const adj = SW_ADJ[curCorner];
    curCorner = adj[Math.floor(Math.random() * adj.length)];
    path.push({ x: SW_CORNERS[curCorner].x, z: SW_CORNERS[curCorner].z });
  }

  // Exit at an edge connected to current corner (avoid going back to start)
  const exits = CORNER_EDGES[curCorner];
  let exitIdx = exits[Math.floor(Math.random() * exits.length)];
  if (exitIdx === startIdx && exits.length > 1) {
    exitIdx = exits[0] === exitIdx ? exits[1] : exits[0];
  }
  const exit = SW_EDGES[exitIdx];
  path.push({ x: exit.x, z: exit.z });

  return path;
}

export function updateDifficulty(dt) {
  state.difficultyTimer += dt;

  // Waves every 18 seconds — relaxed ramp
  const newWave = Math.floor(state.difficultyTimer / 18) + 1;
  if (newWave !== state.wave) {
    state.wave = newWave;

    // Gentle difficulty curve — starts easy, ramps slowly
    state.spawnInterval = Math.max(0.6, 3.5 - (state.wave - 1) * 0.22);
    state.carSpeed = Math.min(18, 6 + (state.wave - 1) * 0.9);
    state.maxCarsPerSpawn = Math.min(4, 1 + Math.floor(state.wave / 3));

    // Weather progression
    if (state.wave < 3) {
      setWeather('clear', 0);
    } else if (state.wave < 6) {
      const rainIntensity = 0.25 + (state.wave - 3) * 0.2;
      setWeather('rain', rainIntensity);
    } else {
      const snowIntensity = Math.min(1.0, 0.35 + (state.wave - 6) * 0.12);
      setWeather('snow', snowIntensity);
    }

    // Night mode at wave 5+
    setNightMode(state.wave >= 5);

    showWaveAnnouncement(state.wave);
  }
}
