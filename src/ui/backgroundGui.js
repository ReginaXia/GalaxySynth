// ui/backgroundGui.js
// lil-gui / dat.GUI 通用（都支持 addFolder / add / addColor）
//
// ✅ 适配 createDreamyBackground() 返回的 bg 对象：
//   bg.uniforms / bg.material.uniforms 存着 Shader uniforms
//   bg.setPalette(keyOrColors) 可切换调色板
//
// 目标：
// 1) UI 必定出现（由 main.js 定位到底部）
// 2) 不再依赖 bgCtrl.params / applyParams（避免你遇到的报错）

export function setupBackgroundGUI(gui, bg) {
  const f = gui.addFolder ? gui.addFolder("Background") : gui;
  if (f.open) f.open();

  const u = bg?.uniforms || bg?.material?.uniforms || bg?.mesh?.material?.uniforms;
  if (!u) {
    console.warn("[BackgroundGUI] no uniforms found on bg:", bg);
    return;
  }

  // 用一个 state 对象承载 UI 值（避免直接绑 uniforms 的 value 引用类型问题）
  const state = {
    palette: "pearl",
    intensity: u.uIntensity?.value ?? 0.75,
    flow:      u.uFlow?.value ?? 1.0,
    scale:     u.uScale?.value ?? 1.0,
    warp:      u.uWarp?.value ?? 0.75,
    detail:    u.uDetail?.value ?? 0.55,
    pearl:     u.uPearl?.value ?? 0.8,
    sparkle:   u.uSparkle?.value ?? 0.15,
    sat:       u.uSat?.value ?? 0.45,
    contrast:  u.uContrast?.value ?? 0.9,
  };

  const setU = (key, v) => {
    const uu = u[key];
    if (!uu) return;
    if (uu.value?.set && typeof v === "object") uu.value.set(v);
    else uu.value = v;
  };

  const add = (key, min, max, step, uniformKey = null, name = null) => {
    const ctrl = f.add(state, key, min, max, step);
    if (name) ctrl.name(name);
    ctrl.onChange?.((v) => setU(uniformKey ?? ("u" + key[0].toUpperCase() + key.slice(1)), v));
    return ctrl;
  };

  // ---- Look ----
  add("intensity", 0.0, 1.6, 0.01, "uIntensity", "Intensity");
  add("flow",      0.0, 2.0, 0.01, "uFlow",      "Flow");
  add("scale",     0.2, 2.8, 0.01, "uScale",     "Scale");
  add("warp",      0.0, 1.6, 0.01, "uWarp",      "Warp");
  add("detail",    0.0, 1.2, 0.01, "uDetail",    "Detail");
  add("pearl",     0.0, 2.0, 0.01, "uPearl",     "Pearl");
  add("sparkle",   0.0, 1.0, 0.01, "uSparkle",   "Sparkle");
  add("sat",       0.0, 1.5, 0.01, "uSat",       "Saturation");
  add("contrast",  0.6, 1.6, 0.01, "uContrast",  "Contrast");

  // ---- Palettes ----
  const palFolder = f.addFolder ? f.addFolder("Palette") : f;
  if (palFolder.open) palFolder.open();

  const paletteOptions = {
    pearl: "pearl (Pearl Shell)",
    candy: "candy (Cotton Candy)",
    aurora: "aurora (Aurora)",
    neo: "neo (Neo)",
  };

  const palCtrl = palFolder.add(state, "palette", paletteOptions).name("Preset");
  palCtrl.onChange?.((k) => {
    if (bg?.setPalette) bg.setPalette(k);
  });

  // 调色板颜色（直接改 uPal0..3）
  const colorState = {
    pal0: rgbToHex(u.uPal0?.value),
    pal1: rgbToHex(u.uPal1?.value),
    pal2: rgbToHex(u.uPal2?.value),
    pal3: rgbToHex(u.uPal3?.value),
  };

  palFolder.addColor(colorState, "pal0").name("Color 0").onChange?.((v)=> setPaletteColor(u, "uPal0", v));
  palFolder.addColor(colorState, "pal1").name("Color 1").onChange?.((v)=> setPaletteColor(u, "uPal1", v));
  palFolder.addColor(colorState, "pal2").name("Color 2").onChange?.((v)=> setPaletteColor(u, "uPal2", v));
  palFolder.addColor(colorState, "pal3").name("Color 3").onChange?.((v)=> setPaletteColor(u, "uPal3", v));
}

function setPaletteColor(uniforms, key, hex) {
  const uu = uniforms?.[key];
  if (!uu?.value?.set) return;
  const c = hexToRgb01(hex);
  uu.value.set(c.r, c.g, c.b);
}

function rgbToHex(v) {
  if (!v) return "#ffffff";
  const r = Math.round(clamp01(v.x ?? v.r ?? 1) * 255);
  const g = Math.round(clamp01(v.y ?? v.g ?? 1) * 255);
  const b = Math.round(clamp01(v.z ?? v.b ?? 1) * 255);
  return "#" + [r,g,b].map(n=>n.toString(16).padStart(2,"0")).join("");
}

function hexToRgb01(hex) {
  const h = (hex || "#ffffff").replace("#","").trim();
  const s = (h.length === 3) ? h.split("").map(ch=>ch+ch).join("") : h.padEnd(6,"f");
  const n = parseInt(s, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function clamp01(x){ return Math.min(1, Math.max(0, x)); }
