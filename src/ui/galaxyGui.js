// src/ui/galaxyGui.js
import * as THREE from "three";
import GUI from "lil-gui";

/**
 * setupGalaxyGUI
 * - 下拉选择 active galaxy
 * - 点击选中 galaxy
 * - Look: 实时改 uniform
 * - Shape: 拖动滑条后 200ms 自动 rebuild（近似实时预览）
 */
export function setupGalaxyGUI({ camera, renderer, nebulaSystem }) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const gui = new GUI({ title: "GalaxySynth" });

  // debounce rebuild
  let rebuildTimer = null;
  function scheduleRebuild(delay = 200) {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuildActive();
    }, delay);
  }

  const state = makeStateFromActive();

  // dropdown options
  const options = {};
  for (const c of nebulaSystem.clusters) options[c.id] = c.id;

  const ctrlActive = gui.add(state, "active", options).name("Active Galaxy");
  ctrlActive.onChange((v) => {
    nebulaSystem.setActive(v);
    syncStateFromActive(state, nebulaSystem);
    updateAllDisplays(gui);
    applyUniformsToActive(state, nebulaSystem);
  });

  // folders
  const fLook = gui.addFolder("Look (Realtime)");
  fLook.add(state, "rainbowMix", 0, 1, 0.01).onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "hueScale", 0, 0.05, 0.001).onChange(() => applyUniformsToActive(state, nebulaSystem));

  fLook.add(state, "outerBase", 0, 1.5, 0.01).name("outerOpacityBase").onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "outerNear", 0, 2.0, 0.01).name("outerOpacityNear").onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "coreBase", 0, 1.5, 0.01).name("coreOpacityBase").onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "coreNear", 0, 2.0, 0.01).name("coreOpacityNear").onChange(() => applyUniformsToActive(state, nebulaSystem));

  fLook.add(state, "outerSize", 1, 40, 0.1).name("outerBaseSize").onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "coreSize", 1, 40, 0.1).name("coreBaseSize").onChange(() => applyUniformsToActive(state, nebulaSystem));
  fLook.add(state, "starSize", 1, 60, 0.1).name("starsBaseSize").onChange(() => applyUniformsToActive(state, nebulaSystem));

  const fShape = gui.addFolder("Shape (Auto Rebuild)");
  fShape.add(state, "arms", 1, 6, 1).onChange(() => scheduleRebuild());
  fShape.add(state, "twistOuter", 1, 20, 0.1).onChange(() => scheduleRebuild());
  fShape.add(state, "twistCore", 1, 20, 0.1).onChange(() => scheduleRebuild());
  fShape.add(state, "twistStars", 1, 20, 0.1).onChange(() => scheduleRebuild());

  fShape.add(state, "tightnessOuter", 0.05, 1.2, 0.01).onChange(() => scheduleRebuild());
  fShape.add(state, "tightnessCore", 0.05, 1.2, 0.01).onChange(() => scheduleRebuild());
  fShape.add(state, "tightnessStars", 0.05, 1.2, 0.01).onChange(() => scheduleRebuild());

  fShape.add(state, "interOuter", 0.0, 0.4, 0.005).onChange(() => scheduleRebuild());
  fShape.add(state, "interCore", 0.0, 0.4, 0.005).onChange(() => scheduleRebuild());
  fShape.add(state, "interStars", 0.0, 0.4, 0.005).onChange(() => scheduleRebuild());

  fShape.add(state, "armWidthOuterOuter", 0.01, 0.2, 0.002).onChange(() => scheduleRebuild());
  fShape.add(state, "armWidthOuterCore", 0.01, 0.2, 0.002).onChange(() => scheduleRebuild());
  fShape.add(state, "armWidthOuterStars", 0.01, 0.2, 0.002).onChange(() => scheduleRebuild());

  fShape.add(state, "armPowerOuter", 0.8, 4.0, 0.05).onChange(() => scheduleRebuild());
  fShape.add(state, "armPowerCore", 0.8, 4.0, 0.05).onChange(() => scheduleRebuild());
  fShape.add(state, "armPowerStars", 0.8, 4.0, 0.05).onChange(() => scheduleRebuild());

  // optional buttons
  gui.add({ RebuildNow: () => rebuildActive() }, "RebuildNow").name("Rebuild Now");

  // click pick
  let downX = 0, downY = 0;
  window.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY;
  });
  window.addEventListener("pointerup", (e) => {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.sqrt(dx*dx + dy*dy) < 4) tryPickGalaxy(e);
  });

  function tryPickGalaxy(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    mouse.x = x * 2 - 1;
    mouse.y = -(y * 2 - 1);

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(nebulaSystem.pickables, true);
    if (!hits.length) return;

    const id = hits[0].object.userData.galaxyId;
    if (!id) return;

    nebulaSystem.setActive(id);
    state.active = id;
    syncStateFromActive(state, nebulaSystem);
    updateAllDisplays(gui);
    applyUniformsToActive(state, nebulaSystem);
  }

  function rebuildActive() {
    const id = nebulaSystem.getActiveId();
    nebulaSystem.rebuildFromPreset(id, {
      arms: state.arms,
      twistOuter: state.twistOuter,
      twistCore: state.twistCore,
      twistStars: state.twistStars,

      tightnessOuter: state.tightnessOuter,
      tightnessCore: state.tightnessCore,
      tightnessStars: state.tightnessStars,

      interArmDensityOuter: state.interOuter,
      interArmDensityCore: state.interCore,
      interArmDensityStars: state.interStars,

      armWidthOuterOuter: state.armWidthOuterOuter,
      armWidthOuterCore: state.armWidthOuterCore,
      armWidthOuterStars: state.armWidthOuterStars,

      armPowerOuter: state.armPowerOuter,
      armPowerCore: state.armPowerCore,
      armPowerStars: state.armPowerStars,

      rainbowMix: state.rainbowMix,
      hueScale: state.hueScale,

      // 也同步 look（确保 rebuild 后一致）
      outer: { ...nebulaSystem.getActive().preset.outer, opacityBase: state.outerBase, opacityNear: state.outerNear, baseSize: state.outerSize },
      core:  { ...nebulaSystem.getActive().preset.core,  opacityBase: state.coreBase,  opacityNear: state.coreNear,  baseSize: state.coreSize },
      stars: { ...nebulaSystem.getActive().preset.stars, baseSize: state.starSize },
    });

    applyUniformsToActive(state, nebulaSystem);
  }

  // init apply
  applyUniformsToActive(state, nebulaSystem);

  return {
    gui,
    state,
    destroy: () => gui.destroy(),
  };
}

