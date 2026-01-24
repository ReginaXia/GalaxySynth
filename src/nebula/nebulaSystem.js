// src/nebula/nebulaSystem.js
import * as THREE from "three";

/**
 * 目标：
 * - 螺旋臂清晰（臂间空隙明显）
 * - 侧面也有体积层次（厚度+轻微翘曲）
 * - 颜色丰富（hsv->rgb 多色染色，可 GUI 调）
 * - 支持：选中某一团 -> 改参数 -> Apply 或 Rebuild
 */

// ----------------------------
// Shaders
// ----------------------------
const nebulaVert = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vTw;
  varying float vAlpha;
  varying float vDepth;
  varying float vSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;

  void main(){
    vColor = color;
    vAlpha = aAlpha;
    vSeed = aSeed;

    float tw = sin(uTime * 1.7 + aSeed * 6.2831);
    vTw = 0.72 + 0.28 * tw;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;

    float invZ = 1.0 / max(0.8, -mv.z);
    float size = aSize * uBaseSize * uPixelRatio * invZ;
    gl_PointSize = clamp(size, 1.0, 220.0);

    gl_Position = projectionMatrix * mv;
  }
`;

const nebulaFrag = `
  uniform sampler2D uMap;
  uniform float uOpacity;

  // 多色控制（GUI 可调）
  uniform float uRainbowMix; // 0~1
  uniform float uHueScale;   // 0~0.05

  varying vec3 vColor;
  varying float vTw;
  varying float vAlpha;
  varying float vDepth;
  varying float vSeed;

  vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main(){
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * uOpacity * vAlpha;

    float glow = mix(0.85, 1.25, vTw);
    vec3 col = vColor * glow;

    // ✅ 多色：seed + 深度微扰（同一团里也会彩）
    float hue = fract(vSeed * 0.618 + vDepth * uHueScale);
    vec3 rainbow = hsv2rgb(vec3(hue, 0.55, 1.0));
    col = mix(col, col * rainbow, uRainbowMix);

    // 轻微软光
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

  // 5 团分布（你要 5 个）
  const defs = [
    { id: "A_pad",     center: new THREE.Vector3(-4.2, planeY + 0.05,  1.6), radius: 1.55, rotSpeed:  0.06,  colorA: "#ff77d7", colorB: "#b6a7ff" },
    { id: "B_bell",    center: new THREE.Vector3( 4.0, planeY + 0.10,  1.2), radius: 1.25, rotSpeed: -0.08,  colorA: "#7fe7ff", colorB: "#b9a7ff" },
    { id: "C_pluck",   center: new THREE.Vector3(-3.6, planeY - 0.05, -2.6), radius: 1.45, rotSpeed:  0.05,  colorA: "#9ff3ff", colorB: "#ff8fe6" },
    { id: "D_sparkle", center: new THREE.Vector3( 3.5, planeY - 0.05, -3.1), radius: 1.65, rotSpeed: -0.045, colorA: "#ffd27a", colorB: "#ff72d8" },
    { id: "E_air",     center: new THREE.Vector3( 1.2, planeY + 0.06,  2.9), radius: 1.30, rotSpeed:  0.035, colorA: "#c7b6ff", colorB: "#7fe7ff" },
  ];

  const clusters = [];
  const pickables = [];

  // 选中态（给 GUI/点击用）
  let activeId = defs[0]?.id ?? "";

  for (const d of defs) {
    const group = new THREE.Group();
    group.position.copy(d.center);

    // 每团一份 preset（可被 GUI 修改）
    const preset = makeDefaultPresetForDef(d);

    // build layers
    const { outer, core, armStars } = buildClusterLayers({ preset, starTexture });

    // 标记可点击
    outer.userData.galaxyId = d.id;
    core.userData.galaxyId = d.id;
    armStars.userData.galaxyId = d.id;

    outer.position.set(0, 0.00, 0);
    core.position.set(0, 0.03, 0);
    armStars.position.set(0, 0.06, 0);

    group.add(outer);
    group.add(core);
    group.add(armStars);
    root.add(group);

    const cluster = {
      id: d.id,
      group,
      center: d.center.clone(),
      radius: d.radius,
      rotSpeed: d.rotSpeed,

      preset,          // 当前参数
      outer,
      core,
      armStars,

      // 用于吸引扰动回弹
      outerBase: outer.geometry.attributes.position.array.slice(),
      coreBase: core.geometry.attributes.position.array.slice(),
      armBase: armStars.geometry.attributes.position.array.slice(),

      influence: 0,
    };

    clusters.push(cluster);
    pickables.push(outer, core, armStars);
  }

  function setActive(id) {
    const found = clusters.find(c => c.id === id);
    if (found) activeId = id;
  }
  function getActive() {
    return clusters.find(c => c.id === activeId) ?? clusters[0];
  }
  function getActiveId() {
    return activeId;
  }

  // 只改 uniform（亮度/大小/彩度）
  function applyPreset(id, patch) {
    const c = clusters.find(x => x.id === id);
    if (!c) return;

    Object.assign(c.preset, patch);

    // uniforms
    applyUniformsToLayer(c.outer, c.preset.outer);
    applyUniformsToLayer(c.core, c.preset.core);
    applyUniformsToLayer(c.armStars, c.preset.stars);
  }

  // 改形状参数 -> 重建几何
  function rebuildFromPreset(id, patch) {
    const c = clusters.find(x => x.id === id);
    if (!c) return;

    Object.assign(c.preset, patch);

    // dispose old
    safeDisposePoints(c.outer);
    safeDisposePoints(c.core);
    safeDisposePoints(c.armStars);

    // remove from group
    c.group.remove(c.outer, c.core, c.armStars);

    // rebuild
    const built = buildClusterLayers({ preset: c.preset, starTexture });
    c.outer = built.outer;
    c.core = built.core;
    c.armStars = built.armStars;

    // re-tag pickable + id
    c.outer.userData.galaxyId = c.id;
    c.core.userData.galaxyId = c.id;
    c.armStars.userData.galaxyId = c.id;

    c.outer.position.set(0, 0.00, 0);
    c.core.position.set(0, 0.03, 0);
    c.armStars.position.set(0, 0.06, 0);

    c.group.add(c.outer, c.core, c.armStars);

    // refresh base arrays for attraction
    c.outerBase = c.outer.geometry.attributes.position.array.slice();
    c.coreBase = c.core.geometry.attributes.position.array.slice();
    c.armBase = c.armStars.geometry.attributes.position.array.slice();

    // refresh pickables list (简单做法：重新生成一次全量 pickables)
    pickables.length = 0;
    for (const cc of clusters) pickables.push(cc.outer, cc.core, cc.armStars);
  }

  function update(worldPoint, t) {
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

      // ✅ ShaderMaterial 亮度：改 uniform，不是 material.opacity
      const o = c.outer.material.uniforms.uOpacity;
      const k = c.core.material.uniforms.uOpacity;

      // “靠近更亮”
      o.value = lerp(c.preset.outer.opacityBase, c.preset.outer.opacityNear, inflOuter);
      k.value = lerp(c.preset.core.opacityBase, c.preset.core.opacityNear, inflCore);
    }
  }

  // 初始化 active
  setActive(activeId);
  // 初次把 uniform 设到 preset
  for (const c of clusters) applyPreset(c.id, {});

  return {
    root,
    clusters,
    pickables,
    update,

    // selection
    setActive,
    getActive,
    getActiveId,

    // editing
    applyPreset,
    rebuildFromPreset,
  };
}

