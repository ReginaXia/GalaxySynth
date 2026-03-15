import * as THREE from "three";

function damp01(current, target, smoothing, dt) {
  return THREE.MathUtils.damp(current, target, smoothing, dt);
}

function getNebulaFocusData(nebulaSystem, galaxyId, outCenter) {
  if (!galaxyId) return null;
  const cluster = nebulaSystem?.getCluster?.(galaxyId);
  if (!cluster?.group) return null;

  outCenter.set(0, 0, 0);
  cluster.group.localToWorld(outCenter);

  const sizeScale = cluster?.preset?.shape?.sizeScale ?? 1.0;
  const lengthScale = cluster?.preset?.shape?.length ?? 1.0;
  const groupScale = cluster?.group?.scale?.x ?? 1.0;
  const radius = Math.max(0.8, 1.9 * sizeScale * lengthScale * groupScale);

  return {
    galaxyId,
    center: outCenter,
    radius,
  };
}

export function createPerformanceCameraController({
  hoverEnabled = true,
  hoverActivationDelay = 0.12,
  hoverReleaseGrace = 0.08,
  hoverBlendIn = 4.8,
  hoverBlendOut = 2.3,
  hoverLookFraction = 0.13,
  hoverPositionFraction = 0.055,
  hoverLookMaxDistanceFactor = 0.085,
  hoverPositionMaxDistanceFactor = 0.04,
  hoverDollyFactor = 0.03,
  hoverDollyMax = 0.42,
  pulseEnabled = false,
  idleEnabled = false,
} = {}) {
  const hover = {
    candidateId: null,
    candidateTime: 0,
    lossTime: 0,
    activeId: null,
    targetCenter: new THREE.Vector3(),
    smoothCenter: new THREE.Vector3(),
    radius: 1.0,
    weight: 0.0,
  };

  const offsets = {
    hover: {
      positionOffset: new THREE.Vector3(),
      lookAtOffset: new THREE.Vector3(),
      distanceOffset: 0,
      rollOffset: 0,
    },
    pulse: {
      enabled: pulseEnabled,
      positionOffset: new THREE.Vector3(),
      lookAtOffset: new THREE.Vector3(),
      distanceOffset: 0,
      rollOffset: 0,
      pending: 0,
    },
    idle: {
      enabled: idleEnabled,
      positionOffset: new THREE.Vector3(),
      lookAtOffset: new THREE.Vector3(),
      distanceOffset: 0,
      rollOffset: 0,
      phase: 0,
    },
    composed: {
      positionOffset: new THREE.Vector3(),
      lookAtOffset: new THREE.Vector3(),
      distanceOffset: 0,
      rollOffset: 0,
    },
  };

  const applied = {
    active: false,
    baseTarget: new THREE.Vector3(),
    positionDelta: new THREE.Vector3(),
  };

  const scratch = {
    center: new THREE.Vector3(),
    toHover: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  };

  function resetVec4Layer(layer) {
    layer.positionOffset.set(0, 0, 0);
    layer.lookAtOffset.set(0, 0, 0);
    layer.distanceOffset = 0;
    layer.rollOffset = 0;
  }

  function beginFrame(camera) {
    if (!applied.active) return;
    camera.position.sub(applied.positionDelta);
    camera.lookAt(applied.baseTarget);
    applied.active = false;
    applied.positionDelta.set(0, 0, 0);
  }

  function updateStableHover(dt, hoveredNebulaId, nebulaSystem) {
    if (!hoverEnabled || !hoveredNebulaId) {
      hover.candidateId = null;
      hover.candidateTime = 0;
      hover.lossTime += dt;
      if (hover.lossTime >= hoverReleaseGrace) hover.activeId = null;
      return;
    }

    hover.lossTime = 0;

    if (hover.candidateId !== hoveredNebulaId) {
      hover.candidateId = hoveredNebulaId;
      hover.candidateTime = 0;
    } else {
      hover.candidateTime += dt;
    }

    if (hover.activeId === hoveredNebulaId || hover.candidateTime >= hoverActivationDelay) {
      hover.activeId = hoveredNebulaId;
      const info = getNebulaFocusData(nebulaSystem, hoveredNebulaId, scratch.center);
      if (info) {
        hover.targetCenter.copy(info.center);
        hover.radius = info.radius;
      }
    }
  }

  function updateHoverOffset(dt, camera, baseTarget, nebulaSystem) {
    resetVec4Layer(offsets.hover);

    const hasHover = hoverEnabled && !!hover.activeId;
    const targetWeight = hasHover ? 1.0 : 0.0;
    hover.weight = damp01(hover.weight, targetWeight, targetWeight > hover.weight ? hoverBlendIn : hoverBlendOut, dt);

    if (hover.weight <= 1e-4) return;

    const info = getNebulaFocusData(nebulaSystem, hover.activeId, scratch.center);
    if (info) {
      hover.targetCenter.copy(info.center);
      hover.radius = info.radius;
    }

    hover.smoothCenter.lerp(hover.targetCenter, 1.0 - Math.exp(-dt * 5.0));

    const cameraDistance = Math.max(1e-4, camera.position.distanceTo(baseTarget));
    const maxLookShift = cameraDistance * hoverLookMaxDistanceFactor;
    const maxPositionShift = cameraDistance * hoverPositionMaxDistanceFactor;

    scratch.toHover.copy(hover.smoothCenter).sub(baseTarget);

    offsets.hover.lookAtOffset
      .copy(scratch.toHover)
      .multiplyScalar(hoverLookFraction)
      .clampLength(0, maxLookShift)
      .multiplyScalar(hover.weight);

    offsets.hover.positionOffset
      .copy(scratch.toHover)
      .multiplyScalar(hoverPositionFraction)
      .clampLength(0, maxPositionShift)
      .multiplyScalar(hover.weight);

    offsets.hover.distanceOffset = -Math.min(hoverDollyMax, cameraDistance * hoverDollyFactor) * hover.weight;
  }

  function updatePulseOffset() {
    resetVec4Layer(offsets.pulse);
  }

  function updateIdleOffset(dt) {
    resetVec4Layer(offsets.idle);
    if (!offsets.idle.enabled) return;
    offsets.idle.phase += dt;
  }

  function composeOffsets() {
    offsets.composed.positionOffset
      .copy(offsets.hover.positionOffset)
      .add(offsets.pulse.positionOffset)
      .add(offsets.idle.positionOffset);

    offsets.composed.lookAtOffset
      .copy(offsets.hover.lookAtOffset)
      .add(offsets.pulse.lookAtOffset)
      .add(offsets.idle.lookAtOffset);

    offsets.composed.distanceOffset =
      offsets.hover.distanceOffset +
      offsets.pulse.distanceOffset +
      offsets.idle.distanceOffset;

    offsets.composed.rollOffset =
      offsets.hover.rollOffset +
      offsets.pulse.rollOffset +
      offsets.idle.rollOffset;
  }

  function update(dt, { camera, baseTarget, hoveredNebulaId = null, nebulaSystem } = {}) {
    if (!camera || !baseTarget) return getOffsets();

    updateStableHover(dt, hoveredNebulaId, nebulaSystem);
    updateHoverOffset(dt, camera, baseTarget, nebulaSystem);
    updatePulseOffset();
    updateIdleOffset(dt);
    composeOffsets();

    return getOffsets();
  }

  function apply(camera, baseTarget) {
    if (!camera || !baseTarget) return;

    const totalDistanceOffset = offsets.composed.distanceOffset;
    const hasOffset =
      offsets.composed.positionOffset.lengthSq() > 1e-8 ||
      offsets.composed.lookAtOffset.lengthSq() > 1e-8 ||
      Math.abs(totalDistanceOffset) > 1e-6 ||
      Math.abs(offsets.composed.rollOffset) > 1e-6;

    if (!hasOffset) return;

    scratch.forward.copy(baseTarget).sub(camera.position);
    if (scratch.forward.lengthSq() < 1e-8) scratch.forward.set(0, 0, -1);
    scratch.forward.normalize();

    applied.baseTarget.copy(baseTarget);
    applied.positionDelta
      .copy(offsets.composed.positionOffset)
      .addScaledVector(scratch.forward, totalDistanceOffset);

    camera.position.add(applied.positionDelta);
    camera.lookAt(scratch.center.copy(baseTarget).add(offsets.composed.lookAtOffset));
    applied.active = true;
  }

  function getOffsets() {
    return {
      positionOffset: offsets.composed.positionOffset.clone(),
      lookAtOffset: offsets.composed.lookAtOffset.clone(),
      distanceOffset: offsets.composed.distanceOffset,
      rollOffset: offsets.composed.rollOffset,
      hoverWeight: hover.weight,
      hoveredNebulaId: hover.activeId,
    };
  }

  function queueNotePulse(strength = 0) {
    offsets.pulse.pending = Math.max(offsets.pulse.pending, strength);
  }

  function setPulseEnabled(value) {
    offsets.pulse.enabled = !!value;
  }

  function setIdleEnabled(value) {
    offsets.idle.enabled = !!value;
  }

  return {
    beginFrame,
    update,
    apply,
    getOffsets,

    // MVP2 scaffold
    queueNotePulse,
    setPulseEnabled,

    // MVP3 scaffold
    setIdleEnabled,
  };
}
