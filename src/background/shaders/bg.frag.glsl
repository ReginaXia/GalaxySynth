precision highp float;

uniform float uTime;
uniform float uIntensity;

// NEW
uniform vec2 uMouse;   // 0..1
uniform float uParallax; // 0..1
uniform float uRings;    // 0..1
uniform float uGlitter;  // 0..1

uniform vec3 uTint;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sat(float x){ return clamp(x, 0.0, 1.0); }

void main() {
  vec2 uv = vUv;

  // -----------------------------
  // 1) Mouse parallax (subtle)
  // -----------------------------
  vec2 m = uMouse * 2.0 - 1.0; // -1..1
  float breathe = 0.5 + 0.5 * sin(uTime * 0.12);

  // Very subtle background drift + mouse parallax
  vec2 par = m * 0.06 * uParallax;
  uv += par;
  uv += vec2(sin(uTime * 0.03), cos(uTime * 0.026)) * 0.01;

  // -----------------------------
  // 2) Liquid gradient base
  // -----------------------------
  vec2 gUv = uv;
  gUv.y += breathe * 0.10;

  float baseHue = 0.84 - gUv.y * 0.20;
  baseHue += sin(uTime * 0.05 + gUv.x * 2.0) * 0.02;

  float n = noise(gUv * 3.0 + uTime * 0.02);
  baseHue += (n - 0.5) * 0.04;

  // dark-ish value to avoid washout
  vec3 col = hsv2rgb(vec3(baseHue, 0.55, 0.42));

  // vignette (center focus)
  vec2 p = (vUv * 2.0 - 1.0);
  float vignette = smoothstep(1.25, 0.25, dot(p, p));
  col *= mix(0.65, 1.0, vignette);

  // breathe gain (subtle)
  col *= 0.92 + 0.08 * breathe * uIntensity;

  // -----------------------------
  // 3) Y2K iridescent rings (very subtle)
  // -----------------------------
  // Rings centered slightly off-center for "alive" feeling
  vec2 c = (vUv - vec2(0.52, 0.48)) * vec2(1.0, 0.92);
  float r = length(c);

  // Ring mask: thin bands with soft falloff
  float ringFreq = 18.0;
  float ring = sin(r * ringFreq - uTime * 0.25);
  ring = 0.5 + 0.5 * ring;
  ring = pow(ring, 10.0); // make bands thin
  float ringFalloff = smoothstep(0.85, 0.15, r);
  float ringMask = ring * ringFalloff * uRings;

  // iridescent tint for rings (blue/purple highlight)
  float ringHue = 0.62 + 0.08 * sin(uTime * 0.12 + r * 6.0);
  vec3 ringCol = hsv2rgb(vec3(ringHue, 0.55, 1.0));

  col += ringCol * ringMask * 0.22;

  // -----------------------------
  // 4) Glitter specks (少女亮粉)
  // -----------------------------
  // sparse sparkle using hash
  vec2 gp = vUv * vec2(420.0, 240.0);
  float h = hash(floor(gp));
  float sparkle = step(0.9965, h);              // sparse
  sparkle *= (0.6 + 0.4 * sin(uTime * 6.0 + h * 10.0)); // twinkle
  sparkle *= uGlitter;

  // glitter color slightly varies
  float gh = fract(0.92 + h * 0.25);
  vec3 gcol = hsv2rgb(vec3(gh, 0.35, 1.0));
  col += gcol * sparkle * 0.18;

  col *= uTint;
  
  gl_FragColor = vec4(col, 1.0);
}
