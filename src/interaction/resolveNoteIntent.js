import { clamp01, mapThetaRToNoteIntent } from "../music/noteMapping.js";

function computePolarFromClusterWorldPoint(cluster, worldPoint) {
  if (!cluster?.group || !worldPoint) return null;
  const local = worldPoint.clone();
  cluster.group.worldToLocal(local);

  const dx = local.x;
  const dz = local.z;
  const dist = Math.hypot(dx, dz);
  const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
  const radius = Math.max(1e-4, 1.9 * sizeScale);
  const inner = Math.max(0.08, radius * 0.18);

  let ang = Math.atan2(dz, dx);
  if (ang < 0) ang += Math.PI * 2;
  const theta01 = ang / (Math.PI * 2);
  const r01 = clamp01((Math.min(radius, Math.max(inner, dist)) - inner) / Math.max(1e-6, radius - inner));

  return {
    theta01,
    r01,
    inDisk: dist <= radius && dist >= inner,
  };
}

function computePolarFromProjectedDisk({
  pointerNDC,
  camera,
  diskCenterW,
  diskInnerNDC,
  diskOuterNDC,
}) {
  if (!pointerNDC || !camera || !diskCenterW) return null;
  const centerN = diskCenterW.clone().project(camera);
  const dx = pointerNDC.x - centerN.x;
  const dy = pointerNDC.y - centerN.y;
  const dist = Math.hypot(dx, dy);
  const inner = Math.max(0, Number.isFinite(diskInnerNDC) ? diskInnerNDC : 0);
  const outer = Math.max(inner + 1e-6, Number.isFinite(diskOuterNDC) ? diskOuterNDC : inner + 0.12);

  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI * 2;

  return {
    theta01: ang / (Math.PI * 2),
    r01: clamp01((Math.min(outer, Math.max(inner, dist)) - inner) / Math.max(1e-6, outer - inner)),
    inDisk: dist <= outer && dist >= inner,
  };
}

export function resolveNoteIntent({
  mode = "hover",
  galaxyId = null,
  nebulaHit = null,
  nebulaSystem = null,
  pointerNDC = null,
  camera = null,
  diskCenterW = null,
  diskInnerNDC = 0.02,
  diskOuterNDC = 0.18,
  nowMs = performance.now(),
}) {
  if (!galaxyId) return null;

  let polar = null;
  if (mode === "active") {
    polar = computePolarFromProjectedDisk({
      pointerNDC,
      camera,
      diskCenterW,
      diskInnerNDC,
      diskOuterNDC,
    });
  } else {
    const cluster = nebulaSystem?.getCluster?.(galaxyId) ?? null;
    const worldPoint = nebulaHit?.point ?? null;
    polar = computePolarFromClusterWorldPoint(cluster, worldPoint);
  }

  if (!polar) return null;
  if (mode === "active" && !polar.inDisk) return null;

  return mapThetaRToNoteIntent({
    galaxyId,
    theta01: polar.theta01,
    r01: polar.r01,
    timeMs: nowMs,
    inDisk: polar.inDisk,
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
