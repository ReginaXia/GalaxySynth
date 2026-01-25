// src/ui/meteorGui.js
import GUI from "lil-gui";

export function setupMeteorGUI(meteorSystem) {
  const { params } = meteorSystem;

  const gui = new GUI({ title: "🌠 Meteor Synth" });

  // -------------------------------------------------
  // Helper
  // -------------------------------------------------
  const lerp = (a, b, t) => a + (b - a) * t;

  // -------------------------------------------------
  // Meteors (基础控制)
  // -------------------------------------------------
  const f0 = gui.addFolder("Meteors");
  f0.add(params, "enabled").name("Enable");
  f0.add(params, "spawnRate", 0.0, 2.0, 0.01).name("Spawn Rate");
  f0.add(params, "areaRadius", 2.0, 12.0, 0.1).name("Area Radius");

  // -------------------------------------------------
  // STYLE（创作者主面板）
  // -------------------------------------------------
  const style = gui.addFolder("Style");

  // ---- Color
  style.addColor(params, "baseColor").name("Base Color");
  style.add(params, "headSizeMul", 0.35, 1.2, 0.001).name("Head Size");
  style.add(params, "headGlowMul", 0.35, 1.6, 0.001).name("Head Brightness");
  style.add(params, "styleVariation", 0.0, 1.0, 0.001).name("Variation");
  style.add(params, "styleTheme", ["pink", "blue", "purple", "rainbow"]).name("Theme");


  // ---- Length (macro)
  const macro = {
    length: 0.5,
    width: 0.5,
    brightness: 0.6,
    density: 0.5,
    ribbonStrength: 0.6,
    ribbonHeadCover: 0.4,
    colorFlow: 0.6,
  };

  style
    .add(macro, "length", 0, 1, 0.001)
    .name("Length")
    .onChange((v) => {
      params.tailLength = lerp(1.2, 30, v);
      params.ribbonLength = lerp(0.8, 50, v);
    });

  style
    .add(macro, "width", 0, 1, 0.001)
    .name("Width")
    .onChange((v) => {
      params.spread = lerp(0.25, 1.15, v);
      params.ribbonWidth = lerp(0.35, 1.25, v);
    });

  style
    .add(macro, "brightness", 0, 1, 0.001)
    .name("Brightness")
    .onChange((v) => {
      params.headGlow = lerp(1.4, 5.0, v);
      params.tailGlow = lerp(0.9, 2.4, v);
      params.ribbonGlow = lerp(0.9, 3.0, v);
    });

  style
    .add(macro, "density", 0, 1, 0.001)
    .name("Density")
    .onChange((v) => {
      params.strandCount = Math.round(lerp(6, 16, v));
    });

  style
    .add(macro, "ribbonStrength", 0, 1, 0.001)
    .name("Ribbon Strength")
    .onChange((v) => {
      params.ribbonAlpha = lerp(0.25, 0.9, v);
    });

  style
    .add(macro, "ribbonHeadCover", 0, 1, 0.001)
    .name("Ribbon Head Cover")
    .onChange((v) => {
      params.ribbonHeadWidthFactor = lerp(0.18, 0.45, v);
      params.ribbonHeadCover = lerp(0.02, 0.12, v);
    });

  style
    .add(macro, "colorFlow", 0, 1, 0.001)
    .name("Color Flow Speed")
    .onChange((v) => {
      params.ribbonHueSpeed = lerp(0.2, 1.6, v);
      params.ribbonHueRange = lerp(0.04, 0.22, v);
    });

  // -------------------------------------------------
  // ADVANCED（默认折叠）
  // -------------------------------------------------
  const adv = gui.addFolder("Advanced");

  adv.add(params, "tailDrag", 0.2, 3.5, 0.01);
  adv.add(params, "tailWobble", 0.0, 3.5, 0.01);
  adv.add(params, "tailSize", 0.05, 0.6, 0.001);
  adv.add(params, "headSize", 0.02, 0.22, 0.001);

  adv.add(params, "speedMin", 0.5, 10.0, 0.01);
  adv.add(params, "speedMax", 0.5, 15.0, 0.01);
  adv.add(params, "lifeMin", 0.1, 3.0, 0.01);
  adv.add(params, "lifeMax", 0.1, 4.0, 0.01);

  adv.close();
  style.open();

  return gui;
}
