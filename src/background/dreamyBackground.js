// src/background/dreamyBackground.js
import * as THREE from "three";

// Vite: load shader as raw strings
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Background (audio-driven sky-sphere)
 * - Inside-facing sphere (BackSide)
 * - Always follows camera position (infinite sky)
 * - Audio drives iridescent liquid film + ink injection + sparkles
 */
export function createDreamyBackground(scene) {
  // ✅ Higher segments to avoid faceted "triangle" look
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
      uIntensity: { value: 0.9 },

      // 0..1
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },

      // 🎨 base / main
      uBaseRGB: { value: new THREE.Color("#131527") },
      uMainRGB: { value: new THREE.Color("#ff7ccf") },

      // 🎵 audio drive
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
      mat.uniforms.uMouse.value.set(x, y);
    },

    setBaseColor(hex) {
      mat.uniforms.uBaseRGB.value.set(hex);
    },

    setMainColor(hex) {
      mat.uniforms.uMainRGB.value.set(hex);
    },

    setAudioDrive({ leadE, pitch01, vel01, theta01, pulse } = {}) {
      if (leadE !== undefined) mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01 !== undefined) mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;
      if (pulse !== undefined) mat.uniforms.uPulse.value = pulse;
    },

    setIntensity(v) {
      mat.uniforms.uIntensity.value = v;
    },

    getUniforms() {
      return mat.uniforms;
    },
  };
}
