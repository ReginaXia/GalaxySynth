
















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
uniform vec2  uEmitPos0;
uniform vec2  uEmitPos1;
uniform vec2  uEmitPos2;
uniform vec3  uEmitCol0;
uniform vec3  uEmitCol1;
uniform vec3  uEmitCol2;
uniform float uEmitStr0;
uniform float uEmitStr1;
uniform float uEmitStr2;

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
uniform vec3  uNoteColor;  // 0..1 custom per-note tint
uniform float uNoteColorMix; // 0..1
uniform float uNoteColorStrict; // 0..1
uniform float uRichness; // 0..1
uniform float uDream; // 0..1

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

  float t = uTime * (0.016 + 0.22 * uFlow);

  float e = saturate(uLeadE);
  float e2 = e*e;
  float vel = saturate(uVel01);
  float ie = saturate(uInteractionE);

  vec2 p = (uv - 0.5) * (1.15 + 2.35 * uScale);

  vec2 m = (uMouse - 0.5);
  p += m * (0.06 + 0.12*e);

  // Large-scale slow material flow layers (richness without noisy boiling).
  float rich = saturate(uRichness);
  float dreamy = saturate(uDream);

  float flowA = fbm(p * 0.36 + vec2(t * 0.28, -t * 0.22));
  float flowB = fbm((p + vec2(2.7, -1.9)) * 0.22 + vec2(-t * 0.20, t * 0.26));
  float flowC = fbm((p + vec2(-3.1, 1.7)) * 0.58 + vec2(t * 0.11, -t * 0.09));
  float flowD = fbm((p + vec2(4.4, -2.6)) * 0.14 + vec2(-t * 0.06, t * 0.05));
  float materialField = saturate(0.46 * flowA + 0.30 * flowB + 0.16 * flowC + 0.08 * flowD);
  float materialRidge = smoothstep(0.38, 0.80, materialField);
  float materialPocket = smoothstep(0.18, 0.64, flowD) * (1.0 - materialRidge);

  vec2 w1 = vec2(fbm(p * 1.45 + vec2(t, -t)), fbm(p * 1.45 + vec2(-t, t)));
  vec2 w2 = vec2(fbm(p * 2.55 + vec2(-t*1.2, t*0.8)), fbm(p * 2.55 + vec2(t*0.9, -t*0.9)));
  vec2 materialWarp = (vec2(flowA - 0.5, flowB - 0.5)) * (0.10 + 0.16 * uWarp) * (0.45 + 0.45 * e);
  vec2 warp = (w1 - 0.5) * (0.60 + 1.05*e) * uWarp + (w2 - 0.5) * (0.22 + 0.52*e) * uDetail + materialWarp;

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
  flowUV += localVectorField * energy * 1.18;
  flowUV += flowDir * energy * 0.22;

  vec2 q = flowUV + warp;
  float f = fbm(q * 1.20 + vec2(0.0, t*0.45));
  float g = fbm(q * 2.35 + vec2(t*0.55, 0.0));

  //float band  = f;
  //float band2 = g;

  //band  = pow(band,  1.15);
  //band2 = pow(band2, 1.10);

  //float micro = noise(q * 8.0 + vec2(t*1.7, -t*1.3));
  //f = mix(f, micro, 0.08);
  //g = mix(g, micro, 0.06);

    // --- Soften large color "blobs" ---
// Add a bit of high-frequency detail so the cloud masks don't form big flat regions.
float micro = noise(q * 8.8 + vec2(t*1.10, -t*0.92));
f = mix(f, micro, 0.120);
g = mix(g, micro, 0.095);

// A tiny high-frequency filament layer to avoid "large moving patches".
float h = fbm(q * 4.20 + vec2(-t*0.80, t*0.72));
g = mix(g, h, 0.14);

// Medium/high-frequency anisotropic filaments for richer "liquid light" density.
float filA = fbm(q * 4.8 + vec2(t * 0.92, -t * 0.78));
float filB = fbm((q + vec2(6.1, -3.7)) * 6.2 + vec2(-t * 0.66, t * 0.58));
  float filament = pow(saturate(abs(filA - filB) * mix(1.45, 1.95, rich)), mix(1.34, 1.14, rich));
  float filC = fbm((q + vec2(-4.3, 2.5)) * 8.8 + vec2(t * 0.52, -t * 0.48));
  float filamentHi = pow(saturate(abs(filC - h) * mix(1.65, 2.15, rich)), mix(1.24, 1.10, rich));
  float vein = pow(saturate(abs(g - f) * mix(1.55, 2.05, rich)), mix(1.34, 1.16, rich));