// ----------------- helpers -----------------
function makeStateFromActive(nebulaSystem) {
  const g = nebulaSystem?.getActive?.();
  const p = g?.preset;

  return {
    active: g?.id ?? "",

    // Look
    rainbowMix: p?.rainbowMix ?? 0.45,
    hueScale: p?.hueScale ?? 0.015,

    outerBase: p?.outer?.opacityBase ?? 0.55,
    outerNear: p?.outer?.opacityNear ?? 0.95,
    coreBase: p?.core?.opacityBase ?? 0.45,
    coreNear: p?.core?.opacityNear ?? 0.95,

    outerSize: p?.outer?.baseSize ?? 18,
    coreSize: p?.core?.baseSize ?? 14,
    starSize: p?.stars?.baseSize ?? 24,

    // Shape
    arms: p?.arms ?? 3,
    twistOuter: p?.twistOuter ?? 10.8,
    twistCore: p?.twistCore ?? 12.5,
    twistStars: p?.twistStars ?? 11.6,

    tightnessOuter: p?.tightnessOuter ?? 0.55,
    tightnessCore: p?.tightnessCore ?? 0.35,
    tightnessStars: p?.tightnessStars ?? 0.22,

    interOuter: p?.interArmDensityOuter ?? 0.14,
    interCore: p?.interArmDensityCore ?? 0.10,
    interStars: p?.interArmDensityStars ?? 0.06,

    armWidthOuterOuter: p?.armWidthOuterOuter ?? 0.055,
    armWidthOuterCore: p?.armWidthOuterCore ?? 0.040,
    armWidthOuterStars: p?.armWidthOuterStars ?? 0.030,

    armPowerOuter: p?.armPowerOuter ?? 2.0,
    armPowerCore: p?.armPowerCore ?? 2.4,
    armPowerStars: p?.armPowerStars ?? 2.8,
  };
}

function syncStateFromActive(state, nebulaSystem) {
  const g = nebulaSystem.getActive();
  const p = g.preset;

  state.active = g.id;

  state.rainbowMix = p.rainbowMix;
  state.hueScale = p.hueScale;

  state.outerBase = p.outer.opacityBase;
  state.outerNear = p.outer.opacityNear;
  state.coreBase = p.core.opacityBase;
  state.coreNear = p.core.opacityNear;

  state.outerSize = p.outer.baseSize;
  state.coreSize = p.core.baseSize;
  state.starSize = p.stars.baseSize;

  state.arms = p.arms;
  state.twistOuter = p.twistOuter;
  state.twistCore = p.twistCore;
  state.twistStars = p.twistStars;

  state.tightnessOuter = p.tightnessOuter;
  state.tightnessCore = p.tightnessCore;
  state.tightnessStars = p.tightnessStars;

  state.interOuter = p.interArmDensityOuter;
  state.interCore = p.interArmDensityCore;
  state.interStars = p.interArmDensityStars;

  state.armWidthOuterOuter = p.armWidthOuterOuter;
  state.armWidthOuterCore = p.armWidthOuterCore;
  state.armWidthOuterStars = p.armWidthOuterStars;

  state.armPowerOuter = p.armPowerOuter;
  state.armPowerCore = p.armPowerCore;
  state.armPowerStars = p.armPowerStars;
}

function applyUniformsToActive(state, nebulaSystem) {
  const id = nebulaSystem.getActiveId();

  nebulaSystem.applyPreset(id, {
    rainbowMix: state.rainbowMix,
    hueScale: state.hueScale,

    outer: { ...nebulaSystem.getActive().preset.outer, opacityBase: state.outerBase, opacityNear: state.outerNear, baseSize: state.outerSize },
    core:  { ...nebulaSystem.getActive().preset.core,  opacityBase: state.coreBase,  opacityNear: state.coreNear,  baseSize: state.coreSize },
    stars: { ...nebulaSystem.getActive().preset.stars, baseSize: state.starSize },
  });

  // 让 uniform 即刻刷新（防止某些层没吃到）
  const g = nebulaSystem.getActive();
  [g.outer, g.core, g.armStars].forEach((p) => {
    const u = p?.material?.uniforms;
    if (!u) return;
    if (u.uRainbowMix) u.uRainbowMix.value = state.rainbowMix;
    if (u.uHueScale) u.uHueScale.value = state.hueScale;

    if (u.uBaseSize) {
      if (p === g.outer) u.uBaseSize.value = state.outerSize;
      if (p === g.core) u.uBaseSize.value = state.coreSize;
      if (p === g.armStars) u.uBaseSize.value = state.starSize;
    }
  });
}

function updateAllDisplays(gui) {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
