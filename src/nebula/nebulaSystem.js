// src/nebula/nebulaSystem.js
import * as THREE from "three";

/* ========= Shaders (same as before, kept compatible) ========= */

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
    vBaseColor = color;
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

  uniform vec3  uPal0;
  uniform vec3  uPal1;
  uniform vec3  uPal2;
  uniform vec3  uPal3;
  uniform float uPalCount;
  uniform float uColorMode;
  uniform float uColorStrength;
  uniform float uColorNoise;
  uniform float uHueJitter;
  uniform float uRainbowMix;
  uniform float uHueScale;

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
    float n = clamp(uPalCount, 2.0, 4.0);
    float x = clamp(t, 0.0, 1.0) * (n - 1.0);

    if (n < 2.5){
      return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
    } else if (n < 3.5){
      if (x < 1.0) return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
      return mix(uPal1, uPal2, smoothstep(0.0, 1.0, x - 1.0));
    } else {
      if (x < 1.0) return mix(uPal0, uPal1, smoothstep(0.0, 1.0, x));
      if (x < 2.0) return mix(uPal1, uPal2, smoothstep(0.0, 1.0, x - 1.0));
      return mix(uPal2, uPal3, smoothstep(0.0, 1.0, x - 2.0));
    }
  }

  vec3 applyHueJitter(vec3 rgb, float seed){
    float j = (hash12(vec2(seed, vR01 * 13.7)) - 0.5) * uHueJitter;
    vec3 add = hsv2rgb(vec3(fract(seed * 1.7 + j), 0.35, 1.0));
    return mix(rgb, rgb * add, 0.15 * uHueJitter);
  }

  void main(){
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * uOpacity * vAlpha;

    float lum = dot(vBaseColor, vec3(0.3333));
    lum = clamp(lum, 0.0, 1.0);

    vec3 palCol;

    if (uColorMode < 0.5){
      float t = pow(vR01, 0.85);
      palCol = paletteLerp(t);
    } else if (uColorMode < 1.5){
      palCol = paletteLerp(pow(vR01, 0.55));
    } else {
      float n = hash12(vec2(vSeed * 19.7, vR01 * 9.1));
      float t = mix(pow(vR01, 0.9), n, clamp(uColorNoise, 0.0, 1.0));
      palCol = paletteLerp(t);
    }

    palCol = applyHueJitter(palCol, vSeed);

    if (uRainbowMix > 0.001){
      float h = fract(vSeed * 1.7 + vR01 * (6.0 * uHueScale) + hash12(vec2(vR01, vSeed)) * 0.15);
      vec3 rain = hsv2rgb(vec3(h, 0.75, 1.0));
      palCol = mix(palCol, palCol * rain, uRainbowMix);
    }

    vec3 base = mix(vec3(lum), vBaseColor, 0.35);
    vec3 col  = mix(base, palCol * (0.35 + 0.9 * lum), clamp(uColorStrength, 0.0, 2.0));

    float glow = mix(0.85, 1.25, vTw);
    col *= glow;

    col += palCol * (tex.a * 0.10);

    gl_FragColor = vec4(col, a);
  }
