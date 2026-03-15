import * as THREE from "three";
import * as Tone from "tone";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import { setupGalaxyGUI } from "./ui/galaxyGui.js";
import { setupMeteorGUI } from "./ui/meteorGui.js";
import { createNebulaNoteHintController } from "./ui/nebulaNoteHintController.js";

// import { initAudioOnFirstGesture, triggerOnMove } from "./audio.js";
import { playMeteorSfx } from "./audio/meteorSfx.js";

import { createNebulaSystem } from "./nebula/nebulaSystem.js";
import { createMeteorSystem } from "./meteor/meteorSystem.js";
import { createDolphinSystem } from "./dolphin/dolphinSystem.js";
import { createNotePopSystem } from "./notePop/notePopSystem.js";

import { createDreamyBackground } from "./background/dreamyBackground";

import { createPerformanceState } from "./performance/performanceState";
import { createAutoPlayConductor } from "./performance/autoPlayConductor.js";
import { createMouseKeyboardController } from "./input/mouseKeyboardController";
import { createGalaxyAudioEngine } from "./audio/galaxyAudioEngine";

import { createGalaxyVoices } from "./audio/galaxyVoices.js";

import { createAudioMonitorUI } from "./ui/audioMonitor.js";
import { createNoteColorPanel } from "./ui/noteColorPanel.js";
import { createBackgroundDockPanel } from "./ui/backgroundDockPanel.js";
import { createDockPanel } from "./ui/dockPanel.js";
import { setupDolphinGUI } from "./ui/dolphinGui.js";
import { setupNotePopGUI } from "./ui/notePopGui.js";

import { createCameraControlSystem } from "./input/cameraControlSystem.js";
import { createPerformanceCameraController } from "./camera/performanceCameraController.js";
import { musicState } from "./state/musicState.js";
import { resolveNoteIntent } from "./interaction/resolveNoteIntent.js";
import { onPointerMove, onPointerDown, onPointerMovePressed, onPointerUp } from "./interaction/intentStateMachine.js";
import { NOTE_STEPS, stepToBoundaryTheta01, stepToCenterTheta01 } from "./music/noteMapping.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import meteorVert from "./shaders/meteor.vert.glsl?raw";
import meteorFrag from "./shaders/meteor.frag.glsl?raw";
import { DreamGlowShader } from "./postprocessing/dreamGlowShader.js";

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

function __wrap01(v) {
  return ((v % 1) + 1) % 1;
}
function __lerpHue01(a, b, t) {
  const aa = __wrap01(a);
  const bb = __wrap01(b);
  let d = bb - aa;
  if (d > 0.5) d -= 1.0;
  if (d < -0.5) d += 1.0;
  return __wrap01(aa + d * THREE.MathUtils.clamp(t, 0, 1));
}

