// src/nebula/nebulaSystem.js
import * as THREE from "three";

/**
 * 目标：
 * - 每团是清晰的螺旋臂（像星系照片）
 * - 粒子大小强不均匀：大量细尘 + 少量亮星
 * - 边缘渐隐（不是整团发白）
 * - 少量炫光/光晕（soft dot + additive）
 */

// ----------------------------
// Shaders (use per-point alpha + twinkle)
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

    // 不规则闪烁（每个点不一样，范围更克制，避免“全白爆”）
    float tw = sin(uTime * 1.7 + aSeed * 6.2831);
    vTw = 0.72 + 0.28 * tw;  // 0.44~1.0 （更柔和）

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    // 透视缩放：越近越大（clamp 避免极端放大）
    float invZ = 1.0 / max(0.8, -mv.z);
    float size = aSize * uBaseSize * uPixelRatio * invZ;
    gl_PointSize = clamp(size, 1.0, 220.0);

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

    // tex.a = soft dot
    float a = tex.a * uOpacity * vAlpha;

    // 轻微发光（别太猛，否则一团白）
    float glow = mix(0.85, 1.25, vTw);
    vec3 col = vColor * glow;

    // 额外一点点“中心亮边”幻觉（很轻）
    col += vColor * (tex.a * 0.10);

    gl_FragColor = vec4(col, a);
  }
