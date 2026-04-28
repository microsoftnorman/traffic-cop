// ============================================================
// js/vehicles.js — Vehicle system (extracted from main.js)
// ============================================================
import * as THREE from 'three';
import {
  DIRECTIONS, CAR_COLORS, SIGNAL_STATES, STOP_LINE_DIST, SPAWN_DIST, EXIT_DIST,
  CAR_LENGTH, RIGHT_TURN_CHANCE, TURN_RADIUS, NO_TURN_TYPES, RIGHT_TURN_DATA,
  BUS_STOP_DIST, BUS_STOP_DURATION_MIN, BUS_STOP_DURATION_MAX, LANE_OFFSET,
  INTERSECTION_SIZE, ROAD_WIDTH, CAR_WIDTH
} from './constants.js';
import { state } from './state.js';
import { playHonk, playAngryHonk, playScore, startSiren } from './audio.js';
import { updateCarNightLights } from './night.js';
import { mergeGeometries, makeCanvasTexture } from './scene.js';
import { createPedestrian, spawnBusPassengers, updateBusPassengers, removeBusPassengers } from './pedestrians.js';

let emergencyWarningEl = null;

// Vehicle types with dimensions and build instructions
// width, height, length are world units; speedMult adjusts base carSpeed
export const VEHICLE_TYPES = [
  // --- Cars ---
  { name: 'sedan',      w: 1.8, h: 1.4, l: 3.2, speedMult: 1.0, weight: 5, cabinScale: 0.5, cabinH: 0.4, cabinZ: -0.05 },
  { name: 'suv',        w: 2.0, h: 1.6, l: 3.6, speedMult: 0.95, weight: 3, cabinScale: 0.6, cabinH: 0.5, cabinZ: -0.02 },
  { name: 'hatchback',  w: 1.7, h: 1.3, l: 2.8, speedMult: 1.05, weight: 4, cabinScale: 0.4, cabinH: 0.38, cabinZ: -0.15 },
  { name: 'taxi',       w: 1.8, h: 1.4, l: 3.3, speedMult: 1.1, weight: 3, cabinScale: 0.5, cabinH: 0.4, cabinZ: -0.05 },
  { name: 'police',     w: 1.9, h: 1.5, l: 3.4, speedMult: 1.15, weight: 2, cabinScale: 0.5, cabinH: 0.42, cabinZ: -0.05 },
  { name: 'pickup',     w: 2.0, h: 1.6, l: 4.0, speedMult: 0.9, weight: 3, cabinScale: 0.35, cabinH: 0.45, cabinZ: 0.15 },
  // --- Big vehicles ---
  { name: 'bus',        w: 2.4, h: 2.8, l: 8.0, speedMult: 0.7, weight: 2, cabinScale: 0.85, cabinH: 0.7, cabinZ: 0 },
  { name: 'semi',       w: 2.4, h: 2.6, l: 9.5, speedMult: 0.6, weight: 1, cabinScale: 0.25, cabinH: 0.6, cabinZ: 0.35 },
  { name: 'firetruck',  w: 2.3, h: 2.5, l: 7.0, speedMult: 0.85, weight: 1, cabinScale: 0.3, cabinH: 0.55, cabinZ: 0.3 },
  { name: 'icecream',   w: 2.0, h: 2.6, l: 5.0, speedMult: 0.65, weight: 1, cabinScale: 0.35, cabinH: 0.5, cabinZ: 0.25 },
  // --- Small ---
  { name: 'motorcycle', w: 0.6, h: 1.2, l: 2.0, speedMult: 1.3, weight: 3, cabinScale: 0, cabinH: 0, cabinZ: 0 },
];

// Emergency vehicle types (spawned separately, not in normal pool)
export const EMERGENCY_TYPES = [
  { name: 'ambulance',  w: 2.1, h: 2.4, l: 5.5, speedMult: 1.2, weight: 1, cabinScale: 0.3, cabinH: 0.5, cabinZ: 0.25 },
  { name: 'firetruck',  w: 2.3, h: 2.5, l: 7.0, speedMult: 0.95, weight: 1, cabinScale: 0.3, cabinH: 0.55, cabinZ: 0.3 },
  { name: 'police',     w: 1.9, h: 1.5, l: 3.4, speedMult: 1.3, weight: 1, cabinScale: 0.5, cabinH: 0.42, cabinZ: -0.05 },
  { name: 'towtruck',   w: 2.1, h: 1.8, l: 5.0, speedMult: 0.85, weight: 1, cabinScale: 0.35, cabinH: 0.45, cabinZ: 0.25 },
];

// Bus colors
const BUS_COLORS = [0xddaa22, 0x2266aa, 0xcc3333, 0x22aa44, 0xee8833];

// Weighted random selection
export function pickVehicleType() {
  const totalWeight = VEHICLE_TYPES.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * totalWeight;
  for (const vt of VEHICLE_TYPES) {
    r -= vt.weight;
    if (r <= 0) return vt;
  }
  return VEHICLE_TYPES[0];
}

// Shared materials (cached once)
const _sharedCarMat = {};
function getSharedCarMat() {
  if (_sharedCarMat.ready) return _sharedCarMat;
  _sharedCarMat.dark = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
  _sharedCarMat.tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  _sharedCarMat.glass = new THREE.MeshStandardMaterial({ color: 0x88ccee, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2 });
  _sharedCarMat.shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
  _sharedCarMat.chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  _sharedCarMat.busWindow = new THREE.MeshStandardMaterial({ color: 0x99ccee, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2 });
  _sharedCarMat.ready = true;
  return _sharedCarMat;
}

