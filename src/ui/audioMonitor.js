// src/ui/audioMonitor.js
export function createAudioMonitorUI() {
  const root = document.createElement("div");
  root.className = "custom-ui audio-monitor";
  root.style.position = "fixed";
  root.style.left = "12px";
  root.style.top = "12px";
  root.style.width = "260px";
  root.style.padding = "12px";
  root.style.borderRadius = "10px";
  root.style.background = "rgba(0,0,0,0.45)";
  root.style.backdropFilter = "blur(8px)";
  root.style.color = "#fff";
  root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  root.style.fontSize = "12px";
  root.style.zIndex = "9999";
  root.style.userSelect = "none";
  root.style.pointerEvents = "none";

  root.innerHTML = `
    <div style="font-weight:700; letter-spacing:0.5px; margin-bottom:10px;">
      🎛 Audio Monitor
    </div>

    <div id="am_master"></div>

    <div style="height:10px;"></div>

    <div id="am_tracks"></div>

    <div style="height:10px;"></div>

    <div id="am_style"></div>
  `;

  document.body.appendChild(root);

  const elMaster = root.querySelector("#am_master");
  const elTracks = root.querySelector("#am_tracks");
  const elStyle = root.querySelector("#am_style");

  function barRow(label, v01) {
    const w = Math.round(Math.max(0, Math.min(1, v01)) * 160);
    return `
      <div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <div style="width:52px; opacity:0.9;">${label}</div>
        <div style="flex:1; height:8px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden;">
          <div style="width:${w}px; height:100%; background:rgba(255,255,255,0.9);"></div>
        </div>
        <div style="width:34px; text-align:right; opacity:0.8;">${Math.round(v01*100)}</div>
      </div>
    `;
  }

  return {
    root,
    update(audioState, perfState) {
      const rms = audioState?.rms ?? 0;
      const beat = audioState?.beatPulse ?? 0;

      elMaster.innerHTML = `
        ${barRow("MASTER", rms)}
        ${barRow("BEAT", beat)}
        <div style="opacity:0.7; margin-top:2px;">energy: ${perfState?.energy?.toFixed?.(2) ?? "0.00"}  pitch: ${perfState?.pitch?.toFixed?.(2) ?? "0.50"}</div>
      `;

      const lv = audioState?.level || {};
      elTracks.innerHTML = `
        ${barRow("KICK", lv.kick ?? 0)}
        ${barRow("HAT",  lv.hat ?? 0)}
        ${barRow("PAD",  lv.pad ?? 0)}
        ${barRow("BASS", lv.bass ?? 0)}
        ${barRow("LEAD", lv.lead ?? 0)}
      `;

      const st = audioState?.style || {};
      elStyle.innerHTML = `
        <div style="opacity:0.8;">bpm: ${Math.round(st.bpm ?? 0)}</div>
        <div style="opacity:0.8;">cutoff: ${Math.round(st.cutoff ?? 0)} Hz</div>
        <div style="opacity:0.8;">drive: ${(st.drive ?? 0).toFixed(3)}</div>
        <div style="opacity:0.8;">reverb: ${(st.reverbWet ?? 0).toFixed(3)}</div>
      `;
    },
    destroy() {
      root.remove();
    },
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
    },
  };
}
