// ============================================================
// js/scene.js — THREE.JS SCENE SETUP
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_WIDTH, ROAD_LENGTH, INTERSECTION_SIZE, STOP_LINE_DIST, CROSSWALK_DIST, LANE_OFFSET, BUS_STOP_DIST, DIRECTIONS } from './constants.js';
import { state } from './state.js';

export { mergeGeometries };

// Helper: create a canvas texture
export function makeCanvasTexture(width, height, drawFn) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initScene() {
  state.scene = new THREE.Scene();

  // Gradient sky
  const skyGeo = new THREE.SphereGeometry(150, 16, 10);
  const skyColors = [];
  const posAttr = skyGeo.getAttribute('position');
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = Math.max(0, y / 150);
    skyColors.push(0.53 + (0.15 - 0.53) * t, 0.81 + (0.35 - 0.81) * t, 0.92 + (0.75 - 0.92) * t);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  state.skyDomeMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  state.scene.add(state.skyDomeMesh);

  state.scene.fog = new THREE.FogExp2(0xc8dfe8, 0.008);

  state.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  state.camera.position.set(0, 40, 35);
  state.camera.lookAt(0, 0, -2);

  state.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true, powerPreference: 'high-performance' });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFShadowMap;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.1;
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;

  state.clock = new THREE.Clock();

  // Warm sunlight
  state.sunLight = new THREE.DirectionalLight(0xfff0dd, 1.5);
  state.sunLight.position.set(40, 60, 30);
  state.sunLight.castShadow = true;
  state.sunLight.shadow.mapSize.width = 1024;
  state.sunLight.shadow.mapSize.height = 1024;
  state.sunLight.shadow.camera.left = -65;
  state.sunLight.shadow.camera.right = 65;
  state.sunLight.shadow.camera.top = 65;
  state.sunLight.shadow.camera.bottom = -65;
  state.sunLight.shadow.camera.near = 10;
  state.sunLight.shadow.camera.far = 150;
  state.sunLight.shadow.bias = -0.001;
  state.sunLight.shadow.normalBias = 0.02;
  state.scene.add(state.sunLight);

  // Fill light (cool blue)
  state.fillLight = new THREE.DirectionalLight(0x8eb8ff, 0.4);
  state.fillLight.position.set(-30, 30, -20);
  state.scene.add(state.fillLight);

  state.ambientLight = new THREE.AmbientLight(0x606878, 0.5);
  state.scene.add(state.ambientLight);
  state.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3a5c2a, 0.35);
  state.scene.add(state.hemiLight);

  buildIntersection();
  buildCop();
  buildBuildings();
  buildEnvironment();

  window.addEventListener('resize', () => {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildIntersection() {
  state.intersectionGroup = new THREE.Group();

  // Grass ground
  const grassTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a7c3f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const shade = 60 + Math.random() * 40;
      ctx.fillStyle = `rgb(${shade}, ${shade + 40 + Math.random() * 30|0}, ${shade - 10|0})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(4, 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  state.intersectionGroup.add(ground);

  // Asphalt texture
  const asphaltTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2000; i++) {
      const v = 40 + Math.random() * 30;
      ctx.fillStyle = `rgb(${v|0}, ${v|0}, ${v|0})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
  asphaltTex.repeat.set(2, 8);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 });

  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.9 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.85 });

  // Roads
  const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH * 2), roadMat);
  nsRoad.rotation.x = -Math.PI / 2; nsRoad.receiveShadow = true;
  state.intersectionGroup.add(nsRoad);

  const asphaltTex2 = asphaltTex.clone();
  asphaltTex2.repeat.set(8, 2);
  const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LENGTH * 2, ROAD_WIDTH),
    new THREE.MeshStandardMaterial({ map: asphaltTex2, roughness: 0.85 }));
  ewRoad.rotation.x = -Math.PI / 2; ewRoad.receiveShadow = true;
  state.intersectionGroup.add(ewRoad);

  const interPlane = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH), roadMat);
  interPlane.rotation.x = -Math.PI / 2; interPlane.position.y = 0.01; interPlane.receiveShadow = true;
  state.intersectionGroup.add(interPlane);

  // Merge all curbs into one mesh
  const curbH = 0.15, curbW = 0.25;
  const halfRd = ROAD_WIDTH / 2 + curbW / 2;
  const halfInt = INTERSECTION_SIZE / 2 + curbW;
  const curbGeos = [];
  const addCurbGeo = (x, z, lenX, lenZ) => {
    const g = new THREE.BoxGeometry(lenX, curbH, lenZ);
    g.translate(x, curbH / 2, z);
    curbGeos.push(g);
  };
  addCurbGeo(-halfRd, -(halfInt + ROAD_LENGTH / 2), curbW, ROAD_LENGTH - INTERSECTION_SIZE);
  addCurbGeo(halfRd, -(halfInt + ROAD_LENGTH / 2), curbW, ROAD_LENGTH - INTERSECTION_SIZE);
  addCurbGeo(-halfRd, (halfInt + ROAD_LENGTH / 2), curbW, ROAD_LENGTH - INTERSECTION_SIZE);
  addCurbGeo(halfRd, (halfInt + ROAD_LENGTH / 2), curbW, ROAD_LENGTH - INTERSECTION_SIZE);
  addCurbGeo(-(halfInt + ROAD_LENGTH / 2), -halfRd, ROAD_LENGTH - INTERSECTION_SIZE, curbW);
  addCurbGeo(-(halfInt + ROAD_LENGTH / 2), halfRd, ROAD_LENGTH - INTERSECTION_SIZE, curbW);
  addCurbGeo((halfInt + ROAD_LENGTH / 2), -halfRd, ROAD_LENGTH - INTERSECTION_SIZE, curbW);
  addCurbGeo((halfInt + ROAD_LENGTH / 2), halfRd, ROAD_LENGTH - INTERSECTION_SIZE, curbW);
  const curbMesh = new THREE.Mesh(mergeGeometries(curbGeos), curbMat);
  curbMesh.receiveShadow = true;
  state.intersectionGroup.add(curbMesh);

  // Merge all lane dashes into one mesh
  const dashGeos = [];
  const yellowLineMat = new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.7 });
  for (let i = -ROAD_LENGTH; i < -INTERSECTION_SIZE / 2; i += 4) {
    const g = new THREE.PlaneGeometry(0.15, 2); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, i); dashGeos.push(g);
  }
  for (let i = INTERSECTION_SIZE / 2 + 2; i < ROAD_LENGTH; i += 4) {
    const g = new THREE.PlaneGeometry(0.15, 2); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, i); dashGeos.push(g);
  }
  for (let i = -ROAD_LENGTH; i < -INTERSECTION_SIZE / 2; i += 4) {
    const g = new THREE.PlaneGeometry(2, 0.15); g.rotateX(-Math.PI / 2); g.translate(i, 0.02, 0); dashGeos.push(g);
  }
  for (let i = INTERSECTION_SIZE / 2 + 2; i < ROAD_LENGTH; i += 4) {
    const g = new THREE.PlaneGeometry(2, 0.15); g.rotateX(-Math.PI / 2); g.translate(i, 0.02, 0); dashGeos.push(g);
  }
  if (dashGeos.length) {
    const dashMesh = new THREE.Mesh(mergeGeometries(dashGeos), yellowLineMat);
    state.intersectionGroup.add(dashMesh);
  }

  // Merge crosswalk stripes — proper zebra crossing pattern
  const crossGeos = [];
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const stripeW = 0.9;   // width of each stripe along the road
  const stripeGap = 0.6; // gap between stripes
  const crossSpan = 2.2; // total depth of crosswalk zone along main axis
  const halfRoadW = ROAD_WIDTH / 2;
  ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dirKey => {
    const d = DIRECTIONS[dirKey];
    const isNS = d.axis === 'z';
    // Zebra stripes perpendicular to traffic flow
    for (let offset = -halfRoadW + stripeW / 2 + 0.3; offset < halfRoadW - 0.3; offset += stripeW + stripeGap) {
      const g = new THREE.PlaneGeometry(
        isNS ? stripeW : crossSpan,
        isNS ? crossSpan : stripeW
      );
      g.rotateX(-Math.PI / 2);
      const mainPos = d.sign * CROSSWALK_DIST;
      if (isNS) g.translate(offset, 0.026, mainPos);
      else g.translate(mainPos, 0.026, offset);
      crossGeos.push(g);
    }
    // Border lines on each edge of crosswalk
    for (const edgeOff of [-crossSpan / 2, crossSpan / 2]) {
      const borderG = new THREE.PlaneGeometry(
        isNS ? ROAD_WIDTH : 0.15,
        isNS ? 0.15 : ROAD_WIDTH
      );
      borderG.rotateX(-Math.PI / 2);
      const bPos = d.sign * CROSSWALK_DIST + (isNS ? 0 : edgeOff);
      if (isNS) borderG.translate(0, 0.027, d.sign * CROSSWALK_DIST + edgeOff);
      else borderG.translate(d.sign * CROSSWALK_DIST + edgeOff, 0.027, 0);
      crossGeos.push(borderG);
    }
  });
  if (crossGeos.length) {
    state.intersectionGroup.add(new THREE.Mesh(mergeGeometries(crossGeos), crossMat));
  }

  // Merge stop lines (one per direction, at car stop position)
  const stopGeos = [];
  ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dirKey => {
    const d = DIRECTIONS[dirKey];
    const isNS = d.axis === 'z';
    const g = new THREE.PlaneGeometry(
      isNS ? ROAD_WIDTH * 0.48 : 0.5,
      isNS ? 0.5 : ROAD_WIDTH * 0.48
    );
    g.rotateX(-Math.PI / 2);
    if (isNS) g.translate(d.laneOffset, 0.025, d.sign * STOP_LINE_DIST);
    else g.translate(d.sign * STOP_LINE_DIST, 0.025, d.laneOffset);
    stopGeos.push(g);
  });
  if (stopGeos.length) {
    state.intersectionGroup.add(new THREE.Mesh(mergeGeometries(stopGeos), crossMat));
  }

  // Continuous sidewalks along all roads + corner plazas
  const sw = 3.5; // sidewalk width
  const swGeos = [];
  const swH = 0.2;

  // 4 corner plazas at the intersection
  [
    { x: ROAD_WIDTH / 2 + sw / 2, z: ROAD_WIDTH / 2 + sw / 2 },
    { x: -(ROAD_WIDTH / 2 + sw / 2), z: ROAD_WIDTH / 2 + sw / 2 },
    { x: ROAD_WIDTH / 2 + sw / 2, z: -(ROAD_WIDTH / 2 + sw / 2) },
    { x: -(ROAD_WIDTH / 2 + sw / 2), z: -(ROAD_WIDTH / 2 + sw / 2) }
  ].forEach(c => {
    const g = new THREE.BoxGeometry(sw, swH, sw);
    g.translate(c.x, swH / 2, c.z);
    swGeos.push(g);
  });

  // Sidewalks running along NS roads (left and right of road, above and below intersection)
  const nsLen = ROAD_LENGTH - INTERSECTION_SIZE / 2 - sw / 2;
  [1, -1].forEach(sideX => {
    [1, -1].forEach(dirZ => {
      const g = new THREE.BoxGeometry(sw, swH, nsLen);
      g.translate(sideX * (ROAD_WIDTH / 2 + sw / 2), swH / 2, dirZ * (INTERSECTION_SIZE / 2 + sw / 2 + nsLen / 2));
      swGeos.push(g);
    });
  });

  // Sidewalks running along EW roads (above and below road, left and right of intersection)
  [1, -1].forEach(sideZ => {
    [1, -1].forEach(dirX => {
      const g = new THREE.BoxGeometry(nsLen, swH, sw);
      g.translate(dirX * (INTERSECTION_SIZE / 2 + sw / 2 + nsLen / 2), swH / 2, sideZ * (ROAD_WIDTH / 2 + sw / 2));
      swGeos.push(g);
    });
  });

  const swMesh = new THREE.Mesh(mergeGeometries(swGeos), sidewalkMat);
  swMesh.receiveShadow = true;
  state.intersectionGroup.add(swMesh);

  // Manhole covers (merged)
  const manholeGeos = [];
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.5 });
  [{ x: -2, z: -20 }, { x: 3, z: 18 }, { x: -18, z: 2 }, { x: 22, z: -1 }].forEach(p => {
    const g = new THREE.CircleGeometry(0.5, 8);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0.015, p.z);
    manholeGeos.push(g);
  });
  state.intersectionGroup.add(new THREE.Mesh(mergeGeometries(manholeGeos), manholeMat));

  // Signal markers (these need to update per-frame, so keep as individual meshes)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 });
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
  const lightGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const housingGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 6);

  // Merge all signal posts into one static mesh
  const signalPostGeos = [];
  const signalHousingGeos = [];

  ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dir => {
    const d = DIRECTIONS[dir];
    const px = d.axis === 'z' ? d.laneOffset : STOP_LINE_DIST * d.sign;
    const pz = d.axis === 'z' ? STOP_LINE_DIST * d.sign : d.laneOffset;

    const pg = postGeo.clone(); pg.translate(px, 0, pz); signalPostGeos.push(pg);
    const hg = housingGeo.clone(); hg.translate(px, 1.25, pz); signalHousingGeos.push(hg);

    // Signal light (needs individual material for color updates)
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });
    const marker = new THREE.Mesh(lightGeo, mat);
    marker.position.set(px, 1.25, pz);
    state.intersectionGroup.add(marker);
    state.signalMarkers[dir] = marker;
  });
  state.intersectionGroup.add(new THREE.Mesh(mergeGeometries(signalPostGeos), postMat));
  state.intersectionGroup.add(new THREE.Mesh(mergeGeometries(signalHousingGeos), housingMat));

  state.scene.add(state.intersectionGroup);
}

