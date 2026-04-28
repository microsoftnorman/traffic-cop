// ============================================================
// js/pedestrians.js — Pedestrian system (crossing peds, ambient peds, bus passengers)
// ============================================================
import * as THREE from 'three';
import { ROAD_WIDTH, CAR_LENGTH, STOP_LINE_DIST, SIGNAL_STATES, DIRECTIONS } from './constants.js';
import { state } from './state.js';
import { mergeGeometries } from './scene.js';
import { playCrash } from './audio.js';
import { generateAmbientPedRoute } from './difficulty.js';

// Late-binding callbacks to avoid circular dependencies
let _triggerGameOver = null;
let _showCrashEffect = null;

export function setCallbacks({ triggerGameOver, showCrashEffect }) {
  _triggerGameOver = triggerGameOver;
  _showCrashEffect = showCrashEffect;
}

export const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c];
export const PANTS_COLORS = [0x2c3e50, 0x34495e, 0x1a1a2e, 0x3d4f5f, 0x4a3728];
export const HAIR_COLORS = [0x2a1a0a, 0x6b4226, 0xd4a460, 0x1a1a1a, 0x8b4513, 0xcc6633];
const SIDEWALK_CENTER = ROAD_WIDTH / 2 + 1.75; // center of sidewalk strip

export const PED_TYPES = [
  { name: 'normal',     speedMult: 1.0,  weight: 5 },
  { name: 'elderly',    speedMult: 0.55, weight: 3 },
  { name: 'jogger',     speedMult: 1.6,  weight: 2 },
  { name: 'dogwalker',  speedMult: 0.8,  weight: 3 },
  { name: 'stroller',   speedMult: 0.7,  weight: 2 },
  { name: 'child',      speedMult: 1.2,  weight: 2 },
];

function pickPedType() {
  const total = PED_TYPES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const pt of PED_TYPES) { r -= pt.weight; if (r <= 0) return pt; }
  return PED_TYPES[0];
}

export function buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos, offsetX) {
  const ox = offsetX || 0;
  const torso = new THREE.BoxGeometry(0.3 * S, 0.45 * S, 0.22 * S);
  torso.translate(ox, 1.0 * S, 0); shirtGeos.push(torso);
  const arm = new THREE.BoxGeometry(0.1 * S, 0.38 * S, 0.1 * S);
  const aL = arm.clone(); aL.translate(ox - 0.25 * S, 0.92 * S, 0); shirtGeos.push(aL);
  const aR = arm.clone(); aR.translate(ox + 0.25 * S, 0.92 * S, 0); shirtGeos.push(aR);
  const leg = new THREE.BoxGeometry(0.13 * S, 0.45 * S, 0.13 * S);
  const lL = leg.clone(); lL.translate(ox - 0.09 * S, 0.45 * S, 0); pantsGeos.push(lL);
  const lR = leg.clone(); lR.translate(ox + 0.09 * S, 0.45 * S, 0); pantsGeos.push(lR);
  const shoe = new THREE.BoxGeometry(0.14 * S, 0.1 * S, 0.18 * S);
  const sL = shoe.clone(); sL.translate(ox - 0.09 * S, 0.18 * S, 0.02 * S); shoeGeos.push(sL);
  const sR = shoe.clone(); sR.translate(ox + 0.09 * S, 0.18 * S, 0.02 * S); shoeGeos.push(sR);
  const head = new THREE.SphereGeometry(0.16 * S, 8, 6);
  head.translate(ox, 1.42 * S, 0); skinGeos.push(head);
  const hand = new THREE.SphereGeometry(0.06 * S, 5, 4);
  const hL = hand.clone(); hL.translate(ox - 0.25 * S, 0.7 * S, 0); skinGeos.push(hL);
  const hR = hand.clone(); hR.translate(ox + 0.25 * S, 0.7 * S, 0); skinGeos.push(hR);
  const hair = new THREE.SphereGeometry(0.17 * S, 8, 6);
  hair.scale(1, 0.6, 1); hair.translate(ox, 1.5 * S, -0.02 * S); hairGeos.push(hair);
}