// ----------------------------
// Cluster preset
// ----------------------------
function makeDefaultPresetForDef(d) {
  // 你后面 GUI 改的主要就是这些
  return {
    // 形状（重建）
    arms: 3,
    twistOuter: 10.8,
    twistCore: 12.5,
    twistStars: 11.6,

    tightnessOuter: 0.55,
    tightnessCore: 0.35,
    tightnessStars: 0.22,

    thicknessOuter: 0.42,
    thicknessCore: 0.28,
    thicknessStars: 0.20,

    interArmDensityOuter: 0.14,
    interArmDensityCore: 0.10,
    interArmDensityStars: 0.06,

    armWidthInnerOuter: 0.12,
    armWidthOuterOuter: 0.055,
    armPowerOuter: 2.0,

    armWidthInnerCore: 0.11,
    armWidthOuterCore: 0.040,
    armPowerCore: 2.4,

    armWidthInnerStars: 0.09,
    armWidthOuterStars: 0.030,
    armPowerStars: 2.8,

    thicknessOuterKeepOuter: 0.35,
    thicknessOuterKeepCore: 0.42,
    thicknessOuterKeepStars: 0.50,

    warpStrengthOuter: 0.10,
    warpStrengthCore: 0.08,
    warpStrengthStars: 0.06,

    // 外观（uniform）
    rainbowMix: 0.45,
    hueScale: 0.015,

    outer: {
      colorA: d.colorA,
      colorB: d.colorB,
      count: 14000,
      spreadMul: 1.10,
      sizeMin: 0.35,
      sizeMax: 1.8,
      baseSize: 18,
      opacityBase: 0.55,
      opacityNear: 0.95,
    },
    core: {
      colorA: d.colorB,
      colorB: "#fff1fb",
      count: 9000,
      spreadMul: 0.55,
      sizeMin: 0.28,
      sizeMax: 1.2,
      baseSize: 14,
      opacityBase: 0.45,
      opacityNear: 0.95,
    },
    stars: {
      colorA: "#ffffff",
      colorB: d.colorA,
      count: 900,
      spreadMul: 1.05,
      sizeMin: 1.6,
      sizeMax: 4.6,
      baseSize: 24,
      opacityBase: 1.0,
      opacityNear: 1.0,
      starLayer: true,
    },
  };
}

