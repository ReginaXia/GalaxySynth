// src/input/cameraControlSystem.js
import * as THREE from "three";

export function createCameraControlSystem({
  camera,
  domElement,
  target = new THREE.Vector3(0, 0, 0),
  panSpeed = 1.0,

  // --- cinematic tuning ---
  pulseEnabled = true,
  pulseStrength = 1.0,   // overall multiplier
  pulseMax = 0.35,       // clamp impulse
  pulseDamping = 12.0,   // higher = quicker settle
  pulseSpring = 120.0,   // higher = snappier
} = {}) {
  if (!camera || !domElement) {
    throw new Error("CameraControlSystem requires camera and domElement");
  }

  // -------------------------
  // Alt + Middle Mouse Pan
  // -------------------------
  const state = {
    isPanning: false,
    lastX: 0,
    lastY: 0,
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  };

  function onPointerDown(e) {
    if (!(e.altKey && e.button === 1)) return;
    e.preventDefault();
    e.stopPropagation();
    state.isPanning = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (!state.isPanning) return;
    e.preventDefault();
    e.stopPropagation();
    state.isPanning = false;
  }

  function onPointerMove(e) {
    if (!state.isPanning) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    pan(dx, dy);
  }

  function pan(dx, dy) {
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
  }

  function onAuxClick(e) {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
  domElement.addEventListener("pointermove", onPointerMove, { passive: false });
  domElement.addEventListener("pointerup", onPointerUp, { passive: false });
  domElement.addEventListener("pointercancel", onPointerUp, { passive: false });
  domElement.addEventListener("auxclick", onAuxClick, { passive: false });

  // -------------------------
  // Cinematic micro pulse
  // -------------------------
  const pulse = {
    // offset in world space applied to camera each frame
    offset: new THREE.Vector3(),
    vel: new THREE.Vector3(),

    // dolly (forward/back) scalar
    dolly: 0,
    dollyVel: 0,

    // cached basis
    camFwd: new THREE.Vector3(),
    camRight: new THREE.Vector3(),
    camUp: new THREE.Vector3(),
  };

  function notePulse(strength = 0.15, worldPoint = null) {
    if (!pulseEnabled) return;

    // clamp strength
    let s = Math.min(pulseMax, Math.max(0, strength)) * pulseStrength;

    // compute camera basis
    camera.getWorldDirection(pulse.camFwd);
    pulse.camRight.copy(pulse.camFwd).cross(camera.up).normalize();
    pulse.camUp.copy(camera.up).normalize();

    // If a worldPoint is given, bias impulse direction toward it (subtle)
    // This helps readability: you feel the pulse where you played.
    let bias = new THREE.Vector3(0, 0, 0);
    if (worldPoint) {
      bias.copy(worldPoint).sub(camera.position).normalize();
    }

    // Create a tiny impulse:
    // - lateral & vertical jitter (readable, not nauseating)
    // - slight dolly (breathing)
    const lateral = (Math.random() * 2 - 1) * 0.55;
    const vertical = (Math.random() * 2 - 1) * 0.35;

    const impulse = new THREE.Vector3()
      .addScaledVector(pulse.camRight, lateral * s)
      .addScaledVector(pulse.camUp, vertical * s)
      .addScaledVector(bias, 0.25 * s);

    pulse.vel.add(impulse);

    // dolly: closer on stronger note
    pulse.dollyVel += (0.06 + 0.10 * s) * (Math.random() > 0.5 ? 1 : -1);
  }

  // critically damped-ish spring back to zero
  function update(dt) {
    if (!pulseEnabled) return;

    const k = pulseSpring;
    const d = pulseDamping;

    // offset spring
    // a = -k*x - d*v
    const ax = pulse.offset.clone().multiplyScalar(-k).add(pulse.vel.clone().multiplyScalar(-d));
    pulse.vel.addScaledVector(ax, dt);
    pulse.offset.addScaledVector(pulse.vel, dt);

    // dolly spring
    const ad = (-k * pulse.dolly) + (-d * pulse.dollyVel);
    pulse.dollyVel += ad * dt;
    pulse.dolly += pulse.dollyVel * dt;

    // apply to camera (non-destructive: we apply relative each frame)
    // We apply along camera forward direction for dolly
    camera.getWorldDirection(pulse.camFwd);
    camera.position.addScaledVector(pulse.offset, 1.0);
    camera.position.addScaledVector(pulse.camFwd, pulse.dolly);
  }

  function dispose() {
    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("pointermove", onPointerMove);
    domElement.removeEventListener("pointerup", onPointerUp);
    domElement.removeEventListener("pointercancel", onPointerUp);
    domElement.removeEventListener("auxclick", onAuxClick);
  }

  return {
    dispose,
    update,
    notePulse,

    setTarget(v) { target.copy(v); },
    getTarget() { return target.clone(); },

    setPulseEnabled(v) { pulseEnabled = !!v; },
  };
}