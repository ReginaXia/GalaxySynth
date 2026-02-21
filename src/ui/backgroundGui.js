// ui/backgroundGui.js
// Works with both lil-gui and dat.GUI (both have addFolder/add/addColor)

export function setupBackgroundGUI(gui, bgCtrl) {
  // bgCtrl: 你背景控制器（你可以按我下面的接口实现）
  // 需要：bgCtrl.params + bgCtrl.applyParams(partial) + bgCtrl.setPalette(index, hex) + bgCtrl.setNoise(url)

  const f = gui.addFolder ? gui.addFolder("Background") : gui; // 兜底
  if (f.open) f.open();

  // --- numeric params ---
  const p = bgCtrl.params;

  const add = (obj, key, min, max, step) => {
    const c = f.add(obj, key, min, max, step);
    c.onChange?.(() => bgCtrl.applyParams({ [key]: obj[key] }));
    return c;
  };

  // 亮度/饱和度（最关键）
  add(p, "brightness", 0.2, 3.0, 0.01);
  add(p, "saturation", 0.0, 2.5, 0.01);

  // 扰动与流动（性能关键）
  add(p, "warp", 0.0, 1.2, 0.01);
  add(p, "flow", 0.0, 2.0, 0.01);

  // 音乐注入强度（避免“热量图硬切”）
  add(p, "ink", 0.0, 2.5, 0.01);
  add(p, "bandSoft", 0.0, 1.0, 0.01);

  // --- palette colors ---
  const palFolder = f.addFolder ? f.addFolder("Palette") : f;
  if (palFolder.open) palFolder.open();

  // 你可以改成 4 色也行（更“定制”，更不彩虹）
  const pal = p.palette;

  for (let i = 0; i < pal.length; i++) {
    // lil-gui 和 dat.GUI 都支持 addColor
    const c = palFolder.addColor(pal, i).name(`Color ${i}`);
    c.onChange?.((v) => bgCtrl.setPalette(i, v));
  }

  // --- optional noise texture picker ---
  const noiseFolder = f.addFolder ? f.addFolder("Noise") : f;
  if (noiseFolder.open) noiseFolder.open();

  const noiseOptions = {
    "None (procedural)": "",
    "Soft Cloud": "assets/noise/cloud_soft.png",
    "Pearl Grain": "assets/noise/pearl_grain.png",
    "Wispy Streak": "assets/noise/wispy_streak.png",
  };

  const noiseState = { noise: p.noiseUrl || "" };
  const noiseCtrl = noiseFolder.add(noiseState, "noise", noiseOptions).name("NoiseTex");
  noiseCtrl.onChange?.((url) => bgCtrl.setNoise(url));
}