import * as THREE from "three";

export function createBackgroundController(bg, { steps = 12 } = {}) {
  let leadE = 0.0;     
  let pitch01 = 0.5;   
  let vel01 = 0.0;     
  let theta01 = 0.0;   

  let pulse = 0.0;     
  let lastStep = -1;
  let noteHue = 0.86;
  let noteSeed = 0.0;

  const mainColor = new THREE.Color("#ff7ccf");

  let isInteracting = false;

  function setMainColor(colorLike) {
    if (!colorLike) return;
    try {
      mainColor.set(colorLike);

      const u = bg?.getUniforms ? bg.getUniforms() : bg?.material?.uniforms;
      if (u?.uTint) u.uTint.value.set(mainColor.r, mainColor.g, mainColor.b);
      if (u?.uMainColor) u.uMainColor.value.set(mainColor);
    } catch (e) {}
  }

  setMainColor(mainColor);

  function update({ t, dt, lead, mouse01, camera } = {}) {
    if (!bg) return;

    const isPlaying = !!(lead && lead.isPlaying);
    isInteracting = mouse01.x !== 0.5 || mouse01.y !== 0.5 || isPlaying;

    const targetColor = isInteracting ? "#7AF7FF" : "#003B44";  
    bg.setMainColor(targetColor);  

    const targetLead = isPlaying ? Math.min(1.0, 0.12 + 0.88 * v01) : 0.0;
    leadE = THREE.MathUtils.damp(leadE, targetLead, 5.0, dt || 0.016);
    pitch01 = THREE.MathUtils.damp(pitch01, p01, 8.0, dt || 0.016);
    vel01   = THREE.MathUtils.damp(vel01,   v01, 10.0, dt || 0.016);
    theta01 = THREE.MathUtils.damp(theta01, th01, 10.0, dt || 0.016);

    if (isPlaying && step !== undefined && step !== lastStep) {
      lastStep = step;
      pulse = 1.0;
      noteSeed = (typeof t === "number") ? t : performance.now() * 0.001;
      noteHue = steps > 0 ? (step / steps) : 0.0;
    }

    if (bg.setAudioDrive) {
      bg.setAudioDrive({ leadE, pitch01, vel01, theta01 });
    }
    if (bg.setNotePulse) {
      const x = mouse01?.x ?? 0.5;
      const y = mouse01?.y ?? 0.5;
      bg.setNotePulse({ pulse, hue: noteHue, seed: noteSeed, x, y });
    }

    if (bg.update) bg.update(t, camera);
  }

  return { update, setMainColor };
}