export function createPedestrian() {
  // Pick which crosswalk to use
  const CROSSWALK_DIST = STOP_LINE_DIST - 2.5;
  const SPAWN_DIST = 65;
  const crossings = [
    { crossAxis: 'x', fixedAxis: 'z', fixedPos: CROSSWALK_DIST, sign: Math.random() > 0.5 ? 1 : -1 },
    { crossAxis: 'x', fixedAxis: 'z', fixedPos: -CROSSWALK_DIST, sign: Math.random() > 0.5 ? 1 : -1 },
    { crossAxis: 'z', fixedAxis: 'x', fixedPos: CROSSWALK_DIST, sign: Math.random() > 0.5 ? 1 : -1 },
    { crossAxis: 'z', fixedAxis: 'x', fixedPos: -CROSSWALK_DIST, sign: Math.random() > 0.5 ? 1 : -1 },
  ];
  const crossing = crossings[Math.floor(Math.random() * crossings.length)];
  const pedType = pickPedType();

  const group = new THREE.Group();
  const skinColor = [0xe8b88a, 0xc68642, 0x8d5524, 0xf1c27d][Math.floor(Math.random() * 4)];
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)], roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)], roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  const S = 1.8; // base scale
  const shirtGeos = [], pantsGeos = [], skinGeos = [], shoeGeos = [], hairGeos = [];
  const extraGeos = []; // for accessories (same color as shirt or special)

  if (pedType.name === 'elderly') {
    // Shorter, hunched — smaller scale, cane
    const eS = S * 0.85;
    buildPersonGeos(eS, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
    // Cane
    const cane = new THREE.CylinderGeometry(0.03 * S, 0.03 * S, 0.85 * S, 4);
    cane.translate(0.3 * S, 0.45 * S, 0.1 * S);
    extraGeos.push(cane);
    // Hat (flat cap)
    const hat = new THREE.CylinderGeometry(0.2 * S, 0.18 * S, 0.08 * S, 8);
    hat.translate(0, 1.55 * eS, 0); extraGeos.push(hat);
  } else if (pedType.name === 'jogger') {
    buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
    // Headband
    const band = new THREE.TorusGeometry(0.16 * S, 0.02 * S, 4, 12);
    band.rotateX(Math.PI / 2);
    band.translate(0, 1.48 * S, 0); extraGeos.push(band);
  } else if (pedType.name === 'dogwalker') {
    buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
    // Dog body
    const dogMat = new THREE.MeshStandardMaterial({ color: [0x8B4513, 0xD2B48C, 0x333333, 0xFFFFFF][Math.floor(Math.random() * 4)], roughness: 0.7 });
    const dogBody = new THREE.BoxGeometry(0.22 * S, 0.2 * S, 0.5 * S);
    dogBody.translate(0.35 * S, 0.22 * S, 0.3 * S);
    const dogHead = new THREE.SphereGeometry(0.1 * S, 6, 5);
    dogHead.translate(0.35 * S, 0.3 * S, 0.55 * S);
    const dogLeg1 = new THREE.BoxGeometry(0.06 * S, 0.15 * S, 0.06 * S);
    const dl1 = dogLeg1.clone(); dl1.translate(0.28 * S, 0.08 * S, 0.15 * S);
    const dl2 = dogLeg1.clone(); dl2.translate(0.42 * S, 0.08 * S, 0.15 * S);
    const dl3 = dogLeg1.clone(); dl3.translate(0.28 * S, 0.08 * S, 0.45 * S);
    const dl4 = dogLeg1.clone(); dl4.translate(0.42 * S, 0.08 * S, 0.45 * S);
    const dogTail = new THREE.CylinderGeometry(0.02 * S, 0.015 * S, 0.18 * S, 4);
    dogTail.rotateX(-0.5); dogTail.translate(0.35 * S, 0.38 * S, 0.05 * S);
    group.add(new THREE.Mesh(mergeGeometries([dogBody, dogHead, dl1, dl2, dl3, dl4, dogTail]), dogMat));
    // Leash
    const leash = new THREE.CylinderGeometry(0.01 * S, 0.01 * S, 0.5 * S, 3);
    leash.rotateX(-0.6); leash.translate(0.3 * S, 0.55 * S, 0.3 * S);
    extraGeos.push(leash);
  } else if (pedType.name === 'stroller') {
    buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
    // Stroller frame
    const strollerMat = new THREE.MeshStandardMaterial({ color: [0x2266aa, 0xcc3333, 0x22aa44, 0x9944cc][Math.floor(Math.random() * 4)], roughness: 0.5 });
    const basket = new THREE.BoxGeometry(0.35 * S, 0.25 * S, 0.4 * S);
    basket.translate(0, 0.35 * S, 0.45 * S);
    const hood = new THREE.SphereGeometry(0.2 * S, 6, 4, 0, Math.PI);
    hood.rotateX(-0.3); hood.translate(0, 0.5 * S, 0.35 * S);
    const handle = new THREE.CylinderGeometry(0.02 * S, 0.02 * S, 0.5 * S, 4);
    handle.translate(0, 0.7 * S, 0.65 * S);
    const w1 = new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 0.04 * S, 8);
    w1.rotateZ(Math.PI / 2);
    const wl1 = w1.clone(); wl1.translate(-0.18 * S, 0.12 * S, 0.28 * S);
    const wl2 = w1.clone(); wl2.translate(0.18 * S, 0.12 * S, 0.28 * S);
    const wl3 = w1.clone(); wl3.translate(-0.18 * S, 0.12 * S, 0.62 * S);
    const wl4 = w1.clone(); wl4.translate(0.18 * S, 0.12 * S, 0.62 * S);
    group.add(new THREE.Mesh(mergeGeometries([basket, hood, handle, wl1, wl2, wl3, wl4]), strollerMat));
  } else if (pedType.name === 'child') {
    // Small person
    const cS = S * 0.6;
    buildPersonGeos(cS, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
    // Backpack
    const bp = new THREE.BoxGeometry(0.2 * cS, 0.25 * cS, 0.12 * cS);
    bp.translate(0, 0.9 * cS, -0.17 * cS); extraGeos.push(bp);
  } else {
    // Normal pedestrian
    buildPersonGeos(S, skinGeos, shirtGeos, pantsGeos, shoeGeos, hairGeos);
  }

  if (shirtGeos.length) group.add(new THREE.Mesh(mergeGeometries(shirtGeos), shirtMat));
  if (pantsGeos.length) group.add(new THREE.Mesh(mergeGeometries(pantsGeos), pantsMat));
  if (skinGeos.length) group.add(new THREE.Mesh(mergeGeometries(skinGeos), skinMat));
  if (hairGeos.length) group.add(new THREE.Mesh(mergeGeometries(hairGeos), hairMat));
  if (shoeGeos.length) group.add(new THREE.Mesh(mergeGeometries(shoeGeos), shoeMat));
  if (extraGeos.length) {
    const accMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 });
    group.add(new THREE.Mesh(mergeGeometries(extraGeos), accMat));
  }

  // Spawn off-map on the sidewalk, walk toward the crosswalk
  // The sidewalk runs parallel to the road the ped will cross
  // crossAxis = direction ped walks across the road ('x' or 'z')
  // sidewalkAxis = axis ped walks along the sidewalk to reach crosswalk (perpendicular to crossAxis)
  const sidewalkAxis = crossing.crossAxis === 'x' ? 'z' : 'x';
  const approachSign = Math.random() > 0.5 ? 1 : -1; // which end of sidewalk they come from
  const sidewalkOffset = crossing.sign * SIDEWALK_CENTER; // which side of the road

  // Start far away on the sidewalk
  if (crossing.crossAxis === 'x') {
    // Crosses in x. Sidewalk runs in z. Fixed z will be the crosswalk z position.
    group.position.x = sidewalkOffset;
    group.position.z = approachSign * SPAWN_DIST;
    // Face toward crosswalk
    group.rotation.y = approachSign > 0 ? Math.PI : 0;
  } else {
    // Crosses in z. Sidewalk runs in x. Fixed x will be the crosswalk x position.
    group.position.z = sidewalkOffset;
    group.position.x = approachSign * SPAWN_DIST;
    group.rotation.y = approachSign > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  group.position.y = 0.2; // sidewalk height
  state.scene.add(group);

  const pedSpeed = (2.0 + Math.random() * 1.5) * pedType.speedMult;

  return {
    mesh: group,
    direction: crossing.crossAxis === 'x' ? (crossing.sign > 0 ? 'WEST' : 'EAST') : (crossing.sign > 0 ? 'NORTH' : 'SOUTH'),
    dirData: crossing.crossAxis === 'x'
      ? { axis: 'x', sign: crossing.sign, perpAxis: 'z', laneOffset: crossing.fixedPos, angle: crossing.sign > 0 ? -Math.PI / 2 : Math.PI / 2 }
      : { axis: 'z', sign: crossing.sign, perpAxis: 'x', laneOffset: crossing.fixedPos, angle: crossing.sign > 0 ? Math.PI : 0 },
    speed: pedSpeed,
    state: 'approaching', // new state: walking along sidewalk toward crosswalk
    distanceFromCenter: SPAWN_DIST,
    cleared: false,
    vehicleLength: 0.7,
    vehicleWidth: 0.5,
    vehicleType: pedType.name,
    isPedestrian: true,
    crossAxis: crossing.crossAxis,
    crossSign: crossing.sign,
    crossFixed: crossing.fixedPos,
    sidewalkAxis: sidewalkAxis,
    approachSign: approachSign,
    pedBob: Math.random() * Math.PI * 2
  };
}

