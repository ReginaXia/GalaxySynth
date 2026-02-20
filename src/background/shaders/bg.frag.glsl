precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;

uniform vec3  uTint;        // 你指定的“纯主色”（粉就是粉）
uniform float uIntensity;   // 总强度
uniform float uParallax;    // 视差（很轻）
uniform float uTheta01;     // 0..1（环角度）
uniform vec2  uMouse;       // 0..1
uniform float uLeadE;       // 0..1（演奏能量）
uniform float uPitch01;     // 0..1（音高）
uniform float uVel01;       // 0..1（力度/速度）
uniform float uEmergence;   // 0..1（背景出现程度）

uniform float uPulse;       // 0..1（一次音符“注入”的脉冲）
uniform float uNoteHue;     // 0..1（现在不用来改 hue，只当辅助）
uniform float uNoteSeed;    // 0..1
uniform vec2  uNotePos;     // 0..1（屏幕上的注入点）

// ----------------- helpers -----------------
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 rot(vec2 p, float a){
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c) * p;
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for(int i=0;i<5;i++){
    v += a * noise(p);
    p = rot(p * 2.02, 0.35);
    a *= 0.52;
  }
  return v;
}

// “液体”域扭曲
vec2 warp(vec2 p, float t){
  float n1 = fbm(p * 1.3 + vec2(0.0, t*0.12));
  float n2 = fbm(p * 1.9 - vec2(t*0.10, 0.0));
  vec2 w = vec2(n1, n2) - 0.5;
  return p + w * (0.55 + 0.75 * uVel01);
}

// 注入 blob（每个音出现时，背景 3-4 块颜料区域重新“长”出来）
float blob(vec2 uv, vec2 center, float r){
  vec2 d = uv - center;
  float dist = dot(d,d);
  return exp(-dist / max(1e-4, r*r));
}

void main(){
  vec2 uv = vUv;

  // 保持中心不变的轻微视差（不要“蒙”）
  vec2 m = (uMouse - 0.5);
  uv += m * 0.03 * uParallax;

  float t = uTime;

  // 基础深邃（不演奏时回到深色）
  vec3 deepBase = uTint * 0.10 + vec3(0.010, 0.010, 0.018); // 深色带一点宇宙黑

  // presence：决定“出现多少背景”
  float presence = clamp(uEmergence, 0.0, 1.0);
  // 让演奏更明显地把背景“点亮”
  presence *= (0.18 + 0.82 * clamp(uLeadE, 0.0, 1.0));

  // 液体流动主场
  vec2 p = uv * 2.2;
  p -= 1.1;

  // 用 theta 作为一个“流向”的相位，让你搓盘时背景朝一个方向带动
  float ang = 6.2831853 * fract(uTheta01);
  vec2 dir = vec2(cos(ang), sin(ang));

  // 域扭曲（液体感来自这里）
  vec2 pw = warp(p + dir * (t * 0.08), t);

  // 三层场：大形状（色块）+ 中频（融化边界）+ 高频（微纹理）
  float f1 = fbm(pw * 1.05 + vec2(0.0, t * 0.05));
  float f2 = fbm(pw * 2.10 - vec2(t * 0.06, 0.0));
  float f3 = fbm(pw * 3.60 + vec2(t * 0.09, -t * 0.04));

  // 生成 3~4 个“颜料区域”的权重（随时间缓慢漂移）
  float a1 = smoothstep(0.30, 0.78, f1);
  float a2 = smoothstep(0.25, 0.80, f2);
  float a3 = smoothstep(0.20, 0.85, f3);

  // 纯色系：只在明度上变化，不改 hue（避免偏黄/偏蓝）
  vec3 cDeep = deepBase;
  vec3 cMid  = uTint * 0.55;
  vec3 cHi   = mix(uTint, vec3(1.0), 0.38);   // 高光只往白走
  vec3 cGlow = mix(uTint, vec3(1.0), 0.65);   // 更亮的注入高光

  // “融化”混色（不同区域流动）
  vec3 col = cDeep;
  col = mix(col, cMid, a1 * 0.85);
  col = mix(col, cHi,  a2 * 0.65);
  col = mix(col, cGlow, a3 * 0.25);

  // 音符注入：每次弹一个音，uPulse 把颜色“泼”进来，并且位置跟随命中点
  float pulse = clamp(uPulse, 0.0, 1.0);
  vec2 np = uNotePos;
  float seed = uNoteSeed;

  // 让注入点附近出现 3~4 个 blob，形成“颜料融化”效果
  float b0 = blob(vUv, np, mix(0.06, 0.18, pulse));
  float b1 = blob(vUv, np + vec2(0.12, -0.07) * (0.3 + seed), 0.12);
  float b2 = blob(vUv, np + vec2(-0.10, 0.09) * (0.2 + seed), 0.10);
  float b3 = blob(vUv, np + vec2(0.02, 0.16) * (0.2 + seed), 0.14);

  float paint = (b0 * 1.0 + b1 * 0.65 + b2 * 0.55 + b3 * 0.45);
  paint *= (0.20 + 0.80 * pulse);
  paint *= (0.35 + 0.65 * (0.2 + 0.8 * uVel01));

  // 注入颜色：仍然只沿着 uTint -> white，不改 hue
  vec3 ink = mix(uTint, vec3(1.0), 0.25 + 0.55 * uPitch01);
  col = mix(col, ink, clamp(paint, 0.0, 1.0));

  // 细腻高光纹理（不变色，只提亮）
  float sheen = smoothstep(0.70, 0.98, fbm(pw * 6.5 + t * 0.10));
  col = mix(col, mix(col, vec3(1.0), 0.20), sheen * 0.25);

  // 亮度：音高高更亮，低更深邃
  float pitchBright = mix(0.75, 1.35, uPitch01);
  float energyBright = mix(0.55, 1.45, uLeadE);
  float brightness = uIntensity * pitchBright * (0.65 + 0.35 * energyBright);

  // 最关键：presence 控制“出现多少背景”，没弹奏就回 deepBase
  col = mix(deepBase, col, presence);

  // 最终提亮，但避免“厚滤镜蒙住”
  col *= brightness;

  // 小范围压制过曝（不改色相）
  float mx = max(col.r, max(col.g, col.b));
  col = col / (1.0 + mx * 0.55);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}