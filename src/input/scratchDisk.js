// src/input/scratchDisk.js
import * as THREE from "three";

/**
 * Local-Polar Scratch Disk (stable)
 * - 用“hitPoint(世界平面交点) -> nebula group 本地坐标”计算极坐标
 * - 跟随 nebula group 旋转/缩放，不会出现“点到旁边/角度漂移”
 * - 内置轻微 hold，避免边缘抖动导致背景/音频频闪
 */
export function createScratchDisk({ camera, nebulaSystem, steps = 16 }) {
  let activeDiskCenterW = null;   // world center (for planeY + debug)
  let activePlaneY = 0;

  // LOCAL 半径：和 group.worldToLocal 对齐
  let activeDiskRadiusL = 1.8;
  let activeDiskInnerL = 0.15;

  let activeGroup = null;
  let _holdUntilMs = 0;

  const _raycaster = new THREE.Raycaster();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hitW = new THREE.Vector3();
  const _hitL = new THREE.Vector3();

  function cacheFromNebula(galaxyId) {
    activeGroup = null;
    activeDiskCenterW = null;
    if (!galaxyId) return;

    const c = nebulaSystem.getCluster?.(galaxyId);
    if (!c?.group) return;

    activeGroup = c.group;
    activeDiskCenterW = c.group.getWorldPosition(new THREE.Vector3());
    activePlaneY = activeDiskCenterW.y;

    const sizeScale = c.preset?.shape?.sizeScale ?? 1.0;

    // ✅ 与 note hint / gp.worldToLocal 对齐：本地半径不乘 groupScale
    activeDiskRadiusL = 1.9 * sizeScale;

    // 中心死区，避免角度抖动
    activeDiskInnerL = Math.max(0.08, activeDiskRadiusL * 0.18);
  }

  function getHitOnActivePlane(pointerNDC) {
    if (!activeDiskCenterW || !pointerNDC) return null;

    _plane.normal.set(0, 1, 0);
    _plane.constant = -activePlaneY;

    _raycaster.setFromCamera(pointerNDC, camera);
    const ok = _raycaster.ray.intersectPlane(_plane, _hitW);
    return ok ? _hitW : null;
  }

  function update({ pointerNDC, pointerDown, move01, activeNebulaKey }) {
    const out = {
      ok: false,
      inDisk: false,
      centerW: activeDiskCenterW,
      radiusL: activeDiskRadiusL,
      innerL: activeDiskInnerL,
      planeY: activePlaneY,
      theta01: 0,
      r01: 0,
      step: undefined,
      bg: {
        isPlaying: false,
        vel01: 0,
        pitch01: 0.5,
        theta01: 0,
        step: undefined,
      },
    };

    if (!pointerDown || !activeNebulaKey || !activeGroup || !pointerNDC) return out;

    const hitW = getHitOnActivePlane(pointerNDC);
    if (!hitW) return out;

    // ✅ 关键：用 group.worldToLocal，跟随旋转/缩放
    _hitL.copy(hitW);
    activeGroup.worldToLocal(_hitL);

    const dx = _hitL.x;
    const dz = _hitL.z;
    const distL = Math.hypot(dx, dz);

    const inDiskNow = distL <= activeDiskRadiusL && distL >= activeDiskInnerL;

    out.ok = true;

    const nowMs = performance.now();
    if (inDiskNow) _holdUntilMs = nowMs + 120;
    const inDisk = inDiskNow || (nowMs < _holdUntilMs);

    out.inDisk = inDisk;
    if (!inDisk) return out;

    // clamp dist inside for stable r01 while holding
    const distClamped = Math.min(activeDiskRadiusL, Math.max(activeDiskInnerL, distL));

    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;

    const theta01 = ang / (Math.PI * 2);

    const r01 = THREE.MathUtils.clamp(
      (distClamped - activeDiskInnerL) /
        Math.max(1e-6, activeDiskRadiusL - activeDiskInnerL),
      0,
      1
    );

    const step = Math.floor(theta01 * steps) % steps;

    out.theta01 = theta01;
    out.r01 = r01;
    out.step = step;

    out.bg = {
      isPlaying: true,
      vel01: typeof move01 === "number" ? move01 : 0,
      pitch01: r01,
      theta01,
      step,
    };

    return out;
  }

  function getState() {
    return {
      centerW: activeDiskCenterW,
      radiusL: activeDiskRadiusL,
      innerL: activeDiskInnerL,
      planeY: activePlaneY,
    };
  }

  return { cacheFromNebula, update, getState };
}
