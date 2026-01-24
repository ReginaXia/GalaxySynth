// src/nebula/nebulaSystem.js
import * as THREE from "three";

/**
 * ✅ 新增：Palette 调色板系统（每团 2~4 色）
 * ✅ 新增：颜色模式
 *   - 0: RADIAL（默认：中心->外圈渐变）
 *   - 1: LAYER（预留：按层级分配颜色）
 *   - 2: PATCH（随机色块/云团）
 * ✅ 保留：twinkle / additive / per-point alpha / 螺旋生成逻辑
 */

// ----------------------------
// Shaders
// ----------------------------
const nebulaVert = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aAlpha;
  attribute float aR01;

  varying vec3 vBaseColor;
  varying float vTw;
  varying float vAlpha;
  varying float vR01;
  varying float vSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;

  void main(){
    vBaseColor = color;     // 仍然保留：用于亮度/质感细节
    vAlpha = aAlpha;
    vR01 = aR01;
    vSeed = aSeed;

    float tw = sin(uTime * 1.7 + aSeed * 6.2831);
    vTw = 0.72 + 0.28 * tw;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    float invZ = 1.0 / max(0.8, -mv.z);
    float size = aSize * uBaseSize * uPixelRatio * invZ;
    gl_PointSize = clamp(size, 1.0, 220.0);

    gl_Position = projectionMatrix * mv;
  }
