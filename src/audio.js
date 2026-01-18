// src/audio.js
export function createGalaxyAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // 为了避免“点击一下突然很大声”，我们做一个软启动
  const state = {
    ctx,
    master,
    isRunning: false,
    tracks: {}
  };

  // ===== Pad（长音：Ariana 软垫）=====
  const pad = makePad(ctx);
  pad.out.connect(master);

  // ===== Pluck/Bell（短音：闪烁）=====
  const pluck = makePluck(ctx);
  pluck.out.connect(master);

  // ===== Spark Bell（更高更亮一点）=====
  const bell = makeBell(ctx);
  bell.out.connect(master);

  state.tracks = { pad, pluck, bell };

  async function start() {
    if (state.isRunning) return;
    await ctx.resume();
    state.isRunning = true;
    // 让 pad 持续发声但音量为 0（进入区域才淡入）
    pad.start();
  }

  function setZones({ x01, y01 }) {
    // zones: left / mid / right
    const left = smoothstep(0.0, 0.40, 1.0 - x01);        // 越靠左越强
    const mid  = smoothband(x01, 0.35, 0.65, 0.15);       // 中间带
    const right= smoothstep(0.60, 1.0, x01);              // 越靠右越强

    // y 值：上方更亮（更开阔），下方更暗（更温柔）
    const bright = clamp01(1.0 - y01);

    // Pad：左区主导
    pad.setTargetGain(left * 0.35);

    // Pluck：中区主导（根据 mid 触发密度）
    pluck.setIntensity(mid, bright);

    // Bell：右区主导
    bell.setIntensity(right, bright);

    // 全局轻微滤波：让空间更“呼吸”
    const masterTarget = 0.75 + bright * 0.20;
    smoothSet(state.master.gain, masterTarget, ctx, 0.08);
  }

  function triggerPluck() {
    pluck.triggerOnce();
  }

  return { start, setZones, triggerPluck, state };
}

// ---------- Track builders ----------

function makePad(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.7;

  const chorus = ctx.createDelay(0.03);
  chorus.delayTime.value = 0.018;

  const chorusMix = ctx.createGain();
  chorusMix.gain.value = 0.35;

  // Pad osc
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = "sine";
  o2.type = "triangle";
  o1.frequency.value = 196.0; // G3
  o2.frequency.value = 196.0 * 1.005;

  const oscGain = ctx.createGain();
  oscGain.gain.value = 0.55;

  // routing
  o1.connect(oscGain);
  o2.connect(oscGain);
  oscGain.connect(filter);
  filter.connect(out);

  // cheap chorus
  filter.connect(chorus);
  chorus.connect(chorusMix);
  chorusMix.connect(out);

  let started = false;

  function start() {
    if (started) return;
    started = true;
    o1.start();
    o2.start();
  }

  function setTargetGain(v) {
    smoothSet(out.gain, v, ctx, 0.12);
    // 轻微呼吸：gain 上来时开一点滤波
    const f = 800 + v * 1200;
    smoothSet(filter.frequency, f, ctx, 0.18);
  }

  return { out, start, setTargetGain };
}

function makePluck(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.0;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 1.6;

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.18;

  const fb = ctx.createGain();
  fb.gain.value = 0.28;

  const wet = ctx.createGain();
  wet.gain.value = 0.35;

  // dry + wet
  filter.connect(out);
  filter.connect(delay);
  delay.connect(wet);
  wet.connect(out);

  delay.connect(fb);
  fb.connect(delay);

  let lastTrig = 0;
  let rate = 0.0; // 0..1

  function setIntensity(mid, bright) {
    // mid 控制是否存在
    smoothSet(out.gain, mid * 0.45, ctx, 0.10);

    // 亮度控制音色（更高频更“星星”）
    const f = 900 + bright * 1400;
    smoothSet(filter.frequency, f, ctx, 0.12);

    // mid 越强，触发越密
    rate = mid;
    const now = ctx.currentTime;
    const interval = lerp(0.45, 0.10, clamp01(rate)); // 触发间隔
    if (mid > 0.12 && now - lastTrig > interval) {
      lastTrig = now;
      triggerOnce(bright);
    }
  }

  function triggerOnce(bright = 0.7) {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 660 + bright * 220; // E5-ish

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(g);
    g.connect(filter);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  return { out, setIntensity, triggerOnce };
}

function makeBell(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0.0;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 500;
  filter.Q.value = 0.7;

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.26;

  const wet = ctx.createGain();
  wet.gain.value = 0.35;

  const fb = ctx.createGain();
  fb.gain.value = 0.22;

  filter.connect(out);
  filter.connect(delay);
  delay.connect(wet);
  wet.connect(out);

  delay.connect(fb);
  fb.connect(delay);

  let lastTrig = 0;

  function setIntensity(right, bright) {
    smoothSet(out.gain, right * 0.40, ctx, 0.10);

    // 越亮越“玻璃”
    smoothSet(filter.frequency, 350 + bright * 900, ctx, 0.10);

    const now = ctx.currentTime;
    const interval = lerp(0.55, 0.14, clamp01(right));
    if (right > 0.10 && now - lastTrig > interval) {
      lastTrig = now;
      trigger(bright);
    }
  }

  function trigger(bright = 0.8) {
    const now = ctx.currentTime;

    // 简单 FM-ish：两个 osc 叠加
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    carrier.type = "sine";
    mod.type = "sine";

    const base = 880 + bright * 440;
    carrier.frequency.value = base;
    mod.frequency.value = base * 2.0;

    const modGain = ctx.createGain();
    modGain.gain.value = 60 + bright * 140;

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.30, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    carrier.connect(g);
    g.connect(filter);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 0.28);
    mod.stop(now + 0.28);
  }

  return { out, setIntensity };
}

// ---------- Utils ----------
function smoothSet(param, value, ctx, time = 0.1) {
  const now = ctx.currentTime;
  try {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, time);
  } catch {
    // fallback
    param.value = value;
  }
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function smoothstep(e0,e1,x){
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2*t);
}
function smoothband(x, a, b, softness){
  // 1 in [a,b], softened edges
  const left  = smoothstep(a - softness, a + softness, x);
  const right = 1.0 - smoothstep(b - softness, b + softness, x);
  return clamp01(left * right);
}