export function createVehicle(directionKey, forceType) {
  const dir = DIRECTIONS[directionKey];
  const vt = forceType || pickVehicleType();
  const sharedMat = getSharedCarMat();
  const group = new THREE.Group();

  const W = vt.w, H = vt.h, L = vt.l;

  if (vt.name === 'motorcycle') {
    // --- MOTORCYCLE ---
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.75 });

    const bodyGeos = [];
    // Main frame tube
    const frameGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
    frameGeo.rotateX(Math.PI / 2);
    frameGeo.translate(0, 0.5, 0);
    bodyGeos.push(frameGeo);
    // Down tube (angled)
    const downTube = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5);
    downTube.translate(0, 0.35, 0.3);
    downTube.rotateX(0.3);
    downTube.translate(0, 0, 0);
    bodyGeos.push(downTube);
    // Fuel tank (rounded)
    const tankGeo = new THREE.BoxGeometry(0.38, 0.22, 0.55);
    const tankPos = tankGeo.getAttribute('position');
    for (let i = 0; i < tankPos.count; i++) {
      if (tankPos.getY(i) > 0) tankPos.setX(i, tankPos.getX(i) * 0.8);
    }
    tankGeo.computeVertexNormals();
    tankGeo.translate(0, 0.75, 0.15);
    bodyGeos.push(tankGeo);
    // Seat
    const seatGeo = new THREE.BoxGeometry(0.28, 0.08, 0.55);
    seatGeo.translate(0, 0.72, -0.28);
    bodyGeos.push(seatGeo);
    // Rear fender
    const fenderR = new THREE.BoxGeometry(0.22, 0.05, 0.45);
    fenderR.translate(0, 0.42, -0.5);
    bodyGeos.push(fenderR);
    group.add(new THREE.Mesh(mergeGeometries(bodyGeos), paintMat));

    // Rider
    const riderGeos = [];
    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.32, 0.45, 0.25);
    torsoGeo.translate(0, 1.15, -0.12);
    riderGeos.push(torsoGeo);
    // Arms
    [1, -1].forEach(side => {
      const armG = new THREE.BoxGeometry(0.1, 0.3, 0.1);
      armG.translate(side * 0.2, 1.05, 0.05);
      armG.rotateX(-0.3);
      riderGeos.push(armG);
    });
    // Helmet (sphere + visor)
    const helmetGeo = new THREE.SphereGeometry(0.17, 8, 6);
    helmetGeo.translate(0, 1.52, -0.08);
    riderGeos.push(helmetGeo);
    group.add(new THREE.Mesh(mergeGeometries(riderGeos), sharedMat.dark));

    // Visor (reflective)
    const visorGeo = new THREE.PlaneGeometry(0.22, 0.1);
    visorGeo.translate(0, 1.5, 0.1);
    group.add(new THREE.Mesh(visorGeo, sharedMat.glass));

    // Wheels — torus for realistic tire look
    const wheelGeos = [];
    const wheelGeo = new THREE.TorusGeometry(0.26, 0.08, 8, 16);
    wheelGeo.rotateY(Math.PI / 2);
    const fw = wheelGeo.clone(); fw.translate(0, 0.28, 0.65); wheelGeos.push(fw);
    const rw = wheelGeo.clone(); rw.translate(0, 0.28, -0.65); wheelGeos.push(rw);
    group.add(new THREE.Mesh(mergeGeometries(wheelGeos), sharedMat.dark));

    // Chrome parts — forks, exhaust, hub caps, handlebars
    const chromeGeos = [];
    // Front forks
    [0.08, -0.08].forEach(x => {
      const forkG = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 4);
      forkG.translate(x, 0.55, 0.55);
      chromeGeos.push(forkG);
    });
    // Handlebars
    const hBarGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
    hBarGeo.rotateZ(Math.PI / 2);
    hBarGeo.translate(0, 0.95, 0.5);
    chromeGeos.push(hBarGeo);
    // Exhaust pipes
    const exhaustG = new THREE.CylinderGeometry(0.04, 0.035, 0.9, 5);
    exhaustG.rotateX(Math.PI / 2);
    exhaustG.translate(0.18, 0.32, -0.15);
    chromeGeos.push(exhaustG);
    // Hub caps
    [0.65, -0.65].forEach(z => {
      const hubG = new THREE.CircleGeometry(0.12, 8);
      hubG.translate(0, 0.28, z);
      chromeGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlight
    const hlGeo = new THREE.CircleGeometry(0.09, 8);
    hlGeo.translate(0, 0.7, 0.81);
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffffcc, emissiveIntensity: 0.8 });
    group.add(new THREE.Mesh(hlGeo, hlMat));

    // Tail light
    const tlGeo = new THREE.PlaneGeometry(0.14, 0.06);
    tlGeo.translate(0, 0.5, -0.74);
    tlGeo.rotateX(0);
    group.add(new THREE.Mesh(tlGeo, new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.6 })));

  } else if (vt.name === 'bus') {
    // --- BUS ---
    const color = BUS_COLORS[Math.floor(Math.random() * BUS_COLORS.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });

    // Main body
    const bodyGeo = new THREE.BoxGeometry(W, H * 0.85, L);
    bodyGeo.translate(0, H * 0.45, 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, paintMat);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Windows as a texture strip along sides
    const winTex = makeCanvasTexture(256, 64, (ctx, cw, ch) => {
      ctx.clearRect(0, 0, cw, ch);
      const winCount = Math.floor(L / 1.2);
      const winW = cw / (winCount + 1);
      for (let i = 1; i <= winCount; i++) {
        ctx.fillStyle = '#99ccee';
        ctx.fillRect(i * winW - winW * 0.35, ch * 0.15, winW * 0.7, ch * 0.6);
      }
    });
    const winStripMat = new THREE.MeshStandardMaterial({ map: winTex, transparent: true, opacity: 0.7 });
    const winStripGeo = new THREE.PlaneGeometry(L, H * 0.45);
    const ws1 = new THREE.Mesh(winStripGeo, winStripMat);
    ws1.position.set(W / 2 + 0.01, H * 0.55, 0);
    ws1.rotation.y = Math.PI / 2;
    group.add(ws1);
    const ws2 = new THREE.Mesh(winStripGeo, winStripMat);
    ws2.position.set(-W / 2 - 0.01, H * 0.55, 0);
    ws2.rotation.y = -Math.PI / 2;
    group.add(ws2);

    // Front windshield
    const windshieldGeo = new THREE.PlaneGeometry(W * 0.8, H * 0.4);
    const windshield = new THREE.Mesh(windshieldGeo, sharedMat.glass);
    windshield.position.set(0, H * 0.6, L / 2 + 0.01);
    group.add(windshield);

    // Dark parts (bumpers + wheels)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.05, H * 0.12, 0.2);
    const fb = bumperGeo.clone(); fb.translate(0, 0.2, L / 2 + 0.08); darkGeos.push(fb);
    const rb = bumperGeo.clone(); rb.translate(0, 0.2, -L / 2 - 0.08); darkGeos.push(rb);
    const wheelGeo = new THREE.TorusGeometry(0.34, 0.12, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    const wheelPositions = [
      { x: -W / 2, z: L * 0.35 }, { x: W / 2, z: L * 0.35 },
      { x: -W / 2, z: -L * 0.35 }, { x: W / 2, z: -L * 0.35 },
      { x: -W / 2, z: -L * 0.15 }, { x: W / 2, z: -L * 0.15 },
    ];
    wheelPositions.forEach(wp => {
      const wg = wheelGeo.clone(); wg.translate(wp.x, 0.38, wp.z); darkGeos.push(wg);
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Bus headlights
    const busHlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.18, H * 0.08);
      hlG.translate(side * W * 0.32, 0.35, L / 2 + 0.09);
      busHlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(busHlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.6 })));

    // Bus taillights
    const busTlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.16, H * 0.06);
      tlG.translate(side * W * 0.34, 0.35, -L / 2 - 0.09);
      busTlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(busTlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // "ROUTE XX" sign on front top
    const signGeo = new THREE.PlaneGeometry(W * 0.5, 0.4);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffaa00, emissiveIntensity: 0.4 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, H * 0.85, L / 2 + 0.02);
    group.add(sign);

  } else if (vt.name === 'firetruck') {
    // --- FIRE TRUCK ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.3, metalness: 0.5 });
    const chromeMat = sharedMat.chrome;

    // Cab (front)
    const cabW = W * 0.95, cabH = H * 0.7, cabL = L * 0.3;
    const cabGeo = new THREE.BoxGeometry(cabW, cabH, cabL);
    cabGeo.translate(0, cabH / 2 + 0.2, L / 2 - cabL / 2);
    const cab = new THREE.Mesh(cabGeo, paintMat);
    cab.castShadow = true;
    group.add(cab);

    // Cab windshield
    const wGeo = new THREE.PlaneGeometry(cabW * 0.8, cabH * 0.45);
    const wind = new THREE.Mesh(wGeo, sharedMat.glass);
    wind.position.set(0, cabH * 0.65 + 0.2, L / 2 + 0.01);
    group.add(wind);

    // Rear body
    const rearL = L * 0.6;
    const rearGeo = new THREE.BoxGeometry(W, H * 0.65, rearL);
    rearGeo.translate(0, H * 0.35 + 0.2, -rearL / 2 + L * 0.15);
    const rear = new THREE.Mesh(rearGeo, paintMat);
    rear.castShadow = true;
    group.add(rear);

    // Equipment compartments (side panels)
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5, metalness: 0.4 });
    const panelGeos = [];
    [1, -1].forEach(side => {
      const pg = new THREE.BoxGeometry(0.08, H * 0.3, rearL * 0.8);
      pg.translate(side * (W / 2 + 0.04), H * 0.2 + 0.2, -rearL / 2 + L * 0.15);
      panelGeos.push(pg);
    });
    group.add(new THREE.Mesh(mergeGeometries(panelGeos), panelMat));

    // Ladder on top
    const ladderGeos = [];
    const ladderMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3 });
    // Rails
    [0.3, -0.3].forEach(x => {
      const rg = new THREE.BoxGeometry(0.05, 0.05, rearL * 0.7);
      rg.translate(x, H * 0.7 + 0.2, -rearL / 2 + L * 0.15);
      ladderGeos.push(rg);
    });
    // Rungs
    for (let r = -3; r <= 3; r++) {
      const rg = new THREE.BoxGeometry(0.6, 0.04, 0.04);
      rg.translate(0, H * 0.7 + 0.2, r * 0.5 - rearL / 4 + L * 0.15);
      ladderGeos.push(rg);
    }
    group.add(new THREE.Mesh(mergeGeometries(ladderGeos), ladderMat));

    // Light bar on cab roof (red flashing lights)
    const lightBarMat1 = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const lightBarMat2 = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const lg1 = new THREE.SphereGeometry(0.12, 6, 5);
    lg1.translate(0.3, cabH + 0.35, L / 2 - cabL / 2);
    const lm1 = new THREE.Mesh(lg1, lightBarMat1);
    group.add(lm1);
    const lg2 = new THREE.SphereGeometry(0.12, 6, 5);
    lg2.translate(-0.3, cabH + 0.35, L / 2 - cabL / 2);
    const lm2 = new THREE.Mesh(lg2, lightBarMat2);
    group.add(lm2);
    const lbBase = new THREE.BoxGeometry(0.9, 0.08, 0.3);
    lbBase.translate(0, cabH + 0.2, L / 2 - cabL / 2);
    group.add(new THREE.Mesh(lbBase, sharedMat.dark));
    group.userData.emergencyLights = [
      { mesh: lm1, mat: lightBarMat1, color: 0xff0000 },
      { mesh: lm2, mat: lightBarMat2, color: 0xff0000 }
    ];

    // Wheels + bumpers (torus wheels)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.1, H * 0.12, 0.2);
    darkGeos.push(bumperGeo.clone().translate(0, 0.2, L / 2 + 0.08));
    darkGeos.push(bumperGeo.clone().translate(0, 0.2, -L / 2 + L * 0.15 - rearL / 2 - 0.08));
    const wheelGeo = new THREE.TorusGeometry(0.34, 0.12, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.38 }, { x: W / 2, z: L * 0.38 },
     { x: -W / 2, z: -L * 0.25 }, { x: W / 2, z: -L * 0.25 },
     { x: -W / 2, z: -L * 0.4 }, { x: W / 2, z: -L * 0.4 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.38, wp.z));
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Chrome front grille
    const grilleGeo = new THREE.PlaneGeometry(cabW * 0.6, cabH * 0.25);
    const grille = new THREE.Mesh(grilleGeo, chromeMat);
    grille.position.set(0, 0.45, L / 2 + 0.02);
    group.add(grille);

    // Firetruck headlights
    const ftHlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.2, H * 0.08);
      hlG.translate(side * W * 0.32, 0.35, L / 2 + 0.09);
      ftHlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ftHlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.6 })));

    // Firetruck taillights
    const ftTlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.16, H * 0.06);
      tlG.translate(side * W * 0.34, 0.35, -L / 2 + L * 0.15 - rearL / 2 - 0.09);
      ftTlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ftTlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Hub caps
    const ftHubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.38 }, { x: W / 2 + 0.01, z: L * 0.38 },
     { x: -W / 2 - 0.01, z: -L * 0.25 }, { x: W / 2 + 0.01, z: -L * 0.25 },
     { x: -W / 2 - 0.01, z: -L * 0.4 }, { x: W / 2 + 0.01, z: -L * 0.4 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.22, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.38, wp.z);
      ftHubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ftHubGeos), sharedMat.chrome));

  } else if (vt.name === 'icecream') {
    // --- ICE CREAM TRUCK ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xfff5ee, roughness: 0.4, metalness: 0.2 });

    // Main body (boxy van shape)
    const bodyGeo = new THREE.BoxGeometry(W, H * 0.85, L);
    bodyGeo.translate(0, H * 0.45, 0);
    const body = new THREE.Mesh(bodyGeo, paintMat);
    body.castShadow = true;
    group.add(body);

    // Colorful stripes (pink and mint)
    const stripeGeos = [];
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff69b4, roughness: 0.5 });
    const mintMat = new THREE.MeshStandardMaterial({ color: 0x3eb489, roughness: 0.5 });
    [1, -1].forEach(side => {
      // Bottom pink stripe
      const sg1 = new THREE.PlaneGeometry(L * 0.9, H * 0.15);
      sg1.translate(0, H * 0.2, 0);
      const m1 = new THREE.Mesh(sg1, pinkMat);
      m1.position.x = side * (W / 2 + 0.01);
      m1.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(m1);
      // Top mint stripe
      const sg2 = new THREE.PlaneGeometry(L * 0.9, H * 0.12);
      sg2.translate(0, H * 0.55, 0);
      const m2 = new THREE.Mesh(sg2, mintMat);
      m2.position.x = side * (W / 2 + 0.01);
      m2.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(m2);
    });

    // Serving window on one side
    const servGeo = new THREE.PlaneGeometry(L * 0.25, H * 0.3);
    const servMat = new THREE.MeshStandardMaterial({ color: 0x88ccee, transparent: true, opacity: 0.5 });
    const serv = new THREE.Mesh(servGeo, servMat);
    serv.position.set(W / 2 + 0.02, H * 0.45, -L * 0.15);
    serv.rotation.y = Math.PI / 2;
    group.add(serv);

    // Front windshield
    const wsGeo = new THREE.PlaneGeometry(W * 0.7, H * 0.35);
    const ws = new THREE.Mesh(wsGeo, sharedMat.glass);
    ws.position.set(0, H * 0.6, L / 2 + 0.01);
    group.add(ws);

    // Ice cream cone on top!
    const coneGeo = new THREE.ConeGeometry(0.25, 0.5, 8);
    coneGeo.translate(0, H * 0.85 + 0.25, 0);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xd2a054, roughness: 0.6 });
    group.add(new THREE.Mesh(coneGeo, coneMat));
    // Scoops
    const scoopColors = [0xff69b4, 0x8b4513, 0xfff8dc];
    scoopColors.forEach((sc, i) => {
      const sg = new THREE.SphereGeometry(0.22, 8, 6);
      sg.translate((i - 1) * 0.18, H * 0.85 + 0.6 + i * 0.12, 0);
      group.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: sc, roughness: 0.5 })));
    });

    // Wheels + bumpers (torus wheels)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.05, H * 0.1, 0.15);
    darkGeos.push(bumperGeo.clone().translate(0, 0.2, L / 2 + 0.05));
    darkGeos.push(bumperGeo.clone().translate(0, 0.2, -L / 2 - 0.05));
    const wheelGeo = new THREE.TorusGeometry(0.3, 0.12, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.3 }, { x: W / 2, z: L * 0.3 },
     { x: -W / 2, z: -L * 0.3 }, { x: W / 2, z: -L * 0.3 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.35, wp.z));
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Icecream headlights
    const icHlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.18, H * 0.08);
      hlG.translate(side * W * 0.32, 0.35, L / 2 + 0.06);
      icHlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(icHlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.6 })));

    // Icecream taillights
    const icTlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.14, H * 0.06);
      tlG.translate(side * W * 0.34, 0.35, -L / 2 - 0.06);
      icTlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(icTlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Hub caps
    const icHubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.3 }, { x: W / 2 + 0.01, z: L * 0.3 },
     { x: -W / 2 - 0.01, z: -L * 0.3 }, { x: W / 2 + 0.01, z: -L * 0.3 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.2, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.35, wp.z);
      icHubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(icHubGeos), sharedMat.chrome));

  } else if (vt.name === 'semi') {
    // --- SEMI TRUCK ---
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 });

    // Cab (front)
    const cabW = W * 0.95, cabH = H * 0.85, cabL = L * 0.25;
    const cabGeo = new THREE.BoxGeometry(cabW, cabH, cabL);
    cabGeo.translate(0, cabH / 2 + 0.2, L / 2 - cabL / 2);
    const cab = new THREE.Mesh(cabGeo, paintMat);
    cab.castShadow = true;
    group.add(cab);

    // Cab windshield
    const wGeo = new THREE.PlaneGeometry(cabW * 0.8, cabH * 0.45);
    const wind = new THREE.Mesh(wGeo, sharedMat.glass);
    wind.position.set(0, cabH * 0.7 + 0.2, L / 2 + 0.01);
    group.add(wind);

    // Trailer
    const trailerL = L * 0.7;
    const trailerGeo = new THREE.BoxGeometry(W, H * 0.9, trailerL);
    trailerGeo.translate(0, H * 0.45 + 0.1, -trailerL / 2 + L * 0.15);
    const trailerMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.2 });
    const trailer = new THREE.Mesh(trailerGeo, trailerMat);
    trailer.castShadow = true;
    group.add(trailer);

    // Dark parts (wheels, bumpers) — torus wheels
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.1, H * 0.15, 0.25);
    const fb2 = bumperGeo.clone(); fb2.translate(0, 0.25, L / 2 + 0.1); darkGeos.push(fb2);
    const rb2 = bumperGeo.clone(); rb2.translate(0, 0.25, -L / 2 + L * 0.15 - trailerL / 2 - 0.1); darkGeos.push(rb2);
    const wheelGeo = new THREE.TorusGeometry(0.36, 0.13, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    // Cab wheels
    [{ x: -W / 2, z: L * 0.4 }, { x: W / 2, z: L * 0.4 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.4, wp.z));
    });
    // Trailer wheels (dual axle)
    const trailerEnd = -trailerL / 2 + L * 0.15;
    [0, 1.2].forEach(offset => {
      [{ x: -W / 2 }, { x: W / 2 }].forEach(wp => {
        darkGeos.push(wheelGeo.clone().translate(wp.x, 0.4, trailerEnd - 0.5 - offset));
      });
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Exhaust pipes
    const pipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5);
    pipeGeo.translate(cabW / 2 + 0.08, cabH + 0.2, L / 2 - cabL / 2);
    const pipeGeo2 = pipeGeo.clone();
    pipeGeo2.translate(-cabW - 0.16, 0, 0);
    group.add(new THREE.Mesh(mergeGeometries([pipeGeo, pipeGeo2]), sharedMat.chrome));

    // Semi headlights
    const semiHlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.22, H * 0.1);
      hlG.translate(side * W * 0.3, 0.4, L / 2 + 0.11);
      semiHlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(semiHlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.6 })));

    // Semi taillights
    const semiTlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.18, H * 0.08);
      tlG.translate(side * W * 0.34, 0.4, -L / 2 + L * 0.15 - trailerL / 2 - 0.11);
      semiTlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(semiTlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Hub caps
    const semiHubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.4 }, { x: W / 2 + 0.01, z: L * 0.4 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.24, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.4, wp.z);
      semiHubGeos.push(hubG);
    });
    [0, 1.2].forEach(offset => {
      [{ x: -W / 2 - 0.01 }, { x: W / 2 + 0.01 }].forEach(wp => {
        const hubG = new THREE.CircleGeometry(0.24, 8);
        hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
        hubG.translate(wp.x, 0.4, trailerEnd - 0.5 - offset);
        semiHubGeos.push(hubG);
      });
    });
    group.add(new THREE.Mesh(mergeGeometries(semiHubGeos), sharedMat.chrome));

  } else if (vt.name === 'taxi') {
    // --- TAXI ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xf7d716, roughness: 0.3, metalness: 0.5 });

    const paintGeos = [];
    const bodyGeo = new THREE.BoxGeometry(W, H * 0.55, L);
    bodyGeo.translate(0, H * 0.3 + 0.3, 0);
    paintGeos.push(bodyGeo);
    // Hood slope
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, H * 0.1, L * 0.26);
    hoodGeo.translate(0, H * 0.58 + 0.28, L * 0.28);
    const hoodP = hoodGeo.getAttribute('position');
    for (let i = 0; i < hoodP.count; i++) { if (hoodP.getZ(i) > 0) hoodP.setY(i, hoodP.getY(i) - H * 0.06); }
    hoodGeo.computeVertexNormals();
    paintGeos.push(hoodGeo);
    // Fender arches
    [1, -1].forEach(side => {
      [L * 0.3, -L * 0.3].forEach(zOff => {
        const arch = new THREE.BoxGeometry(0.07, H * 0.14, 0.55);
        arch.translate(side * (W / 2 + 0.02), 0.38, zOff);
        paintGeos.push(arch);
      });
    });
    const bodyMesh = new THREE.Mesh(mergeGeometries(paintGeos), paintMat);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Cabin
    const cabinH = H * vt.cabinH;
    const cabinL = L * vt.cabinScale;
    const cabinW = W * 0.78;
    const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
    const cabin = new THREE.Mesh(cabinGeo, sharedMat.glass);
    cabin.position.y = H * 0.55 + cabinH / 2 + 0.3;
    cabin.position.z = L * vt.cabinZ;
    group.add(cabin);

    // TAXI sign on roof
    const signGeo = new THREE.BoxGeometry(0.5, 0.2, 0.25);
    const signMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffee66, emissiveIntensity: 0.6 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = H * 0.55 + cabinH + 0.4;
    sign.position.z = L * vt.cabinZ;
    group.add(sign);

    // Chrome grille + side mirrors + door handles
    const chromeGeos = [];
    const grilleG = new THREE.PlaneGeometry(W * 0.55, H * 0.16);
    grilleG.translate(0, 0.42, L / 2 + 0.08);
    chromeGeos.push(grilleG);
    [1, -1].forEach(side => {
      const mirG = new THREE.BoxGeometry(0.1, 0.07, 0.12);
      mirG.translate(side * (W / 2 + 0.07), H * 0.58 + 0.3, L * 0.16);
      chromeGeos.push(mirG);
      [0.06, -0.16].forEach(zFrac => {
        const dh = new THREE.BoxGeometry(0.02, 0.04, 0.1);
        dh.translate(side * (W / 2 + 0.01), H * 0.44 + 0.3, L * zFrac);
        chromeGeos.push(dh);
      });
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlights
    const hlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.2, H * 0.1);
      hlG.translate(side * W * 0.3, 0.46, L / 2 + 0.08);
      hlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 })));

    // Taillights
    const tlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.16, H * 0.08);
      tlG.translate(side * W * 0.32, 0.44, -L / 2 - 0.08);
      tlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(tlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Dark parts (bumpers + wheels + undercarriage)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.05, H * 0.15, 0.16);
    darkGeos.push(bumperGeo.clone().translate(0, 0.3, L / 2 + 0.05));
    darkGeos.push(bumperGeo.clone().translate(0, 0.3, -L / 2 - 0.05));
    const underG = new THREE.BoxGeometry(W * 0.8, 0.05, L * 0.5);
    darkGeos.push(underG.clone().translate(0, 0.12, 0));
    const wheelGeo = new THREE.TorusGeometry(0.24, 0.1, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.3 }, { x: W / 2, z: L * 0.3 },
     { x: -W / 2, z: -L * 0.3 }, { x: W / 2, z: -L * 0.3 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.28, wp.z));
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Hub caps
    const hubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.3 }, { x: W / 2 + 0.01, z: L * 0.3 },
     { x: -W / 2 - 0.01, z: -L * 0.3 }, { x: W / 2 + 0.01, z: -L * 0.3 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.15, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.28, wp.z);
      hubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hubGeos), sharedMat.chrome));

  } else if (vt.name === 'police') {
    // --- POLICE CAR ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3, metalness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // Body with hood slope
    const paintGeos = [];
    const bodyGeo = new THREE.BoxGeometry(W, H * 0.55, L);
    bodyGeo.translate(0, H * 0.3 + 0.3, 0);
    paintGeos.push(bodyGeo);
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, H * 0.1, L * 0.26);
    hoodGeo.translate(0, H * 0.58 + 0.28, L * 0.28);
    const hoodP = hoodGeo.getAttribute('position');
    for (let i = 0; i < hoodP.count; i++) { if (hoodP.getZ(i) > 0) hoodP.setY(i, hoodP.getY(i) - H * 0.06); }
    hoodGeo.computeVertexNormals();
    paintGeos.push(hoodGeo);
    [1, -1].forEach(side => {
      [L * 0.3, -L * 0.3].forEach(zOff => {
        const arch = new THREE.BoxGeometry(0.07, H * 0.14, 0.55);
        arch.translate(side * (W / 2 + 0.02), 0.38, zOff);
        paintGeos.push(arch);
      });
    });
    const bodyMesh = new THREE.Mesh(mergeGeometries(paintGeos), paintMat);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // White door panels
    [1, -1].forEach(side => {
      const dg = new THREE.PlaneGeometry(L * 0.4, H * 0.3);
      const dm = new THREE.Mesh(dg, whiteMat);
      dm.position.set(side * (W / 2 + 0.01), H * 0.35, -L * 0.05);
      dm.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(dm);
    });

    // Cabin
    const cabinH = H * vt.cabinH;
    const cabinL = L * vt.cabinScale;
    const cabinW = W * 0.78;
    const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
    const cabin = new THREE.Mesh(cabinGeo, sharedMat.glass);
    cabin.position.y = H * 0.55 + cabinH / 2 + 0.3;
    cabin.position.z = L * vt.cabinZ;
    group.add(cabin);

    // Light bar on roof (red and blue)
    const lbBase = new THREE.BoxGeometry(W * 0.6, 0.08, 0.35);
    lbBase.translate(0, H * 0.55 + cabinH + 0.35, L * vt.cabinZ);
    group.add(new THREE.Mesh(lbBase, sharedMat.dark));
    const redLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.9 });
    const redLight = new THREE.SphereGeometry(0.1, 6, 5);
    redLight.translate(-0.2, H * 0.55 + cabinH + 0.42, L * vt.cabinZ);
    const rlMesh = new THREE.Mesh(redLight, redLightMat);
    group.add(rlMesh);
    const blueLightMat = new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 0.9 });
    const blueLight = new THREE.SphereGeometry(0.1, 6, 5);
    blueLight.translate(0.2, H * 0.55 + cabinH + 0.42, L * vt.cabinZ);
    const blMesh = new THREE.Mesh(blueLight, blueLightMat);
    group.add(blMesh);
    group.userData.emergencyLights = [
      { mesh: rlMesh, mat: redLightMat, color: 0xff0000 },
      { mesh: blMesh, mat: blueLightMat, color: 0x0044ff }
    ];

    // Chrome grille + side mirrors
    const chromeGeos = [];
    const grilleG = new THREE.PlaneGeometry(W * 0.55, H * 0.16);
    grilleG.translate(0, 0.42, L / 2 + 0.08);
    chromeGeos.push(grilleG);
    [1, -1].forEach(side => {
      const mirG = new THREE.BoxGeometry(0.1, 0.07, 0.12);
      mirG.translate(side * (W / 2 + 0.07), H * 0.58 + 0.3, L * 0.16);
      chromeGeos.push(mirG);
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlights
    const hlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.2, H * 0.1);
      hlG.translate(side * W * 0.3, 0.46, L / 2 + 0.08);
      hlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 })));

    // Taillights
    const tlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.16, H * 0.08);
      tlG.translate(side * W * 0.32, 0.44, -L / 2 - 0.08);
      tlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(tlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Dark parts (bumpers + wheels + push bar + undercarriage)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.05, H * 0.15, 0.16);
    darkGeos.push(bumperGeo.clone().translate(0, 0.3, L / 2 + 0.05));
    darkGeos.push(bumperGeo.clone().translate(0, 0.3, -L / 2 - 0.05));
    // Push bar
    const pushBar = new THREE.BoxGeometry(W * 0.7, H * 0.25, 0.06);
    darkGeos.push(pushBar.clone().translate(0, 0.35, L / 2 + 0.15));
    const underG = new THREE.BoxGeometry(W * 0.8, 0.05, L * 0.5);
    darkGeos.push(underG.clone().translate(0, 0.12, 0));
    const wheelGeo = new THREE.TorusGeometry(0.24, 0.1, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.3 }, { x: W / 2, z: L * 0.3 },
     { x: -W / 2, z: -L * 0.3 }, { x: W / 2, z: -L * 0.3 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.28, wp.z));
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Hub caps
    const hubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.3 }, { x: W / 2 + 0.01, z: L * 0.3 },
     { x: -W / 2 - 0.01, z: -L * 0.3 }, { x: W / 2 + 0.01, z: -L * 0.3 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.15, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.28, wp.z);
      hubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hubGeos), sharedMat.chrome));

  } else if (vt.name === 'pickup') {
    // --- PICKUP TRUCK ---
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });

    // Cab body (front half) with hood slope
    const cabL = L * 0.5;
    const paintGeos = [];
    const cabGeo = new THREE.BoxGeometry(W, H * 0.55, cabL);
    cabGeo.translate(0, H * 0.3 + 0.3, L / 2 - cabL / 2);
    paintGeos.push(cabGeo);
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, H * 0.1, cabL * 0.45);
    hoodGeo.translate(0, H * 0.58 + 0.28, L / 2 - cabL * 0.1);
    const hoodP = hoodGeo.getAttribute('position');
    for (let i = 0; i < hoodP.count; i++) { if (hoodP.getZ(i) > 0) hoodP.setY(i, hoodP.getY(i) - H * 0.06); }
    hoodGeo.computeVertexNormals();
    paintGeos.push(hoodGeo);
    // Fender arches on cab
    [1, -1].forEach(side => {
      const arch = new THREE.BoxGeometry(0.08, H * 0.15, 0.6);
      arch.translate(side * (W / 2 + 0.02), 0.38, L / 2 - cabL * 0.65);
      paintGeos.push(arch);
    });
    const cabBody = new THREE.Mesh(mergeGeometries(paintGeos), paintMat);
    cabBody.castShadow = true;
    group.add(cabBody);

    // Cabin
    const cabinH = H * vt.cabinH;
    const cabinL2 = cabL * 0.65;
    const cabinW = W * 0.78;
    const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL2);
    const cabin = new THREE.Mesh(cabinGeo, sharedMat.glass);
    cabin.position.y = H * 0.55 + cabinH / 2 + 0.3;
    cabin.position.z = L / 2 - cabL * 0.45;
    group.add(cabin);

    // Truck bed (open back)
    const bedL = L * 0.48;
    const bedGeos = [];
    const floorGeo = new THREE.BoxGeometry(W * 0.95, 0.08, bedL);
    floorGeo.translate(0, H * 0.28, -bedL / 2 + L * 0.02);
    bedGeos.push(floorGeo);
    [1, -1].forEach(side => {
      const wg = new THREE.BoxGeometry(0.08, H * 0.3, bedL);
      wg.translate(side * (W * 0.47), H * 0.42, -bedL / 2 + L * 0.02);
      bedGeos.push(wg);
    });
    const tgGeo = new THREE.BoxGeometry(W * 0.95, H * 0.3, 0.08);
    tgGeo.translate(0, H * 0.42, -bedL + L * 0.02);
    bedGeos.push(tgGeo);
    group.add(new THREE.Mesh(mergeGeometries(bedGeos), paintMat));

    // Chrome grille + side mirrors
    const chromeGeos = [];
    const grilleG = new THREE.PlaneGeometry(W * 0.6, H * 0.18);
    grilleG.translate(0, 0.42, L / 2 + 0.08);
    chromeGeos.push(grilleG);
    [1, -1].forEach(side => {
      const mirG = new THREE.BoxGeometry(0.12, 0.08, 0.14);
      mirG.translate(side * (W / 2 + 0.08), H * 0.6 + 0.3, L / 2 - cabL * 0.35);
      chromeGeos.push(mirG);
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlights
    const hlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.22, H * 0.12);
      hlG.translate(side * W * 0.3, 0.46, L / 2 + 0.08);
      hlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 })));

    // Taillights
    const tlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.18, H * 0.1);
      tlG.translate(side * W * 0.34, 0.42, -L / 2 - 0.08);
      tlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(tlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Dark parts (bumpers + wheels + undercarriage)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.08, H * 0.18, 0.18);
    darkGeos.push(bumperGeo.clone().translate(0, 0.32, L / 2 + 0.06));
    darkGeos.push(bumperGeo.clone().translate(0, 0.32, -L / 2 - 0.06));
    const underG = new THREE.BoxGeometry(W * 0.75, 0.06, L * 0.5);
    darkGeos.push(underG.clone().translate(0, 0.12, L * 0.05));
    const wheelGeo = new THREE.TorusGeometry(0.28, 0.12, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.32 }, { x: W / 2, z: L * 0.32 },
     { x: -W / 2, z: -L * 0.28 }, { x: W / 2, z: -L * 0.28 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.32, wp.z));
    });
    // Rear fender arches
    [1, -1].forEach(side => {
      const arch = new THREE.BoxGeometry(0.08, H * 0.16, 0.65);
      arch.translate(side * (W / 2 + 0.02), 0.4, -L * 0.28);
      darkGeos.push(arch);
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Hub caps
    const hubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.32 }, { x: W / 2 + 0.01, z: L * 0.32 },
     { x: -W / 2 - 0.01, z: -L * 0.28 }, { x: W / 2 + 0.01, z: -L * 0.28 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.18, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.32, wp.z);
      hubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hubGeos), sharedMat.chrome));

  } else if (vt.name === 'towtruck') {
    // --- TOW TRUCK ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.35, metalness: 0.5 });

    // Cab body (front half) with hood slope
    const cabL = L * 0.5;
    const paintGeos = [];
    const cabGeo = new THREE.BoxGeometry(W, H * 0.55, cabL);
    cabGeo.translate(0, H * 0.3 + 0.3, L / 2 - cabL / 2);
    paintGeos.push(cabGeo);
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, H * 0.1, cabL * 0.45);
    hoodGeo.translate(0, H * 0.58 + 0.28, L / 2 - cabL * 0.1);
    const hoodP = hoodGeo.getAttribute('position');
    for (let i = 0; i < hoodP.count; i++) { if (hoodP.getZ(i) > 0) hoodP.setY(i, hoodP.getY(i) - H * 0.06); }
    hoodGeo.computeVertexNormals();
    paintGeos.push(hoodGeo);
    [1, -1].forEach(side => {
      const arch = new THREE.BoxGeometry(0.08, H * 0.15, 0.6);
      arch.translate(side * (W / 2 + 0.02), 0.38, L / 2 - cabL * 0.65);
      paintGeos.push(arch);
    });
    const cabBody = new THREE.Mesh(mergeGeometries(paintGeos), paintMat);
    cabBody.castShadow = true;
    group.add(cabBody);

    // Cabin (glass)
    const cabinH2 = H * vt.cabinH;
    const cabinL3 = cabL * 0.65;
    const cabinW2 = W * 0.78;
    const cabinGeo = new THREE.BoxGeometry(cabinW2, cabinH2, cabinL3);
    const cabin = new THREE.Mesh(cabinGeo, sharedMat.glass);
    cabin.position.y = H * 0.55 + cabinH2 / 2 + 0.3;
    cabin.position.z = L / 2 - cabL * 0.45;
    group.add(cabin);

    // Flatbed (rear)
    const bedL = L * 0.48;
    const bedGeos = [];
    const floorGeo = new THREE.BoxGeometry(W * 0.95, 0.1, bedL);
    floorGeo.translate(0, H * 0.28, -bedL / 2 + L * 0.02);
    bedGeos.push(floorGeo);
    [1, -1].forEach(side => {
      const wg = new THREE.BoxGeometry(0.08, H * 0.22, bedL);
      wg.translate(side * (W * 0.47), H * 0.38, -bedL / 2 + L * 0.02);
      bedGeos.push(wg);
    });
    group.add(new THREE.Mesh(mergeGeometries(bedGeos), paintMat));

    // Boom arm (tow boom) — angled cylinder on rear
    const boomMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.6 });
    const boomGeos = [];
    // Main boom post (vertical on rear of cab)
    const postGeo = new THREE.BoxGeometry(0.15, H * 0.5, 0.15);
    postGeo.translate(0, H * 0.55 + 0.3, L * 0.02);
    boomGeos.push(postGeo);
    // Boom arm (angled back)
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, bedL * 0.8);
    armGeo.translate(0, H * 0.75 + 0.3, -bedL * 0.35 + L * 0.02);
    boomGeos.push(armGeo);
    // Hook at end
    const hookGeo = new THREE.TorusGeometry(0.12, 0.03, 6, 8, Math.PI);
    hookGeo.rotateX(Math.PI / 2);
    hookGeo.translate(0, H * 0.7 + 0.3, -bedL + L * 0.05);
    boomGeos.push(hookGeo);
    // Chain (thin cylinder from boom endpoint down)
    const chainGeo = new THREE.CylinderGeometry(0.02, 0.02, H * 0.4, 4);
    chainGeo.translate(0, H * 0.55 + 0.3, -bedL + L * 0.05);
    boomGeos.push(chainGeo);
    group.add(new THREE.Mesh(mergeGeometries(boomGeos), boomMat));

    // Amber warning lights on cab roof
    const amberMat1 = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.9 });
    const amberMat2 = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.9 });
    const lbBase = new THREE.BoxGeometry(W * 0.6, 0.08, 0.3);
    lbBase.translate(0, H * 0.55 + cabinH2 + 0.35, L / 2 - cabL * 0.45);
    group.add(new THREE.Mesh(lbBase, sharedMat.dark));
    const al1Geo = new THREE.SphereGeometry(0.1, 6, 5);
    al1Geo.translate(-0.2, H * 0.55 + cabinH2 + 0.42, L / 2 - cabL * 0.45);
    const al1 = new THREE.Mesh(al1Geo, amberMat1);
    group.add(al1);
    const al2Geo = new THREE.SphereGeometry(0.1, 6, 5);
    al2Geo.translate(0.2, H * 0.55 + cabinH2 + 0.42, L / 2 - cabL * 0.45);
    const al2 = new THREE.Mesh(al2Geo, amberMat2);
    group.add(al2);
    group.userData.emergencyLights = [
      { mesh: al1, mat: amberMat1, color: 0xff8800 },
      { mesh: al2, mat: amberMat2, color: 0xff8800 }
    ];

    // Chrome grille + mirrors
    const chromeGeos = [];
    const grilleG = new THREE.PlaneGeometry(W * 0.6, H * 0.18);
    grilleG.translate(0, 0.42, L / 2 + 0.08);
    chromeGeos.push(grilleG);
    [1, -1].forEach(side => {
      const mirG = new THREE.BoxGeometry(0.12, 0.08, 0.14);
      mirG.translate(side * (W / 2 + 0.08), H * 0.6 + 0.3, L / 2 - cabL * 0.35);
      chromeGeos.push(mirG);
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlights
    const hlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.22, H * 0.12);
      hlG.translate(side * W * 0.3, 0.46, L / 2 + 0.08);
      hlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(hlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 })));

    // Taillights
    const tlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.18, H * 0.1);
      tlG.translate(side * W * 0.34, 0.42, -L / 2 - 0.08);
      tlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(tlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Dark parts (bumpers + wheels)
    const darkGeos = [];
    const bumperGeo = new THREE.BoxGeometry(W + 0.08, H * 0.18, 0.18);
    darkGeos.push(bumperGeo.clone().translate(0, 0.32, L / 2 + 0.06));
    darkGeos.push(bumperGeo.clone().translate(0, 0.32, -L / 2 - 0.06));
    const wheelGeo = new THREE.TorusGeometry(0.28, 0.12, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.32 }, { x: W / 2, z: L * 0.32 },
     { x: -W / 2, z: -L * 0.28 }, { x: W / 2, z: -L * 0.28 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.32, wp.z));
    });
    [1, -1].forEach(side => {
      const arch = new THREE.BoxGeometry(0.08, H * 0.16, 0.65);
      arch.translate(side * (W / 2 + 0.02), 0.4, -L * 0.28);
      darkGeos.push(arch);
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Hub caps
    const towHubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.32 }, { x: W / 2 + 0.01, z: L * 0.32 },
     { x: -W / 2 - 0.01, z: -L * 0.28 }, { x: W / 2 + 0.01, z: -L * 0.28 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.18, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.32, wp.z);
      towHubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(towHubGeos), sharedMat.chrome));

  } else if (vt.name === 'ambulance') {
    // --- AMBULANCE ---
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 });

    // Cab (front)
    const cabW = W * 0.95, cabH = H * 0.65, cabL = L * 0.3;
    const cabGeo = new THREE.BoxGeometry(cabW, cabH, cabL);
    cabGeo.translate(0, cabH / 2 + 0.2, L / 2 - cabL / 2);
    const cab = new THREE.Mesh(cabGeo, paintMat);
    cab.castShadow = true;
    group.add(cab);

    // Windshield
    const wGeo = new THREE.PlaneGeometry(cabW * 0.8, cabH * 0.5);
    const wind = new THREE.Mesh(wGeo, sharedMat.glass);
    wind.position.set(0, cabH * 0.6 + 0.2, L / 2 + 0.01);
    group.add(wind);

    // Rear box (taller)
    const rearL = L * 0.6;
    const boxH = H * 0.85;
    const rearGeo = new THREE.BoxGeometry(W, boxH, rearL);
    rearGeo.translate(0, boxH / 2 + 0.2, -rearL / 2 + L * 0.15);
    const rear = new THREE.Mesh(rearGeo, paintMat);
    rear.castShadow = true;
    group.add(rear);

    // Red stripe along sides
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.5 });
    [1, -1].forEach(side => {
      const sg = new THREE.PlaneGeometry(rearL * 0.85, boxH * 0.15);
      const sm = new THREE.Mesh(sg, stripeMat);
      sm.position.set(side * (W / 2 + 0.01), boxH * 0.45 + 0.2, -rearL / 2 + L * 0.15);
      sm.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(sm);
    });

    // Red cross on rear
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 0.3 });
    const crossV = new THREE.PlaneGeometry(0.2, 0.8);
    const crossH = new THREE.PlaneGeometry(0.8, 0.2);
    const cv = new THREE.Mesh(crossV, crossMat);
    cv.position.set(0, boxH * 0.55 + 0.2, -rearL + L * 0.15 - 0.01);
    cv.rotation.y = Math.PI;
    group.add(cv);
    const ch = new THREE.Mesh(crossH, crossMat);
    ch.position.set(0, boxH * 0.55 + 0.2, -rearL + L * 0.15 - 0.01);
    ch.rotation.y = Math.PI;
    group.add(ch);

    // Light bar on top — red/blue flashing (stored for animation)
    const lightBarBase = new THREE.BoxGeometry(0.9, 0.08, 0.3);
    lightBarBase.translate(0, cabH + 0.25, L / 2 - cabL / 2);
    group.add(new THREE.Mesh(lightBarBase, sharedMat.dark));

    const redLightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.0 });
    const blueLightMat = new THREE.MeshStandardMaterial({ color: 0x2222ff, emissive: 0x0000ff, emissiveIntensity: 1.0 });
    const rlGeo = new THREE.SphereGeometry(0.12, 6, 5);
    rlGeo.translate(-0.3, cabH + 0.35, L / 2 - cabL / 2);
    const rlMesh = new THREE.Mesh(rlGeo, redLightMat);
    group.add(rlMesh);
    const blGeo = new THREE.SphereGeometry(0.12, 6, 5);
    blGeo.translate(0.3, cabH + 0.35, L / 2 - cabL / 2);
    const blMesh = new THREE.Mesh(blGeo, blueLightMat);
    group.add(blMesh);

    // Store light meshes for flashing animation
    group.userData.emergencyLights = [
      { mesh: rlMesh, mat: redLightMat, color: 0xff0000 },
      { mesh: blMesh, mat: blueLightMat, color: 0x0000ff }
    ];

    // Wheels + bumpers (torus wheels + hub caps)
    const darkGeos2 = [];
    const bumperGeo2 = new THREE.BoxGeometry(W + 0.05, H * 0.12, 0.2);
    darkGeos2.push(bumperGeo2.clone().translate(0, 0.2, L / 2 + 0.08));
    darkGeos2.push(bumperGeo2.clone().translate(0, 0.2, -rearL + L * 0.15 - 0.08));
    const wheelGeo2 = new THREE.TorusGeometry(0.3, 0.12, 8, 12);
    wheelGeo2.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.35 }, { x: W / 2, z: L * 0.35 },
     { x: -W / 2, z: -L * 0.25 }, { x: W / 2, z: -L * 0.25 }].forEach(wp => {
      darkGeos2.push(wheelGeo2.clone().translate(wp.x, 0.35, wp.z));
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos2), sharedMat.dark));

    // Ambulance headlights
    const ambHlGeos = [];
    [1, -1].forEach(side => {
      const hlG = new THREE.PlaneGeometry(W * 0.2, H * 0.1);
      hlG.translate(side * W * 0.32, 0.35, L / 2 + 0.09);
      ambHlGeos.push(hlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ambHlGeos), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7 })));

    // Ambulance taillights
    const ambTlGeos = [];
    [1, -1].forEach(side => {
      const tlG = new THREE.PlaneGeometry(W * 0.16, H * 0.08);
      tlG.translate(side * W * 0.34, 0.35, -rearL + L * 0.15 - 0.09);
      ambTlGeos.push(tlG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ambTlGeos), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 })));

    // Hub caps
    const ambHubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.35 }, { x: W / 2 + 0.01, z: L * 0.35 },
     { x: -W / 2 - 0.01, z: -L * 0.25 }, { x: W / 2 + 0.01, z: -L * 0.25 }].forEach(wp => {
      const hubG = new THREE.CircleGeometry(0.2, 8);
      hubG.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubG.translate(wp.x, 0.35, wp.z);
      ambHubGeos.push(hubG);
    });
    group.add(new THREE.Mesh(mergeGeometries(ambHubGeos), sharedMat.chrome));

  } else {
    // --- STANDARD CAR (sedan / suv / hatchback) ---
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const paintMat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.65 });

    const paintGeos = [];
    // Main body — lower section
    const bodyGeo = new THREE.BoxGeometry(W, H * 0.55, L);
    bodyGeo.translate(0, H * 0.3 + 0.3, 0);
    paintGeos.push(bodyGeo);
    // Hood slope — tapered front wedge
    const hoodGeo = new THREE.BoxGeometry(W * 0.92, H * 0.12, L * 0.28);
    hoodGeo.translate(0, H * 0.6 + 0.28, L * 0.28);
    // Slope the front edge of the hood down
    const hoodPos = hoodGeo.getAttribute('position');
    for (let i = 0; i < hoodPos.count; i++) {
      if (hoodPos.getZ(i) > 0) hoodPos.setY(i, hoodPos.getY(i) - H * 0.08);
    }
    hoodGeo.computeVertexNormals();
    paintGeos.push(hoodGeo);
    // Trunk slope — tapered rear
    const trunkGeo = new THREE.BoxGeometry(W * 0.92, H * 0.1, L * 0.22);
    trunkGeo.translate(0, H * 0.58 + 0.28, -L * 0.3);
    const trunkPos = trunkGeo.getAttribute('position');
    for (let i = 0; i < trunkPos.count; i++) {
      if (trunkPos.getZ(i) < 0) trunkPos.setY(i, trunkPos.getY(i) - H * 0.04);
    }
    trunkGeo.computeVertexNormals();
    paintGeos.push(trunkGeo);
    // Fender arches — subtle bulges over wheels
    [1, -1].forEach(side => {
      [L * 0.3, -L * 0.3].forEach(zOff => {
        const arch = new THREE.BoxGeometry(0.08, H * 0.15, 0.6);
        arch.translate(side * (W / 2 + 0.02), 0.38, zOff);
        paintGeos.push(arch);
      });
    });
    const bodyMesh = new THREE.Mesh(mergeGeometries(paintGeos), paintMat);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Cabin — with tapered top for sleek look
    const cabinH = H * vt.cabinH;
    const cabinL = L * vt.cabinScale;
    const cabinW = W * 0.78;
    const cabinGeo = new THREE.BoxGeometry(cabinW, cabinH, cabinL);
    const cabinPos = cabinGeo.getAttribute('position');
    for (let i = 0; i < cabinPos.count; i++) {
      if (cabinPos.getY(i) > 0) {
        cabinPos.setX(i, cabinPos.getX(i) * 0.82);
        cabinPos.setZ(i, cabinPos.getZ(i) * 0.88);
      }
    }
    cabinGeo.computeVertexNormals();
    const cabin = new THREE.Mesh(cabinGeo, sharedMat.glass);
    cabin.position.y = H * 0.55 + cabinH / 2 + 0.3;
    cabin.position.z = L * vt.cabinZ;
    group.add(cabin);

    // Chrome/detail parts merged — grille, mirrors, door handles
    const chromeGeos = [];
    // Front grille
    const grilleGeo = new THREE.PlaneGeometry(W * 0.6, H * 0.18);
    grilleGeo.translate(0, 0.42, L / 2 + 0.08);
    chromeGeos.push(grilleGeo);
    // Side mirrors
    [1, -1].forEach(side => {
      const mirrorGeo = new THREE.BoxGeometry(0.12, 0.08, 0.14);
      mirrorGeo.translate(side * (W / 2 + 0.08), H * 0.6 + 0.3, L * 0.18);
      chromeGeos.push(mirrorGeo);
    });
    // Door handles
    [1, -1].forEach(side => {
      [0.08, -0.18].forEach(zFrac => {
        const dh = new THREE.BoxGeometry(0.02, 0.04, 0.12);
        dh.translate(side * (W / 2 + 0.01), H * 0.45 + 0.3, L * zFrac);
        chromeGeos.push(dh);
      });
    });
    group.add(new THREE.Mesh(mergeGeometries(chromeGeos), sharedMat.chrome));

    // Headlights (front, emissive warm white)
    const headlightGeos = [];
    [1, -1].forEach(side => {
      const hlGeo = new THREE.PlaneGeometry(W * 0.2, H * 0.12);
      hlGeo.translate(side * W * 0.3, 0.48, L / 2 + 0.08);
      headlightGeos.push(hlGeo);
    });
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.7, roughness: 0.2 });
    group.add(new THREE.Mesh(mergeGeometries(headlightGeos), headlightMat));

    // Taillights (rear, emissive red)
    const taillightGeos = [];
    [1, -1].forEach(side => {
      const tlGeo = new THREE.PlaneGeometry(W * 0.18, H * 0.1);
      tlGeo.translate(side * W * 0.32, 0.45, -L / 2 - 0.08);
      taillightGeos.push(tlGeo);
    });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5, roughness: 0.3 });
    group.add(new THREE.Mesh(mergeGeometries(taillightGeos), taillightMat));

    // Dark parts (bumpers + wheels + wheel wells)
    const darkGeos = [];
    // Front bumper with lip
    const bumperF = new THREE.BoxGeometry(W + 0.05, H * 0.15, 0.18);
    darkGeos.push(bumperF.clone().translate(0, 0.3, L / 2 + 0.06));
    const lipF = new THREE.BoxGeometry(W * 0.85, 0.04, 0.08);
    darkGeos.push(lipF.clone().translate(0, 0.2, L / 2 + 0.12));
    // Rear bumper
    const bumperR = new THREE.BoxGeometry(W + 0.05, H * 0.15, 0.18);
    darkGeos.push(bumperR.clone().translate(0, 0.3, -L / 2 - 0.06));
    // Undercarriage
    const underGeo = new THREE.BoxGeometry(W * 0.85, 0.06, L * 0.55);
    darkGeos.push(underGeo.clone().translate(0, 0.12, 0));
    // Wheels — torus for tire shape
    const wheelGeo = new THREE.TorusGeometry(0.24, 0.1, 8, 12);
    wheelGeo.rotateY(Math.PI / 2);
    [{ x: -W / 2, z: L * 0.3 }, { x: W / 2, z: L * 0.3 },
     { x: -W / 2, z: -L * 0.3 }, { x: W / 2, z: -L * 0.3 }].forEach(wp => {
      darkGeos.push(wheelGeo.clone().translate(wp.x, 0.28, wp.z));
    });
    // Wheel well arches
    [{ z: L * 0.3 }, { z: -L * 0.3 }].forEach(wp => {
      [1, -1].forEach(side => {
        const archG = new THREE.BoxGeometry(0.06, 0.3, 0.55);
        archG.translate(side * (W / 2 + 0.01), 0.38, wp.z);
        darkGeos.push(archG);
      });
    });
    group.add(new THREE.Mesh(mergeGeometries(darkGeos), sharedMat.dark));

    // Hub caps (silver circles on wheel faces)
    const hubGeos = [];
    [{ x: -W / 2 - 0.01, z: L * 0.3 }, { x: W / 2 + 0.01, z: L * 0.3 },
     { x: -W / 2 - 0.01, z: -L * 0.3 }, { x: W / 2 + 0.01, z: -L * 0.3 }].forEach(wp => {
      const hubGeo = new THREE.CircleGeometry(0.16, 8);
      hubGeo.rotateY(wp.x > 0 ? Math.PI / 2 : -Math.PI / 2);
      hubGeo.translate(wp.x, 0.28, wp.z);
      hubGeos.push(hubGeo);
    });
    group.add(new THREE.Mesh(mergeGeometries(hubGeos), sharedMat.chrome));
  }

  // Shadow disc sized to vehicle
  const shadowGeo = new THREE.PlaneGeometry(W + 0.3, L + 0.3);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowDisc = new THREE.Mesh(shadowGeo, sharedMat.shadow);
  shadowDisc.position.y = 0.02;
  group.add(shadowDisc);

  // Position at spawn point
  if (dir.axis === 'z') {
    group.position.x = dir.laneOffset;
    group.position.z = dir.sign * SPAWN_DIST;
  } else {
    group.position.z = dir.laneOffset;
    group.position.x = dir.sign * SPAWN_DIST;
  }
  group.position.y = 0;
  group.rotation.y = dir.angle;
  state.scene.add(group);

  const carObj = {
    mesh: group,
    direction: directionKey,
    dirData: dir,
    speed: state.carSpeed * vt.speedMult * (0.9 + Math.random() * 0.2),
    state: 'moving',
    distanceFromCenter: SPAWN_DIST,
    cleared: false,
    vehicleLength: L,
    vehicleWidth: W,
    vehicleType: vt.name,
    vt: vt,
    isPedestrian: false,
    isEmergency: !!forceType,
    busStopState: null, // null | 'approaching' | 'stopped'
    busStopTimer: 0,
    busPassengers: [],
    waitTime: 0,
    accelTimer: 1,
    turnRight: false,
    turnProgress: undefined,
    turnComplete: false,
    stuckTimer: 0,
    lastPos: null,
    blinkerMat: null,
    brakeLightMeshes: null
  };

  // Randomly flag some cars for right turn (not emergency, not large vehicles)
  if (!forceType && !NO_TURN_TYPES.includes(vt.name) && Math.random() < RIGHT_TURN_CHANCE) {
    carObj.turnRight = true;
    // Add right-side blinker indicators (amber)
    const blinkerMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0, roughness: 0.3
    });
    const blinkerGeos = [];
    // Front right blinker
    const bfGeo = new THREE.PlaneGeometry(W * 0.12, H * 0.08);
    bfGeo.translate(W / 2 + 0.06, 0.45, L / 2 + 0.02);
    bfGeo.rotateY(Math.PI / 2);
    blinkerGeos.push(bfGeo);
    // Rear right blinker
    const brGeo = new THREE.PlaneGeometry(W * 0.12, H * 0.08);
    brGeo.translate(W / 2 + 0.06, 0.45, -L / 2 - 0.02);
    brGeo.rotateY(Math.PI / 2);
    blinkerGeos.push(brGeo);
    if (blinkerGeos.length) {
      group.add(new THREE.Mesh(mergeGeometries(blinkerGeos), blinkerMat));
    }
    carObj.blinkerMat = blinkerMat;
  }

  return carObj;
}

