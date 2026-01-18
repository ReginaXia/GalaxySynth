// src/nebula/nebulaSystem.js
import * as THREE from "three";

// 3 个星云团：core + outer（分层次牵引）
// pointer 使用 NDC(-1..1)，我们把它映射到银河平面 x/z
export function createNebulaSystem({
  scene,
  radiusWorld = 7.0,   // 你的银河半径（和 makeStars radius 一致）
  planeY = 0.0,        // 星云所在平面高度
}) {

  // 所有星云的根节点（用于整体旋转）
  const root = new THREE.Group();
  scene.add(root);

  const clusters = [];

  // 建议：让星云团散落在四周（靠边）
  const defs = [
  // 左上：粉紫 Pad
  {
    id: "A_pad",
    center: new THREE.Vector3(-4.2, planeY + 0.05, 1.6),
    radius: 1.55,
    rotSpeed: 0.06,
    colorA: "#ff77d7",
    colorB: "#b6a7ff",
  },
  // 右上：青蓝 Bell
  {
    id: "B_bell",
    center: new THREE.Vector3(4.0, planeY + 0.10, 1.2),
    radius: 1.25,
    rotSpeed: -0.08,
    colorA: "#7fe7ff",
    colorB: "#b9a7ff",
  },
  // 左下：薄荷/粉 Pluck
  {
    id: "C_pluck",
    center: new THREE.Vector3(-3.6, planeY - 0.05, -2.6),
    radius: 1.45,
    rotSpeed: 0.05,
    colorA: "#9ff3ff",
    colorB: "#ff8fe6",
  },
  // 右下：暖金/粉（更“幸运”）Sparkle
  {
    id: "D_sparkle",
    center: new THREE.Vector3(3.5, planeY - 0.05, -3.1),
    radius: 1.65,
    rotSpeed: -0.045,
    colorA: "#ffd27a",
    colorB: "#ff72d8",
  },
  // 中上偏右：淡紫雾（空气层）
  {
    id: "E_air",
    center: new THREE.Vector3(1.2, planeY + 0.06, 2.9),
    radius: 1.30,
    rotSpeed: 0.035,
    colorA: "#c7b6ff",
    colorB: "#7fe7ff",
  },
];


  for (const d of defs) {
    const group = new THREE.Group();
    group.position.copy(d.center);

    // 外层：稀疏、大颗粒、先被牵引
    const outer = makeNebulaPoints({
      count: 9000,
      spread: d.radius * 1.0,
      thickness: 0.55,
      colorA: d.colorA,
      colorB: d.colorB,
      sizeMin: 0.8,
      sizeMax: 2.6,
      alpha: 0.55,
    });

    // 内核：密集、小颗粒、后被牵引
    const core = makeNebulaPoints({
      count: 14000,
      spread: d.radius * 0.55,
      thickness: 0.35,
      colorA: d.colorB,
      colorB: "#fff1fb", // 珠光
      sizeMin: 0.5,
      sizeMax: 1.4,
      alpha: 0.70,
    });

    // 层级：核心在上，外层略散
    core.position.set(0, 0.03, 0);
    outer.position.set(0, 0, 0);

    group.add(outer);
    group.add(core);
    root.add(group);


    // 保存 basePos（用于每帧把点拉回“原位”附近）
    const outerBase = outer.geometry.attributes.position.array.slice();
    const coreBase = core.geometry.attributes.position.array.slice();

    clusters.push({
      id: d.id,
      group,
      center: d.center.clone(),
      radius: d.radius,
      rotSpeed: d.rotSpeed,
      outer,
      core,
      outerBase,
      coreBase,
      influence: 0.0,
    });
  }

  // --- Pointer -> World 映射：把 NDC 映射到 galaxy 平面 x/z ---
  function pointerToWorld(pointerNDC) {
    // pointerNDC: Vector2(-1..1)
    // 映射到 [-radiusWorld, radiusWorld]
    return new THREE.Vector3(
      pointerNDC.x * radiusWorld,
      planeY,
      pointerNDC.y * radiusWorld
    );
  }

  function update(pointerNDC, t) {
    const pWorld = pointerToWorld(pointerNDC);

    for (const c of clusters) {
      // 1) 自转（整体 Group）
      c.group.rotation.y = t * c.rotSpeed;

      // 2) 计算 influence（距离越近越强）
      const dist = pWorld.distanceTo(c.center);
      const infl = smoothstep(c.radius * 1.35, c.radius * 0.25, dist); // 0..1
      c.influence = infl;

      // 3) 外层 / 内核分层牵引
      // 外层更敏感：pow=1.0
      // 内核更迟钝：pow=2.0
      const inflOuter = Math.pow(infl, 1.0);
      const inflCore = Math.pow(infl, 2.0);

      // 4) 牵引方向：从点指向 pointer（在 cluster local space）
      // 我们在 local space 做（因为 group 已经有 position/rotation）
      const pLocal = c.group.worldToLocal(pWorld.clone());

      // 更新外层
      applyAttraction({
        points: c.outer,
        basePositions: c.outerBase,
        targetLocal: pLocal,
        strength: 0.22 * inflOuter,
        swirl: 0.35 * inflOuter,
        t,
      });

      // 更新内核（更弱、更稳）
      applyAttraction({
        points: c.core,
        basePositions: c.coreBase,
        targetLocal: pLocal,
        strength: 0.10 * inflCore,
        swirl: 0.22 * inflCore,
        t: t + 13.7,
      });

      // 5) 额外：靠近时整体轻微“抬亮”（用 material opacity/gain 模拟）
      // 这会让“靠近就更梦幻”非常明显
      c.outer.material.opacity = lerp(0.20, 0.55, inflOuter);
      c.core.material.opacity = lerp(0.30, 0.70, inflCore);
    }
  }

  return { clusters, update, root };

}

