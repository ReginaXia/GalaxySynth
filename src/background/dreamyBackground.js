// src/background/dreamyBackground.js
import * as THREE from "three";

// Vite: load shader as raw strings
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Background (Audio-driven)
 * - Fullscreen quad
 * - Deep space when idle, liquid pastel when playing
 * - Controlled by:
 *   - setStyle(): parallax/rings/glitter/intensity/tint/emergence
 *   - setAudioDrive(): leadE/pitch01/vel01/theta01 (all 0..1)
 */
export function createDreamyBackground(scene) {
  const geo = new THREE.PlaneGeometry(2, 2);

  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.7 },

      uMouse: { value: new THREE.Vector2(0.5, 0.5) }, // 0..1
      uParallax: { value: 0.6 }, // 0..1
      uRings: { value: 0.7 },    // 0..1
      uGlitter: { value: 0.6 },  // 0..1

      // color direction (0..1 rgb)
      uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },

      // 0 = deep space, 1 = full pastel space
      uEmergence: { value: 0.0 },

      // audio-driven (0..1)
      uLeadE: { value: 0.0 },
      uPitch01: { value: 0.5 },
      uVel01: { value: 0.0 },
      uTheta01: { value: 0.0 },
    },
  });

  // Background should NOT be tone-mapped (prevents milky wash)
  mat.toneMapped = false;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000;
  scene.add(mesh);

  return {
    mesh,
    material: mat,

    update(t) {
      mat.uniforms.uTime.value = t;
    },

    setMouse01(x, y) {
      mat.uniforms.uMouse.value.set(x, y);
    },

    // Quick style tuning (all optional)
    setStyle({ parallax, rings, glitter, intensity, tint, emergence } = {}) {
      if (parallax !== undefined) mat.uniforms.uParallax.value = parallax;
      if (rings !== undefined) mat.uniforms.uRings.value = rings;
      if (glitter !== undefined) mat.uniforms.uGlitter.value = glitter;
      if (intensity !== undefined) mat.uniforms.uIntensity.value = intensity;

      if (tint !== undefined) {
        if (Array.isArray(tint)) mat.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
        else if (tint?.isColor) mat.uniforms.uTint.value.set(tint.r, tint.g, tint.b);
        else if (tint?.x !== undefined) mat.uniforms.uTint.value.set(tint.x, tint.y, tint.z);
      }

      if (emergence !== undefined) {
        mat.uniforms.uEmergence.value = emergence;
      }
    },

    // Audio-driven controls (all optional)
    setAudioDrive({ leadE, pitch01, vel01, theta01 } = {}) {
      if (leadE !== undefined) mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01 !== undefined) mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;
    },

    getUniforms() {
      return mat.uniforms;
    },
  };
}
