// src/meteor/meteorSystem.js
import * as THREE from "three";

/**
 * Meteor System (Ball + Gas Tail + Trapezoid Ribbon)
 * - Head: glowing sphere
 * - Tail: Points particle pool using /textures/meteor.png
 * - Ribbon: translucent trapezoid ribbon behind head, animated hue flow
 */
export function createMeteorSystem({
  scene,
  camera,
  renderer,
  // keep signature compatible but no longer required:
  streakVert = "",
  streakFrag = "",
  planeY = 0.0,
  onSpawn = null,
}) {
  const root = new THREE.Group();
  scene.add(root);

  // -------------------------
  // Parameters (GUI will mutate these)
  // -------------------------
  const maxMeteors = 24;

  const params = {
    enabled: true,

    maxMeteors,
    spawnRate: 0.35, // per second

    // motion
    speedMin: 4.0,
    speedMax: 9.0,
    lifeMin: 0.7,
    lifeMax: 1.4,

    // look (GUI targets)
    tailLength: 3.2, // "visual length" (maps to tail life)
    headGlow: 3.2, // head brightness multiplier
    spread: 0.85, // tail spread (0..1.2)
    strandCount: 12, // emit density (4..16)

    // extra look
    headSize: 0.09, // sphere radius
    tailSize: 0.18, // base particle size
    tailDrag: 1.7, // how fast tail slows down
    tailWobble: 1.6, // flame-like wobble
    tailGlow: 1.6, // tail color intensity
    baseColor: "#ff4fd8", // default pink

    // -------------------------
    // Ribbon (NEW / Trapezoid)
    // -------------------------
    ribbonEnabled: true,

    ribbonLength: 1.55, // world units behind the head (tail edge distance)
    ribbonWidth: 0.85,  // world units at tail edge width

    // trapezoid head edge (short edge) controls
    ribbonHeadWidthFactor: 0.28, // 0.15~0.45: head edge width = tailWidth * factor
    ribbonHeadCover: 0.06,       // 0.00~0.12: push head edge forward to cover head

    ribbonAlpha: 0.55, // overall alpha
    ribbonGlow: 1.35,  // brightness multiplier

    ribbonHueSpeed: 0.85, // hue animation speed
    ribbonHueRange: 0.16, // hue variation range

    ribbonSoftEdge: 0.12,   // edge softness in UV space
    ribbonTailFadePow: 1.6, // tail fade curve

    // ---- Style Variation (NEW)
    styleTheme: "pink",   // "pink" | "blue" | "purple" | "rainbow"
    styleVariation: 0.45, // 0..1 每颗流星差异程度
    headSizeMul: 0.75,    // 0.4..1.2 头大小乘子（你说现在太大）
    headGlowMul: 0.85,    // 0.4..1.5 头亮度乘子


    // placement
    areaRadius: 7.5,
    planeY,

    // audio
    audioEnabled: false,
    audioGain: 0.7,
    audioCooldown: 0.10,

    // romance/chime/tail macros
    meteorRomance: 0.62,
    meteorChime: 0.58,
    meteorTail: 0.64,
  };

  // -------------------------
  // Meteor state
  // -------------------------
  const meteors = new Array(maxMeteors).fill(0).map(() => ({
    alive: false,
    start: new THREE.Vector3(),
    dir: new THREE.Vector3(1, 0, 0),
    speed: 6,
    birth: 0,
    life: 1,
    seed: Math.random(),
    hue: 0.9,
    side: new THREE.Vector3(1, 0, 0),
    curvePhase: 0,
    curveAmp: 0,
    curveFreq: 1.0,
    head: null,   // mesh
    ribbon: null, // mesh
  }));

  // -------------------------
  // Head meshes (pool)
  // -------------------------
  const headGeo = new THREE.SphereGeometry(1, 12, 12);
  const headMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(params.baseColor),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  for (let i = 0; i < maxMeteors; i++) {
    const m = new THREE.Mesh(headGeo, headMat.clone());
    m.visible = false;
    m.renderOrder = 9998;
    root.add(m);
    meteors[i].head = m;
  }

  // -------------------------
  // Ribbon (trapezoid) shader
  // -------------------------
  const ribbonVert = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const ribbonFrag = /* glsl */ `
    precision highp float;
    precision highp int;

    uniform float uTime;
    uniform float uAlpha;
    uniform float uGlow;

    uniform float uHueSpeed;
    uniform float uHueRange;
    uniform float uHueBase;   // per meteor
    uniform float uSoftEdge;
    uniform float uTailFadePow;

    varying vec2 vUv;

    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
      // Quad UV:
      // x: 0=head edge, 1=tail edge
      // y: 0=one side, 1=other side
      float u = clamp(vUv.x, 0.0, 1.0);
      float v = clamp(vUv.y, 0.0, 1.0);

      // soft edge on both sides of ribbon (along width)
      float e0 = smoothstep(0.0, max(1e-5, uSoftEdge), v);
      float e1 = smoothstep(0.0, max(1e-5, uSoftEdge), 1.0 - v);
      float edge = e0 * e1;

      // tail fade (u -> 1 fades out)
      float tailFade = pow(1.0 - u, max(0.05, uTailFadePow));

      // center spine: thin bright core
      float vc = v - 0.5;
      float center = exp(-pow(abs(vc) / 0.18, 2.0));

      // animated hue flow along length
      float flow = sin(uTime * uHueSpeed + u * 9.0 + uHueBase * 6.2831853) * 0.5 + 0.5;
      float hue = fract(uHueBase + (flow - 0.5) * uHueRange + u * 0.04);

      // neon palette drifting
      vec3 colA = hsv2rgb(vec3(fract(hue + 0.00), 0.70, 1.10));
      vec3 colB = hsv2rgb(vec3(fract(hue + 0.14), 0.85, 1.00));
      vec3 col  = mix(colA, colB, flow);

      float a = edge * tailFade * uAlpha;
      float inten = (0.42 + 0.95 * center) * uGlow;

      gl_FragColor = vec4(col * inten, a);
    }
  `;

  function makeRibbonMesh(initialHueBase = 0.92) {
    const geo = new THREE.BufferGeometry();

    // 4 vertices quad (positions updated each frame)
    const positions = new Float32Array(4 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // UV for quad
    const uvs = new Float32Array([
      0.0, 0.0, // head-left
      0.0, 1.0, // head-right
      1.0, 0.0, // tail-left
      1.0, 1.0, // tail-right
    ]);
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    // indices (two triangles)
    geo.setIndex([0, 2, 1, 2, 3, 1]);

    const mat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,

      // ✅ important: avoid backface culling "invisible ribbon"
      side: THREE.DoubleSide,

      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: params.ribbonAlpha },
        uGlow: { value: params.ribbonGlow },
        uHueSpeed: { value: params.ribbonHueSpeed },
        uHueRange: { value: params.ribbonHueRange },
        uHueBase: { value: initialHueBase },
        uSoftEdge: { value: params.ribbonSoftEdge },
        uTailFadePow: { value: params.ribbonTailFadePow },
      },
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;

    // By default place it behind head & tail; tweak if you want it more "in front"
    mesh.renderOrder = 9996;

    return mesh;
  }

  // Create ribbon per meteor (pool)
  for (let i = 0; i < maxMeteors; i++) {
    const ribbon = makeRibbonMesh(0.92 + (Math.random() - 0.5) * 0.06);
    root.add(ribbon);
    meteors[i].ribbon = ribbon;
  }

  // -------------------------
  // Tail particles (Points pool)
  // -------------------------
  const MAX_P = 6000;
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  const siz = new Float32Array(MAX_P);
  const vel = new Float32Array(MAX_P * 3);
  const birth = new Float32Array(MAX_P);
  const life = new Float32Array(MAX_P);
  const seed = new Float32Array(MAX_P);
  const baseR = new Float32Array(MAX_P);
  const baseG = new Float32Array(MAX_P);
  const baseB = new Float32Array(MAX_P);
  const baseSize = new Float32Array(MAX_P);
  const layerType = new Uint8Array(MAX_P); // 0: core, 1: halo, 2: accent

  // init all dead
  for (let i = 0; i < MAX_P; i++) {
    birth[i] = -9999;
    life[i] = 0;
    seed[i] = Math.random();
    siz[i] = 0;
    col[i * 3 + 0] = 1;
    col[i * 3 + 1] = 0.3;
    col[i * 3 + 2] = 0.85;
    baseR[i] = 1;
    baseG[i] = 0.3;
    baseB[i] = 0.85;
    baseSize[i] = params.tailSize;
    layerType[i] = 0;
  }

  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tailGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tailGeo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));

  const tex = new THREE.TextureLoader().load("/textures/meteor.png");
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const tailMat = new THREE.PointsMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    size: 1.0,
    sizeAttenuation: true,
    opacity: 1.0,
  });

  tailMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("uniform float size;", "uniform float size;\nattribute float aSize;")
      .replace("gl_PointSize = size;", "gl_PointSize = size * aSize;");
    tailMat.userData.shader = shader;
  };

  const tailPoints = new THREE.Points(tailGeo, tailMat);
  tailPoints.frustumCulled = false;
  tailPoints.renderOrder = 9997;
  root.add(tailPoints);

  let pCursor = 0;

  // -------------------------
  // Spawn helpers
  // -------------------------
  let t = 0;
  let lastSpawnT = -999;
  let lastUpdateT = 0;
  let spawnAccum = 0;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomUnit2() {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  }

  function wrap01(x) {
    x = x % 1;
    if (x < 0) x += 1;
    return x;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpHue(a, b, t) {
    let d = b - a;
    if (d > 0.5) d -= 1.0;
    if (d < -0.5) d += 1.0;
    return wrap01(a + d * t);
  }


  function hsv2rgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const tt = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: return [v, tt, p];
      case 1: return [q, v, p];
      case 2: return [p, v, tt];
      case 3: return [p, q, v];
      case 4: return [tt, p, v];
      case 5: return [v, p, q];
      default: return [v, tt, p];
    }
  }

  function spawnMeteor(i, now) {
    const R = params.areaRadius;

    const baseAng =
      rand(-Math.PI * 0.15, Math.PI * 0.15) +
      (Math.random() < 0.5 ? Math.PI * 0.75 : Math.PI * 0.25);

    const dx = Math.cos(baseAng);
    const dz = Math.sin(baseAng);

    const startSide = randomUnit2();
    const sx = startSide.x * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
    const sz = startSide.z * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
    const sy = params.planeY + rand(0.2, 1.5);

    const speed = rand(params.speedMin, params.speedMax);
    const lifeT = rand(params.lifeMin, params.lifeMax);

    const m = meteors[i];
    m.alive = true;
    m.start.set(sx, sy, sz);
    m.dir.set(dx, 0, dz).normalize();
    m.side.set(m.dir.z, 0, -m.dir.x).normalize();
    m.speed = speed;
    m.birth = now;
    m.life = lifeT;
    m.seed = Math.random();

    // -------------------------
    // Per-meteor style randomization
    // -------------------------
    const V = THREE.MathUtils.clamp(params.styleVariation ?? 0.45, 0, 1);

    // base hue by theme
    let baseHue = 0.92; // pink default
    switch (params.styleTheme) {
      case "blue": baseHue = 0.60; break;
      case "purple": baseHue = 0.76; break;
      case "rainbow": baseHue = Math.random(); break;
      case "pink":
      default: baseHue = 0.92; break;
    }

    // hue jitter
    const hueJit = (Math.random() - 0.5) * lerp(0.04, 0.28, V);
    m.hue = wrap01(baseHue + hueJit);

    // head size/brightness variation
    m._headSizeMul = lerp(0.85, 1.15, Math.random()) * (params.headSizeMul ?? 1.0);
    m._headGlowMul = lerp(0.75, 1.25, Math.random()) * (params.headGlowMul ?? 1.0);

    // ribbon flow variation (per meteor)
    m._ribbonHueRange = lerp(0.06, 0.24, lerp(0.2, 1.0, V) * Math.random());
    m._ribbonHueSpeed = lerp(0.35, 1.35, lerp(0.2, 1.0, V) * Math.random());
    m.curvePhase = Math.random() * Math.PI * 2.0;
    m.curveFreq = lerp(0.85, 1.55, Math.random());
    m.curveAmp = lerp(0.04, 0.22, Math.random()) * lerp(0.25, 1.0, params.meteorRomance);


    m.head.visible = true;
    m.head.scale.setScalar(params.headSize);
    m.head.material.color.set(params.baseColor);
    m.head.material.opacity = 1.0;

    // ribbon init
    if (m.ribbon) {
      m.ribbon.visible = params.ribbonEnabled;
      m.ribbon.material.uniforms.uHueBase.value = m.hue;
      m.ribbon.material.uniforms.uHueRange.value = m._ribbonHueRange;
      m.ribbon.material.uniforms.uHueSpeed.value = m._ribbonHueSpeed;

    }

    // audio
    if (params.audioEnabled && onSpawn && now - lastSpawnT > params.audioCooldown) {
      lastSpawnT = now;
      onSpawn({
        hue: m.hue,
        gain: params.audioGain,
        speed,
        life: lifeT,
        romance: params.meteorRomance,
        chime: params.meteorChime,
        tail: params.meteorTail,
      });
    }
  }

  // initial burst
  for (let i = 0; i < Math.min(6, maxMeteors); i++) {
    spawnMeteor(i, 0);
    meteors[i].birth = -rand(0, 1.2);
  }

  function emitTail(worldPos, dir, meteorHue, now, dt) {
    const emitPerSec = THREE.MathUtils.lerp(60, 260, (params.strandCount - 4) / 12);
    const emitN = Math.max(1, Math.floor(emitPerSec * dt));

    const tailLife = THREE.MathUtils.clamp(
      params.tailLength * 0.22 * lerp(0.9, 1.9, params.meteorTail),
      0.20,
      2.2
    );

    for (let n = 0; n < emitN; n++) {
      const i = (pCursor++) % MAX_P;

      const jx = (Math.random() - 0.5) * 0.06 * params.spread;
      const jy = (Math.random() - 0.5) * 0.06 * params.spread;
      const jz = (Math.random() - 0.5) * 0.06 * params.spread;

      pos[i * 3 + 0] = worldPos.x + jx;
      pos[i * 3 + 1] = worldPos.y + jy;
      pos[i * 3 + 2] = worldPos.z + jz;

      const back = new THREE.Vector3().copy(dir).multiplyScalar(-1);
      const side = new THREE.Vector3(back.z, 0, -back.x).normalize();
      const up = new THREE.Vector3(0, 1, 0);

      const spread = THREE.MathUtils.clamp(params.spread, 0.0, 1.2);
      const cone = spread * 0.9;

      const sv = (Math.random() - 0.5) * cone;
      const uvv = (Math.random() - 0.5) * cone * 0.7;

      const v = back
        .multiplyScalar(THREE.MathUtils.lerp(1.6, 3.2, Math.random()))
        .addScaledVector(side, sv)
        .addScaledVector(up, uvv);

      vel[i * 3 + 0] = v.x;
      vel[i * 3 + 1] = v.y;
      vel[i * 3 + 2] = v.z;

      birth[i] = now;
      life[i] = tailLife * THREE.MathUtils.lerp(0.75, 1.25, Math.random());

      const isHalo = Math.random() < 0.24;
      const isPinkAccent = !isHalo && Math.random() < 0.16;
      layerType[i] = isHalo ? 1 : (isPinkAccent ? 2 : 0);

      const coolHue = lerp(0.54, 0.76, Math.random()); // cyan -> blue-violet
      const accentHue = lerp(0.87, 0.95, Math.random()); // magenta accent
      let h = coolHue;
      if (isPinkAccent) h = lerpHue(coolHue, accentHue, 0.82);
      h = lerpHue(h, meteorHue, isPinkAccent ? 0.25 : 0.10);

      const s = isHalo
        ? lerp(0.18, 0.36, Math.random())
        : (isPinkAccent ? lerp(0.60, 0.78, Math.random()) : lerp(0.46, 0.64, Math.random()));
      const val = isHalo
        ? lerp(1.12, 1.34, Math.random())
        : lerp(0.96, 1.14, Math.random());

      if (isHalo) life[i] *= THREE.MathUtils.lerp(1.10, 1.55, Math.random());

      const base = params.tailSize * lerp(0.94, 1.34, params.meteorTail);
      const layerSizeMul = isHalo
        ? THREE.MathUtils.lerp(1.35, 2.25, Math.random())
        : THREE.MathUtils.lerp(0.72, 1.24, Math.random());
      baseSize[i] = base * layerSizeMul;
      siz[i] = baseSize[i];

      const [r, g, b] = hsv2rgb(h, s, val);
      const glowMul = params.tailGlow * lerp(0.90, 1.22, params.meteorRomance) * (isHalo ? 0.72 : 1.0);
      baseR[i] = r * glowMul;
      baseG[i] = g * glowMul;
      baseB[i] = b * glowMul;
      col[i * 3 + 0] = baseR[i];
      col[i * 3 + 1] = baseG[i];
      col[i * 3 + 2] = baseB[i];

      seed[i] = Math.random();
    }
  }

  function updateRibbonGeometry(meteor, headPos) {
    if (!meteor.ribbon) return;

    const ribbon = meteor.ribbon;
    ribbon.visible = params.ribbonEnabled && meteor.alive;

    // Sync uniforms from params (so GUI can change live)
    const U = ribbon.material.uniforms;
    U.uTime.value = t;
    U.uAlpha.value = params.ribbonAlpha * lerp(0.95, 1.18, params.meteorRomance);
    U.uGlow.value = params.ribbonGlow * lerp(0.95, 1.28, params.meteorRomance);
    U.uHueSpeed.value = params.ribbonHueSpeed;
    U.uHueRange.value = params.ribbonHueRange;
    U.uSoftEdge.value = params.ribbonSoftEdge;
    U.uTailFadePow.value = params.ribbonTailFadePow;

    if (!params.ribbonEnabled) return;

    const dir = meteor.dir;

    // side = perpendicular on XZ plane
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();

    // small lift to read clearly
    const lift = new THREE.Vector3(0, 1, 0).multiplyScalar(0.02);

    // Tail edge
    const len = params.ribbonLength;
    const tailCenter = new THREE.Vector3()
      .copy(headPos)
      .addScaledVector(dir, -len)
      .add(lift);

    const tailHalfW = 0.5 * params.ribbonWidth;

    // Head edge (short edge), pushed forward a bit to cover head
    const headCenter = new THREE.Vector3()
      .copy(headPos)
      .addScaledVector(dir, params.ribbonHeadCover)
      .add(lift);

    const headHalfW =
      tailHalfW *
      THREE.MathUtils.clamp(params.ribbonHeadWidthFactor, 0.05, 0.95);

    // 4 points:
    // 0 head-left, 1 head-right, 2 tail-left, 3 tail-right
    const p0 = new THREE.Vector3().copy(headCenter).addScaledVector(side, -headHalfW);
    const p1 = new THREE.Vector3().copy(headCenter).addScaledVector(side,  headHalfW);
    const p2 = new THREE.Vector3().copy(tailCenter).addScaledVector(side, -tailHalfW);
    const p3 = new THREE.Vector3().copy(tailCenter).addScaledVector(side,  tailHalfW);

    const attr = ribbon.geometry.getAttribute("position");
    attr.setXYZ(0, p0.x, p0.y, p0.z);
    attr.setXYZ(1, p1.x, p1.y, p1.z);
    attr.setXYZ(2, p2.x, p2.y, p2.z);
    attr.setXYZ(3, p3.x, p3.y, p3.z);
    attr.needsUpdate = true;
  }

  // -------------------------
  // Update
  // -------------------------
  function update(now) {
    t = now;

    const dt = Math.min(0.05, Math.max(0, t - lastUpdateT));
    lastUpdateT = t;

    // spawn
    if (params.enabled) {
      spawnAccum += params.spawnRate * dt;
      while (spawnAccum >= 1.0) {
        spawnAccum -= 1.0;
        for (let i = 0; i < maxMeteors; i++) {
          const m = meteors[i];
          const age = t - m.birth;
          if (!m.alive || age > m.life + 0.15) {
            spawnMeteor(i, t);
            break;
          }
        }
      }
    }

    // update meteors + emit tail + ribbon
    for (let i = 0; i < maxMeteors; i++) {
      const m = meteors[i];
      const age = t - m.birth;

      if (!m.alive || age < 0) continue;

      if (age > m.life) {
        m.alive = false;
        m.head.visible = false;
        if (m.ribbon) m.ribbon.visible = false;
        continue;
      }

      // head position
      const u = THREE.MathUtils.clamp(age / Math.max(1e-5, m.life), 0, 1);
      const speedBreath = 0.92 + 0.12 * Math.sin(u * Math.PI);
      const curve = Math.sin(u * Math.PI * m.curveFreq + m.curvePhase) * m.curveAmp * (1.0 - u * 0.55);
      const yFloat = Math.sin(u * Math.PI * 2.0 + m.curvePhase) * (0.04 + 0.05 * params.meteorRomance);
      const headPos = new THREE.Vector3()
        .copy(m.start)
        .addScaledVector(m.dir, m.speed * age * speedBreath)
        .addScaledVector(m.side, curve)
        .add(new THREE.Vector3(0, yFloat, 0));

      m.head.position.copy(headPos);
      m.head.scale.setScalar(params.headSize);

      // head brightness
      const [hr, hg, hb] = hsv2rgb(m.hue, 0.75, 1.0);
      const headCol = new THREE.Color(hr, hg, hb);
      headCol.multiplyScalar(params.headGlow * (m._headGlowMul ?? 1.0) * lerp(0.92, 1.22, params.meteorRomance));
      m.head.material.color.copy(headCol);
      m.head.scale.setScalar(params.headSize * (m._headSizeMul ?? 1.0));


      // ribbon update
      updateRibbonGeometry(m, headPos);

      // emit tail particles
      if (params.enabled) emitTail(headPos, m.dir, m.hue, t, dt);
    }

    // update particles (cpu)
    const drag = params.tailDrag * lerp(1.10, 0.86, params.meteorTail);
    const wob = params.tailWobble * lerp(0.90, 1.45, params.meteorRomance);

    for (let i = 0; i < MAX_P; i++) {
      const a = t - birth[i];
      const L = life[i];
      if (a < 0 || a > L) {
        siz[i] = 0.0;
        continue;
      }

      const k = a / Math.max(1e-5, L); // 0..1
      const fade = 1.0 - k;
      const fade2 = fade * fade;
      const fadeCurve = Math.pow(fade, 1.65);

      // integrate velocity
      pos[i * 3 + 0] += vel[i * 3 + 0] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      // drag
      const damp = Math.exp(-drag * dt);
      vel[i * 3 + 0] *= damp;
      vel[i * 3 + 1] *= damp;
      vel[i * 3 + 2] *= damp;

      // wobble
      const s = seed[i];
      const w = Math.sin(t * (2.2 + s * 2.0) + s * 10.0) * wob * 0.015;
      pos[i * 3 + 0] += w;
      pos[i * 3 + 2] -= w * 0.8;

      // size: bloom a bit then vanish, avoids dusty residue.
      const kind = layerType[i];
      const grow = THREE.MathUtils.lerp(0.92, kind === 1 ? 1.88 : 1.62, 1.0 - fade2);
      const twinkle = 0.92 + 0.18 * Math.sin(t * (3.0 + s * 6.0) + s * 15.0);
      siz[i] = Math.max(0.0, baseSize[i] * grow * fadeCurve * twinkle);

      // color evolution: desaturate to pearl near end instead of pink residue.
      const desat = THREE.MathUtils.smoothstep(k, 0.35, 1.0);
      const whiteMix = (kind === 1)
        ? THREE.MathUtils.lerp(0.10, 0.78, desat)
        : THREE.MathUtils.lerp(0.04, 0.56, desat);
      const pearl = ((baseR[i] + baseG[i] + baseB[i]) / 3) * (kind === 1 ? 1.15 : 1.02);
      col[i * 3 + 0] = THREE.MathUtils.lerp(baseR[i], pearl, whiteMix) * fadeCurve;
      col[i * 3 + 1] = THREE.MathUtils.lerp(baseG[i], pearl, whiteMix) * fadeCurve;
      col[i * 3 + 2] = THREE.MathUtils.lerp(baseB[i], pearl, whiteMix) * fadeCurve;
    }

    tailGeo.attributes.position.needsUpdate = true;
    tailGeo.attributes.color.needsUpdate = true;
    tailGeo.attributes.aSize.needsUpdate = true;
  }

  function burst(n = 3) {
    let spawned = 0;
    for (let i = 0; i < maxMeteors && spawned < n; i++) {
      const m = meteors[i];
      const age = t - m.birth;
      if (!m.alive || age > m.life + 0.15) {
        spawnMeteor(i, t);
        spawned++;
      }
    }
  }

  return { root, params, update, burst };
}
