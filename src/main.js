// src/main.js
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { initAudioOnFirstGesture, triggerOnMove } from "./audio.js";
import { createNebulaSystem } from "./nebula/nebulaSystem.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import streakVert from "./shaders/streak.vert.glsl?raw";
import streakFrag from "./shaders/streak.frag.glsl?raw";

console.log("MAIN JS LOADED");

// -------------------------------------
// Renderer
// -------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// 更“干净利落”的对比（别太仙雾）
// 你想更锐更亮：把 exposure 往上加一点点（1.05~1.2）
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

document.body.appendChild(renderer.domElement);

// -------------------------------------
// Scene / Camera
// -------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // ✅ 黑底

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 2000);

// 不是纯俯视：更像“俯冲观察”，滚轮推近会更像进入星云
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

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength：亮点有光晕
  0.65, // radius：柔
  0.22  // threshold：只让“亮星/亮边”触发，避免整团泛白
);
composer.addPass(bloom);

// -------------------------------------
// Raycast plane (y = 0)
// -------------------------------------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.0);
const hitPoint = new THREE.Vector3();

// 鼠标 NDC
const pointer = new THREE.Vector2(0, 0);
window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

// -------------------------------------
// Audio: must start on gesture
// -------------------------------------
window.addEventListener(
  "pointerdown",
  async () => {
    await initAudioOnFirstGesture();
  },
  { once: true }
);

// -------------------------------------
// Nebula system (5 clusters)
// -------------------------------------
const nebulaSystem = createNebulaSystem({
  scene,
  radiusWorld: 7.0,
  planeY: 0.0,
  starTexture, // ✅ 传进去：点会更“闪亮+细腻”
});

// 拖拽旋转整个星云世界（可选）
// 你想“360旋转看俯视角”就是这个
let isDragging = false;
let lastX = 0;
let lastY = 0;

window.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("pointerup", () => (isDragging = false));
window.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  nebulaSystem.root.rotation.y += dx * 0.005;
  nebulaSystem.root.rotation.x += dy * 0.005;

  // 防止翻过头（你也可以删掉这两行，完全自由旋转）
  nebulaSystem.root.rotation.x = THREE.MathUtils.clamp(nebulaSystem.root.rotation.x, -1.25, 1.25);
});

// -------------------------------------
// Zoom into nebula (wheel)
// - 滚轮会改变相机距离
// - 同时让相机更倾向于看向鼠标击中的点（更像“进入星云内部”）
// -------------------------------------
let camDist = camera.position.length();
camDist = THREE.MathUtils.clamp(camDist, 2.2, 30);

const lookTarget = new THREE.Vector3(0, 0, 0);
const lookTargetSmooth = new THREE.Vector3(0, 0, 0);

window.addEventListener(
  "wheel",
  (e) => {
    // 向上滚（deltaY>0）拉远；向下滚推近
    const delta = Math.sign(e.deltaY);
    camDist *= delta > 0 ? 1.08 : 0.92;
    camDist = THREE.MathUtils.clamp(camDist, 2.2, 30);
  },
  { passive: true }
);

// -------------------------------------
// Stars + Streak (your previous galaxy vibe)
// -------------------------------------
const stars = makeStars({ count: 65000, radius: 7.0, thickness: 1.6 });
scene.add(stars);

const streak = makeStreak();
scene.add(streak);

// -------------------------------------
// Mouse move intensity (for audio trigger)
// -------------------------------------
let lastPX = 0, lastPY = 0;
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

function tick() {
  const t = clock.getElapsedTime();

  // raycast -> hitPoint（✅ 鼠标扰动对齐关键）
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(plane, hitPoint);

  // look target：平时偏向 origin，缩放/靠近时更偏向鼠标点
  lookTarget.copy(hitPoint);

  // 让 lookTarget 不要抖：平滑一下
  lookTargetSmooth.lerp(lookTarget, 0.08);

  // 相机沿当前方向保持距离（更像 dolly）
  const dir = camera.position.clone().normalize();
  camera.position.copy(dir.multiplyScalar(camDist));
  camera.lookAt(lookTargetSmooth);

  // 更新星尘
  stars.material.uniforms.uTime.value = t;
  stars.material.uniforms.uPointer.value.copy(pointer);

  // 更新流光
  streak.material.uniforms.uTime.value = t;
  streak.material.uniforms.uPointer.value.copy(pointer);

  // ✅ 星云扰动：只调用一次，用 hitPoint
  nebulaSystem.update(hitPoint, t);

  // audio trigger：移动强度 + 当前最大 influence
  let maxInfl = 0;
  for (const c of nebulaSystem.clusters) maxInfl = Math.max(maxInfl, c.influence || 0);
  triggerOnMove(move01, maxInfl);
  move01 *= 0.9;

  composer.render();
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
  bloom.setSize(w, h);
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

    // 粉紫 -> 蓝紫 -> 青（保留你之前的 vibe）
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

function makeStreak() {
  const pts = [];
  const len = 120;
  for (let i = 0; i < len; i++) {
    const tt = i / (len - 1);
    const x = THREE.MathUtils.lerp(-4.2, 4.2, tt);
    const y = Math.sin(tt * Math.PI * 1.1) * 0.45;
    const z = Math.cos(tt * Math.PI * 0.9) * 0.6;
    pts.push(new THREE.Vector3(x, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 240, 0.02, 10, false);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: streakVert,
    fragmentShader: streakFrag,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