function __bgRiseFallWrap(current, target, dt, rise = 16.0, fall = 4.0) {
  const c = __wrap01(current);
  const t = __wrap01(target);
  let d = t - c;
  if (d > 0.5) d -= 1.0;
  if (d < -0.5) d += 1.0;
  const linearTarget = c + d;
  const k = linearTarget > c ? rise : fall;
  return __wrap01(THREE.MathUtils.damp(c, linearTarget, k, dt));
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
const performanceCamera = createPerformanceCameraController();

const bg = await createDreamyBackground(scene, camera, {
  palette: "pearl",
  baseColor: "#2B2F54",
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

const cameraFocus = {
  active: false,
  elapsed: 0,
  duration: 0.36,
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  endTarget: new THREE.Vector3(),
};
let focusedPerformanceNebulaId = null;
let focusOrbitNebulaId = null;
const focusOrbitState = {
  weight: 0,
  phase: 0,
  activeId: null,
};
const focusOrbitCenter = new THREE.Vector3();
const focusOrbitOffset = new THREE.Vector3();
const focusOrbitRotated = new THREE.Vector3();
const focusOrbitAxis = new THREE.Vector3(0, 1, 0);
const focusOrbitQuat = new THREE.Quaternion();

function syncLegacyOrbitFromCamera(targetWorld) {
  orbitTarget.copy(targetWorld);
  const off = camera.position.clone().sub(orbitTarget);
  orbitRadius = Math.max(1e-4, off.length());
  orbitYaw = Math.atan2(off.x, off.z);
  orbitPitch = Math.asin(THREE.MathUtils.clamp(off.y / orbitRadius, -1, 1));
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
const dreamGlowPass = new ShaderPass(DreamGlowShader);
composer.addPass(dreamGlowPass);

bloomPass.strength = 1;
bloomPass.radius = 1;
bloomPass.threshold = 0.7;
dreamGlowPass.enabled = false;
dreamGlowPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

const dreamyGlowController = (() => {
  const state = {
    enabled: false,
    intensity: 0.88,
    softness: 0.94,
    starGlowBoost: 0.92,
    backgroundLift: 0.82,
    filterAmount: 0.72,
    filterTintMix: 0.24,
    filterHaze: 0.30,
  };
  return {
    getConfig() {
      return { ...state };
    },
    updateConfig(partial = {}) {
      if (typeof partial.enabled === "boolean") state.enabled = partial.enabled;
      if (Number.isFinite(partial.intensity)) state.intensity = THREE.MathUtils.clamp(partial.intensity, 0, 1.5);
      if (Number.isFinite(partial.softness)) state.softness = THREE.MathUtils.clamp(partial.softness, 0, 1.5);
      if (Number.isFinite(partial.starGlowBoost)) state.starGlowBoost = THREE.MathUtils.clamp(partial.starGlowBoost, 0, 1.5);
      if (Number.isFinite(partial.backgroundLift)) state.backgroundLift = THREE.MathUtils.clamp(partial.backgroundLift, 0, 1.5);
      if (Number.isFinite(partial.filterAmount)) state.filterAmount = THREE.MathUtils.clamp(partial.filterAmount, 0, 1.5);
      if (Number.isFinite(partial.filterTintMix)) state.filterTintMix = THREE.MathUtils.clamp(partial.filterTintMix, 0, 1.0);
      if (Number.isFinite(partial.filterHaze)) state.filterHaze = THREE.MathUtils.clamp(partial.filterHaze, 0, 1.0);
    },
  };
})();

const backgroundReactivityController = (() => {
  const state = {
    enableNoteColorInjection: true,
    enableLocalEmitters: true,
  };
  return {
    getConfig() {
      return { ...state };
    },
    updateConfig(partial = {}) {
      if (typeof partial.enableNoteColorInjection === "boolean") {
        state.enableNoteColorInjection = partial.enableNoteColorInjection;
      }
      if (typeof partial.enableLocalEmitters === "boolean") {
        state.enableLocalEmitters = partial.enableLocalEmitters;
      }
    },
  };
})();

const pureColorController = (() => {
  const state = {
    enabled: false,
    lift: 0.68,
    saturation: 0.72,
    contrastSoftness: 0.58,
  };
  return {
    getConfig() {
      return { ...state };
    },
    updateConfig(partial = {}) {
      if (typeof partial.enabled === "boolean") state.enabled = partial.enabled;
      if (Number.isFinite(partial.lift)) state.lift = THREE.MathUtils.clamp(partial.lift, 0, 1.5);
      if (Number.isFinite(partial.saturation)) state.saturation = THREE.MathUtils.clamp(partial.saturation, 0, 1.5);
      if (Number.isFinite(partial.contrastSoftness)) state.contrastSoftness = THREE.MathUtils.clamp(partial.contrastSoftness, 0, 1.5);
    },
  };
})();

const pearlWhiteController = (() => {
  const state = {
    enabled: true,
    strength: 1.05,
    color: new THREE.Color("#F2EFFF"),
  };
  return {
    getConfig() {
      return {
        enabled: state.enabled,
        strength: state.strength,
        color: `#${state.color.getHexString()}`,
      };
    },
    updateConfig(partial = {}) {
      if (typeof partial.enabled === "boolean") state.enabled = partial.enabled;
      if (Number.isFinite(partial.strength)) state.strength = THREE.MathUtils.clamp(partial.strength, 0, 1.5);
      if (typeof partial.color === "string") state.color.set(partial.color);
    },
    getColor() {
      return state.color;
    },
  };
})();

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
    focusOrbitNebulaId = null;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    activeNebulaKey = null;
    musicState.activeIntent = null;
    focusOrbitNebulaId = null;
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

const cinematicState = {
  phase: 0,          // 0..1 in full cycle
  energy: 0,         // 0..1 envelope used as global scene macro
  pulseBoost: 1.0,   // note pulse multiplier
  enabled: false,
  wasEnabled: false,
  prevMeteor: null,
};

const autoReplayVisual = {
  energy: 0.0,
  pending: null,
  lastEventMs: 0,
};
let lastDolphinEmitMs = 0;
let lastNotePopEmitMs = 0;
const autoDisturbPoint = new THREE.Vector3(0, 0, 0);
let autoDisturbE = 0.0;

function emitGapMsFromVelocity(v01, slowMs = 150, fastMs = 55) {
  const v = THREE.MathUtils.clamp(v01 ?? 0, 0, 1);
  return THREE.MathUtils.lerp(slowMs, fastMs, v);
}
function midiToPitch01(midi) {
  if (!Number.isFinite(Number(midi))) return 0.5;
  return THREE.MathUtils.clamp((Number(midi) - 36) / 60, 0, 1);
}

function smoothPulse01(x) {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return Math.sin(t * Math.PI);
}



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

function onAutoPlayNoteEvent(ev) {
  const now = performance.now();
  const minGapMs = 42; // throttle replay visuals to avoid overload on dense patterns
  if ((now - autoReplayVisual.lastEventMs) < minGapMs) return;
  autoReplayVisual.lastEventMs = now;
  autoReplayVisual.pending = ev;
  autoReplayVisual.energy = Math.max(autoReplayVisual.energy, 1.0);

  const vAuto = THREE.MathUtils.clamp(ev?.velocity ?? 0.66, 0, 1);
  const dolphinGapMs = emitGapMsFromVelocity(vAuto, 150, 70);
  if ((now - lastDolphinEmitMs) >= dolphinGapMs) {
    lastDolphinEmitMs = now;
    dolphinSystem?.triggerFromNote?.({
      galaxyId: ev?.galaxyId ?? null,
      theta01: ev?.theta01 ?? Math.random(),
      velocity: vAuto,
      strength: 0.9,
      now: now * 0.001,
    });
  }

  const notePopGapMs = emitGapMsFromVelocity(vAuto, 130, 48);
  if ((now - lastNotePopEmitMs) >= notePopGapMs) {
    lastNotePopEmitMs = now;
    notePopSystem?.triggerFromNote?.({
      galaxyId: ev?.galaxyId ?? null,
      theta01: ev?.theta01 ?? Math.random(),
      velocity: vAuto,
      notePitch01: midiToPitch01(ev?.midi),
      noteHue: ev?.theta01 ?? null,
      strength: THREE.MathUtils.lerp(0.82, 1.0, vAuto),
      now: now * 0.001,
    });
  }

  const cluster = nebulaSystem?.getCluster?.(ev?.galaxyId);
  if (cluster?.group) {
    const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
    const groupScale = cluster?.group?.scale?.x ?? 1.0;
    const rWorld = Math.max(0.2, 1.9 * sizeScale * groupScale * (0.34 + (ev?.r01 ?? 0.5) * 0.66));
    const a = ((ev?.theta01 ?? Math.random()) % 1 + 1) % 1 * Math.PI * 2;
    const pLocal = new THREE.Vector3(Math.cos(a) * rWorld, 0, Math.sin(a) * rWorld);
    const pWorld = cluster.group.localToWorld(pLocal);
    autoDisturbPoint.copy(pWorld);
    autoDisturbE = Math.max(autoDisturbE, 1.0);
  }
}

const autoPlayConductor = createAutoPlayConductor({
  nebulaSystem,
  voices,
  audio,
  triggerBackgroundPulse,
  onEvent: onAutoPlayNoteEvent,
});

function triggerPerformanceCameraNotePulse({ galaxyId = null, strength = 0.35, centerWorld = null } = {}) {
  performanceCamera?.queueNotePulse?.({
    galaxyId,
    strength: THREE.MathUtils.clamp(strength, 0, 1),
    centerWorld,
  });
}

function focusCameraToGalaxy(galaxyId) {
  if (!galaxyId) return;
  const c = nebulaSystem.getCluster?.(galaxyId);
  if (!c?.group) return;
  focusedPerformanceNebulaId = galaxyId;

  const center = c.group.localToWorld(new THREE.Vector3(0, 0, 0));
  const sizeScale = c?.preset?.shape?.sizeScale ?? 1.0;
  const lengthScale = c?.preset?.shape?.length ?? 1.0;
  const groupScale = c?.group?.scale?.x ?? 1.0;
  const nebulaRadius = Math.max(0.8, 1.9 * sizeScale * lengthScale * groupScale);
  const cameraDistanceLimits = cameraControl?.getDistanceLimits?.() ?? { maxDistance: 13.5 };
  const desiredDist = THREE.MathUtils.clamp(nebulaRadius * 3.1, 3.8, cameraDistanceLimits.maxDistance);

  const currentTarget = cameraControl?.getTarget?.() ?? orbitTarget.clone();
  const viewDir = camera.position.clone().sub(currentTarget);
  if (viewDir.lengthSq() < 1e-6) viewDir.set(0, 0.55, 1.0);
  viewDir.normalize();

  const endPos = center.clone()
    .addScaledVector(viewDir, desiredDist)
    .add(new THREE.Vector3(0, nebulaRadius * 0.15, 0));

  cameraFocus.startPos.copy(camera.position);
  cameraFocus.endPos.copy(endPos);
  cameraFocus.startTarget.copy(currentTarget);
  cameraFocus.endTarget.copy(center);
  cameraFocus.elapsed = 0;
  cameraFocus.duration = 0.36;
  cameraFocus.active = true;
}

function applyFocusOrbitMode(dt) {
  const cfg = performanceCamera?.getRuntimeConfig?.();
  const orbitEnabled = !!(cfg?.enablePerformanceOrbit && focusOrbitNebulaId && !cameraFocus.active);
  focusOrbitState.weight = THREE.MathUtils.damp(
    focusOrbitState.weight,
    orbitEnabled ? 1.0 : 0.0,
    orbitEnabled ? 1.6 : 2.4,
    dt
  );

  if (!orbitEnabled || focusOrbitState.weight <= 1e-4) {
    if (!orbitEnabled) focusOrbitState.activeId = null;
    return;
  }

  const cluster = nebulaSystem.getCluster?.(focusOrbitNebulaId);
  if (!cluster?.group) return;

  cluster.group.localToWorld(focusOrbitCenter.set(0, 0, 0));

  if (focusOrbitState.activeId !== focusOrbitNebulaId) {
    focusOrbitState.activeId = focusOrbitNebulaId;
  }

  const orbitSpeed = THREE.MathUtils.clamp(cfg?.performanceOrbitSpeed ?? (1 / 30), 0.005, 0.15);
  const orbitStrength = THREE.MathUtils.clamp(cfg?.performanceOrbitStrength ?? 0.95, 0, 2);
  const orbitVerticalBias = THREE.MathUtils.clamp(cfg?.performanceOrbitVerticalBias ?? 0.20, 0, 0.6);
  const deltaAngle = dt * Math.PI * 2 * orbitSpeed * focusOrbitState.weight;
  focusOrbitState.phase += deltaAngle;

  focusOrbitOffset.copy(camera.position).sub(focusOrbitCenter);
  if (focusOrbitOffset.lengthSq() < 1e-6) return;

  focusOrbitQuat.setFromAxisAngle(focusOrbitAxis, deltaAngle);
  focusOrbitRotated.copy(focusOrbitOffset).applyQuaternion(focusOrbitQuat);
  const verticalAmp = focusOrbitOffset.length() * 0.035 * orbitVerticalBias * Math.min(1.2, 0.65 + orbitStrength * 0.35);
  focusOrbitRotated.y += Math.sin(focusOrbitState.phase * 0.65) * verticalAmp * focusOrbitState.weight;

  camera.position.copy(focusOrbitCenter).add(focusOrbitRotated);
  cameraControl?.setTarget?.(focusOrbitCenter);
  cameraControl?.syncOrbitFromCamera?.();
}

const galaxyGuiRef = setupGalaxyGUI({
  camera,
  renderer,
  nebulaSystem,
  voices,
  performanceCamera,
  cameraControl,
  dreamyGlowController,
  backgroundReactivityController,
  pureColorController,
  pearlWhiteController,
});
window.__gui = galaxyGuiRef?.gui ?? null;
const backgroundDockUI = createBackgroundDockPanel({ bg });

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

const dolphinSystem = createDolphinSystem({
  scene,
  nebulaSystem,
  planeY: nebulaSystem.planeY,
});
window.__dolphin = dolphinSystem;
const notePopSystem = createNotePopSystem({
  scene,
  nebulaSystem,
  planeY: nebulaSystem.planeY,
});
window.__notePop = notePopSystem;

// 新系统没有 mesh（旧系统才有 instanced quad mesh）
console.log("meteor system", meteorSystem);
console.log("vert len", meteorVert.length, "frag len", meteorFrag.length);


const meteorGui = setupMeteorGUI(meteorSystem);
const dolphinGui = setupDolphinGUI(dolphinSystem);
const notePopGui = setupNotePopGUI(notePopSystem);

const UI_STATE_KEY = "GalaxySynth_UIState_v6";
function readUiState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) {
      return {
        visible: true,
        showcase: false,
        showPlay: true,
        showLook: false,
        showAudio: false,
        showDebug: false,
        showTransport: true,
        cinematic: false,
        harmonyLayer: true,
        autoPlay: false,
        autoPlayStyle: "dream",
        autoPlayTempo: 86,
      };
    }
    const s = JSON.parse(raw);
    return {
      visible: s.visible !== false,
      showcase: !!s.showcase,
      showPlay: s.showPlay !== false,
      showLook: s.showLook !== false,
      showAudio: !!s.showAudio,
      showDebug: !!s.showDebug,
      showTransport: s.showTransport !== false,
      cinematic: !!s.cinematic,
      harmonyLayer: s.harmonyLayer !== false,
      autoPlay: !!s.autoPlay,
      autoPlayStyle: (typeof s.autoPlayStyle === "string" ? s.autoPlayStyle : "dream"),
      autoPlayTempo: Number.isFinite(Number(s.autoPlayTempo)) ? Math.max(60, Math.min(140, Number(s.autoPlayTempo))) : 86,
    };
  } catch {
    return {
      visible: true,
      showcase: false,
      showPlay: true,
      showLook: false,
      showAudio: false,
      showDebug: false,
      showTransport: true,
      cinematic: false,
      harmonyLayer: true,
      autoPlay: false,
      autoPlayStyle: "dream",
      autoPlayTempo: 86,
    };
  }
}
function writeUiState(s) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(s));
  } catch {}
}

