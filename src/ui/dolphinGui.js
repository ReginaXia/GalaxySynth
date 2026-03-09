import GUI from "lil-gui";

export function setupDolphinGUI(dolphinSystem) {
  const { params } = dolphinSystem;
  const gui = new GUI({ title: "Dolphin Sky" });

  gui.add(params, "enabled").name("Enable");
  gui.add(params, "maxCount", 2, 44, 1).name("Count Cap");
  gui.add(params, "jumpHeight", 0.2, 3.0, 0.01).name("Jump Height");
  gui.add(params, "jumpDistance", 0.3, 3.5, 0.01).name("Jump Distance");
  gui.add(params, "jumpDuration", 0.35, 2.6, 0.01).name("Duration");
  gui.add(params, "size", 0.2, 1.6, 0.01).name("Size");
  gui.add(params, "glow", 0.1, 1.4, 0.01).name("Glow");
  gui.add(params, "spin", 0.0, 1.2, 0.01).name("Breath");

  return gui;
}