// ============================================================
// SPAWNING & UPDATE
// ============================================================

export function spawnEmergencyVehicle() {
  if (state.emergencyActive) return;
  const availableDirs = Object.keys(DIRECTIONS);
  const dirKey = availableDirs[Math.floor(Math.random() * availableDirs.length)];
  const eType = EMERGENCY_TYPES[Math.floor(Math.random() * EMERGENCY_TYPES.length)];
  const car = createVehicle(dirKey, eType);
  car.speed = state.carSpeed * eType.speedMult; // consistent speed, no random variance
  state.cars.push(car);
  if (state.isNightMode) updateCarNightLights(car, true);
  state.emergencyActive = true;

  // Show warning
  if (!emergencyWarningEl) emergencyWarningEl = document.getElementById('emergencyWarning');
  emergencyWarningEl.classList.remove('hidden');

  startSiren();
}

export function spawnCars() {
  const availableDirs = Object.keys(DIRECTIONS);
  const count = Math.min(state.maxCarsPerSpawn, 1 + Math.floor(Math.random() * state.maxCarsPerSpawn));

  const shuffled = availableDirs.sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const dirKey = shuffled[i % shuffled.length];

    // Don't spawn if there's already a car very close to the spawn point in this direction
    const tooClose = state.cars.some(c =>
      c.direction === dirKey && !c.isPedestrian &&
      c.distanceFromCenter > SPAWN_DIST - (c.vehicleLength || CAR_LENGTH) * 2
    );
    if (tooClose) continue;

    const car = createVehicle(dirKey);
    state.cars.push(car);
    if (state.isNightMode) updateCarNightLights(car, true);
  }

  // Occasionally spawn a pedestrian (not in wave 1)
  if (state.wave >= 2 && Math.random() < 0.12 && state.gameRunning) {
    const ped = createPedestrian();
    if (ped) state.cars.push(ped);
  }
}