function buildClusterLayers({ preset, starTexture }) {
  // 外层
  const outer = makeNebulaPoints({
    count: preset.outer.count,
    spread: preset.outer.spreadMul,
    thickness: preset.thicknessOuter,
    colorA: preset.outer.colorA,
    colorB: preset.outer.colorB,
    sizeMin: preset.outer.sizeMin,
    sizeMax: preset.outer.sizeMax,
    alpha: preset.outer.opacityBase,
    map: starTexture || __dotTex,

    arms: preset.arms,
    twist: preset.twistOuter,
    tightness: preset.tightnessOuter,
    edgeFade: 2.2,
    clumpiness: 0.18,

    interArmDensity: preset.interArmDensityOuter,
    armWidthInner: preset.armWidthInnerOuter,
    armWidthOuter: preset.armWidthOuterOuter,
    armPower: preset.armPowerOuter,

    thicknessOuterKeep: preset.thicknessOuterKeepOuter,
    warpStrength: preset.warpStrengthOuter,

    rainbowMix: preset.rainbowMix,
    hueScale: preset.hueScale,
    baseSize: preset.outer.baseSize,
  });

  // 核心
  const core = makeNebulaPoints({
    count: preset.core.count,
    spread: preset.core.spreadMul,
    thickness: preset.thicknessCore,
    colorA: preset.core.colorA,
    colorB: preset.core.colorB,
    sizeMin: preset.core.sizeMin,
    sizeMax: preset.core.sizeMax,
    alpha: preset.core.opacityBase,
    map: starTexture || __dotTex,

    arms: preset.arms,
    twist: preset.twistCore,
    tightness: preset.tightnessCore,
    edgeFade: 1.2,
    clumpiness: 0.22,

    interArmDensity: preset.interArmDensityCore,
    armWidthInner: preset.armWidthInnerCore,
    armWidthOuter: preset.armWidthOuterCore,
    armPower: preset.armPowerCore,

    thicknessOuterKeep: preset.thicknessOuterKeepCore,
    warpStrength: preset.warpStrengthCore,

    rainbowMix: preset.rainbowMix,
    hueScale: preset.hueScale,
    baseSize: preset.core.baseSize,
  });

  // 亮星
  const armStars = makeNebulaPoints({
    count: preset.stars.count,
    spread: preset.stars.spreadMul,
    thickness: preset.thicknessStars,
    colorA: preset.stars.colorA,
    colorB: preset.stars.colorB,
    sizeMin: preset.stars.sizeMin,
    sizeMax: preset.stars.sizeMax,
    alpha: preset.stars.opacityBase,
    map: starTexture || __dotTex,

    arms: preset.arms,
    twist: preset.twistStars,
    tightness: preset.tightnessStars,
    edgeFade: 1.35,
    clumpiness: 0.10,

    interArmDensity: preset.interArmDensityStars,
    armWidthInner: preset.armWidthInnerStars,
    armWidthOuter: preset.armWidthOuterStars,
    armPower: preset.armPowerStars,

    thicknessOuterKeep: preset.thicknessOuterKeepStars,
    warpStrength: preset.warpStrengthStars,

    starLayer: true,

    rainbowMix: preset.rainbowMix,
    hueScale: preset.hueScale,
    baseSize: preset.stars.baseSize,
  });

  return { outer, core, armStars };
}

