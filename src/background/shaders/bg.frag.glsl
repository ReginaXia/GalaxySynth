
















precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;

// Audio / interaction
uniform float uLeadE;    // 0..1 overall "music energy"
uniform float uPitch01;  // 0..1 pitch
uniform float uVel01;    // 0..1 velocity
uniform float uTheta01;  // 0..1 (angle around disk)
uniform vec2  uMouse;    // 0..1

// Base + look
uniform vec3  uBase;         // base dark (#131527)
uniform float uIntensity;    // overall brightness
uniform float uFlow;         // flow speed
uniform float uScale;        // pattern scale
uniform float uWarp;         // domain warp amount
uniform float uDetail;       // small detail amount
uniform float uPearl;        // pearly sheen amount
uniform float uSparkle;      // glitter amount
uniform float uSat;          // saturation boost (0..2)
uniform float uContrast;     // contrast (0.5..2)

// Palette (not rainbow, controllable)
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uPal3;

// Note "injection" (optional kick)
uniform float uPulse;      // 0..1
uniform float uNoteHue;    // 0..1 (kept for compatibility)
uniform float uNoteSeed;
uniform vec2  uNotePos;    // 0..1

// Three.js built-in uniform (DO NOT redeclare!)
// uniform vec3 cameraPosition;

// -----------------------------
float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec3  saturate(vec3  x){ return clamp(x, 0.0, 1.0); }

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.45);
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
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p){
  float f = 0.0;
  float a = 0.5;
  for(int i=0;i<4;i++){
    f += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}

vec3 palette4(float t){
  t = fract(t);
  float s = t * 3.0;
  float i = floor(s);
  float f = fract(s);

  vec3 a = (i < 1.0) ? uPal0 : (i < 2.0) ? uPal1 : uPal2;
  vec3 b = (i < 1.0) ? uPal1 : (i < 2.0) ? uPal2 : uPal3;

  f = f*f*(3.0-2.0*f);
  return mix(a, b, f);
}

vec3 applySaturation(vec3 c, float sat){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, sat);
}

vec3 applyContrast(vec3 c, float k){
  return (c - 0.5) * k + 0.5;
}

void main(){
  // View direction / sphere normal
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vWorldPos - cameraPosition);
  float fres = pow(1.0 - saturate(dot(-V, N)), 2.2);

  // Stable sky UV
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec2 uv = vec2(atan(dir.z, dir.x) / (6.2831853) + 0.5, asin(dir.y) / 3.1415926 + 0.5);

  float t = uTime * (0.08 + 0.42 * uFlow);

  float e = saturate(uLeadE);
  float e2 = e*e;
  float vel = saturate(uVel01);

  vec2 p = (uv - 0.5) * (1.0 + 2.2 * uScale);

  vec2 m = (uMouse - 0.5);
  p += m * (0.06 + 0.12*e);

  vec2 w1 = vec2(fbm(p * 1.25 + vec2(t, -t)), fbm(p * 1.25 + vec2(-t, t)));
  vec2 w2 = vec2(fbm(p * 2.30 + vec2(-t*1.4, t*0.9)), fbm(p * 2.30 + vec2(t*1.2, -t*1.1)));
  vec2 warp = (w1 - 0.5) * (0.85 + 1.25*e) * uWarp + (w2 - 0.5) * (0.35 + 0.90*e) * uDetail;

  vec2 q = p + warp;
  float f = fbm(q * 1.05 + vec2(0.0, t*0.6));
  float g = fbm(q * 2.10 + vec2(t*0.9, 0.0));

  //float band  = f;
  //float band2 = g;

  //band  = pow(band,  1.15);
  //band2 = pow(band2, 1.10);

  //float micro = noise(q * 8.0 + vec2(t*1.7, -t*1.3));
  //f = mix(f, micro, 0.08);
  //g = mix(g, micro, 0.06);

    // --- Anti-blocky bands: soften thresholds + jitter slightly ---
  float dither01 = fract(
    sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453
  );

  // 让阈值轻微抖动（非常小，不会“脏”，但能打散块状边界）
  float jitter = (dither01 - 0.5) * (1.5 / 255.0);

  // 更宽的 smoothstep 区间 = 更柔和的过渡
  float band  = smoothstep(0.10 + jitter, 0.98 + jitter, f);
  float band2 = smoothstep(0.12 + jitter, 0.99 + jitter, g);

  float musicalT = (uPitch01 * 0.92 + uTheta01 * 0.35 + t * 0.12);

  float sheen = (fres * (0.35 + 0.85*e) + (band2-0.5) * 0.25) * uPearl;

  float pulse = saturate(uPulse) * (0.2 + 0.8*vel);
  float d = length((uv - uNotePos) * vec2(1.2, 1.0));
  float ink = pulse * exp(-d * (6.0 + 10.0*e));

  float wCloud = (0.25 + 0.55*e2) * band;
  float wSheen = (0.18 + 0.65*e)  * (0.35 + 0.65*band2) * uPearl;
  float wInk   = ink;

  vec3 c0 = palette4(musicalT + sheen * 0.45 + (f-0.5)*0.25);
  vec3 c1 = palette4(musicalT + 0.33 + sheen * 0.75 + (g-0.5)*0.35);
  vec3 cInk = palette4(musicalT + 0.66 + uNoteSeed*0.07);

  vec3 col = uBase;
  col = mix(col, c0, wCloud);
  col = mix(col, c1, wSheen);
  col = mix(col, cInk, wInk);

  float sp = 0.0;
  if (uSparkle > 0.001){
    vec2 spUv = uv * (260.0 + 320.0*uScale) + vec2(t*7.0, -t*5.0);
    float r = hash21(floor(spUv));
    float tw = smoothstep(0.995, 1.0, r);
    float flicker = 0.5 + 0.5*sin(uTime*10.0 + r*6.283);
    sp = tw * flicker * (0.25 + 0.95*e) * uSparkle;
  }
  col += sp * vec3(1.0);

  col = applySaturation(col, 1.0 + uSat);
  col = applyContrast(col, uContrast);

  float bright = uIntensity * (0.55 + 1.25*e);
  col *= bright;

  col = pow(saturate(col), vec3(0.92));

  float dither = fract(
      sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))
      * 43758.5453
  );

  col += (dither - 0.5) / 255.0;

  gl_FragColor = vec4(saturate(col), 1.0);
}