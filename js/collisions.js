// ============================================================
// js/collisions.js — Collision detection and crash effects
// ============================================================
import * as THREE from 'three';
import { STOP_LINE_DIST, CAR_LENGTH } from './constants.js';
import { state } from './state.js';
import { playCrash, playHonk, updateSiren, stopSiren } from './audio.js';
import { mergeGeometries } from './scene.js';
import { spawnEmergencyVehicle } from './vehicles.js';

let _triggerGameOver = null;

export function setCallbacks({ triggerGameOver }) {
  _triggerGameOver = triggerGameOver;
}

let emergencyWarningEl = null;

export function updateEmergencyVehicles(dt, t) {
  // Spawn timer
  if (!state.emergencyActive) {
    state.emergencyTimer += dt;
    if (state.emergencyTimer >= state.emergencyInterval) {
      state.emergencyTimer = 0;
      // After first spawn, reschedule between 15–25s
      state.emergencyInterval = 15 + Math.random() * 10;
      spawnEmergencyVehicle();
    }
  }

  // Animate flashing lights + check if emergency cleared
  let hasEmergency = false;
  for (const car of state.cars) {
    if (!car.isEmergency || car.state === 'crashed') continue;
    hasEmergency = true;

    // Flash lights alternating
    const lights = car.mesh.userData.emergencyLights;
    if (lights) {
      const flash = Math.sin(t * 12) > 0;
      lights[0].mat.emissiveIntensity = flash ? 1.5 : 0.1;
      lights[1].mat.emissiveIntensity = flash ? 0.1 : 1.5;
    }

    // Update siren pitch
    updateSiren(t);
  }

  // If no emergency vehicles remain, clear warning
  if (!hasEmergency && state.emergencyActive) {
    state.emergencyActive = false;
    if (!emergencyWarningEl) emergencyWarningEl = document.getElementById('emergencyWarning');
    if (emergencyWarningEl) emergencyWarningEl.classList.add('hidden');
    stopSiren();
  }
}

export function checkCollisions() {
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i];
      const b = state.cars[j];
      if (a.state === 'crashed' || b.state === 'crashed') continue;
      if (a.direction === b.direction) continue; // same lane, no collision
      // Same-axis vehicles (N/S or E/W) are in parallel lanes — no sideswipe
      if (!a.isPedestrian && !b.isPedestrian && a.dirData.axis === b.dirData.axis) continue;
      // Skip pedestrian-pedestrian collisions
      if (a.isPedestrian && b.isPedestrian) continue;
      // Turning cars yield to pedestrians — no collision
      const aTurning = a.turnRight && a.state === 'through' && !a.turnComplete;
      const bTurning = b.turnRight && b.state === 'through' && !b.turnComplete;
      if ((a.isPedestrian && bTurning) || (b.isPedestrian && aTurning)) continue;

      // Only check collisions when both entities are near the intersection
      if (a.distanceFromCenter > STOP_LINE_DIST + 2 || b.distanceFromCenter > STOP_LINE_DIST + 2) continue;

      const dist = a.mesh.position.distanceTo(b.mesh.position);
      const minDist = ((a.vehicleLength || CAR_LENGTH) + (b.vehicleLength || CAR_LENGTH)) * 0.35;

      // Near-miss warning (within 1.5x collision distance)
      const nearMissDist = minDist * 1.8;
      if (dist < nearMissDist && dist >= minDist) {
        if (!a.nearMissWarned && !b.nearMissWarned) {
          showNearMissWarning(a, b);
          a.nearMissWarned = true;
          b.nearMissWarned = true;
        }
      } else {
        a.nearMissWarned = false;
        b.nearMissWarned = false;
      }

      if (dist < minDist) {
        // CRASH!
        a.state = 'crashed';
        b.state = 'crashed';
        playCrash();
        showCrashEffect(a, b);
        // Determine game over reason
        const pedHit = a.isPedestrian || b.isPedestrian;
        _triggerGameOver(pedHit ? 'pedestrian' : 'crash');
        return;
      }
    }
  }
}

// Visual near-miss warning — yellow flash at near-miss point
function showNearMissWarning(a, b) {
  state.nearMissFlashTimer = 0.5;
  const honker = a.isPedestrian ? b : a;
  playHonk(honker.vehicleType); // startled honk
}

// Visual crash effect — sparks, bounce, and persistent crash marker
export function showCrashEffect(a, b) {
  const midX = (a.mesh.position.x + b.mesh.position.x) / 2;
  const midY = 1.5;
  const midZ = (a.mesh.position.z + b.mesh.position.z) / 2;

  // Spark particles
  const sparkGeo = new THREE.SphereGeometry(0.12, 4, 4);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  const sparks = [];
  for (let i = 0; i < 20; i++) {
    const spark = new THREE.Mesh(sparkGeo, sparkMat.clone());
    spark.position.set(midX, midY, midZ);
    spark.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 15,
      Math.random() * 10 + 3,
      (Math.random() - 0.5) * 15
    );
    spark.userData.life = 0.6 + Math.random() * 0.4;
    state.scene.add(spark);
    sparks.push(spark);
  }

  // Persistent crash marker — glowing ring on ground
  const ringGeo = new THREE.TorusGeometry(2.5, 0.15, 8, 32);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(midX, 0.1, midZ);
  state.scene.add(ring);
  state.crashDebris.push(ring);

  // Pillar of red light
  const pillarGeo = new THREE.CylinderGeometry(0.3, 1.5, 8, 12, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.set(midX, 4, midZ);
  state.scene.add(pillar);
  state.crashDebris.push(pillar);

  // Crash icon — floating X
  const xMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const bar1 = new THREE.BoxGeometry(0.3, 2.0, 0.3);
  bar1.rotateZ(Math.PI / 4);
  bar1.translate(midX, 3.5, midZ);
  const bar2 = new THREE.BoxGeometry(0.3, 2.0, 0.3);
  bar2.rotateZ(-Math.PI / 4);
  bar2.translate(midX, 3.5, midZ);
  const xMesh = new THREE.Mesh(mergeGeometries([bar1, bar2]), xMat);
  state.scene.add(xMesh);
  state.crashDebris.push(xMesh);

  // Tilt crashed vehicles slightly
  if (!a.isPedestrian) a.mesh.rotation.z = (Math.random() - 0.5) * 0.3;
  if (!b.isPedestrian) b.mesh.rotation.z = (Math.random() - 0.5) * 0.3;

  // Animate sparks + pulse ring
  let sparkTime = 0;
  function animateSparks() {
    const sdt = 0.016;
    sparkTime += sdt;
    let alive = false;
    for (const s of sparks) {
      s.userData.life -= sdt;
      if (s.userData.life <= 0) { state.scene.remove(s); continue; }
      alive = true;
      const vel = s.userData.vel;
      s.position.x += vel.x * sdt;
      s.position.y += vel.y * sdt;
      s.position.z += vel.z * sdt;
      vel.y -= 20 * sdt;
      s.material.opacity = s.userData.life;
      s.scale.setScalar(s.userData.life);
    }
    // Pulse the ring and pillar
    const pulse = 0.6 + Math.sin(sparkTime * 4) * 0.3;
    ringMat.opacity = pulse;
    pillarMat.opacity = 0.15 + Math.sin(sparkTime * 3) * 0.1;
    if (alive) requestAnimationFrame(animateSparks);
  }
  animateSparks();
}
