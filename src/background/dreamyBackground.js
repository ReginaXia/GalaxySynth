// src/background/dreamyBackground.js
import * as THREE from "three";

// Vite: load shader as raw strings
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Background (audio-driven sky-sphere)
 * - Inside-facing sphere (BackSide)
 * - Always follows camera position (infinite sky)
 * - Audio drives vivid dreamy hue + injection + sparkles
 */
export function createDreamyBackground(scene) {
  // Higher segments to avoid faceted look
  const geo = new THREE.SphereGeometry(80, 64, 32);

  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },

      // 0..1 mouse in screen UV
      uMouse01: { value: new THREE.Vector2(0.5, 0.5) },

      // base/night + tint (NOTE: for vivid mode, tint should be white to avoid "pink/purple dye")
      uBase: { value: new THREE.Color("#131527") },
      uTint: { value: new THREE.Color("#ffffff") },

      // audio drive
      uLeadE: { value: 0.0 },
      uPitch01: { value: 0.0 },
      uVel01: { value: 0.0 },
      uTheta01: { value: 0.0 },
      uPulse: { value: 0.0 },
    },
  });

  // Important: we want pure colors (no tonemapping)
  mat.toneMapped = false;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000; // always behind
  scene.add(mesh);

  return {
    mesh,
    material: mat,

    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mesh.position.copy(camera.position);
    },

    setMouse01(x, y) {
      mat.uniforms.uMouse01.value.set(x, y);
    },

    setBaseColor(hex) {
      mat.uniforms.uBase.value.set(hex);
    },

    // NOTE: "tint" is no longer the main color anchor, keep it white unless you intentionally want a dye
    setTintColor(hex) {
      mat.uniforms.uTint.value.set(hex);
    },

    setAudioDrive({ leadE, pitch01, vel01, theta01, pulse } = {}) {
      if (leadE !== undefined) mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01 !== undefined) mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;
      if (pulse !== undefined) mat.uniforms.uPulse.value = pulse;
    },

    getUniforms() {
      return mat.uniforms;
    },
  };
}