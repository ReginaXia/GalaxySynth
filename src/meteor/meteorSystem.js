// src/meteor/meteorSystem.js
import * as THREE from "three";

/**
 * Meteor System v2 (Orb Head + Gas Tail + Glow Ribbon Trail)
 *
 * Visual:
 *  - Head: glowing orb (additive)
 *  - Tail: sprite/points particles using /textures/meteor.png (additive, flame-like wobble)
 *  - Ribbon: gradient glow band that widens farther from the head (additive, subtle sway)
 *
 * Returns: { root, params, update, burst }
 */
export function createMeteorSystem({
  scene,
  camera,
  renderer,
  planeY = 0.0,
  onSpawn = null,
}) {
  const root = new THREE.Group();
  scene.add(root);

  // -------------------------
  // GUI Parameters
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

    // REQUIRED by you (GUI):
    tailLength: 3.2,   // visual length (affects tail particle lifetime)
    headGlow: 3.2,     // head brightness
    spread: 35.0,      // 0..80 (more = wider scatter + wider ribbon)
    strandCount: 12,   // 4..24 (we map to tail density)

    // extra look (nice-to-have)
    baseColor: "#ff4fd8", // default pink
    headSize: 0.09,
    tailSize: 0.20,
    tailGlow: 1.8,
    tailDrag: 1.7,
    tailWobble: 1.6,

    // ribbon band (glow strip)
    ribbonGlow: 1.8,
    ribbonSway: 1.0,       // 0..?
    ribbonFollow: 0.65,    // how much it follows camera vs velocity direction

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
  const TRAIL_PTS = 24; // ribbon sample points (head->tail)
  const TRAIL_HISTORY = TRAIL_PTS; // keep same for simplicity

  const meteors = new Array(maxMeteors).fill(0).map(() => ({
    alive: false,
    start: new THREE.Vector3(),
    dir: new THREE.Vector3(1, 0, 0),
    speed: 6,
    birth: 0,
    life: 1,
    seed: Math.random(),
    hue: 0.92,

    head: null,   // Mesh
    ribbon: null, // Mesh
    ribbonPts: TRAIL_PTS,

    // per-meteor history ring buffer (world positions)
    history: new Array(TRAIL_HISTORY).fill(0).map(() => new THREE.Vector3()),
    histCount: 0,
    histCursor: 0,
  }));

  // -------------------------
  // Head meshes (pool)
  // -------------------------
  const headGeo = new THREE.SphereGeometry(1, 12, 12);
  const headMatBase = new THREE.MeshBasicMaterial({
    color: new THREE.Color(params.baseColor),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  for (let i = 0; i < maxMeteors; i++) {
    const m = meteors[i];
    const head = new THREE.Mesh(headGeo, headMatBase.clone());
    head.visible = false;
    head.renderOrder = 9998;
    root.add(head);
    m.head = head;
  }

  // -------------------------
  // Tail particles (Points pool)
  // -------------------------
  const MAX_P = 7000;
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  const siz = new Float32Array(MAX_P);
  const vel = new Float32Array(MAX_P * 3);
  const pbirth = new Float32Array(MAX_P);
  const plife = new Float32Array(MAX_P);
  const pseed = new Float32Array(MAX_P);

  for (let i = 0; i < MAX_P; i++) {
    pbirth[i] = -9999;
    plife[i] = 0;
    pseed[i] = Math.random();
    siz[i] = 0;
    // init pink-ish
    col[i * 3 + 0] = 1.0;
    col[i * 3 + 1] = 0.3;
    col[i * 3 + 2] = 0.85;
  }

  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tailGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tailGeo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));

  // IMPORTANT: you said the texture is at public/textures/meteor.png
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

  // per-particle size
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
  // Ribbon glow strip (per meteor)
  // -------------------------
  function makeRibbonGeometry(trailPts) {
    const STRIP_VERTS = trailPts * 2;
    const STRIP_IDXS = (trailPts - 1) * 6;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(STRIP_VERTS * 3);
    const uv = new Float32Array(STRIP_VERTS * 2);
    const idx = new Uint16Array(STRIP_IDXS);

    // indices
    let ii = 0;
    for (let i = 0; i < trailPts - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
      idx[ii++] = c; idx[ii++] = d; idx[ii++] = b;
    }

    for (let i = 0; i < trailPts; i++) {
      const t01 = i / (trailPts - 1); // 0=head -> 1=tail
      uv[(i * 2 + 0) * 2 + 0] = 0.0;
      uv[(i * 2 + 0) * 2 + 1] = t01;
      uv[(i * 2 + 1) * 2 + 0] = 1.0;
      uv[(i * 2 + 1) * 2 + 1] = t01;
    }

    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  const ribbonMatBase = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uHeadColor: { value: new THREE.Color("#ff4fd8") },
      uMidColor: { value: new THREE.Color("#b58cff") },
      uTailColor: { value: new THREE.Color("#7fe7ff") },
      uGlow: { value: 1.8 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform vec3 uHeadColor;
      uniform vec3 uMidColor;
      uniform vec3 uTailColor;
      uniform float uGlow;

      vec3 ramp(float t){
        vec3 a = mix(uHeadColor, uMidColor, smoothstep(0.0, 0.55, t));
        vec3 b = mix(uMidColor, uTailColor, smoothstep(0.45, 1.0, t));
        return mix(a, b, smoothstep(0.35, 0.85, t));
      }

      void main(){
        float t = vUv.y;             // 0=head, 1=tail
        float x = abs(vUv.x - 0.5);  // 0=center
        float core = exp(-x*x*18.0);

        float fade = pow(1.0 - t, 1.6);
        vec3 col = ramp(t) * core * fade * uGlow;
        float alpha = core * fade;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  for (let i = 0; i < maxMeteors; i++) {
    const g = makeRibbonGeometry(TRAIL_PTS);
    const m = meteors[i];
    const mat = ribbonMatBase.clone();
    const mesh = new THREE.Mesh(g, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 9996;
    root.add(mesh);
    m.ribbon = mesh;
  }

  // -------------------------
  // Utilities
  // -------------------------
  function rand(min, max) { return min + Math.random() * (max - min); }
  function wrap01(x) { x = x % 1; if (x < 0) x += 1; return x; }

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
      default: return [v, p, q];
    }
  }

  // -------------------------
  // Spawn
  // -------------------------
  let lastSpawnT = -999;
  function spawnMeteor(i, now) {
    const R = params.areaRadius;

    // pick a direction (mostly diagonal across scene)
    const baseAng =
      rand(-Math.PI * 0.15, Math.PI * 0.15) +
      (Math.random() < 0.5 ? Math.PI * 0.75 : Math.PI * 0.25);

    const dx = Math.cos(baseAng);
    const dz = Math.sin(baseAng);

    // start on a ring
    const a = Math.random() * Math.PI * 2;
    const sx = Math.cos(a) * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
    const sz = Math.sin(a) * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
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
    m.hue = wrap01(0.92 + rand(-0.06, 0.06));

    // reset history
    m.histCount = 0;
    m.histCursor = 0;

    // show head
    m.head.visible = true;
    m.head.scale.setScalar(params.headSize);
    m.head.material.opacity = 1.0;

    // show ribbon
    m.ribbon.visible = true;

    // audio
    if (params.audioEnabled && onSpawn && now - lastSpawnT > params.audioCooldown) {
      lastSpawnT = now;
      onSpawn({ hue: m.hue, gain: params.audioGain, speed, life: lifeT });
    }
  }

  // initial burst
  for (let i = 0; i < Math.min(6, maxMeteors); i++) {
    spawnMeteor(i, 0);
    meteors[i].birth = -rand(0, 1.2);
  }

  // -------------------------
  // Emit Tail Particles
  // -------------------------
  const tmpV3a = new THREE.Vector3();
  const tmpV3b = new THREE.Vector3();
  const tmpV3c = new THREE.Vector3();
  const tmpV3d = new THREE.Vector3();

  function emitTail(worldPos, dir, meteorHue, now, dt) {
    // strandCount maps to density (4..24)
    const tDen = THREE.MathUtils.clamp((params.strandCount - 4) / 20, 0, 1);
    const emitPerSec = THREE.MathUtils.lerp(60, 520, tDen);
    const emitN = Math.max(1, Math.floor(emitPerSec * dt));

    // tail life maps from tailLength (visual)
    const tailLife = THREE.MathUtils.clamp(params.tailLength * 0.22, 0.18, 1.6);

    // spread in GUI is 0..80 (visual). Convert to 0..1.
    const spread01 = THREE.MathUtils.clamp(params.spread / 80.0, 0.0, 1.0);

    // position jitter (world-space)
    const jitter = params.spread * 0.0028; // 80 -> ~0.224 world units

    for (let n = 0; n < emitN; n++) {
      const i = (pCursor++) % MAX_P;

      pos[i * 3 + 0] = worldPos.x + (Math.random() - 0.5) * jitter;
      pos[i * 3 + 1] = worldPos.y + (Math.random() - 0.5) * jitter * 0.7;
      pos[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * jitter;

      // velocity: backward + cone spread
      const back = tmpV3a.copy(dir).multiplyScalar(-1);
      const side = tmpV3b.set(back.z, 0, -back.x).normalize();
      const up = tmpV3c.set(0, 1, 0);

      const cone = spread01 * 1.2;
      const sv = (Math.random() - 0.5) * cone;
      const uvv = (Math.random() - 0.5) * cone * 0.8;

      const v = tmpV3d.copy(back).multiplyScalar(THREE.MathUtils.lerp(1.6, 3.4, Math.random()))
        .addScaledVector(side, sv)
        .addScaledVector(up, uvv);

      vel[i * 3 + 0] = v.x;
      vel[i * 3 + 1] = v.y;
      vel[i * 3 + 2] = v.z;

      pbirth[i] = now;
      plife[i] = tailLife * THREE.MathUtils.lerp(0.75, 1.25, Math.random());

      // size
      siz[i] = params.tailSize * THREE.MathUtils.lerp(0.75, 1.35, Math.random());

      // color (pink base with slight hue variance)
      const [r, g, b] = hsv2rgb(meteorHue, 0.65, 1.0);
      col[i * 3 + 0] = r * params.tailGlow;
      col[i * 3 + 1] = g * params.tailGlow;
      col[i * 3 + 2] = b * params.tailGlow;
    }
  }

  // -------------------------
  // Update loop
  // -------------------------
  let t = 0;
  let lastUpdateT = 0;
  let spawnAccum = 0;

  const camDir = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const rightAxis = new THREE.Vector3();

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

    // camera dir (for ribbon facing)
    camera.getWorldDirection(camDir);

    // update meteors
    for (let i = 0; i < maxMeteors; i++) {
      const m = meteors[i];
      const age = t - m.birth;

      if (!m.alive || age < 0) continue;

      if (age > m.life) {
        m.alive = false;
        m.head.visible = false;
        m.ribbon.visible = false;
        continue;
      }

      // head position
      const headPos = tmpV3a.copy(m.start).addScaledVector(m.dir, m.speed * age);
      m.head.position.copy(headPos);
      m.head.scale.setScalar(params.headSize);

      // head color intensity (pink base)
      const base = new THREE.Color(params.baseColor);
      base.multiplyScalar(params.headGlow);
      m.head.material.color.copy(base);

      // push history
      m.history[m.histCursor].copy(headPos);
      m.histCursor = (m.histCursor + 1) % m.history.length;
      m.histCount = Math.min(m.history.length, m.histCount + 1);

      // emit tail
      if (params.enabled) emitTail(headPos, m.dir, m.hue, t, dt);

      // update ribbon strip geometry
      const g = m.ribbon.geometry;
      const arr = g.attributes.position.array;

      // blend right axis between camera-facing and motion-facing for nicer "band" look
      // motion right = cross(dir, up)
      const motionRight = rightAxis.copy(m.dir).cross(upAxis);
      if (motionRight.lengthSq() < 1e-6) motionRight.set(1, 0, 0);
      motionRight.normalize();

      const camRight = tmpV3b.copy(camDir).cross(upAxis);
      if (camRight.lengthSq() < 1e-6) camRight.set(1, 0, 0);
      camRight.normalize();

      const follow = THREE.MathUtils.clamp(params.ribbonFollow, 0.0, 1.0);
      const right = motionRight.lerp(camRight, follow).normalize();

      const count = m.histCount;
      const H = m.history.length;
      const ptsN = m.ribbonPts;
      const useN = Math.max(2, Math.min(count, ptsN));

      const spread01 = THREE.MathUtils.clamp(params.spread / 80.0, 0.0, 1.0);

      for (let k = 0; k < ptsN; k++) {
        const t01 = k / (ptsN - 1); // 0=head .. 1=tail

        // map to history index (older as t01 increases)
        const idxFromHead = Math.min(useN - 1, Math.floor(t01 * (useN - 1)));
        const histIndex = (m.histCursor - 1 - idxFromHead + H) % H;
        const p = m.history[histIndex];

        // width expands with distance
        const baseW = params.tailSize * 0.35 + params.headSize * 0.25;
        const widen = 1.0 + Math.pow(t01, 1.4) * spread01 * 6.0; // tail expands
        let w = baseW * widen;

        // sway (stronger farther away)
        const sway = Math.sin(t * 2.2 + m.seed * 10.0 + t01 * 6.0) *
          (spread01 * 0.35) * (t01 * t01) * params.ribbonSway;

        w += sway * baseW * 1.5;

        // left/right vertices
        const off = tmpV3c.copy(right).multiplyScalar(w);
        const v0 = (k * 2 + 0) * 3;
        const v1 = (k * 2 + 1) * 3;

        arr[v0 + 0] = p.x - off.x;
        arr[v0 + 1] = p.y - off.y;
        arr[v0 + 2] = p.z - off.z;

        arr[v1 + 0] = p.x + off.x;
        arr[v1 + 1] = p.y + off.y;
        arr[v1 + 2] = p.z + off.z;
      }

      g.attributes.position.needsUpdate = true;

      // ribbon glow intensity
      m.ribbon.material.uniforms.uGlow.value = params.ribbonGlow;
    }

    // update particles (cpu integrate)
    const drag = params.tailDrag;
    const wob = params.tailWobble;

    for (let i = 0; i < MAX_P; i++) {
      const a = t - pbirth[i];
      const L = plife[i];
      if (a < 0 || a > L) {
        siz[i] = 0.0;
        continue;
      }

      const k = a / Math.max(1e-5, L); // 0..1
      const fade = (1.0 - k);
      const fade2 = fade * fade;

      // integrate
      pos[i * 3 + 0] += vel[i * 3 + 0] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      // drag
      const damp = Math.exp(-drag * dt);
      vel[i * 3 + 0] *= damp;
      vel[i * 3 + 1] *= damp;
      vel[i * 3 + 2] *= damp;

      // wobble (gas flame)
      const s = pseed[i];
      const w = Math.sin(t * (2.2 + s * 2.0) + s * 10.0) * wob * 0.015;
      pos[i * 3 + 0] += w;
      pos[i * 3 + 2] -= w * 0.8;

      // size expands then fades
      const grow = THREE.MathUtils.lerp(0.85, 1.9, 1.0 - fade2);
      siz[i] = Math.max(0.0, params.tailSize * grow * fade2);
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
