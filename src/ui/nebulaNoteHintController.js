// src/ui/nebulaNoteHintController.js
import * as THREE from "three";
import * as Tone from "tone";

// --- small util ---
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

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

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.visible = false;

  function setText(newText) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${font} ${fontSize}px ui-sans-serif, system-ui, -apple-system`;
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

  return { sprite, setText, texture, canvas, ctx };
}


// Fallback: if audioEngine.previewNebulaNote is not provided (older engine build),
// compute a simple major-scale snapped note from theta01/r01.
const __MAJOR_SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11];
function fallbackPreviewNebulaNote({ theta01, r01 = 0.5 }) {
  let octaveOffset = 0;
  if (r01 < 0.25) octaveOffset = +24;
  else if (r01 < 0.50) octaveOffset = +12;
  else if (r01 < 0.75) octaveOffset = 0;
  else octaveOffset = -12;

  const steps = __MAJOR_SCALE_DEGREES.length;
  const step = Math.floor(((theta01 % 1) + 1) % 1 * steps);
  const degree = step % steps;

  const baseMidi = Tone.Frequency("C4").toMidi();
  const midi = baseMidi + octaveOffset + __MAJOR_SCALE_DEGREES[degree];
  const note = Tone.Frequency(midi, "midi").toNote();
  return { note, midi, degree, step, steps, octaveOffset };
}

/**
 * NebulaNoteHintController
 *
 * 依赖输入：
 * - scene, camera
 * - nebulaSystem: 必须有 getCluster(galaxyId) -> { center: THREE.Vector3, group?, preset? }
 * - audioEngine: 需要 previewNebulaNote({ galaxyId, theta01, r01, sticky }) -> { note, degree }
 * - voices: 需要 getNebulaInstrument(galaxyId) -> Tone instrument (triggerAttackRelease)
 * - getMouseWorldOnPlane(clientX, clientY) -> THREE.Vector3|null  (你现成就有)
 * - pickNebulaAtEvent(e) -> { galaxyId, hit:{point:THREE.Vector3} }|null (你现成就有)
 */
export function createNebulaNoteHintController({
  scene,
  camera,
  nebulaSystem,
  audioEngine,
  voices,
  getMouseWorldOnPlane,
  pickNebulaAtEvent,
  gui = null, // lil-gui instance (optional)
  debug = false,
}) {
  const params = {
    enabled: true,
    labelMode: "solfege", // "solfege" | "letter"
    clickToPlay: true,
    sticky: true,
    scale: 1.0, // label size multiplier
  };

  // Choose preview function (new engine provides audioEngine.previewNebulaNote).
  const previewNebulaNoteFn =
    typeof audioEngine?.previewNebulaNote === "function"
      ? audioEngine.previewNebulaNote.bind(audioEngine)
      : fallbackPreviewNebulaNote;


  // label sprite
  const { sprite: label, setText: setLabelText } = makeGlowTextSprite("Do", {
    fontSize: 78,
    glow: 20,
  });
  label.visible = false;
  label.scale.set(1.6, 0.85, 1);
  scene.add(label);

  // state
  let lastHoverId = null;
  let lastClientX = 0;
  let lastClientY = 0;

  // allow main.js to feed pointer position
  function setPointerClientXY(x, y) {
    lastClientX = x;
    lastClientY = y;
  }

  // estimate r01 based on your nebula radius conventions
  function estimateNebulaBaseRadius(cluster) {
    const uiR = nebulaSystem?.attractionUI?.radius ?? 1.55;
    const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
    const groupScale = cluster?.group?.scale?.x ?? 1.0;
    return uiR * sizeScale * groupScale;
  }

  function computeTheta01AndR01(cluster, worldPoint) {
    const v = worldPoint.clone().sub(cluster.center);
    const theta = Math.atan2(v.z, v.x); // -pi..pi
    const theta01 = (theta / (Math.PI * 2) + 1) % 1;
    const baseR = Math.max(1e-4, estimateNebulaBaseRadius(cluster));
    const r01 = clamp01(v.length() / baseR);
    return { theta01, r01, v };
  }

  function labelTextFromInfo(info) {
    const letter = info.note.replace(/\d+/g, ""); // "C", "D#", ...
    const solfege = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Xi"][info.degree] ?? "Do";
    return params.labelMode === "solfege" ? solfege : letter;
  }

  function updateLabelTransformAtPoint(worldPoint, info) {
    const t = performance.now() * 0.001;

    // 轻微漂动（可选）
    const bob = 0.10 * Math.sin(t * 1.8 + info.degree);
    const driftX = 0.06 * Math.sin(t * 1.2 + 1.3);
    const driftZ = 0.06 * Math.cos(t * 1.1 + 2.1);

    label.position.set(
        worldPoint.x + driftX,
        worldPoint.y + 0.22 + bob, // “在粒子上方”
        worldPoint.z + driftZ
    );

    // face camera
    label.quaternion.copy(camera.quaternion);

    const s = params.scale;
    label.scale.set(1.6 * s, 0.85 * s, 1);
    }

  /**
   * 每帧调用：根据 hoveredNebulaId 更新显示
   * @param {string|null} hoveredNebulaId
   */
  function update(hoveredNebulaId) {
    if (!params.enabled || !hoveredNebulaId) {
      label.visible = false;
      lastHoverId = null;
      return;
    }

    const world = getMouseWorldOnPlane(lastClientX, lastClientY);
    if (!world) {
      label.visible = false;
      lastHoverId = null;
      return;
    }

    const cluster = nebulaSystem.getCluster(hoveredNebulaId);
    if (!cluster) {
      label.visible = false;
      lastHoverId = null;
      return;
    }

    const { theta01, r01 } = computeTheta01AndR01(cluster, world);

    const info = previewNebulaNoteFn({
      galaxyId: hoveredNebulaId,
      theta01,
      r01,
      sticky: params.sticky,
    });

    setLabelText(labelTextFromInfo(info));
    updateLabelTransformAtPoint(world, info);

    label.visible = true;
    lastHoverId = hoveredNebulaId;

    if (debug) {
      // 你可以在这里 console.log，但默认别开
    }
  }

  /**
   * 在 main 的 pointerdown 里调用：实现“点击弹奏”
   */
  function handlePointerDown(e) {
    if (!params.clickToPlay) return null;

    const pick = pickNebulaAtEvent?.(e);
    if (!pick?.galaxyId || !pick?.hit?.point) return null;

    const cluster = nebulaSystem.getCluster(pick.galaxyId);
    if (!cluster) return null;

    const { theta01, r01 } = computeTheta01AndR01(cluster, pick.hit.point);

    const info = previewNebulaNoteFn({
      galaxyId: pick.galaxyId,
      theta01,
      r01,
      sticky: true,
    });

    const inst = voices.getNebulaInstrument?.(pick.galaxyId);
    inst?.triggerAttackRelease(info.note, "16n", Tone.now(), 0.95);

    return pick; // 方便 main.js 继续用它设置 activeNebulaKey
  }

  // optional GUI
  function attachGUI(guiInstance) {
    if (!guiInstance) return;
    const f = guiInstance.addFolder("Music Hint");
    f.add(params, "enabled").name("show note");
    f.add(params, "labelMode", { "DoReMi": "solfege", "CDEFGAB": "letter" }).name("label mode");
    f.add(params, "clickToPlay").name("click to play");
    f.add(params, "sticky").name("sticky");
    f.add(params, "scale", 0.6, 1.8, 0.01).name("label scale");
  }
  if (gui) attachGUI(gui);

  function dispose() {
    scene.remove(label);
    label.material?.map?.dispose?.();
    label.material?.dispose?.();
  }

  return {
    params,
    setPointerClientXY,
    update,
    handlePointerDown,
    attachGUI,
    dispose,
  };
}