`;

/* ========= Texture ========= */

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

/* ========= Public API ========= */

export function createNebulaSystem({ scene, planeY = 0.0, starTexture }) {
  if (!__dotTex) __dotTex = makeSoftDotTexture();

  const root = new THREE.Group();
  scene.add(root);

  const clusters = [];
  let activeId = null;

  // 供 picking 用
  const pickables = [];

  const attractionUI = {
    outerStrength: 0.018,
    coreStrength: 0.016,
    starsStrength: 0.018,
    radius: 1.55,
  };

  function setActive(id) {
    activeId = id;
  }
  function getActiveId() {
    return activeId ?? clusters[0]?.id;
  }

  function addCluster({ id, x = 0, y = planeY, z = 0, scale = 1, preset }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(scale);

    const c = {
      id: id ?? `G_${Math.random().toString(16).slice(2, 8)}`,
      group,
      center: new THREE.Vector3(x, y, z),
      rotSpeed: preset?.rotSpeed ?? (Math.random() * 0.12 - 0.06),
      preset: normalizePreset(preset),
      outer: null,
      core: null,
      armStars: null,
      influence: 0,
    };

    buildLayers(c, starTexture || __dotTex);
    root.add(group);
    clusters.push(c);

    // set active default
    if (!activeId) activeId = c.id;

    // update pickables
    refreshPickables();

    return c.id;
  }

  function removeCluster(id) {
    const idx = clusters.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const c = clusters[idx];
    root.remove(c.group);
    disposeCluster(c);
    clusters.splice(idx, 1);
    refreshPickables();
    if (activeId === id) activeId = clusters[0]?.id ?? null;
  }

  function setClusterTransform(id, { x, y, z, scale }) {
    const c = clusters.find((k) => k.id === id);
    if (!c) return;
    if (typeof x === "number") c.group.position.x = x;
    if (typeof y === "number") c.group.position.y = y;
    if (typeof z === "number") c.group.position.z = z;
    if (typeof scale === "number") c.group.scale.setScalar(scale);
    c.center.set(c.group.position.x, c.group.position.y, c.group.position.z);
  }

  function rebuildCluster(id, newPartialPreset) {
    const c = clusters.find((k) => k.id === id);
    if (!c) return;
    c.preset = normalizePreset({ ...c.preset, ...newPartialPreset });
    // 重建几何（arms/gap/length/sizeScale 会影响 positions）
    // palette/opacity/size 会在 buildLayers 里生效
    rebuildLayers(c, starTexture || __dotTex);
    refreshPickables();
  }

  function setClusterPalette(id, palettePatch) {
    const c = clusters.find((k) => k.id === id);
    if (!c) return;
    c.preset.palette = { ...c.preset.palette, ...palettePatch };
    applyPaletteUniforms(c.outer.material, c.preset.palette);
    applyPaletteUniforms(c.core.material, c.preset.palette);
    applyPaletteUniforms(c.armStars.material, c.preset.palette);
  }

  function getCluster(id) {
    return clusters.find((c) => c.id === id);
  }

  function refreshPickables() {
    pickables.length = 0;
    for (const c of clusters) {
      [c.outer, c.core, c.armStars].forEach((o) => {
        if (!o) return;
        o.userData.galaxyId = c.id;
        pickables.push(o);
      });
    }
  }

  function update(worldPoint, t) {
    const pWorld = worldPoint;

    for (const c of clusters) {
      c.group.rotation.y = t * c.rotSpeed;

      const dist = pWorld.distanceTo(c.center);
      const infl = smoothstep(c.preset.shape.influenceOuter, c.preset.shape.influenceInner, dist);
      c.influence = infl;

      const inflOuter = Math.pow(infl, 1.0);
      const inflCore = Math.pow(infl, 2.0);

      const pLocal = c.group.worldToLocal(pWorld.clone());

      applyAttraction({
        points: c.outer,
        basePositions: c.outer.userData.basePositions,
        targetLocal: pLocal,
        strength: attractionUI.outerStrength * inflOuter,
        swirl: 0.3 * inflOuter,
        radius: attractionUI.radius,
        t,
      });

      applyAttraction({
        points: c.core,
        basePositions: c.core.userData.basePositions,
        targetLocal: pLocal,
        strength: attractionUI.outerStrength * inflCore,
        swirl: 0.22 * inflCore,
        radius: attractionUI.radius,
        t: t + 13.7,
      });

      // NEW: starbase / armStars 也跟着被搓动
      applyAttraction({
        points: c.armStars,
        basePositions: c.armStars.userData.basePositions,
        targetLocal: pLocal,
        strength: attractionUI.outerStrength * inflOuter, // 比 outer/core 略大一点，更显眼
        swirl: 0.28 * inflOuter,
        radius: attractionUI.radius,
        t: t + 7.3,
      });

      // opacity 本身也可被 GUI 改，所以这里只做轻微增强，不强行覆盖
      c.outer.material.uniforms.uTime.value = t;
      c.core.material.uniforms.uTime.value = t;
      c.armStars.material.uniforms.uTime.value = t;
    }
  }

  // ------------------ default 5 clusters (keep your vibe) ------------------
  const defaults = [
    {
      id: "A_pad",
      x: -4.2,
      y: planeY + 0.05,
      z: 1.6,
      scale: 1,
      preset: {
        shape: { sizeScale: 1.0, length: 1.0, arms: 3, gap: 0.14 },
        palette: {
          count: 4,
          c0: "#ffffff",
          c1: "#ffd1f2",
          c2: "#ff77d7",
          c3: "#6aa7ff",
          mode: 0,
          strength: 1.15,
          noise: 0.35,
          hueJitter: 0.35,
          rainbowMix: 0.10,
          hueScale: 0.015,
        },
      },
    },
    {
      id: "B_bell",
      x: 4.0,
      y: planeY + 0.10,
      z: 1.2,
      scale: 1,
      preset: {
        shape: { sizeScale: 0.85, length: 0.95, arms: 2, gap: 0.18 },
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
    },
    {
      id: "C_pluck",
      x: -3.6,
      y: planeY - 0.05,
      z: -2.6,
      scale: 1,
      preset: {
        shape: { sizeScale: 1.05, length: 1.05, arms: 4, gap: 0.10 },
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
    },
    {
      id: "D_sparkle",
      x: 3.5,
      y: planeY - 0.05,
      z: -3.1,
      scale: 1,
      preset: {
        shape: { sizeScale: 1.10, length: 1.15, arms: 3, gap: 0.12 },
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
    },
    {
      id: "E_air",
      x: 1.2,
      y: planeY + 0.06,
      z: 2.9,
      scale: 1,
      preset: {
        shape: { sizeScale: 0.90, length: 0.95, arms: 5, gap: 0.08 },
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
    },
  ];

  defaults.forEach((d) => addCluster(d));

  return {
    root,
    clusters,
    pickables,

    setActive,
    getActiveId,
    getCluster,

    addCluster,
    removeCluster,
    setClusterTransform,
    rebuildCluster,
    setClusterPalette,

    update,
    planeY,

    attractionUI,
  };
}

/* ========= Build / Rebuild ========= */

function buildLayers(c, map) {
  const p = c.preset;

  const group = c.group;

  const baseRadius = 1.45 * p.shape.sizeScale;
  const length = p.shape.length; // 0.5~2.0
  const spreadOuter = baseRadius * 1.10 * length;
  const spreadCore = baseRadius * 0.55 * length;
  const spreadStars = baseRadius * 1.05 * length;

  const outer = makeNebulaPoints({
    count: 14000,
    spread: spreadOuter,
    thickness: 0.42,
    colorA: "#ffffff",
    colorB: "#cfcfff",
    sizeMin: 0.35,
    sizeMax: 1.8,
    alpha: p.layers.outer.opacity,
    map,
    shape: p.shape,
    starLayer: false,
    palette: p.palette,
    baseSize: p.layers.outer.size,
  });

  const core = makeNebulaPoints({
    count: 9000,
    spread: spreadCore,
    thickness: 0.28,
    colorA: "#ffffff",
    colorB: "#ffffff",
    sizeMin: 0.28,
    sizeMax: 1.2,
    alpha: p.layers.core.opacity,
    map,
    shape: { ...p.shape, gap: p.shape.gap * 0.8 }, // core 更紧一点
    starLayer: false,
    palette: p.palette,
    baseSize: p.layers.core.size,
  });

  const armStars = makeNebulaPoints({
    count: 900,
    spread: spreadStars,
    thickness: 0.20,
    colorA: "#ffffff",
    colorB: "#ffffff",
    sizeMin: 1.6,
    sizeMax: 4.6,
    alpha: p.layers.stars.opacity,
    map,
    shape: { ...p.shape, gap: p.shape.gap * 0.7 },
    starLayer: true,
    palette: p.palette,
    baseSize: p.layers.stars.size,
  });

  outer.position.set(0, 0.00, 0);
  core.position.set(0, 0.03, 0);
  armStars.position.set(0, 0.06, 0);

  group.add(outer);
  group.add(core);
  group.add(armStars);

  c.outer = outer;
  c.core = core;
  c.armStars = armStars;
}

function rebuildLayers(c, map) {
  // remove old
  if (c.outer) c.group.remove(c.outer);
  if (c.core) c.group.remove(c.core);
  if (c.armStars) c.group.remove(c.armStars);
  disposePoints(c.outer);
  disposePoints(c.core);
  disposePoints(c.armStars);

  c.outer = c.core = c.armStars = null;
  buildLayers(c, map);
}

function disposePoints(p) {
  if (!p) return;
  p.geometry?.dispose?.();
  p.material?.dispose?.();
}

function disposeCluster(c) {
  disposePoints(c.outer);
  disposePoints(c.core);
  disposePoints(c.armStars);
}

/* ========= Preset Normalize ========= */

function normalizePreset(preset = {}) {
  const shape = preset.shape ?? {};
  const palette = preset.palette ?? {};
  const layers = preset.layers ?? {};

  return {
    rotSpeed: preset.rotSpeed ?? (Math.random() * 0.12 - 0.06),

    shape: {
      arms: clamp(shape.arms ?? 3, 1, 7),
      // gap: 臂间空隙感（越大臂越“分开”，侧面也更容易看清）
      gap: clamp(shape.gap ?? 0.14, 0.0, 0.35),

      // length: 控制臂伸展/盘面“长不长”
      length: clamp(shape.length ?? 1.0, 0.5, 2.2),

      // sizeScale: 整体星云“盘面大小”
      sizeScale: clamp(shape.sizeScale ?? 1.0, 0.35, 2.5),

      // mouse influence range
      influenceInner: shape.influenceInner ?? 0.35,
      influenceOuter: shape.influenceOuter ?? 2.1,
    },

    palette: {
      count: clamp(palette.count ?? 4, 2, 4),
      c0: palette.c0 ?? "#ffffff",
      c1: palette.c1 ?? "#ffd1f2",
      c2: palette.c2 ?? "#ff77d7",
      c3: palette.c3 ?? "#6aa7ff",
      mode: palette.mode ?? 0, // default RADIAL
      strength: palette.strength ?? 1.15,
      noise: palette.noise ?? 0.35,
      hueJitter: palette.hueJitter ?? 0.35,
      rainbowMix: palette.rainbowMix ?? 0.10,
      hueScale: palette.hueScale ?? 0.015,
    },

    layers: {
      outer: { opacity: layers.outer?.opacity ?? 0.22, size: layers.outer?.size ?? 9.0 },
      core: { opacity: layers.core?.opacity ?? 0.18, size: layers.core?.size ?? 9.0 },
      stars: { opacity: layers.stars?.opacity ?? 0.50, size: layers.stars?.size ?? 12.0 },
    },
  };
}

/* ========= Geometry generator (shape controls) ========= */

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

  shape,
  starLayer,
  palette,
  baseSize,
}) {
  const arms = shape.arms;
  const gap = shape.gap;

  // 让 arms 视觉更像“摄影螺旋”：twist 随半径变化更明显
  const twist = lerp(8.5, 15.5, clamp01(shape.length - 0.5)); // length 越大 twist 越大
  const tightness = lerp(0.70, 0.40, clamp01(shape.length - 0.5)); // 长臂更松一些
  const edgeFade = starLayer ? 1.35 : 2.0;
  const clumpiness = starLayer ? 0.10 : 0.18;
  const armContrast = starLayer ? 1.0 : 0.75;

  const geo = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const alphas = new Float32Array(count);
  const r01s = new Float32Array(count);

  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const c = new THREE.Color();

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

    // gap：臂间空隙——核心是把“臂中心线附近更密”，离开臂中心线更稀
    // 这里用 armJitter 的尺度跟 gap 相关：gap 越大 -> jitter 越小 -> 臂更细更清晰，臂间更空
    const jitterScale = lerp(0.26, 0.10, clamp01(gap / 0.35));
    const armJitter = (Math.random() - 0.5) * tightness * jitterScale * (0.25 + r01 * 1.35);

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

    c.copy(cB).lerp(cA, clamp01(r01));
    const fade = Math.pow(1.0 - r01, 0.30) * Math.exp(-r01 * (edgeFade * 0.75));
    colors[idx3 + 0] = c.r * (0.55 + 0.65 * fade);
    colors[idx3 + 1] = c.g * (0.55 + 0.65 * fade);
    colors[idx3 + 2] = c.b * (0.55 + 0.65 * fade);

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

    // 让 gap 影响臂对比：gap 越大，臂中心更强，臂间更弱 -> 更像“摄影旋臂”
    const armMask = Math.exp(-Math.pow(armJitter / (0.18 * (1.0 - 0.7 * gap)), 2.0));
    const radial = Math.pow(1.0 - r01, starLayer ? 0.18 : 0.25);
    const edgeFog = Math.exp(-r01 * edgeFade);

    let aPoint = radial * edgeFog * (0.30 + armContrast * armMask);
    aPoint *= lerp(0.92, 1.08, gap / 0.35);

    alphas[i] = clamp(aPoint, 0.02, 1.0);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geo.setAttribute("aR01", new THREE.BufferAttribute(r01s, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: alpha },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uBaseSize: { value: baseSize },

      uPal0: { value: new THREE.Color(palette?.c0 ?? "#ffffff") },
      uPal1: { value: new THREE.Color(palette?.c1 ?? "#ff77d7") },
      uPal2: { value: new THREE.Color(palette?.c2 ?? "#7fe7ff") },
      uPal3: { value: new THREE.Color(palette?.c3 ?? "#b6a7ff") },
      uPalCount: { value: palette?.count ?? 4 },
      uColorMode: { value: palette?.mode ?? 0 },
      uColorStrength: { value: palette?.strength ?? 1.1 },
      uColorNoise: { value: palette?.noise ?? 0.30 },
      uHueJitter: { value: palette?.hueJitter ?? 0.30 },
      uRainbowMix: { value: palette?.rainbowMix ?? 0.08 },
      uHueScale: { value: palette?.hueScale ?? 0.012 },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
  });

  mat.alphaTest = 0.01;

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;

  // 保存 basePositions 给鼠标扰动回弹用
  pts.userData.basePositions = geo.attributes.position.array.slice();

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

/* ========= Mouse attraction (same) ========= */

function applyAttraction({ points, basePositions, targetLocal, strength, swirl, radius, t }) {
  const posAttr = points.geometry.attributes.position;
  const arr = posAttr.array;

  if (strength < 0.0005) {
    relaxToBase(arr, basePositions, 0.06);
    posAttr.needsUpdate = true;
    return;
  }

  //扰动力度
  // const R = attractionUI.radius;

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
    const w = smoothstep(radius, 0.0, d);

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

function relaxToBase(arr, base, k) {
  for (let i = 0; i < arr.length; i++) arr[i] = lerp(arr[i], base[i], k);
}

/* ========= Utils ========= */

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
