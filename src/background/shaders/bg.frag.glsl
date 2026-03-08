
















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

  // Large-scale slow material flow layers (richness without noisy boiling).
  float flowA = fbm(p * 0.36 + vec2(t * 0.28, -t * 0.22));
  float flowB = fbm((p + vec2(2.7, -1.9)) * 0.22 + vec2(-t * 0.20, t * 0.26));
  float materialField = saturate(0.58 * flowA + 0.42 * flowB);
  float materialRidge = smoothstep(0.34, 0.82, materialField);

  vec2 w1 = vec2(fbm(p * 0.75 + vec2(t, -t)), fbm(p * 0.75 + vec2(-t, t)));
  vec2 w2 = vec2(fbm(p * 1.30 + vec2(-t*1.2, t*0.8)), fbm(p * 1.30 + vec2(t*0.9, -t*0.9)));
  vec2 materialWarp = (vec2(flowA - 0.5, flowB - 0.5)) * (0.10 + 0.14 * uWarp) * (0.45 + 0.35 * e);
  vec2 warp = (w1 - 0.5) * (0.55 + 0.85*e) * uWarp + (w2 - 0.5) * (0.18 + 0.45*e) * uDetail + materialWarp;

  // Step 2B: localized interaction energy + transport.
  vec2 dInt = uv - uInteractionPos;
  float distInt = length(dInt);
  float localMask = 1.0 - smoothstep(0.42, 0.55, distInt); // near zero when dist > ~0.5
  float energy = exp(-distInt * 3.0) * ie * localMask;
  energy *= 0.98; // gentle diffusion damping

  vec2 swirlDir = vec2(-dInt.y, dInt.x) / max(1e-4, distInt);
  float swirlPhase = sin(uTime * (0.35 + 0.45 * uFlow) + distInt * 14.0 + uTheta01 * 6.28318);

  // Background flow direction for transport (from existing domain warp fields).
  vec2 flowDir = normalize(vec2(w1.x - w2.y, w1.y + w2.x) + vec2(1e-4, 1e-4));
  vec2 localVectorField = swirlDir * swirlPhase * 0.030 + dInt * (-0.020);

  vec2 flowUV = p;
  flowUV += localVectorField * energy;
  flowUV += flowDir * energy * 0.15;

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

float palettePhase = (0.62 + t * 0.06 + (materialField - 0.5) * 0.14);

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

  float richness = 0.35 + 0.45 * e;
  float wCloud = (0.20 + 0.42*e2) * band * mix(0.80, 1.20, materialRidge * richness);
  float wSheen = (0.26 + 0.62*e)  * (0.38 + 0.62*band2) * uPearl * mix(0.78, 1.22, (1.0 - materialRidge) * richness);
  float wInk   = ink * (0.46 + 0.26*e);

  vec3 c0 = palette4(palettePhase + sheen * 0.35 + (f - 0.5) * 0.18);
  vec3 c1 = palette4(palettePhase + 0.21 + sheen * 0.52 + (g - 0.5) * 0.22);
  vec3 cInk = palette4(palettePhase + 0.58 + uNoteSeed * 0.07);

  // Step 3: coexisting spectral fields (no global hue replacement).
  vec3 spectralDeepBlue = vec3(0.12, 0.22, 0.56);
  vec3 spectralViolet   = vec3(0.36, 0.24, 0.62);
  vec3 spectralCyan     = vec3(0.20, 0.56, 0.66);
  vec3 spectralMagenta  = vec3(0.56, 0.28, 0.58);
  vec3 spectralGold     = vec3(0.64, 0.54, 0.28);

  float fBlue    = fbm(q * 0.26 + vec2( t * 0.18, -t * 0.12));
  float fViolet  = fbm(q * 0.22 + vec2(-t * 0.15,  t * 0.19) + vec2( 3.4, -1.9));
  float fCyan    = fbm(q * 0.30 + vec2( t * 0.21,  t * 0.07) + vec2(-2.7,  4.1));
  float fMagenta = fbm(q * 0.24 + vec2(-t * 0.10, -t * 0.17) + vec2( 5.3,  2.2));
  float fGold    = fbm(q * 0.18 + vec2( t * 0.09, -t * 0.06) + vec2(-4.8, -3.3));

  float wBlue    = smoothstep(0.48, 0.92, fBlue);
  float wViolet  = smoothstep(0.54, 0.94, fViolet);
  float wCyan    = smoothstep(0.50, 0.93, fCyan);
  float wMagenta = smoothstep(0.56, 0.95, fMagenta);
  float wGold    = smoothstep(0.76, 0.98, fGold) * 0.22; // very subtle warm accent

  // Gate spectral fields to material ridges / sheen regions to avoid foggy coverage.
  float spectralGate = pow(saturate(materialRidge), 1.35) * (0.18 + 0.82 * pow(saturate(fres), 0.8));
  wBlue    *= spectralGate;
  wViolet  *= spectralGate;
  wCyan    *= spectralGate;
  wMagenta *= spectralGate;
  wGold    *= spectralGate;

  float wSum = max(1e-4, wBlue + wViolet + wCyan + wMagenta + wGold);
  vec3 spectralCol =
    (spectralDeepBlue * wBlue +
     spectralViolet  * wViolet +
     spectralCyan    * wCyan +
     spectralMagenta * wMagenta +
     spectralGold    * wGold) / wSum;

  float spectralBlend = (0.02 + 0.12 * materialRidge) * (0.30 + 0.55 * e) * (0.35 + 0.65 * fres);
  c0 = mix(c0, spectralCol, spectralBlend * 0.45);
  c1 = mix(c1, spectralCol, spectralBlend * 0.65);

  vec3 col = uBase;
  col = mix(col, c0, wCloud);
  col = mix(col, c1, wSheen);
  col = mix(col, cInk, wInk);
  col = mix(col, spectralCol, (0.01 + 0.05 * materialRidge) * (0.35 + 0.45 * e) * (0.30 + 0.70 * fres));

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
