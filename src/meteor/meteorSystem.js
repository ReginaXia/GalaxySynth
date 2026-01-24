// src/meteor/meteorSystem.js
import * as THREE from "three";

/**
 * Meteor System
 * - Instanced billboard quads (each instance = one meteor)
 * - Random spawn and fly across
 * - Shader draws head glow/star + aurora shifting tail
 * - Optional onSpawn callback for audio
 */
export function createMeteorSystem({
  scene,
  camera,
  renderer,
  streakVert,
  streakFrag,
  planeY = 0.0,
  onSpawn = null,
}) {
  const root = new THREE.Group();
  scene.add(root);

  const maxMeteors = 24;

  // -------------------------
  // Parameters (GUI will mutate these)
  // -------------------------
  const params = {
    enabled: true,

    maxMeteors,
    spawnRate: 0.35, // per second (平均每秒多少条)

    // movement
    speedMin: 4.0,
    speedMax: 9.0,
    lifeMin: 0.7,
    lifeMax: 1.4,

    // geometry look in shader space
    tailLength: 2.8, // (world scale factor)
    tailWidth: 0.18, // (world scale factor)
    headSize: 0.22, // UV radius control
    headGlow: 2.2, // glow intensity
    tailGlow: 1.2, // tail intensity
    tailFade: 2.2, // tail falloff

    // --- GUI controls (requested) ---
    strandCount: 12, // filament strands
    spread: 0.90,    // tail scatter amount
    

    // head shape
    headShape: 1, // 0=orb, 1=cross, 2=star5
    shapeMix: 0.85, // blend between orb & shape
    starSharpness: 2.0, // shape crisp

    // color / aurora
    baseHue: 0.62,
    hueRange: 0.12,
    auroraAmount: 0.75,
    auroraSpeed: 0.55,
    sat: 0.85,
    val: 1.0,

    // placement
    areaRadius: 7.5,
    planeY,

    // audio
    audioEnabled: true,
    audioGain: 0.7,
    audioCooldown: 0.10, // seconds

    

  };

  // -------------------------
  // Instanced quad
  // -------------------------
  function makeCrossRibbonGeometry(layers = 3) {
    // 一个plane = 2 tris = 6 verts（用非indexed更好加属性）
    const plane = new THREE.PlaneGeometry(1, 1, 1, 1).toNonIndexed();
    const pos0 = plane.attributes.position.array;
    const uv0  = plane.attributes.uv.array;
    const vCount0 = plane.attributes.position.count; // 6

    const pos = new Float32Array(vCount0 * 3 * layers);
    const uv  = new Float32Array(vCount0 * 2 * layers);
    const aLayer = new Float32Array(vCount0 * layers);

    for (let L = 0; L < layers; L++) {
        for (let i = 0; i < vCount0; i++) {
        pos[(L*vCount0 + i)*3 + 0] = pos0[i*3 + 0];
        pos[(L*vCount0 + i)*3 + 1] = pos0[i*3 + 1];
        pos[(L*vCount0 + i)*3 + 2] = pos0[i*3 + 2];

        uv[(L*vCount0 + i)*2 + 0]  = uv0[i*2 + 0];
        uv[(L*vCount0 + i)*2 + 1]  = uv0[i*2 + 1];

        aLayer[L*vCount0 + i] = L; // 0,1,2
        }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("aLayer", new THREE.BufferAttribute(aLayer, 1));
    return g;
    }

    // 用三层交叉 ribbon
    const baseGeo = makeCrossRibbonGeometry(3);

  const instGeo = new THREE.InstancedBufferGeometry().copy(baseGeo);

  // ✅ 关键：确保实例数 > 0（否则可能完全不画）
  instGeo.instanceCount = maxMeteors;

  const aStart = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors * 3), 3);
  const aDir = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors * 3), 3);
  const aSpeed = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors), 1);
  const aBirth = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors), 1);
  const aLife = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors), 1);
  const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors), 1);
  const aHue = new THREE.InstancedBufferAttribute(new Float32Array(maxMeteors), 1);

  instGeo.setAttribute("aStart", aStart);
  instGeo.setAttribute("aDir", aDir);
  instGeo.setAttribute("aSpeed", aSpeed);
  instGeo.setAttribute("aBirth", aBirth);
  instGeo.setAttribute("aLife", aLife);
  instGeo.setAttribute("aSeed", aSeed);
  instGeo.setAttribute("aHue", aHue);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: streakVert,
    fragmentShader: streakFrag,
    uniforms: {
      uTime: { value: 0 },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },

      uTailLength: { value: params.tailLength },
      uTailWidth: { value: params.tailWidth },

      uHeadSize: { value: params.headSize },
      uHeadGlow: { value: params.headGlow },
      uTailGlow: { value: params.tailGlow },
      uTailFade: { value: params.tailFade },

      uHeadShape: { value: params.headShape },
      uShapeMix: { value: params.shapeMix },
      uStarSharpness: { value: params.starSharpness },

      uBaseHue: { value: params.baseHue },
      uHueRange: { value: params.hueRange },
      uAuroraAmount: { value: params.auroraAmount },
      uAuroraSpeed: { value: params.auroraSpeed },
      uSat: { value: params.sat },
      uVal: { value: params.val },
      uStrandCount: { value: params.strandCount },
      uSpread: { value: params.spread },

    },
  });

  const mesh = new THREE.Mesh(instGeo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9999;
  root.add(mesh);

  // -------------------------
  // Spawn state
  // -------------------------
  const alive = new Array(maxMeteors).fill(false);
  let t = 0;
  let lastSpawnT = -999;

  // ✅ 用 dt 累积生成：spawnRate=每秒平均多少条
  let lastUpdateT = 0;
  let spawnAccum = 0;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomUnit2() {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  }

  function spawn(i, now) {
    const R = params.areaRadius;

    // 让流星大概率斜着扫过（更像真实“划过”）
    const baseAng =
      rand(-Math.PI * 0.15, Math.PI * 0.15) +
      (Math.random() < 0.5 ? Math.PI * 0.75 : Math.PI * 0.25);

    const dx = Math.cos(baseAng);
    const dz = Math.sin(baseAng);

    // start somewhere outside-ish so it crosses view
    const startSide = randomUnit2();
    const sx = startSide.x * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
    const sz = startSide.z * R * rand(0.85, 1.25) + rand(-1.2, 1.2);
    const sy = params.planeY + rand(0.2, 1.5);

    aStart.setXYZ(i, sx, sy, sz);
    aDir.setXYZ(i, dx, 0.0, dz);

    const speed = rand(params.speedMin, params.speedMax);
    const life = rand(params.lifeMin, params.lifeMax);

    aSpeed.setX(i, speed);
    aBirth.setX(i, now);
    aLife.setX(i, life);
    aSeed.setX(i, Math.random());

    const h = wrap01(params.baseHue + rand(-params.hueRange, params.hueRange));
    aHue.setX(i, h);

    alive[i] = true;

    aStart.needsUpdate = true;
    aDir.needsUpdate = true;
    aSpeed.needsUpdate = true;
    aBirth.needsUpdate = true;
    aLife.needsUpdate = true;
    aSeed.needsUpdate = true;
    aHue.needsUpdate = true;

    // audio
    if (params.audioEnabled && onSpawn && now - lastSpawnT > params.audioCooldown) {
      lastSpawnT = now;
      onSpawn({ hue: h, gain: params.audioGain, speed, life });
    }
  }

  // 初始先丢几条（避免你打开页面啥都看不到）
  for (let i = 0; i < Math.min(6, maxMeteors); i++) {
    spawn(i, 0);
    aBirth.setX(i, -rand(0, 1.2));
    aBirth.needsUpdate = true;
  }

  // -------------------------
  // Update
  // -------------------------
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();

  function update(now) {
    t = now;
    mat.uniforms.uTime.value = t;

    // camera basis (for billboard)
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    mat.uniforms.uCamRight.value.copy(camRight);
    mat.uniforms.uCamUp.value.copy(camUp);

    // push params to uniforms (so GUI real-time)
    mat.uniforms.uTailLength.value = params.tailLength;
    mat.uniforms.uTailWidth.value = params.tailWidth;
    mat.uniforms.uHeadSize.value = params.headSize;
    mat.uniforms.uHeadGlow.value = params.headGlow;
    mat.uniforms.uTailGlow.value = params.tailGlow;
    mat.uniforms.uTailFade.value = params.tailFade;

    mat.uniforms.uHeadShape.value = params.headShape;
    mat.uniforms.uShapeMix.value = params.shapeMix;
    mat.uniforms.uStarSharpness.value = params.starSharpness;

    mat.uniforms.uBaseHue.value = params.baseHue;
    mat.uniforms.uHueRange.value = params.hueRange;
    mat.uniforms.uAuroraAmount.value = params.auroraAmount;
    mat.uniforms.uAuroraSpeed.value = params.auroraSpeed;
    mat.uniforms.uSat.value = params.sat;
    mat.uniforms.uVal.value = params.val;
    mat.uniforms.uStrandCount.value = params.strandCount;
    mat.uniforms.uSpread.value = params.spread;


    if (!params.enabled) return;

    // ✅ dt spawn（稳定、不吃帧率）
    const dt = Math.min(0.05, Math.max(0, t - lastUpdateT)); // clamp 防止切回标签页爆发
    lastUpdateT = t;

    spawnAccum += params.spawnRate * dt;

    // 每累计到 1，就生成一条（可能一次生成多条）
    while (spawnAccum >= 1.0) {
      spawnAccum -= 1.0;

      // 找一个可用槽位
      for (let i = 0; i < maxMeteors; i++) {
        const birth = aBirth.getX(i);
        const life = aLife.getX(i);
        const age = t - birth;
        if (!alive[i] || age > life + 0.15) {
          spawn(i, t);
          break;
        }
      }
    }

    // mark dead
    for (let i = 0; i < maxMeteors; i++) {
      const birth = aBirth.getX(i);
      const life = aLife.getX(i);
      if (alive[i] && t - birth > life + 0.25) alive[i] = false;
    }
  }

  // ✅ 给 GUI/调试用：手动爆发几条（确认“能画出来”）
  function burst(n = 3) {
    let spawned = 0;
    for (let k = 0; k < maxMeteors && spawned < n; k++) {
      const birth = aBirth.getX(k);
      const life = aLife.getX(k);
      const age = t - birth;
      if (!alive[k] || age > life + 0.15) {
        spawn(k, t);
        spawned++;
      }
    }
  }

  return { root, mesh, params, update, burst };
}

function wrap01(x) {
  x = x % 1;
  if (x < 0) x += 1;
  return x;
}
