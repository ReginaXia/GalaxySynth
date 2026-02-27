// src/input/scratchDisk.js
import * as THREE from "three";

/**
 * World-Polar Scratch Disk
 * 基于“星云所在世界平面”的极坐标计算
 * 与星云上世界空间布局的 note hint 100% 对齐
 */
export function createScratchDisk({ camera, nebulaSystem, steps = 16 }) {
  let activeDiskCenterW = null;
  let activeDiskRadiusW = 1.8;
  let activeDiskInnerW = 0.15;
  let activePlaneY = 0;

  const _raycaster = new THREE.Raycaster();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hit = new THREE.Vector3();
  const _v = new THREE.Vector3();

  // 选中星云时缓存中心与半径
  function cacheFromNebula(galaxyId) {
    if (!galaxyId) {
      activeDiskCenterW = null;
      return;
    }

    const c = nebulaSystem.getCluster?.(galaxyId);
    if (!c) return;

    activeDiskCenterW = c.group.getWorldPosition(new THREE.Vector3());
    activePlaneY = activeDiskCenterW.y;

    const sizeScale = c.preset?.shape?.sizeScale ?? 1.0;
    const groupScale = c.group.scale?.x ?? 1.0;

    activeDiskRadiusW = 1.9 * sizeScale * groupScale;

    // 中心死区，避免角度抖动
    activeDiskInnerW = Math.max(0.08, activeDiskRadiusW * 0.18);
  }

  function getHitOnActivePlane(pointerNDC) {
    if (!activeDiskCenterW || !pointerNDC) return null;

    _plane.normal.set(0, 1, 0);
    _plane.constant = -activePlaneY;

    _raycaster.setFromCamera(pointerNDC, camera);
    const ok = _raycaster.ray.intersectPlane(_plane, _hit);

    return ok ? _hit : null;
  }

  function update({ pointerNDC, pointerDown, move01, activeNebulaKey }) {
    const out = {
      ok: false,
      inDisk: false,
      centerW: activeDiskCenterW,
      radiusW: activeDiskRadiusW,
      innerW: activeDiskInnerW,
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

    if (
      !pointerDown ||
      !activeNebulaKey ||
      !activeDiskCenterW ||
      !pointerNDC
    ) {
      return out;
    }

    const hit = getHitOnActivePlane(pointerNDC);
    if (!hit) return out;

    _v.copy(hit).sub(activeDiskCenterW);

    const dx = _v.x;
    const dz = _v.z;
    const distW = Math.hypot(dx, dz);

    const inDisk =
      distW <= activeDiskRadiusW &&
      distW >= activeDiskInnerW;

    out.ok = true;
    out.inDisk = inDisk;

    if (!inDisk) return out;

    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;

    const theta01 = ang / (Math.PI * 2);

    const r01 = THREE.MathUtils.clamp(
      (distW - activeDiskInnerW) /
        Math.max(1e-6, activeDiskRadiusW - activeDiskInnerW),
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
      radiusW: activeDiskRadiusW,
      innerW: activeDiskInnerW,
      planeY: activePlaneY,
    };
  }

  return {
    cacheFromNebula,
    update,
    getState,
  };
}