const uiState = readUiState();

const uiStyle = document.createElement("style");
uiStyle.textContent = `
.ui-shell{
  position:fixed; right:12px; top:12px; z-index:10001;
  width:272px; padding:10px 12px; border-radius:14px;
  color:#eef2ff; background:linear-gradient(160deg, rgba(10,14,28,.82), rgba(20,12,34,.72));
  border:1px solid rgba(165,196,255,.22); backdrop-filter:blur(10px);
  font:12px/1.35 "IBM Plex Sans","Segoe UI",ui-sans-serif,sans-serif;
  box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.03);
}
.ui-shell .row{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; }
.ui-shell .title{ font-weight:700; letter-spacing:.4px; margin-bottom:8px; }
.ui-shell .group-title{ margin-top:8px; font-size:11px; letter-spacing:.7px; text-transform:uppercase; opacity:.72; }
.ui-shell .btn{
  border:0; border-radius:8px; padding:5px 8px; cursor:pointer;
  color:#eaf0ff; background:rgba(70,95,170,.36);
}
.ui-shell .btn.secondary{ background:rgba(72,56,112,.38); }
.ui-shell .chk{ display:flex; align-items:center; gap:6px; opacity:.95; }
.ui-shell .hint{ opacity:.72; font-size:11px; margin-top:6px; }
.ui-shell input[type="checkbox"]{ transform:translateY(1px); }

/* Unified panel look */
.custom-ui.note-color-panel,
.custom-ui.audio-monitor,
.custom-ui.debug-hud,
.custom-ui.ui-shell{
  border:1px solid rgba(165,196,255,.20) !important;
  border-radius:12px !important;
  background:linear-gradient(160deg, rgba(10,14,28,.78), rgba(22,14,38,.68)) !important;
  color:#eef2ff !important;
  box-shadow:0 10px 30px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.03);
}
.custom-ui.note-color-panel,
.custom-ui.audio-monitor{
  font-family:"IBM Plex Sans","Segoe UI",ui-sans-serif,sans-serif !important;
}
.lil-gui{
  --background-color: rgba(12,16,30,.72) !important;
  --title-background-color: rgba(34,26,56,.58) !important;
  --widget-color: #8fb2ff !important;
  --hover-color: #b3c8ff !important;
  --text-color: #eaf0ff !important;
  --folder-widget-color: #7e94e0 !important;
  --number-color: #a7f2ff !important;
  --string-color: #ffd3ef !important;
  backdrop-filter: blur(8px);
  border:1px solid rgba(165,196,255,.18);
  border-radius:10px;
}
.lil-gui .title{ letter-spacing:.2px; }
`;
document.head.appendChild(uiStyle);

const uiShell = document.createElement("div");
uiShell.className = "custom-ui ui-shell";
uiShell.addEventListener("pointerdown", (e) => e.stopPropagation());
uiShell.innerHTML = `
  <div class="title">Visual UI</div>
  <div class="row">
    <button class="btn" data-act="toggle-ui">Master: ON</button>
    <button class="btn secondary" data-act="toggle-showcase">Showcase: OFF</button>
  </div>
  <div class="row">
    <button class="btn secondary" data-act="toggle-cinematic">Cinematic: OFF</button>
  </div>
  <div class="group-title">Panels</div>
  <label class="chk"><input type="checkbox" data-k="play"> Play Panel</label>
  <label class="chk"><input type="checkbox" data-k="look"> Look Panels</label>
  <label class="chk"><input type="checkbox" data-k="audio"> Audio Monitor</label>
  <label class="chk"><input type="checkbox" data-k="debug"> Debug HUD</label>
  <label class="chk"><input type="checkbox" data-k="transport"> Transport UI</label>
  <label class="chk"><input type="checkbox" data-k="cinematic"> Cinematic Mode</label>
  <label class="chk"><input type="checkbox" data-k="harmony"> Harmony Layer</label>
  <label class="chk"><input type="checkbox" data-k="autoplay"> Auto Play (5 Nebula)</label>
  <div class="row"><span>Auto Style</span><select data-k="autoplay-style"><option value="dream">dream</option><option value="sparkle">sparkle</option><option value="calm">calm</option></select></div>
  <div class="row"><span>Auto Tempo</span><input data-k="autoplay-tempo" type="range" min="60" max="140" step="1" style="flex:1;"><span data-k="autoplay-tempo-v">86</span></div>
  <div class="hint">Hotkeys: H master hide/show, J showcase</div>
`;
document.body.appendChild(uiShell);

const uiHubDock = createDockPanel({
  id: "hub",
  title: "UI Hub",
  contentEl: uiShell,
  x: window.innerWidth - 320,
  y: 12,
  width: 300,
  minHeight: 110,
  zIndex: 10001,
  showHideButton: false,
});
const colorSystemContent = document.createElement("div");
colorSystemContent.className = "custom-ui color-system-content";
colorSystemContent.style.cssText = "display:grid; gap:10px;";
for (const panelEl of [backgroundDockUI.root, noteColorUI.root]) {
  panelEl.style.position = "static";
  panelEl.style.left = "";
  panelEl.style.right = "";
  panelEl.style.top = "";
  panelEl.style.bottom = "";
  panelEl.style.width = "100%";
  panelEl.style.padding = "8px 10px";
  panelEl.style.borderRadius = "10px";
  panelEl.style.background = "rgba(16,20,34,0.48)";
  panelEl.style.border = "1px solid rgba(165,196,255,.12)";
  panelEl.style.boxShadow = "none";
  panelEl.style.backdropFilter = "none";
  panelEl.style.margin = "0";
  colorSystemContent.appendChild(panelEl);
}
// Compact section styling inside a single Color System dock.
const bgHead = backgroundDockUI.root.firstElementChild;
const bgBody = bgHead?.nextElementSibling;
if (bgHead && bgBody) {
  bgHead.style.display = "none";
  bgBody.style.display = "";
  bgBody.style.marginTop = "0";
}
const noteTitle = noteColorUI.root.firstElementChild;
if (noteTitle) {
  noteTitle.style.display = "none";
}
const colorSections = [
  { el: backgroundDockUI.root, label: "Background Tone" },
  { el: noteColorUI.root, label: "Note Response" },
];
for (const sec of colorSections) {
  const chip = document.createElement("div");
  chip.textContent = sec.label;
  chip.style.cssText = "font:600 11px/1.2 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif; letter-spacing:.3px; opacity:.82; margin-bottom:6px;";
  sec.el.insertBefore(chip, sec.el.firstChild);
}
const colorDock = createDockPanel({
  id: "color",
  title: "Color System",
  contentEl: colorSystemContent,
  x: window.innerWidth - 320,
  y: 182,
  width: 300,
  minHeight: 180,
  zIndex: 9998,
});
const audioDock = createDockPanel({
  id: "audio",
  title: "Audio Monitor",
  contentEl: audioUI.root,
  x: 12,
  y: 420,
  width: 300,
  minHeight: 120,
  zIndex: 9998,
});
const debugDock = createDockPanel({
  id: "debug",
  title: "Debug HUD",
  contentEl: debugHud,
  x: window.innerWidth - 320,
  y: 540,
  width: 300,
  minHeight: 90,
  zIndex: 9998,
});
const galaxyDock = createDockPanel({
  id: "galaxy",
  title: "Galaxy System",
  contentEl: galaxyGuiRef?.gui?.domElement,
  x: 12,
  y: 12,
  width: 340,
  minHeight: 140,
  zIndex: 9997,
});
const meteorDock = createDockPanel({
  id: "meteor",
  title: "Meteor System",
  contentEl: meteorGui?.domElement,
  x: 12,
  y: 430,
  width: 340,
  minHeight: 120,
  zIndex: 9997,
});
const dolphinDock = createDockPanel({
  id: "dolphin",
  title: "Dolphin Sky",
  contentEl: dolphinGui?.domElement,
  x: 12,
  y: 620,
  width: 340,
  minHeight: 120,
  zIndex: 9997,
});
const notePopDock = createDockPanel({
  id: "note-pop",
  title: "Note Pop",
  contentEl: notePopGui?.domElement,
  x: 12,
  y: 810,
  width: 340,
  minHeight: 120,
  zIndex: 9997,
});

const uiBtn = uiShell.querySelector('[data-act="toggle-ui"]');
const showcaseBtn = uiShell.querySelector('[data-act="toggle-showcase"]');
const cinematicBtn = uiShell.querySelector('[data-act="toggle-cinematic"]');
const playChk = uiShell.querySelector('input[data-k="play"]');
const lookChk = uiShell.querySelector('input[data-k="look"]');
const audioChk = uiShell.querySelector('input[data-k="audio"]');
const debugChk = uiShell.querySelector('input[data-k="debug"]');
const transportChk = uiShell.querySelector('input[data-k="transport"]');
const cinematicChk = uiShell.querySelector('input[data-k="cinematic"]');
const harmonyChk = uiShell.querySelector('input[data-k="harmony"]');
const autoPlayChk = uiShell.querySelector('input[data-k="autoplay"]');
const autoPlayStyleSel = uiShell.querySelector('select[data-k="autoplay-style"]');
const autoPlayTempoRange = uiShell.querySelector('input[data-k="autoplay-tempo"]');
const autoPlayTempoLabel = uiShell.querySelector('[data-k="autoplay-tempo-v"]');

