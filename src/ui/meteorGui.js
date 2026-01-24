// src/ui/meteorGui.js
import GUI from "lil-gui";

export function setupMeteorGUI(meteorSystem) {
  const KEY = "GalaxySynth_MeteorParams_v1";

  // restore
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(meteorSystem.params, saved);
    }
  } catch {}

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(meteorSystem.params));
    } catch {}
  }

  const gui = new GUI({ title: "Meteors" });

  const p = meteorSystem.params;

  gui.add(p, "enabled").name("enabled").onChange(persist);

  const fSpawn = gui.addFolder("Spawn");
  fSpawn.add(p, "spawnRate", 0.0, 3.0, 0.01).name("spawnRate/s").onChange(persist);
  fSpawn.add(p, "areaRadius", 2.0, 20.0, 0.1).name("areaRadius").onChange(persist);

  const fMove = gui.addFolder("Motion");
  fMove.add(p, "speedMin", 0.5, 20.0, 0.1).name("speedMin").onChange(persist);
  fMove.add(p, "speedMax", 0.5, 30.0, 0.1).name("speedMax").onChange(persist);
  fMove.add(p, "lifeMin", 0.2, 3.0, 0.01).name("lifeMin").onChange(persist);
  fMove.add(p, "lifeMax", 0.2, 4.0, 0.01).name("lifeMax").onChange(persist);

  const fLook = gui.addFolder("Look");
  fLook.add(p, "tailLength", 0.2, 20, 0.01).name("tailLength").onChange(persist);
  fLook.add(p, "spread", 0.01, 1.2, 0.02).name("spread").onChange(persist);
  fLook.add(p, "strandCount", 4, 16, 1).name("strandCount").onChange(persist);
  fLook.add(p, "tailWidth", 0.02, 0.6, 0.005).name("tailWidth").onChange(persist);
  fLook.add(p, "tailGlow", 0.0, 3.0, 0.01).name("tailGlow").onChange(persist);
  fLook.add(p, "tailFade", 0.5, 6.0, 0.01).name("tailFade").onChange(persist);

  fLook.add(p, "headSize", 0.05, 0.6, 0.005).name("headSize").onChange(persist);
  fLook.add(p, "headGlow", 0.0, 6.0, 0.01).name("headGlow").onChange(persist);

  const fShape = gui.addFolder("Head Shape");
  fShape.add(p, "headShape", { ORB: 0, CROSS: 1, STAR5: 2 }).name("headShape").onChange(persist);
  fShape.add(p, "shapeMix", 0.0, 1.0, 0.01).name("shapeMix").onChange(persist);
  fShape.add(p, "starSharpness", 0.6, 5.0, 0.01).name("sharpness").onChange(persist);

  const fCol = gui.addFolder("Color / Aurora");
  fCol.add(p, "baseHue", 0.0, 1.0, 0.001).name("baseHue").onChange(persist);
  fCol.add(p, "hueRange", 0.0, 0.35, 0.001).name("hueRange").onChange(persist);
  fCol.add(p, "auroraAmount", 0.0, 1.5, 0.01).name("auroraAmount").onChange(persist);
  fCol.add(p, "auroraSpeed", 0.0, 3.0, 0.01).name("auroraSpeed").onChange(persist);
  fCol.add(p, "sat", 0.0, 1.0, 0.01).name("sat").onChange(persist);
  fCol.add(p, "val", 0.2, 1.6, 0.01).name("val").onChange(persist);

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
