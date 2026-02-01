// src/main.js
import * as THREE from "three";
import * as Tone from "tone";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { setupGalaxyGUI } from "./ui/galaxyGui.js";
import { setupMeteorGUI } from "./ui/meteorGui.js";

// import { initAudioOnFirstGesture, triggerOnMove } from "./audio.js";
import { playMeteorSfx } from "./audio/meteorSfx.js";

import { createNebulaSystem } from "./nebula/nebulaSystem.js";
import { createMeteorSystem } from "./meteor/meteorSystem.js";

import { createDreamyBackground } from "./background/dreamyBackground";

import { createPerformanceState } from "./performance/performanceState";
import { createMouseKeyboardController } from "./input/mouseKeyboardController";
import { createGalaxyAudioEngine } from "./audio/galaxyAudioEngine";

import { createGalaxyVoices } from "./audio/galaxyVoices.js";

import { createAudioMonitorUI } from "./ui/audioMonitor.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import meteorVert from "./shaders/meteor.vert.glsl?raw";
import meteorFrag from "./shaders/meteor.frag.glsl?raw";

console.log("MAIN JS LOADED");
// --- Debug HUD (show active/hover)
const debugHud = document.createElement("div");
debugHud.style.cssText = `
  position:fixed;
  top:12px;
  left:50%;
  transform:translateX(-50%);
  z-index:9999;

  padding:8px 14px;
  border-radius:999px;

  background:rgba(0,0,0,0.45);
  color:#fff;

  font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;
  pointer-events:none;
  white-space:pre;
  text-align:center;
`;


debugHud.textContent = "HUD ready";


document.body.appendChild(debugHud);


// -------------------------------------
// Renderer
// -------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

// -------------------------------------
// Scene / Camera
// -------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 2000);
camera.position.set(0, 6.5, 8.5);
camera.lookAt(0, 0, 0);

// -------------------------------------
// Texture
// -------------------------------------
const texLoader = new THREE.TextureLoader();
const starTexture = texLoader.load("/textures/star.png");
starTexture.colorSpace = THREE.SRGBColorSpace;

// -------------------------------------
// Post (Bloom)
// -------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.65, 0.22);
composer.addPass(bloomPass);

bloomPass.strength = 1;
bloomPass.radius = 1;
bloomPass.threshold = 0.7;

// -------------------------------------
// Raycast plane (y = 0)
// -------------------------------------
const raycaster = new THREE.Raycaster();
const nebulaRaycaster = new THREE.Raycaster();
let nebulaHit = null; // 存当前命中的物体（可用于后续“active nebula”）

let activeNebulaKey = "C_pluck";

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.0);
const hitPoint = new THREE.Vector3();

// 鼠标 NDC（用于星空）
const pointer = new THREE.Vector2(0, 0);
window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});


// -------------------------------------
// 全局pointDown
// -------------------------------------

let pointerDown = false;
window.addEventListener("pointerdown", () => (pointerDown = true));
window.addEventListener("pointerup",   () => (pointerDown = false));



// -------------------------------------
// Audio: must start on gesture
// -------------------------------------
// window.addEventListener(
//   "pointerdown",
//   async () => {
//     await initAudioOnFirstGesture();
//   },
//   { once: true }
// );

// -------------------------------------
// Sound/Audio
// -------------------------------------

const perf = createPerformanceState();
const controller = createMouseKeyboardController(window);
const audio = createGalaxyAudioEngine();
const voices = createGalaxyVoices();
const audioUI = createAudioMonitorUI();
const audioVoices = createGalaxyVoices();


// -------------------------------------
// Step Sequencer (16-step ring) - MVP
// -------------------------------------
const STEPS = 16;
const beatSteps = new Array(STEPS).fill(false); // key "1"
const percSteps = new Array(STEPS).fill(false); // key "2"

let hoveredStep = 0;
let playheadStep = 0;

// 建立 16 个点（DOM）
const stepRing = document.getElementById("step-ring");
const stepDots = [];