// ----------------------------
// Internal helpers
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
}) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const idx3 = i * 3;

    // 生成一个“团”：中心密、边缘稀（用 pow 控制）
    // const r = Math.pow(Math.random(), 0.38) * spread;
    // const a = Math.random() * Math.PI * 2;

    // const x = Math.cos(a) * r + (Math.random() - 0.5) * 0.15;
    // const z = Math.sin(a) * r + (Math.random() - 0.5) * 0.15;
    // const y = (Math.random() - 0.5) * thickness * (1.0 - r / spread);

    const r = Math.pow(Math.random(), 0.38) * spread;

    // 基础角度
    const baseA = Math.random() * Math.PI * 2;

    // 螺旋扭转：半径越大扭得越多（像吸积盘/旋臂）
    const swirl = (r / spread) * 5.0;     // 数值越大，旋臂越明显
    const a = baseA + swirl;

    // 盘面厚度：中心厚，边缘薄
    const diskY = (Math.random() - 0.5) * thickness * (1.0 - (r / spread) * 0.85);

    // 椭圆盘：让盘看起来更“星云照片”一点
    const ex = 1.0;
    const ez = 0.78;

    const x = Math.cos(a) * r * ex + (Math.random() - 0.5) * 0.10;
    const z = Math.sin(a) * r * ez + (Math.random() - 0.5) * 0.10;
    const y = diskY;


    positions[idx3 + 0] = x;
    positions[idx3 + 1] = y;
    positions[idx3 + 2] = z;

    // 颜色从 A->B，中心更接近 B（更珠光/更亮）
    const t = clamp01(r / spread);
    c.copy(cB).lerp(cA, t);
    colors[idx3 + 0] = c.r;
    colors[idx3 + 1] = c.g;
    colors[idx3 + 2] = c.b;

    // 点大小：大部分小，少量大（梦幻颗粒）
    sizes[i] = sizeMin + Math.pow(Math.random(), 2.0) * (sizeMax - sizeMin);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  // 先用 PointsMaterial，稳定、快
  const mat = new THREE.PointsMaterial({
    size: 0.02,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: alpha,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function applyAttraction({
  points,
  basePositions,
  targetLocal,
  strength,
  swirl,
  t,
}) {
  const posAttr = points.geometry.attributes.position;
  const arr = posAttr.array;

  // 强度太小就不算了（省性能）
  if (strength < 0.0005) {
    // 轻轻回弹到 base
    relaxToBase(arr, basePositions, 0.06);
    posAttr.needsUpdate = true;
    return;
  }

  // 牵引半径（local space）
  const R = 1.2;

  for (let i = 0; i < arr.length; i += 3) {
    const bx = basePositions[i + 0];
    const by = basePositions[i + 1];
    const bz = basePositions[i + 2];

    // 当前点
    let x = arr[i + 0];
    let y = arr[i + 1];
    let z = arr[i + 2];

    // 先回弹一点点（避免越拉越散）
    x = lerp(x, bx, 0.04);
    y = lerp(y, by, 0.04);
    z = lerp(z, bz, 0.04);

    // 距离 target
    const dx = targetLocal.x - bx;
    const dz = targetLocal.z - bz;
    const d = Math.sqrt(dx * dx + dz * dz);

    // 只影响局部区域，形成“手扫过的层次感”
    const w = smoothstep(R, 0.0, d); // 0..1

    if (w > 0.0001) {
      // 吸引
      x += dx * strength * w;
      z += dz * strength * w;

      // 旋涡感（神经/星云搅动）
      const ang = Math.atan2(dz, dx);
      const s = Math.sin(ang + t * 1.2);
      const c = Math.cos(ang + t * 1.2);
      x += (-dz) * swirl * w * 0.10 * c;
      z += (dx) * swirl * w * 0.10 * s;

      // 轻微上下起伏（梦幻）
      y += 0.06 * w * Math.sin(t * 2.0 + bx * 1.7 + bz * 1.3);
    }

    arr[i + 0] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }

  posAttr.needsUpdate = true;
}

function relaxToBase(arr, base, k) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = lerp(arr[i], base[i], k);
  }
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
