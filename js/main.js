// ============================================================
// js/main.js — Hub entry point: game flow, main loop, init
// ============================================================
import * as THREE from 'three';
import { SIGNAL_STATES, FACING_NAMES, DIRECTIONS, SPAWN_DIST, SIDEWALK_CENTER, CAR_LENGTH } from './constants.js';
import { state } from './state.js';
window.__gameState = state; // expose for e2e tests
import { preloadSounds, playWhistle, playHonk, playAngryHonk, startSiren, updateSiren, stopSiren } from './audio.js';
import { initWeather, setWeather, updateWeather } from './weather.js';
import { setNightMode } from './night.js';
import { getWaveData, updateDifficulty } from './difficulty.js';
import { initScene } from './scene.js';
import { spawnCars, updateCars, updateBrakeLights, updateBlinkers, createVehicle, EMERGENCY_TYPES } from './vehicles.js';
import { updateAmbientPeds, setCallbacks as setPedestrianCallbacks, buildPersonGeos, SHIRT_COLORS, PANTS_COLORS, HAIR_COLORS } from './pedestrians.js';
import { mergeGeometries } from './scene.js';
import { checkCollisions, showCrashEffect, setCallbacks as setCollisionCallbacks } from './collisions.js';
import { initGestureDetection, setCallbacks as setGestureCallbacks } from './gestures.js';
import { updateCopAnimation, updateCamera, updateSignalMarkers, initKeyboardControls, setCallbacks as setControlCallbacks } from './controls.js';

// DOM elements
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const signalIndicatorEl = document.getElementById('signalIndicator');
const carsClearedEl = document.getElementById('carsCleared');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const highScoreEl = document.getElementById('highScore');
const crashFlash = document.getElementById('crashFlash');

// ============================================================
// CRASH CUTSCENE — rescue flow: arrive → extract people → ambulance departs → resume
// ============================================================
let cutsceneVehicles = [];
let cutsceneAnimId = null;
let cutscenePeople = [];

function createSimplePerson(x, z) {
  const group = new THREE.Group();
  const S = 1.8;
  const skinColor = [0xe8b88a, 0xc68642, 0x8d5524, 0xf1c27d][Math.floor(Math.random() * 4)];
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)], roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)], roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 0.8 });
  const skinGeos = [], shirtGeos = [], pantsGeos = [], shoeGeos = [], hairGeos = [];
  buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
  if (shirtGeos.length) group.add(new THREE.Mesh(mergeGeometries(shirtGeos), shirtMat));
  if (pantsGeos.length) group.add(new THREE.Mesh(mergeGeometries(pantsGeos), pantsMat));
  if (skinGeos.length) group.add(new THREE.Mesh(mergeGeometries(skinGeos), skinMat));
  if (hairGeos.length) group.add(new THREE.Mesh(mergeGeometries(hairGeos), hairMat));
  group.position.set(x, 0.2, z);
  group.scale.setScalar(0.5);
  state.scene.add(group);
  return group;
}

function disposeMesh(obj) {
  state.scene.remove(obj);
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
}

