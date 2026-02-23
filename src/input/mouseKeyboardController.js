// src/input/mouseKeyboardController.js
export function createMouseKeyboardController(domElement = window) {
  const input = {
    mouse01: { x: 0.5, y: 0.5 },
    mouseDown: false,
    shiftDown: false,

    // drag rotation
    dragDX: 0,
    rotation: 0,

    // energy from mouse speed
    energy: 0,
    // targets
    pitch: 0.5,
    texture: 0.5,
    rhythmDensity: 0.3,
  };

  //Tempo ring
  let isDraggingTempo = false;
  let lastAngle = 0;

  const TEMPO_RING_CENTER = { x: 0.5, y: 0.5 }; // 屏幕中心（NDC 或 0..1）
  const TEMPO_RING_RADIUS = 0.25;
  const TEMPO_RING_WIDTH = 0.05;

  function onMouseDown(e) {
    const p = getNormalizedMouse(e); // 0..1
    const dx = p.x - TEMPO_RING_CENTER.x;
    const dy = p.y - TEMPO_RING_CENTER.y;
    const r = Math.sqrt(dx*dx + dy*dy);

    if (Math.abs(r - TEMPO_RING_RADIUS) < TEMPO_RING_WIDTH) {
      isDraggingTempo = true;
      lastAngle = Math.atan2(dy, dx);
    }
  }

  function onMouseMove(e) {
    if (!isDraggingTempo) return;

    const p = getNormalizedMouse(e);
    const dx = p.x - TEMPO_RING_CENTER.x;
    const dy = p.y - TEMPO_RING_CENTER.y;
    const angle = Math.atan2(dy, dx);

    let dTheta = angle - lastAngle;

    // 防止突然跳
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;

    lastAngle = angle;

    // ⭐ 核心映射：角度变化 → bpm
    const BPM_SENSITIVITY = 30; // 你之后可以微调
    targets.tempoBpm =
      perf.state.tempoBpm + dTheta * BPM_SENSITIVITY;
  }

  function onMouseUp() {
    isDraggingTempo = false;
  }



  let lastX = 0, lastY = 0, lastT = performance.now();

  function onMove(e) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;

    input.mouse01.x = e.clientX / w;
    input.mouse01.y = 1 - e.clientY / h;

    // mouse speed -> energy
    const now = performance.now();
    const dt = Math.max(1, now - lastT); // ms
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px/ms
    lastX = e.clientX; lastY = e.clientY; lastT = now;

    // map speed to 0..1 (tune constants)
    const speed01 = Math.max(0, Math.min(1, (speed - 0.2) / 1.2));
    // shift acts like "climax lever"
    const boost = input.shiftDown ? 0.35 : 0.0;

    input.energy = Math.max(input.energy * 0.92, Math.min(1, speed01 + boost));

    // pitch/texture targets
    input.pitch = input.mouse01.x;
    input.texture = input.mouse01.y;

    if (input.mouseDown) {
      input.dragDX += dx;
    }
  }

  function onDown() { input.mouseDown = true; input.dragDX = 0; }
  function onUp() { input.mouseDown = false; input.dragDX = 0; }

  // function onWheel(e) {
  //   const delta = Math.sign(e.deltaY);
  //   input.rhythmDensity = Math.max(0, Math.min(1, input.rhythmDensity - delta * 0.05));
  // }

  function onKeyDown(e) {
    if (e.key === "Shift") input.shiftDown = true;

    if (e.key === "q" || e.key === "Q") input.rhythmDensity = Math.max(0, input.rhythmDensity - 0.08);
    if (e.key === "e" || e.key === "E") input.rhythmDensity = Math.min(1, input.rhythmDensity + 0.08);

    // A/D rotation nudge
    if (e.key === "a" || e.key === "A") input.rotation = Math.max(-1, input.rotation - 0.15);
    if (e.key === "d" || e.key === "D") input.rotation = Math.min(1, input.rotation + 0.15);
  }

  function onKeyUp(e) {
    if (e.key === "Shift") input.shiftDown = false;
  }

  domElement.addEventListener("mousemove", onMove);
  domElement.addEventListener("mousedown", onDown);
  domElement.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return {
    input,

    // called each frame to compute rotation from drag
    update(dt) {
      // dragDX -> rotation target (disc scratch feel)
      const rotFromDrag = Math.max(-1, Math.min(1, input.dragDX / 600));
      // combine with keyboard nudges
      input.rotation *= Math.exp(-dt * 2.5);
      const rotation = Math.max(-1, Math.min(1, input.rotation + rotFromDrag));

      return {
        rotation,
        energy: input.energy,
        pitch: input.pitch,
        texture: input.texture,
        rhythmDensity: input.rhythmDensity,
      };
    },

    // trigger events
    isTriggerEvent(e) {
      return e?.type === "mousedown" || e?.type === "pointerdown";
    },

    dispose() {
      domElement.removeEventListener("mousemove", onMove);
      domElement.removeEventListener("mousedown", onDown);
      domElement.removeEventListener("mouseup", onUp);
      domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}