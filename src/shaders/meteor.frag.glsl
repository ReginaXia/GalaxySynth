precision highp float;
precision highp int;

uniform float uTime;

uniform float uHeadSize;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uTailFade;

uniform float uHeadShape;     // 0 orb, 1 cross, 2 star5
uniform float uShapeMix;      // 0..1
uniform float uStarSharpness; // sharpness

uniform float uBaseHue;
uniform float uHueRange;
uniform float uAuroraAmount;
uniform float uAuroraSpeed;
uniform float uSat;
uniform float uVal;

varying vec2  vUv;
varying float vAge01;
varying float vSeed;
varying float vHue;
varying float vAlive;

float hash12(vec2 p){
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sdLine(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h);
}

float crossShape(vec2 p, float w){
  float d1 = sdLine(p, vec2(-1.0, 0.0), vec2( 1.0, 0.0));
  float d2 = sdLine(p, vec2( 0.0,-1.0), vec2( 0.0, 1.0));
  float d = min(d1, d2);
  return exp(-pow(d / w, 2.0));
}

float star5Shape(vec2 p, float w){
  float r = length(p);
  float a = atan(p.y, p.x);
  float m = abs(cos(a * 2.5));
  float k = mix(0.45, 0.15, m);
  float d = abs(r - k);
  return exp(-pow(d / w, 2.0)) * exp(-r * 1.1);
}

void main(){
  // uv.x: 0尾 -> 1头
  float x = vUv.x;

  // u: 0(头) -> 1(尾)
  float u = clamp(1.0 - x, 0.0, 1.0);

  // 横向（宽度方向），中心为 0
  float v = (vUv.y - 0.5);

  // 生命周期淡入淡出
  float fadeIn  = smoothstep(0.00, 0.08, vAge01);
  float fadeOut = 1.0 - smoothstep(0.78, 1.00, vAge01);
  float lifeFade = fadeIn * fadeOut * vAlive;

  // ---------------------------
  // 1) 超长多层喷散：core / mid / outer
  //    （在 UV 空间做宽度 + 内部纹理，配合 vertex 的锥形会更像“彗星羽流”）
  // ---------------------------

  // 越往尾部越宽（在 UV 空间）
  float wCore  = mix(0.06, 0.18, u);
  float wMid   = mix(0.16, 0.55, u);
  float wOuter = mix(0.35, 1.15, u);

  float core  = exp(-pow(v / max(1e-4, wCore),  2.0));
  float mid   = exp(-pow(v / max(1e-4, wMid),   2.0));
  float outer = exp(-pow(v / max(1e-4, wOuter), 2.0));

  // 沿尾衰减：core 衰减快，outer 衰减慢 → “超长喷散”
  core  *= exp(-u * (uTailFade * 0.85));
  mid   *= exp(-u * (uTailFade * 0.42));
  outer *= exp(-u * (uTailFade * 0.20));

  // 内部纹理（让喷散有“气体带/丝带”质感）
  float n1 = sin(u * 30.0 + uTime * 1.25 + v * 16.0 + vSeed * 11.0);
  float n2 = sin(u * 14.0 - uTime * 1.70 + v *  9.0 + vSeed *  7.0);
  float noise = (n1 * 0.5 + 0.5) * 0.65 + (n2 * 0.5 + 0.5) * 0.35;
  float streakNoise = mix(0.65, 1.45, noise);

  // 把纹理更多作用在 mid/outer（像照片里的彩色气体带）
  mid   *= streakNoise;
  outer *= mix(0.80, 1.25, noise);

  // 强度权重
  core  *= uTailGlow * 1.10;
  mid   *= uTailGlow * 1.00;
  outer *= uTailGlow * 0.70;

  // ---------------------------
  // 2) 分层彩色带（3条带）：像模拟照片里蓝/紫/粉层带
  // ---------------------------

  float flow = sin(uTime * uAuroraSpeed + u * 10.0 + vSeed * 6.2831) * 0.5 + 0.5;
  float rnd  = hash12(vec2(vSeed * 13.7, u * 9.1));
  float aur  = (flow * 0.70 + rnd * 0.30) * uAuroraAmount;

  // 基础 hue：来自每颗流星自己的 vHue，再加上流动
  float hBase = fract(vHue + aur * uHueRange + u * 0.08);

  // 三条色带：用不同 hue 偏移 + 不同层使用不同饱和度/亮度
  vec3 colA = hsv2rgb(vec3(fract(hBase + 0.00),              uSat * 0.90, uVal * 1.05)); // 主色
  vec3 colB = hsv2rgb(vec3(fract(hBase + 0.18 + aur*0.10),   uSat * 1.05, uVal * 0.95)); // 偏紫粉
  vec3 colC = hsv2rgb(vec3(fract(hBase - 0.14 + aur*0.08),   uSat * 0.75, uVal * 1.10)); // 偏蓝青

  // 让颜色层带沿尾巴有“分层”感：core 更偏白，outer 更彩
  vec3 tailCoreCol  = mix(colA, vec3(1.0), 0.55);
  vec3 tailMidCol   = mix(colB, colA, 0.35);
  vec3 tailOuterCol = mix(colC, colB, 0.45);

  // ---------------------------
  // 3) 头部：更大的白蓝光团 + 超大 halo + 可选星芒
  // ---------------------------

  vec2 pHead = (vUv - vec2(1.0, 0.5));
  float headR = length(pHead);

  float headCore = exp(-pow(headR / max(0.001, uHeadSize * 0.90), 2.0));
  float headHalo1 = exp(-pow(headR / (uHeadSize * 3.2), 2.0)) * 0.90;
  float headHalo2 = exp(-pow(headR / (uHeadSize * 6.8), 2.0)) * 0.55;

  float headGlow = (headCore + headHalo1 + headHalo2) * uHeadGlow;

  // 头部星芒
  float shape = 0.0;
  vec2 sp = pHead / max(0.001, uHeadSize * 2.0);
  float w = 0.16 / max(0.8, uStarSharpness);

  if (uHeadShape < 0.5) shape = 0.0;
  else if (uHeadShape < 1.5) shape = crossShape(sp, w);
  else shape = star5Shape(sp, w);

  shape *= exp(-headR * 5.5);

  float head = headGlow + shape * uHeadGlow * 0.95;
  head = mix(headGlow, head, uShapeMix);

  // 头部颜色：更偏白蓝（彗星热核）
  vec3 icy = vec3(0.65, 0.92, 1.0);
  vec3 headCol = mix(mix(colA, icy, 0.70), vec3(1.0), 0.35);

  // ---------------------------
  // 4) 合成 + alpha
  // ---------------------------

  vec3 col =
      tailCoreCol  * core  * 0.65 +
      tailMidCol   * mid   * 0.95 +
      tailOuterCol * outer * 1.05 +
      headCol * head;

  float a = (core * 0.65 + mid * 0.85 + outer * 0.65 + head * 1.00) * lifeFade;
  a = clamp(a, 0.0, 1.0);

  gl_FragColor = vec4(col, a);
}
