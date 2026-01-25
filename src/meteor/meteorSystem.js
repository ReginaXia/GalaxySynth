// src/meteor/meteorSystem.js
import * as THREE from "three";

/**
 * New Meteor System (Ball + Gas Tail)
 * - Head: glowing sphere
 * - Tail: Points particle pool using /textures/meteor.png
 * - GUI controls: tailLength, headGlow, spread, strandCount
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
    tailLength: 3.2,     // "visual length" (maps to tail life)
    headGlow: 3.2,       // head brightness multiplier
    spread: 0.85,        // tail spread (0..1.2)
    strandCount: 12,     // we reinterpret as "emit density" (4..16)

    // extra look
    headSize: 0.09,      // sphere radius
    tailSize: 0.18,      // base particle size (world-ish)
    tailDrag: 1.7,       // how fast tail slows down
    tailWobble: 1.6,     // flame-like wobble
    tailGlow: 1.6,       // tail color intensity
    baseColor: "#ff4fd8",// default pink

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
    head: null, // mesh
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

  // -------------------------
  // Update
  // -------------------------
  function update(now) {
    t = now;

    // dt
    const dt = Math.min(0.05, Math.max(0, t - lastUpdateT));
    lastUpdateT = t;

    // spawn
    if (!params.enabled) {
      // still update tail fade-out if disabled
    } else {
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

    // update meteors + emit tail
    for (let i = 0; i < maxMeteors; i++) {
      const m = meteors[i];
      const age = t - m.birth;

      if (!m.alive || age < 0) continue;

      if (age > m.life) {
        m.alive = false;
        m.head.visible = false;
        continue;
      }

      // head position
      const headPos = new THREE.Vector3()
        .copy(m.start)
        .addScaledVector(m.dir, m.speed * age);

      m.head.position.copy(headPos);
      m.head.scale.setScalar(params.headSize);

      // head brightness (via opacity+color)
      // keep color pink but boost intensity by multiplying material color
      const base = new THREE.Color(params.baseColor);
      base.multiplyScalar(params.headGlow);
      m.head.material.color.copy(base);

      // emit tail particles
      if (params.enabled) emitTail(headPos, m.dir, m.hue, t, dt);
    }

    // update particles (cpu)
    // flame-like wobble + drag + fade
    const drag = params.tailDrag;
    const wob = params.tailWobble;

    for (let i = 0; i < MAX_P; i++) {
      const a = t - birth[i];
      const L = life[i];
      if (a < 0 || a > L) {
        // make fully transparent by shrinking size
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

      // wobble: swirl sideways a bit (gas flame)
      const s = seed[i];
      const w = Math.sin(t * (2.2 + s * 2.0) + s * 10.0) * wob * 0.015;
      pos[i * 3 + 0] += w;
      pos[i * 3 + 2] -= w * 0.8;

      // size expands over life
      const grow = THREE.MathUtils.lerp(0.85, 1.9, 1.0 - fade2);
      siz[i] = Math.max(0.0, params.tailSize * grow * fade2);

      // color fades with life (multiply)
      col[i * 3 + 0] *= 0.995; // keep stable
      col[i * 3 + 1] *= 0.995;
      col[i * 3 + 2] *= 0.995;

      // alpha control via size shrink; PointsMaterial opacity stays 1
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