export function updateCars(dt) {
  const toRemove = [];

  for (const car of state.cars) {
    if (car.state === 'crashed') continue;

    // --- PEDESTRIAN UPDATE ---
    if (car.isPedestrian) {
      const ped = car;
      const crossAxis = ped.crossAxis; // 'x' or 'z'
      const sidewalkAxis = ped.sidewalkAxis; // perpendicular to crossAxis

      // Walking bob animation helper
      const doBob = () => {
        ped.pedBob += dt * 8;
        ped.mesh.position.y = 0.2 + Math.abs(Math.sin(ped.pedBob)) * 0.06;
      };

      // STATE: approaching — walking along sidewalk toward crosswalk
      if (ped.state === 'approaching') {
        const moveAmount = ped.speed * dt;
        if (sidewalkAxis === 'z') {
          ped.mesh.position.z -= ped.approachSign * moveAmount;
        } else {
          ped.mesh.position.x -= ped.approachSign * moveAmount;
        }
        doBob();

        // Check if we've reached the crosswalk position
        const swPos = sidewalkAxis === 'z' ? ped.mesh.position.z : ped.mesh.position.x;
        const targetPos = ped.crossFixed;
        const distToTarget = (targetPos - swPos) * (-ped.approachSign);
        if (distToTarget <= 0.1) {
          // Snap to crosswalk position and switch to crossing mode
          if (sidewalkAxis === 'z') ped.mesh.position.z = targetPos;
          else ped.mesh.position.x = targetPos;

          // Check signal before stepping into the road
          const unsafeAtArrival = crossAxis === 'x'
            ? (state.signalState === SIGNAL_STATES.NS_GO || state.signalState === SIGNAL_STATES.ALL_GO)
            : (state.signalState === SIGNAL_STATES.EW_GO || state.signalState === SIGNAL_STATES.ALL_GO);
          ped.state = (unsafeAtArrival && state.signalState !== SIGNAL_STATES.ALL_STOP) ? 'waiting' : 'moving';

          // Rotate to face across the road
          if (crossAxis === 'x') {
            ped.mesh.rotation.y = ped.crossSign > 0 ? -Math.PI / 2 : Math.PI / 2;
          } else {
            ped.mesh.rotation.y = ped.crossSign > 0 ? Math.PI : 0;
          }
        }

        // Remove if walked off map without reaching crosswalk
        const absSwPos = Math.abs(swPos);
        if (absSwPos > EXIT_DIST) toRemove.push(ped);
        continue;
      }

      // Signal and intersection checks (only for crossing states)
      // crossAxis='x' → ped walks in x → crosses NS road → danger from NS traffic
      // crossAxis='z' → ped walks in z → crosses EW road → danger from EW traffic
      const trafficFlowingOnCrossRoad = crossAxis === 'x'
        ? (state.signalState === SIGNAL_STATES.NS_GO || state.signalState === SIGNAL_STATES.ALL_GO)
        : (state.signalState === SIGNAL_STATES.EW_GO || state.signalState === SIGNAL_STATES.ALL_GO);

      const conflictAxis = crossAxis === 'x' ? 'z' : 'x';
      const intersectionBusy = state.cars.some(c => {
        if (c === ped || c.isPedestrian || c.state === 'crashed' || c.state === 'waiting') return false;
        if (c.dirData.axis !== conflictAxis) return false;
        return c.distanceFromCenter < STOP_LINE_DIST;
      });

      const pedPos = crossAxis === 'x' ? ped.mesh.position.x : ped.mesh.position.z;
      const pedDist = Math.abs(pedPos);
      ped.distanceFromCenter = pedDist;

      // Peds respect the cop's signals — check BEFORE moving
      if (ped.state === 'moving' && pedDist > ROAD_WIDTH / 2 && (trafficFlowingOnCrossRoad || intersectionBusy) && state.signalState !== SIGNAL_STATES.ALL_STOP) {
        ped.state = 'waiting';
      }

      // STATE: crossing the road (moving / through)
      if (ped.state === 'moving' || ped.state === 'through') {
        const moveAmount = ped.speed * dt;
        if (crossAxis === 'x') {
          ped.mesh.position.x -= ped.crossSign * moveAmount;
        } else {
          ped.mesh.position.z -= ped.crossSign * moveAmount;
        }
        doBob();

        if (pedDist < ROAD_WIDTH / 2) ped.state = 'through';

        // Score when they clear the road, then switch to departing
        const newPos = crossAxis === 'x' ? ped.mesh.position.x : ped.mesh.position.z;
        if (!ped.cleared && Math.abs(newPos) > ROAD_WIDTH / 2 + 2 && Math.sign(newPos) !== Math.sign(ped.crossSign)) {
          ped.cleared = true;
          state.score += 5;
          state.carsCleared++;
          // Switch to departing — walk along far sidewalk and off map
          ped.state = 'departing';
          ped.mesh.position.y = 0.2; // back on sidewalk height
          // Pick random direction to walk along the far sidewalk
          ped.departSign = Math.random() > 0.5 ? 1 : -1;
          if (sidewalkAxis === 'z') {
            ped.mesh.rotation.y = ped.departSign > 0 ? 0 : Math.PI;
          } else {
            ped.mesh.rotation.y = ped.departSign > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        }
      } else if (ped.state === 'waiting') {
        if ((!trafficFlowingOnCrossRoad || state.signalState === SIGNAL_STATES.ALL_STOP) && !intersectionBusy) {
          ped.state = 'moving';
        }
      } else if (ped.state === 'departing') {
        // Walk along far sidewalk off map
        const moveAmount = ped.speed * dt;
        if (sidewalkAxis === 'z') {
          ped.mesh.position.z += ped.departSign * moveAmount;
        } else {
          ped.mesh.position.x += ped.departSign * moveAmount;
        }
        doBob();
        const depPos = sidewalkAxis === 'z' ? ped.mesh.position.z : ped.mesh.position.x;
        if (Math.abs(depPos) > EXIT_DIST) toRemove.push(ped);
        continue;
      }
      continue;
    }

    // --- VEHICLE UPDATE ---
    const dir = car.dirData;
    const isNS = dir.axis === 'z';
    const posComponent = isNS ? car.mesh.position.z : car.mesh.position.x;
    const distFromCenter = Math.abs(posComponent);
    car.distanceFromCenter = distFromCenter;

    const shouldStop = isCarSignaledToStop(car);
    const vLen = car.vehicleLength || CAR_LENGTH;
    const BRAKE_ZONE = 4; // start braking this many units before a block

    if (car.state === 'moving' || car.state === 'through') {
      const ACCEL_DURATION = 0.5;
      if (car.accelTimer < ACCEL_DURATION) car.accelTimer += dt;
      const accelFactor = Math.min(1, car.accelTimer / ACCEL_DURATION);
      let moveAmount = car.speed * accelFactor * dt;
      let atStopLine = false;

      // Point of no return: if car's front bumper is past the stop line, commit to crossing
      // (skip for cars that just completed a right turn — they're exiting on a new axis)
      const PNR_DIST = STOP_LINE_DIST - 1;
      if (car.state === 'moving' && !car.turnComplete && distFromCenter < PNR_DIST + vLen / 2) {
        car.state = 'through';
      }

      // BUS STOP: buses stop to pick up passengers before reaching the intersection
      if (car.vehicleType === 'bus' && !car.isEmergency && car.state === 'moving') {
        const busStopPos = dir.sign * (BUS_STOP_DIST + vLen / 2);
        const distToBusStop = (busStopPos - posComponent) * (-dir.sign);

        if (car.busStopState === 'stopped') {
          car.busStopTimer -= dt;
          moveAmount = 0;
          updateBusPassengers(car, dt);
          if (car.busStopTimer <= 0) {
            car.busStopState = 'done';
            car.accelTimer = 0; // smooth acceleration out of stop
            removeBusPassengers(car);
          }
        } else if (car.busStopState !== 'done' && distToBusStop >= 0 && distToBusStop < BUS_STOP_DIST) {
          if (distToBusStop <= 0.1) {
            car.busStopState = 'stopped';
            car.busStopTimer = BUS_STOP_DURATION_MIN + Math.random() * (BUS_STOP_DURATION_MAX - BUS_STOP_DURATION_MIN);
            moveAmount = 0;
            if (isNS) car.mesh.position.z = busStopPos;
            else car.mesh.position.x = busStopPos;
            spawnBusPassengers(car);
          } else if (distToBusStop < BRAKE_ZONE) {
            moveAmount = Math.min(moveAmount, car.speed * dt * (distToBusStop / BRAKE_ZONE), distToBusStop);
          }
        }
      }

      // BLOCK 1: Stop line — front bumper stops at STOP_LINE_DIST, center further back
      if (shouldStop && car.state !== 'through') {
        const stopLinePos = dir.sign * (STOP_LINE_DIST + vLen / 2);
        const distToStop = (stopLinePos - posComponent) * (-dir.sign);

        if (distToStop <= 0.05) {
          // At the stop line — stop completely
          moveAmount = 0;
          atStopLine = true;
          if (isNS) car.mesh.position.z = stopLinePos;
          else car.mesh.position.x = stopLinePos;
        } else if (distToStop < BRAKE_ZONE) {
          // Decelerate smoothly approaching stop line
          const decel = car.speed * dt * (distToStop / BRAKE_ZONE);
          moveAmount = Math.min(moveAmount, decel, distToStop);
        } else {
          // Don't overshoot the stop line
          moveAmount = Math.min(moveAmount, distToStop);
        }
      }

      // BLOCK 2: Queue behind any car ahead in same direction
      // Through cars inside the intersection have committed to clearing — skip queue logic
      if (!(car.state === 'through' && distFromCenter < STOP_LINE_DIST)) {
        for (const other of state.cars) {
          if (other === car || other.direction !== car.direction || other.state === 'crashed' || other.isPedestrian) continue;
          // Skip cars on a right-turn arc — they follow a curved path, not this lane
          if (other.turnRight && other.turnProgress !== undefined && !other.turnComplete) continue;
          const otherPos = isNS ? other.mesh.position.z : other.mesh.position.x;
          const fwdDist = (otherPos - posComponent) * (-dir.sign);
          if (fwdDist <= 0) continue; // not ahead

          const gap = (vLen + (other.vehicleLength || CAR_LENGTH)) * 0.5 + 1.5;
          const distToGap = fwdDist - gap;

          if (distToGap <= 0.05) {
            moveAmount = 0;
          } else if (distToGap < BRAKE_ZONE) {
            moveAmount = Math.min(moveAmount, car.speed * dt * (distToGap / BRAKE_ZONE), distToGap);
          } else {
            moveAmount = Math.min(moveAmount, distToGap);
          }
        }
      }

      // Stuck detection: if a through car hasn't moved for too long, force it
      if (car.state === 'through' && moveAmount < 0.001) {
        car.stuckTimer += dt;
        if (car.stuckTimer > 4) {
          moveAmount = car.speed * dt;
          car.stuckTimer = 0;
        }
      } else {
        car.stuckTimer = 0;
      }

      // Apply movement
      if (moveAmount > 0.001) {
        // Skip straight movement for cars actively turning on arc
        const isOnArc = car.state === 'through' && car.turnRight && !car.turnComplete && car.turnProgress !== undefined;
        if (!isOnArc) {
          if (isNS) car.mesh.position.z -= dir.sign * moveAmount;
          else car.mesh.position.x -= dir.sign * moveAmount;
        }
      }

      // Transition to waiting if stopped at the stop line
      if (atStopLine && car.state !== 'through') {
        car.state = 'waiting';
        car.waitTime = 0;
      }

      // Mark as through when inside the intersection
      // (skip for cars that completed a right turn — they're exiting on a new axis)
      const updatedPos = isNS ? car.mesh.position.z : car.mesh.position.x;
      const updatedDist = Math.abs(updatedPos);
      if (updatedDist < INTERSECTION_SIZE / 2 + vLen / 2 && car.state !== 'waiting' && !car.turnComplete) {
        car.state = 'through';
      }

      // RIGHT TURN ARC — handle turning cars in 'through' state
      if (car.state === 'through' && car.turnRight && !car.turnComplete) {
        const HALF_INT = INTERSECTION_SIZE / 2;
        // Only start the arc once the car reaches the intersection edge
        if (updatedDist <= HALF_INT + 0.5) {
          // Initialize turn data on first entry
          if (car.turnProgress === undefined) {
            car.turnProgress = 0;
            car._turnData = RIGHT_TURN_DATA[car.direction];
          }

          // Yield: check for pedestrians or cross-traffic in the intersection
          let shouldYield = false;
          if (!car._yieldTimer) car._yieldTimer = 0;
          for (const other of state.cars) {
            if (other === car || other.state === 'crashed') continue;
            // Yield to pedestrians near the turn path
            if (other.isPedestrian) {
              const dx = other.mesh.position.x - car.mesh.position.x;
              const dz = other.mesh.position.z - car.mesh.position.z;
              if (dx * dx + dz * dz < 25) { shouldYield = true; break; }
            }
            // Yield to cross-traffic vehicles inside the intersection
            if (!other.isPedestrian && other.dirData.axis !== dir.axis &&
                other.distanceFromCenter < HALF_INT + 2 &&
                other.state !== 'waiting' && other.state !== 'crashed') {
              shouldYield = true; break;
            }
          }
          // Force through after yielding too long to prevent deadlock
          if (shouldYield) {
            car._yieldTimer += dt;
            if (car._yieldTimer > 4) shouldYield = false;
          } else {
            car._yieldTimer = 0;
          }

          // Advance turn progress (or pause if yielding)
          if (!shouldYield) {
            const arcLen = TURN_RADIUS * Math.PI / 2;
            car.turnProgress = Math.min(1, car.turnProgress + (car.speed * dt) / arcLen);
          }

          // Set position and rotation on the arc
          const td = car._turnData;
          const t = car.turnProgress;
          const ang = td.a0 + t * (td.a1 - td.a0);
          car.mesh.position.x = td.cx + TURN_RADIUS * Math.cos(ang);
          car.mesh.position.z = td.cz + TURN_RADIUS * Math.sin(ang);
          car.mesh.rotation.y = td.r0 + t * (td.r1 - td.r0);

          // Complete the turn — switch to new direction for straight exit
          if (t >= 1) {
            car.turnComplete = true;
            car.direction = td.exitDir;
            car.dirData = DIRECTIONS[td.exitDir];
            car.turnRight = false;
            // Stay 'through' so the car commits to exiting (stop-line logic won't recapture it)
            car.state = 'through';
            car.accelTimer = 0.5; // already at full speed, skip slow-start
          }
        }
      }

      // Remove when exited (check both axes for turned cars)
      if (Math.abs(updatedPos) > EXIT_DIST) {
        if (!car.cleared) {
          car.cleared = true;
          state.score += 10;
          state.carsCleared++;
          playScore();
        }
        toRemove.push(car);
      }
      // Also check new axis for cars that completed a turn
      if (car.turnComplete) {
        const newIsNS = car.dirData.axis === 'z';
        const newPos = newIsNS ? car.mesh.position.z : car.mesh.position.x;
        if (Math.abs(newPos) > EXIT_DIST) {
          if (!car.cleared) {
            car.cleared = true;
            state.score += 10;
            state.carsCleared++;
            playScore();
          }
          toRemove.push(car);
        }
      }
    } else if (car.state === 'waiting') {
      if (!shouldStop) {
        // Signal changed — resume with slow start
        car.state = 'moving';
        car.accelTimer = 0;
        car.waitTime = 0;
        car.mesh.rotation.z = 0;
      } else {
        // Impatient waiting: shake the car slightly
        if (!car.waitTime) car.waitTime = 0;
        car.waitTime += dt;
        if (car.waitTime > 3) {
          const shake = Math.sin(car.waitTime * 6) * 0.02 * Math.min(1, (car.waitTime - 3) / 4);
          car.mesh.rotation.z = shake;
        }
      }
    }
  }

  // Overlap correction: push apart same-direction cars that are overlapping outside the intersection
  for (let i = 0; i < state.cars.length; i++) {
    const a = state.cars[i];
    if (a.isPedestrian || a.state === 'crashed') continue;
    const aDir = a.dirData;
    const aIsNS = aDir.axis === 'z';
    const aPos = aIsNS ? a.mesh.position.z : a.mesh.position.x;
    const aDist = Math.abs(aPos);
    // Skip cars inside the intersection
    if (aDist < INTERSECTION_SIZE / 2 + (a.vehicleLength || CAR_LENGTH) / 2) continue;
    // Skip cars on an active right-turn arc
    if (a.turnRight && a.turnProgress !== undefined && !a.turnComplete) continue;

    for (let j = i + 1; j < state.cars.length; j++) {
      const b = state.cars[j];
      if (b.isPedestrian || b.state === 'crashed') continue;
      if (b.direction !== a.direction) continue;
      if (b.turnRight && b.turnProgress !== undefined && !b.turnComplete) continue;
      const bPos = aIsNS ? b.mesh.position.z : b.mesh.position.x;
      const bDist = Math.abs(bPos);
      if (bDist < INTERSECTION_SIZE / 2 + (b.vehicleLength || CAR_LENGTH) / 2) continue;

      const minGap = ((a.vehicleLength || CAR_LENGTH) + (b.vehicleLength || CAR_LENGTH)) * 0.5 + 0.5;
      const actual = Math.abs(aPos - bPos);
      if (actual < minGap) {
        // Push the trailing car back
        const overlap = minGap - actual;
        const aAhead = (aPos - bPos) * (-aDir.sign) > 0;
        if (aAhead) {
          // b is behind — push b back
          if (aIsNS) b.mesh.position.z += aDir.sign * overlap;
          else b.mesh.position.x += aDir.sign * overlap;
        } else {
          // a is behind — push a back
          if (aIsNS) a.mesh.position.z += aDir.sign * overlap;
          else a.mesh.position.x += aDir.sign * overlap;
        }
      }
    }
  }

  // Remove exited cars (swap-and-pop to avoid O(n) splicing)
  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove);
    for (const car of toRemove) {
      if (car.busPassengers && car.busPassengers.length) removeBusPassengers(car);
      state.scene.remove(car.mesh);
      car.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    let w = 0;
    for (let r = 0; r < state.cars.length; r++) {
      if (!removeSet.has(state.cars[r])) state.cars[w++] = state.cars[r];
    }
    state.cars.length = w;
  }
}