function applyUiState() {
  uiBtn.textContent = `Master: ${uiState.visible ? "ON" : "OFF"}`;
  showcaseBtn.textContent = `Showcase: ${uiState.showcase ? "ON" : "OFF"}`;
  cinematicBtn.textContent = `Cinematic: ${uiState.cinematic ? "ON" : "OFF"}`;
  playChk.checked = !!uiState.showPlay;
  lookChk.checked = !!uiState.showLook;
  audioChk.checked = !!uiState.showAudio;
  debugChk.checked = !!uiState.showDebug;
  transportChk.checked = !!uiState.showTransport;
  if (cinematicChk) cinematicChk.checked = !!uiState.cinematic;
  if (harmonyChk) harmonyChk.checked = !!uiState.harmonyLayer;
  if (autoPlayChk) autoPlayChk.checked = !!uiState.autoPlay;
  if (autoPlayStyleSel) autoPlayStyleSel.value = uiState.autoPlayStyle ?? "dream";
  if (autoPlayTempoRange) autoPlayTempoRange.value = String(uiState.autoPlayTempo ?? 86);
  if (autoPlayTempoLabel) autoPlayTempoLabel.textContent = String(Math.round(uiState.autoPlayTempo ?? 86));
  cinematicState.enabled = !!uiState.cinematic;
  audio?.setNebulaHarmony?.({ enabled: !!uiState.harmonyLayer });
  autoPlayConductor?.setConfig?.({
    enabled: !!uiState.autoPlay,
    style: uiState.autoPlayStyle ?? "dream",
    tempo: Number(uiState.autoPlayTempo ?? 86),
  });

  const showPlay = uiState.visible && uiState.showPlay;
  const showLook = uiState.visible && uiState.showLook;
  const showAudio = uiState.visible && uiState.showAudio;
  const showDebug = uiState.visible && uiState.showDebug;
  const showTransport = uiState.visible && uiState.showTransport;

  if (uiState.showcase) {
    colorDock?.setVisible?.(uiState.visible);
    audioDock?.setVisible?.(false);
    debugDock?.setVisible?.(false);
    noteOverlay.style.display = "none";
    galaxyDock?.setVisible?.(false);
    meteorDock?.setVisible?.(false);
    dolphinDock?.setVisible?.(false);
    notePopDock?.setVisible?.(false);
    const tempoRingEl2 = document.getElementById("tempo-ring");
    const stepRingEl2 = document.getElementById("step-ring");
    if (tempoRingEl2) tempoRingEl2.style.display = uiState.visible ? "" : "none";
    if (stepRingEl2) stepRingEl2.style.display = uiState.visible ? "" : "none";
  } else {
    colorDock?.setVisible?.(showPlay || showLook);
    audioDock?.setVisible?.(showAudio);
    debugDock?.setVisible?.(showDebug);
    noteOverlay.style.display = showDebug ? "" : "none";
    galaxyDock?.setVisible?.(showLook);
    meteorDock?.setVisible?.(showLook);
    dolphinDock?.setVisible?.(showLook);
    notePopDock?.setVisible?.(showLook);
    const tempoRingEl2 = document.getElementById("tempo-ring");
    const stepRingEl2 = document.getElementById("step-ring");
    if (tempoRingEl2) tempoRingEl2.style.display = showTransport ? "" : "none";
    if (stepRingEl2) stepRingEl2.style.display = showTransport ? "" : "none";
  }

  uiHubDock?.setVisible?.(uiState.visible);
  writeUiState(uiState);
}

uiBtn.addEventListener("click", () => {
  uiState.visible = !uiState.visible;
  applyUiState();
});
showcaseBtn.addEventListener("click", () => {
  uiState.showcase = !uiState.showcase;
  applyUiState();
});
cinematicBtn.addEventListener("click", () => {
  uiState.cinematic = !uiState.cinematic;
  applyUiState();
});
playChk.addEventListener("change", () => {
  uiState.showPlay = !!playChk.checked;
  applyUiState();
});
lookChk.addEventListener("change", () => {
  uiState.showLook = !!lookChk.checked;
  applyUiState();
});
audioChk.addEventListener("change", () => {
  uiState.showAudio = !!audioChk.checked;
  applyUiState();
});
debugChk.addEventListener("change", () => {
  uiState.showDebug = !!debugChk.checked;
  applyUiState();
});
transportChk.addEventListener("change", () => {
  uiState.showTransport = !!transportChk.checked;
  applyUiState();
});
const meteorCinematicBase = {
  spawnRate: meteorSystem?.params?.spawnRate ?? 0.35,
  meteorRomance: meteorSystem?.params?.meteorRomance ?? 0.62,
  meteorTail: meteorSystem?.params?.meteorTail ?? 0.64,
  audioGain: meteorSystem?.params?.audioGain ?? 0.7,
};
if (cinematicChk) {
  cinematicChk.addEventListener("change", () => {
    uiState.cinematic = !!cinematicChk.checked;
    applyUiState();
  });
}
if (harmonyChk) {
  harmonyChk.addEventListener("change", () => {
    uiState.harmonyLayer = !!harmonyChk.checked;
    applyUiState();
  });
}
if (autoPlayChk) {
  autoPlayChk.addEventListener("change", () => {
    uiState.autoPlay = !!autoPlayChk.checked;
    applyUiState();
  });
}
if (autoPlayStyleSel) {
  autoPlayStyleSel.addEventListener("change", () => {
    uiState.autoPlayStyle = autoPlayStyleSel.value || "dream";
    applyUiState();
  });
}
if (autoPlayTempoRange) {
  autoPlayTempoRange.addEventListener("input", () => {
    uiState.autoPlayTempo = Math.max(60, Math.min(140, Number(autoPlayTempoRange.value) || 86));
    applyUiState();
  });
}

window.addEventListener("keydown", (e) => {
  const tag = String(e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
  if (e.repeat) return;
  const k = (e.key || "").toLowerCase();
  if (k === "h") {
    uiState.visible = !uiState.visible;
    applyUiState();
  } else if (k === "j") {
    uiState.showcase = !uiState.showcase;
    applyUiState();
  } else if (k === "k") {
    uiState.cinematic = !uiState.cinematic;
    applyUiState();
  } else if (k === "f") {
    const focusGalaxyId =
      musicState.activeIntent?.galaxyId ??
      musicState.hoverIntent?.galaxyId ??
      activeNebulaKey ??
      nebulaSystem.getActiveId?.();
    focusOrbitNebulaId = focusGalaxyId ?? null;
    focusCameraToGalaxy(focusGalaxyId);
  }
});

applyUiState();



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
  void audio.start?.();

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
      nebulaSystem.triggerNotePulse({
        galaxyId: activeNebulaKey,
        theta01: musicState.activeIntent.theta01,
        strength: 0.95,
      });
      const instrument = voices?.getNebulaInstrument?.(activeNebulaKey);
      if (instrument) {
        triggerPerformanceCameraNotePulse({
          galaxyId: activeNebulaKey,
          strength: 0.46,
          centerWorld: hitPoint,
        });
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
        const velHit = THREE.MathUtils.clamp(Math.max(move01, 0.48), 0, 1);
        dolphinSystem?.triggerFromNote?.({
          galaxyId: activeNebulaKey,
          theta01: musicState.activeIntent.theta01,
          velocity: velHit,
          strength: THREE.MathUtils.lerp(0.88, 1.0, velHit),
          now: performance.now() * 0.001,
        });
        notePopSystem?.triggerFromNote?.({
          galaxyId: activeNebulaKey,
          theta01: musicState.activeIntent.theta01,
          velocity: velHit,
          notePitch01: midiToPitch01(musicState.activeIntent.midi),
          noteHue: musicState.activeIntent.theta01,
          strength: THREE.MathUtils.lerp(0.90, 1.0, velHit),
          now: performance.now() * 0.001,
        });
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

function lerp3(a, b, t) {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

function catmull4(p0, p1, p2, p3, f) {
  const f2 = f * f;
  const f3 = f2 * f;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * f + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * f + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3),
    0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * f + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * f2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * f3),
  ];
}

