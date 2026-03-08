import * as THREE from "three";
import * as Tone from "tone";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { setupGalaxyGUI } from "./ui/galaxyGui.js";
import { setupMeteorGUI } from "./ui/meteorGui.js";
import { createNebulaNoteHintController } from "./ui/nebulaNoteHintController.js";

// import { initAudioOnFirstGesture, triggerOnMove } from "./audio.js";
import { playMeteorSfx } from "./audio/meteorSfx.js";

import { createNebulaSystem } from "./nebula/nebulaSystem.js";
import { createMeteorSystem } from "./meteor/meteorSystem.js";

import { createDreamyBackground, setupBackgroundGUI } from "./background/dreamyBackground";

import { createPerformanceState } from "./performance/performanceState";
import { createMouseKeyboardController } from "./input/mouseKeyboardController";
import { createGalaxyAudioEngine } from "./audio/galaxyAudioEngine";

import { createGalaxyVoices } from "./audio/galaxyVoices.js";

import { createAudioMonitorUI } from "./ui/audioMonitor.js";
import { createNoteColorPanel } from "./ui/noteColorPanel.js";

import { createCameraControlSystem } from "./input/cameraControlSystem.js";
import { musicState } from "./state/musicState.js";
import { resolveNoteIntent } from "./interaction/resolveNoteIntent.js";
import { onPointerMove, onPointerDown, onPointerMovePressed, onPointerUp } from "./interaction/intentStateMachine.js";
import { NOTE_STEPS, stepToBoundaryTheta01, stepToCenterTheta01 } from "./music/noteMapping.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import meteorVert from "./shaders/meteor.vert.glsl?raw";
import meteorFrag from "./shaders/meteor.frag.glsl?raw";

console.log("MAIN JS LOADED");
// --- Debug HUD (show active/hover)
const debugHud = document.createElement("div");
debugHud.className = "custom-ui debug-hud";
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

const DEBUG_INTENT = true;
const DEBUG_NOTE_OVERLAY = true;
const __lastIntentLog = { hover: null, active: null, last: null };
function logIntentChange(kind, intent) {
  if (!DEBUG_INTENT) return;
  const next = intent?.noteName ?? null;
  if (__lastIntentLog[kind] === next) return;
  __lastIntentLog[kind] = next;
  console.log(`[intent] ${kind}:`, next ?? "-");
}

const noteOverlay = document.createElement("canvas");
noteOverlay.className = "custom-ui note-overlay";
noteOverlay.style.cssText = `
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
`;
document.body.appendChild(noteOverlay);
const noteOverlayCtx = noteOverlay.getContext("2d");


(async function main(){


// -------------------- BG state (global) --------------------
let bgLeadE = 0.0;     // 0..1 presence
let bgPitch01 = 0.5;   // 0..1
let bgVel01 = 0.0;     // 0..1
let bgTheta01 = 0.0;   // 0..1
let bgPulse = 0.0;     // 0..1 (note trigger)
let bgClickPulse = 0.0; // click-triggered ripple source
let bgClickPulseVis = 0.0; // attack-shaped pulse
let bgInteractionE = 0.0; // local turbulence envelope
let bgLastEmitE = 0.0;
let bgLastStep = -1;
let bgNoteHue = 0.86;
let bgNoteSeed = 0.0;

// -------------------------------------

// Dynamic resolution scaling (simple)
let __fpsEMA = 60;
let __pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
let __lastPixelRatioApplyMs = 0;

// Renderer
// -------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(__pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

function __bgRiseFall(current, target, dt, rise = 16.0, fall = 4.0) {
  const k = target > current ? rise : fall;
  return THREE.MathUtils.damp(current, target, k, dt);
}

// -------------------------------------
// Scene / Camera
// -------------------------------------
const scene = new THREE.Scene();

const testSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
scene.add(testSphere);


const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 2000);
camera.position.set(0, 6.5, 8.5);
camera.lookAt(0, 0, 0);

const cameraControl = createCameraControlSystem({
  camera,
  domElement: renderer.domElement,
  getPivotWorldPoint: getMouseWorldOnPlane, // ✅ 关键：用你已有的平面求交当 pivot
  zoomSpeed: 0.0018, // 可以从 0.0012~0.0022 调
});

const bg = await createDreamyBackground(scene, camera, {
  palette: "aurora",
  baseColor: "#04050D",
});

// 初始时禁用流动效果和亮度
  bg.uniforms.uFlow.value = 0.012;
  bg.uniforms.uSparkle.value = 0;
  bg.uniforms.uIntensity.value = 0.015;
  // Large-display baseline: denser background texture layers.
  bg.uniforms.uScale.value = 0.92;
  bg.uniforms.uDetail.value = 0.44;
  bg.uniforms.uWarp.value = 0.56;

  let isInteracting = false;

  

// ✅ 防止背景盖住所有物体：背景不参与深度，并强制最底层渲染
try {
  const root = bg?.root || bg?.group || bg?.mesh || bg;
  if (root?.traverse) {
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.depthWrite = false;
          m.depthTest = false;
          m.transparent = true;
        }
        o.renderOrder = -9999;
      }
    });
  }
} catch (e) {
  console.warn("bg depth fix failed:", e);
}

window.__bg = bg;
// If your existing UI exposes a gui instance on window.__gui, this will attach a small Background folder.
if (window.__gui) setupBackgroundGUI(window.__gui, bg);
scene.background = new THREE.Color(0x000000);




// ------------------ Orbit Camera (Alt+Drag) ------------------
const orbitTarget = new THREE.Vector3(0, 0, 0);
let orbitRadius = camera.position.distanceTo(orbitTarget);
let orbitYaw = Math.atan2(camera.position.x - orbitTarget.x, camera.position.z - orbitTarget.z);
let orbitPitch = Math.asin((camera.position.y - orbitTarget.y) / orbitRadius);

