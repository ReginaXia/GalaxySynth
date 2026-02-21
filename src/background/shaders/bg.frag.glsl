precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

// three.js 内置：cameraPosition（不要自己 redeclare）

uniform float uTime;

uniform vec3  uBase;        // 深色底：#131527
uniform float uLeadE;       // 0..1（演奏能量）
uniform float uPitch01;     // 0..1（音高）
uniform float uVel01;       // 0..1（力度）
uniform float uTheta01;     // 0..1（轨迹角度/可选）
uniform vec2  uMouse;       // 0..1
uniform float uPulse;       // 0..1（一次 note 注入脉冲）
uniform float uNoteHue;     // 我们把它当 “noteIndex01 / 音阶位置” 用（0..1）
uniform float uNoteSeed;    // 随机种子
uniform vec2  uNotePos;     // 0..1（注入点）

// ===== 你可以在 JS/GUI 里控制的“梦幻调色盘”（不彩虹）=====
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uPal3;

// ===== 强度控制 =====
uniform float uExposure;    // 0.8~2.2
uniform float uSaturation;  // 1.0~2.0（高饱和）
uniform float uFlow;        // 流动速度 0.0~2.0
uniform float uWarp;        // 扭曲强度 0.0~1.2
uniform float uCloud;       // 云形尺度 0.5~2.0
uniform float uPearl;       // 珠光膜强度 0.0~1.5
uniform float uInk;         // 注入强度 0.0~2.0

// ---------------- noise ----------------
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 3 octave fbm：性能更稳，不容易卡
float fbm3(vec2 p){
  float v = 0.0;
  float a = 0.5;
  v += a * noise(p);        p = p * 2.02 + 17.3; a *= 0.5;
  v += a * noise(p);        p = p * 2.03 + 11.1; a *= 0.5;
  v += a * noise(p);
  return v;
}

vec3 satAdjust(vec3 c, float s){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

// 4 色调色盘采样（不彩虹，全靠你选色）
vec3 palette4(float t){
  t = fract(t);
  float seg = t * 3.0;
  float i = floor(seg);
  float f = fract(seg);
  f = f * f * (3.0 - 2.0 * f);

  vec3 a = uPal0;
  vec3 b = uPal1;
  vec3 c = uPal2;
  vec3 d = uPal3;

  if(i < 1.0) return mix(a, b, f);
  if(i < 2.0) return mix(b, c, f);
  return mix(c, d, f);
}

// 注入 blob：更“颜料/云雾”而不是硬切
float blob(vec2 uv, vec2 p, float r){
  float d = length(uv - p);
  float x = smoothstep(r, 0.0, d);
  // 让边缘更柔
  return x * x * (3.0 - 2.0 * x);
}

void main(){
  // viewDir：用于“珠光膜”的视角依赖
  vec3 dir = normalize(vWorldPos - cameraPosition);

  float t = uTime;

  // ===== 基础流动坐标 =====
  // 用 dir.xy + 少量 mouse 作为大体云幕方向
  vec2 uv = vUv;
  vec2 p = dir.xy * (1.25 * uCloud) + (uMouse - 0.5) * 0.35;

  // domain warp：形状更强，但用 1 次 fbm3 做轻量扭曲
  float w1 = fbm3(p * 1.2 + t * 0.12 * uFlow);
  float w2 = fbm3(p * 1.7 - t * 0.10 * uFlow + 3.4);
  vec2 warp = vec2(w1, w2) - 0.5;
  p += warp * (0.85 * uWarp);

  // ===== 云形主体 =====
  float c1 = fbm3(p * 1.8 + t * 0.16 * uFlow);
  float c2 = fbm3(p * 3.2 - t * 0.10 * uFlow + 12.7);
  float clouds = mix(c1, c2, 0.45);

  // 云的“体积感”（避免热力图硬块）
  float soft = smoothstep(0.25, 0.80, clouds);
  float veil = smoothstep(0.10, 0.95, fbm3(p * 0.9 + 8.2));

  // ===== 珠光膜（贝母感）=====
  // 视角相关：越斜越亮，带一点“偏振”条带
  float fres = pow(1.0 - max(0.0, dot(dir, vec3(0.0, 0.0, 1.0))), 2.2);
  float film = fbm3(p * 4.5 + vec2(0.0, t * 0.22 * uFlow));
  film = smoothstep(0.25, 0.95, film);
  float pearl = (0.35 + 0.65 * film) * (0.25 + 0.75 * fres) * uPearl;

  // ===== 调色逻辑（关键）：不彩虹，但颜色“惊喜”=====
  // 1) 先用 pitch / 音阶位置 决定“当前主色流”
  float baseT = (uPitch01 * 0.85 + uNoteHue * 0.65 + 0.07 * sin(t * 0.6));
  vec3 baseCol = palette4(baseT);

  // 2) 再用 “theta / mouse / 小噪声” 让颜色在局部翻转流动
  float localShift = (clouds - 0.5) * 0.55 + (uTheta01 - 0.5) * 0.25;
  vec3 flowCol = palette4(baseT + localShift);

  // 背景底色：没声音时回到深色
  float energy = clamp(uLeadE, 0.0, 1.0);
  float presence = smoothstep(0.02, 0.20, energy);

  // 云色：由 flowCol 主导，但叠 pearl 提亮
  vec3 col = uBase;
  vec3 cloudCol = mix(baseCol, flowCol, 0.55);

  // 云幕覆盖：soft/veil 控制“像云”而非“热力图”
  float cover = soft * (0.55 + 0.45 * veil);

  // ===== 注入（每次搓/触发 note）=====
  float pulse = clamp(uPulse, 0.0, 1.0);
  float seed = uNoteSeed;

  vec2 np = uNotePos;
  float b0 = blob(uv, np, mix(0.05, 0.16, pulse));
  float b1 = blob(uv, np + vec2(0.12, -0.06) * (0.25 + seed), 0.12);
  float b2 = blob(uv, np + vec2(-0.10, 0.10) * (0.20 + seed), 0.11);
  float paint = (b0 * 1.0 + b1 * 0.65 + b2 * 0.55);

  // 注入色：用 noteHue（当作音阶位置）+ seed 做“惊喜”，但仍在调色盘里
  vec3 inkCol = palette4(uNoteHue + seed * 0.37 + uPitch01 * 0.25);

  // 注入强度受力度影响
  float inkAmt = paint * (0.35 + 0.65 * pulse) * (0.30 + 0.70 * uVel01) * uInk;

  // ===== 合成 =====
  // 先铺云色（仅当 presence>0 才明显出现）
  col = mix(col, cloudCol, cover * (0.35 + 0.65 * presence));

  // 再叠珠光提亮（更“贝母”）
  col += pearl * (0.15 + 0.85 * presence);

  // 最后“注入颜料”
  col = mix(col, inkCol, clamp(inkAmt, 0.0, 1.0));

  // ===== 亮度 / 饱和度 / 压曝 =====
  float bright = uExposure * (0.65 + 0.35 * (0.35 + energy * 1.2)) * (0.85 + 0.35 * uPitch01);
  col *= bright;

  col = satAdjust(col, uSaturation);

  // 软压曝：保留颜色，不变灰
  float mx = max(col.r, max(col.g, col.b));
  col = col / (1.0 + mx * 0.35);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}