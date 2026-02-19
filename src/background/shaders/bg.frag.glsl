precision highp float;

uniform float uTime;
uniform float uIntensity;   // 默认 1 也可
uniform vec3  uTint;        // 默认 (1,1,1) 也可

uniform float uBaseHue;    // 0..1
uniform float uWarmCool;   // -1..1 (负数更冷，正数更暖)


varying vec2 vUv;
varying vec3 vWorldDir;

// ---------------------------
// Utilities
// ---------------------------
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x*p.y);
}

float noise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);

  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm2(vec2 p){
  float v = 0.0;
  float a = 0.55;
  for(int i=0;i<4;i++){
    v += a * noise2(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 compressHighlights(vec3 c){
  float mx = max(c.r, max(c.g, c.b));
  return c / (1.0 + mx * 0.85);
}

// ---------------------------
// Triplanar fbm (seamless sky)
// ---------------------------
float triFbm(vec3 p){
  vec3 w = abs(p);
  w = max(w, 1e-4);
  w /= (w.x + w.y + w.z);

  float x = fbm2(p.yz);
  float y = fbm2(p.zx);
  float z = fbm2(p.xy);

  return x*w.x + y*w.y + z*w.z;
}

// Pseudo 3D flow field (cheap, looks "liquid")
vec3 flow3(vec3 p, float t){
  // three correlated layers
  float a = triFbm(p*1.05 + vec3(0.0,  t, 0.0));
  float b = triFbm(p*1.40 + vec3(0.0, 0.0,-t));
  float c = triFbm(p*1.90 + vec3( t, 0.0, 0.0));

  vec3 n = vec3(a, b, c) - 0.5;
  // make a swirly direction from differences
  vec3 dir = vec3(n.y - n.z, n.z - n.x, n.x - n.y);
  return normalize(dir + 1e-5);
}

void main(){
  // world direction as sky coordinate
  vec3 dir = normalize(vWorldDir);

  // Slow time (dreamy, not frantic)
  float t = uTime * 0.014;

  // Deep space base (not pure black)
  vec3 deep = vec3(0.010, 0.012, 0.030);

  // Domain point in 3D noise space
  vec3 p = dir;

  // Multi-step advection (gives melt feeling, no seams)
  vec3 adv = vec3(0.0);
  for(int i=0;i<2;i++){
    vec3 d = flow3(p * (1.3 + float(i)*0.7), t + float(i)*1.6);
    float s1 = 0.020 + 0.010*float(i);
    float s2 = 0.030 + 0.018*float(i);
    adv += d * s1;
    p   += d * s2;
  }

  // Soft warp for liquid feel (3D)
  vec3 warp = vec3(
    triFbm(p*2.0 + vec3( 3.1,-1.7, t)),
    triFbm(p*2.0 + vec3(-2.4, 4.3,-t)),
    triFbm(p*2.0 + vec3( 1.8, 2.2, t*0.6))
  );
  p += (warp - 0.5) * 0.20;

  // Fields (layers)
  float f1 = triFbm(p*1.10 + vec3(0.0,  t, 0.0));
  float f2 = triFbm(p*2.10 + vec3(4.0, -t*1.2, 0.0));
  float f3 = triFbm(p*3.40 + vec3(-6.0, t*0.7, 0.0));
  float field = 0.54*f1 + 0.30*f2 + 0.16*f3;

  // Center mask based on viewing direction "upness" (subtle sky depth)
  float up = clamp(dir.y*0.5 + 0.5, 0.0, 1.0);
  float centerMask = smoothstep(0.0, 1.0, 1.0 - abs(dir.y)*0.9); // more energy near horizon-ish
  centerMask = mix(0.35, 1.0, centerMask);

  // Band / volume
  float band = smoothstep(0.18, 0.88, field) * centerMask;

  // Cool dreamy palette (more in-family with nebula)
  float hBase = fract(uBaseHue + 0.03*sin(uTime*0.04) + 0.06*uWarmCool);

  vec3 c0 = hsv2rgb(vec3(fract(hBase + 0.00), 0.50, 0.95)); // violet
  vec3 c1 = hsv2rgb(vec3(fract(hBase + 0.12), 0.52, 0.95)); // pink-violet
  vec3 c2 = hsv2rgb(vec3(fract(hBase + 0.36), 0.48, 0.92)); // cyan
  vec3 c3 = hsv2rgb(vec3(fract(hBase + 0.50), 0.42, 0.92)); // aqua-lilac (cool, avoids yellow)

  float k0 = smoothstep(0.10, 0.45, field);
  float k1 = smoothstep(0.30, 0.70, field);
  float k2 = smoothstep(0.55, 0.90, field);

  vec3 col = mix(c0, c1, k0);
  col = mix(col, c2, k1);
  col = mix(col, c3, k2);

  // Iridescent shift (subtle, elegant)
  float ir = 0.08 * (0.5 + 0.5*sin(field*7.0 - uTime*0.12));
  col = mix(col, hsv2rgb(vec3(fract(hBase + 0.18 + ir), 0.42, 0.95)), 0.30);

  // Glow / energy (avoid "yellow veil")
  float glow = pow(band, 1.25);
  vec3 glowTint = mix(vec3(0.65, 0.80, 1.00), vec3(1.00, 0.75, 0.95), 0.25);
  col *= (0.30 + 1.10*glow);
  col += glow * 0.22 * glowTint;

  // Gentle wave layer
  float wave = 0.5 + 0.5*sin((field*6.0 + up*3.0) - uTime*0.08);
  wave = smoothstep(0.40, 0.95, wave) * 0.22;
  col += wave * vec3(0.75, 0.85, 1.0) * (0.35 + 0.65*centerMask);

  // Mix into deep space
  col = mix(deep, col, 0.58 + 0.42*centerMask);

  // Optional tint + intensity
  col = mix(col, col * uTint, 0.18);
  col *= clamp(uIntensity, 0.0, 1.4);

  // Highlight roll-off (prevents thick veil)
  col = compressHighlights(col);

  // Mild saturation (keep background less loud than nebula)
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.03);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
