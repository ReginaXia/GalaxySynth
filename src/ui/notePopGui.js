import GUI from "lil-gui";

export function setupNotePopGUI(notePopSystem) {
  const { params } = notePopSystem;
  const gui = new GUI({ title: "Note Pop" });

  gui.add(params, "enabled").name("Enable");
  gui.add(params, "maxCount", 2, 72, 1).name("Count Cap");
  gui.add(params, "jumpHeight", 0.2, 2.8, 0.01).name("Jump Height");
  gui.add(params, "jumpDistance", 0.2, 2.8, 0.01).name("Jump Distance");
  gui.add(params, "duration", 0.25, 2.0, 0.01).name("Duration");
  gui.add(params, "size", 0.08, 1.4, 0.01).name("Size");
  gui.add(params, "glow", 0.1, 1.6, 0.01).name("Glow");
  gui.add(params, "followNoteColor").name("Color Follow Note");

  return gui;
}

