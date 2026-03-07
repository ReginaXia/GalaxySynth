import * as THREE from "three";
import { clamp01, mapThetaRToNoteIntent } from "../music/noteMapping.js";

function computePolarFromInteractionDisk(cluster, pointerNDC, camera, nebulaSystem) {
  if (!cluster?.group || !pointerNDC || !camera) return null;
  const raycaster = new THREE.Raycaster();
  const localPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // true nebula-local disk plane (y=0)
  const hitL = new THREE.Vector3();
  const hitW = new THREE.Vector3();
  const invWorld = cluster.group.matrixWorld.clone().invert();

  raycaster.setFromCamera(pointerNDC, camera);
  const rayLocal = raycaster.ray.clone().applyMatrix4(invWorld);
  const ok = rayLocal.intersectPlane(localPlane, hitL);
  if (!ok) return null;
  hitW.copy(hitL);
  cluster.group.localToWorld(hitW);

  const dx = hitL.x;
  const dz = hitL.z;
  const dist = Math.hypot(dx, dz);
  const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
  const baseUIRadius = nebulaSystem?.attractionUI?.radius ?? 1.55;
  const radius = Math.max(1e-4, baseUIRadius * sizeScale);
  const inner = Math.max(0.08, radius * 0.18);

  let ang = Math.atan2(dz, dx);
  if (ang < 0) ang += Math.PI * 2;
  const theta01 = ang / (Math.PI * 2);
  const r01 = clamp01((Math.min(radius, Math.max(inner, dist)) - inner) / Math.max(1e-6, radius - inner));

  return {
    theta01,
    r01,
    inDisk: dist <= radius && dist >= inner,
    hitWorld: hitW.clone(),
  };
}

export function resolveNoteIntent({
  galaxyId = null,
  nebulaSystem = null,
  pointerNDC = null,
  camera = null,
  nowMs = performance.now(),
}) {
  if (!galaxyId) return null;

  const cluster = nebulaSystem?.getCluster?.(galaxyId) ?? null;
  const polar = computePolarFromInteractionDisk(cluster, pointerNDC, camera, nebulaSystem);

  if (!polar) return null;

  return mapThetaRToNoteIntent({
    galaxyId,
    theta01: polar.theta01,
    r01: polar.r01,
    timeMs: nowMs,
    inDisk: polar.inDisk,
    hitWorld: polar.hitWorld,
  });
}

export function shouldSwitchByHysteresis(prevIntent, nextIntent, margin = 0.18, steps = 7) {
  if (!prevIntent || !nextIntent) return false;
  if (prevIntent.galaxyId !== nextIntent.galaxyId) return true;

  const s = Math.max(1, steps | 0);
  const x = clamp01(nextIntent.theta01) * s;
  const center = (prevIntent.step ?? 0) + 0.5;
  let d = x - center;
  d = ((d + s / 2) % s) - s / 2;
  const keepZone = 0.5 - margin;
  return Math.abs(d) > keepZone;
}