function applyUniformsToLayer(points, layerPreset) {
  const u = points.material.uniforms;
  if (u.uBaseSize) u.uBaseSize.value = layerPreset.baseSize ?? u.uBaseSize.value;
  if (u.uRainbowMix) u.uRainbowMix.value = layerPreset.rainbowMix ?? u.uRainbowMix.value;
  if (u.uHueScale) u.uHueScale.value = layerPreset.hueScale ?? u.uHueScale.value;
  // uOpacity 由 update 动态控制（base/near），这里不强行覆盖
}

function safeDisposePoints(points) {
  if (!points) return;
  if (points.geometry) points.geometry.dispose();
  if (points.material) points.material.dispose();
}

// ----------------------------
// Generate spiral nebula points
// spread: 这里传的是 “mul”，最后会乘 cluster.radius（在调用处处理）
// ----------------------------
function makeNebulaPoints({
  count,
  spread,          // 这里是 spreadMul
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

  // arm clarity
  interArmDensity = 0.06,
  armWidthInner = 0.12,
  armWidthOuter = 0.05,
  armPower = 2.0,

  // thickness / warp
  thicknessOuterKeep = 0.35,
  warpStrength = 0.10,

  // view look
  rainbowMix = 0.45,
  hueScale = 0.015,
  baseSize = 18,

  starLayer = false,
}) {
  const geo = new THREE.BufferGeometry();

  // spreadMul -> 实际 spread 在外面传进来前已经乘了 radius，这里直接用
  // 但为了兼容你之前的调用方式，这里假设 spread 是“实际 spread”
  const spreadActual = spread;

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

    const u = Math.random();
    const r01 = Math.pow(u, starLayer ? 0.65 : 0.52);
    const r = r01 * spreadActual;

    const armId = Math.floor(Math.random() * arms);
    const armBase = (armId / arms) * Math.PI * 2.0;

    const spiralA = armBase + r01 * twist;

    const armJitterMax = tightness * (0.25 + r01 * 1.35);
    const armJitter = (Math.random() - 0.5) * armJitterMax;

    const coreNoise = (1.0 - r01) * (Math.random() - 0.5) * 0.35;
    const a = spiralA + armJitter + coreNoise;

    const ex = 1.0;
    const ez = 0.75;

    const edgeScatter = (0.04 + r01 * (starLayer ? 0.22 : 0.34));
    const jitterX = (Math.random() - 0.5) * edgeScatter;
    const jitterZ = (Math.random() - 0.5) * edgeScatter;

    const clump = (Math.random() < clumpiness) ? (Math.random() - 0.5) * 0.30 : 0.0;

    const x = Math.cos(a) * r * ex + jitterX + clump;
    const z = Math.sin(a) * r * ez + jitterZ - clump;

    const thicknessFactor = thicknessOuterKeep + (1.0 - thicknessOuterKeep) * (1.0 - r01);
    const warpAmp = warpStrength * thickness;
    const warp = Math.sin(a * 1.7 + r01 * 6.0) * warpAmp;

    const y = (Math.random() - 0.5) * thickness * thicknessFactor + warp;

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    // base color
    c.copy(cB).lerp(cA, clamp01(r01));
    if (!starLayer && Math.random() < 0.012) c.lerp(new THREE.Color("#ffffff"), 0.55);

    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    // size
    if (starLayer) {
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

    const radial = Math.pow(1.0 - r01, starLayer ? 0.18 : 0.25);
    const edgeFog = Math.exp(-r01 * edgeFade);

    const jNorm = armJitter / Math.max(1e-4, armJitterMax);
    const sigma = armWidthInner + (armWidthOuter - armWidthInner) * r01;

    let armMask = Math.exp(-(jNorm * jNorm) / (2.0 * sigma * sigma));
    armMask = Math.pow(armMask, armPower);

    const armGate = interArmDensity + (1.0 - interArmDensity) * armMask;

    let aPoint = radial * edgeFog * armGate;
    if (starLayer) aPoint *= 1.2;
    if (Math.random() < 0.010) aPoint *= 1.25;

    alphas[i] = clamp(aPoint, 0.02, 1.0);

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
      uMap:        { value: map || __dotTex },
      uOpacity:    { value: alpha },
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBaseSize:   { value: baseSize },

      // 多色
      uRainbowMix: { value: rainbowMix },
      uHueScale:   { value: hueScale },
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