function buildCop() {
  state.copModel = new THREE.Group();
  const uniformBlue = 0x1a3a6a;
  const uniformMat = new THREE.MeshStandardMaterial({ color: uniformBlue, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.4, metalness: 0.2 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });

  // Merge static body parts into one mesh per material
  const darkGeos = [];
  const uniformGeos = [];
  const skinGeos = [];

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.17, 0.14, 1.1, 6);
  const lgL = legGeo.clone(); lgL.translate(-0.22, 0.55, 0); darkGeos.push(lgL);
  const lgR = legGeo.clone(); lgR.translate(0.22, 0.55, 0); darkGeos.push(lgR);

  // Shoes
  const shoeGeo = new THREE.BoxGeometry(0.25, 0.12, 0.35);
  const shL = shoeGeo.clone(); shL.translate(-0.22, 0.06, 0.05); darkGeos.push(shL);
  const shR = shoeGeo.clone(); shR.translate(0.22, 0.06, 0.05); darkGeos.push(shR);

  // Torso
  const torsoGeo = new THREE.CylinderGeometry(0.45, 0.35, 1.6, 8);
  torsoGeo.translate(0, 1.9, 0);
  uniformGeos.push(torsoGeo);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.2, 6);
  neckGeo.translate(0, 2.75, 0);
  skinGeos.push(neckGeo);

  // Head
  const headGeo = new THREE.SphereGeometry(0.38, 10, 8);
  headGeo.scale(1, 1.05, 0.95);
  headGeo.translate(0, 3.1, 0);
  skinGeos.push(headGeo);

  // Merged body meshes
  const darkBody = new THREE.Mesh(mergeGeometries(darkGeos), darkMat);
  darkBody.castShadow = true;
  state.copModel.add(darkBody);
  const uniformBody = new THREE.Mesh(mergeGeometries(uniformGeos), uniformMat);
  uniformBody.castShadow = true;
  state.copModel.add(uniformBody);
  const skinBody = new THREE.Mesh(mergeGeometries(skinGeos), skinMat);
  skinBody.castShadow = true;
  state.copModel.add(skinBody);

  // Small details merged (belt, buckle, badge, hat, eyes, whistle)
  const detailGeos = [];
  // Belt
  const beltGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 8);
  beltGeo.translate(0, 1.2, 0); detailGeos.push(beltGeo);
  const beltMesh = new THREE.Mesh(mergeGeometries(detailGeos), beltMat);
  state.copModel.add(beltMesh);

  // Gold details merged
  const goldGeos = [];
  const buckleGeo = new THREE.BoxGeometry(0.12, 0.1, 0.04);
  buckleGeo.translate(0, 1.2, 0.38); goldGeos.push(buckleGeo);
  const badgeGeo = new THREE.CircleGeometry(0.12, 6);
  badgeGeo.translate(-0.2, 2.3, 0.46); goldGeos.push(badgeGeo);
  const hatBadgeGeo = new THREE.CircleGeometry(0.08, 6);
  hatBadgeGeo.translate(0, 3.5, 0.5); goldGeos.push(hatBadgeGeo);
  state.copModel.add(new THREE.Mesh(mergeGeometries(goldGeos), goldMat));

  // Hat merged
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x0f1f3f, roughness: 0.5 });
  const hatGeos = [];
  const hatBrimGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.04, 10);
  hatBrimGeo.translate(0, 3.42, 0); hatGeos.push(hatBrimGeo);
  const hatTopGeo = new THREE.CylinderGeometry(0.2, 0.38, 0.3, 10);
  hatTopGeo.translate(0, 3.58, 0); hatGeos.push(hatTopGeo);
  const visorGeo = new THREE.BoxGeometry(0.5, 0.03, 0.25);
  visorGeo.translate(0, 3.42, 0.3); hatGeos.push(visorGeo);
  state.copModel.add(new THREE.Mesh(mergeGeometries(hatGeos), hatMat));

  // Eyes merged
  const eyeGeos = [];
  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const e1 = eyeGeo.clone(); e1.translate(-0.12, 3.15, 0.35); eyeGeos.push(e1);
  const e2 = eyeGeo.clone(); e2.translate(0.12, 3.15, 0.35); eyeGeos.push(e2);
  state.copModel.add(new THREE.Mesh(mergeGeometries(eyeGeos), new THREE.MeshStandardMaterial({ color: 0xffffff })));

  const pupilGeos = [];
  const pupilGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const p1 = pupilGeo.clone(); p1.translate(-0.12, 3.15, 0.39); pupilGeos.push(p1);
  const p2 = pupilGeo.clone(); p2.translate(0.12, 3.15, 0.39); pupilGeos.push(p2);
  state.copModel.add(new THREE.Mesh(mergeGeometries(pupilGeos), new THREE.MeshStandardMaterial({ color: 0x2a1a0a })));

  // Arms (need to remain separate groups for animation)
  const armGeo = new THREE.CylinderGeometry(0.13, 0.11, 0.7, 6);
  const forearmGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.6, 6);
  const handGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

  // Merge arm parts within each arm group
  state.copLeftArm = new THREE.Group();
  state.copLeftArm.position.set(-0.55, 2.5, 0);
  const leftArmGeos = [];
  const laUpper = armGeo.clone(); laUpper.translate(0, -0.35, 0); leftArmGeos.push(laUpper);
  const laFore = forearmGeo.clone(); laFore.translate(0, -0.85, 0); leftArmGeos.push(laFore);
  const leftArmMesh = new THREE.Mesh(mergeGeometries(leftArmGeos), uniformMat);
  leftArmMesh.castShadow = true;
  state.copLeftArm.add(leftArmMesh);
  const lHand = new THREE.Mesh(handGeo, gloveMat);
  lHand.position.set(0, -1.15, 0); lHand.scale.set(1, 0.7, 1.2);
  state.copLeftArm.add(lHand);
  state.copModel.add(state.copLeftArm);

  state.copRightArm = new THREE.Group();
  state.copRightArm.position.set(0.55, 2.5, 0);
  const rightArmGeos = [];
  const raUpper = armGeo.clone(); raUpper.translate(0, -0.35, 0); rightArmGeos.push(raUpper);
  const raFore = forearmGeo.clone(); raFore.translate(0, -0.85, 0); rightArmGeos.push(raFore);
  const rightArmMesh = new THREE.Mesh(mergeGeometries(rightArmGeos), uniformMat);
  rightArmMesh.castShadow = true;
  state.copRightArm.add(rightArmMesh);
  const rHand = new THREE.Mesh(handGeo, gloveMat);
  rHand.position.set(0, -1.15, 0); rHand.scale.set(1, 0.7, 1.2);
  state.copRightArm.add(rHand);
  state.copModel.add(state.copRightArm);

  state.copModel.position.set(0, 0, 0);
  state.scene.add(state.copModel);
}