`;

// ----------------------------
// texture: soft dot
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

  // 5 团分布（你要 5 个）
  const defs = [
    { id: "A_pad",     center: new THREE.Vector3(-4.2, planeY + 0.05,  1.6), radius: 1.55, rotSpeed:  0.06,  colorA: "#ff77d7", colorB: "#b6a7ff" },
    { id: "B_bell",    center: new THREE.Vector3( 4.0, planeY + 0.10,  1.2), radius: 1.25, rotSpeed: -0.08,  colorA: "#7fe7ff", colorB: "#b9a7ff" },
    { id: "C_pluck",   center: new THREE.Vector3(-3.6, planeY - 0.05, -2.6), radius: 1.45, rotSpeed:  0.05,  colorA: "#9ff3ff", colorB: "#ff8fe6" },
    { id: "D_sparkle", center: new THREE.Vector3( 3.5, planeY - 0.05, -3.1), radius: 1.65, rotSpeed: -0.045, colorA: "#ffd27a", colorB: "#ff72d8" },
    { id: "E_air",     center: new THREE.Vector3( 1.2, planeY + 0.06,  2.9), radius: 1.30, rotSpeed:  0.035, colorA: "#c7b6ff", colorB: "#7fe7ff" },
  ];

  for (const d of defs) {
    const group = new THREE.Group();
    group.position.copy(d.center);

    // 外层：薄、广、渐隐
    const outer = makeNebulaPoints({
      count: 14000,
      spread: d.radius * 1.10,
      thickness: 0.42,
      colorA: d.colorA,
      colorB: d.colorB,
      sizeMin: 0.35,
      sizeMax: 1.8,
      alpha: 0.22,
      map: starTexture || __dotTex,
      // 旋臂强度（外层更“雾”）
      arms: 3,
      twist: 10.8,
      tightness: 0.55,
      edgeFade: 2.2,
      clumpiness: 0.18,
      armContrast: 0.65,
    });

    // 内核：更亮、但别爆白
    const core = makeNebulaPoints({
      count: 9000,
      spread: d.radius * 0.55,
      thickness: 0.28,
      colorA: d.colorB,
      colorB: "#fff1fb",
      sizeMin: 0.28,
      sizeMax: 1.2,
      alpha: 0.18,
      map: starTexture || __dotTex,
      arms: 3,
      twist: 12.5,
      tightness: 0.35,
      edgeFade: 1.2,
      clumpiness: 0.22,
      armContrast: 0.85,
    });

    // 亮星点缀：少量大点，帮助“活”
    const armStars = makeNebulaPoints({
      count: 900,
      spread: d.radius * 1.05,
      thickness: 0.20,
      colorA: "#ffffff",
      colorB: d.colorA,
      sizeMin: 1.6,
      sizeMax: 4.6,
      alpha: 0.50,
      map: starTexture || __dotTex,
      arms: 3,
      twist: 11.6,
      tightness: 0.22,
      edgeFade: 1.35,
      clumpiness: 0.10,
      armContrast: 1.0,
      // 亮星更集中在旋臂上
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

  // function pointerToWorld(pointerNDC) {
  //   return new THREE.Vector3(pointerNDC.x * radiusWorld, planeY, pointerNDC.y * radiusWorld);
  // }

  function update(worldPoint, t) {
  // worldPoint: THREE.Vector3  (已经是射线打到平面的交点)
  const pWorld = worldPoint;

  for (const c of clusters) {
    c.group.rotation.y = t * c.rotSpeed;

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
      strength: 0.01 * inflOuter,
      swirl: 0.35 * inflOuter,
      t,
    });

    applyAttraction({
      points: c.core,
      basePositions: c.coreBase,
      targetLocal: pLocal,
      strength: 0.01 * inflCore,
      swirl: 0.22 * inflCore,
      t: t + 13.7,
    });

    c.outer.material.opacity = lerp(0.20, 0.55, inflOuter);
    c.core.material.opacity = lerp(0.30, 0.70, inflCore);
  }
}

return { clusters, update, root };
}

// ----------------------------
// Generate spiral nebula points
// ----------------------------
function makeNebulaPoints({
  count,
  spread,
  thickness,
  colorA,
  colorB,
  sizeMin,
  sizeMax,
  alpha,
  map,
  // spiral params
  arms = 3,
  twist = 12.0,
  tightness = 0.35,
  edgeFade = 1.6,
  clumpiness = 0.18,
  armContrast = 0.8,
  // star layer tweak
  starLayer = false,
}) {
  const geo = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const seeds     = new Float32Array(count);
  const alphas    = new Float32Array(count);

  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const c  = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    seeds[i] = Math.random();

    // 半径分布：中心更密
    const u = Math.random();
    const r01 = Math.pow(u, starLayer ? 0.65 : 0.52); // starLayer 稍偏外
    const r = r01 * spread;

    // 选臂
    const armId = Math.floor(Math.random() * arms);
    const armBase = (armId / arms) * Math.PI * 2.0;

    // 螺旋角
    const spiralA = armBase + r01 * twist;

    // 贴臂程度（外侧更雾）
    const armJitter = (Math.random() - 0.5) * tightness * (0.25 + r01 * 1.35);

    // 核心扰动
    const coreNoise = (1.0 - r01) * (Math.random() - 0.5) * 0.35;

    const a = spiralA + armJitter + coreNoise;

    // 椭圆盘
    const ex = 1.0;
    const ez = 0.75;

    // 外圈散射
    const edgeScatter = (0.04 + r01 * (starLayer ? 0.22 : 0.34));
    const jitterX = (Math.random() - 0.5) * edgeScatter;
    const jitterZ = (Math.random() - 0.5) * edgeScatter;

    // 团簇感
    const clump = (Math.random() < clumpiness) ? (Math.random() - 0.5) * 0.30 : 0.0;

    const x = Math.cos(a) * r * ex + jitterX + clump;
    const z = Math.sin(a) * r * ez + jitterZ - clump;

    // 厚度：中心厚外侧薄
    const y = (Math.random() - 0.5) * thickness * (1.0 - r01 * 0.90);

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    // 颜色：中心->边缘分层清晰
    // 中心偏 B（亮、珠光），外侧偏 A（彩）
    c.copy(cB).lerp(cA, clamp01(r01));

    // 偶尔加一点白星尘点缀
    if (!starLayer && Math.random() < 0.012) c.lerp(new THREE.Color("#ffffff"), 0.55);
    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    // 大小：大量细点 + 少量亮点（避免“粗”）
    if (starLayer) {
      // 亮星层：更大、更不均匀
      const big = Math.random() < (0.18 * (1.0 - r01) + 0.08);
      sizes[i] = big
        ? sizeMin + (sizeMax - sizeMin) * (0.65 + Math.random() * 0.55)
        : sizeMin + Math.pow(Math.random(), 2.2) * (sizeMax - sizeMin) * 0.55;
    } else {
      const bigChance = (1.0 - r01) * 0.05 + 0.008;
      sizes[i] = (Math.random() < bigChance)
        ? sizeMin + (sizeMax - sizeMin) * (0.55 + Math.random() * 0.55)
        : sizeMin + Math.pow(Math.random(), 3.2) * (sizeMax - sizeMin) * 0.42;
    }

    // ---- per-point alpha：核心更亮，边缘渐隐 ----
    const radial = Math.pow(1.0 - r01, starLayer ? 0.18 : 0.25);
    const edgeFog = Math.exp(-r01 * edgeFade);

    // 旋臂 mask：越靠近旋臂（armJitter 越接近 0）越不透明 → 螺旋更清楚
    const armMask = Math.exp(-Math.pow(armJitter / 0.20, 2.0));
    let aPoint = radial * edgeFog * (0.40 + armContrast * armMask);

    // 亮星点更明显但不爆
    if (starLayer) aPoint *= 1.2;
    if (Math.random() < 0.010) aPoint *= 1.25;

    alphas[i] = clamp(aPoint, 0.02, 1.0);

    // 额外：边缘颜色变暗一点，防止外圈发白
    const fade = Math.pow(1.0 - r01, 0.30) * Math.exp(-r01 * (edgeFade * 0.75));
    colors[idx3 + 0] *= (0.55 + 0.65 * fade);
    colors[idx3 + 1] *= (0.55 + 0.65 * fade);
    colors[idx3 + 2] *= (0.55 + 0.65 * fade);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed",    new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAlpha",   new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uMap:       { value: map || __dotTex },
      uOpacity:   { value: alpha },
      uTime:      { value: 0 },
      uPixelRatio:{ value: Math.min(window.devicePixelRatio, 2) },
      // ✅ 细腻度关键：越小越“细”，越大越“粗+容易白”
      uBaseSize:  { value: starLayer ? 12.0 : 9.0 },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
  });

  mat.alphaTest = 0.01;

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

      // swirl：更柔
      const ang = Math.atan2(dz, dx);
      const ss = Math.sin(ang + t * 1.1);
      const cc = Math.cos(ang + t * 1.1);
      x += (-dz) * swirl * w * 0.08 * cc;
      z += (dx) * swirl * w * 0.08 * ss;

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