function sampleBackgroundPaletteAt(t01) {
  const t = ((t01 % 1) + 1) % 1;
  const x = t * 4;
  const i1 = Math.floor(x) % 4;
  const f = x - Math.floor(x);
  const i0 = (i1 + 3) % 4;
  const i2 = (i1 + 1) % 4;
  const i3 = (i1 + 2) % 4;
  const p = [
    [bg.uniforms.uPal0.value.x, bg.uniforms.uPal0.value.y, bg.uniforms.uPal0.value.z],
    [bg.uniforms.uPal1.value.x, bg.uniforms.uPal1.value.y, bg.uniforms.uPal1.value.z],
    [bg.uniforms.uPal2.value.x, bg.uniforms.uPal2.value.y, bg.uniforms.uPal2.value.z],
    [bg.uniforms.uPal3.value.x, bg.uniforms.uPal3.value.y, bg.uniforms.uPal3.value.z],
  ];
  return catmull4(p[i0], p[i1], p[i2], p[i3], f);
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
  const alphas = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;

    const angle = Math.random() * Math.PI * 2;
    const zUnit = Math.random() * 2 - 1;
    const rr = Math.sqrt(Math.max(0, 1 - zUnit * zUnit));
    const shell = radius * (0.82 + Math.random() * 0.18);
    const x = Math.cos(angle) * rr * shell;
    const y = zUnit * shell * (thickness / radius);
    const z = Math.sin(angle) * rr * shell;

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    const t = Math.random();
    const cA = new THREE.Color("#f9f2ff");
    const cB = new THREE.Color("#d8ccff");
    const cC = new THREE.Color("#bfe9ff");
    const c = new THREE.Color();
    if (t < 0.5) c.copy(cA).lerp(cB, t / 0.5);
    else c.copy(cB).lerp(cC, (t - 0.5) / 0.5);
    c.lerp(new THREE.Color("#ffffff"), 0.14 + (1.0 - t) * 0.16);

    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    sizes[i] = 0.70 + Math.pow(Math.random(), 2.2) * 3.0;
    seeds[i] = Math.random() * 1000.0;
    alphas[i] = 0.28 + Math.random() * 0.72;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.58 },
      uBaseSize: { value: 1.35 },
      uBreath: { value: 0.60 },
      uBling: { value: 0.58 },
      uSoftness: { value: 0.76 },
      uCross: { value: 0.46 },
      uColorGlow: { value: 1.8 },
      uGlowColorA: { value: new THREE.Color("#9fd6ff") },
      uGlowColorB: { value: new THREE.Color("#c7b2ff") },
      uGlowColorC: { value: new THREE.Color("#ffc8ef") },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: starsVert,
    fragmentShader: starsFrag,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -950;
  return points;
}

// Stars
// -------------------------------------
const stars = makeStars({ count: 22000, radius: 120.0, thickness: 120.0 });
scene.add(stars);

function getStarScreenScale() {
  const screenMax = Math.max(window.innerWidth, window.innerHeight);
  return THREE.MathUtils.clamp(1.0 + (screenMax - 1400) / 2200, 1.0, 1.55);
}
function getStarBaseSize(sizePx = 16) {
  return THREE.MathUtils.clamp(sizePx, 2, 28) * 0.22 * getStarScreenScale();
}
stars.material.uniforms.uBaseSize.value = getStarBaseSize();

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
const bgTargetPos = new THREE.Vector2(0.5, 0.5);
let bgLastSoftInjectMs = 0;
const bgLastEmitPos = new THREE.Vector2(0.5, 0.5);
let bgLastEmitHue = 0.66;
let bgLastEmitStep = -1;

// -------------------------------------
// Mouse move intensity (for audio trigger)
// -------------------------------------
let lastPX = 0,
  lastPY = 0;
