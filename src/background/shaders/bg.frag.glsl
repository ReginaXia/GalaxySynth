precision highp float;

uniform float uTime;
uniform float uIntensity;   // 可有可无（默认 1 也能好看）
uniform vec2  uMouse;       // 可有可无（不传也没关系）
uniform float uParallax;    // 可有可无
uniform vec3  uTint;        // 可有可无

varying vec2 vUv;

// ---------------------------
// Utilities
// ---------------------------
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x*p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);

  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.55;
  for(int i=0;i<6;i++){
    v += a * noise(p);
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

// “curl-ish” flow direction (cheap but pretty)
vec2 flowDir(vec2 p, float t){
  float e = 0.002;
  float n1 = fbm(p + vec2(0.0, e) + t);
  float n2 = fbm(p + vec2(0.0,-e) + t);
  float n3 = fbm(p + vec2( e,0.0) + t);
  float n4 = fbm(p + vec2(-e,0.0) + t);
  vec2 g = vec2(n3 - n4, n1 - n2);
  // rotate gradient 90° to get a swirling field
  return normalize(vec2(g.y, -g.x) + 1e-5);
}

vec3 compressHighlights(vec3 c){
  float mx = max(c.r, max(c.g, c.b));
  return c / (1.0 + mx * 0.85);
}

void main(){
  // Normalized screen uv
  vec2 uv = vUv;

  // Optional parallax from mouse (safe even if uMouse/uParallax not set)
  vec2 m = uMouse;
  float par = uParallax;
  uv += (m - 0.5) * 0.06 * par;

  // Centered coordinates for radial structure
  vec2 q = (uv - 0.5) * vec2(1.15, 1.0);

  // Time (slow)
  float t = uTime * 0.012;

  // Base deep space (not pure black)
  vec3 deep = vec3(0.010, 0.012, 0.030);

  // Build a “liquid domain” by advecting uv through a swirling flow field
  vec2 p = uv;
  vec2 adv = vec2(0.0);

  // Multi-step advection (gives “melt” feeling)
  for(int i=0;i<3;i++){
    vec2 d = flowDir(p * (1.6 + float(i)*0.9), t + float(i)*1.7);
    adv += d * (0.020 + 0.010*float(i));
    p += d * (0.030 + 0.020*float(i));
  }

  // Add domain warping (soft, not noisy)
  vec2 warp = vec2(
    fbm(p*2.1 + vec2( 3.1, -1.7) + t),
    fbm(p*2.1 + vec2(-2.4,  4.3) - t)
  );
  p += (warp - 0.5) * 0.18;

  // Fields (layers) -> structure + “cloud thickness”
  float f1 = fbm(p*1.2 + vec2(0.0,  t));
  float f2 = fbm(p*2.3 + vec2(4.0, -t*1.2));
  float f3 = fbm(p*3.7 + vec2(-6.0, t*0.7));
  float field = 0.52*f1 + 0.30*f2 + 0.18*f3;

  // “Volume” mask: denser near center + along flow
  float r = length(q);
  float centerMask = smoothstep(0.95, 0.12, r);
  float band = smoothstep(0.15, 0.85, field) * (0.35 + 0.65*centerMask);

  // 4-color dreamy palette that gently shifts over time
  float hBase = 0.70 + 0.05*sin(uTime*0.04); // 更冷、更克制

  vec3 c0 = hsv2rgb(vec3(fract(hBase + 0.00), 0.55, 0.95)); // violet
  vec3 c1 = hsv2rgb(vec3(fract(hBase + 0.14), 0.55, 0.95)); // pink
  vec3 c2 = hsv2rgb(vec3(fract(hBase + 0.38), 0.50, 0.92)); // cyan
  vec3 c3 = hsv2rgb(vec3(fract(hBase + 0.50), 0.42, 0.92)); // cool aqua-lilac


  // Blend by field thresholds (creates “regions”)
  float k0 = smoothstep(0.10, 0.45, field);
  float k1 = smoothstep(0.30, 0.70, field);
  float k2 = smoothstep(0.55, 0.90, field);

  vec3 col = mix(c0, c1, k0);
  col = mix(col, c2, k1);
  col = mix(col, c3, k2);

  // Add “iridescent” shift by view-radius (subtle, elegant)
  float ir = 0.08 * (0.5 + 0.5*sin(8.0*r - uTime*0.15));
  col = mix(col, hsv2rgb(vec3(fract(hBase + 0.20 + ir), 0.45, 0.95)), 0.35);

  // Energy glow (liquid light)
  float glow = pow(band, 1.25);
  vec3 glowTint = mix(vec3(0.65, 0.80, 1.00), vec3(1.00, 0.75, 0.95), 0.25);
  col *= (0.30 + 1.10*glow);
  col += glow * 0.22 * glowTint;


  // Add a second soft luminous layer (like distant light-wave)
  float wave = 0.5 + 0.5*sin((field*6.0 + r*7.0) - uTime*0.20);
  wave = smoothstep(0.40, 0.95, wave) * 0.25;
  col += wave * vec3(0.8, 0.9, 1.0) * (0.35 + 0.65*centerMask);

  // Mix into deep space (always keep depth)
  col = mix(deep, col, 0.55 + 0.45*centerMask);

  // Optional tint (safe even if uTint not set)
  col = mix(col, col * uTint, 0.18);

  // Global intensity (safe even if uIntensity default)
  col *= clamp(uIntensity, 0.0, 1.4);

  // Highlight roll-off (prevents “thick dark veil” feeling)
  col = compressHighlights(col);

  // Slight saturation lift
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.03);

  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
