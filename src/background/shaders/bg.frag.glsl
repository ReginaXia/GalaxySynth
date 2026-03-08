
















precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;

// Audio / interaction
uniform float uLeadE;    // 0..1 overall "music energy"
uniform float uInteractionE; // 0..1 local turbulence strength
uniform float uPitch01;  // 0..1 pitch
uniform float uVel01;    // 0..1 velocity
uniform float uTheta01;  // 0..1 (angle around disk)
uniform vec2  uMouse;    // 0..1
uniform vec2  uInteractionPos; // 0..1 interaction anchor

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
  for(int i=0;i<6;i++){
    f += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}


vec3 palAt(int idx){
  if(idx==0) return uPal0;
  if(idx==1) return uPal1;
  if(idx==2) return uPal2;
  return uPal3;
}

// Catmull-Rom interpolation for smooth multi-color palette
vec3 palette4(float t){
  t = fract(t);
  float x = t * 4.0;
  int i1 = int(floor(x)) % 4;
  float f = fract(x);

  int i0 = (i1 + 3) % 4;
  int i2 = (i1 + 1) % 4;
  int i3 = (i1 + 2) % 4;

  vec3 p0 = palAt(i0);
  vec3 p1 = palAt(i1);
  vec3 p2 = palAt(i2);
  vec3 p3 = palAt(i3);

  float f2 = f*f;
  float f3 = f2*f;

  // Standard Catmull-Rom (0.5 tension)
  return 0.5 * ((2.0*p1) +
                (-p0 + p2) * f +
                (2.0*p0 - 5.0*p1 + 4.0*p2 - p3) * f2 +
                (-p0 + 3.0*p1 - 3.0*p2 + p3) * f3);
}


vec3 applySaturation(vec3 c, float sat){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, sat);
}

vec3 applyContrast(vec3 c, float k){
  return (c - 0.5) * k + 0.5;
}

// --- sRGB-space dithering helpers (for banding reduction) ---
vec3 linearToSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 srgbToLinear(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }

// Interleaved / stable hash (0..1)
float hash12(vec2 p){
  // Use a slightly different hash than hash21 to decorrelate
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  // View direction / sphere normal
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vWorldPos - cameraPosition);
  float fres = pow(1.0 - saturate(dot(-V, N)), 2.2);

  // Stable sky UV
  vec3 dir = normalize(vWorldPos - cameraPosition);
  vec2 uv = vec2(atan(dir.z, dir.x) / (6.2831853) + 0.5, asin(dir.y) / 3.1415926 + 0.5);

  float t = uTime * (0.016 + 0.16 * uFlow);

  float e = saturate(uLeadE);
  float e2 = e*e;
  float vel = saturate(uVel01);
  float ie = saturate(uInteractionE);

  vec2 p = (uv - 0.5) * (0.75 + 1.35 * uScale);

  vec2 m = (uMouse - 0.5);
  p += m * (0.06 + 0.12*e);

  vec2 w1 = vec2(fbm(p * 0.75 + vec2(t, -t)), fbm(p * 0.75 + vec2(-t, t)));
  vec2 w2 = vec2(fbm(p * 1.30 + vec2(-t*1.2, t*0.8)), fbm(p * 1.30 + vec2(t*0.9, -t*0.9)));
  vec2 warp = (w1 - 0.5) * (0.55 + 0.85*e) * uWarp + (w2 - 0.5) * (0.18 + 0.45*e) * uDetail;

  // Local interaction turbulence (screen-space centered, smooth falloff).
  vec2 dInt = uv - uInteractionPos;
  float distInt = length(dInt);
  float flowInfluence = exp(-distInt * 4.0) * ie;
  vec2 swirlDir = vec2(-dInt.y, dInt.x) / max(1e-4, distInt);
  float swirlPhase = sin(uTime * (0.35 + 0.45 * uFlow) + distInt * 16.0 + uTheta01 * 6.28318);
  vec2 localVectorField = swirlDir * swirlPhase * 0.022 + dInt * (-0.018);
  vec2 flowUV = p + flowInfluence * localVectorField;

  vec2 q = flowUV + warp;
  float f = fbm(q * 0.70 + vec2(0.0, t*0.45));
  float g = fbm(q * 1.25 + vec2(t*0.55, 0.0));

  //float band  = f;
  //float band2 = g;

  //band  = pow(band,  1.15);
  //band2 = pow(band2, 1.10);

  //float micro = noise(q * 8.0 + vec2(t*1.7, -t*1.3));
  //f = mix(f, micro, 0.08);
  //g = mix(g, micro, 0.06);

    // --- Soften large color "blobs" ---
