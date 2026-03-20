// src/input/cameraControlSystem.js
import * as THREE from "three";

/**
 * Unified camera control for GalaxySynth:
 * - Alt + Left Drag   : orbit around target
 * - Alt + Middle Drag : pan (screen-space)
 * - Wheel             : zoom to cursor pivot (via getPivotWorldPoint)
 * - notePulse()       : cinematic micro pulse (non-drifting)
 *
 * Design goal: keep ONE source of truth for camera pivot/target + orbit params,
 * so wheel/pan/orbit never fight each other.
 */
export function createCameraControlSystem({
  camera,
  domElement,
  target = new THREE.Vector3(0, 0, 0),

  // orbit
  orbitEnabled = true,
  orbitSpeed = 0.005,
  orbitPitchMin = -1.25,
  orbitPitchMax = 1.25,

  // pan
  panEnabled = true,
  panSpeed = 1.0,

  // zoom
  zoomEnabled = true,
  zoomSpeed = 0.0018,     // used with exp(deltaY * zoomSpeed)
  minDistance = 1.2,
  maxDistance = 60.0,
  zoomRequiresAlt = false,

  // Pivot under cursor (e.g. intersect y=0 plane).
  // Signature: (clientX:number, clientY:number) => THREE.Vector3 | null
  getPivotWorldPoint = null,

  // --- cinematic tuning ---
  pulseEnabled = true,
  pulseStrength = 1.0,   // overall multiplier
  pulseMax = 0.35,       // clamp impulse
  pulseDamping = 12.0,   // higher = quicker settle
  pulseSpring = 120.0,   // higher = snappier

  // optional: ignore UI overlays
  shouldIgnoreEvent = (e) => !!(e?.target?.closest?.(".lil-gui") || e?.target?.closest?.(".dg")),
} = {}) {
  if (!camera || !domElement) {
    throw new Error("CameraControlSystem requires camera and domElement");
  }

  // -------------------------
  // Internal orbit state (spherical around target)
  // -------------------------
  const orbit = {
    yaw: 0,
    pitch: 0,
    radius: 1,
  };

  function syncOrbitFromCamera() {
    const v = camera.position.clone().sub(target);
    orbit.radius = Math.max(1e-6, v.length());
    orbit.yaw = Math.atan2(v.x, v.z);
    orbit.pitch = Math.asin(THREE.MathUtils.clamp(v.y / orbit.radius, -1, 1));
  }

  function applyOrbitToCamera() {
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch, orbitPitchMin, orbitPitchMax);
    orbit.radius = THREE.MathUtils.clamp(orbit.radius, minDistance, maxDistance);

    const cp = Math.cos(orbit.pitch);
    camera.position.set(
      target.x + orbit.radius * Math.sin(orbit.yaw) * cp,
      target.y + orbit.radius * Math.sin(orbit.pitch),
      target.z + orbit.radius * Math.cos(orbit.yaw) * cp
    );
    camera.lookAt(target);
  }

  syncOrbitFromCamera();

  // -------------------------
  // Pointer interaction state
  // -------------------------
  const state = {
    isOrbiting: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,

    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),

    _tmp: new THREE.Vector3(),
  };

  function getMouseNDCFromClient(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }

  function getPivot(clientX, clientY) {
    if (typeof getPivotWorldPoint === "function") {
      const p = getPivotWorldPoint(clientX, clientY);
      if (p) return p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
    }
    // fallback: zoom toward center target
    return target.clone();
  }

  function pan(dx, dy) {
    if (!panEnabled) return;

    const rect = domElement.getBoundingClientRect();
    const h = Math.max(1, rect.height);

    camera.getWorldDirection(state.forward);
    state.right.copy(state.forward).cross(camera.up).normalize();
    state.up.copy(camera.up).normalize();

    let worldPerPixel = 1.0;
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(target);
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const worldHeight = 2 * Math.tan(vFov / 2) * distance;
      worldPerPixel = worldHeight / h;
    } else if (camera.isOrthographicCamera) {
      worldPerPixel = (camera.top - camera.bottom) / h;
    }

    const moveX = -dx * worldPerPixel * panSpeed;
    const moveY = dy * worldPerPixel * panSpeed;

    const delta = new THREE.Vector3()
      .addScaledVector(state.right, moveX)
      .addScaledVector(state.up, moveY);

    camera.position.add(delta);
    target.add(delta);

    // keep orbit params coherent
    syncOrbitFromCamera();
  }

  function onPointerDown(e) {
    if (shouldIgnoreEvent(e)) return;
    if (!e.altKey) return;

    // Alt+Left: orbit
    if (orbitEnabled && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();

      state.isOrbiting = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;

      try { domElement.setPointerCapture?.(e.pointerId); } catch {}
      return;
    }

    // Alt+Middle: pan
    if (panEnabled && e.button === 1) {
      e.preventDefault();
      e.stopPropagation();

      state.isPanning = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;

      try { domElement.setPointerCapture?.(e.pointerId); } catch {}
      return;
    }
  }

  function onPointerUp(e) {
    if (state.isOrbiting || state.isPanning) {
      e.preventDefault();
      e.stopPropagation();
    }

    state.isOrbiting = false;
    state.isPanning = false;

    try { domElement.releasePointerCapture?.(e.pointerId); } catch {}
  }

  function onPointerMove(e) {
    if (!(state.isOrbiting || state.isPanning)) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    if (state.isOrbiting) {
      orbit.yaw   += dx * orbitSpeed;
      orbit.pitch += dy * orbitSpeed;
      applyOrbitToCamera();
      return;
    }

    if (state.isPanning) {
      pan(dx, dy);
    }
  }

  function onWheel(e) {
    if (!zoomEnabled) return;
    if (shouldIgnoreEvent(e)) return;
    if (zoomRequiresAlt && !e.altKey) return;

    // prevent page scroll
    e.preventDefault();
    e.stopPropagation();

    const clientX = e.clientX;
    const clientY = e.clientY;

    const pivot = getPivot(clientX, clientY);
    if (!pivot) return;

    const factor = Math.exp(e.deltaY * zoomSpeed); // deltaY>0 => zoom out

    if (camera.isPerspectiveCamera) {
      // 1) move camera around pivot
      const toCam = camera.position.clone().sub(pivot);
      toCam.multiplyScalar(factor);
      camera.position.copy(pivot.clone().add(toCam));

      // 2) clamp distance to pivot
      const dist = camera.position.distanceTo(pivot);
      if (dist < minDistance) {
        camera.position.copy(pivot).add(camera.position.clone().sub(pivot).setLength(minDistance));
      } else if (dist > maxDistance) {
        camera.position.copy(pivot).add(camera.position.clone().sub(pivot).setLength(maxDistance));
      }

      // 3) cursor lock correction (keeps the pivot world point under cursor)
      if (typeof getPivotWorldPoint === "function") {
        const after = getPivotWorldPoint(clientX, clientY);
        if (after) {
          const correction = pivot.clone().sub(after);
          camera.position.add(correction);
          target.add(correction);
        }
      }

      syncOrbitFromCamera();
      camera.lookAt(target);
      return;
    }

    if (camera.isOrthographicCamera) {
      const { x, y } = getMouseNDCFromClient(clientX, clientY);
      const before = new THREE.Vector3(x, y, 0).unproject(camera);

      camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, 0.05, 200);
      camera.updateProjectionMatrix();

      const after = new THREE.Vector3(x, y, 0).unproject(camera);

      const delta = before.sub(after);
      camera.position.add(delta);
      target.add(delta);

      syncOrbitFromCamera();
      camera.lookAt(target);
    }
  }

  function onAuxClick(e) {
    // prevent middle click auto-scroll
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
  domElement.addEventListener("pointermove", onPointerMove, { passive: false });
  domElement.addEventListener("pointerup", onPointerUp, { passive: false });
  domElement.addEventListener("pointercancel", onPointerUp, { passive: false });
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("auxclick", onAuxClick, { passive: false });

  // -------------------------
  // Cinematic micro pulse (non-drifting)
  // -------------------------
  const pulse = {
    offset: new THREE.Vector3(),
    vel: new THREE.Vector3(),

    dolly: 0,
    dollyVel: 0,

    camFwd: new THREE.Vector3(),
    camRight: new THREE.Vector3(),
    camUp: new THREE.Vector3(),

    // last applied (so we apply delta each frame)
    lastAppliedOffset: new THREE.Vector3(),
    lastAppliedDolly: 0,
  };

  function notePulse(strength = 0.15, worldPoint = null) {
    if (!pulseEnabled) return;

    // clamp strength
    let s = Math.min(pulseMax, Math.max(0, strength)) * pulseStrength;

    camera.getWorldDirection(pulse.camFwd);
    pulse.camRight.copy(pulse.camFwd).cross(camera.up).normalize();
    pulse.camUp.copy(camera.up).normalize();

    let bias = new THREE.Vector3(0, 0, 0);
    if (worldPoint) {
      bias.copy(worldPoint).sub(camera.position).normalize();
    }

    const lateral = (Math.random() * 2 - 1) * 0.55;
    const vertical = (Math.random() * 2 - 1) * 0.35;

    const impulse = new THREE.Vector3()
      .addScaledVector(pulse.camRight, lateral * s)
      .addScaledVector(pulse.camUp, vertical * s)
      .addScaledVector(bias, 0.25 * s);

    pulse.vel.add(impulse);

    // subtle dolly breath
    pulse.dollyVel += (0.06 + 0.10 * s) * (Math.random() > 0.5 ? 1 : -1);
  }

  function update(dt) {
    if (!pulseEnabled) return;

    const k = pulseSpring;
    const d = pulseDamping;

    // spring physics
    const ax = pulse.offset.clone().multiplyScalar(-k).add(pulse.vel.clone().multiplyScalar(-d));
    pulse.vel.addScaledVector(ax, dt);
    pulse.offset.addScaledVector(pulse.vel, dt);

    const ad = (-k * pulse.dolly) + (-d * pulse.dollyVel);
    pulse.dollyVel += ad * dt;
    pulse.dolly += pulse.dollyVel * dt;

    // apply deltas (avoid accumulation drift)
    const dOff = pulse.offset.clone().sub(pulse.lastAppliedOffset);
    const dDol = pulse.dolly - pulse.lastAppliedDolly;

    camera.getWorldDirection(pulse.camFwd);
    camera.position.add(dOff);
    camera.position.addScaledVector(pulse.camFwd, dDol);

    pulse.lastAppliedOffset.copy(pulse.offset);
    pulse.lastAppliedDolly = pulse.dolly;
  }

  function dispose() {
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointermove", onPointerMove);
    domElement.removeEventListener("pointerup", onPointerUp);
    domElement.removeEventListener("pointercancel", onPointerUp);
    domElement.removeEventListener("wheel", onWheel);
    domElement.removeEventListener("auxclick", onAuxClick);
  }

  return {
    dispose,
    update,
    notePulse,

    // target API
    setTarget(v) {
      target.copy(v);
      syncOrbitFromCamera();
      camera.lookAt(target);
    },
    getTarget() {
      return target.clone();
    },

    getDistanceLimits() {
      return { minDistance, maxDistance };
    },
    setDistanceLimits(next = {}) {
      if (Number.isFinite(next.minDistance)) minDistance = Math.max(0.05, Number(next.minDistance));
      if (Number.isFinite(next.maxDistance)) maxDistance = Math.max(minDistance, Number(next.maxDistance));
      syncOrbitFromCamera();
      applyOrbitToCamera();
    },

    // orbit API (optional)
    syncOrbitFromCamera,
    applyOrbitToCamera,

    // pulse API
    setPulseEnabled(v) { pulseEnabled = !!v; },
  };
}
