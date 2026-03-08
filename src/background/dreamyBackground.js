import * as THREE from "three";  // Make sure THREE is imported correctly

import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

export const BACKGROUND_PALETTES = {
  pearl: { name: "Pearl Shell", colors: ["#73EFFF","#86A8FF","#C9B8FF","#FF9FD2"] },
  candy: { name: "Cotton Candy", colors: ["#61D9FF","#FF6BD6","#FFB86B","#B6FF8A"] },
  aurora:{ name: "Aurora Soft",  colors: ["#45E9FF","#6F86FF","#BDA7FF","#A7FFD9"] },
  cosmic:{ name: "Cosmic Iris",  colors: ["#52E9FF","#6A7CFF","#A99BFF","#E2A6FF"] },
  neo:   { name: "Neo Dream",    colors: ["#3DFFB8","#3D7BFF","#FF3DF2","#FFE83D"] },
};

function hexToVec3(hex){
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

export async function createDreamyBackground(scene, camera = null, opts = {}){
  const radius = opts.radius ?? 2000;
  const base = new THREE.Color(opts.baseColor ?? "#070B18");
  const paletteKey = opts.palette ?? "aurora";
  const pal = BACKGROUND_PALETTES[paletteKey] ?? BACKGROUND_PALETTES.pearl;

  const mainColor = new THREE.Color("#7ca0ff");

  const uniforms = {
    uTime: { value: 0 },
    uLeadE:   { value: 0 },
    uPitch01: { value: 0.5 },
    uVel01:   { value: 0.0 },
    uTheta01: { value: 0.0 },
    uMouse:   { value: new THREE.Vector2(0.5, 0.5) },

    uBase:      { value: new THREE.Vector3(base.r, base.g, base.b) },
    uIntensity: { value: opts.intensity ?? 0.82 },
    uFlow:      { value: opts.flow ?? 1.0 },
    uScale:     { value: opts.scale ?? 0.9 },
    uWarp:      { value: opts.warp ?? 0.58 },
    uDetail:    { value: opts.detail ?? 0.42 },
    uPearl:     { value: opts.pearl ?? 0.92 },
    uSparkle:   { value: opts.sparkle ?? 0.15 },
    uSat:       { value: opts.sat ?? 0.45 },
    uContrast:  { value: opts.contrast ?? 0.9 },

    uPal0: { value: hexToVec3(pal.colors[0]) },
    uPal1: { value: hexToVec3(pal.colors[1]) },
    uPal2: { value: hexToVec3(pal.colors[2]) },
    uPal3: { value: hexToVec3(pal.colors[3]) },

  };

  uniforms.uFlow.value = 0.0;
  uniforms.uSparkle.value = 0.0;

  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });

  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);

  // 新增的 setMainColor 方法
  function setMainColor(colorLike) {
    if (!colorLike) return;
    try {
      mainColor.set(colorLike);
      const u = uniforms || mat?.uniforms || mesh?.material?.uniforms;
      if (u?.uTint) u.uTint.value.set(mainColor.r, mainColor.g, mainColor.b);
      if (u?.uMainColor) u.uMainColor.value.set(mainColor);
    } catch (e) {
      console.warn("setMainColor failed:", e);
    }
  }

  // 新增的 setAudioDrive 方法，用来控制流彩效果
  function setAudioDrive({ sparkle, intensity, ...otherParams }) {
    const u = uniforms || mat?.uniforms || mesh?.material?.uniforms;
    if (u?.uSparkle) u.uSparkle.value = sparkle ?? 0.15;
    if (u?.uIntensity) u.uIntensity.value = intensity ?? 1.0;
  }

  setMainColor(mainColor);

  const api = {
    mesh,
    material: mat,
    uniforms,
    setPalette(keyOrColors){
      let colors = null;
      if (typeof keyOrColors === "string"){
        colors = BACKGROUND_PALETTES[keyOrColors]?.colors ?? null;
      } else if (Array.isArray(keyOrColors) && keyOrColors.length >= 4){
        colors = keyOrColors;
      }
      if (!colors) return;
      uniforms.uPal0.value.copy(hexToVec3(colors[0]));
      uniforms.uPal1.value.copy(hexToVec3(colors[1]));
      uniforms.uPal2.value.copy(hexToVec3(colors[2]));
      uniforms.uPal3.value.copy(hexToVec3(colors[3]));
    },

    setAudio({
      leadE = uniforms.uLeadE.value,
      pitch01 = uniforms.uPitch01.value,
      vel01 = uniforms.uVel01.value,
      theta01 = uniforms.uTheta01.value,
    } = {}) {
      uniforms.uLeadE.value   = clamp01(leadE);
      uniforms.uPitch01.value = clamp01(pitch01);
      uniforms.uVel01.value   = clamp01(vel01);
      uniforms.uTheta01.value = clamp01(theta01);
    },

    setMouse01(x,y){ uniforms.uMouse.value.set(clamp01(x), clamp01(y)); },

    update(dt, cam = camera) {
      uniforms.uTime.value += dt;
      if (cam) mesh.position.copy(cam.position);
    },
  };

  return api;
}

// 导出 `setupBackgroundGUI`，确保 main.js 中可以使用
export function setupBackgroundGUI(gui, bg) {
  if (!gui || !bg) return;
  const params = {
    palette: "aurora",
    intensity: bg.uniforms.uIntensity.value,
    flow: bg.uniforms.uFlow.value,
    scale: bg.uniforms.uScale.value,
    warp: bg.uniforms.uWarp.value,
    detail: bg.uniforms.uDetail.value,
    pearl: bg.uniforms.uPearl.value,
    sparkle: bg.uniforms.uSparkle.value,
    sat: bg.uniforms.uSat.value,
    contrast: bg.uniforms.uContrast.value,
  };

  const folder = gui.addFolder?.("Background (Pearl)") ?? gui;

  folder.add(params, "palette", Object.keys(BACKGROUND_PALETTES)).onChange(v => bg.setPalette(v));
  folder.add(params, "intensity", 0.3, 2.5, 0.01).onChange(v => bg.uniforms.uIntensity.value = v);
  folder.add(params, "flow", 0.0, 2.0, 0.01).onChange(v => bg.uniforms.uFlow.value = v);
  folder.add(params, "scale", 0.2, 2.5, 0.01).onChange(v => bg.uniforms.uScale.value = v);
  folder.add(params, "warp", 0.0, 1.4, 0.01).onChange(v => bg.uniforms.uWarp.value = v);
  folder.add(params, "detail", 0.0, 1.2, 0.01).onChange(v => bg.uniforms.uDetail.value = v);
  folder.add(params, "pearl", 0.0, 2.0, 0.01).onChange(v => bg.uniforms.uPearl.value = v);
  folder.add(params, "sparkle", 0.0, 1.0, 0.01).onChange(v => bg.uniforms.uSparkle.value = v);
  folder.add(params, "sat", 0.0, 1.5, 0.01).name("saturation").onChange(v => bg.uniforms.uSat.value = v);
  folder.add(params, "contrast", 0.7, 1.7, 0.01).onChange(v => bg.uniforms.uContrast.value = v);
  return folder;
}