// ============================================================
// Ambient pedestrians (sidewalk walkers)
// ============================================================

export function spawnAmbientPed() {
  const route = generateAmbientPedRoute();
  const group = new THREE.Group();
  const S = 1.6 + Math.random() * 0.4;
  const skinColor = [0xe8b88a, 0xc68642, 0x8d5524, 0xf1c27d][Math.floor(Math.random() * 4)];
  const skinMat2 = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const shirtMat2 = new THREE.MeshStandardMaterial({ color: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)], roughness: 0.7 });
  const pantsMat2 = new THREE.MeshStandardMaterial({ color: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)], roughness: 0.7 });
  const hairMat2 = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 0.8 });
  const shoeMat2 = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  const skinG = [], shirtG = [], pantsG = [], shoeG = [], hairG = [];
  buildPersonGeos(S, skinG, shirtG, pantsG, shoeG, hairG);
  if (shirtG.length) group.add(new THREE.Mesh(mergeGeometries(shirtG), shirtMat2));
  if (pantsG.length) group.add(new THREE.Mesh(mergeGeometries(pantsG), pantsMat2));
  if (skinG.length) group.add(new THREE.Mesh(mergeGeometries(skinG), skinMat2));
  if (hairG.length) group.add(new THREE.Mesh(mergeGeometries(hairG), hairMat2));
  if (shoeG.length) group.add(new THREE.Mesh(mergeGeometries(shoeG), shoeMat2));

  const start = route[0];
  group.position.set(start.x, 0, start.z);
  // Face toward first waypoint
  if (route.length > 1) {
    const ndx = route[1].x - start.x;
    const ndz = route[1].z - start.z;
    group.rotation.y = Math.atan2(ndx, ndz);
  }
  state.scene.add(group);

  state.ambientPeds.push({
    mesh: group,
    waypoints: route,
    waypointIdx: 1,
    speed: 1.5 + Math.random() * 1.0,
    pauseTimer: 0
  });
}

