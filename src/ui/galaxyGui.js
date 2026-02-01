// src/ui/galaxyGui.js
import * as THREE from "three";
import GUI from "lil-gui";

export function setupGalaxyGUI({ camera, renderer, nebulaSystem }) {
  const STORAGE_KEY = "GalaxySynth_GalaxyPresets_v2";

  // -------- storage --------
  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { perGalaxy: {} };
      const obj = JSON.parse(raw);
      return { perGalaxy: obj.perGalaxy ?? {} };
    } catch {
      return { perGalaxy: {} };
    }
  }
  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {}
  }
  function savePerGalaxy(id, data) {
    const store = readStore();
    store.perGalaxy[id] = structuredCloneSafe(data);
    writeStore(store);
  }
  function loadPerGalaxy(id) {
    return readStore().perGalaxy[id] ?? null;
  }

  // -------- restore each cluster --------
  for (const c of nebulaSystem.clusters) {
    const saved = loadPerGalaxy(c.id);
    if (saved) {
      if (saved.transform) nebulaSystem.setClusterTransform(c.id, saved.transform);
      if (saved.shape)
        nebulaSystem.rebuildCluster(c.id, {
          shape: saved.shape,
          layers: saved.layers,
          palette: saved.palette,
        });
      else {
        if (saved.palette) nebulaSystem.setClusterPalette(c.id, saved.palette);
      }
    }
  }

  // -------- pick --------
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.12;
  const mouse = new THREE.Vector2();

  let downX = 0,
    downY = 0;
  window.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  window.addEventListener("pointerup", (e) => {
    const dx = e.clientX - downX,
      dy = e.clientY - downY;
    if (Math.sqrt(dx * dx + dy * dy) < 4) tryPick(e);
  });

  // -------- state --------
  const state = {
    active: nebulaSystem.getActiveId(),

    // Shape (rebuild)
    arms: 3,
    gap: 0.14,
    length: 1.0,
    sizeScale: 1.0,

    // Transform
    posX: 0,
    posY: nebulaSystem.planeY,
    posZ: 0,
    scale: 1.0,

    // Palette
    palCount: 4,
    colorMode: 0, // RADIAL default
    colorStrength: 1.15,
    colorNoise: 0.35,
    hueJitter: 0.35,
    rainbowMix: 0.10,
    hueScale: 0.015,
    pal0: "#ffffff",
    pal1: "#ffd1f2",
    pal2: "#ff77d7",
    pal3: "#6aa7ff",

    // Look (layer opacity/size)
    outerOpacity: 0.22,
    coreOpacity: 0.18,
    starsOpacity: 0.50,
    outerSize: 9.0,
    coreSize: 9.0,
    starsSize: 12.0,
  };

  function activeCluster() {
    return nebulaSystem.getCluster(state.active);
  }

  function pullStateFromActive() {
    const c = activeCluster();
    if (!c) return;

    const p = c.preset;

    // shape
    state.arms = p.shape.arms;
    state.gap = p.shape.gap;
    state.length = p.shape.length;
    state.sizeScale = p.shape.sizeScale;

    // transform
    state.posX = c.group.position.x;
    state.posY = c.group.position.y;
    state.posZ = c.group.position.z;
    state.scale = c.group.scale.x;

    // palette
    const pal = p.palette;
    state.palCount = pal.count;
    state.colorMode = pal.mode;
    state.colorStrength = pal.strength;
    state.colorNoise = pal.noise;
    state.hueJitter = pal.hueJitter;
    state.rainbowMix = pal.rainbowMix;
    state.hueScale = pal.hueScale;
    state.pal0 = pal.c0;
    state.pal1 = pal.c1;
    state.pal2 = pal.c2;
    state.pal3 = pal.c3;

    // layers
    state.outerOpacity = p.layers.outer.opacity;
    state.coreOpacity = p.layers.core.opacity;
    state.starsOpacity = p.layers.stars.opacity;
    state.outerSize = p.layers.outer.size;
    state.coreSize = p.layers.core.size;
    state.starsSize = p.layers.stars.size;
  }

  function snapshot() {
    return {
      shape: { arms: state.arms, gap: state.gap, length: state.length, sizeScale: state.sizeScale },
      transform: { x: state.posX, y: state.posY, z: state.posZ, scale: state.scale },
      palette: {
        count: state.palCount,
        mode: state.colorMode,
        strength: state.colorStrength,
        noise: state.colorNoise,
        hueJitter: state.hueJitter,
        rainbowMix: state.rainbowMix,
        hueScale: state.hueScale,
        c0: state.pal0,
        c1: state.pal1,
        c2: state.pal2,
        c3: state.pal3,
      },
      layers: {
        outer: { opacity: state.outerOpacity, size: state.outerSize },
        core: { opacity: state.coreOpacity, size: state.coreSize },
        stars: { opacity: state.starsOpacity, size: state.starsSize },
      },
    };
  }

  // rebuild debounce（避免拖动滑条狂 rebuild）
  let rebuildTimer = null;
  function scheduleRebuild() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      applyRebuildAndSave();
    }, 150);
  }

  function applyRebuildAndSave() {
    const id = state.active;
    nebulaSystem.setActive(id);
    nebulaSystem.setClusterTransform(id, { x: state.posX, y: state.posY, z: state.posZ, scale: state.scale });

    nebulaSystem.rebuildCluster(id, {
      shape: { arms: state.arms, gap: state.gap, length: state.length, sizeScale: state.sizeScale },
      palette: snapshot().palette,
      layers: snapshot().layers,
    });

    savePerGalaxy(id, snapshot());
  }

  function applyPaletteAndLookAndSave() {
    const id = state.active;
    nebulaSystem.setActive(id);

    nebulaSystem.setClusterPalette(id, snapshot().palette);

    nebulaSystem.rebuildCluster(id, {
      shape: activeCluster().preset.shape,
      palette: snapshot().palette,
      layers: snapshot().layers,
    });

    savePerGalaxy(id, snapshot());
  }

  function applyTransformAndSave() {
    const id = state.active;
    nebulaSystem.setActive(id);
    nebulaSystem.setClusterTransform(id, { x: state.posX, y: state.posY, z: state.posZ, scale: state.scale });
    savePerGalaxy(id, snapshot());
  }

  // init
  pullStateFromActive();

  // -------- GUI --------
  const gui = new GUI({ title: "GalaxySynth" });

  // ===============================
  // Nebula Attraction (搓碟引力)
  // ===============================
  // 注意：nebulaSystem 必须在 return 里暴露 attractionUI 才能用
  // nebulaSystem.attractionUI = { outerStrength, coreStrength, starsStrength, radius }
  const fAttract = gui.addFolder("Nebula Attraction");
  fAttract.open();

  // 做个小防御：如果 attractionUI 还没加进 nebulaSystem，就提示但不崩
  if (nebulaSystem.attractionUI) {
    fAttract
      .add(nebulaSystem.attractionUI, "outerStrength", 0.0, 0.08, 0.001)
      .name("outer strength");
    fAttract
      .add(nebulaSystem.attractionUI, "coreStrength", 0.0, 0.08, 0.001)
      .name("core strength");
    fAttract
      .add(nebulaSystem.attractionUI, "starsStrength", 0.0, 0.12, 0.001)
      .name("stars strength");
    fAttract.add(nebulaSystem.attractionUI, "radius", 0.5, 3.0, 0.01).name("radius");
  } else {
    fAttract.add({ note: "nebulaSystem.attractionUI missing" }, "note").name("⚠ setup required");
  }

  // Active dropdown (dynamic)
  function activeOptions() {
    const opts = {};
    for (const c of nebulaSystem.clusters) opts[c.id] = c.id;
    return opts;
  }

  let activeCtrl = gui.add(state, "active", activeOptions()).name("Active Galaxy");
  activeCtrl.onChange(() => {
    nebulaSystem.setActive(state.active);
    pullStateFromActive();
    updateAllDisplays(gui);
  });

  // Cluster manager
  const fCluster = gui.addFolder("Cluster");
  fCluster
    .add(
      {
        Add: () => {
          const newId = nebulaSystem.addCluster({
            x: 0,
            y: nebulaSystem.planeY,
            z: 0,
            scale: 1,
            preset: structuredCloneSafe(activeCluster().preset),
          });

          gui.remove(activeCtrl);
          activeCtrl = gui.add(state, "active", activeOptions()).name("Active Galaxy");
          activeCtrl.onChange(() => {
            nebulaSystem.setActive(state.active);
            pullStateFromActive();
            updateAllDisplays(gui);
          });

          state.active = newId;
          nebulaSystem.setActive(newId);
          pullStateFromActive();
          updateAllDisplays(gui);
        },
      },
      "Add"
    )
    .name("Add Galaxy (Duplicate Active)");

  fCluster
    .add(
      {
        Remove: () => {
          if (nebulaSystem.clusters.length <= 1) return alert("至少保留一个星云");
          const id = state.active;
          if (!confirm(`Remove galaxy ${id}?`)) return;
          nebulaSystem.removeCluster(id);

          gui.remove(activeCtrl);
          activeCtrl = gui.add(state, "active", activeOptions()).name("Active Galaxy");
          activeCtrl.onChange(() => {
            nebulaSystem.setActive(state.active);
            pullStateFromActive();
            updateAllDisplays(gui);
          });

          state.active = nebulaSystem.getActiveId();
          nebulaSystem.setActive(state.active);
          pullStateFromActive();
          updateAllDisplays(gui);
        },
      },
      "Remove"
    )
    .name("Remove Active");

  // Shape
  const fShape = gui.addFolder("Shape (Rebuild)");
  fShape.add(state, "arms", 1, 7, 1).name("arms").onChange(scheduleRebuild);
  fShape.add(state, "gap", 0.0, 0.35, 0.005).name("armGap").onChange(scheduleRebuild);
  fShape.add(state, "length", 0.5, 2.2, 0.01).name("armLength").onChange(scheduleRebuild);
  fShape.add(state, "sizeScale", 0.35, 2.5, 0.01).name("galaxySize").onChange(scheduleRebuild);

  // Transform
  const fTf = gui.addFolder("Transform");
  fTf.add(state, "posX", -10, 10, 0.01).name("x").onChange(applyTransformAndSave);
  fTf.add(state, "posY", nebulaSystem.planeY - 2, nebulaSystem.planeY + 2, 0.01).name("y").onChange(applyTransformAndSave);
  fTf.add(state, "posZ", -10, 10, 0.01).name("z").onChange(applyTransformAndSave);
  fTf.add(state, "scale", 0.2, 3.5, 0.01).name("scale").onChange(applyTransformAndSave);

  // Palette
  const fPal = gui.addFolder("Palette (Radial Default)");
  fPal.add(state, "palCount", 2, 4, 1).name("paletteCount").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "colorMode", { RADIAL: 0, PATCH: 2 }).name("colorMode").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "colorStrength", 0, 2, 0.01).name("colorStrength").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "colorNoise", 0, 1, 0.01).name("colorNoise").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "hueJitter", 0, 1, 0.01).name("hueJitter").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "rainbowMix", 0, 1, 0.01).name("rainbowMix (spice)").onChange(applyPaletteAndLookAndSave);
  fPal.add(state, "hueScale", 0, 0.05, 0.001).name("hueScale").onChange(applyPaletteAndLookAndSave);
  fPal.addColor(state, "pal0").name("coreColor").onChange(applyPaletteAndLookAndSave);
  fPal.addColor(state, "pal1").name("midColor1").onChange(applyPaletteAndLookAndSave);
  fPal.addColor(state, "pal2").name("midColor2").onChange(applyPaletteAndLookAndSave);
  fPal.addColor(state, "pal3").name("outerColor").onChange(applyPaletteAndLookAndSave);

  // Look
  const fLook = gui.addFolder("Look (Realtime)");
  fLook.add(state, "outerOpacity", 0, 2, 0.01).name("outerOpacity").onChange(applyPaletteAndLookAndSave);
  fLook.add(state, "coreOpacity", 0, 2, 0.01).name("coreOpacity").onChange(applyPaletteAndLookAndSave);
  fLook.add(state, "starsOpacity", 0, 2, 0.01).name("starsOpacity").onChange(applyPaletteAndLookAndSave);
  fLook.add(state, "outerSize", 0.5, 80, 0.1).name("outerBaseSize").onChange(applyPaletteAndLookAndSave);
  fLook.add(state, "coreSize", 0.5, 80, 0.1).name("coreBaseSize").onChange(applyPaletteAndLookAndSave);
  fLook.add(state, "starsSize", 0.5, 120, 0.1).name("starsBaseSize").onChange(applyPaletteAndLookAndSave);

  // final: ensure perGalaxy saved
  savePerGalaxy(state.active, snapshot());

  return { gui, state, destroy: () => gui.destroy() };

  // -------- helpers --------
  function tryPick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(nebulaSystem.pickables, true);
    if (!hits.length) return;
    const id = hits[0].object.userData.galaxyId;
    if (!id) return;
    state.active = id;
    nebulaSystem.setActive(id);
    pullStateFromActive();
    updateAllDisplays(gui);
  }
}

/* -------- utils -------- */
function updateAllDisplays(gui) {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
function structuredCloneSafe(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}
