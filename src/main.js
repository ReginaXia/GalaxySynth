import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createGalaxyAudio } from "./audio.js";
import { createNebulaSystem } from "./nebula/nebulaSystem.js";

import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import streakVert from "./shaders/streak.vert.glsl?raw";
import streakFrag from "./shaders/streak.frag.glsl?raw";

console.log("MAIN JS LOADED");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);


const scene = new THREE.Scene();

// 深色非纯黑背景：用大球做渐变（比纯色更“有层次”）
scene.add(makeGradientBackground());

// 相机
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 0);   // 高一点
camera.lookAt(0, 0, 0);
camera.up.set(0, 0, -1);         // 让画面方向更“正”（可选）

// scene.add(camera);

//星云
const nebulaSystem = createNebulaSystem({
  scene,
  radiusWorld: 7.0, // 你银河 radius
  planeY: 0.0,
});

let isDragging = false;
let lastX = 0;
let lastY = 0;

window.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

window.addEventListener("pointerup", () => {
  isDragging = false;
});

window.addEventListener("pointermove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  // 旋转整个星云世界：水平拖动→绕Y转，竖直拖动→绕X转
  nebulaSystem.root.rotation.y += dx * 0.005;
  nebulaSystem.root.rotation.x += dy * 0.005;
});




// ----- Post: Composer + Bloom (Ariana soft) -----
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.01, // strength
  0.90, // radius
  0.35  // threshold
);
composer.addPass(bloom);


// 鼠标交互点（先当作后面摄像头手势的替代输入）
const pointer = new THREE.Vector2(0, 0);
window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

//音频实例
const galaxyAudio = createGalaxyAudio();

// 第一次用户交互后启动音频（浏览器限制必须）
window.addEventListener("pointerdown", async () => {
  await galaxyAudio.start();
}, { once: true });


// // 星尘粒子
// const stars = makeStars({ count: 65000, radius: 7.0, thickness: 1.6 });
// scene.add(stars);

// // 流光（少量但主视觉）
// const streak = makeStreak();
// scene.add(streak);

// 时间
const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();

camera.lookAt(0, 0, 0);

  // 轻微相机漂浮（呼吸感）
//   camera.position.x = Math.sin(t * 0.12) * 0.08;
//   camera.position.y = Math.cos(t * 0.10) * 0.06;
//   camera.lookAt(0, 0, 0);

  // 更新 uniforms
//   stars.material.uniforms.uTime.value = t;
//   stars.material.uniforms.uPointer.value.set(pointer.x, pointer.y);

//   streak.material.uniforms.uTime.value = t;
//   streak.material.uniforms.uPointer.value.set(pointer.x, pointer.y);

  // pointer 从 [-1,1] 映射到 [0,1]
  const x01 = (pointer.x * 0.5 + 0.5);
  const y01 = (pointer.y * 0.5 + 0.5);
  galaxyAudio.setZones({ x01, y01 });

  nebulaSystem.update(pointer, t);

  composer.render();
  requestAnimationFrame(tick);
}
tick();

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
  bloom.setSize(w, h);
});

// ----------------------------
// Helpers
// ----------------------------

function makeGradientBackground() {
  const geo = new THREE.SphereGeometry(60, 32, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      void main(){
        float r = length(vPos.xy) / 60.0;
        vec3 c1 = vec3(0.07, 0.03, 0.12); // deep violet
        vec3 c2 = vec3(0.03, 0.05, 0.14); // indigo
        vec3 c3 = vec3(0.06, 0.04, 0.16); // purple haze
        float a = smoothstep(0.0, 0.9, r);
        vec3 col = mix(c1, c2, a);
        col = mix(col, c3, smoothstep(0.6, 1.0, r));
        float n = hash(gl_FragCoord.xy * 0.35) * 0.04;
        col += n;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

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

    // 颜色：粉紫 -> 蓝紫 -> 青
    const t = Math.min(1, r / radius);
    const cA = new THREE.Color("#ff72d8");
    const cB = new THREE.Color("#b9a7ff");
    const cC = new THREE.Color("#7fe7ff");
    const c = new THREE.Color();
    if (t < 0.5) c.copy(cA).lerp(cB, t / 0.5);
    else c.copy(cB).lerp(cC, (t - 0.5) / 0.5);
    const pearl = new THREE.Color("#fff1fb"); // pearl pink-white
    c.lerp(pearl, (1.0 - t) * 0.22);

    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    sizes[i] = 0.25 + Math.pow(Math.random(), 2.2) * 1.4;
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
    const t = i / (len - 1);
    const x = THREE.MathUtils.lerp(-4.2, 4.2, t);
    const y = Math.sin(t * Math.PI * 1.1) * 0.45;
    const z = Math.cos(t * Math.PI * 0.9) * 0.6;
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
