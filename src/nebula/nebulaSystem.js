// src/nebula/nebulaSystem.js
import * as THREE from "three";

/**
 * 目标：
 * - 5 个星云团：螺旋臂清晰
 * - 三段色彩（中心/中间/边缘）
 * - 粒子细腻：大量小点 + 少量亮点
 * - 边缘渐隐，不泛白
 * - 鼠标扰动：用 world hitPoint（main.js 传进来）精准对齐
 */

// ----------------------------
// Shaders (soft dot + twinkle)
// ----------------------------
const nebulaVert = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vTw;
  varying float vAlpha;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;

  void main(){
    vColor = color;
    vAlpha = aAlpha;

    float tw = sin(uTime * 1.7 + aSeed * 6.2831);
    vTw = 0.78 + 0.22 * tw;  // 更克制，避免全团爆白

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    float invZ = 1.0 / max(0.9, -mv.z);
    float size = aSize * uBaseSize * uPixelRatio * invZ;

    gl_PointSize = clamp(size, 1.0, 140.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const nebulaFrag = `
  uniform sampler2D uMap;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vTw;
  varying float vAlpha;

  void main(){
    vec4 tex = texture2D(uMap, gl_PointCoord);

    float a = tex.a * uOpacity * vAlpha;

    float glow = mix(0.90, 1.35, vTw);
    vec3 col = vColor * glow;

    // 很轻微的额外光晕
    col += vColor * (tex.a * 0.10);

    gl_FragColor = vec4(col, a);
  }
`;

// ----------------------------
// Soft dot texture
// ----------------------------
let __dotTex = null;

function makeSoftDotTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1.0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1.0, "rgba(255,255,255,0.0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ----------------------------
// Public
// ----------------------------
export function createNebulaSystem({
  scene,
  radiusWorld = 7.0,
  planeY = 0.0,
  starTexture, // optional
}) {
  if (!__dotTex) __dotTex = makeSoftDotTexture();

  const root = new THREE.Group();
  scene.add(root);

  const clusters = [];

  // 5 团：每团给 center/mid/edge 三段色
  const defs = [
    {
      id: "A_pad",
      center: new THREE.Vector3(-4.2, planeY + 0.05, 1.6),
      radius: 1.55,
      rotSpeed: 0.06,
      centerColor: "#fff1ff",
      midColor: "#c7a6ff",
      edgeColor: "#ff4fc8",
    },
    {
      id: "B_bell",
      center: new THREE.Vector3(4.0, planeY + 0.10, 1.2),
      radius: 1.25,
      rotSpeed: -0.08,
      centerColor: "#f6ffff",
      midColor: "#a9d8ff",
      edgeColor: "#72f0ff",
    },
    {
      id: "C_pluck",
      center: new THREE.Vector3(-3.6, planeY - 0.05, -2.6),
      radius: 1.45,
      rotSpeed: 0.05,
      centerColor: "#ffffff",
      midColor: "#ffd3f2",
      edgeColor: "#ff6fd8",
    },
    {
      id: "D_sparkle",
      center: new THREE.Vector3(3.5, planeY - 0.05, -3.1),
      radius: 1.65,
      rotSpeed: -0.045,
      centerColor: "#ffffff",
      midColor: "#ffe2a6",
      edgeColor: "#ff7bd7",
    },
    {
      id: "E_air",
      center: new THREE.Vector3(1.2, planeY + 0.06, 2.9),
      radius: 1.30,
      rotSpeed: 0.035,
      centerColor: "#ffffff",
      midColor: "#c7b6ff",
      edgeColor: "#7fe7ff",
    },
  ];

  const mapTex = starTexture || __dotTex;

  for (const d of defs) {
    const group = new THREE.Group();
    group.position.copy(d.center);

    // 外层雾：更广 + 更淡（边缘渐隐）
    const outer = makeNebulaPoints({
      count: 15000,
      spread: d.radius * 1.18,
      thickness: 0.42,
      centerColor: d.centerColor,
      midColor: d.midColor,
      edgeColor: d.edgeColor,
      sizeMin: 0.18,
      sizeMax: 1.10,
      alpha: 0.16,
      map: mapTex,
      arms: 3,
      twist: 12.0,
      tightness: 0.60,
      edgeFade: 2.2,
      clumpiness: 0.16,
      armContrast: 0.80,
    });

    // 内核：更亮但克制（别爆白）
    const core = makeNebulaPoints({
      count: 9500,
      spread: d.radius * 0.58,
      thickness: 0.28,
      centerColor: d.centerColor,
      midColor: d.midColor,
      edgeColor: d.edgeColor,
      sizeMin: 0.16,
      sizeMax: 0.85,
      alpha: 0.15,
      map: mapTex,
      arms: 3,
      twist: 13.2,
      tightness: 0.34,
      edgeFade: 1.25,
      clumpiness: 0.22,
      armContrast: 0.95,
    });

    // 亮星点缀（少量更大、更闪）
    const armStars = makeNebulaPoints({
      count: 850,
      spread: d.radius * 1.08,
      thickness: 0.20,
      centerColor: "#ffffff",
      midColor: d.midColor,
      edgeColor: d.edgeColor,
      sizeMin: 1.2,
      sizeMax: 3.2,
      alpha: 0.45,
      map: mapTex,
      arms: 3,
      twist: 12.4,
      tightness: 0.22,
      edgeFade: 1.4,
      clumpiness: 0.10,
      armContrast: 1.0,
      starLayer: true,
    });

    outer.position.set(0, 0.00, 0);
    core.position.set(0, 0.03, 0);
    armStars.position.set(0, 0.06, 0);

    group.add(outer);
    group.add(core);
    group.add(armStars);

    root.add(group);

    clusters.push({
      id: d.id,
      group,
      center: d.center.clone(),
      radius: d.radius,
      rotSpeed: d.rotSpeed,
      outer,
      core,
      armStars,
      outerBase: outer.geometry.attributes.position.array.slice(),
      coreBase: core.geometry.attributes.position.array.slice(),
      armBase: armStars.geometry.attributes.position.array.slice(),
      influence: 0,
    });
  }

  function update(worldPoint, t) {
    const pWorld = worldPoint;

    for (const c of clusters) {
      c.group.rotation.y = t * c.rotSpeed;

      // ✅ 别忘了更新 shader time（否则 twinkle 不会动）
      c.outer.material.uniforms.uTime.value = t;
      c.core.material.uniforms.uTime.value = t;
      c.armStars.material.uniforms.uTime.value = t;

      const dist = pWorld.distanceTo(c.center);
      const infl = smoothstep(c.radius * 1.35, c.radius * 0.25, dist);
      c.influence = infl;

      const inflOuter = Math.pow(infl, 1.0);
      const inflCore = Math.pow(infl, 2.0);

      const pLocal = c.group.worldToLocal(pWorld.clone());

      applyAttraction({
        points: c.outer,
        basePositions: c.outerBase,
        targetLocal: pLocal,
        strength: 0.22 * inflOuter,
        swirl: 0.40 * inflOuter,
        t,
      });

      applyAttraction({
        points: c.core,
        basePositions: c.coreBase,
        targetLocal: pLocal,
        strength: 0.10 * inflCore,
        swirl: 0.26 * inflCore,
        t: t + 13.7,
      });

      // 亮星更轻微扰动（否则会乱飞）
      applyAttraction({
        points: c.armStars,
        basePositions: c.armBase,
        targetLocal: pLocal,
        strength: 0.06 * inflOuter,
        swirl: 0.18 * inflOuter,
        t: t + 7.3,
      });

      // 透明度：靠近更明显，但不过曝
      c.outer.material.uniforms.uOpacity.value = lerp(0.10, 0.20, inflOuter);
      c.core.material.uniforms.uOpacity.value = lerp(0.10, 0.18, inflCore);
      c.armStars.material.uniforms.uOpacity.value = lerp(0.28, 0.50, inflOuter);
    }
  }

  return { clusters, update, root };
}

// ----------------------------
// Spiral generator (3-color)
// ----------------------------
function makeNebulaPoints({
  count,
  spread,
  thickness,
  centerColor,
  midColor,
  edgeColor,
  sizeMin,
  sizeMax,
  alpha,
  map,
  arms = 3,
  twist = 12.0,
  tightness = 0.35,
  edgeFade = 1.6,
  clumpiness = 0.18,
  armContrast = 0.8,
  starLayer = false,
}) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const alphas = new Float32Array(count);

  const cCenter = new THREE.Color(centerColor);
  const cMid = new THREE.Color(midColor);
  const cEdge = new THREE.Color(edgeColor);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    seeds[i] = Math.random();

    // 半径：中心更密，starLayer 稍偏外
    const u = Math.random();
    const r01 = Math.pow(u, starLayer ? 0.68 : 0.52);
    const r = r01 * spread;

    // 选臂
    const armId = Math.floor(Math.random() * arms);
    const armBase = (armId / arms) * Math.PI * 2.0;

    // 螺旋角：r 越大越转
    const spiralA = armBase + r01 * twist;

    // 贴臂程度
    const armJitter = (Math.random() - 0.5) * tightness * (0.25 + r01 * 1.35);
    const coreNoise = (1.0 - r01) * (Math.random() - 0.5) * 0.35;
    const a = spiralA + armJitter + coreNoise;

    // 椭圆盘
    const ex = 1.0;
    const ez = 0.76;

    // 外圈散射
    const edgeScatter = 0.03 + r01 * (starLayer ? 0.18 : 0.30);
    const jitterX = (Math.random() - 0.5) * edgeScatter;
    const jitterZ = (Math.random() - 0.5) * edgeScatter;

    // 团簇感（少量）
    const clump = Math.random() < clumpiness ? (Math.random() - 0.5) * 0.26 : 0.0;

    const x = Math.cos(a) * r * ex + jitterX + clump;
    const z = Math.sin(a) * r * ez + jitterZ - clump;

    // 厚度：中心厚外侧薄
    const y = (Math.random() - 0.5) * thickness * (1.0 - r01 * 0.90);

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    // ✅ 三段色（中心 -> 中间 -> 边缘）
    if (r01 < 0.5) {
      c.copy(cCenter).lerp(cMid, r01 / 0.5);
    } else {
      c.copy(cMid).lerp(cEdge, (r01 - 0.5) / 0.5);
    }

    // 少量白星尘点缀（别太多，不然又发白）
    if (!starLayer && Math.random() < 0.008) c.lerp(new THREE.Color("#ffffff"), 0.45);

    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    // ✅ 粒径：大量细点 + 少量亮点
    if (starLayer) {
      const big = Math.random() < (0.20 * (1.0 - r01) + 0.06);
      sizes[i] = big
        ? sizeMin + (sizeMax - sizeMin) * (0.70 + Math.random() * 0.55)
        : sizeMin + Math.pow(Math.random(), 2.3) * (sizeMax - sizeMin) * 0.45;
    } else {
      const bigChance = (1.0 - r01) * 0.04 + 0.006;
      sizes[i] =
        Math.random() < bigChance
          ? sizeMin + (sizeMax - sizeMin) * (0.55 + Math.random() * 0.55)
          : sizeMin + Math.pow(Math.random(), 3.6) * (sizeMax - sizeMin) * 0.38;
    }

    // ✅ per-point alpha：中心亮，边缘渐隐 + 旋臂更清晰
    const radial = Math.pow(1.0 - r01, starLayer ? 0.18 : 0.26);
    const edgeFog = Math.exp(-r01 * edgeFade);

    // 旋臂 mask：越靠近臂（armJitter 越小）越不透明
    const armMask = Math.exp(-Math.pow(armJitter / 0.18, 2.0));
    let aPoint = radial * edgeFog * (0.35 + armContrast * armMask);

    if (starLayer) aPoint *= 1.25;
    if (Math.random() < 0.008) aPoint *= 1.20;

    alphas[i] = clamp(aPoint, 0.02, 1.0);

    // 边缘稍压暗（避免外圈发白）
    const fade = Math.pow(1.0 - r01, 0.30) * Math.exp(-r01 * (edgeFade * 0.75));
    colors[idx3 + 0] *= 0.60 + 0.60 * fade;
    colors[idx3 + 1] *= 0.60 + 0.60 * fade;
    colors[idx3 + 2] *= 0.60 + 0.60 * fade;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uMap: { value: map || __dotTex },
      uOpacity: { value: alpha },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      // ✅ 更细腻：调小一点
      uBaseSize: { value: starLayer ? 9.0 : 6.8 },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ----------------------------
// Interaction: attraction + swirl
// ----------------------------
function applyAttraction({ points, basePositions, targetLocal, strength, swirl, t }) {
  const posAttr = points.geometry.attributes.position;
  const arr = posAttr.array;

  if (strength < 0.0005) {
    relaxToBase(arr, basePositions, 0.06);
    posAttr.needsUpdate = true;
    return;
  }

  const R = 1.25;

  for (let i = 0; i < arr.length; i += 3) {
    const bx = basePositions[i + 0];
    const by = basePositions[i + 1];
    const bz = basePositions[i + 2];

    let x = arr[i + 0];
    let y = arr[i + 1];
    let z = arr[i + 2];

    // 回弹
    x = lerp(x, bx, 0.04);
    y = lerp(y, by, 0.04);
    z = lerp(z, bz, 0.04);

    const dx = targetLocal.x - bx;
    const dz = targetLocal.z - bz;
    const d = Math.sqrt(dx * dx + dz * dz);

    const w = smoothstep(R, 0.0, d);

    if (w > 0.0001) {
      x += dx * strength * w;
      z += dz * strength * w;

      // swirl
      const ang = Math.atan2(dz, dx);
      const ss = Math.sin(ang + t * 1.1);
      const cc = Math.cos(ang + t * 1.1);
      x += (-dz) * swirl * w * 0.07 * cc;
      z += (dx) * swirl * w * 0.07 * ss;

      y += 0.045 * w * Math.sin(t * 1.8 + bx * 1.3 + bz * 1.1);
    }

    arr[i + 0] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }

  posAttr.needsUpdate = true;
}

// ----------------------------
// Utils
// ----------------------------
function relaxToBase(arr, base, k) {
  for (let i = 0; i < arr.length; i++) arr[i] = lerp(arr[i], base[i], k);
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
