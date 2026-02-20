// src/background/dreamyBackground.js
import * as THREE from "three";

// Vite: load shader as raw strings
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Background (audio-driven)
 * - Fullscreen quad
 * - Lead drives emergence + liquid paint injection
 */
export function createDreamyBackground(scene) {
  const geo = new THREE.SphereGeometry(80, 32, 16)


  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.7 },

      uMouse: { value: new THREE.Vector2(0.5, 0.5) }, // 0..1
      uParallax: { value: 0.6 }, // 0..1
      uRings: { value: 0.7 },    // 0..1
      uGlitter: { value: 0.6 },  // 0..1

      // base color + emergence
      uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uEmergence: { value: 0.0 },

      // ✅ NEW: audio-driven uniforms (for liquid motion & color)
      uLeadE:   { value: 0.0 },                   // 0..1
      uPitch01: { value: 0.0 },                   // 0..1
      uVel01:   { value: 0.0 },                   // 0..1
      uTheta01: { value: 0.0 },                   // 0..1

      uPulse:   { value: 0.0 },                   // 0..1 note trigger
      uNoteHue: { value: 0.86 },                  // 0..1 hue
      uNoteSeed:{ value: 0.0 },                   // float seed
      uNotePos: { value: new THREE.Vector2(0.5, 0.5) }, // 0..1

      uMainColor: { value: new THREE.Color("#ff7ccf") }, // 你要的“纯粉”起点


      uBaseHue: { value: 0.78 },   // 你可以改成 0.62/0.75 试试
      uWarmCool:{ value: 0 },   // 更冷更宇宙

    },

  });

  mat.name = "DreamyBackground";
  
  mat.toneMapped = false;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000;
  scene.add(mesh);

  return {
    mesh,
    material: mat,

    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mesh.position.copy(camera.position); // ✅ 关键：跟随相机平移，像无限远背景
    },


    setMouse01(x, y) {
      mat.uniforms.uMouse.value.set(x, y);
    },

    setStyle({ parallax, rings, glitter, intensity, tint, emergence,
        leadE, pitch01, vel01, theta01,
        pulse, noteHue, noteSeed, notePos 
      } = {}) {
      // audio-driven (optional)
      if (leadE !== undefined)   mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01 !== undefined)   mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;

      if (pulse !== undefined)   mat.uniforms.uPulse.value = pulse;
      if (noteHue !== undefined) mat.uniforms.uNoteHue.value = noteHue;
      if (noteSeed !== undefined) mat.uniforms.uNoteSeed.value = noteSeed;
      if (notePos !== undefined) mat.uniforms.uNotePos.value.set(notePos[0], notePos[1]);

      if (parallax !== undefined) mat.uniforms.uParallax.value = parallax;
      if (rings !== undefined) mat.uniforms.uRings.value = rings;
      if (glitter !== undefined) mat.uniforms.uGlitter.value = glitter;
      if (intensity !== undefined) mat.uniforms.uIntensity.value = intensity;

      if (tint !== undefined) {
        if (Array.isArray(tint)) mat.uniforms.uTint.value.set(tint[0], tint[1], tint[2]);
        else if (tint?.isColor) mat.uniforms.uTint.value.set(tint.r, tint.g, tint.b);
        else if (tint?.x !== undefined) mat.uniforms.uTint.value.set(tint.x, tint.y, tint.z);
      }

      if (emergence !== undefined) mat.uniforms.uEmergence.value = emergence;
    },

    setAudioDrive({ leadE, pitch01, vel01, theta01 } = {}) {
      if (leadE   !== undefined) mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01   !== undefined) mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;
    },

    setNotePulse({ pulse, hue, seed, x, y } = {}) {
      if (pulse !== undefined) mat.uniforms.uPulse.value = pulse;
      if (hue   !== undefined) mat.uniforms.uNoteHue.value = hue;
      if (seed  !== undefined) mat.uniforms.uNoteSeed.value = seed;
      if (x !== undefined && y !== undefined) mat.uniforms.uNotePos.value.set(x, y);
    },

    getUniforms() {
      return mat.uniforms;
    },
  };
}
