// src/input/pointerState.js
export function createPointerState(dom) {
  const s = {
    ndc: { x: 0, y: 0 },
    mouse01: { x: 0.5, y: 0.5 },
    isDown: false,
    move01: 0,
    _lastX: 0,
    _lastY: 0,
    _v: 0,
  };

  function onMove(e) {
    const r = dom.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;

    s.mouse01.x = x;
    s.mouse01.y = y;

    s.ndc.x = x * 2 - 1;
    s.ndc.y = -(y * 2 - 1);

    const dx = e.clientX - s._lastX;
    const dy = e.clientY - s._lastY;
    s._lastX = e.clientX;
    s._lastY = e.clientY;

    // 鼠标速度估计（粗略即可），归一化成 0..1
    const speed = Math.sqrt(dx * dx + dy * dy);
    s._v = Math.min(1, s._v * 0.85 + speed / 80);
  }

  function onDown() { s.isDown = true; }
  function onUp() { s.isDown = false; }

  dom.addEventListener("pointermove", onMove);
  dom.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);

  function update() {
    // 每帧把 move01 缓慢回落，避免抖
    s.move01 = s._v;
    s._v *= 0.92;
  }

  function dispose() {
    dom.removeEventListener("pointermove", onMove);
    dom.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
  }

  return { ...s, update, dispose, state: s };
}