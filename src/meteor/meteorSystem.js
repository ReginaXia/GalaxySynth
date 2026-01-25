// src/meteor/meteorSystem.js
import * as THREE from "three";

/**
 * Meteor System (Ball + Gas Tail + Pink Ribbon Triangle)
 * - Head: glowing sphere
 * - Tail: Points particle pool using /textures/meteor.png
 * - Ribbon: translucent triangle ribbon behind head, with animated hue flow
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
    strandCount: 12, // we reinterpret as "emit density" (4..16)

    // extra look
    headSize: 0.09, // sphere radius
    tailSize: 0.18, // base particle size (world-ish)
    tailDrag: 1.7, // how fast tail slows down
    tailWobble: 1.6, // flame-like wobble
    tailGlow: 1.6, // tail color intensity
    baseColor: "#ff4fd8", // default pink

    // Ribbon (NEW)
    ribbonEnabled: true,
    ribbonLength: 1.55, // world units behind the head
    ribbonWidth: 0.85,  // world units at the far end
    ribbonAlpha: 0.85,  // overall alpha (still additive)
    ribbonGlow: 2.4,   // brightness multiplier
    ribbonHueSpeed: 0.9, // hue animation speed
    ribbonHueRange: 0.10, // hue variation range
    ribbonSoftEdge: 0.12, // edge softness in UV space
    ribbonTailFadePow: 1.6, // tail fade curve

    // placement
    areaRadius: 7.5,
    planeY,

    // audio
    audioEnabled: true,
    audioGain: 0.7,
    audioCooldown: 0.10,
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
  // Ribbon (triangle) shader (NEW)
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
      // UV mapping we use:
      // tip:   (0, 0.5)
      // left:  (1, 0.0)
      // right: (1, 1.0)
      // => triangle boundary in uv space is: abs(v-0.5) <= 0.5 * u
      float u = clamp(vUv.x, 0.0, 1.0);          // 0=head, 1=tail
      float vc = vUv.y - 0.5;                    // centerline = 0
      float halfW = 0.5 * u;                     // triangle expands linearly
      float dEdge = halfW - abs(vc);             // >0 inside triangle

      // soft edge (bigger uSoftEdge => softer)
      float edge = smoothstep(0.0, max(1e-5, uSoftEdge), dEdge);

      // tail fade (u -> 1 fades out)
      float tailFade = pow(1.0 - u, max(0.05, uTailFadePow));

      // mild center boost (thin bright spine)
      float center = exp(-pow(abs(vc) / max(1e-5, 0.14 * halfW + 0.02), 2.0));

      // animated hue flow along length
      float flow = sin(uTime * uHueSpeed + u * 9.0 + uHueBase * 6.2831) * 0.5 + 0.5;
      float hue = fract(uHueBase + (flow - 0.5) * uHueRange + u * 0.04);

      // color in "pink-neon family" but drifting
      vec3 colA = hsv2rgb(vec3(fract(hue + 0.00), 0.70, 1.10));
      vec3 colB = hsv2rgb(vec3(fract(hue + 0.14), 0.85, 1.00));
      vec3 col  = mix(colA, colB, flow);

      // combine intensity
      float a = edge * tailFade * uAlpha;
      float inten = (0.45 + 0.85 * center) * uGlow;

      // Additive-like output; keep alpha to control strength
      gl_FragColor = vec4(col * inten, a);
    }
  `;

  function makeRibbonMesh(initialHueBase = 0.60) {
    // Dynamic triangle geometry (we update positions every frame)
    const geo = new THREE.BufferGeometry();

    // 3 vertices triangle
    const positions = new Float32Array(3 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // UVs define triangle space so we can do clean triangle mask in fragment
    // tip: (0, 0.5), left: (1, 0), right: (1, 1)
    const uvs = new Float32Array([
      0.0, 0.5,
      1.0, 0.0,
      1.0, 1.0,
    ]);
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const mat = new THREE.ShaderMaterial({
      vertexShader: ribbonVert,
      fragmentShader: ribbonFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
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
    mesh.renderOrder = 10000; // behind head & points
    return mesh;
  }

  // Create ribbon per meteor (pool)
  for (let i = 0; i < maxMeteors; i++) {
    const ribbon = makeRibbonMesh(0.92 + (Math.random() - 0.5) * 0.04);
    root.add(ribbon);
    meteors[i].ribbon = ribbon;
  }

  // -------------------------
  // Tail particles (Points pool)
  // -------------------------
  const MAX_P = 6000; // tail particle budget
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  const siz = new Float32Array(MAX_P);
  const vel = new Float32Array(MAX_P * 3);
  const birth = new Float32Array(MAX_P);
  const life = new Float32Array(MAX_P);
  const seed = new Float32Array(MAX_P);

  // init all dead
  for (let i = 0; i < MAX_P; i++) {
    birth[i] = -9999;
    life[i] = 0;
    seed[i] = Math.random();
    siz[i] = 0;
    col[i * 3 + 0] = 1;
    col[i * 3 + 1] = 0.3;
    col[i * 3 + 2] = 0.85;
  }

  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tailGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tailGeo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1)); // custom size

  // texture: from public/textures/meteor.png => served at /textures/meteor.png
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
    size: 1.0, // will be overridden in shader via onBeforeCompile
    sizeAttenuation: true,
    opacity: 1.0,
  });

  // Make PointsMaterial support per-particle size attribute
  tailMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "uniform float size;",
        "uniform float size;\nattribute float aSize;"
      )
      .replace(
        "gl_PointSize = size;",
        "gl_PointSize = size * aSize;"
      );

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

  function hsv2rgb(h, s, v) {
    // simple HSV -> RGB
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
    m.speed = speed;
    m.birth = now;
    m.life = lifeT;
    m.seed = Math.random();

    // slight hue random around pink (optional)
    m.hue = wrap01(0.92 + rand(-0.06, 0.06));

    m.head.visible = true;
    m.head.scale.setScalar(params.headSize);
    m.head.material.color.set(params.baseColor);
    m.head.material.opacity = 1.0;

    // ribbon init
    if (m.ribbon) {
      m.ribbon.visible = params.ribbonEnabled;
      // per meteor base hue for ribbon drift
      m.ribbon.material.uniforms.uHueBase.value = m.hue;
    }

    // audio
    if (params.audioEnabled && onSpawn && now - lastSpawnT > params.audioCooldown) {
      lastSpawnT = now;
      onSpawn({ hue: m.hue, gain: params.audioGain, speed, life: lifeT });
    }
  }

  // initial burst so you see something
  for (let i = 0; i < Math.min(6, maxMeteors); i++) {
    spawnMeteor(i, 0);
    meteors[i].birth = -rand(0, 1.2);
  }

  function emitTail(worldPos, dir, meteorHue, now, dt) {
    // density controlled by strandCount
    const emitPerSec = THREE.MathUtils.lerp(60, 260, (params.strandCount - 4) / 12);
    const emitN = Math.max(1, Math.floor(emitPerSec * dt));

    // tail life maps from tailLength (visual)
    const tailLife = THREE.MathUtils.clamp(params.tailLength * 0.22, 0.18, 1.4);

    for (let n = 0; n < emitN; n++) {
      const i = (pCursor++) % MAX_P;

      // spawn position with tiny jitter (so it doesn't look like a single line)
      const jx = (Math.random() - 0.5) * 0.06 * params.spread;
      const jy = (Math.random() - 0.5) * 0.06 * params.spread;
      const jz = (Math.random() - 0.5) * 0.06 * params.spread;

      pos[i * 3 + 0] = worldPos.x + jx;
      pos[i * 3 + 1] = worldPos.y + jy;
      pos[i * 3 + 2] = worldPos.z + jz;

      // velocity: mainly backward + cone spread
      const back = new THREE.Vector3().copy(dir).multiplyScalar(-1);
      const side = new THREE.Vector3(back.z, 0, -back.x).normalize();
      const up = new THREE.Vector3(0, 1, 0);

      const spread = THREE.MathUtils.clamp(params.spread, 0.0, 1.2);
      const cone = spread * 0.9;

      const sv = (Math.random() - 0.5) * cone;
      const uvv = (Math.random() - 0.5) * cone * 0.7;

      const v = back.multiplyScalar(THREE.MathUtils.lerp(1.6, 3.2, Math.random()))
        .addScaledVector(side, sv)
        .addScaledVector(up, uvv);

      vel[i * 3 + 0] = v.x;
      vel[i * 3 + 1] = v.y;
      vel[i * 3 + 2] = v.z;

      birth[i] = now;
      life[i] = tailLife * THREE.MathUtils.lerp(0.75, 1.25, Math.random());

      // size grows with life (gas expands)
      const base = params.tailSize;
      siz[i] = base * THREE.MathUtils.lerp(0.7, 1.25, Math.random());

      // color: default pink + slight hue variation
      const [r, g, b] = hsv2rgb(meteorHue, 0.65, 1.0);
      col[i * 3 + 0] = r * params.tailGlow;
      col[i * 3 + 1] = g * params.tailGlow;
      col[i * 3 + 2] = b * params.tailGlow;

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
    U.uAlpha.value = params.ribbonAlpha;
    U.uGlow.value = params.ribbonGlow;
    U.uHueSpeed.value = params.ribbonHueSpeed;
    U.uHueRange.value = params.ribbonHueRange;
    U.uSoftEdge.value = params.ribbonSoftEdge;
    U.uTailFadePow.value = params.ribbonTailFadePow;

    if (!params.ribbonEnabled) return;

    // Build triangle behind head:
    // tip = headPos
    // base center = headPos - dir * length
    // base left/right = baseCenter +/- side * (width * 0.5)
    const dir = meteor.dir;
    const len = params.ribbonLength;

    // side = perpendicular on XZ plane
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();

    // slightly "lift" the ribbon a bit so it reads clearly above particles
    const lift = new THREE.Vector3(0, 1, 0).multiplyScalar(0.02);

    const baseCenter = new THREE.Vector3()
      .copy(headPos)
      .addScaledVector(dir, -len)
      .add(lift);

    const halfW = 0.5 * params.ribbonWidth;

    const p0 = new THREE.Vector3().copy(headPos).add(lift);                // tip
    const p1 = new THREE.Vector3().copy(baseCenter).addScaledVector(side, -halfW); // left
    const p2 = new THREE.Vector3().copy(baseCenter).addScaledVector(side,  halfW); // right

    const attr = ribbon.geometry.getAttribute("position");
    attr.setXYZ(0, p0.x, p0.y, p0.z);
    attr.setXYZ(1, p1.x, p1.y, p1.z);
    attr.setXYZ(2, p2.x, p2.y, p2.z);
    attr.needsUpdate = true;
  }

  // -------------------------
  // Update
  // -------------------------
  function update(now) {
    t = now;

    // dt
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
      const headPos = new THREE.Vector3()
        .copy(m.start)
        .addScaledVector(m.dir, m.speed * age);

      m.head.position.copy(headPos);
      m.head.scale.setScalar(params.headSize);

      // head brightness (via opacity+color)
      const base = new THREE.Color(params.baseColor);
      base.multiplyScalar(params.headGlow);
      m.head.material.color.copy(base);

      // ribbon update (NEW)
      updateRibbonGeometry(m, headPos);

      // emit tail particles
      if (params.enabled) emitTail(headPos, m.dir, m.hue, t, dt);
    }

    // update particles (cpu)
    const drag = params.tailDrag;
    const wob = params.tailWobble;

    for (let i = 0; i < MAX_P; i++) {
      const a = t - birth[i];
      const L = life[i];
      if (a < 0 || a > L) {
        siz[i] = 0.0;
        continue;
      }

      const k = a / Math.max(1e-5, L); // 0..1
      const fade = (1.0 - k);
      const fade2 = fade * fade;

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

      // size expands over life
      const grow = THREE.MathUtils.lerp(0.85, 1.9, 1.0 - fade2);
      siz[i] = Math.max(0.0, params.tailSize * grow * fade2);

      // color stable (we keep your original approach)
      col[i * 3 + 0] *= 0.995;
      col[i * 3 + 1] *= 0.995;
      col[i * 3 + 2] *= 0.995;
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
