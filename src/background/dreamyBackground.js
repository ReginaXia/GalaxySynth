// src/background/dreamyBackground.js
import * as THREE from "three";

// Vite: load shader as raw strings
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Y2K Background
 * - Fullscreen quad in clip space
 * - Slow breathing liquid gradient
 * - Optional: mouse parallax + iridescent rings + glitter specks
 */
export function createDreamyBackground(scene) {
  // Fullscreen quad (clip-space)
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

      // NEW: interaction & style knobs
      uMouse: { value: new THREE.Vector2(0.5, 0.5) }, // 0..1
      uParallax: { value: 0.6 }, // 0..1
      uRings: { value: 0.7 },    // 0..1
      uGlitter: { value: 0.6 },  // 0..1

      uTint: { value: new THREE.Vector3(1.0, 0.45, 0.85) },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // Always behind everything
  mesh.renderOrder = -10000;

  scene.add(mesh);

  return {
    mesh,
    material: mat,

    update(t) {
      mat.uniforms.uTime.value = t;
    },

    // x,y: 0..1 (screen normalized)
    setMouse01(x, y) {
      mat.uniforms.uMouse.value.set(x, y);
    },

    // ✅ add tint
    setStyle({ parallax, rings, glitter, intensity, tint } = {}) {
      if (parallax !== undefined) mat.uniforms.uParallax.value = parallax;
      if (rings !== undefined) mat.uniforms.uRings.value = rings;
      if (glitter !== undefined) mat.uniforms.uGlitter.value = glitter;
      if (intensity !== undefined) mat.uniforms.uIntensity.value = intensity;

      if (tint !== undefined) {
        // tint: [r,g,b] or THREE.Color-ish
        if (Array.isArray(tint)) mat.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
        else if (tint?.isColor) mat.uniforms.uTint.value.set(tint.r, tint.g, tint.b);
        else if (tint?.x !== undefined) mat.uniforms.uTint.value.set(tint.x, tint.y, tint.z);
      }
    },


    // handy getters (optional)
    getUniforms() {
      return mat.uniforms;
    },
  };
}
