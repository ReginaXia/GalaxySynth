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



  function setMainColor(colorLike) {
    if (!colorLike) return;
    try {
      mainColor.set(colorLike);

      const u = bg?.getUniforms ? bg.getUniforms() : bg?.material?.uniforms;
      if (u?.uTint) u.uTint.value.set(mainColor.r, mainColor.g, mainColor.b);
      if (u?.uMainColor) u.uMainColor.value.set(mainColor);
    } catch (e) {}
  }

  // 创建一个全屏的黑色滤镜（透明遮罩层）
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),  // 覆盖整个屏幕
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.8, transparent: true })
  );
  overlay.position.z = 10000;  // 将滤镜放在其他物体后面
  scene.add(overlay);

  // 控制遮罩层的透明度
  function updateOverlay() {
    const targetOpacity = isInteracting ? 0.0 : 100;  // 没有交互时，遮挡层不透明
    overlay.material.opacity = THREE.MathUtils.damp(overlay.material.opacity, targetOpacity, 5.0, 0.016);
  }

  setMainColor(mainColor);

  function update({ t, dt, lead, mouse01, camera } = {}) {
    if (!bg) return;

    const isPlaying = !!(lead && lead.isPlaying);
    isInteracting = mouse01.x !== 0.5 || mouse01.y !== 0.5 || isPlaying;

    // 在没有交互时减少流动和亮度的强度
    const targetColor = isInteracting ? "#7AF7FF" : "#000000";  // 背景颜色，没操作时为完全黑色
    bg.setMainColor(targetColor);  // 修改背景颜色

    // 在没有交互时减少流动和亮度的强度
    const targetIntensity = isInteracting ? 1.0 : 0.0;  // 亮度
    const targetSparkle = isInteracting ? 0.15 : 0.0;  // 流彩效果
    const targetFlow = isInteracting ? 1.0 : 0.0;  // 流动效果
    const targetWarp = isInteracting ? 0.75 : 0.0;  // 弯曲效果

    // 更新透明度
    updateOverlay();

    // 更新动态效果
    bg.setAudioDrive({
      leadE: 0.0, 
      pitch01: 0.5,
      vel01: 0.0,
      theta01: 0.0,
      pulse: 0.0,
      noteSeed: 0.0,
      notePos: new THREE.Vector2(0.5, 0.5),
      noteHue: 0.86,
      sparkle: targetSparkle,
      intensity: targetIntensity,
      flow: targetFlow,
      warp: targetWarp, // 控制背景弯曲效果
    });

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