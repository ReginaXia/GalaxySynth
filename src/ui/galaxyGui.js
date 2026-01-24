// src/ui/galaxyGui.js
import * as THREE from "three";
import GUI from "lil-gui";

/**
 * Compatible with the new nebulaSystem.js I gave you:
 * nebulaSystem = { clusters, update, root, setClusterPalette }
 *
 * Features:
 * - dropdown active galaxy
 * - click pick galaxy
 * - Palette system (2~4 colors), default RADIAL
 * - PATCH mode
 * - per-layer size/opacity
 * - auto save/restore (localStorage)
 * - preset slots (save/load/delete/rename/apply-to-all)
 */

export function setupGalaxyGUI({ camera, renderer, nebulaSystem }) {
  const STORAGE_KEY = "GalaxySynth_GalaxyPresets_v1";

  // -------------------------
  // Storage (perGalaxy + slots)
  // -------------------------
  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { perGalaxy: {}, slots: {} };
      const obj = JSON.parse(raw);
      return {
        perGalaxy: obj.perGalaxy ?? {},
        slots: obj.slots ?? {},
      };
    } catch {
      return { perGalaxy: {}, slots: {} };
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {}
  }

  function savePerGalaxy(id, data) {
    const store = readStore();
    store.perGalaxy[id] = deepClone(data);
    writeStore(store);
  }

  function loadPerGalaxy(id) {
    const store = readStore();
    return store.perGalaxy[id] ?? null;
  }

  function listSlots() {
    return Object.keys(readStore().slots).sort((a, b) => a.localeCompare(b));
  }

  function saveSlot(name, data) {
    const store = readStore();
    store.slots[name] = deepClone(data);
    writeStore(store);
  }

  function loadSlot(name) {
    const store = readStore();
    return store.slots[name] ?? null;
  }

  function deleteSlot(name) {
    const store = readStore();
    delete store.slots[name];
    writeStore(store);
  }

  function renameSlot(oldName, newName) {
    const store = readStore();
    if (!store.slots[oldName]) return false;
    if (store.slots[newName]) return false;
    store.slots[newName] = store.slots[oldName];
    delete store.slots[oldName];
    writeStore(store);
    return true;
  }

  // -------------------------
  // Helpers to get cluster
  // -------------------------
  function getClusterById(id) {
    return nebulaSystem.clusters.find((c) => c.id === id);
  }

  function getPickables() {
    // we tag userData.galaxyId so pick works reliably
    const objs = [];
    for (const c of nebulaSystem.clusters) {
      [c.outer, c.core, c.armStars].forEach((o) => {
        if (!o) return;
        o.userData.galaxyId = c.id;
        objs.push(o);
      });
    }
    return objs;
  }

  // -------------------------
  // Apply / Snapshot
  // -------------------------
  function snapshotActive(state) {
    // minimal things we can control in the new nebulaSystem
    return {
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

  function applyToCluster(id, data) {
    const c = getClusterById(id);
    if (!c) return;

    // palette -> setClusterPalette (updates uniforms on all three layers)
    if (data?.palette) {
      nebulaSystem.setClusterPalette(id, {
        count: data.palette.count,
        mode: data.palette.mode,
        strength: data.palette.strength,
        noise: data.palette.noise,
        hueJitter: data.palette.hueJitter,
        rainbowMix: data.palette.rainbowMix,
        hueScale: data.palette.hueScale,
        c0: data.palette.c0,
        c1: data.palette.c1,
        c2: data.palette.c2,
        c3: data.palette.c3,
      });
    }

    // per-layer opacity/size (uniforms exist in the shader I gave)
    const L = data?.layers;
    if (L?.outer) applyLayer(c.outer, L.outer);
    if (L?.core) applyLayer(c.core, L.core);
    if (L?.stars) applyLayer(c.armStars, L.stars);
  }

  function applyLayer(points, layerData) {
    if (!points?.material?.uniforms) return;
    if (typeof layerData.opacity === "number") {
      points.material.uniforms.uOpacity.value = clamp(layerData.opacity, 0, 2);
    }
    if (typeof layerData.size === "number") {
      points.material.uniforms.uBaseSize.value = clamp(layerData.size, 0.5, 120);
    }
  }

  // -------------------------
  // Init restore from localStorage
  // -------------------------
  for (const c of nebulaSystem.clusters) {
    const saved = loadPerGalaxy(c.id);
    if (saved) applyToCluster(c.id, saved);
  }

  // -------------------------
  // GUI state
  // -------------------------
  const defaultId = nebulaSystem.clusters[0]?.id ?? "A_pad";

  const state = {
    active: defaultId,

    // Palette (default RADIAL)
    palCount: 4,
    colorMode: 0, // 0 RADIAL / 2 PATCH
    colorStrength: 1.15,
    colorNoise: 0.35,
    hueJitter: 0.35,
    rainbowMix: 0.10,
    hueScale: 0.015,

    pal0: "#ffffff",
    pal1: "#ffd1f2",
    pal2: "#ff77d7",
    pal3: "#6aa7ff",

    // Layer look
    outerOpacity: 0.22,
    coreOpacity: 0.18,
    starsOpacity: 0.50,

    outerSize: 9.0,
    coreSize: 9.0,
    starsSize: 12.0,
  };

  // Sync state from current cluster palette + uniforms
  function pullStateFromActive() {
    const c = getClusterById(state.active);
    if (!c) return;

    // palette (from cluster.palette, kept in the system)
    if (c.palette) {
      state.palCount = c.palette.count ?? state.palCount;
      state.colorMode = c.palette.mode ?? state.colorMode;
      state.colorStrength = c.palette.strength ?? state.colorStrength;
      state.colorNoise = c.palette.noise ?? state.colorNoise;
      state.hueJitter = c.palette.hueJitter ?? state.hueJitter;
      state.rainbowMix = c.palette.rainbowMix ?? state.rainbowMix;
      state.hueScale = c.palette.hueScale ?? state.hueScale;

      state.pal0 = c.palette.c0 ?? state.pal0;
      state.pal1 = c.palette.c1 ?? state.pal1;
      state.pal2 = c.palette.c2 ?? state.pal2;
      state.pal3 = c.palette.c3 ?? state.pal3;
    }

    // layer uniforms
    state.outerOpacity = c.outer?.material?.uniforms?.uOpacity?.value ?? state.outerOpacity;
    state.coreOpacity = c.core?.material?.uniforms?.uOpacity?.value ?? state.coreOpacity;
    state.starsOpacity = c.armStars?.material?.uniforms?.uOpacity?.value ?? state.starsOpacity;

    state.outerSize = c.outer?.material?.uniforms?.uBaseSize?.value ?? state.outerSize;
    state.coreSize = c.core?.material?.uniforms?.uBaseSize?.value ?? state.coreSize;
    state.starsSize = c.armStars?.material?.uniforms?.uBaseSize?.value ?? state.starsSize;
  }

  function applyActiveAndSave() {
    const payload = snapshotActive(state);
    applyToCluster(state.active, payload);
    savePerGalaxy(state.active, payload);
  }

  // initialize from active (after restore)
  pullStateFromActive();

  // -------------------------
  // GUI creation
  // -------------------------
  const gui = new GUI({ title: "GalaxySynth" });

  // Active dropdown
  const options = {};
  for (const c of nebulaSystem.clusters) options[c.id] = c.id;

  gui.add(state, "active", options).name("Active Galaxy").onChange(() => {
    pullStateFromActive();
    updateAllDisplays(gui);
  });

  // Palette folder
  const fPal = gui.addFolder("Palette (Radial Default)");

  fPal.add(state, "palCount", 2, 4, 1).name("paletteCount").onChange(applyActiveAndSave);
  fPal.add(state, "colorMode", { RADIAL: 0, PATCH: 2 }).name("colorMode").onChange(applyActiveAndSave);

  fPal.add(state, "colorStrength", 0, 2, 0.01).name("colorStrength").onChange(applyActiveAndSave);
  fPal.add(state, "colorNoise", 0, 1, 0.01).name("colorNoise").onChange(applyActiveAndSave);
  fPal.add(state, "hueJitter", 0, 1, 0.01).name("hueJitter").onChange(applyActiveAndSave);

  fPal.add(state, "rainbowMix", 0, 1, 0.01).name("rainbowMix (spice)").onChange(applyActiveAndSave);
  fPal.add(state, "hueScale", 0, 0.05, 0.001).name("hueScale").onChange(applyActiveAndSave);

  fPal.addColor(state, "pal0").name("coreColor").onChange(applyActiveAndSave);
  fPal.addColor(state, "pal1").name("midColor1").onChange(applyActiveAndSave);
  fPal.addColor(state, "pal2").name("midColor2").onChange(applyActiveAndSave);
  fPal.addColor(state, "pal3").name("outerColor").onChange(applyActiveAndSave);

  fPal.add({ RandomPalette: () => { randomizePalette(state); applyActiveAndSave(); updateAllDisplays(gui); } }, "RandomPalette").name("Random Palette");

  // Layer look folder
  const fLook = gui.addFolder("Look (Realtime)");
  fLook.add(state, "outerOpacity", 0, 2, 0.01).name("outerOpacity").onChange(applyActiveAndSave);
  fLook.add(state, "coreOpacity", 0, 2, 0.01).name("coreOpacity").onChange(applyActiveAndSave);
  fLook.add(state, "starsOpacity", 0, 2, 0.01).name("starsOpacity").onChange(applyActiveAndSave);

  fLook.add(state, "outerSize", 0.5, 80, 0.1).name("outerBaseSize").onChange(applyActiveAndSave);
  fLook.add(state, "coreSize", 0.5, 80, 0.1).name("coreBaseSize").onChange(applyActiveAndSave);
  fLook.add(state, "starsSize", 0.5, 120, 0.1).name("starsBaseSize").onChange(applyActiveAndSave);

  // Preset Manager (slots)
  const fPreset = gui.addFolder("Preset Manager");

  const presetState = {
    slot: "(none)",
    newSlotName: "MyPreset_01",
    SaveSlot: () => {
      const name = (presetState.newSlotName || "").trim();
      if (!name) return alert("请输入 slot 名字");
      saveSlot(name, snapshotActive(state));
      presetState.slot = name;
      refreshSlotDropdown();
      alert(`Saved slot: ${name}`);
    },
    LoadSlot: () => {
      const name = presetState.slot;
      if (!name || name === "(none)") return alert("请选择 slot");
      const p = loadSlot(name);
      if (!p) return alert("slot 不存在");
      // apply to active
      applyToCluster(state.active, p);
      // sync state from active cluster after applying
      pullStateFromActive();
      updateAllDisplays(gui);
      // save as perGalaxy too
      savePerGalaxy(state.active, p);
      alert(`Loaded slot: ${name} -> ${state.active}`);
    },
    DeleteSlot: () => {
      const name = presetState.slot;
      if (!name || name === "(none)") return alert("请选择 slot");
      if (!confirm(`Delete slot "${name}" ?`)) return;
      deleteSlot(name);
      presetState.slot = "(none)";
      refreshSlotDropdown();
    },
    RenameSlot: () => {
      const oldName = presetState.slot;
      if (!oldName || oldName === "(none)") return alert("请选择 slot");
      const newName = prompt("新的 slot 名字：", oldName);
      if (!newName) return;
      const ok = renameSlot(oldName, newName.trim());
      if (!ok) return alert("重命名失败：新名字可能已存在");
      presetState.slot = newName.trim();
      refreshSlotDropdown();
    },
    ApplyToAll: () => {
      const payload = snapshotActive(state);
      for (const c of nebulaSystem.clusters) {
        applyToCluster(c.id, payload);
        savePerGalaxy(c.id, payload);
      }
      alert("Applied active preset to ALL galaxies ✅");
    },
    ClearAllSaved: () => {
      if (!confirm("清空所有 localStorage 的 perGalaxy + slots？")) return;
      writeStore({ perGalaxy: {}, slots: {} });
      presetState.slot = "(none)";
      refreshSlotDropdown();
      alert("Cleared ✅");
    },
  };

  let slotController = null;
  function refreshSlotDropdown() {
    const slots = listSlots();
    const dict = { "(none)": "(none)" };
    for (const s of slots) dict[s] = s;

    if (slotController) {
      fPreset.remove(slotController);
      slotController = null;
    }
    slotController = fPreset.add(presetState, "slot", dict).name("Slot");
  }
  refreshSlotDropdown();

  fPreset.add(presetState, "newSlotName").name("New Slot Name");
  fPreset.add(presetState, "SaveSlot").name("Save Slot (Active)");
  fPreset.add(presetState, "LoadSlot").name("Load Slot -> Active");
  fPreset.add(presetState, "RenameSlot").name("Rename Slot");
  fPreset.add(presetState, "DeleteSlot").name("Delete Slot");
  fPreset.add(presetState, "ApplyToAll").name("Apply Active -> ALL");
  fPreset.add(presetState, "ClearAllSaved").name("Clear ALL Saved");

  // -------------------------
  // Click picking
  // -------------------------
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.12; // easier picking
  const mouse = new THREE.Vector2();
  const pickables = getPickables();

  let downX = 0,
    downY = 0;
  window.addEventListener("pointerdown", (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });
  window.addEventListener("pointerup", (e) => {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    // treat as click if very small movement
    if (Math.sqrt(dx * dx + dy * dy) < 4) tryPickGalaxy(e);
  });

  function tryPickGalaxy(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    mouse.x = x * 2 - 1;
    mouse.y = -(y * 2 - 1);

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    if (!hits.length) return;

    const id = hits[0].object.userData.galaxyId;
    if (!id) return;

    state.active = id;
    pullStateFromActive();
    updateAllDisplays(gui);
  }

  // initial apply save (ensure store has an entry)
  applyActiveAndSave();

  return {
    gui,
    state,
    destroy: () => gui.destroy(),
  };
}

// -------------------------
// Utils
// -------------------------
function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function updateAllDisplays(gui) {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// A few curated palettes (dreamy)
const PALETTES = [
  ["#ffffff", "#ffd1f2", "#ff77d7", "#6aa7ff"], // pink/blue
  ["#ffffff", "#d9f7ff", "#7fe7ff", "#b9a7ff"], // cyan/lavender
  ["#ffffff", "#fff1c8", "#ffd27a", "#ff72d8"], // gold/pink
  ["#ffffff", "#efe6ff", "#c7b6ff", "#7fe7ff"], // violet/cyan
  ["#ffffff", "#c9f8ff", "#9ff3ff", "#ff8fe6"], // mint/pink
];

function randomizePalette(state) {
  const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  state.pal0 = p[0];
  state.pal1 = p[1];
  state.pal2 = p[2];
  state.pal3 = p[3];

  state.palCount = Math.random() < 0.5 ? 4 : 3;
  state.colorMode = 0; // keep RADIAL default
  state.colorStrength = 1.05 + Math.random() * 0.35;
  state.colorNoise = 0.25 + Math.random() * 0.25;
  state.hueJitter = 0.25 + Math.random() * 0.25;

  // keep rainbow as spice
  state.rainbowMix = 0.06 + Math.random() * 0.08;
  state.hueScale = 0.010 + Math.random() * 0.010;
}