function buildStepRingDots() {
  if (!stepRing) return;
  stepRing.innerHTML = "";
  stepDots.length = 0;

  const R = 56;        // 半径（px）
  const cx = 70, cy = 70; // ring 中心（因为 140x140）

  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2 - Math.PI / 2; // 从上方开始
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;

    // beat dot
    const d1 = document.createElement("div");
    d1.className = "step-dot beat off";
    d1.style.left = `${x}px`;
    d1.style.top = `${y}px`;
    stepRing.appendChild(d1);

    // perc dot（稍微偏内圈一点）
    const d2 = document.createElement("div");
    d2.className = "step-dot perc off";
    d2.style.left = `${cx + Math.cos(a) * (R - 10)}px`;
    d2.style.top = `${cy + Math.sin(a) * (R - 10)}px`;
    stepRing.appendChild(d2);

    stepDots.push({ beat: d1, perc: d2 });
  }
}
buildStepRingDots();

// 根据鼠标位置计算当前 hover 到哪个 step（用 tempo-ring 的中心更稳）
const tempoRingEl = document.getElementById("tempo-ring");
function updateHoveredStepFromMouse(clientX, clientY) {
  if (!tempoRingEl) return;
  const r = tempoRingEl.getBoundingClientRect();
  const cx = r.left + r.width * 0.5;
  const cy = r.top + r.height * 0.5;

  const ang = Math.atan2(clientY - cy, clientX - cx); // -pi..pi
  let t = (ang + Math.PI / 2) / (Math.PI * 2);        // 0..1 (上方=0)
  t = (t % 1 + 1) % 1;
  hoveredStep = Math.floor(t * STEPS) % STEPS;
}

// 键盘放置：1=beat, 2=perc, Backspace/Delete=清空这个 step
window.addEventListener("keydown", (e) => {

  // ✅ 只在鼠标位于 tempo/step ring 区域附近才允许编辑
  if (tempoRingEl) {
    const r = tempoRingEl.getBoundingClientRect();
    const mx = window.__lastMouseX ?? 0;
    const my = window.__lastMouseY ?? 0;
    const inside =
      mx >= r.left - 20 && mx <= r.right + 20 &&
      my >= r.top - 20 && my <= r.bottom + 20;
    if (!inside) return;   // ✅ 现在 return 是合法的
  }

  if (e.code === "Digit1") beatSteps[hoveredStep] = !beatSteps[hoveredStep];
  if (e.code === "Digit2") percSteps[hoveredStep] = !percSteps[hoveredStep];

  if (e.code === "Backspace" || e.code === "Delete") {
    beatSteps[hoveredStep] = false;
    percSteps[hoveredStep] = false;
  }
});


// 右键清空当前 step（避免浏览器菜单）
window.addEventListener("contextmenu", (e) => {
  // 只有在靠近左下 ring 的区域才拦截（防止影响全局右键）
  if (!tempoRingEl) return;
  const r = tempoRingEl.getBoundingClientRect();
  const near =
    e.clientX >= r.left - 10 && e.clientX <= r.right + 10 &&
    e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10;

  if (near) {
    e.preventDefault();
    beatSteps[hoveredStep] = false;
    percSteps[hoveredStep] = false;
  }
});





// -------------------------------------
// Tempo Ring (DOM) - init once
// -------------------------------------
const tempoRing = document.getElementById("tempo-ring");

// 如果你还没把 ring 插到 HTML，避免直接报错
if (!tempoRing) {
  console.warn("[TempoRing] #tempo-ring not found in DOM.");
}

// ✅ 作为“全局目标值”，tick 里会把它喂给 perf
let tempoTarget = perf.state.tempoBpm ?? 102;

let draggingTempo = false;
let lastAngle = 0;

function getAngleFromPointerEvent(e) {
  const r = tempoRing.getBoundingClientRect();
  const cx = r.left + r.width * 0.5;
  const cy = r.top + r.height * 0.5;
  return Math.atan2(e.clientY - cy, e.clientX - cx);
}

function wrapDelta(a) {
  if (a > Math.PI) return a - Math.PI * 2;
  if (a < -Math.PI) return a + Math.PI * 2;
  return a;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

// 让 ring 视觉跟着 bpm 转（简单粗暴但有效）
function setRingVisualByBpm(bpm) {
  if (!tempoRing) return;
  const t = (bpm - 90) / 30;          // 90..120 -> 0..1
  const ang = t * Math.PI * 2;        // -> 0..2π
  tempoRing.style.transform = `rotate(${ang}rad)`;
}

if (tempoRing) {
  // 点击更稳：给一点点透明填充（可选）
  // tempoRing.style.background = "rgba(255,255,255,0.02)";

  tempoRing.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    draggingTempo = true;
    lastAngle = getAngleFromPointerEvent(e);
  });

  window.addEventListener("pointermove", (e) => {

    updateHoveredStepFromMouse(e.clientX, e.clientY);
    window.__lastMouseX = e.clientX;
    window.__lastMouseY = e.clientY;

    if (!draggingTempo) return;
    e.preventDefault();

    const ang = getAngleFromPointerEvent(e);
    const d = wrapDelta(ang - lastAngle);
    lastAngle = ang;

    const SENS = 18; // 手感参数：想更灵敏就 24，想更稳就 12
    tempoTarget = clamp(tempoTarget + d * SENS, 90, 120);
  });

  window.addEventListener("pointerup", (e) => {
    if (!draggingTempo) return;
    e.preventDefault();
    draggingTempo = false;
  });
}