function buildBuildings() {
  const buildingColors = [
    0x8B7355, 0x9B8B7A, 0xA0522D, 0x6B6F74, 0x8899aa,
    0xB8860B, 0x9BA595, 0xC4A882, 0x7B8B6F, 0x887766,
    0xA89070, 0x7A8998
  ];

  const positions = [
    // NE quadrant
    { x: 16, z: -16, w: 9, h: 14, d: 9 },
    { x: 28, z: -15, w: 7, h: 9, d: 11 },
    { x: 17, z: -30, w: 11, h: 18, d: 7 },
    { x: 30, z: -30, w: 8, h: 11, d: 8 },
    { x: 40, z: -16, w: 6, h: 7, d: 8 },
    { x: 42, z: -30, w: 7, h: 15, d: 6 },
    { x: 17, z: -44, w: 8, h: 10, d: 7 },
    { x: 30, z: -43, w: 9, h: 20, d: 8 },
    // NW quadrant
    { x: -16, z: -16, w: 9, h: 11, d: 9 },
    { x: -28, z: -19, w: 8, h: 16, d: 8 },
    { x: -19, z: -32, w: 11, h: 10, d: 9 },
    { x: -32, z: -32, w: 7, h: 13, d: 7 },
    { x: -40, z: -17, w: 6, h: 8, d: 9 },
    { x: -42, z: -32, w: 7, h: 22, d: 7 },
    { x: -18, z: -46, w: 9, h: 12, d: 6 },
    { x: -34, z: -45, w: 8, h: 9, d: 8 },
    // SE quadrant
    { x: 16, z: 16, w: 9, h: 12, d: 9 },
    { x: 30, z: 17, w: 8, h: 8, d: 10 },
    { x: 16, z: 30, w: 10, h: 15, d: 8 },
    { x: 40, z: 17, w: 6, h: 10, d: 7 },
    { x: 30, z: 32, w: 7, h: 6, d: 9 },
    { x: 42, z: 32, w: 6, h: 17, d: 7 },
    { x: 17, z: 44, w: 8, h: 11, d: 7 },
    { x: 32, z: 45, w: 9, h: 14, d: 8 },
    // SW quadrant
    { x: -16, z: 16, w: 9, h: 10, d: 9 },
    { x: -27, z: 18, w: 7, h: 17, d: 9 },
    { x: -18, z: 30, w: 11, h: 9, d: 7 },
    { x: -30, z: 30, w: 8, h: 12, d: 8 },
    { x: -40, z: 16, w: 6, h: 7, d: 8 },
    { x: -42, z: 30, w: 7, h: 19, d: 7 },
    { x: -17, z: 44, w: 8, h: 13, d: 7 },
    { x: -32, z: 44, w: 9, h: 8, d: 8 }
  ];

  // Bake windows into building face textures to eliminate per-window meshes
  function makeBuildingTexture(faceWidth, faceHeight) {
    return makeCanvasTexture(128, 256, (ctx, w, h) => {
      const scaleX = w / faceWidth;
      const scaleY = h / faceHeight;
      ctx.fillStyle = '#00000000'; // transparent (will be overlaid by material color)
      ctx.clearRect(0, 0, w, h);
      // Windows
      for (let wy = 2; wy < faceHeight - 1; wy += 2.8) {
        for (let wx = 1.5; wx < faceWidth - 1; wx += 2.2) {
          const isLit = Math.random() > 0.5;
          ctx.fillStyle = isLit ? '#ffeebb' : '#88aacc';
          const wx2 = wx * scaleX;
          const wy2 = h - (wy + 1.3) * scaleY; // flip Y
          ctx.fillRect(wx2, wy2, 0.9 * scaleX, 1.3 * scaleY);
        }
      }
    });
  }

  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });
  const roofGeos = [];

  positions.forEach((p, i) => {
    const color = buildingColors[i % buildingColors.length];

    // Create textured materials for each face pair
    const texFront = makeBuildingTexture(p.w, p.h);
    const texSide = makeBuildingTexture(p.d, p.h);

    // Building with face materials
    const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
    const baseMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
    const frontMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, map: texFront });
    const sideMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, map: texSide });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const building = new THREE.Mesh(geo, [sideMat, sideMat, baseMat, baseMat, frontMat, frontMat]);
    building.position.set(p.x, p.h / 2, p.z);
    building.castShadow = true;
    building.receiveShadow = true;
    state.scene.add(building);
    state.buildingMeshes.push(building);

    // Collect rooftop ledge geo
    const lg = new THREE.BoxGeometry(p.w + 0.3, 0.3, p.d + 0.3);
    lg.translate(p.x, p.h + 0.15, p.z);
    roofGeos.push(lg);
  });

  // Single merged mesh for all rooftop ledges
  if (roofGeos.length) {
    const roofMesh = new THREE.Mesh(mergeGeometries(roofGeos), ledgeMat);
    roofMesh.castShadow = true;
    state.scene.add(roofMesh);
  }

  // --- Doors, sidewalk paths, and ambient pedestrians ---
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.6 });
  const awningMat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.5 });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.9 });
  const doorGeos = [];
  const awningGeos = [];
  const pathGeos = [];
  const ROAD_SW_EDGE = ROAD_WIDTH / 2 + 3.5; // outer edge of road sidewalk
  const doorW = 1.4, doorH = 2.4, doorD = 0.05;
  const pathH = 0.2, pathW = 2.0;

  // Track door info for ambient ped placement
  const doorInfos = [];

  positions.forEach((p) => {
    const nsGap = Math.abs(p.x) - p.w / 2 - ROAD_WIDTH / 2;
    const ewGap = Math.abs(p.z) - p.d / 2 - ROAD_WIDTH / 2;
    const facesNS = nsGap <= ewGap;

    if (facesNS) {
      const sign = p.x > 0 ? -1 : 1; // door faces toward x=0
      const edgeX = p.x + sign * p.w / 2;

      // Door (thin in x, wide in z)
      const dg = new THREE.BoxGeometry(doorD, doorH, doorW);
      dg.translate(edgeX, doorH / 2, p.z);
      doorGeos.push(dg);

      // Awning above door
      const ag = new THREE.BoxGeometry(0.8, 0.06, doorW + 0.4);
      ag.translate(edgeX + sign * 0.4, doorH + 0.15, p.z);
      awningGeos.push(ag);

      // Sidewalk path from building edge to road sidewalk
      const roadEdge = p.x > 0 ? ROAD_SW_EDGE : -ROAD_SW_EDGE;
      const pLen = Math.abs(edgeX - roadEdge);
      if (pLen > 0.5) {
        const pg = new THREE.BoxGeometry(pLen, pathH, pathW);
        pg.translate((edgeX + roadEdge) / 2, pathH / 2, p.z);
        pathGeos.push(pg);
      }

      doorInfos.push({ x: edgeX, z: p.z, axis: 'x', sign, roadEdge });
    } else {
      const sign = p.z > 0 ? -1 : 1; // door faces toward z=0
      const edgeZ = p.z + sign * p.d / 2;

      // Door (thin in z, wide in x)
      const dg = new THREE.BoxGeometry(doorW, doorH, doorD);
      dg.translate(p.x, doorH / 2, edgeZ);
      doorGeos.push(dg);

      // Awning above door
      const ag = new THREE.BoxGeometry(doorW + 0.4, 0.06, 0.8);
      ag.translate(p.x, doorH + 0.15, edgeZ + sign * 0.4);
      awningGeos.push(ag);

      // Sidewalk path from building edge to road sidewalk
      const roadEdge = p.z > 0 ? ROAD_SW_EDGE : -ROAD_SW_EDGE;
      const pLen = Math.abs(edgeZ - roadEdge);
      if (pLen > 0.5) {
        const pg = new THREE.BoxGeometry(pathW, pathH, pLen);
        pg.translate(p.x, pathH / 2, (edgeZ + roadEdge) / 2);
        pathGeos.push(pg);
      }

      doorInfos.push({ x: p.x, z: edgeZ, axis: 'z', sign, roadEdge });
    }
  });

  if (doorGeos.length) state.scene.add(new THREE.Mesh(mergeGeometries(doorGeos), doorMat));
  if (awningGeos.length) {
    const awning = new THREE.Mesh(mergeGeometries(awningGeos), awningMat);
    awning.castShadow = true;
    state.scene.add(awning);
  }
  if (pathGeos.length) {
    const pm = new THREE.Mesh(mergeGeometries(pathGeos), pathMat);
    pm.receiveShadow = true;
    state.scene.add(pm);
  }

}