// ============================================================
// Bus passenger boarding/alighting system
// ============================================================

function createBusPassengerMesh() {
  const group = new THREE.Group();
  const S = 1.5 + Math.random() * 0.3;
  const skinColor = [0xe8b88a, 0xc68642, 0x8d5524, 0xf1c27d][Math.floor(Math.random() * 4)];
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)], roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)], roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const skinG = [], shirtG = [], pantsG = [], shoeG = [], hairG = [];
  buildPersonGeos(S, skinG, shirtG, pantsG, shoeG, hairG);
  if (shirtG.length) group.add(new THREE.Mesh(mergeGeometries(shirtG), shirtMat));
  if (pantsG.length) group.add(new THREE.Mesh(mergeGeometries(pantsG), pantsMat));
  if (skinG.length) group.add(new THREE.Mesh(mergeGeometries(skinG), skinMat));
  if (hairG.length) group.add(new THREE.Mesh(mergeGeometries(hairG), hairMat));
  if (shoeG.length) group.add(new THREE.Mesh(mergeGeometries(shoeG), shoeMat));
  return group;
}

export function spawnBusPassengers(car) {
  const dir = car.dirData;
  const isNS = dir.axis === 'z';
  const busW = car.vt.w;
  const busMain = isNS ? car.mesh.position.z : car.mesh.position.x;
  const busPerp = isNS ? car.mesh.position.x : car.mesh.position.z;
  const shelterDir = busPerp > 0 ? 1 : -1;
  const doorPerp = busPerp + shelterDir * (busW / 2 + 0.3);
  const shelterPerp = busPerp + shelterDir * 3.5;
  const count = 2 + Math.floor(Math.random() * 3); // 2-4 passengers
  const alightCount = Math.floor(count / 2);

  for (let i = 0; i < count; i++) {
    const mesh = createBusPassengerMesh();
    const isBoarding = i >= alightCount;
    const mainOffset = (i - count / 2) * 0.6;
    const pMain = busMain + mainOffset;
    let startX, startZ, endX, endZ;
    if (isBoarding) {
      if (isNS) {
        startX = shelterPerp + (Math.random() - 0.5) * 1.0;
        startZ = pMain; endX = doorPerp; endZ = pMain;
      } else {
        startX = pMain; startZ = shelterPerp + (Math.random() - 0.5) * 1.0;
        endX = pMain; endZ = doorPerp;
      }
    } else {
      if (isNS) {
        startX = doorPerp; startZ = pMain;
        endX = shelterPerp + (Math.random() - 0.5) * 1.0; endZ = pMain;
      } else {
        startX = pMain; startZ = doorPerp;
        endX = pMain; endZ = shelterPerp + (Math.random() - 0.5) * 1.0;
      }
    }
    mesh.position.set(startX, 0, startZ);
    const dx = endX - startX, dz = endZ - startZ;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) mesh.rotation.y = Math.atan2(dx, dz);
    state.scene.add(mesh);
    car.busPassengers.push({
      mesh, startX, startZ, endX, endZ,
      progress: 0,
      speed: 0.35 + Math.random() * 0.15,
      delay: isBoarding ? 0.6 + (i - alightCount) * 0.4 : i * 0.4
    });
  }
}

