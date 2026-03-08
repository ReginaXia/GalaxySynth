const STORE_PREFIX = "GalaxySynth_Dock_v1_";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function loadState(id, defaults) {
  try {
    const raw = localStorage.getItem(`${STORE_PREFIX}${id}`);
    if (!raw) return defaults;
    const s = JSON.parse(raw);
    return {
      x: Number.isFinite(s.x) ? s.x : defaults.x,
      y: Number.isFinite(s.y) ? s.y : defaults.y,
      collapsed: !!s.collapsed,
      visible: s.visible !== false,
    };
  } catch {
    return defaults;
  }
}

function saveState(id, state) {
  try {
    localStorage.setItem(
      `${STORE_PREFIX}${id}`,
      JSON.stringify({
        x: state.x,
        y: state.y,
        collapsed: !!state.collapsed,
        visible: state.visible !== false,
      })
    );
  } catch {}
}

export function createDockPanel({
  id,
  title,
  contentEl,
  x = 12,
  y = 12,
  width = 280,
  minHeight = 80,
  zIndex = 9999,
  showHideButton = true,
}) {
  const state = loadState(id, { x, y, collapsed: false, visible: true });

  const root = document.createElement("div");
  root.className = "custom-ui dock-panel";
  root.style.cssText = [
    "position:fixed",
    `left:${state.x}px`,
    `top:${state.y}px`,
    `width:${width}px`,
    `min-height:${minHeight}px`,
    `z-index:${zIndex}`,
    "border-radius:12px",
    "overflow:hidden",
    "background:linear-gradient(160deg, rgba(10,14,28,.84), rgba(22,14,38,.74))",
    "border:1px solid rgba(165,196,255,.20)",
    "backdrop-filter:blur(10px)",
    "box-shadow:0 10px 30px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.03)",
    "color:#eef2ff",
    "pointer-events:auto",
  ].join(";");

  const head = document.createElement("div");
  head.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; cursor:grab; user-select:none; border-bottom:1px solid rgba(165,196,255,.14);";
  root.appendChild(head);

  const t = document.createElement("div");
  t.textContent = title;
  t.style.cssText = "font:600 12px/1.2 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif; letter-spacing:.25px;";
  head.appendChild(t);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:6px;";
  head.appendChild(actions);

  const foldBtn = document.createElement("button");
  foldBtn.textContent = state.collapsed ? "Expand" : "Collapse";
  foldBtn.style.cssText = "border:0; border-radius:7px; padding:3px 7px; cursor:pointer; color:#eaf0ff; background:rgba(68,88,156,.42); font:11px/1.1 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif;";
  actions.appendChild(foldBtn);

  const hideBtn = document.createElement("button");
  hideBtn.textContent = "Hide";
  hideBtn.style.cssText = "border:0; border-radius:7px; padding:3px 7px; cursor:pointer; color:#eaf0ff; background:rgba(102,58,96,.48); font:11px/1.1 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif;";
  if (showHideButton) actions.appendChild(hideBtn);

  const body = document.createElement("div");
  body.style.cssText = "padding:8px; max-height:70vh; overflow:auto;";
  root.appendChild(body);

  if (contentEl.parentElement) {
    contentEl.parentElement.removeChild(contentEl);
  }
  contentEl.style.position = "static";
  contentEl.style.left = "";
  contentEl.style.right = "";
  contentEl.style.top = "";
  contentEl.style.bottom = "";
  contentEl.style.width = "100%";
  contentEl.style.margin = "0";
  contentEl.style.zIndex = "";
  body.appendChild(contentEl);

  const setCollapsed = (collapsed) => {
    state.collapsed = !!collapsed;
    body.style.display = state.collapsed ? "none" : "";
    foldBtn.textContent = state.collapsed ? "Expand" : "Collapse";
    saveState(id, state);
  };
  setCollapsed(state.collapsed);

  let dragging = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;

  head.addEventListener("pointerdown", (e) => {
    if (e.target === foldBtn || e.target === hideBtn) return;
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    ox = parseFloat(root.style.left);
    oy = parseFloat(root.style.top);
    head.style.cursor = "grabbing";
    try { head.setPointerCapture(e.pointerId); } catch {}
  });

  const onMove = (e) => {
    if (!dragging) return;
    const nx = ox + (e.clientX - sx);
    const ny = oy + (e.clientY - sy);
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - 48);
    root.style.left = `${clamp(nx, 8, maxX)}px`;
    root.style.top = `${clamp(ny, 8, maxY)}px`;
  };

  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    head.style.cursor = "grab";
    try { head.releasePointerCapture(e.pointerId); } catch {}

    const margin = 12;
    let xNow = parseFloat(root.style.left);
    let yNow = parseFloat(root.style.top);
    const w = width;
    const h = root.offsetHeight || minHeight;
    const dL = xNow - margin;
    const dR = (window.innerWidth - w - margin) - xNow;
    const dT = yNow - margin;
    const dB = (window.innerHeight - h - margin) - yNow;
    const minD = Math.min(Math.abs(dL), Math.abs(dR), Math.abs(dT), Math.abs(dB));
    if (minD === Math.abs(dL)) xNow = margin;
    else if (minD === Math.abs(dR)) xNow = window.innerWidth - w - margin;
    else if (minD === Math.abs(dT)) yNow = margin;
    else yNow = window.innerHeight - h - margin;

    root.style.left = `${clamp(xNow, 8, Math.max(8, window.innerWidth - w - 8))}px`;
    root.style.top = `${clamp(yNow, 8, Math.max(8, window.innerHeight - h - 8))}px`;
    state.x = parseFloat(root.style.left);
    state.y = parseFloat(root.style.top);
    saveState(id, state);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  foldBtn.addEventListener("click", () => setCollapsed(!state.collapsed));
  hideBtn.addEventListener("click", () => api.setVisible(false));

  const api = {
    root,
    body,
    contentEl,
    setVisible(v) {
      state.visible = !!v;
      root.style.display = state.visible ? "" : "none";
      saveState(id, state);
    },
    isVisible() {
      return state.visible;
    },
    setCollapsed,
    destroy() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      root.remove();
    },
  };

  api.setVisible(state.visible);
  document.body.appendChild(root);
  return api;
}