// Add a bit of high-frequency detail so the cloud masks don't form big flat regions.
float micro = noise(q * 2.2 + vec2(t*0.35, -t*0.28));
f = mix(f, micro, 0.035);
g = mix(g, micro, 0.03);

// Smooth remap (avoid near-binary masks)
float band  = pow(saturate(f),  1.15);
float band2 = pow(saturate(g),  1.12);

// Tiny spatial jitter to break any remaining contour edges
float dither01 = hash12(gl_FragCoord.xy * 0.5);
float jitter = (dither01 - 0.5) * (2.0 / 255.0);
band  = saturate(band  + jitter);
band2 = saturate(band2 + jitter);

float musicalT = (uPitch01 * 0.92 + uTheta01 * 0.35 + t * 0.12);

  float sheen = (fres * (0.35 + 0.85*e) + (band2-0.5) * 0.25) * uPearl;

  float pulse = saturate(uPulse) * (0.2 + 0.8*vel);

// Note injection distance in "sky UV" space
vec2 noteVec = (uv - uNotePos) * vec2(1.2, 1.0);
float d = length(noteVec);

// Domain-dither the injection edge to kill contour banding during big color jumps.
// Use *very* small spatial jitter + slight temporal drift (so it doesn't look like a static pattern).
float nA = hash12(gl_FragCoord.xy + uTime * 60.0);
float nB = hash12(gl_FragCoord.xy * 0.71 + 17.0 + uTime * 37.0);
float tri = (nA + nB) - 1.0; // -1..1 triangular noise
d += tri * 0.0035;           // 0.002~0.006 (bigger = stronger anti-banding)

// Exponential falloff (soft blob)
float inkFall = exp(-d * (6.0 + 10.0*e));

// Edge micro-jitter in mask space (prevents visible rings after toneMapping/bloom)
inkFall = saturate(inkFall + tri * 0.02);

float ink = pulse * inkFall;

  float wCloud = (0.20 + 0.42*e2) * band;
  float wSheen = (0.26 + 0.62*e)  * (0.38 + 0.62*band2) * uPearl;
  float wInk   = ink * (0.46 + 0.26*e);

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

  float bright = uIntensity * (0.55 + 1.10*e);
  bright = min(bright, 1.35); // 防止过曝导致中心出现奇怪的红形状
  col *= bright;

  // ✅ 让 Three.js 的 toneMapping / 输出色彩空间接管 gamma（避免重复 gamma 导致 banding）
  col = max(col, vec3(0.0));


  // Keep some HDR headroom for bloom (avoid hard clamp to 0..1 here)
  col = min(col, vec3(4.0));

  // --- Final pass: sRGB-space triangular dithering (best-effort banding removal) ---
  // Apply in sRGB space because banding is most visible after toneMapping/output encoding.
  vec3 srgb = linearToSrgb(col);

  float dn1 = hash12(gl_FragCoord.xy);
  float dn2 = hash12(gl_FragCoord.xy + 19.19);
  float dtri = (dn1 + dn2) - 1.0; // -1..1

  // Strength guideline:
  // 0.006 = subtle, 0.010 = strong. Injection moments may need stronger.
  srgb += dtri * 0.010;

  col = srgbToLinear(srgb);

  gl_FragColor = vec4(col, 1.0);
}
