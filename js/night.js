// ============================================================
// js/night.js — Night mode system
// ============================================================
import * as THREE from 'three';
import { state } from './state.js';

export function setNightMode(enabled) {
  if (enabled === state.isNightMode) return;
  state.isNightMode = enabled;

  if (enabled) {
    // Dim scene lights
    state.sunLight.intensity = 0.15;
    state.sunLight.color.setHex(0x334466);
    state.fillLight.intensity = 0.05;
    state.ambientLight.intensity = 0.12;
    state.ambientLight.color.setHex(0x1a1a2e);
    state.hemiLight.intensity = 0.08;
    state.hemiLight.color.setHex(0x1a1a3a);
    state.hemiLight.groundColor.setHex(0x0a0a14);

    // Darken sky dome
    const posAttr = state.skyDomeMesh.geometry.getAttribute('position');
    const colors = [];
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const t = Math.max(0, y / 150);
      // Dark blue-black sky gradient
      colors.push(
        0.02 + 0.04 * t,
        0.02 + 0.06 * t,
        0.06 + 0.12 * t
      );
    }
    state.skyDomeMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Dark fog
    state.scene.fog.color.setHex(0x0a0a18);
    state.scene.fog.density = 0.012;

    // Tone mapping for night
    state.renderer.toneMappingExposure = 0.8;

    // Disable shadows at night (sun is dimmed, shadows not visible)
    state.renderer.shadowMap.enabled = false;

    // Turn on streetlights
    state.streetLights.forEach(sl => { sl.intensity = 50; });
    if (state.lampGlowMesh) {
      state.lampGlowMesh.material.emissiveIntensity = 1.0;
      state.lampGlowMesh.material.emissive.setHex(0xffeeaa);
    }

    // Boost headlights on existing cars
    state.cars.forEach(c => updateCarNightLights(c, true));

    // Building windows glow at night
    state.buildingMeshes.forEach(b => {
      const mats = Array.isArray(b.material) ? b.material : [b.material];
      mats.forEach(m => {
        if (m.map) {
          m.emissive = m.emissive || new THREE.Color();
          m.emissive.setHex(0xffeeaa);
          m.emissiveIntensity = 0.4;
          m.emissiveMap = m.map;
        }
      });
    });
  } else {
    // Restore day lights
    state.sunLight.intensity = 1.5;
    state.sunLight.color.setHex(0xfff0dd);
    state.fillLight.intensity = 0.4;
    state.ambientLight.intensity = 0.5;
    state.ambientLight.color.setHex(0x606878);
    state.hemiLight.intensity = 0.35;
    state.hemiLight.color.setHex(0x87CEEB);
    state.hemiLight.groundColor.setHex(0x3a5c2a);

    // Restore sky dome
    const posAttr = state.skyDomeMesh.geometry.getAttribute('position');
    const colors = [];
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const t = Math.max(0, y / 150);
      colors.push(
        0.53 + (0.15 - 0.53) * t,
        0.81 + (0.35 - 0.81) * t,
        0.92 + (0.75 - 0.92) * t
      );
    }
    state.skyDomeMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Restore fog
    state.scene.fog.color.setHex(0xc8dfe8);
    state.scene.fog.density = 0.008;

    state.renderer.toneMappingExposure = 1.1;

    // Re-enable shadows for daytime
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.needsUpdate = true;

    // Turn off streetlights
    state.streetLights.forEach(sl => { sl.intensity = 0; });
    if (state.lampGlowMesh) {
      state.lampGlowMesh.material.emissiveIntensity = 0.15;
    }

    // Dim headlights on existing cars
    state.cars.forEach(c => updateCarNightLights(c, false));

    // Reset building window glow
    state.buildingMeshes.forEach(b => {
      const mats = Array.isArray(b.material) ? b.material : [b.material];
      mats.forEach(m => {
        if (m.emissiveMap) {
          m.emissiveIntensity = 0;
          m.emissiveMap = null;
        }
      });
    });
  }
}

export function updateCarNightLights(car, night) {
  if (!car.mesh || car.isPedestrian) return;
  // Tag materials on first call so we don't traverse every time
  if (!car._nightTagged) {
    car._nightMats = { headlights: [], taillights: [] };
    car.mesh.traverse(child => {
      if (!child.isMesh || !child.material) return;
      const mat = child.material;
      if (mat.emissive && mat.emissiveIntensity !== undefined) {
        const emHex = mat.emissive.getHex();
        if (emHex === 0xffffcc || emHex === 0xffeeaa) {
          car._nightMats.headlights.push(mat);
        } else if (emHex === 0xff0000 || emHex === 0xaa0000) {
          car._nightMats.taillights.push(mat);
        }
      }
    });
    car._nightTagged = true;
  }
  // Boost/dim emissive glow — no SpotLights needed
  for (const mat of car._nightMats.headlights) {
    mat.emissiveIntensity = night ? 3.0 : 0.7;
  }
  for (const mat of car._nightMats.taillights) {
    mat.emissiveIntensity = night ? 1.5 : 0.5;
  }
}