export function isCarSignaledToStop(car) {
  if (car.isEmergency) return false; // emergency vehicles never stop
  const isNS = car.dirData.axis === 'z';
  if (state.signalState === SIGNAL_STATES.ALL_GO) return false;
  if (state.signalState === SIGNAL_STATES.ALL_STOP) return true;
  if (state.signalState === SIGNAL_STATES.NS_GO && isNS) return false;
  if (state.signalState === SIGNAL_STATES.EW_GO && !isNS) return false;
  return true;
}

// ============================================================
// BRAKE LIGHTS & TRAFFIC JAM VISUALS
// ============================================================
const _brakeLightGeo = new THREE.PlaneGeometry(0.25, 0.15);

export function updateBrakeLights() {
  for (const car of state.cars) {
    if (car.isPedestrian) continue;
    if (car.state === 'crashed') continue;

    const isStopped = car.state === 'waiting' || (car.state === 'moving' && isCarSignaledToStop(car));

    // Create brake lights once per car if missing
    if (!car.brakeLightMeshes && car.vehicleType !== 'motorcycle') {
      const W = car.vehicleWidth || CAR_WIDTH;
      const L = car.vehicleLength || CAR_LENGTH;
      const H = car.mesh.children[0] ? 0.6 : 0.5;
      const mat1 = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0 });
      const mat2 = mat1.clone();
      const bl1 = new THREE.Mesh(_brakeLightGeo, mat1);
      const bl2 = new THREE.Mesh(_brakeLightGeo, mat2);
      bl1.position.set(-W * 0.35, H, -L / 2 - 0.01);
      bl2.position.set(W * 0.35, H, -L / 2 - 0.01);
      car.mesh.add(bl1);
      car.mesh.add(bl2);
      car.brakeLightMeshes = [{ mesh: bl1, mat: mat1 }, { mesh: bl2, mat: mat2 }];
    }

    // Update brake light intensity
    if (car.brakeLightMeshes) {
      const targetIntensity = isStopped ? 1.2 : 0;
      for (const bl of car.brakeLightMeshes) {
        bl.mat.emissiveIntensity += (targetIntensity - bl.mat.emissiveIntensity) * 0.2;
      }
    }

    // Reset rotation for cars that started moving again
    if (car.state === 'moving' || car.state === 'through') {
      car.waitTime = 0;
      car.mesh.rotation.z *= 0.9; // smooth back to 0
    }
  }
}

export function updateBlinkers() {
  const blink = Math.sin(performance.now() * 0.008) > 0; // ~4 Hz toggle
  for (const car of state.cars) {
    if (!car.blinkerMat) continue;
    car.blinkerMat.emissiveIntensity = (car.turnRight && blink) ? 2.0 : 0;
  }
}
