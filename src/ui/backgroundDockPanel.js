import * as THREE from "three";
import { BACKGROUND_PALETTES } from "../background/dreamyBackground";

const STORAGE_KEY = "GalaxySynth_BackgroundDock_v1";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function clampRange(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function toHex(v3) {
  const c = new THREE.Color(v3.x, v3.y, v3.z);
  return `#${c.getHexString()}`;
}

function hexToV3(hex) {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function loadState(defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const s = JSON.parse(raw);
    return {
      x: Number.isFinite(s.x) ? s.x : defaults.x,
      y: Number.isFinite(s.y) ? s.y : defaults.y,
      collapsed: !!s.collapsed,
      colorBlend: clamp01(
        Number(
          s.colorBlend ??
          (Number.isFinite(s.notePresence) ? s.notePresence : defaults.colorBlend)
        )
      ),
      flowDetail: clamp01(Number(s.flowDetail ?? defaults.flowDetail)),
      darkSpace: clamp01(Number(s.darkSpace ?? defaults.darkSpace)),
      localColorLift: clamp01(Number(s.localColorLift ?? defaults.localColorLift)),
      starBreath: clamp01(Number(s.starBreath ?? defaults.starBreath)),
      starBling: clamp01(Number(s.starBling ?? defaults.starBling)),
      starSoftness: clamp01(Number(s.starSoftness ?? defaults.starSoftness)),
      starSize: clampRange(
        Number.isFinite(Number(s.starSize))
          ? (Number(s.starSize) <= 1 ? (4 + Number(s.starSize) * 20) : Number(s.starSize))
          : defaults.starSize,
        2,
        28
      ),
    };
  } catch {
    return defaults;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        x: state.x,
        y: state.y,
        collapsed: !!state.collapsed,
        colorBlend: clamp01(state.colorBlend),
        flowDetail: clamp01(state.flowDetail),
        darkSpace: clamp01(state.darkSpace),
        localColorLift: clamp01(state.localColorLift),
        starBreath: clamp01(state.starBreath),
        starBling: clamp01(state.starBling),
        starSoftness: clamp01(state.starSoftness),
        starSize: clampRange(state.starSize, 2, 28),
      })
    );
  } catch {}
}

function makeRange(root, name, init, onChange) {
  const row = document.createElement("div");
  row.style.cssText = "margin-top:6px;";
  root.appendChild(row);

  const top = document.createElement("div");
  top.style.cssText = "display:flex; justify-content:space-between; font-size:11px; opacity:.9;";
  row.appendChild(top);
  const l = document.createElement("span");
  l.textContent = name;
  top.appendChild(l);
  const r = document.createElement("span");
  top.appendChild(r);

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.style.width = "100%";
  row.appendChild(input);

  const sync = (v) => {
    input.value = String(v);
    r.textContent = `${Math.round(v * 100)}%`;
  };
  sync(init);
  input.addEventListener("input", () => onChange(clamp01(Number(input.value)), sync));
  return { sync };
}

function makeNumber(root, name, init, min, max, step, onChange) {
  const row = document.createElement("div");
  row.style.cssText = "margin-top:6px;";
  root.appendChild(row);

  const top = document.createElement("div");
  top.style.cssText = "display:flex; justify-content:space-between; font-size:11px; opacity:.9;";
  row.appendChild(top);
  const l = document.createElement("span");
  l.textContent = name;
  top.appendChild(l);
  const r = document.createElement("span");
  top.appendChild(r);

  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.cssText = "width:100%; border-radius:8px; border:1px solid rgba(170,190,255,.35); background:rgba(8,10,18,.45); color:#eef2ff; padding:4px 6px;";
  row.appendChild(input);

  const sync = (v) => {
    input.value = String(v);
    r.textContent = `${Number(v).toFixed(step >= 1 ? 0 : 1)} px`;
  };
  sync(init);
  input.addEventListener("input", () => onChange(clampRange(Number(input.value), min, max), sync));
  return { sync };
}

