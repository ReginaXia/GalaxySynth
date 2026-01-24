// src/ui/meteorGui.js
import GUI from "lil-gui";

export function setupMeteorGUI(meteorSystem) {
  const KEY = "GalaxySynth_MeteorParams_v2";

  const p = meteorSystem.params;

  // restore
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(p, JSON.parse(raw));
  } catch {}

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  }

  const gui = new GUI({ title: "Meteors" });

  gui.add(p, "enabled").name("enabled").onChange(persist);

  const fSpawn = gui.addFolder("Spawn");
  fSpawn.add(p, "spawnRate", 0.0, 3.0, 0.01).name("spawnRate/s").onChange(persist);
  fSpawn.add(p, "areaRadius", 2.0, 20.0, 0.1).name("areaRadius").onChange(persist);

  const fMove = gui.addFolder("Motion");
  fMove.add(p, "speedMin", 0.5, 20.0, 0.1).name("speedMin").onChange(persist);
  fMove.add(p, "speedMax", 0.5, 30.0, 0.1).name("speedMax").onChange(persist);
  fMove.add(p, "lifeMin", 0.2, 3.0, 0.01).name("lifeMin").onChange(persist);
  fMove.add(p, "lifeMax", 0.2, 4.0, 0.01).name("lifeMax").onChange(persist);

  // You asked for these 4:
  const fLook = gui.addFolder("Look (Required)");
  fLook.add(p, "tailLength", 0.2, 12.0, 0.01).name("tailLength").onChange(persist);
  fLook.add(p, "headGlow", 0.0, 8.0, 0.01).name("headGlow").onChange(persist);
  fLook.add(p, "spread", 0.0, 80.0, 0.1).name("spread").onChange(persist);
  fLook.add(p, "strandCount", 4, 24, 1).name("strandCount").onChange(persist);

  // Extra tuning (optional)
  const fExtra = gui.addFolder("Look (Extra)");
  fExtra.addColor(p, "baseColor").name("baseColor").onChange(persist);
  fExtra.add(p, "headSize", 0.03, 0.25, 0.001).name("headSize").onChange(persist);
  fExtra.add(p, "tailSize", 0.05, 0.6, 0.001).name("tailSize").onChange(persist);
  fExtra.add(p, "tailGlow", 0.0, 3.5, 0.01).name("tailGlow").onChange(persist);
  fExtra.add(p, "tailDrag", 0.2, 3.5, 0.01).name("tailDrag").onChange(persist);
  fExtra.add(p, "tailWobble", 0.0, 3.5, 0.01).name("tailWobble").onChange(persist);

  const fRibbon = gui.addFolder("Ribbon Glow");
  fRibbon.add(p, "ribbonGlow", 0.0, 4.0, 0.01).name("ribbonGlow").onChange(persist);
  fRibbon.add(p, "ribbonSway", 0.0, 3.0, 0.01).name("ribbonSway").onChange(persist);
  fRibbon.add(p, "ribbonFollow", 0.0, 1.0, 0.01).name("ribbonFollow").onChange(persist);

  const fAudio = gui.addFolder("Audio");
  fAudio.add(p, "audioEnabled").name("enabled").onChange(persist);
  fAudio.add(p, "audioGain", 0.0, 2.0, 0.01).name("gain").onChange(persist);
  fAudio.add(p, "audioCooldown", 0.0, 0.5, 0.01).name("cooldown").onChange(persist);

  gui.add({ Reset: () => {
    localStorage.removeItem(KEY);
    alert("Meteor params reset. Refresh the page.");
  } }, "Reset");

  return { gui };
}