// ✅ 解决“听不到”的核心：用户交互解锁
audio.bindUserStart(window);

// 点击触发（也可以在你的 canvas 上绑定）
window.addEventListener("mousedown", () => {
  perf.fireTrigger(1.0);
  console.log("[TRIGGER] click");
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") perf.fireTrigger(1.0);
});

// -------------------------------------
// mood
// -------------------------------------

const bgMood = {
  hue: 0.85,
  hueTarget: 0.85,
  energy: 0.0,
};



// -------------------------------------
// Brackground
// -------------------------------------

const bg = createDreamyBackground(scene);

bg.setStyle({
  rings: 1,
  glitter: 1,
  intensity: 1,
  parallax: 1,
});


// -------------------------------------
// Brackground mouse
// -------------------------------------

const mouse01 = { x: 0.5, y: 0.5 };

window.addEventListener("mousemove", (e) => {
  mouse01.x = e.clientX / window.innerWidth;
  mouse01.y = 1.0 - e.clientY / window.innerHeight;
});

// -------------------------------------
// Nebula system
// -------------------------------------
const nebulaSystem = createNebulaSystem({
  scene,
  radiusWorld: 7.0,
  planeY: 0.0,
  starTexture,
});

setupGalaxyGUI({ camera, renderer, nebulaSystem });

// -------------------------------------
// Meteors
// -------------------------------------
const meteorSystem = createMeteorSystem({
  scene,
  camera,
  renderer,
  streakVert: meteorVert,
  streakFrag: meteorFrag,
  planeY: nebulaSystem.planeY,
  onSpawn: (e) => playMeteorSfx(e),
});

window.__meteor = meteorSystem;

// 新系统没有 mesh（旧系统才有 instanced quad mesh）
console.log("meteor system", meteorSystem);
console.log("vert len", meteorVert.length, "frag len", meteorFrag.length);


setupMeteorGUI(meteorSystem);

// -------------------------------------
// Drag rotate nebula world
// -------------------------------------
const canvas = renderer.domElement;

let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  // 点到 GUI 不旋转
  if (e.target.closest?.(".lil-gui") || e.target.closest?.(".dg")) return;

  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;

  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  nebulaSystem.root.rotation.y += dx * 0.005;
  nebulaSystem.root.rotation.x += dy * 0.005;

  nebulaSystem.root.rotation.x = THREE.MathUtils.clamp(
    nebulaSystem.root.rotation.x,
    -1.25,
    1.25
  );
});

canvas.addEventListener("pointerup", (e) => {
  isDragging = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
});

function hsvToRgb(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const m = i % 6;
  const r = [v, q, p, p, t, v][m];
  const g = [t, v, v, q, p, p][m];
  const b = [p, p, t, v, v, q][m];
  return [r, g, b];
}


// -------------------------------------
// Zoom to cursor
// -------------------------------------
const zoomRaycaster = new THREE.Raycaster();
const zoomMouse = new THREE.Vector2();
const zoomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -nebulaSystem.planeY);

function getMouseWorldOnPlane(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  zoomMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  zoomMouse.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  zoomRaycaster.setFromCamera(zoomMouse, camera);
  const hit = new THREE.Vector3();
  const ok = zoomRaycaster.ray.intersectPlane(zoomPlane, hit);
  return ok ? hit : null;
}