let move01 = 0;
let nebulaBoostSmoothed = 0;

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
  performanceCamera?.beginFrame?.(camera);
  cameraControl?.update?.(dt);
  if (cameraFocus.active) {
    cameraFocus.elapsed += dt;
    const a = THREE.MathUtils.clamp(cameraFocus.elapsed / Math.max(1e-4, cameraFocus.duration), 0, 1);
    const s = a * a * (3 - 2 * a); // smoothstep
    const targetNow = new THREE.Vector3().lerpVectors(cameraFocus.startTarget, cameraFocus.endTarget, s);
    camera.position.lerpVectors(cameraFocus.startPos, cameraFocus.endPos, s);
    cameraControl?.setTarget?.(targetNow);
    camera.lookAt(targetNow);

    if (a >= 1) {
      cameraFocus.active = false;
      syncLegacyOrbitFromCamera(targetNow);
      cameraControl?.syncOrbitFromCamera?.();
    }
  }
  applyFocusOrbitMode(dt);
  const t = clock.getElapsedTime();
  autoPlayConductor?.update?.(t, { pointerDown });
  autoReplayVisual.energy = __bgRiseFall(autoReplayVisual.energy, 0.0, dt, 10.0, 1.8);
  if (autoReplayVisual.pending) {
    const ev = autoReplayVisual.pending;
    autoReplayVisual.pending = null;
    const cluster = nebulaSystem.getCluster?.(ev.galaxyId);
    if (cluster?.group) {
      const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
      const groupScale = cluster?.group?.scale?.x ?? 1.0;
      const rW = Math.max(0.25, 1.9 * sizeScale * groupScale * (0.36 + ev.r01 * 0.64));
      const pLocal = new THREE.Vector3(
        Math.cos(ev.theta01 * Math.PI * 2) * rW,
        0,
        Math.sin(ev.theta01 * Math.PI * 2) * rW
      );
      const pWorld = cluster.group.localToWorld(pLocal);
      const pNdc = pWorld.clone().project(camera);
      bgTargetPos.set(
        THREE.MathUtils.clamp(pNdc.x * 0.5 + 0.5, 0, 1),
        THREE.MathUtils.clamp(1 - (pNdc.y * 0.5 + 0.5), 0, 1)
      );
      bgDrive.noteHue = __lerpHue01(bgDrive.noteHue, ((ev.theta01 % 1) + 1) % 1, 0.32);
      bgDrive.noteSeed = Math.random() * 0.999 + 0.001;
      bgLastEmitPos.copy(bgTargetPos);
      bgLastEmitHue = bgDrive.noteHue;
      bgLastEmitStep = ev.step ?? -1;
      bgLastEmitE = Math.max(bgLastEmitE, 0.72);
      bgClickPulse = Math.max(bgClickPulse, 0.42);
    }
  }

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
  nebulaSystem.setIntentVisuals({
    hoverId: musicState.hoverIntent?.galaxyId ?? null,
    activeId: musicState.activeIntent?.galaxyId ?? null,
    lastId: musicState.lastIntent?.galaxyId ?? null,
    hoverTheta01: musicState.hoverIntent?.theta01 ?? null,
    activeTheta01: musicState.activeIntent?.theta01 ?? null,
    lastTheta01: musicState.lastIntent?.theta01 ?? null,
  });

  let isPerformancePlaying = false;
  const performanceActiveNebulaId = musicState.activeIntent?.galaxyId ?? null;
  if (pointerDown && performanceActiveNebulaId && activeDiskCenterW && musicState.activeIntent) {
    const centerN = activeDiskCenterW.clone().project(camera);
    const dx = pointer.x - centerN.x;
    const dy = pointer.y - centerN.y;
    const dist = Math.hypot(dx, dy);
    isPerformancePlaying = dist <= activeDiskOuterNDC;
  }

  const performanceCameraBaseTarget = cameraControl?.getTarget?.() ?? orbitTarget.clone();
  performanceCamera?.update?.(dt, {
    camera,
    baseTarget: performanceCameraBaseTarget,
    hoveredNebulaId: musicState.hoverIntent?.galaxyId ?? null,
    focusedNebulaId: focusedPerformanceNebulaId,
    activePerformanceNebulaId: performanceActiveNebulaId,
    isSustainedPlaying: isPerformancePlaying,
    forceOrbitNebulaId: null,
    nebulaSystem,
  });




  // --- background
  if (bg) bg.update(dt, camera);

  const mx01 = pointer.x * 0.5 + 0.5;
  const my01 = pointer.y * 0.5 + 0.5;
  bg.setMouse01(mx01, my01);


  

  // --- stars
  stars.material.uniforms.uTime.value = t;
  stars.position.copy(camera.position);
  stars.rotation.y += dt * 0.018;
  stars.rotation.x = Math.sin(t * 0.03) * 0.03;
  const starBreathUi = THREE.MathUtils.clamp(backgroundDockUI?.getStarBreath?.() ?? 0.60, 0, 1);
  const starColorGlowUi = THREE.MathUtils.clamp(backgroundDockUI?.getStarColorGlow?.() ?? 1.8, 0, 30);
  const starSizeUi = THREE.MathUtils.clamp(backgroundDockUI?.getStarSize?.() ?? 16, 2, 28);
  const dreamyGlow = dreamyGlowController.getConfig();
  const dreamGlowE = dreamyGlow.enabled ? THREE.MathUtils.clamp(dreamyGlow.intensity, 0, 1.5) : 0;
  const [gAr, gAg, gAb] = backgroundDockUI?.getStarGlowColorA01?.() ?? [0.62, 0.84, 1.0];
  const [gBr, gBg, gBb] = backgroundDockUI?.getStarGlowColorB01?.() ?? [0.78, 0.70, 1.0];
  const [gCr, gCg, gCb] = backgroundDockUI?.getStarGlowColorC01?.() ?? [1.0, 0.78, 0.94];
  const derivedBling = THREE.MathUtils.lerp(0.0, 0.10, starBreathUi);
  const derivedSoftness = THREE.MathUtils.lerp(0.0, 0.12, starBreathUi);
  stars.material.uniforms.uBreath.value = starBreathUi;
  stars.material.uniforms.uBling.value = derivedBling;
  stars.material.uniforms.uSoftness.value = derivedSoftness;
  stars.material.uniforms.uCross.value = THREE.MathUtils.lerp(0.10, 0.24, starBreathUi);
  stars.material.uniforms.uColorGlow.value = starColorGlowUi * (1.0 + dreamGlowE * dreamyGlow.starGlowBoost * 1.10);
  stars.material.uniforms.uGlowColorA.value.set(gAr, gAg, gAb);
  stars.material.uniforms.uGlowColorB.value.set(gBr, gBg, gBb);
  stars.material.uniforms.uGlowColorC.value.set(gCr, gCg, gCb);
  const glowNorm = THREE.MathUtils.clamp(starColorGlowUi / 10.0, 0, 1);
  const colorPreserve = THREE.MathUtils.lerp(1.0, 0.60, glowNorm);
  stars.material.uniforms.uOpacity.value =
    THREE.MathUtils.lerp(0.58, 0.92, starBreathUi) *
    colorPreserve *
    (1.0 + dreamGlowE * dreamyGlow.starGlowBoost * 0.18);
  stars.material.uniforms.uBaseSize.value = getStarBaseSize(starSizeUi);

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
  } else if (autoDisturbE > 0.001) {
    disturb = autoDisturbPoint;
  }

  const autoExpress = autoPlayConductor?.getConfig?.()?.enabled ? autoReplayVisual.energy : 0.0;
  const pointerExpress = (pointerDown && activeNebulaKey) ? THREE.MathUtils.clamp(move01 * 1.25, 0, 1) : 0.0;
  autoDisturbE = Math.max(0.0, autoDisturbE - dt / 0.95);
  const disturbExpress = THREE.MathUtils.clamp(Math.max(pointerExpress, autoExpress * 0.9, autoDisturbE * 0.95), 0, 1);
  nebulaBoostSmoothed = __bgRiseFall(nebulaBoostSmoothed, disturbExpress, dt, 12.0, 2.2);
  if (nebulaSystem?.attractionUI) {
    nebulaSystem.attractionUI.boost = nebulaBoostSmoothed;
  }

  nebulaSystem.update(disturb, t);

  // Cinematic mode: gentle scene-level meteor modulation.
  if (meteorSystem?.params) {
    if (cinematicState.enabled && !cinematicState.wasEnabled) {
      cinematicState.prevMeteor = {
        spawnRate: meteorSystem.params.spawnRate,
        meteorRomance: meteorSystem.params.meteorRomance,
        meteorTail: meteorSystem.params.meteorTail,
        audioGain: meteorSystem.params.audioGain,
      };
      cinematicState.wasEnabled = true;
    } else if (!cinematicState.enabled && cinematicState.wasEnabled) {
      const prev = cinematicState.prevMeteor ?? meteorCinematicBase;
      meteorSystem.params.spawnRate = prev.spawnRate;
      meteorSystem.params.meteorRomance = prev.meteorRomance;
      meteorSystem.params.meteorTail = prev.meteorTail;
      meteorSystem.params.audioGain = prev.audioGain;
      cinematicState.prevMeteor = null;
      cinematicState.wasEnabled = false;
    }
  }
  if (cinematicState.enabled && meteorSystem?.params) {
    const ce = cinematicState.energy;
    meteorSystem.params.spawnRate = THREE.MathUtils.lerp(0.22, 0.58, ce);
    meteorSystem.params.meteorRomance = THREE.MathUtils.lerp(0.52, 0.88, ce);
    meteorSystem.params.meteorTail = THREE.MathUtils.lerp(0.54, 0.92, ce);
    meteorSystem.params.audioGain = THREE.MathUtils.lerp(0.52, 0.86, ce);
  }

  meteorSystem.update(t);
  dolphinSystem.update(t);
  notePopSystem.update(t);

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
    // Keep note hue tied to angular position directly to avoid abrupt composite wrap jumps.
    bgTargetPos.set(mouse01.x, mouse01.y);
    const nowMsSoft = performance.now();
    if ((nowMsSoft - bgLastSoftInjectMs) > 120) {
      bgLastSoftInjectMs = nowMsSoft;
      bgDrive.pulse = Math.max(bgDrive.pulse, 0.22);
      bgDrive.noteSeed = (Math.random() * 0.999) + 0.001;
    }



      const instrument = voices?.getNebulaInstrument?.(activeNebulaKey);
      noteHint?.setInteractionSample?.(activeNebulaKey, musicState.activeIntent.theta01, musicState.activeIntent.r01);

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

  // Cinematic macro cycle: Calm -> Lift -> Bloom -> Calm
  // This only modulates global visual/audio mood; interaction logic remains unchanged.
  if (cinematicState.enabled) {
    const cycleSec = 44.0;
    const cycleT = (t % cycleSec) / cycleSec;
    cinematicState.phase = cycleT;

    const calm = 1.0 - smoothPulse01(THREE.MathUtils.clamp(cycleT / 0.32, 0, 1));
    const lift = smoothPulse01(THREE.MathUtils.clamp((cycleT - 0.18) / 0.34, 0, 1));
    const bloomPhase = smoothPulse01(THREE.MathUtils.clamp((cycleT - 0.52) / 0.28, 0, 1));
    const settle = 1.0 - smoothPulse01(THREE.MathUtils.clamp((cycleT - 0.80) / 0.20, 0, 1));
    const target = THREE.MathUtils.clamp(0.10 + lift * 0.34 + bloomPhase * 0.56 + calm * 0.06, 0, 1);
    cinematicState.energy = __bgRiseFall(cinematicState.energy, target * settle + target * (1 - settle) * 0.72, dt, 0.9, 0.55);
    cinematicState.pulseBoost = 1.0 + cinematicState.energy * 0.42;
  } else {
    cinematicState.phase = 0;
    cinematicState.energy = __bgRiseFall(cinematicState.energy, 0, dt, 1.2, 0.9);
    cinematicState.pulseBoost = 1.0;
  }

  
  // 7) Bloom：只跟随 lead 能量（慢），并且整体更低
  // 这样“弹奏有光”但不会糊掉星云
  const glowUiBloom = THREE.MathUtils.clamp(noteColorUI?.getGlow?.() ?? 0.56, 0, 1);
  const dreamyGlowBloom = dreamyGlowController.getConfig();
  const dreamBloomE = dreamyGlowBloom.enabled ? THREE.MathUtils.clamp(dreamyGlowBloom.intensity, 0, 1.5) : 0;
  const bloomTargetBase = (0.03 + bgMood.energy * 0.06 + cinematicState.energy * 0.022) * (0.55 + glowUiBloom * 0.75);
  const bloomTarget = bloomTargetBase * (1.0 + dreamBloomE * 1.65);
  bloomPass.strength += (bloomTarget - bloomPass.strength) * (1 - Math.exp(-dt * 1.4));
  bloomPass.threshold = dreamyGlowBloom.enabled
    ? THREE.MathUtils.lerp(0.88, 0.58, THREE.MathUtils.clamp(dreamyGlowBloom.softness, 0, 1.5) / 1.5)
    : 0.88;
  bloomPass.radius = dreamyGlowBloom.enabled
    ? THREE.MathUtils.lerp(0.25, 0.88, THREE.MathUtils.clamp(dreamyGlowBloom.softness, 0, 1.5) / 1.5)
    : 0.25;
  dreamGlowPass.enabled = dreamyGlowBloom.enabled;
  dreamGlowPass.uniforms.uAmount.value = dreamyGlowBloom.enabled
    ? dreamyGlowBloom.filterAmount * (0.55 + dreamBloomE * 0.65)
    : 0.0;
  dreamGlowPass.uniforms.uBlurScale.value = dreamyGlowBloom.enabled
    ? THREE.MathUtils.lerp(1.4, 4.8, THREE.MathUtils.clamp(dreamyGlowBloom.softness, 0, 1.5) / 1.5)
    : 1.0;
  dreamGlowPass.uniforms.uTintMix.value = dreamyGlowBloom.filterTintMix;
  dreamGlowPass.uniforms.uHaze.value = dreamyGlowBloom.enabled ? dreamyGlowBloom.filterHaze : 0.0;

  // -------------------- Dreamy background (CLEAN) --------------------
  // Clean dt/t timing. No legacy time state object.
  {
    const sScratch = audio.getState()?.scratch;
    const pearlUi = THREE.MathUtils.clamp(noteColorUI?.getPearl?.() ?? 0.62, 0, 1);
    const glowUi = THREE.MathUtils.clamp(noteColorUI?.getGlow?.() ?? 0.56, 0, 1);
    const dreamyGlowBg = dreamyGlowController.getConfig();
    const pureColorCfg = pureColorController.getConfig();
    const pearlWhiteCfg = pearlWhiteController.getConfig();
    const pearlWhiteColor = pearlWhiteController.getColor();
    const pureColorE = pureColorCfg.enabled ? 1.0 : 0.0;
    const dreamBgE = dreamyGlowBg.enabled ? THREE.MathUtils.clamp(dreamyGlowBg.intensity, 0, 1.5) : 0;
    const pearlWhiteE = pearlWhiteCfg.enabled ? 1.0 : 0.0;
    const richnessUi = THREE.MathUtils.clamp(noteColorUI?.getRichness?.() ?? 0.58, 0, 1);
    const dreamUi = THREE.MathUtils.clamp(noteColorUI?.getDream?.() ?? 0.52, 0, 1);
    const flowDetailUi = THREE.MathUtils.clamp(backgroundDockUI?.getFlowDetail?.() ?? 0.62, 0, 1);
    const darkSpaceUi = THREE.MathUtils.clamp(backgroundDockUI?.getDarkSpace?.() ?? 0.70, 0, 1);
    const localColorLiftUi = THREE.MathUtils.clamp(backgroundDockUI?.getLocalColorLift?.() ?? 0.62, 0, 1);
    const screenMax = Math.max(window.innerWidth, window.innerHeight);
    const largeScreenBoost = THREE.MathUtils.clamp((screenMax - 1600) / 1800, 0, 1);
    const detailCurve = Math.pow(flowDetailUi, 0.82);
    const highZone = THREE.MathUtils.clamp((flowDetailUi - 0.55) / 0.45, 0, 1);
    const detailBoost = 1.0 + largeScreenBoost * highZone * 0.45;

    const scratchVelRaw = THREE.MathUtils.clamp((sScratch?.velocity ?? 0) / 1.2, 0, 1);
    const isPlaying = !!(pointerDown && isActiveNebulaHovered);
    const interactionNow = !!(pointerDown && (isActiveNebulaHovered || musicState.activeIntent));
    const scratchVel01 = interactionNow ? scratchVelRaw : 0.0;

    // Click pulse envelope: immediate rise (0.03~0.08s), slower fade (0.5~0.8s)
    bgClickPulse = Math.max(0.0, bgClickPulse - dt / 0.85);
    bgClickPulseVis = __bgRiseFall(bgClickPulseVis, bgClickPulse, dt, 18.0, 1.5);

    // Immediate interaction drive for hold/slide, with no hover-delay dependency.
    const baseHold = interactionNow ? 0.12 : 0.0;
    const autoVisualLead = autoPlayConductor?.getConfig?.()?.enabled ? autoReplayVisual.energy : 0.0;
    const targetLead = THREE.MathUtils.clamp(baseHold + scratchVel01 * 0.46 + bgClickPulseVis * 0.30 + autoVisualLead * 0.24, 0, 1);
    // slower fall to calm (~1-2s)
    bgLeadE = __bgRiseFall(bgLeadE, targetLead, dt, 14.0, 1.1);
    const interactionTarget = THREE.MathUtils.clamp(
      (interactionNow ? 0.82 : 0.0) + scratchVel01 * 0.24 + bgClickPulseVis * 0.18 + autoVisualLead * 0.28,
      0,
      1
    );
    // ~1-2s decay when no interaction
    bgInteractionE = __bgRiseFall(bgInteractionE, interactionTarget, dt, 16.0, 0.9);
    bgLastEmitE = __bgRiseFall(bgLastEmitE, 0.0, dt, 10.0, interactionNow ? 0.45 : 1.35);

    // Smooth pitch/vel/theta (prefer scratch state; fallback to bgDrive)
    const targetPitch = (typeof sScratch?.pitch01 === "number") ? sScratch.pitch01 : bgDrive.pitch01;
    const targetVel   = interactionNow ? Math.max(0.12, scratchVel01) : 0.0;
    const targetTheta = (typeof sScratch?.theta01 === "number") ? sScratch.theta01 : bgDrive.theta01;
    const autoVisual = autoPlayConductor?.getConfig?.()?.enabled ? autoReplayVisual.energy : 0.0;

    bgPitch01 = __bgRiseFall(bgPitch01, THREE.MathUtils.clamp(targetPitch, 0, 1), dt, 14.0, 7.0);
    bgVel01   = __bgRiseFall(bgVel01,   THREE.MathUtils.clamp(targetVel + autoVisual * 0.18,   0, 1), dt, 16.0, 6.0);
    bgTheta01 = __bgRiseFallWrap(bgTheta01, THREE.MathUtils.clamp(targetTheta, 0, 1), dt, 14.0, 8.0);
    bgDrive.noteHue = __bgRiseFallWrap(bgDrive.noteHue, bgTheta01, dt, 8.0, 4.0);
    bgDrive.notePos.lerp(bgTargetPos, 1.0 - Math.exp(-dt * 7.5));

    // Directly drive visible flow/brightness response (keeps click + hold responsive).
    const cinematicGain = cinematicState.enabled ? (1.0 + cinematicState.energy * 0.42) : 1.0;
    const flowTarget = THREE.MathUtils.clamp((0.015 + bgLeadE * 0.64 + bgClickPulseVis * 0.34 + autoVisual * 0.18) * (0.80 + 0.28 * glowUi) * (0.94 + 0.18 * richnessUi) * cinematicGain, 0, 1.00);
    const sparkleTarget = THREE.MathUtils.clamp(
      (0.003 + richnessUi * 0.010) * (1.0 + dreamBgE * dreamyGlowBg.backgroundLift * 0.60),
      0.001,
      0.042
    );
    const satTargetRaw = 0.24 + bgLeadE * 0.44 + bgClickPulseVis * 0.22 + dreamUi * 0.10;
    const satTarget = THREE.MathUtils.clamp(
      satTargetRaw * (1.0 - 0.24 * darkSpaceUi) * (1.0 + pureColorE * pureColorCfg.saturation * 0.22),
      0.22,
      THREE.MathUtils.lerp(1.04, 0.88, darkSpaceUi)
    );
    // auto-dim to keep nebula readable
    const readabilityLimiter = interactionNow ? 0.84 : 0.92;
    const darkCalmDim = THREE.MathUtils.lerp(1.0, 0.46, darkSpaceUi);
    const darkInteractionLift = THREE.MathUtils.lerp(0.0, 0.36, darkSpaceUi) * (0.55 * bgInteractionE + 0.45 * bgClickPulseVis);
    const darkGain = THREE.MathUtils.clamp(darkCalmDim + darkInteractionLift, 0.28, 1.0);
    const intensityTarget = THREE.MathUtils.clamp(
      (0.008 + bgLeadE * 0.32 + bgClickPulseVis * 0.16 + cinematicState.energy * 0.06 + autoVisual * 0.06) *
      readabilityLimiter *
      (0.64 + 0.44 * glowUi) *
      darkGain *
      (1.0 + dreamBgE * dreamyGlowBg.backgroundLift * 0.52) *
      (1.0 + pureColorE * pureColorCfg.lift * 0.20),
      0.006,
      0.72
    );
    bg.uniforms.uFlow.value = __bgRiseFall(bg.uniforms.uFlow.value, flowTarget, dt, 12.0, 1.5);
    bg.uniforms.uSparkle.value = __bgRiseFall(bg.uniforms.uSparkle.value, sparkleTarget, dt, 6.0, 2.6);
    bg.uniforms.uSat.value = __bgRiseFall(bg.uniforms.uSat.value, satTarget, dt, 10.0, 2.2);
    bg.uniforms.uPearl.value = __bgRiseFall(bg.uniforms.uPearl.value, 0.28 + pearlUi * 1.02, dt, 8.0, 4.0);
    bg.uniforms.uIntensity.value = __bgRiseFall(bg.uniforms.uIntensity.value, intensityTarget, dt, 11.0, 1.4);
    const contrastTarget = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(0.96, 1.24, darkSpaceUi) + localColorLiftUi * 0.03 - pureColorE * pureColorCfg.contrastSoftness * 0.16,
      0.82,
      1.18
    );
    bg.uniforms.uContrast.value = __bgRiseFall(bg.uniforms.uContrast.value, contrastTarget, dt, 7.0, 3.0);
    const detailTarget = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(0.24, 1.02, detailCurve) * (0.94 + 0.24 * bgInteractionE + cinematicState.energy * 0.10) * detailBoost,
      0.14,
      1.25
    );
    const warpTarget = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(0.40, 0.96, detailCurve) * (0.92 + 0.18 * bgInteractionE + cinematicState.energy * 0.16) * (1.0 + largeScreenBoost * highZone * 0.28),
      0.25,
      1.08
    );
    const scaleTarget = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(0.80, 1.24, detailCurve),
      0.7,
      1.35
    );
    bg.uniforms.uDetail.value = __bgRiseFall(bg.uniforms.uDetail.value, detailTarget, dt, 7.0, 2.4);
    bg.uniforms.uWarp.value = __bgRiseFall(bg.uniforms.uWarp.value, warpTarget, dt, 7.5, 2.5);
    bg.uniforms.uScale.value = __bgRiseFall(bg.uniforms.uScale.value, scaleTarget, dt, 5.8, 2.0);
    const pearlWhiteTarget = THREE.MathUtils.clamp(
      (0.18 + bgInteractionE * 0.48 + bgClickPulseVis * 0.26 + bgLeadE * 0.22) * pearlWhiteCfg.strength * pearlWhiteE,
      0,
      1
    );
    bg.uniforms.uBaseLift.value.set(pearlWhiteColor.r, pearlWhiteColor.g, pearlWhiteColor.b);
    bg.uniforms.uBaseLiftMix.value = __bgRiseFall(bg.uniforms.uBaseLiftMix.value, pearlWhiteTarget, dt, 4.5, 1.8);

    // Pulse: when step changes while playing
    const stepNow = (typeof sScratch?.step === "number") ? sScratch.step : -1;
    if (isPlaying && stepNow >= 0 && stepNow !== bgLastStep) {
      bgLastStep = stepNow;
      triggerBackgroundPulse(0.85);
      triggerPerformanceCameraNotePulse({
        galaxyId: activeNebulaKey ?? musicState.activeIntent?.galaxyId ?? null,
        strength: THREE.MathUtils.lerp(0.24, 0.46, THREE.MathUtils.clamp(scratchVel01, 0, 1)),
        centerWorld: hitPoint,
      });
      nebulaSystem.triggerNotePulse({
        galaxyId: activeNebulaKey ?? musicState.activeIntent?.galaxyId ?? null,
        theta01: musicState.activeIntent?.theta01 ?? null,
        strength: THREE.MathUtils.clamp(0.72 * cinematicState.pulseBoost, 0, 1),
      });
      bgNoteSeed = t;
      bgNoteHue = (stepNow % STEPS) / STEPS;
      bgDrive.noteSeed = bgNoteSeed;
      bgLastEmitPos.copy(bgDrive.notePos);
      bgLastEmitHue = bgDrive.noteHue;
      bgLastEmitStep = stepNow;
      bgLastEmitE = 1.0;
      const nowMsD = performance.now();
      const vPlay = THREE.MathUtils.clamp(scratchVel01, 0, 1);
      if ((nowMsD - lastDolphinEmitMs) >= emitGapMsFromVelocity(vPlay, 145, 60)) {
        lastDolphinEmitMs = nowMsD;
        dolphinSystem?.triggerFromNote?.({
          galaxyId: activeNebulaKey ?? musicState.activeIntent?.galaxyId ?? null,
          theta01: musicState.activeIntent?.theta01 ?? (stepNow / 7),
          velocity: vPlay,
          strength: THREE.MathUtils.lerp(0.78, 1.0, vPlay),
          now: nowMsD * 0.001,
        });
      }
      if ((nowMsD - lastNotePopEmitMs) >= emitGapMsFromVelocity(vPlay, 125, 44)) {
        lastNotePopEmitMs = nowMsD;
        notePopSystem?.triggerFromNote?.({
          galaxyId: activeNebulaKey ?? musicState.activeIntent?.galaxyId ?? null,
          theta01: musicState.activeIntent?.theta01 ?? (stepNow / 7),
          velocity: vPlay,
          notePitch01: midiToPitch01(musicState.activeIntent?.midi),
          noteHue: musicState.activeIntent?.theta01 ?? (stepNow / 7),
          strength: THREE.MathUtils.lerp(0.84, 1.0, vPlay),
          now: nowMsD * 0.001,
        });
      }
    }
    bgPulse = Math.max(0.0, bgPulse - dt / 0.70);

    // Feed shader uniforms (new dreamyBackground API)
    if (bg && bg.setAudio) {
      const bgReactiveCfg = backgroundReactivityController.getConfig();
      const activeIntentNow = musicState.activeIntent;
      const hoverIntentNow = musicState.hoverIntent;
      const focusIntent = activeIntentNow ?? hoverIntentNow ?? musicState.lastIntent ?? null;
      const activeHue = bgDrive.noteHue;
      const hoverHue = hoverIntentNow?.theta01 ?? bgTheta01 ?? activeHue;
      const colorBlend = THREE.MathUtils.clamp(backgroundDockUI?.getColorBlend?.() ?? 0.46, 0, 1);
      const notePresence = THREE.MathUtils.lerp(0.22, 0.60, colorBlend);
      const harmony = THREE.MathUtils.lerp(0.52, 0.18, colorBlend);
      const colorMix = THREE.MathUtils.clamp(0.08 + 0.22 * notePresence, 0, 0.30);
      const activeStep = (typeof activeIntentNow?.step === "number") ? activeIntentNow.step : -1;
      const hoverStep = (typeof hoverIntentNow?.step === "number") ? hoverIntentNow.step : -1;
      const lastStep = (typeof bgLastEmitStep === "number") ? bgLastEmitStep : -1;
      const [ahR, ahG, ahB] = hsvToRgb(activeHue, 0.66, 1.0);
      const [hhR, hhG, hhB] = hsvToRgb(hoverHue, 0.56, 0.95);
      const [lhR, lhG, lhB] = hsvToRgb(bgLastEmitHue, 0.52, 0.9);
      const activeCustom = noteColorUI?.getColorRgb01?.(activeStep);
      const hoverCustom = noteColorUI?.getColorRgb01?.(hoverStep);
      const lastCustom = noteColorUI?.getColorRgb01?.(lastStep);
      const noteInjectionOn = bgReactiveCfg.enableNoteColorInjection;
      const localEmittersOn = bgReactiveCfg.enableLocalEmitters;
      const resolveTone = (baseRgb, customRgb, step, thetaFallback) => {
        const manual = (noteInjectionOn && customRgb) ? lerp3(baseRgb, customRgb, colorMix) : baseRgb;
        const derived = sampleBackgroundPaletteAt((step >= 0 ? (step % 7) / 7 : thetaFallback));
        const harmonyBlend = 0.08 + 0.16 * harmony; // keep note color identifiable
        const fused = lerp3(manual, derived, harmonyBlend);
        return lerp3(derived, fused, 0.28 + 0.36 * notePresence);
      };
      const [ar, ag, ab] = resolveTone([ahR, ahG, ahB], activeCustom, activeStep, activeHue);
      const [hr, hg, hb] = resolveTone([hhR, hhG, hhB], hoverCustom, hoverStep, hoverHue);
      const [lr, lg, lb] = resolveTone([lhR, lhG, lhB], lastCustom, lastStep, bgLastEmitHue);
      const focusStep = (typeof focusIntent?.step === "number") ? focusIntent.step : -1;
      const focusCustom = noteColorUI?.getColorRgb01?.(focusStep);
      const focusHue = (typeof focusIntent?.theta01 === "number") ? focusIntent.theta01 : activeHue;
      const focusBase = hsvToRgb(focusHue, 0.62, 1.0);
      const focusRgb = resolveTone(focusBase, focusCustom, focusStep, focusHue);
      const focusRaw = focusCustom ?? focusBase;
      const focusVisible = lerp3(
        focusRgb,
        noteInjectionOn ? focusRaw : focusRgb,
        noteInjectionOn ? THREE.MathUtils.clamp(0.18 + 0.26 * notePresence, 0, 0.52) : 0
      );
      const noteColor = { r: focusVisible[0], g: focusVisible[1], b: focusVisible[2] };
      const stableNoteHue = (focusStep >= 0) ? ((focusStep % 7) / 7) : bgNoteHue;
      const glowGain = 0.56 + 0.58 * glowUi;
      const presenceGain = 0.35 + 0.95 * notePresence;
      const localLift = THREE.MathUtils.lerp(0.72, 1.50, localColorLiftUi);
      const activeStrength = localEmittersOn
        ? THREE.MathUtils.clamp((bgInteractionE * 0.36 + bgClickPulseVis * 0.08) * glowGain * presenceGain * localLift, 0, 0.34)
        : 0;
      const hoverStrength = localEmittersOn
        ? THREE.MathUtils.clamp((hoverIntentNow ? 0.05 : 0.0) * (0.28 + 0.24 * bgInteractionE) * glowGain * presenceGain * (0.82 + 0.18 * localColorLiftUi), 0, 0.10)
        : 0;
      const lastStrength = localEmittersOn
        ? THREE.MathUtils.clamp(bgLastEmitE * 0.22 * glowGain * presenceGain * (0.88 + 0.20 * localColorLiftUi), 0, 0.18)
        : 0;
      const wrap01 = (v) => ((v % 1) + 1) % 1;
      const blendTrail = {
        x: THREE.MathUtils.lerp(bgDrive.notePos.x, bgLastEmitPos.x, 0.58),
        y: THREE.MathUtils.lerp(bgDrive.notePos.y, bgLastEmitPos.y, 0.58),
      };
      const sat2 = {
        x: wrap01(bgLastEmitPos.x - 0.20 * Math.cos((bgTheta01 + 0.33) * Math.PI * 2)),
        y: wrap01(bgLastEmitPos.y - 0.12 * Math.sin((bgTheta01 + 0.33) * Math.PI * 2)),
      };
      const sat1 = {
        x: wrap01(blendTrail.x + 0.16 * Math.cos((bgTheta01 + 0.08) * Math.PI * 2)),
        y: wrap01(blendTrail.y + 0.14 * Math.sin((bgTheta01 + 0.08) * Math.PI * 2)),
      };
      const [s1r, s1g, s1b] = resolveTone([hr, hg, hb], activeCustom ?? hoverCustom, activeStep >= 0 ? activeStep : hoverStep, hoverHue);
      const [s2r, s2g, s2b] = resolveTone([lr, lg, lb], activeCustom ?? lastCustom, activeStep >= 0 ? activeStep : lastStep, bgLastEmitHue);
      const satelliteStrength = THREE.MathUtils.clamp(activeStrength * 0.18 + hoverStrength * 0.20 + lastStrength * 0.18, 0, 0.14);
      const noteColorMixFinal = noteInjectionOn
        ? THREE.MathUtils.clamp(
            Math.max(
              (colorMix * 0.54 + 0.02) * (0.42 + 0.56 * notePresence) * (0.90 + 0.10 * localColorLiftUi),
              0.08 + 0.24 * notePresence
            ),
            0,
            0.28
          )
        : 0.0;
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
        noteColorMix: noteColorMixFinal,
        noteColorStrict: 0,
        richness: richnessUi,
        dream: dreamUi,
        emitters: [
          { x: bgDrive.notePos.x, y: bgDrive.notePos.y, r: ar, g: ag, b: ab, s: activeStrength },
          { x: sat1.x, y: sat1.y, r: s1r, g: s1g, b: s1b, s: satelliteStrength },
          { x: sat2.x, y: sat2.y, r: s2r, g: s2g, b: s2b, s: satelliteStrength + lastStrength * 0.18 },
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


  performanceCamera?.apply?.(camera, performanceCameraBaseTarget);
  if (bg) bg.update(0, camera);
  stars.position.copy(camera.position);

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
  dreamGlowPass.uniforms.uResolution.value.set(w, h);
  if (stars?.material?.uniforms?.uBaseSize) {
    const starSizeUi = THREE.MathUtils.clamp(backgroundDockUI?.getStarSize?.() ?? 16, 2, 28);
    stars.material.uniforms.uBaseSize.value = getStarBaseSize(starSizeUi);
  }
});

// -------------------------------------
// Helpers
// -------------------------------------
})().catch((e)=>console.error(e));