function applyOrbitCamera() {
  orbitPitch = THREE.MathUtils.clamp(orbitPitch, -1.25, 1.25);
  const cp = Math.cos(orbitPitch);
  camera.position.set(
    orbitTarget.x + orbitRadius * Math.sin(orbitYaw) * cp,
    orbitTarget.y + orbitRadius * Math.sin(orbitPitch),
    orbitTarget.z + orbitRadius * Math.cos(orbitYaw) * cp
  );
  camera.lookAt(orbitTarget);
}


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

let frameCount = 0;

let activeNebulaKey = null;

let lastInteractionTime = 0;

function triggerBackgroundPulse(strength = 1.0) {
  const s = THREE.MathUtils.clamp(strength, 0, 1);
  bgClickPulse = Math.max(bgClickPulse, s);
  bgPulse = Math.max(bgPulse, 0.75 * s);
}


// -------------------------------------
// Active nebula scratch disk (fixed center + tolerance radius)
// -------------------------------------
let activeDiskCenterW = null;   // THREE.Vector3 (world)
let activeDiskRadiusW = 1.8;    // world radius (rough)
let activeDiskOuterNDC = 0.18;  // screen-space radius (ndc), computed per-frame
let activeDiskInnerNDC = 0.02;  // deadzone radius (ndc), computed per-frame


let interactionMode = "orbit"; 

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.0);
const hitPoint = new THREE.Vector3();

// 鼠标 NDC（用于星空）
const pointer = new THREE.Vector2(0, 0);
let noteHint = null;
window.addEventListener("pointermove", (e) => {
  __markPointerMoved(e.clientX, e.clientY);
  noteHint?.setPointerClientXY?.(e.clientX, e.clientY);
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});


// -------------------------------------
// 全局pointDown
// -------------------------------------

let pointerDown = false;

// ✅ 浏览器需要用户手势才能启动音频：首次 pointerdown 自动 resume Tone AudioContext
window.addEventListener("pointerdown", async () => {
  try { await Tone.start(); } catch {}
}, { once: true });


// -----------------------------
// Performance throttles
// -----------------------------
let __frameId = 0;
let __pointerMoved = true;
let __lastPointerX = 0;
let __lastPointerY = 0;

let __lastNebulaPickMs = 0;
let __cachedHoverNebulaKey = null;
let __cachedNebulaHit = null;
let __lastUIUpdateMs = 0;
let __lastHudUpdateMs = 0;


function __markPointerMoved(clientX, clientY) {
  if (clientX !== __lastPointerX || clientY !== __lastPointerY) {
    __pointerMoved = true;
    __lastPointerX = clientX;
    __lastPointerY = clientY;
  }
}

window.addEventListener("pointerdown", (e) => {
  if (e.target?.closest?.(".custom-ui") || e.target?.closest?.(".lil-gui") || e.target?.closest?.(".dg")) return;
  pointerDown = true;
});
window.addEventListener("pointerup", () => {
  pointerDown = false;
  onPointerUp(musicState);
  activeNebulaKey = null;
  activeDiskCenterW = null;
  logIntentChange("last", musicState.lastIntent);
  logIntentChange("active", musicState.activeIntent);
});



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
const audioEngine = audio;
const voices = createGalaxyVoices();
const audioUI = createAudioMonitorUI();
const noteColorUI = createNoteColorPanel();
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

  if (e.key === "Escape") {
    interactionMode = "orbit";
    activeNebulaKey = null; // ✅ ESC 退出当前星云控制
    musicState.activeIntent = null;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    activeNebulaKey = null;
    musicState.activeIntent = null;
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

  tempoRing.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    draggingTempo = true;
    lastAngle = getAngleFromPointerEvent(e);
  });

  window.addEventListener("pointermove", (e) => {
  __markPointerMoved(e.clientX, e.clientY);

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

const bgMood = {
  hue: 0.85,
  hueTarget: 0.85,
  energy: 0.0,
};



// -------------------------------------
// Brackground
// -------------------------------------

// ✅ background audio uniforms handle
const bgU = bg.uniforms;

// ✅ background “note paint” state
// let bgPulse = 0.0;
let bgSeed = 0.123;
let lastMidiSeen = -999;
let lastTheta01 = 0.0;
let lastVel01 = 0.0;
let lastPitch01 = 0.5;


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

const galaxyGuiRef = setupGalaxyGUI({ camera, renderer, nebulaSystem });
window.__gui = galaxyGuiRef?.gui ?? null;
if (window.__gui) setupBackgroundGUI(window.__gui, bg);

function resizeNoteOverlay() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  noteOverlay.width = w;
  noteOverlay.height = h;
}

function worldToOverlayXY(v3) {
  const p = v3.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * noteOverlay.width,
    y: (1 - (p.y * 0.5 + 0.5)) * noteOverlay.height,
  };
}

