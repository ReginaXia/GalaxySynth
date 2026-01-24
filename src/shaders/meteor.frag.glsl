// src/shaders/meteor.frag.glsl
precision highp float;
precision highp int;

uniform float uTime;

uniform float uHeadSize;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uTailFade;

uniform float uStrandCount; // GUI: number of filament strands (1..MAX)
uniform float uSpread;      // GUI: tail scatter/spread amount

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
float hash11(float n){
  return fract(sin(n) * 43758.5453123);
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

// 软线 -> 硬线：把高斯的结果用 pow 拉尖
float hardLine(float d, float w, float sharp){
  float g = exp(-(d*d) / max(1e-5, w*w));
  return pow(g, sharp);
}

void main(){
  // u: 0(头) -> 1(尾)
  float u = clamp(1.0 - vUv.x, 0.0, 1.0);

  // v: 横向中心 0
  float v = (vUv.y - 0.5);
  float av = abs(v);

  // 生命周期淡入淡出
  float fadeIn  = smoothstep(0.00, 0.08, vAge01);
  float fadeOut = 1.0 - smoothstep(0.78, 1.00, vAge01);
  float lifeFade = fadeIn * fadeOut * vAlive;

  // ==== 颜色流动（极光感）====
  float flow = sin(uTime * uAuroraSpeed + u * 10.0 + vSeed * 6.2831) * 0.5 + 0.5;
  float rnd  = hash12(vec2(vSeed * 11.7, u * 7.3));
  float aur  = (flow * 0.75 + rnd * 0.25) * uAuroraAmount;
  float hBase = fract(vHue + aur * uHueRange + u * 0.06);

  // 防糊白：整体亮度做轻微压缩（不是tone mapping，只是避免直接炸白）
  float val = clamp(uVal, 0.0, 1.35);

  // 三个基色（层带）
  vec3 cA = hsv2rgb(vec3(fract(hBase + 0.00), uSat * 0.95, val * 1.10));
  vec3 cB = hsv2rgb(vec3(fract(hBase + 0.18), uSat * 1.10, val * 1.00));
  vec3 cC = hsv2rgb(vec3(fract(hBase - 0.14), uSat * 0.85, val * 1.15));

  // ==== 长度衰减（层次清晰关键）====
  float lenFadeCore  = exp(-u * (uTailFade * 0.95));
  float lenFadeFil   = exp(-u * (uTailFade * 0.65));
  float lenFadeFog   = exp(-u * (uTailFade * 0.28));

  // ==== 1) 核心亮丝（更窄更硬，保证“清晰”）====
  float wCore = mix(0.012, 0.040, u);
  float core  = hardLine(av, wCore, 6.0) * lenFadeCore;
  vec3 coreCol = mix(vec3(1.0), hsv2rgb(vec3(hBase, 0.18, val)), 0.35);


  // 丝缕更细、更硬
  float fw = mix(0.0045, 0.018, u);
  float filSharp = mix(10.0, 6.0, u); // 头更硬，尾稍软

  // 条纹门控：让丝缕有“分段/喷散”结构（非常有效）
  float gate = sin(u * 55.0 + uTime * 1.6 + vSeed * 9.0) * 0.5 + 0.5;
  gate = smoothstep(0.35, 0.85, gate);

  // 噪声破碎（尾部更强）
  float rip  = sin(u * 28.0 + uTime * 1.15 + v * 18.0 + vSeed * 11.0) * 0.5 + 0.5;
  float rip2 = sin(u * 13.0 - uTime * 1.55 + v *  9.0 + vSeed *  7.0) * 0.5 + 0.5;
  float noise = mix(rip, rip2, 0.35);
  float breakUp = mix(1.0, noise, smoothstep(0.15, 1.0, u));

  float fil = 0.0;
  vec3  filCol = vec3(0.0);

  // 丝缕数量（GUI 可控）：用 MAX + 门控，兼容 WebGL1
  const int MAX_STRANDS = 16;
  for(int i=0;i<MAX_STRANDS;i++){
    float fi = float(i);

    // enable: i < uStrandCount ? 1 : 0
    float enable = step(fi, uStrandCount - 1.0);
    if (enable < 0.5) continue;

    float r = hash11(vSeed * 37.0 + fi * 19.0);
    float center = (r - 0.5) * 2.0 * spread;

    // 每条丝缕长度不同
    float lenJ = mix(0.55, 1.45, hash11(vSeed * 91.0 + fi * 13.0));
    float lf = exp(-u * (uTailFade * 0.60) * lenJ) * lenFadeFil;

    // “硬线”丝缕
    float li = hardLine(abs(v - center), fw, filSharp) * lf;

    // 门控+破碎：让它看起来像喷流丝带而不是平滑条
    li *= mix(0.55, 1.15, gate) * breakUp;

    // 分层彩色：以当前 strandCount 的中心对称偏移，避免偏一边
    float mid = 0.5 * (uStrandCount - 1.0);
    float offset = (fi - mid);

    float hh = fract(hBase + offset * 0.060);
    vec3 c = hsv2rgb(vec3(hh, uSat, val));

    fil += li;
    filCol += c * li;
  }
  filCol /= max(1e-5, fil);

  // ==== 3) 中层彩带（弱一些，只当“彩色雾带”）====
  float wMid = mix(0.045, 0.22, u);
  float mid = hardLine(av, wMid, 2.6) * exp(-u*(uTailFade*0.42));

  float band1 = exp(-pow((av - 0.06) / 0.05, 2.0));
  float band2 = exp(-pow((av - 0.14) / 0.07, 2.0));
  float band3 = exp(-pow((av - 0.26) / 0.12, 2.0));

  float slide = sin(u * 20.0 + uTime * 1.0 + vSeed * 7.0) * 0.5 + 0.5;
  float bandNoise = mix(0.70, 1.25, mix(slide, noise, 0.55));

  vec3 bandCol = (cA * band1 + cB * band2 + cC * band3) / max(1e-5, (band1 + band2 + band3));
  mid *= bandNoise;

  // ==== 4) 外层雾（非常弱，避免糊）====
  float wFog = mix(0.10, 0.60, u);
  float fog = exp(-pow(av / max(1e-5, wFog), 2.0)) * lenFadeFog;
  vec3 fogCol = mix(cC, vec3(0.65, 0.92, 1.0), 0.35);

  // ==== 强度权重：丝缕主角，雾退后 ====
  float glow = uTailGlow;
  core *= glow * 0.65;
  fil  *= glow * 1.55;
  mid  *= glow * 0.22;
  fog  *= glow * 0.08;

  vec3 tailCol =
      coreCol * core * 0.85 +
      filCol  * fil  * 1.00 +
      bandCol * mid  * 0.75 +
      fogCol  * fog  * 0.55;

  // Alpha 更克制（避免整条白糊）
  float tailA = clamp(core*0.38 + fil*0.62 + mid*0.14 + fog*0.07, 0.0, 1.0);

  // ==== 5) 头部：白蓝核（把 halo 收敛，别盖掉尾部细节）====
  vec2 pHead = (vUv - vec2(1.0, 0.5));
  float headR = length(pHead);

  float headCore = exp(-pow(headR / max(0.001, uHeadSize * 0.78), 2.0));
  float headHalo1 = exp(-pow(headR / (uHeadSize * 2.6), 2.0)) * 0.70;
  float headHalo2 = exp(-pow(headR / (uHeadSize * 5.2), 2.0)) * 0.35;

  float headGlow = (headCore + headHalo1 + headHalo2) * uHeadGlow;

  float shape = 0.0;
  vec2 sp = pHead / max(0.001, uHeadSize * 2.0);
  float w = 0.16 / max(0.8, uStarSharpness);

  if (uHeadShape < 0.5) shape = 0.0;
  else if (uHeadShape < 1.5) shape = crossShape(sp, w);
  else shape = star5Shape(sp, w);

  shape *= exp(-headR * 6.0);

  float head = mix(headGlow, headGlow + shape * uHeadGlow * 0.75, uShapeMix);
  vec3 headCol = mix(vec3(1.0), vec3(0.65, 0.92, 1.0), 0.55);

  // ==== 合成输出 ====
  vec3 col = tailCol + headCol * head;

  // 再做一次轻微压缩，避免纯白把丝缕吃掉（“软防爆”）
  col = col / (1.0 + col * 0.55);

  float a = clamp((tailA + head*0.55) * lifeFade, 0.0, 1.0);

  gl_FragColor = vec4(col, a);
}
