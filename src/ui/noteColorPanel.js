const STORAGE_KEY = "GalaxySynth_NoteColorMap_v2";
const NOTE_LABELS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

const DEFAULT_COLORS = [
  "#aae9ff",
  "#9bc8ff",
  "#baa7ff",
  "#e2adff",
  "#ffbde9",
  "#c5dbff",
  "#b3f1ff",
];
const DEFAULTS = {
  mix: 0.60,
  pearl: 0.76,
  glow: 0.72,
  richness: 0.68,
  dream: 0.70,
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function hexToRgb01(hex) {
  const s = String(hex || "").trim().replace("#", "");
  const h = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Array.isArray(p.colors) || p.colors.length < 7) return null;
    return {
      colors: p.colors.slice(0, 7),
      mix: clamp01(Number(p.mix ?? DEFAULTS.mix)),
      pearl: clamp01(Number(p.pearl ?? DEFAULTS.pearl)),
      glow: clamp01(Number(p.glow ?? DEFAULTS.glow)),
      richness: clamp01(Number(p.richness ?? DEFAULTS.richness)),
      dream: clamp01(Number(p.dream ?? DEFAULTS.dream)),
    };
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colors: state.colors,
        mix: clamp01(state.mix),
        pearl: clamp01(state.pearl),
        glow: clamp01(state.glow),
        richness: clamp01(state.richness),
        dream: clamp01(state.dream),
      })
    );
  } catch {}
}

function makeRangeRow(root, name, initial, onInput) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin-top:8px;";
  root.appendChild(wrap);

  const label = document.createElement("div");
  label.style.cssText = "display:flex; justify-content:space-between; margin-bottom:4px;";
  wrap.appendChild(label);

  const n = document.createElement("span");
  n.textContent = name;
  label.appendChild(n);

  const value = document.createElement("span");
  label.appendChild(value);

  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.value = String(initial);
  input.style.width = "100%";
  wrap.appendChild(input);

  const sync = (v) => {
    value.textContent = `${Math.round(v * 100)}%`;
    input.value = String(v);
  };
  sync(initial);
  input.addEventListener("input", () => onInput(clamp01(Number(input.value)), sync));
  return { input, sync };
}

export function createNoteColorPanel() {
  const saved = loadState();
  const state = {
    colors: saved?.colors ?? [...DEFAULT_COLORS],
    mix: saved?.mix ?? DEFAULTS.mix,
    pearl: saved?.pearl ?? DEFAULTS.pearl,
    glow: saved?.glow ?? DEFAULTS.glow,
    richness: saved?.richness ?? DEFAULTS.richness,
    dream: saved?.dream ?? DEFAULTS.dream,
  };

  const root = document.createElement("div");
  root.className = "custom-ui note-color-panel";
  root.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:16px",
    "z-index:9999",
    "width:224px",
    "padding:10px 12px",
    "border-radius:12px",
    "background:rgba(10,12,22,0.68)",
    "backdrop-filter:blur(8px)",
    "color:#e9ecff",
    "font:12px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
    "pointer-events:auto",
  ].join(";");
  root.addEventListener("pointerdown", (e) => e.stopPropagation());
  root.addEventListener("pointerup", (e) => e.stopPropagation());

  const title = document.createElement("div");
  title.textContent = "Note Colors";
  title.style.cssText = "font-weight:700; letter-spacing:0.4px; margin-bottom:8px;";
  root.appendChild(title);

  const rows = document.createElement("div");
  rows.style.cssText = "display:grid; grid-template-columns:1fr 48px; gap:6px 8px; align-items:center;";
  root.appendChild(rows);

  const colorInputs = [];
  for (let i = 0; i < 7; i++) {
    const label = document.createElement("div");
    label.textContent = NOTE_LABELS[i];
    label.style.opacity = "0.9";
    rows.appendChild(label);

    const input = document.createElement("input");
    input.type = "color";
    input.value = state.colors[i];
    input.style.cssText = "width:48px; height:20px; border:none; padding:0; background:transparent;";
    input.addEventListener("input", () => {
      state.colors[i] = input.value;
      saveState(state);
    });
    rows.appendChild(input);
    colorInputs.push(input);
  }

  const hint = document.createElement("div");
  hint.textContent = "Note color strength is driven by Color Blend";
  hint.style.cssText = "margin-top:8px; font-size:11px; opacity:.72;";
  root.appendChild(hint);

  // Keep these as internal defaults for stable look tuning.
  // They are intentionally not exposed as sliders in the minimal UI.
  state.pearl = DEFAULTS.pearl;
  state.glow = DEFAULTS.glow;
  state.richness = DEFAULTS.richness;
  state.dream = DEFAULTS.dream;

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:8px; margin-top:9px;";
  root.appendChild(actions);

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText =
    "flex:1; border:0; border-radius:8px; padding:5px 8px; background:#2a2f49; color:#e9ecff; cursor:pointer;";
  resetBtn.addEventListener("click", () => {
    for (let i = 0; i < 7; i++) {
      state.colors[i] = DEFAULT_COLORS[i];
      colorInputs[i].value = state.colors[i];
    }
    state.mix = DEFAULTS.mix;
    state.pearl = DEFAULTS.pearl;
    state.glow = DEFAULTS.glow;
    state.richness = DEFAULTS.richness;
    state.dream = DEFAULTS.dream;
    saveState(state);
  });
  actions.appendChild(resetBtn);

  document.body.appendChild(root);

  return {
    root,
    getMix() {
      return state.mix;
    },
    getPearl() {
      return state.pearl;
    },
    getGlow() {
      return state.glow;
    },
    getRichness() {
      return state.richness;
    },
    getDream() {
      return state.dream;
    },
    getColorRgb01(step) {
      const idx = Number.isFinite(step) ? ((step % 7) + 7) % 7 : -1;
      if (idx < 0) return null;
      return hexToRgb01(state.colors[idx]);
    },
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
    },
    destroy() {
      root.remove();
    },
  };
}