function drawNoteAlignmentOverlay(intent) {
  if (!DEBUG_NOTE_OVERLAY || !noteOverlayCtx) return;
  const ctx = noteOverlayCtx;
  ctx.clearRect(0, 0, noteOverlay.width, noteOverlay.height);

  if (!intent?.galaxyId) return;
  const cluster = nebulaSystem.getCluster?.(intent.galaxyId);
  if (!cluster?.group) return;

  const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
  const radius = Math.max(1e-4, 1.9 * sizeScale);

  const centerW = cluster.group.localToWorld(new THREE.Vector3(0, 0, 0));
  const center2 = worldToOverlayXY(centerW);

  ctx.strokeStyle = "rgba(120,200,255,0.65)";
  ctx.lineWidth = 1;

  for (let i = 0; i < NOTE_STEPS; i++) {
    const a = stepToBoundaryTheta01(i, NOTE_STEPS) * Math.PI * 2;
    const p = cluster.group.localToWorld(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    const p2 = worldToOverlayXY(p);
    ctx.beginPath();
    ctx.moveTo(center2.x, center2.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let i = 0; i < NOTE_STEPS; i++) {
    const a = stepToCenterTheta01(i, NOTE_STEPS) * Math.PI * 2;
    const p = cluster.group.localToWorld(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    const p2 = worldToOverlayXY(p);
    ctx.fillStyle = (i === intent.step) ? "rgba(255,255,120,0.95)" : "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, i === intent.step ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (intent.hitWorld) {
    const hit2 = worldToOverlayXY(intent.hitWorld);
    ctx.fillStyle = "rgba(255,80,80,0.95)";
    ctx.beginPath();
    ctx.arc(hit2.x, hit2.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
resizeNoteOverlay();

function cacheActiveDiskFromNebula(galaxyId) {
  if (!galaxyId) {
    activeDiskCenterW = null;
    return;
  }

  const c = nebulaSystem.getCluster?.(galaxyId);
  if (!c) return;

  // 固定中心：用 group 的世界坐标（不会被命中点抖动影响）
  activeDiskCenterW = c.group.getWorldPosition(new THREE.Vector3());

  // 半径：用 sizeScale 推一个“盘面范围”（你可以之后再调这个系数）
  const sizeScale = c.preset?.shape?.sizeScale ?? 1.0;
  const groupScale = c.group.scale?.x ?? 1.0;

  // 这个系数决定“容错盘面”的大致半径，先给一个偏稳的值
  activeDiskRadiusW = 1.9 * sizeScale * groupScale;
}

function updateActiveDiskNdcRadii() {
  if (!activeDiskCenterW) return;

  // 将中心投影到 NDC
  const centerN = activeDiskCenterW.clone().project(camera);

  // 取相机右方向，在世界里偏移一个 radiusW，投影后得到屏幕半径（NDC）
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const edgeW = activeDiskCenterW.clone().add(right.multiplyScalar(activeDiskRadiusW));
  const edgeN = edgeW.project(camera);

  const r = Math.hypot(edgeN.x - centerN.x, edgeN.y - centerN.y);

  // 外圈半径：允许演奏的最大范围（加个下限避免太小）
  activeDiskOuterNDC = Math.max(0.10, Math.min(0.35, r));

  // 内圈死区：中心太近角度不稳定，留个 deadzone
  activeDiskInnerNDC = activeDiskOuterNDC * 0.18;
}


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


const meteorGui = setupMeteorGUI(meteorSystem);

const UI_VIS_KEY = "GalaxySynth_CustomUIVisible_v1";
function readUiVisibleState() {
  try {
    const raw = localStorage.getItem(UI_VIS_KEY);
    if (raw == null) return true;
    return raw !== "0";
  } catch {
    return true;
  }
}
function writeUiVisibleState(visible) {
  try {
    localStorage.setItem(UI_VIS_KEY, visible ? "1" : "0");
  } catch {}
}

let customUiVisible = readUiVisibleState();

const uiToggleBtn = document.createElement("button");
uiToggleBtn.className = "ui-toggle-btn";
uiToggleBtn.style.cssText = [
  "position:fixed",
  "right:12px",
  "top:12px",
  "z-index:10000",
  "border:0",
  "border-radius:10px",
  "padding:8px 10px",
  "background:rgba(8,10,18,0.72)",
  "backdrop-filter:blur(8px)",
  "color:#eef2ff",
  "font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
  "cursor:pointer",
].join(";");
uiToggleBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
uiToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setCustomUiVisible(!customUiVisible);
});
document.body.appendChild(uiToggleBtn);

function setCustomUiVisible(visible) {
  customUiVisible = !!visible;
  writeUiVisibleState(customUiVisible);
  uiToggleBtn.textContent = `UI: ${customUiVisible ? "ON" : "OFF"} (H)`;

  const list = document.querySelectorAll(".custom-ui, .lil-gui, .dg");
  list.forEach((el) => {
    if (el === uiToggleBtn) return;
    el.style.display = customUiVisible ? "" : "none";
  });

  noteColorUI?.setVisible?.(customUiVisible);
  audioUI?.setVisible?.(customUiVisible);
  if (galaxyGuiRef?.gui?.domElement) galaxyGuiRef.gui.domElement.style.display = customUiVisible ? "" : "none";
  if (meteorGui?.domElement) meteorGui.domElement.style.display = customUiVisible ? "" : "none";
}

window.addEventListener("keydown", (e) => {
  const tag = String(e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
  if (e.repeat) return;
  if ((e.key || "").toLowerCase() !== "h") return;
  setCustomUiVisible(!customUiVisible);
});

setCustomUiVisible(customUiVisible);



function getPointerNDCFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  return new THREE.Vector2(x, y);
}

function pickNebulaAtEvent(e) {
  const ndc = getPointerNDCFromEvent(e);
  nebulaRaycaster.setFromCamera(ndc, camera);

  const hits = nebulaRaycaster.intersectObject(nebulaSystem.root, true);
  const pick = hits.find(h => h?.object?.userData?.galaxyId);

  if (!pick) return null;

  // 额外做一次“屏幕距离阈值”过滤，避免命中容器/大面
  const p = pick.point.clone().project(camera);
  const dx = p.x - ndc.x;
  const dy = p.y - ndc.y;
  const NDC_THRESH = 0.12;
  const ok = (dx*dx + dy*dy) < (NDC_THRESH * NDC_THRESH);

  if (!ok) return null;

  return {
    galaxyId: pick.object.userData.galaxyId,
    hit: pick,
  };
}



// -------------------------------------
// Drag rotate nebula world
// -------------------------------------
const canvas = renderer.domElement;

let isDragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  if (e.target.closest?.(".lil-gui") || e.target.closest?.(".dg")) return;

  // ✅ Alt + 左键：永远是旋转（不管当前选没选星云）
  if (e.altKey && e.button === 0) {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    return;
  }

  // 左键：activeIntent = hoverIntent（null 则保持 null）
  if (e.button === 0) {
    const pick = pickNebulaAtEvent(e);
    const ndc = getPointerNDCFromEvent(e);
    const hoverAtDown = resolveNoteIntent({
      galaxyId: pick?.galaxyId ?? null,
      nebulaSystem,
      pointerNDC: ndc,
      camera,
      nowMs: performance.now(),
    });
    onPointerMove(musicState, hoverAtDown);
    logIntentChange("hover", musicState.hoverIntent);

    onPointerDown(musicState);
    logIntentChange("active", musicState.activeIntent);

    if (musicState.activeIntent?.galaxyId) {
      activeNebulaKey = musicState.activeIntent.galaxyId;
      cacheActiveDiskFromNebula(activeNebulaKey);
      const instrument = voices?.getNebulaInstrument?.(activeNebulaKey);
      if (instrument) {
        audio.playNebulaScratch({
          galaxyId: activeNebulaKey,
          theta01: musicState.activeIntent.theta01,
          r01: musicState.activeIntent.r01,
          step: musicState.activeIntent.step,
          degree: musicState.activeIntent.degree,
          noteName: musicState.activeIntent.noteName,
          midi: musicState.activeIntent.midi,
          forceTrigger: true,
          instrument,
        });
        triggerBackgroundPulse(1.0);
      }
    } else {
      activeNebulaKey = null;
      activeDiskCenterW = null;
    }
    return;
  }
});



canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  if (!isDragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  // nebulaSystem.root.rotation.y += dx * 0.005;
  // nebulaSystem.root.rotation.x += dy * 0.005;
  // nebulaSystem.root.rotation.x = THREE.MathUtils.clamp(nebulaSystem.root.rotation.x, -1.25, 1.25);

  orbitYaw   += dx * 0.005;
  orbitPitch += dy * 0.005;
  applyOrbitCamera();


});


canvas.addEventListener("pointerup", (e) => {
  isDragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
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

try {
  noteHint = createNebulaNoteHintController({
    scene,
    camera,
    nebulaSystem,
    audioEngine,
    voices,
    getMouseWorldOnPlane,
    pickNebulaAtEvent,
    gui: window.__gui ?? null,
  });
} catch (err) {
  console.warn("noteHint init failed:", err);
  noteHint = null;
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

// -------------------------------------
// Helpers (moved up for hoist safety)
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

// Stars
// -------------------------------------
const stars = makeStars({ count: 65000, radius: 7.0, thickness: 1.6 });
scene.add(stars);

// --- background drive state (avoid undefined vars / keep things stable)
const bgDrive = {
  leadE: 0,
  pitch01: 0,
  vel01: 0,
  theta01: 0,
  pulse: 0,
  notePos: new THREE.Vector2(0.5, 0.5),
  noteHue: 0.0,
  noteSeed: 0.123,
};
const bgLastEmitPos = new THREE.Vector2(0.5, 0.5);
let bgLastEmitHue = 0.66;
let bgLastEmitStep = -1;

// -------------------------------------
// Mouse move intensity (for audio trigger)
// -------------------------------------
let lastPX = 0,
  lastPY = 0;
let move01 = 0;

window.addEventListener("pointermove", (e) => {
  __markPointerMoved(e.clientX, e.clientY);
  const dx = e.clientX - lastPX;
  const dy = e.clientY - lastPY;
  lastPX = e.clientX;
  lastPY = e.clientY;

  const speed = Math.sqrt(dx * dx + dy * dy);
  move01 = Math.min(1, speed / 60);
});

const bgNote = {
  lastMidi: null,
  pulse: 0,
  hue: 0,
  seed: 0.1,
  pos: { x: 0.5, y: 0.5 },
};


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

// 更新背景效果函数
function updateBackgroundEffects(dt) {
  // legacy path disabled; background is driven by audio/interaction envelopes in tick()
}

function tick() {

  // dt 用于输入平滑/音频平滑
  const dt = Math.min(0.05, clock.getDelta());
  cameraControl?.update?.(dt);
  const t = clock.getElapsedTime();

  // 更新背景效果
  updateBackgroundEffects(dt);

// --- dynamic resolution scaling (keeps FPS stable)
__fpsEMA = __fpsEMA * 0.9 + (1 / Math.max(1e-4, dt)) * 0.1;
if ((performance.now() - __lastPixelRatioApplyMs) > 400) {
  __lastPixelRatioApplyMs = performance.now();

  // Simple tiers: drop pixel ratio when FPS is low
  let targetPR = __pixelRatio;
  if (__fpsEMA < 35) targetPR = 0.75;
  else if (__fpsEMA < 48) targetPR = 1.0;
  else targetPR = Math.min(window.devicePixelRatio || 1, 1.25);

  // Avoid constant setPixelRatio calls
  if (Math.abs(targetPR - __pixelRatio) > 0.01) {
    __pixelRatio = targetPR;
    renderer.setPixelRatio(__pixelRatio);
  }
}


  // --- raycast to plane
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(plane, hitPoint);

// --- raycast to nebula (lead only when hovering nebula)
// ⚠️ intersectObject(recursive) is expensive. Throttle it:
// - run when pointer moved OR pointer is down
// - otherwise run at ~20Hz to keep hover stable
const nowMs = performance.now();
const shouldPickNebula =
  __pointerMoved ||
  pointerDown ||
  (nowMs - __lastNebulaPickMs) > 50;

let hoveredNebulaKey = __cachedHoverNebulaKey;
let nebulaHitLocal = __cachedNebulaHit;

if (shouldPickNebula) {
  __lastNebulaPickMs = nowMs;
  __pointerMoved = false;

  nebulaRaycaster.setFromCamera(pointer, camera);

  // 射线打到 nebulaSystem.root 的所有子物体（true 表示递归）
  const hits = nebulaRaycaster.intersectObject(nebulaSystem.root, true);

  // 1) 只接受带 galaxyId 的命中（避免命中巨大“背景/点云容器”导致全屏都 hit）
  const pick = hits.find(h => h?.object?.userData?.galaxyId);

  hoveredNebulaKey = null;
  nebulaHitLocal = null;

  if (pick) {
    // 把命中点投影到 NDC，和鼠标 pointer(NDC) 比距离
    const p = pick.point.clone().project(camera);
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;

    const NDC_THRESH = 0.12;
    const ok = (dx*dx + dy*dy) < (NDC_THRESH * NDC_THRESH);

    if (ok) {
      nebulaHitLocal = pick;
      hoveredNebulaKey = pick.object.userData.galaxyId;
    }
  }

  __cachedHoverNebulaKey = hoveredNebulaKey;
  __cachedNebulaHit = nebulaHitLocal;
}

nebulaHit = nebulaHitLocal;
const hasNebulaHit = !!nebulaHit;

  const hoverIntentNow = resolveNoteIntent({
    galaxyId: hoveredNebulaKey,
    nebulaSystem,
    pointerNDC: pointer,
    camera,
    nowMs,
  });
  onPointerMove(musicState, hoverIntentNow);
  logIntentChange("hover", musicState.hoverIntent);
  hoveredNebulaKey = musicState.hoverIntent?.galaxyId ?? null;

  const activeGalaxyId = musicState.activeIntent?.galaxyId ?? activeNebulaKey;
  if (pointerDown && activeGalaxyId && activeDiskCenterW) {
    const activeIntentNow = resolveNoteIntent({
      galaxyId: activeGalaxyId,
      nebulaSystem,
      pointerNDC: pointer,
      camera,
      nowMs,
    });
    onPointerMovePressed(musicState, activeIntentNow, 0.18);
    logIntentChange("active", musicState.activeIntent);
  }

  activeNebulaKey = musicState.activeIntent?.galaxyId ?? null;
  if (activeNebulaKey && !activeDiskCenterW) cacheActiveDiskFromNebula(activeNebulaKey);




  // --- background
  if (bg) bg.update(dt, camera);

  const mx01 = pointer.x * 0.5 + 0.5;
  const my01 = pointer.y * 0.5 + 0.5;
  bg.setMouse01(mx01, my01);


  

  // --- stars
  stars.material.uniforms.uTime.value = t;
  stars.material.uniforms.uPointer.value.copy(pointer);

  // --- nebula & meteor
  const disturbPoint = (nebulaHit?.point ? nebulaHit.point : hitPoint);

  let disturb = hitPoint;

  if (pointerDown && activeNebulaKey && activeDiskCenterW) {
    const centerN = activeDiskCenterW.clone().project(camera);
    const dx = pointer.x - centerN.x;
    const dy = pointer.y - centerN.y;
    const dist = Math.hypot(dx, dy);

    const inDisk = dist <= activeDiskOuterNDC;
    if (inDisk) {
      // 用 raycast 平面的 hitPoint 也行；这里保留 disturb = hitPoint
      disturb = hitPoint;
    }
  }

  nebulaSystem.update(disturb, t);

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

  const aHud = audio.getState();
  const s = aHud.scratch;
  const hoverIntent = musicState.hoverIntent;
  const activeIntent = musicState.activeIntent;
  const lastIntent = musicState.lastIntent;


  // --- Debug HUD update (must be inside tick)
  const hoverInst = hoverIntent?.galaxyId ? voices.getNebulaInstrumentName(hoverIntent.galaxyId) : "-";
  const activeInst = activeIntent?.galaxyId ? voices.getNebulaInstrumentName(activeIntent.galaxyId) : "-";

  const truthIntent = activeIntent ?? hoverIntent ?? lastIntent;
  drawNoteAlignmentOverlay(truthIntent);
  const noteStr = truthIntent?.noteName ?? "-";
  const midiStr = (typeof truthIntent?.midi === "number") ? truthIntent.midi : "-";
  const stepStr = truthIntent ? `${(truthIntent.step ?? 0) + 1}/7` : "-";
  const octStr  = s ? `${s.octaveOffset}` : "-";

// UI (note hints) can be expensive; update at limited rate.
const uiHz = pointerDown ? 30 : 15;
const uiIntervalMs = 1000 / uiHz;
if ((nowMs - __lastUIUpdateMs) > uiIntervalMs) {
  __lastUIUpdateMs = nowMs;
  const focusIntentForHint = (pointerDown && activeIntent) ? activeIntent : hoverIntent;
  noteHint?.update?.(focusIntentForHint?.galaxyId ?? null, focusIntentForHint);
}

  // Debug HUD is surprisingly expensive if updated every frame.
  if ((nowMs - __lastHudUpdateMs) > 100) {
    __lastHudUpdateMs = nowMs;
    debugHud.textContent =
      `mode:   ${interactionMode}
` +
      `hover:  ${hoverIntent?.galaxyId ?? "-"}
` +
      `active: ${activeIntent?.galaxyId ?? "-"}
` +
      `hit:    ${hasNebulaHit ? "yes" : "no"}
` +
      `down:   ${pointerDown ? "yes" : "no"}
` +
      `
` +
      `note:   ${noteStr}  (midi ${midiStr})
` +
      `step:   ${stepStr}  degree:${truthIntent?.degree ?? "-"}
` +
      `oct:    ${octStr}
` +
      `theta:  ${(truthIntent?.theta01 ?? 0).toFixed(3)}
` +
      `r:      ${(truthIntent?.r01 ?? 0).toFixed(3)}
` +
      `vel:    ${(s?.velocity ?? 0).toFixed(2)} dur:${(s?.dur ?? 0).toFixed(3)}`;
  }

  const trig = ps.trigger;
  if (trig) ps.trigger = false;


  // 4) 音频：先喂，再更新（Lead Gate: only when hovering nebula）
  const psForAudio = { ...ps, trigger: trig };

  // ✅ Lead Gate：不要依赖 raycast hit（外圈很容易 miss）；只要在 active 星云的演奏盘 inDisk 内就允许发声
  let inDisk = false;
  let isActiveNebulaHovered = false;

  // 每帧更新一次盘面 NDC 半径（跟随相机缩放）
  updateActiveDiskNdcRadii();

  if (pointerDown && activeNebulaKey && activeDiskCenterW && musicState.activeIntent) {
    const activeProbeIntent = resolveNoteIntent({
      galaxyId: activeNebulaKey,
      nebulaSystem,
      pointerNDC: pointer,
      camera,
      nowMs,
    });

    inDisk = !!activeProbeIntent;
    isActiveNebulaHovered = pointerDown && !!activeNebulaKey && !!activeDiskCenterW && inDisk;

    if (inDisk) {
      const theta01 = musicState.activeIntent.theta01;
      const r01 = musicState.activeIntent.r01;

      // --- feed background from lead gesture (safe, no undefined)
// --- feed background from lead gesture (stable mapping)
// Use pointer speed + scratch radius as a proxy for "energy"
const localVel01 = THREE.MathUtils.clamp(Math.max(move01, r01 * 0.25), 0, 1);
const localPitch01 = THREE.MathUtils.clamp(theta01, 0, 1); // stable, varies around the disk
const radialCenter01 = THREE.MathUtils.clamp(1 - r01, 0, 1);
const radialExpress = THREE.MathUtils.lerp(0.15, 1.0, radialCenter01);

bgDrive.leadE = Math.max(bgDrive.leadE, Math.max(localVel01, radialExpress * 0.85));
bgDrive.pitch01 = localPitch01;
bgDrive.vel01 = Math.max(localVel01, radialExpress * 0.75);
bgDrive.theta01 = theta01;


    // ✅ 给背景一个“随音符变化的色相驱动”（避免一直停留在同一主色）
    // 这里用 theta + pitch 的混合做一个稳定又有变化的 hue（0..1）
    bgDrive.noteHue = (theta01 + bgDrive.pitch01 * 0.65) % 1.0;
// trigger a short "ink injection" pulse
bgDrive.pulse = 1.0;
bgDrive.noteSeed = (Math.random() * 0.999) + 0.001;
bgDrive.notePos.set(mouse01.x, mouse01.y);



      const instrument = voices?.getNebulaInstrument?.(activeNebulaKey);
      noteHint?.setInteractionSample?.(activeNebulaKey, musicState.activeIntent.theta01, musicState.activeIntent.r01);
      // 给镜头一个演奏脉冲

      // const distance = camera.position.distanceTo(cameraControl.getTarget?.() ?? new THREE.Vector3(0,0,0));
      // const strength = distance * 0.002;     // ✅ 距离越远脉冲越大

      cameraControl?.notePulse?.(1.2, hitPoint);

      if (camera.isPerspectiveCamera) {
        camera.fov = 45.0;          // 你原本的 fov 假设是 46/47 之类
        camera.updateProjectionMatrix();
      }

      audio.playNebulaScratch({
        galaxyId: activeNebulaKey,
        theta01: musicState.activeIntent.theta01,
        r01: musicState.activeIntent.r01,
        step: musicState.activeIntent.step,
        degree: musicState.activeIntent.degree,
        noteName: musicState.activeIntent.noteName,
        midi: musicState.activeIntent.midi,
        instrument,
      });
    }

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
  // const a = audio.getState();

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

  
  // 7) Bloom：只跟随 lead 能量（慢），并且整体更低
  // 这样“弹奏有光”但不会糊掉星云
  const glowUiBloom = THREE.MathUtils.clamp(noteColorUI?.getGlow?.() ?? 0.56, 0, 1);
  bloomPass.strength += ((0.03 + bgMood.energy * 0.06) * (0.55 + glowUiBloom * 0.75) - bloomPass.strength) * (1 - Math.exp(-dt * 1.4));
  bloomPass.threshold = 0.88;   // 更柔和：避免只有极亮点被硬阈值抽出来
  bloomPass.radius = 0.25;      // 让中心星光更柔，不容易出现硬形状

  // -------------------- Dreamy background (CLEAN) --------------------
  // Clean dt/t timing. No legacy time state object.
  {
    const sScratch = audio.getState()?.scratch;
    const pearlUi = THREE.MathUtils.clamp(noteColorUI?.getPearl?.() ?? 0.62, 0, 1);
    const glowUi = THREE.MathUtils.clamp(noteColorUI?.getGlow?.() ?? 0.56, 0, 1);
    const richnessUi = THREE.MathUtils.clamp(noteColorUI?.getRichness?.() ?? 0.58, 0, 1);
    const dreamUi = THREE.MathUtils.clamp(noteColorUI?.getDream?.() ?? 0.52, 0, 1);

    const scratchVel01 = THREE.MathUtils.clamp((sScratch?.velocity ?? 0) / 1.2, 0, 1);
    const isPlaying = !!(pointerDown && isActiveNebulaHovered);
    const interactionNow = !!(pointerDown && (isActiveNebulaHovered || musicState.activeIntent));

    // Click pulse envelope: immediate rise (0.03~0.08s), slower fade (0.5~0.8s)
    bgClickPulse = Math.max(0.0, bgClickPulse - dt / 0.85);
    bgClickPulseVis = __bgRiseFall(bgClickPulseVis, bgClickPulse, dt, 18.0, 1.5);

    // Immediate interaction drive for hold/slide, with no hover-delay dependency.
    const baseHold = interactionNow ? 0.12 : 0.0;
    const targetLead = THREE.MathUtils.clamp(baseHold + scratchVel01 * 0.62 + bgClickPulseVis * 0.42, 0, 1);
    // slower fall to calm (~1-2s)
    bgLeadE = __bgRiseFall(bgLeadE, targetLead, dt, 14.0, 1.1);
    const interactionTarget = THREE.MathUtils.clamp(
      (interactionNow ? 0.9 : 0.0) + scratchVel01 * 0.35 + bgClickPulseVis * 0.25,
      0,
      1
    );
    // ~1-2s decay when no interaction
    bgInteractionE = __bgRiseFall(bgInteractionE, interactionTarget, dt, 16.0, 0.9);
    bgLastEmitE = __bgRiseFall(bgLastEmitE, 0.0, dt, 10.0, 0.75);

    // Smooth pitch/vel/theta (prefer scratch state; fallback to bgDrive)
    const targetPitch = (typeof sScratch?.pitch01 === "number") ? sScratch.pitch01 : bgDrive.pitch01;
    const targetVel   = interactionNow ? Math.max(0.12, scratchVel01) : 0.0;
    const targetTheta = (typeof sScratch?.theta01 === "number") ? sScratch.theta01 : bgDrive.theta01;

    bgPitch01 = __bgRiseFall(bgPitch01, THREE.MathUtils.clamp(targetPitch, 0, 1), dt, 14.0, 7.0);
    bgVel01   = __bgRiseFall(bgVel01,   THREE.MathUtils.clamp(targetVel,   0, 1), dt, 16.0, 6.0);
    bgTheta01 = __bgRiseFall(bgTheta01, THREE.MathUtils.clamp(targetTheta, 0, 1), dt, 14.0, 8.0);

    // Directly drive visible flow/brightness response (keeps click + hold responsive).
    const flowTarget = THREE.MathUtils.clamp((0.020 + bgLeadE * 0.90 + bgClickPulseVis * 0.62) * (0.80 + 0.35 * glowUi) * (0.92 + 0.22 * richnessUi), 0, 1.12);
    const sparkleTarget = THREE.MathUtils.clamp((0.005 + bgLeadE * 0.16 + bgClickPulseVis * 0.15) * (0.62 + 0.52 * glowUi), 0, 0.28);
    const satTarget = THREE.MathUtils.clamp(0.26 + bgLeadE * 0.46 + bgClickPulseVis * 0.24 + dreamUi * 0.10, 0.22, 0.96);
    // auto-dim to keep nebula readable
    const readabilityLimiter = interactionNow ? 0.84 : 0.92;
    const intensityTarget = THREE.MathUtils.clamp((0.010 + bgLeadE * 0.42 + bgClickPulseVis * 0.22) * readabilityLimiter * (0.64 + 0.56 * glowUi), 0.01, 0.56);
    bg.uniforms.uFlow.value = __bgRiseFall(bg.uniforms.uFlow.value, flowTarget, dt, 12.0, 1.5);
    bg.uniforms.uSparkle.value = __bgRiseFall(bg.uniforms.uSparkle.value, sparkleTarget * (0.86 + 0.28 * richnessUi), dt, 12.0, 1.6);
    bg.uniforms.uSat.value = __bgRiseFall(bg.uniforms.uSat.value, satTarget, dt, 10.0, 2.2);
    bg.uniforms.uPearl.value = __bgRiseFall(bg.uniforms.uPearl.value, 0.28 + pearlUi * 1.02, dt, 8.0, 4.0);
    bg.uniforms.uIntensity.value = __bgRiseFall(bg.uniforms.uIntensity.value, intensityTarget, dt, 11.0, 1.4);

    // Pulse: when step changes while playing
    const stepNow = (typeof sScratch?.step === "number") ? sScratch.step : -1;
    if (isPlaying && stepNow >= 0 && stepNow !== bgLastStep) {
      bgLastStep = stepNow;
      triggerBackgroundPulse(0.85);
      bgNoteSeed = t;
      bgNoteHue = (stepNow % STEPS) / STEPS;
      bgDrive.noteSeed = bgNoteSeed;
      bgLastEmitPos.copy(bgDrive.notePos);
      bgLastEmitHue = bgDrive.noteHue;
      bgLastEmitStep = stepNow;
      bgLastEmitE = 1.0;
    }
    bgPulse = Math.max(0.0, bgPulse - dt / 0.70);

    // Feed shader uniforms (new dreamyBackground API)
    if (bg && bg.setAudio) {
      const activeIntentNow = musicState.activeIntent;
      const hoverIntentNow = musicState.hoverIntent;
      const focusIntent = activeIntentNow ?? hoverIntentNow ?? musicState.lastIntent ?? null;
      const activeHue = activeIntentNow?.theta01 ?? bgDrive.noteHue;
      const hoverHue = hoverIntentNow?.theta01 ?? activeHue;
      const colorMix = noteColorUI?.getMix?.() ?? 0.0;
      const strictNoteColor = noteColorUI?.isStrict?.() ? 1.0 : 0.0;
      const activeStep = (typeof activeIntentNow?.step === "number") ? activeIntentNow.step : -1;
      const hoverStep = (typeof hoverIntentNow?.step === "number") ? hoverIntentNow.step : -1;
      const lastStep = (typeof bgLastEmitStep === "number") ? bgLastEmitStep : -1;
      const [ahR, ahG, ahB] = hsvToRgb(activeHue, 0.66, 1.0);
      const [hhR, hhG, hhB] = hsvToRgb(hoverHue, 0.56, 0.95);
      const [lhR, lhG, lhB] = hsvToRgb(bgLastEmitHue, 0.52, 0.9);
      const activeCustom = noteColorUI?.getColorRgb01?.(activeStep);
      const hoverCustom = noteColorUI?.getColorRgb01?.(hoverStep);
      const lastCustom = noteColorUI?.getColorRgb01?.(lastStep);
      const mixColor = (base, custom) => {
        if (!custom) return base;
        return [
          THREE.MathUtils.lerp(base[0], custom[0], colorMix),
          THREE.MathUtils.lerp(base[1], custom[1], colorMix),
          THREE.MathUtils.lerp(base[2], custom[2], colorMix),
        ];
      };
      const [ar, ag, ab] = mixColor([ahR, ahG, ahB], activeCustom);
      const [hr, hg, hb] = mixColor([hhR, hhG, hhB], hoverCustom);
      const [lr, lg, lb] = mixColor([lhR, lhG, lhB], lastCustom);
      const focusStep = (typeof focusIntent?.step === "number") ? focusIntent.step : -1;
      const focusCustom = noteColorUI?.getColorRgb01?.(focusStep);
      const noteColor = focusCustom
        ? { r: focusCustom[0], g: focusCustom[1], b: focusCustom[2] }
        : { r: ar, g: ag, b: ab };
      const stableNoteHue = (focusStep >= 0) ? ((focusStep % 7) / 7) : bgNoteHue;
      const glowGain = 0.56 + 0.58 * glowUi;
      const activeStrength = THREE.MathUtils.clamp((bgInteractionE * 0.95 + bgClickPulseVis * 0.25) * glowGain, 0, 1);
      const hoverStrength = THREE.MathUtils.clamp((hoverIntentNow ? 0.14 : 0.0) * (0.45 + 0.55 * bgInteractionE) * glowGain, 0, 0.22);
      const lastStrength = THREE.MathUtils.clamp(bgLastEmitE * 0.55 * glowGain, 0, 0.55);
      const wrap01 = (v) => ((v % 1) + 1) % 1;
      const sat1 = {
        x: wrap01(bgDrive.notePos.x + 0.14 * Math.cos((bgTheta01 + 0.08) * Math.PI * 2)),
        y: wrap01(bgDrive.notePos.y + 0.12 * Math.sin((bgTheta01 + 0.08) * Math.PI * 2)),
      };
      const sat2 = {
        x: wrap01(bgDrive.notePos.x - 0.18 * Math.cos((bgTheta01 + 0.33) * Math.PI * 2)),
        y: wrap01(bgDrive.notePos.y - 0.10 * Math.sin((bgTheta01 + 0.33) * Math.PI * 2)),
      };
      const [s1r, s1g, s1b] = mixColor([hr, hg, hb], activeCustom ?? hoverCustom);
      const [s2r, s2g, s2b] = mixColor([lr, lg, lb], activeCustom ?? lastCustom);
      const satelliteStrength = THREE.MathUtils.clamp(activeStrength * 0.36 + hoverStrength * 0.35 + lastStrength * 0.28, 0, 0.42);
      bg.setAudio({
        leadE: bgLeadE,
        interactionE: bgInteractionE,
        pitch01: bgPitch01,
        vel01: bgVel01,
        theta01: bgTheta01,
        pulse: bgPulse,
        noteSeed: bgDrive.noteSeed,
        notePos: bgDrive.notePos,
        interactionPos: bgDrive.notePos,
        noteHue: stableNoteHue,
        noteColor,
        noteColorMix: THREE.MathUtils.clamp(strictNoteColor > 0.5 ? Math.max(colorMix, 0.52) : (colorMix * 0.90 + 0.06), 0, 1),
        noteColorStrict: strictNoteColor,
        richness: richnessUi,
        dream: dreamUi,
        emitters: [
          { x: bgDrive.notePos.x, y: bgDrive.notePos.y, r: ar, g: ag, b: ab, s: activeStrength },
          { x: sat1.x, y: sat1.y, r: s1r, g: s1g, b: s1b, s: satelliteStrength },
          { x: sat2.x, y: sat2.y, r: s2r, g: s2g, b: s2b, s: satelliteStrength * 0.92 + lastStrength * 0.28 },
        ],
      });

    // ✅ 背景音频驱动的衰减：防止一直“锁死”在某个颜色/亮度
    // dt: 这一帧的秒数（如果你这里没有 dt，就用 1/60 近似）
    const _dtBg = (typeof dt === "number" && isFinite(dt)) ? dt : (1 / 60);
    bgDrive.pulse = Math.max(0, bgDrive.pulse - _dtBg * 2.8);
    bgDrive.leadE = Math.max(0, bgDrive.leadE - _dtBg * 1.6);
    }
  }
// -------------------- /Dreamy background (CLEAN) --------------------


  // --- render
  composer.render();

  // --- 左侧音频监控 UI
  // audioUI.update(a, perf.state);


  requestAnimationFrame(tick);
}

tick();

// -------------------------------------
// Resize
// -------------------------------------
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  resizeNoteOverlay();
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
});

// -------------------------------------
// Helpers
// -------------------------------------
})().catch((e)=>console.error(e));