// Smooth remap (avoid near-binary masks)
float band  = pow(saturate(f),  1.10);
float band2 = pow(saturate(g),  1.06);
float bandEdge = smoothstep(0.52, 0.92, band2) - smoothstep(0.92, 1.0, band2);

// Tiny spatial jitter to break any remaining contour edges
float dither01 = hash12(gl_FragCoord.xy * 0.5);
float jitter = (dither01 - 0.5) * (2.0 / 255.0);
band  = saturate(band  + jitter);
band2 = saturate(band2 + jitter);

  float musicalT = (uPitch01 * 0.88 + uTheta01 * 0.42 + t * 0.10 + energy * 0.24);
  float palettePhase = (0.50 + t * 0.09 + (materialField - 0.5) * 0.18 + musicalT * 0.55);

  float sheen = (fres * (0.35 + 1.05*e) + (band2-0.5) * 0.28) * uPearl;

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
  float wCloud = (0.09 + 0.20*e2) * band * mix(0.74, 1.05, materialRidge * richness);
  float wSheen = (0.26 + 0.62*e)  * (0.38 + 0.62*band2) * uPearl * mix(0.78, 1.22, (1.0 - materialRidge) * richness);
  float wInk   = ink * (0.46 + 0.26*e);

  vec3 c0 = palette4(palettePhase + sheen * 0.42 + (f - 0.5) * 0.24);
  vec3 c1 = palette4(palettePhase + 0.28 + sheen * 0.62 + (g - 0.5) * 0.30);
  vec3 cInk = palette4(palettePhase + 0.58 + uNoteSeed * 0.07);
  float strictK = saturate(uNoteColorStrict);
  float noteImpact = saturate(uNoteColorMix);
  cInk = mix(cInk, uNoteColor, noteImpact * (0.42 + 0.58 * ink));

  // Step 3: coexisting spectral fields (no global hue replacement).
  vec3 spectralDeepBlue = vec3(0.12, 0.22, 0.56);
  vec3 spectralViolet   = vec3(0.36, 0.24, 0.62);
  vec3 spectralCyan     = vec3(0.20, 0.56, 0.66);
  vec3 spectralMagenta  = vec3(0.56, 0.28, 0.58);
  vec3 spectralGold     = vec3(0.64, 0.54, 0.28);
  vec3 spectralIndigo   = vec3(0.20, 0.24, 0.66);
  vec3 spectralPearl    = vec3(0.54, 0.68, 0.78);

  float fBlue    = fbm(q * 0.26 + vec2( t * 0.18, -t * 0.12));
  float fViolet  = fbm(q * 0.22 + vec2(-t * 0.15,  t * 0.19) + vec2( 3.4, -1.9));
  float fCyan    = fbm(q * 0.30 + vec2( t * 0.21,  t * 0.07) + vec2(-2.7,  4.1));
  float fMagenta = fbm(q * 0.24 + vec2(-t * 0.10, -t * 0.17) + vec2( 5.3,  2.2));
  float fGold    = fbm(q * 0.18 + vec2( t * 0.09, -t * 0.06) + vec2(-4.8, -3.3));
  float fIndigo  = fbm(q * 0.20 + vec2(-t * 0.12,  t * 0.09) + vec2( 1.9,  5.6));
  float fPearl   = fbm(q * 0.16 + vec2( t * 0.05, -t * 0.04) + vec2(-6.2,  1.1));

  float wBlue    = smoothstep(0.48, 0.92, fBlue);
  float wViolet  = smoothstep(0.54, 0.94, fViolet);
  float wCyan    = smoothstep(0.50, 0.93, fCyan);
  float wMagenta = smoothstep(0.56, 0.95, fMagenta);
  float wGold    = smoothstep(0.76, 0.98, fGold) * 0.22; // very subtle warm accent
  float wIndigo  = smoothstep(0.58, 0.95, fIndigo) * 0.58;
  float wPearl   = smoothstep(0.84, 0.995, fPearl) * 0.10;

  // Gate spectral fields to material ridges / sheen regions to avoid foggy coverage.
  float spectralGate = pow(saturate(materialRidge), 1.45) * (0.12 + 0.70 * pow(saturate(fres), 0.9));
  wBlue    *= spectralGate;
  wViolet  *= spectralGate;
  wCyan    *= spectralGate;
  wMagenta *= spectralGate;
  wGold    *= spectralGate;
  wIndigo  *= spectralGate;
  wPearl   *= spectralGate;

  float wSum = max(1e-4, wBlue + wViolet + wCyan + wMagenta + wGold + wIndigo + wPearl);
  vec3 spectralCol =
    (spectralDeepBlue * wBlue +
     spectralViolet  * wViolet +
     spectralCyan    * wCyan +
     spectralMagenta * wMagenta +
     spectralGold    * wGold +
     spectralIndigo  * wIndigo +
     spectralPearl   * wPearl) / wSum;

  float spectralBlend = (0.04 + 0.17 * materialRidge) * (0.38 + 0.62 * e) * (0.28 + 0.56 * fres);
  c0 = mix(c0, spectralCol, spectralBlend * 0.52);
  c1 = mix(c1, spectralCol, spectralBlend * 0.72);

  // Strict note color should influence not only emitter but also local spectral field.
  float noteProx = exp(-d * 7.2);
  float noteColorK = noteImpact * (0.48 + 0.46 * noteImpact);
  c0 = mix(c0, mix(c0, uNoteColor, 0.70), noteProx * noteColorK * 0.30);
  c1 = mix(c1, mix(c1, uNoteColor, 0.82), noteProx * noteColorK * 0.38);
  spectralCol = mix(spectralCol, uNoteColor, noteProx * noteColorK * 0.24);

  // Deep-space gradient base to avoid flat white wash.
  float gy = smoothstep(0.08, 0.92, uv.y + (flowA - 0.5) * 0.08);
  vec3 deepLow = vec3(0.018, 0.024, 0.052);
  vec3 deepMid = vec3(0.040, 0.050, 0.090);
  vec3 deepHigh = vec3(0.080, 0.058, 0.122);
  vec3 gradBase = mix(deepLow, deepMid, gy);
  gradBase = mix(gradBase, deepHigh, smoothstep(0.62, 1.0, gy) * 0.55);

  vec3 col = mix(uBase, gradBase, 0.78);
  col = mix(col, c0, wCloud);
  col = mix(col, c1, wSheen);
  col = mix(col, cInk, wInk);
  float noteTintMask = inkFall * (0.30 + 0.70 * pulse);
  col = mix(col, col + uNoteColor * 0.82, noteTintMask * noteImpact * 0.78);
  col = mix(col, spectralCol, (0.022 + 0.080 * materialRidge) * (0.35 + 0.62 * e) * (0.26 + 0.56 * fres));

  // Stronger local note color presence: liquid injection + halo ring.
  float liquidInjection = pow(noteProx, 1.10) * (0.30 + 0.70 * energy) * (0.28 + 0.72 * bandEdge);
  vec3 liquidCol = mix(uNoteColor, spectralCol, 0.22);
  col += liquidCol * liquidInjection * noteImpact * 0.40;

  float haloInner = exp(-d * 16.0);
  float haloOuter = exp(-d * 3.2);
  float haloRing = max(0.0, haloOuter - haloInner);
  vec3 haloCol = mix(uNoteColor, vec3(1.00, 0.72, 0.46), 0.12);
  col += haloCol * haloRing * (0.22 + 0.55 * pulse + 0.22 * energy) * noteImpact * 0.96;

  // Richer iridescent micro-structure without global overbright fog.
  float filamentMask = filament * (0.36 + 0.64 * materialRidge) * (0.32 + 0.68 * fres) * (0.28 + 0.72 * bandEdge);
  vec3 filamentCol = mix(spectralCol, c1, 0.55);
  col += filamentCol * filamentMask * (0.10 + 0.24 * rich) * (0.70 + 0.30 * e);
  col += mix(c0, spectralCol, 0.42) * filamentHi * (0.03 + 0.13 * rich) * (0.30 + 0.70 * materialRidge);
  vec3 veinCol = mix(c0, spectralCol, 0.68);
  col += veinCol * vein * (0.03 + 0.11 * rich) * (0.60 + 0.40 * e) * (0.26 + 0.74 * materialRidge);
  float contour = smoothstep(0.40, 0.78, band2) - smoothstep(0.78, 0.96, band2);
  col += mix(c0, c1, 0.50) * contour * (0.05 + 0.14 * rich) * (0.55 + 0.45 * e);

  // Local "cosmic sunset" glow injection from note color (localized only).
  vec3 warmSunset = vec3(1.00, 0.62, 0.36);
  vec3 sunsetTint = mix(uNoteColor, warmSunset, 0.20);
  float sunsetCore = exp(-d * 10.5) * (0.45 + 0.55 * pulse);
  float sunsetHalo = exp(-d * 4.8) * (0.20 + 0.80 * energy);
  float sunsetMask = (sunsetCore * 0.75 + sunsetHalo * 0.25) * saturate(uNoteColorMix);
  col += sunsetTint * sunsetMask * 0.28;

  // Nebula-local color emitters: spatial "light-up" feel near interaction points.
  vec2 e0v = (uv - uEmitPos0) * vec2(1.06, 1.0);
  vec2 e1v = (uv - uEmitPos1) * vec2(1.06, 1.0);
  vec2 e2v = (uv - uEmitPos2) * vec2(1.06, 1.0);
  float e0d = length(e0v);
  float e1d = length(e1v);
  float e2d = length(e2v);
  float e0g = (exp(-e0d * 18.0) * 0.52 + exp(-e0d * 6.6) * 0.48) * uEmitStr0;
  float e1g = (exp(-e1d * 18.0) * 0.52 + exp(-e1d * 6.6) * 0.48) * uEmitStr1;
  float e2g = (exp(-e2d * 18.0) * 0.52 + exp(-e2d * 6.6) * 0.48) * uEmitStr2;
  vec3 emitCol = uEmitCol0 * e0g + uEmitCol1 * e1g + uEmitCol2 * e2g;
  float emitMask = saturate(e0g + e1g + e2g);
  float emitSheen = (0.38 + 0.62 * fres) * (0.30 + 0.70 * materialRidge);
  col += emitCol * (0.30 + 0.62 * emitSheen + 0.46 * noteImpact);
  col = mix(col, col + emitCol * mix(0.14, 0.26, dreamy), emitMask * mix(0.18, 0.30, dreamy));

  // Deep pockets with subtle chroma breathing to avoid flatness on large displays.
  float pocketPulse = 0.5 + 0.5 * sin(t * 0.55 + materialField * 5.2 + uTheta01 * 6.28318);
  vec3 pocketCol = mix(vec3(0.03, 0.05, 0.10), spectralCol * 0.55, 0.52 + 0.48 * pocketPulse);
  col = mix(col, col + pocketCol * (0.06 + 0.08 * rich), materialPocket * (0.35 + 0.65 * e));

  // Preserve dark separations so motion reads as fine flow, not full-screen wash.
  float darkGap = (1.0 - materialRidge) * (0.45 + 0.55 * (1.0 - band));
  col *= (1.0 - darkGap * 0.18);

  float sp = 0.0;
  if (uSparkle > 0.001){
    vec2 spUv = uv * (260.0 + 320.0*uScale) + vec2(t*7.0, -t*5.0);
    float r = hash21(floor(spUv));
    float tw = smoothstep(0.995, 1.0, r);
    float flicker = 0.5 + 0.5*sin(uTime*10.0 + r*6.283);
    sp = tw * flicker * (0.25 + 0.95*e) * uSparkle;
  }
  vec3 sparkleCol = mix(c1, spectralCol, 0.62);
  col += sp * sparkleCol;

  // Dreamy soft glow only around edges/highlight structures (keeps color coordinated).
  float dreamMask = (0.25 + 0.75 * fres) * (0.35 + 0.65 * materialRidge);
  vec3 dreamCol = mix(spectralCol, vec3(0.62, 0.56, 0.78), 0.18);
  col = mix(col, col + dreamCol * 0.12, dreamy * dreamMask * (0.14 + 0.16 * e));

  vec3 satCol = applySaturation(col, 1.12 + uSat * 1.24);
  float satMaskRidge = pow(saturate(materialRidge), 1.1);
  float satMask = saturate(0.10 + satMaskRidge * 0.52 + energy * 0.46 + emitMask * 0.40);
  col = mix(col, satCol, satMask);
  col = applyContrast(col, uContrast);

  float bright = uIntensity * (0.46 + 1.02*e);
  bright = min(bright, 1.12);
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
