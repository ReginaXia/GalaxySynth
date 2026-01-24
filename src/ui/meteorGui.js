// src/ui/meteorGui.js
import GUI from "lil-gui";

export function setupMeteorGUI(meteorSystem) {
  const { params } = meteorSystem; // ✅ 关键修复点

  const gui = new GUI({ title: "Meteors" });

  // -------------------------
  // Meteors
  // -------------------------
  const f0 = gui.addFolder("Meteors");
  f0.add(params, "enabled");
  f0.add(params, "spawnRate", 0.0, 2.0, 0.01).name("spawnRate/s");
  f0.add(params, "areaRadius", 1.0, 12.0, 0.1);

  // -------------------------
  // Motion
  // -------------------------
  const f1 = gui.addFolder("Motion");
  f1.add(params, "speedMin", 0.5, 10.0, 0.01);
  f1.add(params, "speedMax", 0.5, 15.0, 0.01);
  f1.add(params, "lifeMin", 0.1, 3.0, 0.01);
  f1.add(params, "lifeMax", 0.1, 4.0, 0.01);

  // -------------------------
  // Look（你要的重点）
  // -------------------------
  const look = gui.addFolder("Look");
  look.add(params, "tailLength", 0.6, 8.0, 0.01);
  look.add(params, "spread", 0.0, 1.2, 0.01);
  look.add(params, "strandCount", 4, 16, 1);
  look.add(params, "tailSize", 0.05, 0.6, 0.001);
  look.add(params, "tailGlow", 0.0, 3.5, 0.01);
  look.add(params, "tailDrag", 0.2, 3.5, 0.01);
  look.add(params, "tailWobble", 0.0, 3.5, 0.01);
  look.add(params, "headSize", 0.02, 0.22, 0.001);
  look.add(params, "headGlow", 0.5, 8.0, 0.01);

  // -------------------------
  // Audio
  // -------------------------
  const f2 = gui.addFolder("Audio");
  f2.add(params, "audioEnabled").name("enabled");
  f2.add(params, "audioGain", 0.0, 2.5, 0.01).name("gain");
  f2.add(params, "audioCooldown", 0.0, 0.5, 0.01).name("cooldown");

  return gui;
}
