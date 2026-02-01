// src/background/shaders/bg.frag.glsl
precision highp float;

uniform float uTime;
uniform float uIntensity;

uniform vec2  uMouse;      // 0..1
uniform float uParallax;   // 0..1
uniform float uRings;      // 0..1
uniform float uGlitter;    // 0..1

uniform vec3  uTint;       // 0..1 rgb
uniform float uEmergence;  // 0..1 (0=black, 1=pastel space)

varying vec2 vUv;

// ---------------------------
// Helpers
// ---------------------------
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float smoothNoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for(int i=0;i<5;i++){
    v += a * smoothNoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// Pastel palette (NewJeans-ish, creamy)
vec3 palettePastel(float t){
  // 4 anchors: pink, cream yellow, icy blue, lilac
  vec3 c1 = vec3(1.00, 0.84, 0.92); // pink cream
  vec3 c2 = vec3(1.00, 0.96, 0.74); // warm cream yellow
  vec3 c3 = vec3(0.80, 0.93, 1.00); // icy blue
  vec3 c4 = vec3(0.90, 0.84, 1.00); // lilac

  t = fract(t);
  if(t < 0.33) return mix(c1, c2, t / 0.33);
  if(t < 0.66) return mix(c2, c3, (t - 0.33) / 0.33);
  return mix(c3, c4, (t - 0.66) / 0.34);
}

void main(){
  vec2 uv = vUv;

  // Mouse parallax (subtle)
  vec2 m = uMouse - 0.5;
  uv += m * 0.06 * uParallax;

  // Liquid warp (slow)
  float t = uTime * 0.06;
  vec2 warp = vec2(
    fbm(uv * 2.0 + vec2(0.0, t)),
    fbm(uv * 2.0 + vec2(10.0, -t))
  );
  uv += (warp - 0.5) * 0.10;

  // Core field -> pastel gradient "volume"
  float n1 = fbm(uv * 1.4 + vec2(0.0, t));
  float n2 = fbm(uv * 2.6 + vec2(4.0, -t * 1.2));
  float field = 0.55 * n1 + 0.45 * n2;

  // Big soft blobs (gives that "gel" shape)
  vec2 p = uv - 0.5;
  float r = length(p);
  float blobs = smoothstep(0.55, 0.10, r + 0.18 * sin(3.0 * p.x + uTime * 0.2) + 0.10 * (n2 - 0.5));

  // Pastel base (never pure black)
  vec3 pastelA = palettePastel(field * 1.2 + 0.10 * sin(uTime * 0.07));
  vec3 pastelB = palettePastel(field * 1.2 + 0.55);
  vec3 pastel = mix(pastelB, pastelA, blobs);

  // Lift shadows so it doesn't look like "dyed black"
  pastel = mix(pastel, vec3(0.95, 0.96, 1.00), 0.05);

  // Optional rings (very soft, non-nightclub)
  float ring = 0.0;
  if(uRings > 0.001){
    float rr = length((uv - 0.5) * vec2(1.1, 1.0));
    float w = 0.015 + 0.02 * (1.0 - uRings);
    ring = smoothstep(w, 0.0, abs(rr - (0.22 + 0.06 * sin(uTime * 0.08))));
    ring *= uRings * 0.35;
  }

  // Glitter (keep extremely low)
  float g = 0.0;
  if(uGlitter > 0.001){
    float h = hash21(uv * vec2(900.0, 520.0) + uTime * 0.3);
    g = smoothstep(0.995, 1.0, h) * uGlitter * 0.18;
  }

  // Apply tint gently (tilt the whole world color)
  vec3 col = pastel;
  col = mix(col, col * uTint, 0.55);

  // Add ring & glitter as airy highlights
  col += ring * vec3(1.0, 0.98, 1.0);
  col += g * vec3(1.0);

  // Intensity acts as overall presence (keep subtle)
  col = mix(vec3(0.0), col, clamp(uIntensity, 0.0, 1.2));

  // ✅ The key: emergence controls black -> pastel space
  // Use a smooth curve so it "appears" like fog filling the room
  float e = clamp(uEmergence, 0.0, 1.0);
  e = smoothstep(0.0, 1.0, e);
  col = mix(vec3(0.0), col, e);

  gl_FragColor = vec4(col, 1.0);
}