const MIN_DIST = 1.2;
const MAX_DIST = 60.0;

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const pivot = getMouseWorldOnPlane(e.clientX, e.clientY);
    if (!pivot) return;

    // 缩放系数：滚轮向下(zoom out) >1；向上(zoom in) <1
    const zoomStep = 1.12;
    const factor = e.deltaY > 0 ? zoomStep : 1 / zoomStep;

    // 1) 沿着 pivot 缩放：相机向 pivot 前进/后退（不会旋转）
    const before = camera.position.clone();
    camera.position.copy(pivot).add(before.sub(pivot).multiplyScalar(factor));

    // 2) 限制最近/最远距离（相机到 pivot）
    const dist = camera.position.distanceTo(pivot);
    if (dist < MIN_DIST) {
      camera.position.copy(pivot).add(camera.position.clone().sub(pivot).setLength(MIN_DIST));
    } else if (dist > MAX_DIST) {
      camera.position.copy(pivot).add(camera.position.clone().sub(pivot).setLength(MAX_DIST));
    }

    // 3) 校正：保持“鼠标点下的世界位置”锁定不漂（非常关键）
    const afterPivot = getMouseWorldOnPlane(e.clientX, e.clientY);
    if (afterPivot) {
      const correction = pivot.clone().sub(afterPivot);
      camera.position.add(correction);
    }

    // 相机朝向保持稳定（不跟鼠标跑，只看中心）
    camera.lookAt(0, 0, 0);
  },
  { passive: false }
);


// -------------------------------------
// Stars
// -------------------------------------
const stars = makeStars({ count: 65000, radius: 7.0, thickness: 1.6 });
scene.add(stars);

// -------------------------------------
// Mouse move intensity (for audio trigger)
// -------------------------------------
let lastPX = 0,
  lastPY = 0;
let move01 = 0;

window.addEventListener("pointermove", (e) => {
  const dx = e.clientX - lastPX;
  const dy = e.clientY - lastPY;
  lastPX = e.clientX;
  lastPY = e.clientY;

  const speed = Math.sqrt(dx * dx + dy * dy);
  move01 = Math.min(1, speed / 60);
});

// -------------------------------------
// Tick
// -------------------------------------
const clock = new THREE.Clock();
const lookTarget = new THREE.Vector3(0, 0, 0);
const lookTargetSmooth = new THREE.Vector3(0, 0, 0);
const LOOK_MIX = 0.18;
const LOOK_SMOOTH = 0.035;
const HIT_CLAMP_RADIUS = 4.0;

// -------------------------------------
// Step Sequencer scheduling (Tone.Transport)
// -------------------------------------
let seqEventId = null;

function startStepSequencer() {
  if (seqEventId !== null) return;

  // 每个 16 分音符走一步（16 step = 1 小节）
  seqEventId = Tone.Transport.scheduleRepeat((time) => {
    const pos = Tone.Transport.position.split(":");
    const sixteenth = parseInt(pos[2] ?? "0", 10); // 0..3
    const beat = parseInt(pos[1] ?? "0", 10);      // 0..3
    const step = (beat * 4 + sixteenth) % STEPS;   // 0..15
    playheadStep = step;

    // 触发
    if (beatSteps[step]) audio.triggerBeat(time, 1.0);
    if (percSteps[step]) audio.triggerPerc(time, 1.0);
  }, "16n");
}
startStepSequencer();

if (Tone.Transport.state !== "started") Tone.Transport.start();


