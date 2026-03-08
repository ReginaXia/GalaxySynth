const STORAGE_KEY = "GalaxySynth_NoteColorMap_v1";
const DEFAULT_MIX = 0.52;
const DEFAULT_PEARL = 0.62;
const DEFAULT_GLOW = 0.56;
const NOTE_LABELS = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
const DEFAULT_COLORS = [
  "#8fd3ff",
  "#7f9dff",
  "#b38dff",
  "#ff89d6",
  "#68d8ff",
  "#6de7c4",
  "#ffd58a",
];

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function hexToRgb01(hex) {
  const s = String(hex || "").trim().replace("#", "");
  const h = (s.length === 3) ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r / 255, g / 255, b / 255];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Array.isArray(p.colors) || p.colors.length < 7) return null;
    return {
      colors: p.colors.slice(0, 7),
      mix: clamp01(Number(p.mix ?? DEFAULT_MIX)),
      strict: !!p.strict,
      pearl: clamp01(Number(p.pearl ?? DEFAULT_PEARL)),
      glow: clamp01(Number(p.glow ?? DEFAULT_GLOW)),
    };
  } catch {
    return null;
  }
}

function saveState(colors, mix, strict = false, pearl = DEFAULT_PEARL, glow = DEFAULT_GLOW) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colors,
        mix: clamp01(mix),
        strict: !!strict,
        pearl: clamp01(pearl),
        glow: clamp01(glow),
      })
    );
  } catch {}
}

