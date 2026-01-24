// src/main.js
import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { setupGalaxyGUI } from "./ui/galaxyGui.js";
import { setupMeteorGUI } from "./ui/meteorGui.js";

import { initAudioOnFirstGesture, triggerOnMove } from "./audio.js";
import { playMeteorSfx } from "./audio/meteorSfx.js";

import { createNebulaSystem } from "./nebula/nebulaSystem.js";
import { createMeteorSystem } from "./meteor/meteorSystem.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import meteorVert from "./shaders/meteor.vert.glsl?raw";
import meteorFrag from "./shaders/meteor.frag.glsl?raw";

console.log("MAIN JS LOADED");

// -------------------------------------
// Renderer
// -------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
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

const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.65, 0.22);
composer.addPass(bloom);

// -------------------------------------
// Raycast plane (y = 0)
// -------------------------------------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.0);
const hitPoint = new THREE.Vector3();

// 鼠标 NDC（用于星空）
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
console.log("meteor mesh", meteorSystem.mesh, meteorSystem.mesh.material);
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

function tick() {
  const t = clock.getElapsedTime();

  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(plane, hitPoint);

  const hitClamped = hitPoint.clone();
  const len = hitClamped.length();
  if (len > HIT_CLAMP_RADIUS) hitClamped.multiplyScalar(HIT_CLAMP_RADIUS / len);

  lookTarget.lerpVectors(new THREE.Vector3(0, 0, 0), hitClamped, LOOK_MIX);
  lookTargetSmooth.lerp(lookTarget, LOOK_SMOOTH);

  camera.lookAt(0, 0, 0);

  // stars
  stars.material.uniforms.uTime.value = t;
  stars.material.uniforms.uPointer.value.copy(pointer);

  // nebula
  nebulaSystem.update(hitPoint, t);

  // meteor
  meteorSystem.update(t);

  // audio trigger
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