function buildEnvironment() {
  // Merge ALL trees into 2 meshes (trunks + canopies)
  const trunkGeos = [];
  const canopyGeos = [];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 0.85 });

  const treePositions = [
    { x: 8, z: -12 }, { x: 8, z: -24 }, { x: 8, z: -38 },
    { x: -8, z: -14 }, { x: -8, z: -26 }, { x: -8, z: -40 },
    { x: 8, z: 12 }, { x: 8, z: 24 }, { x: 8, z: 38 },
    { x: -8, z: 14 }, { x: -8, z: 26 },
    { x: 12, z: 8 }, { x: 24, z: 8 }, { x: 38, z: 8 },
    { x: -12, z: 8 }, { x: -24, z: 8 }, { x: -38, z: 8 },
    { x: 12, z: -8 }, { x: 24, z: -8 },
    { x: -12, z: -8 }, { x: -24, z: -8 }
  ];
  treePositions.forEach(p => {
    const tg = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 5);
    tg.translate(p.x, 0.75, p.z);
    trunkGeos.push(tg);
    // Single merged canopy sphere instead of 3 layers
    const cg = new THREE.SphereGeometry(1.5, 6, 5);
    cg.scale(1, 1.2, 1);
    cg.translate(p.x, 2.8, p.z);
    canopyGeos.push(cg);
  });
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunkGeos), trunkMat);
  trunkMesh.castShadow = true;
  state.scene.add(trunkMesh);
  const canopyMesh = new THREE.Mesh(mergeGeometries(canopyGeos), canopyMat);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  state.scene.add(canopyMesh);

  // Merge ALL lamp posts into one mesh
  const lampGeos = [];
  const lampGlowGeos = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.15 });

  const lampPositions = [
    { x: 7, z: -18 }, { x: -7, z: -20 },
    { x: 7, z: 18 }, { x: -7, z: 20 },
    { x: 18, z: 7 }, { x: -18, z: 7 },
    { x: 20, z: -7 }, { x: -20, z: -7 }
  ];
  lampPositions.forEach(p => {
    const pg = new THREE.CylinderGeometry(0.06, 0.08, 4.5, 5);
    pg.translate(p.x, 2.25, p.z);
    lampGeos.push(pg);
    const ag = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4);
    ag.rotateZ(Math.PI / 2);
    ag.translate(p.x, 4.5, p.z);
    lampGeos.push(ag);
    const lg = new THREE.SphereGeometry(0.25, 6, 6);
    lg.scale(1, 0.6, 1);
    lg.translate(p.x + 0.5, 4.5, p.z);
    lampGlowGeos.push(lg);
  });
  state.scene.add(new THREE.Mesh(mergeGeometries(lampGeos), poleMat));
  state.lampGlowMesh = new THREE.Mesh(mergeGeometries(lampGlowGeos), lampMat);
  state.scene.add(state.lampGlowMesh);

  // Streetlight point lights (off by default, enabled at night)
  lampPositions.forEach(p => {
    const sl = new THREE.PointLight(0xffeedd, 0, 30, 1.2);
    sl.position.set(p.x + 0.5, 4.3, p.z);
    state.scene.add(sl);
    state.streetLights.push(sl);
  });

  // Merge fire hydrants
  const hydrantGeos = [];
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.6, metalness: 0.3 });
  [{ x: 7.5, z: -8 }, { x: -7.5, z: 9 }, { x: 9, z: 7.5 }, { x: -9, z: -7.5 }].forEach(p => {
    const bg = new THREE.CylinderGeometry(0.12, 0.15, 0.55, 6);
    bg.translate(p.x, 0.275, p.z);
    hydrantGeos.push(bg);
    const tg = new THREE.SphereGeometry(0.13, 6, 5);
    tg.translate(p.x, 0.58, p.z);
    hydrantGeos.push(tg);
  });
  state.scene.add(new THREE.Mesh(mergeGeometries(hydrantGeos), hydrantMat));

  // --- BUS STOPS ---
  const shelterMat = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.4, roughness: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.3 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, emissive: 0x112244, emissiveIntensity: 0.3 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.8 });
  const shelterGeos = [];
  const roofGeos = [];
  const signGeos = [];
  const benchGeos = [];

  // Bus stop positions: on the sidewalk beside each lane
  const busStopPositions = [
    { x: -LANE_OFFSET - 3.5, z: BUS_STOP_DIST, rotY: 0 },
    { x: LANE_OFFSET + 3.5,  z: -BUS_STOP_DIST, rotY: Math.PI },
    { x: BUS_STOP_DIST,  z: LANE_OFFSET + 3.5, rotY: -Math.PI / 2 },
    { x: -BUS_STOP_DIST, z: -LANE_OFFSET - 3.5, rotY: Math.PI / 2 }
  ];

  busStopPositions.forEach(bs => {
    const cr = Math.cos(bs.rotY);
    const sr = Math.sin(bs.rotY);
    const rotPt = (lx, ly, lz) => ({ x: bs.x + lx * cr - lz * sr, y: ly, z: bs.z + lx * sr + lz * cr });

    // Back wall
    const wallG = new THREE.BoxGeometry(0.08, 2.4, 2.5);
    const wp = rotPt(-0.5, 1.2, 0);
    wallG.translate(wp.x, wp.y, wp.z);
    shelterGeos.push(wallG);

    // Side panels
    [-1, 1].forEach(side => {
      const sideG = new THREE.BoxGeometry(0.8, 2.4, 0.06);
      const sp = rotPt(-0.1, 1.2, side * 1.2);
      sideG.translate(sp.x, sp.y, sp.z);
      shelterGeos.push(sideG);
    });

    // Roof
    const roofG = new THREE.BoxGeometry(1.2, 0.06, 2.8);
    const rp = rotPt(-0.1, 2.45, 0);
    roofG.translate(rp.x, rp.y, rp.z);
    roofGeos.push(roofG);

    // Bus stop sign post + sign
    const postG = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 5);
    const pp = rotPt(0.3, 1.4, 1.4);
    postG.translate(pp.x, pp.y, pp.z);
    shelterGeos.push(postG);

    const sgG = new THREE.BoxGeometry(0.04, 0.5, 0.5);
    const sgp = rotPt(0.3, 2.7, 1.4);
    sgG.translate(sgp.x, sgp.y, sgp.z);
    signGeos.push(sgG);

    // Bench
    const benchSeatG = new THREE.BoxGeometry(0.5, 0.06, 1.8);
    const bp = rotPt(-0.2, 0.5, 0);
    benchSeatG.translate(bp.x, bp.y, bp.z);
    benchGeos.push(benchSeatG);
    // Bench legs
    [-0.7, 0.7].forEach(off => {
      const legG = new THREE.BoxGeometry(0.06, 0.5, 0.06);
      const lp = rotPt(-0.2, 0.25, off);
      legG.translate(lp.x, lp.y, lp.z);
      benchGeos.push(legG);
    });
  });

  if (shelterGeos.length) {
    const sm = new THREE.Mesh(mergeGeometries(shelterGeos), shelterMat);
    sm.castShadow = true;
    state.scene.add(sm);
  }
  if (roofGeos.length) state.scene.add(new THREE.Mesh(mergeGeometries(roofGeos), roofMat));
  if (signGeos.length) state.scene.add(new THREE.Mesh(mergeGeometries(signGeos), signMat));
  if (benchGeos.length) state.scene.add(new THREE.Mesh(mergeGeometries(benchGeos), benchMat));
}
