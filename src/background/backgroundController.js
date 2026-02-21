// src/background/backgroundController.js
import * as THREE from "three";

/**
 * BackgroundController
 * 目标：
 * - 背景跟 lead 实时流动（uLeadE/uPitch01/uVel01/uTheta01）
 * - 纯主色（只用 uTint 往 white 提亮，不做 hue shift）
 * - 不盖星云：由 dreamyBackground 本身的 renderOrder / depth 设置保证
 *
 * 用法：
 *   const bg = createDreamyBackground(scene);
 *   const bgCtrl = createBackgroundController(bg, { steps: STEPS });
 *   bgCtrl.setMainColor("#ff7ccf"); // 可选
 *   ...
 *   bgCtrl.update({
 *     t, dt,
 *     lead: { isPlaying, vel01, pitch01, theta01, step },
 *     mouse01: { x, y },
 *     camera, // optional
 *   });
 */
export function createBackgroundController(bg, { steps = 12 } = {}) {
  // ---------- internal state ----------
  let leadE = 0.0;     // 0..1 presence
  let pitch01 = 0.5;   // 0..1
  let vel01 = 0.0;     // 0..1
  let theta01 = 0.0;   // 0..1

  let pulse = 0.0;     // 0..1 (note trigger)
  let lastStep = -1;
  let noteHue = 0.86;
  let noteSeed = 0.0;

  // 主色：统一走 uTint（shader 里已保证高光只往白走）
  const mainColor = new THREE.Color("#ff7ccf");

  function setMainColor(colorLike) {
    if (!colorLike) return;
    try {
      mainColor.set(colorLike);

      // 同步到材质（保持兼容：既设置 uTint，也设置 uMainColor，如果存在）
      const u = bg?.getUniforms ? bg.getUniforms() : bg?.material?.uniforms;
      if (u?.uTint) u.uTint.value.set(mainColor.r, mainColor.g, mainColor.b);
      if (u?.uMainColor) u.uMainColor.value.set(mainColor);
    } catch (e) {
      // ignore invalid color
    }
  }

  // 初始化时就把主色灌进去一次
  setMainColor(mainColor);

  function update({ t, dt, lead, mouse01, camera } = {}) {
    if (!bg) return;

    const isPlaying = !!(lead && lead.isPlaying);

    const v01 = (lead && typeof lead.vel01 === "number") ? lead.vel01 : 0.0;
    const p01 = (lead && typeof lead.pitch01 === "number") ? lead.pitch01 : 0.5;
    const th01 = (lead && typeof lead.theta01 === "number") ? lead.theta01 : 0.0;
    const step = (lead && typeof lead.step === "number") ? lead.step : undefined;

    // 1) presence：没弹奏就回到深色；弹奏时随力度出现
    const targetLead = isPlaying ? Math.min(1.0, 0.12 + 0.88 * v01) : 0.0;
    leadE = THREE.MathUtils.damp(leadE, targetLead, 5.0, dt || 0.016);

    // 2) pitch / vel / theta：平滑，避免闪烁
    pitch01 = THREE.MathUtils.damp(pitch01, p01, 8.0, dt || 0.016);
    vel01   = THREE.MathUtils.damp(vel01,   v01, 10.0, dt || 0.016);
    theta01 = THREE.MathUtils.damp(theta01, th01, 10.0, dt || 0.016);

    // 3) note pulse：每次 step 变化就打一针“颜料注入”
    if (isPlaying && step !== undefined && step !== lastStep) {
      lastStep = step;
      pulse = 1.0;
      noteSeed = (typeof t === "number") ? t : performance.now() * 0.001;
      noteHue = steps > 0 ? (step / steps) : 0.0;
    }
    // pulse = Math.max(0.0, pulse - (dt || 0.016) * 2.6);
    // attack 快一点、release 慢一点 → 亮度更像呼吸而不是闪
    if (pulse > 0.0) {
      pulse = Math.max(0.0, pulse - (dt || 0.016) * 1.2); // release 慢一点
    }

    pulse = Math.min(1.0, pulse + 0.55);

    // 4) 喂给 dreamyBackground
    if (bg.setAudioDrive) {
      bg.setAudioDrive({ leadE, pitch01, vel01, theta01 });
    }
    if (bg.setNotePulse) {
      const x = mouse01?.x ?? 0.5;
      const y = mouse01?.y ?? 0.5;
      bg.setNotePulse({ pulse, hue: noteHue, seed: noteSeed, x, y });
    }

    // 5) 更新时间 & 跟随相机（保持无限远背景）
    if (bg.update) bg.update(t, camera);
  }

  return { update, setMainColor };
}