precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec2  uMouse01;

uniform float uLeadE;
uniform float uVel01;
uniform float uPitch01;
uniform float uTheta01;
uniform float uPulse;

uniform vec3 uBase;
uniform vec3 uTint;



// ---------- noise / fbm ----------
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
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
vec2 rot(vec2 p, float a){
  float c = cos(a), s = sin(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

// “亮但不灰”的曝光曲线（比 softClip 更保饱和）
vec3 filmic(vec3 x){
  // 1 - exp(-x) 这种会更“糖纸感”
  return 1.0 - exp(-x);
}

// ---------- pretty pearl palette (avoid dirty greens) ----------
vec3 pearlPalette(float t){
  // 童话贝母色带：粉、桃、金、薄荷、天蓝、薰衣草（没有“苔藓绿”）
  vec3 c0 = vec3(1.00, 0.55, 0.95); // pink
  vec3 c1 = vec3(1.00, 0.72, 0.55); // peach
  vec3 c2 = vec3(1.00, 0.95, 0.60); // butter
  vec3 c3 = vec3(0.55, 1.00, 0.88); // mint (clean)
  vec3 c4 = vec3(0.55, 0.82, 1.00); // sky
  vec3 c5 = vec3(0.80, 0.60, 1.00); // lavender

  t = fract(t) * 6.0;
  float i = floor(t);
  float f = fract(t);
  f = f*f*(3.0-2.0*f);

  vec3 a = c0, b = c1;
  if(i < 1.0){ a=c0; b=c1; }
  else if(i < 2.0){ a=c1; b=c2; }
  else if(i < 3.0){ a=c2; b=c3; }
  else if(i < 4.0){ a=c3; b=c4; }
  else if(i < 5.0){ a=c4; b=c5; }
  else { a=c5; b=c0; }
  return mix(a,b,f);
}

void main(){
  float ignite = smoothstep(0.004, 0.07, uLeadE);
  float velBoost = 0.25 + 0.75*pow(uVel01, 1.20);
  float drive = ignite * velBoost;
  float glow  = drive * drive;

  // view ray
  vec3 ray = normalize(vWorldPos - cameraPosition);

  // base
  vec3 col = uBase;

  // silky marbling in view space (avoid UV heatmap blocks)
  vec2 q = ray.xz;
  float t = uTime * (0.03 + 0.12*uVel01);

  vec2 w1 = vec2(fbm(q*2.0 + t), fbm(q*2.0 - t)) - 0.5;
  vec2 w2 = vec2(fbm(q*4.8 - t*1.2), fbm(q*4.8 + t*1.1)) - 0.5;
  vec2 p = q + w1*0.65 + w2*0.25;

  float a = fbm(p*2.8 + 0.7);
  float b = fbm(rot(p*6.0, 0.6) - 1.1);
  float cloud = 0.65*a + 0.35*b;

  // nacre fresnel
  float ndv = abs(ray.y);
  float fres = pow(1.0 - ndv, 3.2);      // 更像贝母：边缘更亮
  fres *= (0.20 + 0.80*drive);

  // hue driver: angle + pitch + swirling (but through pretty palette)
  float thickness = 1.0 + 2.6*cloud + 1.2*uPulse;
  float phase = thickness * (1.0 - ndv);

  float hueKey = 0.0;
  hueKey += phase * 0.55;
  hueKey += uPitch01 * 1.35;
  hueKey += uTheta01 * 0.60;
  hueKey += uTime * (0.015 + 0.05*uVel01);
  hueKey += (cloud - 0.5) * 0.35;

  vec3 nacre = pearlPalette(hueKey);
  nacre *= uTint;

  // make it POP: when playing, background becomes candy-nacre
  col = mix(col, nacre, drive * 0.98);

  // IMPORTANT: 不再加“纯白珠光”，改成“有色珠光” → 不发灰
  col += nacre * fres * (0.90 + 1.40*glow);

  // silky bright ribbons (still colored)
  float ridge = smoothstep(0.55, 0.95, b);
  float silk = ridge * fres * (0.20 + 0.80*drive);
  col += nacre * silk * (0.40 + 0.80*glow);

  // mouse magic ink injection (very saturated)
  float d = distance(vUv, uMouse01);
  float ink = smoothstep(0.55, 0.0, d);
  ink *= (0.18 + 0.82*uPulse);
  ink *= (0.35 + 0.65*uVel01);

  vec3 inkCol = pearlPalette(hueKey + 0.33 + fbm(p*10.0 + uTime*0.1)*0.25);
  col += inkCol * ink * (0.60 + 1.60*glow);

  // tiny sparkles (not too much white)
  float sp = smoothstep(0.995, 1.0, noise(p*28.0 + uTime*0.35));
  col += nacre * sp * (0.15 + 0.55*drive);

  // exposure: brighter but keeps saturation
  col *= (0.85 + 1.75*drive);      // 播放时整体变亮
  col = filmic(col);
  col = pow(col, vec3(0.92));      // 再提一点亮度/通透

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}