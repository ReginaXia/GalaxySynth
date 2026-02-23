// src/ui/nebulaNoteHintController.js
import * as THREE from "three";
import * as Tone from "tone";

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
  return { sprite, setText };
}

/**
 * createNebulaNoteHintController
 *
 * 目标效果：
 * 1) 主提示：跟着鼠标点到/滑到的位置，在“粒子上方”浮出当前音名（DoReMi 或 CDEFGAB）
 * 2) 环提示：在星云外圈摆 7 个音名刻度，微漂动；当前音高亮，其余半透明
 *
 * 依赖：
 * - nebulaSystem.getCluster(id) -> { center: Vector3, group?, preset? }
 * - audioEngine.previewNebulaNote? (可选)，没有就 fallback
 * - voices.getNebulaInstrument(id) (可选，用于 click-to-play)
 * - getMouseWorldOnPlane(clientX, clientY) -> Vector3|null
 * - pickNebulaAtEvent(e) -> { galaxyId, hit:{point:Vector3} }|null
 */
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
  const params = {
    enabled: true,

    // 主提示：跟手
    showCursorLabel: true,

    // 环提示：一圈音阶刻度（最好看，也最“乐器”）
    showRingLabels: true,

    labelMode: "solfege", // "solfege" | "letter"
    clickToPlay: true,
    sticky: true,
    cursorScale: 1.0,
    ringScale: 1.0,

    // 环的位置与动效
    ringRadiusMul: 0.95,      // 外圈半径比例（相对星云半径）
    ringHeight: 0.22,         // 离平面高度
    ringDrift: 0.08,          // 环刻度漂动幅度
    cursorHeight: 0.28,       // 主提示在粒子上方高度
    cursorDrift: 0.06,        // 主提示轻微漂动
  };

  const solfegeArr = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Xi"];
  const letterArr  = ["C", "D", "E", "F", "G", "A", "B"];

  // 主提示（跟手）
  const { sprite: cursorLabel, setText: setCursorText } = makeGlowTextSprite("Do", {
    fontSize: 86,
    glow: 22,
  });
  cursorLabel.visible = false;
  cursorLabel.scale.set(1.75, 0.9, 1);
  scene.add(cursorLabel);

  // 环提示（7 个）
  const ringLabels = [];
  const ringSetText = [];
  for (let i = 0; i < 7; i++) {
    const { sprite, setText } = makeGlowTextSprite("Do", {
      fontSize: 56,
      glow: 16,
    });
    sprite.visible = false;
    sprite.scale.set(1.1, 0.55, 1);
    scene.add(sprite);
    ringLabels.push(sprite);
    ringSetText.push(setText);
  }

  // pointer state
  let lastClientX = 0;
  let lastClientY = 0;

  function setPointerClientXY(x, y) {
    lastClientX = x;
    lastClientY = y;
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

  // fallback：如果 audioEngine 没有 previewNebulaNote，就用简单 major scale 映射
  function fallbackPreview({ theta01, r01 }) {
    const steps = 7;
    const degree = Math.floor(theta01 * steps) % steps;
    // octave mapping（和你 scratch 的直觉一致：越靠中心越高）
    let octave = 4;
    if (r01 < 0.25) octave = 6;
    else if (r01 < 0.5) octave = 5;
    else if (r01 < 0.75) octave = 4;
    else octave = 3;

    const name = letterArr[degree] + octave;
    return { note: name, degree };
  }

  function previewNote({ galaxyId, theta01, r01 }) {
    const fn = audioEngine?.previewNebulaNote;
    if (typeof fn === "function") {
      return fn({
        galaxyId,
        theta01,
        r01,
        sticky: params.sticky,
        now: Tone.now(),
      });
    }
    return fallbackPreview({ theta01, r01 });
  }

  function noteLabelText(info) {
    const degree = info.degree ?? 0;
    if (params.labelMode === "solfege") return solfegeArr[degree] ?? "Do";
    // letter: remove octave
    return (info.note ?? "C4").replace(/\d+/g, "");
  }

  function hideAll() {
    cursorLabel.visible = false;
    for (const s of ringLabels) s.visible = false;
  }

  // 主提示：贴着鼠标点到的粒子位置
  function updateCursorLabel(worldPoint, info) {
    if (!params.showCursorLabel) {
      cursorLabel.visible = false;
      return;
    }

    const t = performance.now() * 0.001;
    const bob = params.cursorDrift * Math.sin(t * 2.0 + (info.degree ?? 0));
    const driftX = params.cursorDrift * 0.6 * Math.sin(t * 1.3 + 1.7);
    const driftZ = params.cursorDrift * 0.6 * Math.cos(t * 1.1 + 2.2);

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

  // 环提示：一圈 7 个音名（最好看 + 最清晰）
  function updateRingLabels(cluster, info) {
    if (!params.showRingLabels) {
      for (const s of ringLabels) s.visible = false;
      return;
    }

    const t = performance.now() * 0.001;
    const baseR = Math.max(1e-4, estimateNebulaBaseRadius(cluster));
    const ringR = baseR * params.ringRadiusMul;

    const activeDegree = info.degree ?? 0;
    for (let i = 0; i < 7; i++) {
      const theta = (i / 7) * Math.PI * 2;

      // 轻微漂动（让它“跟粒子一起呼吸”）
      const drift = params.ringDrift * Math.sin(t * 1.5 + i * 0.9);
      const px = cluster.center.x + Math.cos(theta) * (ringR + drift);
      const pz = cluster.center.z + Math.sin(theta) * (ringR + drift);
      const py = cluster.center.y + params.ringHeight + 0.06 * Math.sin(t * 1.7 + i);

      ringLabels[i].position.set(px, py, pz);
      ringLabels[i].quaternion.copy(camera.quaternion);

      ringSetText[i](params.labelMode === "solfege" ? solfegeArr[i] : letterArr[i]);

      // 高亮当前音
      const isActive = i === activeDegree;
      ringLabels[i].material.opacity = isActive ? 1.0 : 0.35;

      const s = params.ringScale;
      ringLabels[i].scale.set((isActive ? 1.18 : 1.1) * s, (isActive ? 0.6 : 0.55) * s, 1);

      ringLabels[i].visible = true;
    }
  }

  /**
   * 每帧：根据 hoveredNebulaId 更新提示
   */
  function update(hoveredNebulaId) {
    if (!params.enabled || !hoveredNebulaId) {
      hideAll();
      return;
    }

    const world = getMouseWorldOnPlane(lastClientX, lastClientY);
    if (!world) {
      hideAll();
      return;
    }

    const cluster = nebulaSystem.getCluster(hoveredNebulaId);
    if (!cluster) {
      hideAll();
      return;
    }

    const { theta01, r01 } = computeTheta01AndR01(cluster, world);
    const info = previewNote({ galaxyId: hoveredNebulaId, theta01, r01 });

    updateCursorLabel(world, info);
    updateRingLabels(cluster, info);
  }

  /**
   * pointerdown：点击弹奏（在当前点击位置触发对应音）
   */
  function handlePointerDown(e) {
    if (!params.clickToPlay) return null;

    const pick = pickNebulaAtEvent?.(e);
    if (!pick?.galaxyId || !pick?.hit?.point) return null;

    const cluster = nebulaSystem.getCluster(pick.galaxyId);
    if (!cluster) return pick;

    const { theta01, r01 } = computeTheta01AndR01(cluster, pick.hit.point);
    const info = previewNote({ galaxyId: pick.galaxyId, theta01, r01 });

    const inst = voices?.getNebulaInstrument?.(pick.galaxyId);
    inst?.triggerAttackRelease(info.note, "16n", Tone.now(), 0.95);

    return pick;
  }

  function attachGUI(guiInstance) {
    if (!guiInstance) return;
    const f = guiInstance.addFolder("Music Hint");
    f.add(params, "enabled").name("enabled");
    f.add(params, "labelMode", { "DoReMi": "solfege", "CDEFGAB": "letter" }).name("label mode");
    f.add(params, "clickToPlay").name("click to play");
    f.add(params, "sticky").name("sticky");

    const f1 = f.addFolder("Cursor Label");
    f1.add(params, "showCursorLabel").name("show");
    f1.add(params, "cursorScale", 0.6, 1.8, 0.01).name("scale");
    f1.add(params, "cursorHeight", 0.05, 0.7, 0.01).name("height");
    f1.add(params, "cursorDrift", 0.0, 0.18, 0.001).name("drift");

    const f2 = f.addFolder("Ring Labels");
    f2.add(params, "showRingLabels").name("show");
    f2.add(params, "ringScale", 0.6, 1.8, 0.01).name("scale");
    f2.add(params, "ringRadiusMul", 0.55, 1.15, 0.01).name("radius");
    f2.add(params, "ringHeight", 0.05, 0.8, 0.01).name("height");
    f2.add(params, "ringDrift", 0.0, 0.22, 0.001).name("drift");
  }

  if (gui) attachGUI(gui);

  function dispose() {
    scene.remove(cursorLabel);
    cursorLabel.material?.map?.dispose?.();
    cursorLabel.material?.dispose?.();

    for (const s of ringLabels) {
      scene.remove(s);
      s.material?.map?.dispose?.();
      s.material?.dispose?.();
    }
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