function tick() {
  // dt 用于输入平滑/音频平滑
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.getElapsedTime();

  // --- raycast to plane
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(plane, hitPoint);

  // --- raycast to nebula (lead only when hovering nebula)
  nebulaRaycaster.setFromCamera(pointer, camera);

  // 射线打到 nebulaSystem.root 的所有子物体（true 表示递归）
  const hits = nebulaRaycaster.intersectObject(nebulaSystem.root, true);

  // 1) 只接受带 galaxyId 的命中（避免命中巨大“背景/点云容器”导致全屏都 hit）
  const pick = hits.find(h => h?.object?.userData?.galaxyId);

  // 2) 再加一个“屏幕距离阈值”，离开星云就立刻判定为 no
  let nebulaHitLocal = null;
  let hoveredNebulaKey = null;

  if (pick) {
    // 把命中点投影到 NDC，和鼠标 pointer(NDC) 比距离
    const p = pick.point.clone().project(camera);   // p.x/p.y 是 NDC
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;

    // 阈值：越小越严格（0.08~0.18 之间都合理）
    const NDC_THRESH = 0.12;
    const ok = (dx*dx + dy*dy) < (NDC_THRESH * NDC_THRESH);

    if (ok) {
      nebulaHitLocal = pick;
      hoveredNebulaKey = pick.object.userData.galaxyId;
    }
  }

  nebulaHit = nebulaHitLocal;
  const hasNebulaHit = !!nebulaHit;




  // --- background
  bg.update(t);
  bg.setMouse01(mouse01.x, mouse01.y);

  // --- stars
  stars.material.uniforms.uTime.value = t;
  stars.material.uniforms.uPointer.value.copy(pointer);

  // --- nebula & meteor
  nebulaSystem.update(hitPoint, t);
  meteorSystem.update(t);

  // -----------------------------
  // ✅ Phase1: Inputs -> PerformanceState -> Audio -> Visual
  // -----------------------------
  // 1) 输入 -> 目标
  const targets = controller.update(dt);
  perf.setTargets({ tempoBpm: tempoTarget });


  // 2) 平滑语义层
  perf.update(dt);
  
  setRingVisualByBpm(perf.state.tempoBpm);

    // 3) trigger 只给音频吃一帧
  const ps = perf.state;

  // --- Debug HUD update (must be inside tick)
  const hoverInst = hoveredNebulaKey ? voices.getNebulaInstrumentName(hoveredNebulaKey) : "-";
  const activeInst = activeNebulaKey ? voices.getNebulaInstrumentName(activeNebulaKey) : "-";

  debugHud.textContent =
    `hover:  ${hoveredNebulaKey ?? "-"} (${hoverInst})\n` +
    `active: ${activeNebulaKey ?? "-"} (${activeInst})\n` +
    `hit:    ${hasNebulaHit ? "yes" : "no"}\n` +
    `down:   ${pointerDown ? "yes" : "no"}`;



  const trig = ps.trigger;
  if (trig) ps.trigger = false;


  // click 发生时：如果命中星云，就切 activeNebulaId（用 hoveredNebulaKey）
  if (trig && hoveredNebulaKey) {
    const prev = activeNebulaKey;
    activeNebulaKey = hoveredNebulaKey;

    // 立刻给一个“音色确认音”：点击就能听到变化
    if (prev !== activeNebulaKey) {
      const inst = voices.getNebulaInstrument(activeNebulaKey);
      // 选一个固定音高，避免你以为“音高变了=音色变了”
      inst?.triggerAttackRelease("C5", "16n", Tone.now(), 0.9);
    }
  }




  // ✅ click 发生时：如果命中星云，就切换 activeNebulaId（用 hoveredNebulaKey）
  // if (trig && hasNebulaHit && hoveredNebulaKey) {
  //   perf.setTargets({ activeNebulaId: hoveredNebulaKey });
  // }



  // 4) 音频：先喂，再更新（Lead Gate: only when hovering nebula）
  const psForAudio = { ...ps, trigger: trig };

  // ✅ 只有 hover 到的 nebula == activeNebula 才允许驱动 lead
  const isActiveNebulaHovered =
    pointerDown &&
    hasNebulaHit &&
    hoveredNebulaKey &&
    hoveredNebulaKey === activeNebulaKey


  if (isActiveNebulaHovered && nebulaHit) {
    const hitPos = nebulaHit.object.getWorldPosition(new THREE.Vector3());
    const screen = hitPos.clone().project(camera);

    const dx = pointer.x - screen.x;
    const dy = pointer.y - screen.y;

    let ang = Math.atan2(dy, dx); // -pi..pi
    if (ang < 0) ang += Math.PI * 2;
    const theta01 = ang / (Math.PI * 2);

    const instrument =
      audioVoices?.getNebulaInstrument?.(activeNebulaKey);

    audio.playNebulaScratch({
      galaxyId: activeNebulaKey,
      theta01,
      instrument,
    });
  }



  if (!isActiveNebulaHovered) {
    psForAudio.energy = 0;
    psForAudio.texture = 0;
    psForAudio.pitch = 0;
    psForAudio.rotation = 0;
  }

  audio.setPerformance(psForAudio);
  audio.update(dt);


  // 5) 音频状态：先拿到 a，再用它做任何视觉映射
  const a = audio.getState();

    // --- Step ring UI update
  if (stepDots.length === STEPS) {
    for (let i = 0; i < STEPS; i++) {
      stepDots[i].beat.classList.toggle("off", !beatSteps[i]);
      stepDots[i].perc.classList.toggle("off", !percSteps[i]);

      // playhead 高亮（让它“活起来”）
      stepDots[i].beat.classList.toggle("playhead", i === playheadStep && beatSteps[i]);
      stepDots[i].perc.classList.toggle("playhead", i === playheadStep && percSteps[i]);
    
      stepDots[i].beat.classList.toggle("hover", i === hoveredStep);
      stepDots[i].perc.classList.toggle("hover", i === hoveredStep);

    }
  }


  // ✅ 在这里统一定义 midi
  const midi = a.lastMidi ?? 60;

  // 之后随便用
  const pitchClass = ((midi % 12) + 12) % 12;
  const hueSpan = 0.18;
  const hueBase = 0.86;
  bgMood.hueTarget = hueBase + (pitchClass / 12) * hueSpan;


  // 慢慢 lerp（关键：速度小，避免夜店闪）
  bgMood.hue += (bgMood.hueTarget - bgMood.hue) * (1 - Math.exp(-dt * 1.2));

  // ✅ 再用它算 rawE
  const interact = Math.max(ps.energy ?? 0, (ps.texture ?? 0) * 0.35);

  const rawE = Math.max(a.rms ?? 0, interact * 0.65);

  // 慢 attack / 更慢 release，避免跟鼓点跳
  const atk = 1 - Math.exp(-dt * 1.2);   // 变亮速度（慢）
  const rel = 1 - Math.exp(-dt * 0.55);  // 变暗速度（更慢）
  bgMood.energy += (rawE - bgMood.energy) * (rawE > bgMood.energy ? atk : rel);


  // 音频能量（如果 Tone 还没响，这里可能很低）
  const audioE = a.rms ?? 0;

  // ✅ emergence：音频 or 交互，只要有一个起来就显现
  // const emergence = THREE.MathUtils.clamp(Math.max(audioE * 1.35, interact * 0.90), 0, 1);
  let emergence = THREE.MathUtils.clamp(bgMood.energy * 1.25, 0, 1);
  // 压顶：让 0.7~1.0 的区域不要变成白墙
  emergence = 1.0 - Math.exp(-emergence * 2.2);


  // ✅ tint：用 bgMood.hue（你已经在慢慢 lerp）
  const tint = hsvToRgb(bgMood.hue, 0.55, 0.90);

  bg.setStyle({
    tint,
    emergence,
    rings: 0.10 + emergence * 0.18,
    glitter: 0.05,
    intensity: 1.0,
    parallax: 0.5,
  });


  // --- 低频呼吸（非常轻，避免蹦迪）
  const bassPulse = Math.pow(a.beatPulse * (ps.energy ?? 0), 1.2);
  scene.scale.setScalar(1.0 + bassPulse * 0.0015);

  // --- Bloom：只跟随 rms（慢），别跟 beatPulse
  bloomPass.strength += ((0.16 + bgMood.energy * 0.14) - bloomPass.strength) * (1 - Math.exp(-dt * 1.6));
  bloomPass.threshold = 0.97;
  bloomPass.radius = 0.14;



  // --- render
  composer.render();

  // --- 左侧音频监控 UI
  audioUI.update(a, perf.state);


  requestAnimationFrame(tick);
}