function driveWithAvoidance(car, allCars, dt, elapsed) {
  const dir = car.dirData;
  const mainAxis = dir.axis;
  const perpAxis = dir.perpAxis;
  const myX = car.mesh.position.x;
  const myZ = car.mesh.position.z;
  const myMain = car.mesh.position[mainAxis];
  const myPerp = car.mesh.position[perpAxis];
  const lookAhead = 15;
  const avoidWidth = 3.0;
  const minSep = 2.5;

  // --- Push-apart only on the PERPENDICULAR axis (no forward/back jitter) ---
  for (const other of allCars) {
    if (other === car || other.isPedestrian) continue;
    const dx = other.mesh.position.x - myX;
    const dz = other.mesh.position.z - myZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minGap = ((car.vehicleLength || CAR_LENGTH) + (other.vehicleLength || CAR_LENGTH)) / 2 + 0.5;
    if (dist < minGap && dist > 0.01) {
      // Push only along the perp axis to avoid interfering with forward motion
      const perpDelta = car.mesh.position[perpAxis] - other.mesh.position[perpAxis];
      const pushDir = perpDelta >= 0 ? 1 : -1;
      car.mesh.position[perpAxis] += pushDir * 3 * dt;
    }
  }

  // --- Scan for obstacles ahead ---
  let hasObstacleAhead = false;
  for (const other of allCars) {
    if (other === car || other.isPedestrian) continue;
    if (other.state === 'cutscene' && !other.cutsceneStopped) {
      const dx = other.mesh.position.x - myX;
      const dz = other.mesh.position.z - myZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minSep * 3) {
        const fwdDist = (other.mesh.position[mainAxis] - myMain) * (-dir.sign);
        if (fwdDist > -1 && fwdDist < lookAhead && Math.abs(other.mesh.position[perpAxis] - myPerp) < avoidWidth) {
          hasObstacleAhead = true;
          break;
        }
      }
      continue;
    }
    const otherMain = other.mesh.position[mainAxis];
    const fwdDist = (otherMain - myMain) * (-dir.sign);
    if (fwdDist < -1 || fwdDist > lookAhead) continue;
    if (Math.abs(other.mesh.position[perpAxis] - myPerp) < avoidWidth) {
      hasObstacleAhead = true;
      break;
    }
  }

  // Cross-traffic check
  if (!hasObstacleAhead) {
    for (const other of allCars) {
      if (other === car || other.isPedestrian) continue;
      const dx = other.mesh.position.x - myX;
      const dz = other.mesh.position.z - myZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minSep * 4 && dist > 0.5) {
        const perpDist = Math.abs(other.mesh.position[perpAxis] - myPerp);
        const mainDist = Math.abs(other.mesh.position[mainAxis] - myMain);
        if (perpDist < avoidWidth && mainDist < avoidWidth) {
          hasObstacleAhead = true;
          break;
        }
      }
    }
  }

  // --- Dodge decision with hysteresis (commit to dodge for at least 0.5s) ---
  if (!car._dodgeCooldown) car._dodgeCooldown = 0;
  car._dodgeCooldown = Math.max(0, car._dodgeCooldown - dt);

  if (hasObstacleAhead && car._dodgeCooldown <= 0) {
    const oppositePerp = -dir.laneOffset;
    let oppClear = true;
    for (const other of allCars) {
      if (other === car || other.isPedestrian) continue;
      const otherMain = other.mesh.position[mainAxis];
      const fwdDist = (otherMain - myMain) * (-dir.sign);
      if (fwdDist < -1 || fwdDist > lookAhead) continue;
      if (Math.abs(other.mesh.position[perpAxis] - oppositePerp) < avoidWidth) {
        oppClear = false;
        break;
      }
    }
    const newTarget = oppClear ? oppositePerp : Math.sign(dir.laneOffset) * SIDEWALK_CENTER;
    if (!car.dodging || Math.abs(newTarget - car.dodgeTarget) > 0.5) {
      car.dodgeTarget = newTarget;
      car.dodging = true;
      car._dodgeCooldown = 0.5; // commit to this dodge for 0.5s
    }
  } else if (car.dodging && !hasObstacleAhead && car._dodgeCooldown <= 0) {
    car.dodgeTarget = dir.laneOffset;
    if (Math.abs(myPerp - dir.laneOffset) < 0.3) car.dodging = false;
  }

  // --- Smooth steering with lerp (no sudden jumps) ---
  const steerSpeed = 4;
  const perpDiff = car.dodgeTarget - myPerp;
  let steerAmount = 0;
  if (Math.abs(perpDiff) > 0.05) {
    steerAmount = perpDiff * Math.min(1, steerSpeed * dt);
    car.mesh.position[perpAxis] += steerAmount;
  }

  // --- Smooth speed modulation ---
  let speedMod = 1;
  for (const other of allCars) {
    if (other === car || other.isPedestrian) continue;
    const dx = other.mesh.position.x - myX;
    const dz = other.mesh.position.z - myZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minSep * 2) {
      speedMod = Math.min(speedMod, Math.max(0.2, dist / (minSep * 2)));
    }
  }

  const fwdAmount = car.speed * speedMod * dt;
  car.mesh.position[mainAxis] -= dir.sign * fwdAmount;
  car.distanceFromCenter = Math.abs(car.mesh.position[mainAxis]);

  // --- Smooth rotation via lerp (no snapping) ---
  if (fwdAmount > 0.001) {
    const vx = mainAxis === 'z' ? steerAmount : -dir.sign * fwdAmount;
    const vz = mainAxis === 'z' ? -dir.sign * fwdAmount : steerAmount;
    const targetRot = Math.atan2(vx, vz);
    // Lerp rotation for smooth turning
    let delta = targetRot - car.mesh.rotation.y;
    // Wrap to [-PI, PI]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    car.mesh.rotation.y += delta * Math.min(1, 5 * dt);
  }
}

