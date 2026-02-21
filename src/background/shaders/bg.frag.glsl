precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uMouse01;

uniform float uLeadE;    // 0..1
uniform float uVel01;    // 0..1
uniform float uPitch01;  // 0..1
uniform float uTheta01;  // 0..1
uniform float uPulse;    // 0..1

uniform vec3 uBase;      // #131527
uniform vec3 uTint;      // 建议设成白色 #ffffff（避免染色）

// ----------------- noise / fbm -----------------
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p,p+34.45);
  return fract(p.x*p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.55;
  for(int i=0;i<5;i++){
    v += a*noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// ----------------- HSV to RGB -----------------
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ----------------- sparkles -----------------
float sparkle(vec2 p, float t){
  float n = noise(p*30.0 + t*0.45);
  return smoothstep(0.995, 1.0, n);
}
float starGlint(vec2 p){
  float ax = abs(p.x);
  float ay = abs(p.y);
  float line = exp(-ax*18.0) + exp(-ay*18.0);
  float core = exp(-(ax*ax+ay*ay)*70.0);
  return (0.30*line + 0.70*core);
}

void main(){
  vec2 uv = vUv;

  // -------- base deep night --------
  vec3 col = uBase;
  float fog0 = fbm(uv*1.2 + uTime*0.01);
  col += uBase * (fog0-0.5) * 0.05;

  // -------- drive (make it pop fast) --------
  float ignite = smoothstep(0.004, 0.06, uLeadE);         // 更快点燃
  float velBoost = 0.25 + 0.75*pow(uVel01, 1.25);
  float drive = ignite * velBoost;
  float glow  = drive * drive;

  // -------- warp (for liquid motion) --------
  float ang = uTheta01 * 6.28318;
  vec2 dir = vec2(cos(ang), sin(ang));
  float spd = 0.12 + 1.8*uVel01;

  vec2 p = uv;

  vec2 w1;
  w1.x = fbm(p*2.7 + dir*uTime*spd);
  w1.y = fbm(p*4.5 - dir*uTime*(spd*0.72));
  w1 -= 0.5;

  vec2 w2;
  w2.x = fbm(p*7.5 + vec2(-dir.y, dir.x)*uTime*(0.45+uVel01));
  w2.y = fbm(p*10.5 - vec2(-dir.y, dir.x)*uTime*(0.35+uVel01));
  w2 -= 0.5;

  p += w1 * (0.18 + 0.42*uVel01) * ignite;
  p += w2 * (0.05 + 0.14*uVel01) * ignite;

  // -------- key: FORCE BIG hue swing while scratching --------
  // 重点：就算 uPitch01 变化很小，也会因为 theta / time / vel 产生巨大色相摆动
  float filmA = fbm(p*6.5 + uTime*0.10);
  float filmB = fbm(p*15.0 - uTime*0.18);
  float film  = 0.60*filmA + 0.40*filmB;                 // 0..1-ish

  // 超夸张 hue：pitch + theta(强) + 时间(强) + 噪声(强)
  float hue = 0.0;
  hue += uPitch01 * 1.8;                                  // pitch
  hue += uTheta01 * (1.2 + 0.8*uVel01);                  // move -> shift
  hue += uTime * (0.06 + 0.12*uVel01);                   // time -> shift
  hue += (film - 0.5) * 0.65;                            // film -> shift
  hue = fract(hue);

  // 饱和度/明度：搓的时候直接拉满（你要的“鲜艳梦幻”）
  float sat = mix(0.02, 0.98, drive);
  float val = mix(0.10, 1.00, drive) * (0.78 + 0.22*film);

  vec3 filmCol = hsv2rgb(vec3(hue, sat, val));

  // -------- pearl highlight (shiny) --------
  float ridge = pow(smoothstep(0.55, 1.0, filmB), 2.4);
  vec3 pearl = vec3(1.0) * ridge;

  // -------- global lift (bigger) --------
  col += filmCol * (drive * 1.25 + glow * 0.95);
  col += pearl  * (drive * 0.40 + glow * 0.55);

  // -------- injection near mouse (very obvious + note-tied) --------
  float d = distance(p, uMouse01);
  float ink = smoothstep(0.55, 0.0, d);
  ink *= (0.15 + 0.85*uPulse);
  ink *= (0.35 + 0.65*uVel01);

  // 注入 hue：更“按音”一点（再叠加一点 filmShimmer）
  float inkShimmer = fbm(p*20.0 + uTime*0.22);
  float inkHue = fract(uPitch01*2.2 + inkShimmer*0.35 + uTheta01*0.25);
  vec3 inkCol = hsv2rgb(vec3(inkHue, mix(0.08, 1.0, drive), mix(0.15, 1.0, drive)));

  col += inkCol * ink * (drive * 1.45 + glow * 1.05);

  // -------- NEW: "note shockwave" (guaranteed visible surprise) --------
  // 利用 uPulse 制造一圈圈彩膜波纹扩散（不会闪屏，但很“哇”）
  vec2 c = uMouse01;
  float r = distance(uv, c);
  float wave = sin(r*35.0 - uTime*(2.0 + 6.0*uVel01));
  wave = smoothstep(0.55, 1.0, wave);
  float waveMask = wave * drive * (0.25 + 0.75*uPulse);
  vec3 waveCol = hsv2rgb(vec3(fract(hue + 0.35), 1.0, 1.0));
  col += waveCol * waveMask * 0.35;

  // -------- sparkles / glints (more visible) --------
  float sp = sparkle(p + w1*0.6, uTime);
  col += vec3(1.0) * sp * (drive * (0.25 + 0.80*uVel01) + glow * 0.35);

  vec2 gp = fract(p*vec2(10.0, 8.0)) - 0.5;
  float gseed = noise(floor(p*vec2(10.0, 8.0)));
  float glintMask = step(0.983, gseed);
  float gl = starGlint(gp) * glintMask;
  col += vec3(1.0) * gl * (drive * (0.18 + 0.55*uPulse) + glow * 0.25);

  // -------- prevent "muddy gray" by boosting contrast a bit --------
  // 轻微提对比，让色相差异更肉眼可见
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}