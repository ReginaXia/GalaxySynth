// src/ui/nebulaNoteHintController.js
import * as THREE from "three";
import * as Tone from "tone";
import { NOTE_STEPS, stepToCenterTheta01 } from "../music/noteMapping.js";

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

const HINT_FONT_FAMILY = "'LacheyardScript', 'Lacheyard Script', ui-sans-serif, system-ui, -apple-system";
let __hintFontInjected = false;
function ensureHintFontFace() {
  if (__hintFontInjected) return;
  __hintFontInjected = true;
  const fontUrl = `${import.meta.env.BASE_URL}fonts/LacheyardScript.otf`;
  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: 'LacheyardScript';
      src: url('${fontUrl}') format('opentype');
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

function makeGlowTextSprite(text = "C", opts = {}) {
  const {
    canvasW = 512,
    canvasH = 256,
    fontSize = 72,
    glow = 18,
    color = "#ffffff",
    glowColor = "rgba(255,255,255,0.9)",
    font = "700",
  } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ensureHintFontFace();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.visible = false;

  function setText(newText) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${font} ${fontSize}px ${HINT_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // glow pass
    ctx.shadowBlur = glow;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = color;
    ctx.fillText(newText, canvas.width / 2, canvas.height / 2);

    // crisp pass
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(newText, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
  }

  setText(text);
  if (document.fonts?.load) {
    document.fonts.load(`${font} ${fontSize}px LacheyardScript`).then(() => {
      setText(text);
    }).catch(() => {});
  }
  return { sprite, setText };
}

function smoothWrap01(prev, cur, alpha) {
  if (prev == null || !Number.isFinite(prev)) return cur;
  let c = cur;
  // pick the nearest wrap around prev
  const candidates = [cur, cur + 1, cur - 1];
  let best = candidates[0];
  let bestD = Math.abs(candidates[0] - prev);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(candidates[i] - prev);
    if (d < bestD) { bestD = d; best = candidates[i]; }
  }
  c = best;
  const out = prev * (1 - alpha) + c * alpha;
  return (out % 1 + 1) % 1;
}

export function createNebulaNoteHintController({
  scene,
  camera,
  nebulaSystem,
  audioEngine,
  voices,
  getMouseWorldOnPlane,
  pickNebulaAtEvent,
  gui = null,
}) {
  const solfegeArr = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Xi"];
  const letterArr  = ["C", "D", "E", "F", "G", "A", "B"];

  const params = {
    enabled: true,
    labelMode: "solfege", // "solfege" | "letter"
    clickToPlay: true,

    // cursor label
    showCursorLabel: true,
    cursorScale: 1.0,
    cursorHeight: 0.28,
    cursorDrift: 0.05,

    // multi-band hints
    showBands: true,
    maxBands: 4,
    bandScale: 1.0,
    bandHeight: 0.22,
    bandDrift: 0.08,

    // stability
    sticky: true,
    hysteresisMargin: 0.18,
    smoothTheta: 0.22,
    hoverHoldMs: 120,
  };

  // cursor label
  const { sprite: cursorLabel, setText: setCursorText } = makeGlowTextSprite("Do", {
    fontSize: 86,
    glow: 22,
  });
  cursorLabel.visible = false;
  cursorLabel.scale.set(1.75, 0.9, 1);
  scene.add(cursorLabel);

  // band sprites: maxBands * 7
  const MAX_BANDS = Math.max(1, Math.min(8, params.maxBands));
  const STEPS = NOTE_STEPS;

  const bandLabels = [];
  const bandSetText = [];
  for (let b = 0; b < MAX_BANDS; b++) {
    for (let i = 0; i < STEPS; i++) {
      const { sprite, setText } = makeGlowTextSprite("Do", {
        fontSize: 54,
        glow: 16,
      });
      sprite.visible = false;
      sprite.scale.set(1.05, 0.55, 1);
      scene.add(sprite);
      bandLabels.push(sprite);
      bandSetText.push(setText);
    }
  }

  // pointer state
  let lastClientX = 0;
  let lastClientY = 0;

  // allow main.js to provide the exact theta/r used for audio (best alignment)
  let interactionSample = null; // { id, theta01, r01, timeMs }

  // per-galaxy hover state (for sticky + smoothing + hold)
  const hoverState = new Map(); // id -> { lastStep, smoothTheta01, lastSeenMs, lastInfo }

  function setPointerClientXY(x, y) {
    lastClientX = x;
    lastClientY = y;
  }

  // Call this from main.js when you already computed theta01/r01 for audio.
  function setInteractionSample(galaxyId, theta01, r01) {
    interactionSample = {
      id: galaxyId,
      theta01: (theta01 % 1 + 1) % 1,
      r01: clamp01(r01),
      timeMs: performance.now(),
    };
  }

  function estimateNebulaBaseRadius(cluster) {
    const uiR = nebulaSystem?.attractionUI?.radius ?? 1.55;
    const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
    const groupScale = cluster?.group?.scale?.x ?? 1.0;
    return uiR * sizeScale * groupScale;
  }

  function computeTheta01AndR01(cluster, worldPoint) {
    const v = worldPoint.clone().sub(cluster.center);
    const theta = Math.atan2(v.z, v.x);
    const theta01 = (theta / (Math.PI * 2) + 1) % 1;
    const baseR = Math.max(1e-4, estimateNebulaBaseRadius(cluster));
    const r01 = clamp01(v.length() / baseR);
    return { theta01, r01 };
  }

  function fallbackPreview({ theta01, r01 }) {
    const degree = Math.floor(clamp01(theta01) * STEPS) % STEPS;
    let octave = 4;
    if (r01 < 0.15) octave = 7;
    else if (r01 < 0.33) octave = 6;
    else if (r01 < 0.66) octave = 5;
    else octave = 4;
    return { note: `${letterArr[degree]}${octave}`, degree, step: degree };
  }

  function previewNote({ galaxyId, theta01, r01, state }) {
    const fn = audioEngine?.previewNebulaNote;
    if (typeof fn === "function") {
      const info = fn({
        galaxyId,
        theta01,
        r01,
        sticky: params.sticky,
        lastStep: state?.lastStep ?? null,
        updateState: false,
        margin: params.hysteresisMargin,
        now: Tone.now(),
      });
      return info;
    }
    return fallbackPreview({ theta01, r01 });
  }

  function noteLabelText(info) {
    const degree = info.degree ?? 0;
    if (params.labelMode === "solfege") return solfegeArr[degree] ?? "Do";
    return (info.note ?? "C4").replace(/\d+/g, "");
  }

  function hideAll() {
    cursorLabel.visible = false;
    for (const s of bandLabels) s.visible = false;
  }

  function updateCursorLabel(worldPoint, info) {
    if (!params.showCursorLabel) {
      cursorLabel.visible = false;
      return;
    }
    const t = performance.now() * 0.001;
    const bob = params.cursorDrift * Math.sin(t * 2.0 + (info.degree ?? 0));
    const driftX = params.cursorDrift * 0.7 * Math.sin(t * 1.2 + 1.7);
    const driftZ = params.cursorDrift * 0.7 * Math.cos(t * 1.1 + 2.2);

    setCursorText(noteLabelText(info));
    cursorLabel.position.set(
      worldPoint.x + driftX,
      worldPoint.y + params.cursorHeight + bob,
      worldPoint.z + driftZ
    );
    cursorLabel.quaternion.copy(camera.quaternion);

    const s = params.cursorScale;
    cursorLabel.scale.set(1.75 * s, 0.9 * s, 1);
    cursorLabel.material.opacity = 1.0;
    cursorLabel.visible = true;
  }

  function computeBandCount(cluster) {
    const shape = cluster?.preset?.shape ?? {};
    const length = shape.length ?? 1.0;
    const sizeScale = shape.sizeScale ?? 1.0;

    // big = more bands; small = fewer
    const score = clamp01((length * sizeScale - 0.6) / 1.2); // 0..1
    const bands = 1 + Math.round(score * (Math.min(params.maxBands, 4) - 1));
    return Math.max(1, Math.min(params.maxBands, bands));
  }

  function getBandR01List(bands) {
    if (bands <= 1) return [0.62];
    if (bands === 2) return [0.38, 0.86];
    if (bands === 3) return [0.24, 0.56, 0.90];
    return [0.18, 0.42, 0.68, 0.92];
  }

  function updateBandHints(cluster, info, cursorR01) {
    if (!params.showBands) {
      for (const s of bandLabels) s.visible = false;
      return;
    }

    const baseR = Math.max(1e-4, estimateNebulaBaseRadius(cluster));
    const bands = computeBandCount(cluster);
    const r01List = getBandR01List(bands);

    // choose active band by cursorR01
    let activeBand = 0;
    {
      let bestD = Infinity;
      for (let b = 0; b < bands; b++) {
        const d = Math.abs(cursorR01 - r01List[b]);
        if (d < bestD) { bestD = d; activeBand = b; }
      }
    }

    const t = performance.now() * 0.001;

    // hide all first
    for (const s of bandLabels) s.visible = false;

    for (let b = 0; b < bands; b++) {
      const r01 = r01List[b];
      const ringR = baseR * r01;
      for (let i = 0; i < STEPS; i++) {
        const idx = b * STEPS + i;
        const theta = stepToCenterTheta01(i, STEPS) * Math.PI * 2;
        const localPos = new THREE.Vector3(
          Math.cos(theta) * ringR,
          params.bandHeight + 0.05 * Math.sin(t * 1.7 + i + b * 0.7),
          Math.sin(theta) * ringR
        );
        const worldPos = cluster.group.localToWorld(localPos);
        bandLabels[idx].position.copy(worldPos);
        bandLabels[idx].quaternion.copy(camera.quaternion);

        bandSetText[idx](params.labelMode === "solfege" ? solfegeArr[i] : letterArr[i]);

        const isDegree = (i === (info.degree ?? 0));
        const isMain = (b === activeBand);

        // opacity hierarchy
        let op = 0.22;
        if (isDegree && isMain) op = 1.0;
        else if (isDegree && !isMain) op = 0.50;
        else if (!isDegree && isMain) op = 0.30;

        bandLabels[idx].material.opacity = op;

        const s = params.bandScale;
        const bump = (isDegree && isMain) ? 1.15 : 1.0;
        bandLabels[idx].scale.set(1.05 * s * bump, 0.55 * s * bump, 1);

        bandLabels[idx].visible = true;
      }
    }
  }

  function update(hoveredNebulaId, truthIntent = null) {
    const nowMs = performance.now();

    if (!params.enabled || !hoveredNebulaId) {
      hideAll();
      return;
    }

    const cluster = nebulaSystem.getCluster(hoveredNebulaId);
    if (!cluster) {
      hideAll();
      return;
    }

    // Prefer unified truth intent from musicState; fallback stays display-only.
    let theta01 = null;
    let r01 = null;
    let infoFromTruth = null;

    if (truthIntent && truthIntent.galaxyId === hoveredNebulaId) {
      theta01 = truthIntent.theta01;
      r01 = truthIntent.r01;
      infoFromTruth = {
        note: truthIntent.noteName,
        midi: truthIntent.midi,
        step: truthIntent.step,
        degree: truthIntent.step,
        theta01: truthIntent.theta01,
        r01: truthIntent.r01,
      };
    }

    if (!infoFromTruth && (
      interactionSample &&
      interactionSample.id === hoveredNebulaId &&
      (nowMs - interactionSample.timeMs) < 1500
    )) {
      theta01 = interactionSample.theta01;
      r01 = interactionSample.r01;
    } else {
      const world = getMouseWorldOnPlane(lastClientX, lastClientY);
      if (!world) {
        // hold last for a short time to avoid flicker
        const st = hoverState.get(hoveredNebulaId);
        if (st && (nowMs - st.lastSeenMs) < params.hoverHoldMs) return;
        hideAll();
        return;
      }
      const tr = computeTheta01AndR01(cluster, world);
      theta01 = tr.theta01;
      r01 = tr.r01;
    }

    let st = hoverState.get(hoveredNebulaId);
    if (!st) {
      st = { lastStep: -1, smoothTheta01: theta01, lastSeenMs: nowMs, lastInfo: null };
      hoverState.set(hoveredNebulaId, st);
    }

    const usingSample =
  interactionSample &&
  interactionSample.id === hoveredNebulaId &&
  (nowMs - interactionSample.timeMs) < 1500;

// When following audio truth, DO NOT smooth (avoids “cycle around the ring” chasing)
st.smoothTheta01 = usingSample ? theta01 : smoothWrap01(st.smoothTheta01, theta01, params.smoothTheta);

    st.lastSeenMs = nowMs;

    const info = infoFromTruth ?? previewNote({ galaxyId: hoveredNebulaId, theta01: st.smoothTheta01, r01, state: st });

    // update local sticky step from preview result
    if (typeof info.step === "number") st.lastStep = info.step;
    st.lastInfo = info;

    // Avoid center fallback artifacts: only place cursor label with a real world point.
    const worldForLabel = truthIntent?.hitWorld ?? getMouseWorldOnPlane(lastClientX, lastClientY);
    if (worldForLabel) updateCursorLabel(worldForLabel, info);
    else cursorLabel.visible = false;
    updateBandHints(cluster, info, r01);
  }

  function handlePointerDown(e) {
    if (!params.clickToPlay) return null;

    const pick = pickNebulaAtEvent?.(e);
    if (!pick?.galaxyId || !pick?.hit?.point) return null;

    const cluster = nebulaSystem.getCluster(pick.galaxyId);
    if (!cluster) return pick;

    const tr = computeTheta01AndR01(cluster, pick.hit.point);

    // sync interaction sample so UI & click align instantly
    setInteractionSample(pick.galaxyId, tr.theta01, tr.r01);

    let st = hoverState.get(pick.galaxyId);
    if (!st) {
      st = { lastStep: -1, smoothTheta01: tr.theta01, lastSeenMs: performance.now(), lastInfo: null };
      hoverState.set(pick.galaxyId, st);
    }

    const info = previewNote({ galaxyId: pick.galaxyId, theta01: tr.theta01, r01: tr.r01, state: st });
    if (typeof info.step === "number") st.lastStep = info.step;

    return pick;
  }

  function attachGUI(guiInstance) {
    if (!guiInstance) return;
    const f = guiInstance.addFolder("Music Hint");
    f.add(params, "enabled").name("enabled");
    f.add(params, "labelMode", { "DoReMi": "solfege", "CDEFGAB": "letter" }).name("label mode");
    f.add(params, "clickToPlay").name("click to play");

    const f1 = f.addFolder("Cursor");
    f1.add(params, "showCursorLabel").name("show");
    f1.add(params, "cursorScale", 0.6, 1.8, 0.01).name("scale");
    f1.add(params, "cursorHeight", 0.05, 0.7, 0.01).name("height");

    const f2 = f.addFolder("Bands");
    f2.add(params, "showBands").name("show");
    f2.add(params, "bandScale", 0.6, 1.8, 0.01).name("scale");
    f2.add(params, "bandHeight", 0.05, 0.8, 0.01).name("height");
    f2.add(params, "bandDrift", 0.0, 0.22, 0.001).name("drift");

    const f3 = f.addFolder("Stability");
    f3.add(params, "smoothTheta", 0.0, 0.5, 0.01).name("theta smooth");
    f3.add(params, "hoverHoldMs", 0, 250, 1).name("hold ms");
    f3.add(params, "hysteresisMargin", 0.05, 0.30, 0.01).name("margin");
  }

  if (gui) attachGUI(gui);

  function dispose() {
    scene.remove(cursorLabel);
    cursorLabel.material?.map?.dispose?.();
    cursorLabel.material?.dispose?.();

    for (const s of bandLabels) {
      scene.remove(s);
      s.material?.map?.dispose?.();
      s.material?.dispose?.();
    }
  }

  return {
    params,
    setPointerClientXY,
    setInteractionSample,
    update,
    handlePointerDown,
    attachGUI,
    dispose,
  };
}