function playCutscene(crashX, crashZ, crashedCars, onComplete) {
  const dirKeys = Object.keys(DIRECTIONS);
  const shuffled = dirKeys.sort(() => Math.random() - 0.5);
  const types = [
    EMERGENCY_TYPES.find(t => t.name === 'firetruck'),
    EMERGENCY_TYPES.find(t => t.name === 'ambulance'),
    EMERGENCY_TYPES.find(t => t.name === 'police'),
  ];

  cutsceneVehicles = [];
  let ambulanceCar = null;

  for (let i = 0; i < 3; i++) {
    const dirKey = shuffled[i];
    const dir = DIRECTIONS[dirKey];
    const car = createVehicle(dirKey, types[i]);
    const startDist = 35;
    if (dir.axis === 'z') {
      car.mesh.position.z = dir.sign * startDist;
    } else {
      car.mesh.position.x = dir.sign * startDist;
    }
    car.distanceFromCenter = startDist;
    car.speed = 12;
    car.state = 'cutscene';
    car.cutsceneDelay = i * 0.6;
    car.cutsceneTime = 0;
    car.cutsceneStopped = false;
    car.cutsceneStopDist = 6 + i * 3;
    car.dodgeTarget = dir.laneOffset;
    car.dodging = false;
    state.cars.push(car);
    cutsceneVehicles.push(car);
    if (types[i].name === 'ambulance') ambulanceCar = car;
  }

  startSiren();
  cutscenePeople = [];
  let towTrucks = [];
  let phase = 'arrive'; // arrive → rescue → ambulance_depart → tow_arrive → tow_depart
  let phaseTimer = 0;
  let elapsed = 0;
  let lastTime = performance.now();
  let peopleSpawned = false;
  let allPeopleLoaded = false;

  function cutsceneLoop() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;

    // Flash emergency lights on all cutscene vehicles (emergency + tow trucks)
    for (const car of cutsceneVehicles) {
      const lights = car.mesh.userData.emergencyLights;
      if (lights) {
        const flash = Math.sin(elapsed * 12) > 0;
        lights[0].mat.emissiveIntensity = flash ? 1.5 : 0.1;
        lights[1].mat.emissiveIntensity = flash ? 0.1 : 1.5;
      }
    }

    // --- Update yielding cars: pull over to the shoulder ---
    for (const car of state.cars) {
      if (car.state !== 'yielding') continue;
      const yDir = car.dirData;
      const yPerpAxis = yDir.perpAxis;
      const currentPerp = car.mesh.position[yPerpAxis];
      const target = car._yieldTarget;
      const diff = target - currentPerp;
      if (Math.abs(diff) > 0.15) {
        const steer = diff * Math.min(1, 3 * dt);
        car.mesh.position[yPerpAxis] += steer;
        // Slow forward creep while pulling over
        car.mesh.position[yDir.axis] -= yDir.sign * 1.0 * dt;
        // Smooth rotation toward movement direction
        const vx = yDir.axis === 'z' ? steer : -yDir.sign * 1.0 * dt;
        const vz = yDir.axis === 'z' ? -yDir.sign * 1.0 * dt : steer;
        const tRot = Math.atan2(vx, vz);
        let rDelta = tRot - car.mesh.rotation.y;
        while (rDelta > Math.PI) rDelta -= 2 * Math.PI;
        while (rDelta < -Math.PI) rDelta += 2 * Math.PI;
        car.mesh.rotation.y += rDelta * Math.min(1, 5 * dt);
      } else {
        car.mesh.position[yPerpAxis] = target;
        car.mesh.rotation.y = yDir.angle;
        car.speed = 0;
      }
    }

    // === PHASE 1: ARRIVE — emergency vehicles drive to crash site ===
    if (phase === 'arrive') {
      let allStopped = true;
      for (const car of cutsceneVehicles) {
        car.cutsceneTime += dt;
        if (car.cutsceneTime < car.cutsceneDelay) { allStopped = false; continue; }
        if (car.cutsceneStopped) continue;

        const dir = car.dirData;
        const decel = car.distanceFromCenter < car.cutsceneStopDist + 5 ? 0.92 : 1;
        car.speed *= decel;
        car.speed = Math.max(car.speed, 1);
        // Slow down / stop if any car (including crashed) is in the path
        for (const other of state.cars) {
          if (other === car || other.isPedestrian || other.state === 'cutscene') continue;
          const fwd = (other.mesh.position[dir.axis] - car.mesh.position[dir.axis]) * (-dir.sign);
          if (fwd > 0 && fwd < 8 && Math.abs(other.mesh.position[dir.perpAxis] - car.mesh.position[dir.perpAxis]) < 2.5) {
            if (other.state === 'crashed' && fwd < CAR_LENGTH + 1) {
              car.cutsceneStopped = true;
              car.speed = 0;
              car.mesh.rotation.y = dir.angle;
            } else {
              car.speed = Math.max(0.5, car.speed * 0.85);
            }
            break;
          }
        }
        car.mesh.position[dir.axis] -= dir.sign * car.speed * dt;
        car.distanceFromCenter = Math.abs(car.mesh.position[dir.axis]);

        if (car.distanceFromCenter <= car.cutsceneStopDist) {
          car.cutsceneStopped = true;
          car.speed = 0;
          car.mesh.rotation.y = dir.angle;
        } else {
          allStopped = false;
        }
      }
      if ((allStopped && elapsed > 2.0) || elapsed > 5) {
        phase = 'rescue';
        phaseTimer = 0;
      }
    }

    // === PHASE 2: RESCUE — people exit crashed cars and walk to ambulance ===
    if (phase === 'rescue') {
      phaseTimer += dt;

      if (!peopleSpawned) {
        peopleSpawned = true;
        for (const car of crashedCars) {
          const px = car.mesh.position.x + (Math.random() - 0.5) * 2;
          const pz = car.mesh.position.z + (Math.random() - 0.5) * 2;
          const person = createSimplePerson(px, pz);
          cutscenePeople.push({
            mesh: person,
            targetX: ambulanceCar.mesh.position.x,
            targetZ: ambulanceCar.mesh.position.z,
            loaded: false,
            bob: Math.random() * Math.PI * 2
          });
        }
      }

      allPeopleLoaded = true;
      for (const p of cutscenePeople) {
        if (p.loaded) continue;
        const dx = p.targetX - p.mesh.position.x;
        const dz = p.targetZ - p.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.5) {
          p.loaded = true;
          disposeMesh(p.mesh);
          continue;
        }
        allPeopleLoaded = false;
        const walkSpeed = 3;
        p.mesh.position.x += (dx / dist) * walkSpeed * dt;
        p.mesh.position.z += (dz / dist) * walkSpeed * dt;
        p.bob += dt * 8;
        p.mesh.position.y = 0.2 + Math.abs(Math.sin(p.bob)) * 0.08;
        p.mesh.rotation.y = Math.atan2(dx, dz);
      }

      if ((allPeopleLoaded && phaseTimer > 1.5) || phaseTimer > 5) {
        for (const p of cutscenePeople) {
          if (!p.loaded) disposeMesh(p.mesh);
        }
        cutscenePeople = [];
        phase = 'ambulance_depart';
        phaseTimer = 0;
        // Ambulance drives away with rescued people
        if (ambulanceCar) {
          ambulanceCar.cutsceneStopped = false;
          ambulanceCar.speed = 10;
          ambulanceCar.dodgeTarget = ambulanceCar.dirData.laneOffset;
          ambulanceCar.dodging = false;
          ambulanceCar.dirData = { ...ambulanceCar.dirData, sign: -ambulanceCar.dirData.sign };
        }
        // Other emergency vehicles (firetruck, police) also depart
        for (const car of cutsceneVehicles) {
          if (car === ambulanceCar) continue;
          car.cutsceneStopped = false;
          car.speed = 8;
          car.dodgeTarget = car.dirData.laneOffset;
          car.dodging = false;
          car.dirData = { ...car.dirData, sign: -car.dirData.sign };
        }
      }
    }

    // === PHASE 3: AMBULANCE DEPART — all emergency vehicles drive away ===
    if (phase === 'ambulance_depart') {
      phaseTimer += dt;

      let allGone = true;
      for (const car of cutsceneVehicles) {
        if (car.cutsceneStopped) continue;
        car.speed = Math.min(car.speed + 8 * dt, 18);
        const dir = car.dirData;
        // Slow down / stop if any car (including crashed) is in the path
        for (const other of state.cars) {
          if (other === car || other.isPedestrian || other.state === 'cutscene') continue;
          const fwd = (other.mesh.position[dir.axis] - car.mesh.position[dir.axis]) * (-dir.sign);
          if (fwd > 0 && fwd < 8 && Math.abs(other.mesh.position[dir.perpAxis] - car.mesh.position[dir.perpAxis]) < 2.5) {
            if (other.state === 'crashed' && fwd < CAR_LENGTH + 1) {
              car.speed = 0;
            } else {
              car.speed = Math.max(0.5, car.speed * 0.85);
            }
            break;
          }
        }
        car.mesh.position[dir.axis] -= dir.sign * car.speed * dt;
        car.distanceFromCenter = Math.abs(car.mesh.position[dir.axis]);
        if (car.distanceFromCenter > 40) {
          car.cutsceneStopped = true;
        } else {
          allGone = false;
        }
      }

      if ((allGone && phaseTimer > 0.5) || phaseTimer > 6) {
        // Remove emergency vehicles from scene
        for (const car of cutsceneVehicles) {
          disposeMesh(car.mesh);
          const idx = state.cars.indexOf(car);
          if (idx >= 0) state.cars.splice(idx, 1);
        }
        cutsceneVehicles = [];
        stopSiren();

        phase = 'tow_arrive';
        phaseTimer = 0;

        // Spawn tow trucks — one per crashed car
        const towType = EMERGENCY_TYPES.find(t => t.name === 'towtruck');
        const availDirs = dirKeys.sort(() => Math.random() - 0.5);
        towTrucks = [];
        for (let i = 0; i < crashedCars.length; i++) {
          const dirKey = availDirs[i % availDirs.length];
          const dir = DIRECTIONS[dirKey];
          const tow = createVehicle(dirKey, towType);
          const startDist = 38;
          if (dir.axis === 'z') {
            tow.mesh.position.z = dir.sign * startDist;
          } else {
            tow.mesh.position.x = dir.sign * startDist;
          }
          tow.distanceFromCenter = startDist;
          tow.speed = 10;
          tow.state = 'cutscene';
          tow.cutsceneDelay = i * 0.8;
          tow.cutsceneTime = 0;
          tow.cutsceneStopped = false;
          tow.cutsceneStopDist = 4 + i * 2;
          tow.dodgeTarget = dir.laneOffset;
          tow.dodging = false;
          tow.towTarget = crashedCars[i]; // the crashed car this tow truck will pull
          tow.towAttached = false;
          state.cars.push(tow);
          cutsceneVehicles.push(tow);
          towTrucks.push(tow);
        }
      }
    }

    // === PHASE 4: TOW ARRIVE — tow trucks approach crashed cars ===
    if (phase === 'tow_arrive') {
      phaseTimer += dt;

      let allStopped = true;
      for (const tow of towTrucks) {
        tow.cutsceneTime += dt;
        if (tow.cutsceneTime < tow.cutsceneDelay) { allStopped = false; continue; }
        if (tow.cutsceneStopped) continue;

        const dir = tow.dirData;
        const decel = tow.distanceFromCenter < tow.cutsceneStopDist + 5 ? 0.92 : 1;
        tow.speed *= decel;
        tow.speed = Math.max(tow.speed, 1);
        // Slow down / stop if any car (including crashed) is in the path
        for (const other of state.cars) {
          if (other === tow || other.isPedestrian || other.state === 'cutscene') continue;
          const fwd = (other.mesh.position[dir.axis] - tow.mesh.position[dir.axis]) * (-dir.sign);
          if (fwd > 0 && fwd < 8 && Math.abs(other.mesh.position[dir.perpAxis] - tow.mesh.position[dir.perpAxis]) < 2.5) {
            if (other.state === 'crashed' && fwd < CAR_LENGTH + 1) {
              tow.cutsceneStopped = true;
              tow.speed = 0;
              tow.mesh.rotation.y = dir.angle;
            } else {
              tow.speed = Math.max(0.5, tow.speed * 0.85);
            }
            break;
          }
        }
        tow.mesh.position[dir.axis] -= dir.sign * tow.speed * dt;
        tow.distanceFromCenter = Math.abs(tow.mesh.position[dir.axis]);

        if (tow.distanceFromCenter <= tow.cutsceneStopDist) {
          tow.cutsceneStopped = true;
          tow.speed = 0;
          tow.mesh.rotation.y = dir.angle;
        } else {
          allStopped = false;
        }
      }

      if ((allStopped && phaseTimer > 1.0) || phaseTimer > 5) {
        // Attach crashed cars to tow trucks
        for (const tow of towTrucks) {
          if (tow.towTarget) {
            tow.towAttached = true;
          }
        }
        phase = 'tow_depart';
        phaseTimer = 0;
        // Reverse tow trucks to drive out
        for (const tow of towTrucks) {
          tow.cutsceneStopped = false;
          tow.speed = 6;
          tow.dodgeTarget = tow.dirData.laneOffset;
          tow.dodging = false;
          tow.dirData = { ...tow.dirData, sign: -tow.dirData.sign };
        }
      }
    }

    // === PHASE 5: TOW DEPART — tow trucks pull crashed cars off screen ===
    if (phase === 'tow_depart') {
      phaseTimer += dt;

      let allGone = true;
      for (const tow of towTrucks) {
        if (tow.cutsceneStopped) continue;
        tow.speed = Math.min(tow.speed + 4 * dt, 14);
        const dir = tow.dirData;
        // Slow down if a yielding car is still in the path
        for (const other of state.cars) {
          if (other === tow || other.isPedestrian || other.state === 'crashed' || other.state === 'cutscene') continue;
          const fwd = (other.mesh.position[dir.axis] - tow.mesh.position[dir.axis]) * (-dir.sign);
          if (fwd > 0 && fwd < 8 && Math.abs(other.mesh.position[dir.perpAxis] - tow.mesh.position[dir.perpAxis]) < 2.5) {
            tow.speed = Math.max(0.5, tow.speed * 0.85);
            break;
          }
        }
        tow.mesh.position[dir.axis] -= dir.sign * tow.speed * dt;
        tow.distanceFromCenter = Math.abs(tow.mesh.position[dir.axis]);

        // Drag the crashed car behind the tow truck
        if (tow.towAttached && tow.towTarget) {
          const target = tow.towTarget;
          const dir = tow.dirData;
          // Position crashed car behind tow truck (offset along main axis)
          const towLen = (tow.vehicleLength || CAR_LENGTH);
          const targetLen = (target.vehicleLength || CAR_LENGTH);
          const followDist = (towLen + targetLen) / 2 + 0.5;
          // "Behind" the tow truck means opposite to its travel direction
          const behindX = tow.mesh.position.x + (dir.axis === 'x' ? dir.sign * followDist : 0);
          const behindZ = tow.mesh.position.z + (dir.axis === 'z' ? dir.sign * followDist : 0);
          // Smoothly interpolate the crashed car toward the behind position
          const lerpSpeed = 4 * dt;
          target.mesh.position.x += (behindX - target.mesh.position.x) * lerpSpeed;
          target.mesh.position.z += (behindZ - target.mesh.position.z) * lerpSpeed;
          // Match rotation
          target.mesh.rotation.y = tow.mesh.rotation.y;
          // Tilt the front up slightly to show it's being towed
          target.mesh.rotation.z = dir.sign * 0.08;
        }

        if (tow.distanceFromCenter > 42) {
          tow.cutsceneStopped = true;
        } else {
          allGone = false;
        }
      }

      if ((allGone && phaseTimer > 0.5) || phaseTimer > 8) {
        cutsceneAnimId = null;
        onComplete();
        return;
      }
    }

    updateSiren(elapsed);

    // Zoom out camera during cutscene
    if (!state._cutsceneZoom) state._cutsceneZoom = 0;
    state._cutsceneZoom = Math.min(state._cutsceneZoom + dt * 8, 30);
    const camDist = 35 + state._cutsceneZoom;
    const camHeight = 40 + state._cutsceneZoom * 0.8;
    state.camera.position.x = Math.sin(state.currentCameraAngle) * camDist;
    state.camera.position.z = Math.cos(state.currentCameraAngle) * camDist;
    state.camera.position.y = camHeight;
    state.camera.lookAt(0, 0, 0);

    state.renderer.render(state.scene, state.camera);
    cutsceneAnimId = requestAnimationFrame(cutsceneLoop);
  }

  cutsceneAnimId = requestAnimationFrame(cutsceneLoop);
}

