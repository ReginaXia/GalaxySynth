// src/background/dreamyBackground.js
import * as THREE from "three";
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

/**
 * Dreamy Background (audio-driven)
 * - Sky sphere following camera
 * - Non-rainbow vivid palette + pearl film + ink injection
 */
export function createDreamyBackground(scene) {
  const geo = new THREE.SphereGeometry(80, 32, 16);

  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },

      // audio-driven
      uLeadE: { value: 0.0 },
      uPitch01: { value: 0.0 },
      uVel01: { value: 0.0 },
      uTheta01: { value: 0.0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },

      uPulse: { value: 0.0 },
      uNoteHue: { value: 0.0 }, // ✅ 现在当作 noteIndex01 / 音阶位置用
      uNoteSeed: { value: 0.0 },
      uNotePos: { value: new THREE.Vector2(0.5, 0.5) },

      // base deep color
      uBase: { value: new THREE.Color("#131527").toArray().slice(0, 3) },

      // vivid palette (non-rainbow) — 你可以随便换成你喜欢的“梦幻色组”
      uPal0: { value: new THREE.Color("#7C5CFF").toArray().slice(0, 3) }, // 紫蓝
      uPal1: { value: new THREE.Color("#00D9FF").toArray().slice(0, 3) }, // 亮青
      uPal2: { value: new THREE.Color("#FF4FD8").toArray().slice(0, 3) }, // 亮粉
      uPal3: { value: new THREE.Color("#FFE36E").toArray().slice(0, 3) }, // 香槟黄

      // look controls
      uExposure: { value: 1.45 },   // 更亮
      uSaturation: { value: 1.55 }, // 高饱和（不灰）
      uFlow: { value: 1.0 },        // 流速
      uWarp: { value: 0.65 },       // 形状扭曲
      uCloud: { value: 1.15 },      // 云尺度
      uPearl: { value: 0.95 },      // 珠光膜强度
      uInk: { value: 1.25 },        // 注入强度
    },
  });

  mat.toneMapped = false;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10000;
  scene.add(mesh);

  // 小工具：把 Color / array 写进 vec3 uniform
  const setVec3 = (u, v) => {
    if (!v) return;
    if (Array.isArray(v)) u.value = [v[0], v[1], v[2]];
    else if (v.isColor) u.value = [v.r, v.g, v.b];
    else if (typeof v === "string") {
      const c = new THREE.Color(v);
      u.value = [c.r, c.g, c.b];
    }
  };

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

    /**
     * 给 GUI 调：色盘、饱和度、曝光、流动、形状强度……
     */
    setLook({
      base,
      palette, // [c0,c1,c2,c3] each can be "#rrggbb" or THREE.Color or [r,g,b]
      exposure,
      saturation,
      flow,
      warp,
      cloud,
      pearl,
      ink,
    } = {}) {
      if (base !== undefined) setVec3(mat.uniforms.uBase, base);

      if (palette && palette.length >= 4) {
        setVec3(mat.uniforms.uPal0, palette[0]);
        setVec3(mat.uniforms.uPal1, palette[1]);
        setVec3(mat.uniforms.uPal2, palette[2]);
        setVec3(mat.uniforms.uPal3, palette[3]);
      }

      if (exposure !== undefined) mat.uniforms.uExposure.value = exposure;
      if (saturation !== undefined) mat.uniforms.uSaturation.value = saturation;
      if (flow !== undefined) mat.uniforms.uFlow.value = flow;
      if (warp !== undefined) mat.uniforms.uWarp.value = warp;
      if (cloud !== undefined) mat.uniforms.uCloud.value = cloud;
      if (pearl !== undefined) mat.uniforms.uPearl.value = pearl;
      if (ink !== undefined) mat.uniforms.uInk.value = ink;
    },

    /**
     * 每帧：从主逻辑喂音频驱动
     */
    setAudioDrive({ leadE, pitch01, vel01, theta01 } = {}) {
      if (leadE !== undefined) mat.uniforms.uLeadE.value = leadE;
      if (pitch01 !== undefined) mat.uniforms.uPitch01.value = pitch01;
      if (vel01 !== undefined) mat.uniforms.uVel01.value = vel01;
      if (theta01 !== undefined) mat.uniforms.uTheta01.value = theta01;
    },

    /**
     * 每次触发一个音符：注入一次颜色
     * noteIndex01：建议用 (degree / 7) 或 (midi%12 / 12)
     */
    setNotePulse({ pulse, noteIndex01, seed, x, y } = {}) {
      if (pulse !== undefined) mat.uniforms.uPulse.value = pulse;
      if (noteIndex01 !== undefined) mat.uniforms.uNoteHue.value = noteIndex01;
      if (seed !== undefined) mat.uniforms.uNoteSeed.value = seed;
      if (x !== undefined && y !== undefined) mat.uniforms.uNotePos.value.set(x, y);
    },

    getUniforms() {
      return mat.uniforms;
    },
  };
}