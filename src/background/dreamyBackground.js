import * as THREE from "three";
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

export const BACKGROUND_PALETTES = {
  pearl: { name: "Pearl Shell", colors: ["#7AF7FF","#FF4FD8","#C9A6FF","#FFD27A"] },
  candy: { name: "Cotton Candy", colors: ["#61D9FF","#FF6BD6","#FFB86B","#B6FF8A"] },
  aurora:{ name: "Aurora Soft",  colors: ["#4CF0FF","#7E7CFF","#FF65C8","#8CFFB8"] },
  neo:   { name: "Neo Dream",    colors: ["#3DFFB8","#3D7BFF","#FF3DF2","#FFE83D"] },
};

function hexToVec3(hex){
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

export async function createDreamyBackground(scene, camera = null, opts = {}){
  const radius = opts.radius ?? 2000;

  const base = new THREE.Color(opts.baseColor ?? "#131527");
  const paletteKey = opts.palette ?? "pearl";
  const pal = BACKGROUND_PALETTES[paletteKey] ?? BACKGROUND_PALETTES.pearl;

  const uniforms = {
    uTime: { value: 0 },

    uLeadE:   { value: 0 },
    uPitch01: { value: 0.5 },
    uVel01:   { value: 0.0 },
    uTheta01: { value: 0.0 },
    uMouse:   { value: new THREE.Vector2(0.5, 0.5) },

    uBase:      { value: new THREE.Vector3(base.r, base.g, base.b) },
    uIntensity: { value: opts.intensity ?? 0.75 },
    uFlow:      { value: opts.flow ?? 1.0 },
    uScale:     { value: opts.scale ?? 1.0 },
    uWarp:      { value: opts.warp ?? 0.75 },
    uDetail:    { value: opts.detail ?? 0.55 },
    uPearl:     { value: opts.pearl ?? 0.8 },
    uSparkle:   { value: opts.sparkle ?? 0.15 },
    uSat:       { value: opts.sat ?? 0.45 },
    uContrast:  { value: opts.contrast ?? 0.9 },

    uPal0: { value: hexToVec3(pal.colors[0]) },
    uPal1: { value: hexToVec3(pal.colors[1]) },
    uPal2: { value: hexToVec3(pal.colors[2]) },
    uPal3: { value: hexToVec3(pal.colors[3]) },

    uPulse:    { value: 0 },
    uNoteHue:  { value: 0 },
    uNoteSeed: { value: 0 },
    uNotePos:  { value: new THREE.Vector2(0.5, 0.5) },
  };

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
      pulse = 0,
      noteSeed = 0,
      notePos = null,
      noteHue = 0,
    } = {}){
      uniforms.uLeadE.value   = clamp01(leadE);
      uniforms.uPitch01.value = clamp01(pitch01);
      uniforms.uVel01.value   = clamp01(vel01);
      uniforms.uTheta01.value = clamp01(theta01);
      uniforms.uPulse.value   = clamp01(pulse);
      uniforms.uNoteSeed.value = noteSeed ?? 0;
      uniforms.uNoteHue.value  = noteHue ?? 0;
      if (notePos && typeof notePos.x === "number"){
        uniforms.uNotePos.value.set(clamp01(notePos.x), clamp01(notePos.y));
      }
    },

    setMouse01(x,y){ uniforms.uMouse.value.set(clamp01(x), clamp01(y)); },

    update(dt, cam = camera){
      uniforms.uTime.value += dt;
      if (cam) mesh.position.copy(cam.position);
    },
  };

  return api;
}

export function setupBackgroundGUI(gui, bg){
  if(!gui || !bg) return;
  const params = {
    palette: "pearl",
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


  // ---------- Custom palette preset (name + 4 colors) ----------
  const STORAGE_KEY = "gs_bg_palettes_v1";

  // 1) load saved presets from localStorage (optional but recommended)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved && typeof saved === "object") {
      for (const [k, v] of Object.entries(saved)) {
        if (v?.colors?.length >= 4) BACKGROUND_PALETTES[k] = v;
      }
    }
  } catch {}

  // 2) palette dropdown (keep a controller reference so we can refresh options)
  let paletteCtrl = null;
  const paletteParams = { palette: params.palette };

  // 重新创建 palette 下拉（覆盖你原来的那一行 folder.add(params, "palette"... ) 也行）
  // 如果你不想改原来那行，就把原来那行删掉/注释掉，再用这段。
  paletteCtrl = folder
    .add(paletteParams, "palette", Object.keys(BACKGROUND_PALETTES))
    .name("palette")
    .onChange((v) => {
      params.palette = v;
      bg.setPalette(v);
    });

  // 3) custom editor UI
  const custom = {
    name: "Regina_Pink",
    c0: "#FF4FD8",
    c1: "#FFE6F3",
    c2: "#C9A6FF",
    c3: "#7AF7FF",
    apply: () => {
      bg.setPalette([custom.c0, custom.c1, custom.c2, custom.c3]);
    },
    save: () => {
      // key: 用名字生成一个稳定 key（避免空格/中文导致奇怪 key）
      const raw = (custom.name || "Custom").trim();
      const key = raw
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_\-]/g, "") || "custom";

      // 写入内存预设
      BACKGROUND_PALETTES[key] = { name: raw, colors: [custom.c0, custom.c1, custom.c2, custom.c3] };

      // 持久化到 localStorage
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        saved[key] = BACKGROUND_PALETTES[key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {}

      // 刷新下拉选项（lil-gui 支持 controller.options(...)）
      if (paletteCtrl?.options) {
        paletteCtrl.options(Object.keys(BACKGROUND_PALETTES));
      }

      // 立刻切到新预设并应用
      paletteParams.palette = key;
      params.palette = key;
      bg.setPalette(key);
    },
  };

  const customFolder = folder.addFolder?.("Custom Palette") ?? folder;
  customFolder.add(custom, "name").name("name");
  customFolder.addColor(custom, "c0").name("color 0");
  customFolder.addColor(custom, "c1").name("color 1");
  customFolder.addColor(custom, "c2").name("color 2");
  customFolder.addColor(custom, "c3").name("color 3");
  customFolder.add(custom, "apply").name("apply (no save)");
  customFolder.add(custom, "save").name("save preset");


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