export function updateBusPassengers(car, dt) {
  for (let i = car.busPassengers.length - 1; i >= 0; i--) {
    const p = car.busPassengers[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.progress += p.speed * dt;
    if (p.progress >= 1) {
      state.scene.remove(p.mesh);
      p.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
      car.busPassengers.splice(i, 1);
    } else {
      p.mesh.position.x = p.startX + (p.endX - p.startX) * p.progress;
      p.mesh.position.z = p.startZ + (p.endZ - p.startZ) * p.progress;
    }
  }
}

export function removeBusPassengers(car) {
  for (const p of car.busPassengers) {
    state.scene.remove(p.mesh);
    p.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  }
  car.busPassengers = [];
}

export const AMBIENT_PED_TARGET = 10;
let ambientPedSpawnTimer = 0;

// Check if an ambient ped's next waypoint requires crossing a road, and whether it's safe
export function isAmbientCrossingSafe(from, to) {
  const dx = Math.abs(to.x - from.x);
  const dz = Math.abs(to.z - from.z);
  if (dx < 1 && dz < 1) return true; // not moving
  // Crossing in x (NS road): x changes, z stays — unsafe when NS traffic flows
  if (dx > dz) {
    return state.signalState !== SIGNAL_STATES.NS_GO && state.signalState !== SIGNAL_STATES.ALL_GO;
  }
  // Crossing in z (EW road): z changes, x stays — unsafe when EW traffic flows
  return state.signalState !== SIGNAL_STATES.EW_GO && state.signalState !== SIGNAL_STATES.ALL_GO;
}

export function updateAmbientPeds(dt) {
  // Spawn new peds to maintain target count
  ambientPedSpawnTimer += dt;
  if (state.ambientPeds.length < AMBIENT_PED_TARGET && ambientPedSpawnTimer > 2.0) {
    spawnAmbientPed();
    ambientPedSpawnTimer = 0;
  }

  for (let i = state.ambientPeds.length - 1; i >= 0; i--) {
    const ap = state.ambientPeds[i];
    if (ap.pauseTimer > 0) { ap.pauseTimer -= dt; continue; }

    const target = ap.waypoints[ap.waypointIdx];
    const dx = target.x - ap.mesh.position.x;
    const dz = target.z - ap.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.3) {
      ap.mesh.position.x = target.x;
      ap.mesh.position.z = target.z;
      ap.waypointIdx++;

      if (ap.waypointIdx >= ap.waypoints.length) {
        // Reached exit — remove ped
        state.scene.remove(ap.mesh);
        ap.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        state.ambientPeds.splice(i, 1);
        continue;
      }

      // Check if next segment crosses a road — wait if unsafe
      const next = ap.waypoints[ap.waypointIdx];
      const isCrossing = Math.abs(next.x - ap.mesh.position.x) > 5 || Math.abs(next.z - ap.mesh.position.z) > 5;
      if (isCrossing && !isAmbientCrossingSafe(ap.mesh.position, next)) {
        ap.waitingToCross = true;
      }

      // Face next waypoint
      const ndx = next.x - ap.mesh.position.x;
      const ndz = next.z - ap.mesh.position.z;
      if (Math.abs(ndx) + Math.abs(ndz) > 0.01) {
        ap.mesh.rotation.y = Math.atan2(ndx, ndz);
      }
    } else {
      // If waiting to cross, check signal each frame
      if (ap.waitingToCross) {
        if (isAmbientCrossingSafe(ap.mesh.position, target)) {
          ap.waitingToCross = false;
        } else {
          continue; // stand still
        }
      }
      const step = Math.min(ap.speed * dt, dist);
      ap.mesh.position.x += (dx / dist) * step;
      ap.mesh.position.z += (dz / dist) * step;
    }

    // Car collision check — is this ped on the road?
    const px = ap.mesh.position.x;
    const pz = ap.mesh.position.z;
    const onRoad = (Math.abs(px) < ROAD_WIDTH / 2 || Math.abs(pz) < ROAD_WIDTH / 2) &&
                   Math.abs(px) < STOP_LINE_DIST + 2 && Math.abs(pz) < STOP_LINE_DIST + 2;
    if (onRoad) {
      for (const car of state.cars) {
        if (car.isPedestrian || car.state === 'crashed') continue;
        const d = car.mesh.position.distanceTo(ap.mesh.position);
        if (d < (car.vehicleLength || CAR_LENGTH) * 0.4) {
          // Hit by car — game over
          car.state = 'crashed';
          playCrash();
          _showCrashEffect(car, { mesh: ap.mesh, isPedestrian: true });
          _triggerGameOver('pedestrian');
          return;
        }
      }
    }
  }
}
