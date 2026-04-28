// ============================================================
// js/weather.js — Weather system (rain/snow canvas overlay)
// ============================================================
import { state } from './state.js';

export function initWeather() {
  state.weatherCanvas = document.getElementById('weatherCanvas');
  state.weatherCtx = state.weatherCanvas.getContext('2d');
  resizeWeatherCanvas();
  window.addEventListener('resize', resizeWeatherCanvas);
}

function resizeWeatherCanvas() {
  if (!state.weatherCanvas) return;
  state.weatherCanvas.width = window.innerWidth;
  state.weatherCanvas.height = window.innerHeight;
}

export function setWeather(type, intensity) {
  if (type === state.weatherType && intensity === state.weatherIntensity) return;
  state.weatherType = type;
  state.weatherIntensity = Math.min(1, Math.max(0, intensity));
  state.weatherParticles = [];
}

export function updateWeather(dt) {
  if (!state.weatherCtx || state.weatherType === 'clear') {
    if (state.weatherCtx) state.weatherCtx.clearRect(0, 0, state.weatherCanvas.width, state.weatherCanvas.height);
    return;
  }

  const W = state.weatherCanvas.width;
  const H = state.weatherCanvas.height;
  state.weatherCtx.clearRect(0, 0, W, H);

  // Spawn new particles
  const maxParticles = state.weatherType === 'rain' ? Math.floor(400 * state.weatherIntensity) : Math.floor(200 * state.weatherIntensity);
  const spawnRate = state.weatherType === 'rain' ? Math.ceil(8 * state.weatherIntensity) : Math.ceil(3 * state.weatherIntensity);

  for (let i = 0; i < spawnRate && state.weatherParticles.length < maxParticles; i++) {
    if (state.weatherType === 'rain') {
      const windOffset = 80 * state.weatherIntensity;
      state.weatherParticles.push({
        x: Math.random() * (W + windOffset) - windOffset,
        y: -10 - Math.random() * 40,
        vx: 30 + Math.random() * 60 * state.weatherIntensity,  // wind pushes right
        vy: 600 + Math.random() * 400 * state.weatherIntensity, // fast falling
        len: 12 + Math.random() * 18 * state.weatherIntensity,  // streak length
        alpha: 0.15 + Math.random() * 0.25,
      });
    } else {
      // Snow
      state.weatherParticles.push({
        x: Math.random() * W,
        y: -5 - Math.random() * 20,
        vx: -15 + Math.random() * 30,       // gentle drift
        vy: 30 + Math.random() * 50 * state.weatherIntensity, // slow falling
        radius: 1.5 + Math.random() * 3,
        alpha: 0.4 + Math.random() * 0.4,
        wobble: Math.random() * Math.PI * 2, // phase for horizontal wobble
        wobbleSpeed: 1.5 + Math.random() * 2,
        wobbleAmp: 15 + Math.random() * 25,
      });
    }
  }

  // Update and draw
  if (state.weatherType === 'rain') {
    state.weatherCtx.strokeStyle = 'rgba(180, 210, 240, 0.35)';
    state.weatherCtx.lineWidth = 1.5;
    state.weatherCtx.beginPath();
    let writeIdx = 0;
    for (let i = 0; i < state.weatherParticles.length; i++) {
      const p = state.weatherParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Gravity acceleration
      p.vy += 200 * dt;

      if (p.y > H + 10 || p.x > W + 50) {
        continue;
      }

      // Swap-and-pop: keep particle by writing in place
      state.weatherParticles[writeIdx++] = p;

      // Draw rain streak
      const angle = Math.atan2(p.vy, p.vx);
      const endX = p.x - Math.cos(angle) * p.len;
      const endY = p.y - Math.sin(angle) * p.len;
      state.weatherCtx.moveTo(p.x, p.y);
      state.weatherCtx.lineTo(endX, endY);
    }
    state.weatherParticles.length = writeIdx;
    state.weatherCtx.stroke();

    // Splash effects at bottom
    if (state.weatherIntensity > 0.3) {
      state.weatherCtx.fillStyle = 'rgba(180, 210, 240, 0.08)';
      const splashCount = Math.floor(5 * state.weatherIntensity);
      for (let i = 0; i < splashCount; i++) {
        const sx = Math.random() * W;
        const sy = H - 5 - Math.random() * 15;
        state.weatherCtx.beginPath();
        state.weatherCtx.arc(sx, sy, 2 + Math.random() * 3, 0, Math.PI, true);
        state.weatherCtx.fill();
      }
    }

    // Darken overlay for rain atmosphere
    state.weatherCtx.fillStyle = `rgba(20, 30, 50, ${0.08 * state.weatherIntensity})`;
    state.weatherCtx.fillRect(0, 0, W, H);

  } else {
    // Snow — batch by alpha to reduce fillStyle changes
    let writeIdx = 0;
    for (let i = 0; i < state.weatherParticles.length; i++) {
      const p = state.weatherParticles[i];
      p.wobble += p.wobbleSpeed * dt;
      p.x += (p.vx + Math.sin(p.wobble) * p.wobbleAmp) * dt;
      p.y += p.vy * dt;

      if (p.y > H + 10 || p.x < -20 || p.x > W + 20) continue;
      state.weatherParticles[writeIdx++] = p;
    }
    state.weatherParticles.length = writeIdx;

    // Draw all snowflakes as filled rects (much faster than arc per particle)
    state.weatherCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < state.weatherParticles.length; i++) {
      const p = state.weatherParticles[i];
      const d = p.radius;
      state.weatherCtx.fillRect(p.x - d, p.y - d, d * 2, d * 2);
    }

    // Light fog overlay for snow atmosphere
    state.weatherCtx.fillStyle = `rgba(200, 210, 220, ${0.05 * state.weatherIntensity})`;
    state.weatherCtx.fillRect(0, 0, W, H);
  }
}