`;

const nebulaFrag = `
  precision mediump float;

  uniform sampler2D uMap;
  uniform float uOpacity;

  // 颜色系统（每层/每团都可以不同）
  uniform vec3  uPal0;
  uniform vec3  uPal1;
  uniform vec3  uPal2;
  uniform vec3  uPal3;
  uniform float uPalCount;      // 2~4
  uniform float uColorMode;     // 0 RADIAL / 1 LAYER / 2 PATCH
  uniform float uColorStrength; // 0~2
  uniform float uColorNoise;    // 0~1
  uniform float uHueJitter;     // 0~1 (轻微色相扰动)
  uniform float uRainbowMix;    // 0~1 (现在建议当“辅料”，默认小)
  uniform float uHueScale;      // 0~0.05

  varying vec3 vBaseColor;
  varying float vTw;
  varying float vAlpha;
  varying float vR01;
  varying float vSeed;

  float hash12(vec2 p){
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  vec3 hsv2rgb(vec3 c){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec3 paletteLerp(float t){
    // t: 0~1
    float n = clamp(uPalCount, 2.0, 4.0);
    float x = clamp(t, 0.0, 1.0) * (n - 1.0);

    // 为了 WebGL1 更稳：不用动态数组索引，手写分段
    if (n < 2.5){
      // 2 colors
      return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
    } else if (n < 3.5){
      // 3 colors
      if (x < 1.0) return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
      return mix(uPal1, uPal2, smoothstep(0.0, 1.0, x - 1.0));
    } else {
      // 4 colors
      if (x < 1.0) return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
      if (x < 2.0) return mix(uPal1, uPal2, smoothstep(0.0, 1.0, x - 1.0));
      return mix(uPal2, uPal3, smoothstep(0.0, 1.0, x - 2.0));
    }
  }

  vec3 applyHueJitter(vec3 rgb, float seed){
    // 아주轻微：避免“纯渐变太平”
    float j = (hash12(vec2(seed, vR01 * 13.7)) - 0.5) * uHueJitter;
    // rgb->hsv 近似处理：用彩虹噪声当做额外色偏
    vec3 add = hsv2rgb(vec3(fract(seed * 1.7 + j), 0.35, 1.0));
    return mix(rgb, rgb * add, 0.15 * uHueJitter);
  }

  void main(){
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * uOpacity * vAlpha;

    // 基础亮度质感：来源于 vBaseColor（你原本生成时给的颜色/暗角）
    float lum = dot(vBaseColor, vec3(0.3333));
    lum = clamp(lum, 0.0, 1.0);

    // ---- 颜色模式 ----
    vec3 palCol;

    if (uColorMode < 0.5){
      // 0 RADIAL: core->outer
      // 让中心更“干净明亮”，外圈更“丰富”
      float t = pow(vR01, 0.85);
      palCol = paletteLerp(t);
    } else if (uColorMode < 1.5){
      // 1 LAYER: 预留（这里先简单做成更偏向中心色）
      palCol = paletteLerp(pow(vR01, 0.55));
    } else {
      // 2 PATCH: 随机色块云团（空间上断续变化）
      float n = hash12(vec2(vSeed * 19.7, vR01 * 9.1));
      // n 控制颜色段，同时保留一点 radial 趋势
      float t = mix(pow(vR01, 0.9), n, clamp(uColorNoise, 0.0, 1.0));
      palCol = paletteLerp(t);
    }

    // 轻微色相扰动，让色带更像“云气”而不是渐变条
    palCol = applyHueJitter(palCol, vSeed);

    // 可选：rainbow 辅助（建议很小）
    if (uRainbowMix > 0.001){
      float h = fract(vSeed * 1.7 + vR01 * (6.0 * uHueScale) + hash12(vec2(vR01, vSeed)) * 0.15);
      vec3 rain = hsv2rgb(vec3(h, 0.75, 1.0));
      palCol = mix(palCol, palCol * rain, uRainbowMix);
    }

    // ---- 合成最终颜色 ----
    // 让 palette 负责“色相”，vBaseColor 负责“明暗结构/细节”
    vec3 base = mix(vec3(lum), vBaseColor, 0.35); // 保留你原本的层次
    vec3 col  = mix(base, palCol * (0.35 + 0.9 * lum), clamp(uColorStrength, 0.0, 2.0));

    // twinkle glow（保留你原来的）
    float glow = mix(0.85, 1.25, vTw);
    col *= glow;

    // 轻微“点中心亮”幻觉
    col += palCol * (tex.a * 0.10);

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
export function createNebulaSystem({ scene, radiusWorld = 7.0, planeY = 0.0, starTexture }) {
  if (!__dotTex) __dotTex = makeSoftDotTexture();

  const root = new THREE.Group();
  scene.add(root);

  const clusters = [];

  // 5 团分布（你要 5 个）
  const defs = [
    {
      id: "A_pad",
      center: new THREE.Vector3(-4.2, planeY + 0.05, 1.6),
      radius: 1.55,
      rotSpeed: 0.06,
      palette: {
        // ✅ Radial 默认：中心->外圈 (2~4 色)
        count: 4,
        c0: "#ffffff", // core
        c1: "#ffd1f2",
        c2: "#ff77d7",
        c3: "#6aa7ff",
        mode: 0, // RADIAL
        strength: 1.15,
        noise: 0.35,  // 用于 PATCH 时更明显，RADIAL 下也会产生轻微云气变化
        hueJitter: 0.35,
        rainbowMix: 0.10,
        hueScale: 0.015,
      },
    },
    {
      id: "B_bell",
      center: new THREE.Vector3(4.0, planeY + 0.10, 1.2),
      radius: 1.25,
      rotSpeed: -0.08,
      palette: {
        count: 4,
        c0: "#ffffff",
        c1: "#d9f7ff",
        c2: "#7fe7ff",
        c3: "#b9a7ff",
        mode: 0,
        strength: 1.10,
        noise: 0.30,
        hueJitter: 0.30,
        rainbowMix: 0.08,
        hueScale: 0.012,
      },
    },
    {
      id: "C_pluck",
      center: new THREE.Vector3(-3.6, planeY - 0.05, -2.6),
      radius: 1.45,
      rotSpeed: 0.05,
      palette: {
        count: 4,
        c0: "#ffffff",
        c1: "#c9f8ff",
        c2: "#9ff3ff",
        c3: "#ff8fe6",
        mode: 0,
        strength: 1.20,
        noise: 0.35,
        hueJitter: 0.35,
        rainbowMix: 0.10,
        hueScale: 0.014,
      },
    },
    {
      id: "D_sparkle",
      center: new THREE.Vector3(3.5, planeY - 0.05, -3.1),
      radius: 1.65,
      rotSpeed: -0.045,
      palette: {
        count: 4,
        c0: "#ffffff",
        c1: "#fff1c8",
        c2: "#ffd27a",
        c3: "#ff72d8",
        mode: 0,
        strength: 1.10,
        noise: 0.28,
        hueJitter: 0.28,
        rainbowMix: 0.08,
        hueScale: 0.012,
      },
    },
    {
      id: "E_air",
      center: new THREE.Vector3(1.2, planeY + 0.06, 2.9),
      radius: 1.30,
      rotSpeed: 0.035,
      palette: {
        count: 4,
        c0: "#ffffff",
        c1: "#efe6ff",
        c2: "#c7b6ff",
        c3: "#7fe7ff",
        mode: 0,
        strength: 1.10,
        noise: 0.32,
        hueJitter: 0.30,
        rainbowMix: 0.08,
        hueScale: 0.012,
      },
    },
  ];

  for (const d of defs) {
    const group = new THREE.Group();
    group.position.copy(d.center);

    // 外层：薄、广、渐隐
    const outer = makeNebulaPoints({
      count: 14000,
      spread: d.radius * 1.10,
      thickness: 0.42,
      // 这两个颜色现在主要用于“亮度结构”，不是最终配色
      colorA: "#ffffff",
      colorB: "#cfcfff",
      sizeMin: 0.35,
      sizeMax: 1.8,
      alpha: 0.22,
      map: starTexture || __dotTex,

      // spiral params
      arms: 3,
      twist: 10.8,
      tightness: 0.55,
      edgeFade: 2.2,
      clumpiness: 0.18,
      armContrast: 0.65,

      // palette
      palette: d.palette,
    });

    // 内核：更亮
    const core = makeNebulaPoints({
      count: 9000,
      spread: d.radius * 0.55,
      thickness: 0.28,
      colorA: "#ffffff",
      colorB: "#ffffff",
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

      palette: d.palette,
    });

    // 亮星点缀
    const armStars = makeNebulaPoints({
      count: 900,
      spread: d.radius * 1.05,
      thickness: 0.20,
      colorA: "#ffffff",
      colorB: "#ffffff",
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

      starLayer: true,
      palette: d.palette,
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
      palette: { ...d.palette },
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

      // 更新时间（保证 twinkle）
      c.outer.material.uniforms.uTime.value = t;
      c.core.material.uniforms.uTime.value = t;
      c.armStars.material.uniforms.uTime.value = t;
    }
  }

  // 暴露一个小工具：给外部 GUI 调 palette（可选用）
  function setClusterPalette(id, palette) {
    const c = clusters.find((x) => x.id === id);
    if (!c) return;

    c.palette = { ...c.palette, ...palette };
    applyPaletteUniforms(c.outer.material, c.palette);
    applyPaletteUniforms(c.core.material, c.palette);
    applyPaletteUniforms(c.armStars.material, c.palette);
  }

  return { clusters, update, root, setClusterPalette };
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

  // palette
  palette,
}) {
  const geo = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const seeds     = new Float32Array(count);
  const alphas    = new Float32Array(count);
  const r01s      = new Float32Array(count);

  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const c  = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;
    seeds[i] = Math.random();

    const u = Math.random();
    const r01 = Math.pow(u, starLayer ? 0.65 : 0.52);
    const r = r01 * spread;
    r01s[i] = r01;

    const armId = Math.floor(Math.random() * arms);
    const armBase = (armId / arms) * Math.PI * 2.0;
    const spiralA = armBase + r01 * twist;

    const armJitter = (Math.random() - 0.5) * tightness * (0.25 + r01 * 1.35);
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
    const y = (Math.random() - 0.5) * thickness * (1.0 - r01 * 0.90);

    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    // 颜色：现在主要用于“明暗结构”，最终色相由 palette 控制
    c.copy(cB).lerp(cA, clamp01(r01));
    if (!starLayer && Math.random() < 0.012) c.lerp(new THREE.Color("#ffffff"), 0.55);

    // 暗角/边缘压暗，避免外圈发白（很重要）
    const fade = Math.pow(1.0 - r01, 0.30) * Math.exp(-r01 * (edgeFade * 0.75));
    colors[idx3 + 0] = c.r * (0.55 + 0.65 * fade);
    colors[idx3 + 1] = c.g * (0.55 + 0.65 * fade);
    colors[idx3 + 2] = c.b * (0.55 + 0.65 * fade);

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

    // alpha: core brighter, edge fade + arm mask
    const radial = Math.pow(1.0 - r01, starLayer ? 0.18 : 0.25);
    const edgeFog = Math.exp(-r01 * edgeFade);
    const armMask = Math.exp(-Math.pow(armJitter / 0.20, 2.0));
    let aPoint = radial * edgeFog * (0.40 + armContrast * armMask);

    if (starLayer) aPoint *= 1.2;
    if (Math.random() < 0.010) aPoint *= 1.25;

    alphas[i] = clamp(aPoint, 0.02, 1.0);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed",    new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAlpha",   new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute("aR01",     new THREE.BufferAttribute(r01s, 1));

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
      uBaseSize:   { value: starLayer ? 12.0 : 9.0 },

      // palette uniforms
      uPal0: { value: new THREE.Color(palette?.c0 ?? "#ffffff") },
      uPal1: { value: new THREE.Color(palette?.c1 ?? "#ff77d7") },
      uPal2: { value: new THREE.Color(palette?.c2 ?? "#7fe7ff") },
      uPal3: { value: new THREE.Color(palette?.c3 ?? "#b6a7ff") },
      uPalCount:      { value: palette?.count ?? 4 },
      uColorMode:     { value: palette?.mode ?? 0 }, // ✅ default RADIAL
      uColorStrength: { value: palette?.strength ?? 1.1 },
      uColorNoise:    { value: palette?.noise ?? 0.30 },
      uHueJitter:     { value: palette?.hueJitter ?? 0.30 },
      uRainbowMix:    { value: palette?.rainbowMix ?? 0.08 },
      uHueScale:      { value: palette?.hueScale ?? 0.012 },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
  });

  mat.alphaTest = 0.01;

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function applyPaletteUniforms(mat, palette) {
  if (!mat?.uniforms) return;
  mat.uniforms.uPal0.value.set(palette.c0 ?? "#ffffff");
  mat.uniforms.uPal1.value.set(palette.c1 ?? "#ff77d7");
  mat.uniforms.uPal2.value.set(palette.c2 ?? "#7fe7ff");
  mat.uniforms.uPal3.value.set(palette.c3 ?? "#b6a7ff");
  mat.uniforms.uPalCount.value = clamp(palette.count ?? 4, 2, 4);
  mat.uniforms.uColorMode.value = palette.mode ?? 0;
  mat.uniforms.uColorStrength.value = palette.strength ?? 1.1;
  mat.uniforms.uColorNoise.value = palette.noise ?? 0.30;
  mat.uniforms.uHueJitter.value = palette.hueJitter ?? 0.30;
  mat.uniforms.uRainbowMix.value = palette.rainbowMix ?? 0.08;
  mat.uniforms.uHueScale.value = palette.hueScale ?? 0.012;
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
