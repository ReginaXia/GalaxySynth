// src/input/scratchDisk.js
import * as THREE from "three";

/**
 * ScratchDisk
 * 负责：盘面命中判定 + theta01/r01/step + bgLead 语义输出
 *
 * 使用方式：
 *   const scratchDisk = createScratchDisk({ camera, nebulaSystem, steps: 16 });
 *   scratchDisk.cacheFromNebula(activeNebulaKey); // 选中星云时调用
 *   const scratch = scratchDisk.update({ pointerNDC, pointerDown, move01, activeNebulaKey });
 */
export function createScratchDisk({ camera, nebulaSystem, steps = 16 }) {
  let activeDiskCenterW = null;   // THREE.Vector3 (world)
  let activeDiskRadiusW = 1.8;    // world radius (rough)
  let activeDiskOuterNDC = 0.18;  // screen-space radius (ndc), computed per-frame
  let activeDiskInnerNDC = 0.02;  // deadzone radius (ndc), computed per-frame

  function cacheFromNebula(galaxyId) {
    if (!galaxyId) {
      activeDiskCenterW = null;
      return;
    }

    const c = nebulaSystem.getCluster?.(galaxyId);
    if (!c) return;

    // 固定中心：用 group 的世界坐标（不会被命中点抖动影响）
    activeDiskCenterW = c.group.getWorldPosition(new THREE.Vector3());

    // 半径：用 sizeScale 推一个“盘面范围”
    const sizeScale = c.preset?.shape?.sizeScale ?? 1.0;
    const groupScale = c.group.scale?.x ?? 1.0;

    // 这个系数决定“容错盘面”的大致半径
    activeDiskRadiusW = 1.9 * sizeScale * groupScale;
  }

  function updateNdcRadii() {
    if (!activeDiskCenterW) return;

    // 将中心投影到 NDC
    const centerN = activeDiskCenterW.clone().project(camera);

    // 取相机右方向，在世界里偏移一个 radiusW，投影后得到屏幕半径（NDC）
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const edgeW = activeDiskCenterW.clone().add(right.multiplyScalar(activeDiskRadiusW));
    const edgeN = edgeW.project(camera);

    const r = Math.hypot(edgeN.x - centerN.x, edgeN.y - centerN.y);

    // 外圈半径：允许演奏的最大范围（加个下限避免太小）
    activeDiskOuterNDC = Math.max(0.10, Math.min(0.35, r));

    // 内圈死区：中心太近角度不稳定，留个 deadzone
    activeDiskInnerNDC = activeDiskOuterNDC * 0.18;
  }

  function update({ pointerNDC, pointerDown, move01, activeNebulaKey }) {
    updateNdcRadii();

    const out = {
      ok: false,
      inDisk: false,
      centerW: activeDiskCenterW,
      outerNDC: activeDiskOuterNDC,
      innerNDC: activeDiskInnerNDC,
      theta01: 0,
      r01: 0,
      step: undefined,
      bg: { isPlaying: false, vel01: 0, pitch01: 0.5, theta01: 0, step: undefined },
    };

    if (!pointerDown || !activeNebulaKey || !activeDiskCenterW || !pointerNDC) return out;

    const centerN = activeDiskCenterW.clone().project(camera);
    const dx = pointerNDC.x - centerN.x;
    const dy = pointerNDC.y - centerN.y;
    const dist = Math.hypot(dx, dy);

    // ✅ 容错演奏盘：在 outer 半径内、且避开中心死区
    const inDisk = dist <= activeDiskOuterNDC && dist >= activeDiskInnerNDC;

    out.ok = true;
    out.inDisk = inDisk;

    if (!inDisk) return out;

    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI * 2;
    const theta01 = ang / (Math.PI * 2);

    // ✅ r01: 0(靠近中心) -> 1(靠近外圈)
    const r01 = THREE.MathUtils.clamp(
      (dist - activeDiskInnerNDC) / Math.max(1e-6, (activeDiskOuterNDC - activeDiskInnerNDC)),
      0,
      1
    );

    const step = Math.floor(theta01 * steps) % steps;

    out.theta01 = theta01;
    out.r01 = r01;
    out.step = step;

    out.bg = {
      isPlaying: true,
      vel01: (typeof move01 === "number") ? move01 : 0,
      pitch01: r01,
      theta01,
      step,
    };

    return out;
  }

  function getState() {
    return {
      centerW: activeDiskCenterW,
      radiusW: activeDiskRadiusW,
      outerNDC: activeDiskOuterNDC,
      innerNDC: activeDiskInnerNDC,
    };
  }

  return { cacheFromNebula, update, getState };
}