function cancelCutscene() {
  if (cutsceneAnimId) {
    cancelAnimationFrame(cutsceneAnimId);
    cutsceneAnimId = null;
  }
  stopSiren();
  for (const p of cutscenePeople) {
    if (!p.loaded) disposeMesh(p.mesh);
  }
  cutscenePeople = [];
  cutsceneVehicles = [];
}

// ============================================================
// GAME FLOW
// ============================================================
function cleanupCars() {
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
}

function cleanupDebris() {
  for (const obj of state.crashDebris) {
    state.scene.remove(obj);
    obj.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  state.crashDebris = [];
}

function resetToStartScreen() {
  cancelCutscene();
  cleanupCars();
  cleanupDebris();
  state.gameRunning = false;
  state.gameOver = false;
  if (state.gameOverTimeout) { clearTimeout(state.gameOverTimeout); state.gameOverTimeout = null; }

  setWeather('clear', 0);
  setNightMode(false);
  state.weatherParticles = [];
  // Hide game over, show start screen
  gameOverScreen.classList.add('hidden');
  document.getElementById('tutorialScreen').classList.add('hidden');
  crashFlash.classList.remove('active');
  crashFlash.style.opacity = '0';
  crashFlash.style.background = '';

  state.appPhase = 'start';
  state.gestureHoldTimer = 0;
  startScreen.classList.remove('hidden');
  state.renderer.render(state.scene, state.camera);
}

function startGame() {
  cancelCutscene();
  cleanupCars();
  cleanupDebris();
  state.score = 0;
  state.carsCleared = 0;
  state.wave = 1;
  state.spawnInterval = 4.0;
  state.carSpeed = 6;
  state.maxCarsPerSpawn = 1;
  state.impatienceChance = 0;
  state.spawnTimer = 0;
  state.difficultyTimer = 0;
  state.signalState = SIGNAL_STATES.ALL_GO;
  state.pendingSignal = SIGNAL_STATES.ALL_GO;
  state.signalDebounceTimer = 0;
  state.honkTimer = 0;
  state.nearMissFlashTimer = 0;
  setWeather('clear', 0);
  setNightMode(false);
  state.weatherParticles = [];
  state.copFacingIndex = 0;
  state.targetCameraAngle = 0;
  state.currentCameraAngle = 0;
  state.turnCooldown = 0;
  state.lastFistGesture = 'NONE';
  state.gameOver = false;
  state.gameRunning = true;
  state.secretTimeScale = 1;
  state.secretPaused = false;
  state.appPhase = 'playing';

  // Cancel any pending game-over overlay
  if (state.gameOverTimeout) { clearTimeout(state.gameOverTimeout); state.gameOverTimeout = null; }

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  document.getElementById('tutorialScreen').classList.add('hidden');
  crashFlash.classList.remove('active');
  crashFlash.style.opacity = '0';
  crashFlash.style.background = '';

  state.clock.start();
  updateHUD();
  animate();
}

function triggerGameOver(reason) {
  // Score penalty for crash
  state.score = Math.max(0, state.score - 50);
  updateHUD();

  // Tell all non-crashed traffic to pull over to the shoulder (yield to emergency)
  for (const car of state.cars) {
    if (car.state !== 'crashed' && !car.isPedestrian) {
      car._preYieldSpeed = car.speed;
      car._preYieldState = car.state;
      car.state = 'yielding';
      car._yieldTarget = Math.sign(car.dirData.laneOffset) * SIDEWALK_CENTER;
    }
  }

  // Pause the main game loop while cutscene plays
  state.gameRunning = false;
  state.appPhase = 'cutscene';
  state._cutsceneReason = reason;

  // Find crashed cars and crash position
  const crashed = state.cars.filter(c => c.state === 'crashed');
  const crashX = crashed.length ? crashed.reduce((s, c) => s + c.mesh.position.x, 0) / crashed.length : 0;
  const crashZ = crashed.length ? crashed.reduce((s, c) => s + c.mesh.position.z, 0) / crashed.length : 0;

  playCutscene(crashX, crashZ, crashed, () => {
    resumeAfterCutscene();
  });
}

function resumeAfterCutscene() {
  // Clean up all cars and debris
  cleanupCars();
  cleanupDebris();
  cutsceneVehicles = [];

  crashFlash.classList.remove('active');
  crashFlash.style.opacity = '0';
  crashFlash.style.background = '';

  // Reset camera zoom back to normal
  state._cutsceneZoom = 0;

  // Update high score
  if (state.score > state.highScoreValue) {
    state.highScoreValue = state.score;
    try { localStorage.setItem('trafficCopHighScore', state.highScoreValue); } catch (e) {}
  }

  // Show game over screen
  state.gameOver = true;
  state.appPhase = 'gameover';
  const reason = state._cutsceneReason || 'crash';
  delete state._cutsceneReason;
  showGameOverScreen(reason);
}

function showGameOverScreen(reason) {
  finalScoreEl.textContent = state.score;
  if (highScoreEl) highScoreEl.textContent = 'High Score: ' + state.highScoreValue;
  const titleEl = document.getElementById('gameOverTitle');
  const reasonEl = document.getElementById('gameOverReason');
  if (reason === 'pedestrian') {
    titleEl.textContent = '\uD83D\uDEB6 PEDESTRIAN HIT!';
    reasonEl.textContent = 'A car struck a pedestrian! Protect the crosswalks!';
  } else {
    titleEl.textContent = '\uD83D\uDCA5 CRASH!';
    reasonEl.textContent = 'Two cars collided at the intersection!';
  }
  // Stats
  document.getElementById('goWave').textContent = state.wave;
  document.getElementById('goCleared').textContent = state.carsCleared;
  const secs = Math.floor(state.difficultyTimer);
  document.getElementById('goTime').textContent = secs >= 60 ? Math.floor(secs / 60) + 'm ' + (secs % 60) + 's' : secs + 's';
  // New high score badge
  const hsBadge = document.getElementById('newHighScoreBadge');
  if (state.score > 0 && state.score >= state.highScoreValue) {
    hsBadge.classList.remove('hidden');
  } else {
    hsBadge.classList.add('hidden');
  }
  gameOverScreen.classList.remove('hidden');
}

let _hudScore = -1, _hudWave = -1, _hudCleared = -1, _hudSignal = '', _hudFacing = -1;
let _cachedFacingEl = null;

function updateHUD() {
  if (state.score !== _hudScore) {
    _hudScore = state.score;
    scoreEl.textContent = 'Score: ' + state.score;
  }
  if (state.wave !== _hudWave) {
    _hudWave = state.wave;
    const wd = getWaveData(state.wave);
    levelEl.textContent = wd.emoji + ' Wave ' + state.wave;
  }
  if (state.carsCleared !== _hudCleared) {
    _hudCleared = state.carsCleared;
    carsClearedEl.textContent = 'Cars cleared: ' + state.carsCleared;
  }
  if (state.signalState !== _hudSignal) {
    _hudSignal = state.signalState;
    let signalText = 'ALL GO';
    let signalColor = '#ffaa00';
    if (state.signalState === SIGNAL_STATES.ALL_STOP) {
      signalText = 'ALL STOP';
      signalColor = '#ff4444';
    } else if (state.signalState === SIGNAL_STATES.EW_GO) {
      signalText = 'E/W \u2192 GO | N/S STOP';
      signalColor = '#44ff44';
    } else if (state.signalState === SIGNAL_STATES.NS_GO) {
      signalText = 'N/S \u2192 GO | E/W STOP';
      signalColor = '#44ff44';
    }
    signalIndicatorEl.textContent = 'Signal: ' + signalText;
    signalIndicatorEl.style.color = signalColor;
  }
  if (state.copFacingIndex !== _hudFacing) {
    _hudFacing = state.copFacingIndex;
    if (!_cachedFacingEl) _cachedFacingEl = document.getElementById('facingIndicator');
    if (_cachedFacingEl) _cachedFacingEl.textContent = 'Facing: ' + FACING_NAMES[state.copFacingIndex];
  }
}

// ============================================================
// MAIN LOOP
// ============================================================
function animate() {
  if (!state.gameRunning) {
    state.renderer.render(state.scene, state.camera);
    return;
  }

  requestAnimationFrame(animate);

  if (state.secretPaused) { state.renderer.render(state.scene, state.camera); return; }
  const dt = Math.min(state.clock.getDelta(), 0.05) * state.secretTimeScale; // cap delta time

  // Update signal with debounce
  state.signalDebounceTimer += dt;
  if (state.pendingSignal !== state.signalState && state.signalDebounceTimer > 0.3) {
    const wasStop = state.pendingSignal === SIGNAL_STATES.ALL_STOP;
    state.signalState = state.pendingSignal;
    state.signalDebounceTimer = 0;
    playWhistle(wasStop); // long whistle blast when stopping traffic
  }

  // Spawn cars
  state.spawnTimer += dt;
  if (state.spawnTimer >= state.spawnInterval) {
    state.spawnTimer = 0;
    spawnCars();
  }

  // Honking from waiting cars
  state.honkTimer += dt;
  if (state.honkTimer >= state.honkInterval) {
    state.honkTimer = 0;
    state.honkInterval = 1.2 + Math.random() * 2.5; // randomize next honk interval
    const waitingCars = state.cars.filter(c => !c.isPedestrian && c.state === 'waiting' && !c.isEmergency);
    if (waitingCars.length > 0) {
      // More waiting cars = more likely to honk, and angrier
      const honkChance = Math.min(0.9, 0.2 + waitingCars.length * 0.15);
      if (Math.random() < honkChance) {
        // Pick a random waiting car to honk
        const honker = waitingCars[Math.floor(Math.random() * waitingCars.length)];
        if (honker.waitTime > 5) {
          playAngryHonk(honker.vehicleType); // cars waiting 5+ seconds get angry
        } else {
          playHonk(honker.vehicleType);
        }
      }
    }
  }

  // Near-miss flash fade
  if (state.nearMissFlashTimer > 0) {
    state.nearMissFlashTimer -= dt;
    crashFlash.style.background = 'rgba(255, 200, 0, 0.3)';
    crashFlash.style.opacity = Math.max(0, state.nearMissFlashTimer / 0.5);
  }

  // Update systems
  updateCars(dt);
  updateAmbientPeds(dt);
  updateBrakeLights();
  updateBlinkers();
  // (Emergency vehicles removed)
  checkCollisions();
  updateDifficulty(dt);
  updateCopAnimation(dt);
  updateCamera(dt);
  updateSignalMarkers(Date.now());
  updateHUD();

  updateWeather(dt);

  state.renderer.render(state.scene, state.camera);
}

// ============================================================
// WIRE CALLBACKS (break circular dependencies)
// ============================================================
setCollisionCallbacks({ triggerGameOver });
setPedestrianCallbacks({ triggerGameOver, showCrashEffect });
setGestureCallbacks({ startGame, resetToStartScreen });
setControlCallbacks({ startGame, resetToStartScreen });

// ============================================================
// INIT
// ============================================================
initScene();
initWeather();
state.renderer.render(state.scene, state.camera);

// Pre-load sound effects (async, non-blocking)
preloadSounds();

// Start webcam + gesture detection immediately so UI is gesture-driven
initGestureDetection();

// Start keyboard controls
initKeyboardControls();