tick();

// -------------------------------------
// Resize
// -------------------------------------
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
});

// -------------------------------------
// Helpers
// -------------------------------------
function makeStars({ count, radius, thickness }) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;

    const r = Math.pow(Math.random(), 0.45) * radius;
    const angle = Math.random() * Math.PI * 2;

    const armT = r / radius;
    const swirl = armT * 2.4;
    const a = angle + swirl;

    const y = (Math.random() - 0.5) * thickness * (1.0 - armT * 0.7);
    const nx = (Math.random() - 0.5) * 0.25;
    const nz = (Math.random() - 0.5) * 0.25;

    const x = Math.cos(a) * r + nx;
    const z = Math.sin(a) * r + nz;

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    const t = Math.min(1, r / radius);
    const cA = new THREE.Color("#ff72d8");
    const cB = new THREE.Color("#b9a7ff");
    const cC = new THREE.Color("#7fe7ff");
    const c = new THREE.Color();
    if (t < 0.5) c.copy(cA).lerp(cB, t / 0.5);
    else c.copy(cB).lerp(cC, (t - 0.5) / 0.5);
    c.lerp(new THREE.Color("#ffffff"), (1.0 - t) * 0.18);

    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    sizes[i] = 0.18 + Math.pow(Math.random(), 2.2) * 1.2;
    seeds[i] = Math.random() * 1000.0;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: starsVert,
    fragmentShader: starsFrag,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