export function createBackgroundDockPanel({ bg }) {
  const defaults = {
    x: window.innerWidth - 300,
    y: 76,
    collapsed: false,
    colorBlend: 0.72,
    flowDetail: 0.62,
    darkSpace: 0.70,
    localColorLift: 0.62,
    starBreath: 0.60,
    starBling: 0.58,
    starSoftness: 0.76,
    starSize: 16,
  };
  const state = loadState(defaults);

  const root = document.createElement("div");
  root.className = "custom-ui background-dock-panel";
  root.style.cssText = [
    "position:fixed",
    `left:${Math.max(8, Math.min(window.innerWidth - 292, state.x))}px`,
    `top:${Math.max(8, Math.min(window.innerHeight - 120, state.y))}px`,
    "width:280px",
    "z-index:9999",
    "padding:10px 12px",
    "border-radius:12px",
    "background:linear-gradient(160deg, rgba(10,14,28,.80), rgba(22,14,38,.70))",
    "border:1px solid rgba(165,196,255,.20)",
    "backdrop-filter:blur(10px)",
    "color:#eef2ff",
    "font:12px/1.35 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.03)",
    "pointer-events:auto",
  ].join(";");
  root.addEventListener("pointerdown", (e) => e.stopPropagation());

  const head = document.createElement("div");
  head.style.cssText = "display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none;";
  root.appendChild(head);
  const title = document.createElement("div");
  title.textContent = "Background System";
  title.style.cssText = "font-weight:700; letter-spacing:.3px;";
  head.appendChild(title);
  const foldBtn = document.createElement("button");
  foldBtn.textContent = state.collapsed ? "Expand" : "Collapse";
  foldBtn.style.cssText = "border:0; border-radius:8px; padding:4px 8px; cursor:pointer; color:#eaf0ff; background:rgba(68,88,156,.42);";
  head.appendChild(foldBtn);

  const body = document.createElement("div");
  body.style.display = state.collapsed ? "none" : "";
  body.style.marginTop = "8px";
  root.appendChild(body);

  const info = document.createElement("div");
  info.textContent = "Tune depth, texture, and local note color injection";
  info.style.cssText = "font-size:11px; opacity:.72; margin-bottom:6px;";
  body.appendChild(info);

  const presetWrap = document.createElement("div");
  presetWrap.style.cssText = "display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;";
  body.appendChild(presetWrap);

  const makePresetBtn = (name, key, colorBlend) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.style.cssText = "border:0; border-radius:7px; padding:4px 7px; cursor:pointer; color:#eaf0ff; background:rgba(68,88,156,.38); font:11px/1.1 'IBM Plex Sans','Segoe UI',ui-sans-serif,sans-serif;";
    btn.addEventListener("click", () => {
      const colors = BACKGROUND_PALETTES[key]?.colors;
      if (colors?.length >= 4) {
        bg.uniforms.uPal0.value.copy(hexToV3(colors[0]));
        bg.uniforms.uPal1.value.copy(hexToV3(colors[1]));
        bg.uniforms.uPal2.value.copy(hexToV3(colors[2]));
        bg.uniforms.uPal3.value.copy(hexToV3(colors[3]));
      }
      state.colorBlend = colorBlend;
      blendRow.sync(state.colorBlend);
      saveState(state);
    });
    presetWrap.appendChild(btn);
  };
  makePresetBtn("Aurora", "aurora", 0.66);
  makePresetBtn("Cosmic", "cosmic", 0.58);
  makePresetBtn("Sunset", "candy", 0.82);
  makePresetBtn("Pearl", "pearl", 0.48);

  const colorGrid = document.createElement("div");
  colorGrid.style.cssText = "display:grid; grid-template-columns:1fr 48px; gap:6px 8px;";
  body.appendChild(colorGrid);

  const palUniforms = [bg.uniforms.uPal0, bg.uniforms.uPal1, bg.uniforms.uPal2, bg.uniforms.uPal3];
  for (let i = 0; i < 4; i++) {
    const label = document.createElement("div");
    label.textContent = `Palette ${i + 1}`;
    label.style.opacity = ".9";
    colorGrid.appendChild(label);

    const input = document.createElement("input");
    input.type = "color";
    input.value = toHex(palUniforms[i].value);
    input.style.cssText = "width:48px; height:20px; border:none; padding:0; background:transparent;";
    input.addEventListener("input", () => {
      const v = hexToV3(input.value);
      palUniforms[i].value.copy(v);
    });
    colorGrid.appendChild(input);
  }

  const blendRow = makeRange(body, "Color Blend", state.colorBlend, (v, sync) => {
    state.colorBlend = v;
    sync(v);
    saveState(state);
  });
  blendRow.sync(state.colorBlend);

  const flowDetailRow = makeRange(body, "Flow Detail", state.flowDetail, (v, sync) => {
    state.flowDetail = v;
    sync(v);
    saveState(state);
  });
  flowDetailRow.sync(state.flowDetail);

  const darkSpaceRow = makeRange(body, "Dark Space", state.darkSpace, (v, sync) => {
    state.darkSpace = v;
    sync(v);
    saveState(state);
  });
  darkSpaceRow.sync(state.darkSpace);

  const localColorLiftRow = makeRange(body, "Local Color Lift", state.localColorLift, (v, sync) => {
    state.localColorLift = v;
    sync(v);
    saveState(state);
  });
  localColorLiftRow.sync(state.localColorLift);

  const starBreathRow = makeRange(body, "Star Breath", state.starBreath, (v, sync) => {
    state.starBreath = v;
    sync(v);
    saveState(state);
  });
  starBreathRow.sync(state.starBreath);

  const starBlingRow = makeRange(body, "Star Bling", state.starBling, (v, sync) => {
    state.starBling = v;
    sync(v);
    saveState(state);
  });
  starBlingRow.sync(state.starBling);

  const starSoftnessRow = makeRange(body, "Star Softness", state.starSoftness, (v, sync) => {
    state.starSoftness = v;
    sync(v);
    saveState(state);
  });
  starSoftnessRow.sync(state.starSoftness);

  const starSizeRow = makeNumber(body, "Star Size", state.starSize, 2, 28, 0.5, (v, sync) => {
    state.starSize = clampRange(v, 2, 28);
    sync(v);
    saveState(state);
  });
  starSizeRow.sync(state.starSize);

  foldBtn.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    body.style.display = state.collapsed ? "none" : "";
    foldBtn.textContent = state.collapsed ? "Expand" : "Collapse";
    saveState(state);
  });

  let dragging = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;

  head.addEventListener("pointerdown", (e) => {
    if (e.target === foldBtn) return;
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
    const maxX = Math.max(8, window.innerWidth - 292);
    const maxY = Math.max(8, window.innerHeight - 72);
    root.style.left = `${Math.max(8, Math.min(maxX, nx))}px`;
    root.style.top = `${Math.max(8, Math.min(maxY, ny))}px`;
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    head.style.cursor = "grab";
    try { head.releasePointerCapture(e.pointerId); } catch {}

    const margin = 12;
    let x = parseFloat(root.style.left);
    let y = parseFloat(root.style.top);
    const w = 292;
    const h = root.offsetHeight || 120;
    const distL = x - margin;
    const distR = (window.innerWidth - w - margin) - x;
    const distT = y - margin;
    const distB = (window.innerHeight - h - margin) - y;
    const minDist = Math.min(Math.abs(distL), Math.abs(distR), Math.abs(distT), Math.abs(distB));
    if (minDist === Math.abs(distL)) x = margin;
    else if (minDist === Math.abs(distR)) x = window.innerWidth - w - margin;
    else if (minDist === Math.abs(distT)) y = margin;
    else y = window.innerHeight - h - margin;

    root.style.left = `${Math.max(8, x)}px`;
    root.style.top = `${Math.max(8, y)}px`;
    state.x = parseFloat(root.style.left);
    state.y = parseFloat(root.style.top);
    saveState(state);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  document.body.appendChild(root);

  return {
    root,
    getColorBlend() {
      return state.colorBlend;
    },
    getFlowDetail() {
      return state.flowDetail;
    },
    getDarkSpace() {
      return state.darkSpace;
    },
    getLocalColorLift() {
      return state.localColorLift;
    },
    getStarBreath() {
      return state.starBreath;
    },
    getStarBling() {
      return state.starBling;
    },
    getStarSoftness() {
      return state.starSoftness;
    },
    getStarSize() {
      return state.starSize;
    },
    setVisible(v) {
      root.style.display = v ? "" : "none";
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      root.remove();
    },
  };
}