export function createNoteColorPanel() {
  const saved = loadState();
  const colors = saved?.colors ?? [...DEFAULT_COLORS];
  let mix = saved?.mix ?? DEFAULT_MIX;
  let strict = !!saved?.strict;
  let pearl = saved?.pearl ?? DEFAULT_PEARL;
  let glow = saved?.glow ?? DEFAULT_GLOW;

  const root = document.createElement("div");
  root.className = "custom-ui note-color-panel";
  root.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:16px",
    "z-index:9999",
    "width:220px",
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
    input.value = colors[i];
    input.style.cssText = "width:48px; height:20px; border:none; padding:0; background:transparent;";
    input.addEventListener("input", () => {
      colors[i] = input.value;
      saveState(colors, mix, strict, pearl, glow);
    });
    rows.appendChild(input);
    colorInputs.push(input);
  }

  const mixWrap = document.createElement("div");
  mixWrap.style.cssText = "margin-top:10px;";
  root.appendChild(mixWrap);

  const mixLabel = document.createElement("div");
  mixLabel.style.cssText = "display:flex; justify-content:space-between; margin-bottom:4px;";
  mixWrap.appendChild(mixLabel);
  const mixName = document.createElement("span");
  mixName.textContent = "Note Color Mix";
  mixLabel.appendChild(mixName);
  const mixValue = document.createElement("span");
  mixLabel.appendChild(mixValue);

  const mixInput = document.createElement("input");
  mixInput.type = "range";
  mixInput.min = "0";
  mixInput.max = "1";
  mixInput.step = "0.01";
  mixInput.value = String(mix);
  mixInput.style.width = "100%";
  mixWrap.appendChild(mixInput);

  function syncMixUi() {
    mixValue.textContent = `${Math.round(mix * 100)}%`;
    mixInput.value = String(mix);
  }
  syncMixUi();

  mixInput.addEventListener("input", () => {
    mix = clamp01(Number(mixInput.value));
    syncMixUi();
    saveState(colors, mix, strict, pearl, glow);
  });

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:8px; margin-top:9px;";
  root.appendChild(actions);

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = "flex:1; border:0; border-radius:8px; padding:5px 8px; background:#2a2f49; color:#e9ecff; cursor:pointer;";
  resetBtn.addEventListener("click", () => {
    for (let i = 0; i < 7; i++) {
      colors[i] = DEFAULT_COLORS[i];
      colorInputs[i].value = colors[i];
    }
    mix = DEFAULT_MIX;
    strict = false;
    strictInput.checked = strict;
    pearl = DEFAULT_PEARL;
    glow = DEFAULT_GLOW;
    pearlInput.value = String(pearl);
    glowInput.value = String(glow);
    syncMixUi();
    syncPearlUi();
    syncGlowUi();
    saveState(colors, mix, strict, pearl, glow);
  });
  actions.appendChild(resetBtn);

  const strictWrap = document.createElement("label");
  strictWrap.style.cssText = "display:flex; align-items:center; gap:6px; margin-top:8px; opacity:0.95;";
  const strictInput = document.createElement("input");
  strictInput.type = "checkbox";
  strictInput.checked = strict;
  strictInput.addEventListener("change", () => {
    strict = !!strictInput.checked;
    saveState(colors, mix, strict, pearl, glow);
  });
  const strictText = document.createElement("span");
  strictText.textContent = "Strict Note Color";
  strictWrap.appendChild(strictInput);
  strictWrap.appendChild(strictText);
  root.appendChild(strictWrap);

  const pearlWrap = document.createElement("div");
  pearlWrap.style.cssText = "margin-top:8px;";
  root.appendChild(pearlWrap);
  const pearlLabel = document.createElement("div");
  pearlLabel.style.cssText = "display:flex; justify-content:space-between; margin-bottom:4px;";
  pearlWrap.appendChild(pearlLabel);
  const pearlName = document.createElement("span");
  pearlName.textContent = "Pearl";
  pearlLabel.appendChild(pearlName);
  const pearlValue = document.createElement("span");
  pearlLabel.appendChild(pearlValue);
  const pearlInput = document.createElement("input");
  pearlInput.type = "range";
  pearlInput.min = "0";
  pearlInput.max = "1";
  pearlInput.step = "0.01";
  pearlInput.value = String(pearl);
  pearlInput.style.width = "100%";
  pearlWrap.appendChild(pearlInput);
  function syncPearlUi() {
    pearlValue.textContent = `${Math.round(pearl * 100)}%`;
  }
  syncPearlUi();
  pearlInput.addEventListener("input", () => {
    pearl = clamp01(Number(pearlInput.value));
    syncPearlUi();
    saveState(colors, mix, strict, pearl, glow);
  });

  const glowWrap = document.createElement("div");
  glowWrap.style.cssText = "margin-top:8px;";
  root.appendChild(glowWrap);
  const glowLabel = document.createElement("div");
  glowLabel.style.cssText = "display:flex; justify-content:space-between; margin-bottom:4px;";
  glowWrap.appendChild(glowLabel);
  const glowName = document.createElement("span");
  glowName.textContent = "Glow";
  glowLabel.appendChild(glowName);
  const glowValue = document.createElement("span");
  glowLabel.appendChild(glowValue);
  const glowInput = document.createElement("input");
  glowInput.type = "range";
  glowInput.min = "0";
  glowInput.max = "1";
  glowInput.step = "0.01";
  glowInput.value = String(glow);
  glowInput.style.width = "100%";
  glowWrap.appendChild(glowInput);
  function syncGlowUi() {
    glowValue.textContent = `${Math.round(glow * 100)}%`;
  }
  syncGlowUi();
  glowInput.addEventListener("input", () => {
    glow = clamp01(Number(glowInput.value));
    syncGlowUi();
    saveState(colors, mix, strict, pearl, glow);
  });

  document.body.appendChild(root);

  return {
    root,
    getMix() {
      return mix;
    },
    isStrict() {
      return strict;
    },
    getPearl() {
      return pearl;
    },
    getGlow() {
      return glow;
    },
    getColorRgb01(step) {
      const idx = Number.isFinite(step) ? ((step % 7) + 7) % 7 : -1;
      if (idx < 0) return null;
      return hexToRgb01(colors[idx]);
    },
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
    },
    destroy() {
      root.remove();
    },
  };
}
