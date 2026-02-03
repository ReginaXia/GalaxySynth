// src/background/shaders/bg.frag.glsl
precision highp float;

uniform float uTime;
uniform float uIntensity;

uniform vec2  uMouse;      // 0..1
uniform float uParallax;   // 0..1
uniform float uRings;      // 0..1
uniform float uGlitter;    // 0..1

uniform vec3  uTint;       // 0..1 rgb
uniform float uEmergence;  // 0..1 (0=deep space, 1=pastel space)

// Audio-driven (0..1)
uniform float uLeadE;      // lead envelope / strength
uniform float uPitch01;    // low->high
uniform float uVel01;      // slow->fast
uniform float uTheta01;    // ring angle (0..1)

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
  // --- audio controls (single declaration to avoid redefinition)
  float leadA  = clamp(uLeadE,   0.0, 1.0);
  float pitchA = clamp(uPitch01, 0.0, 1.0);
  float velA   = clamp(uVel01,   0.0, 1.0);

  // --- screen uv
  vec2 uv = vUv;

  // Mouse parallax (subtle)
  vec2 m = uMouse - 0.5;
  uv += m * 0.06 * uParallax;

  // Direction from theta (ring angle)
  float ang = 6.2831853 * fract(uTheta01);
  vec2 dir = vec2(cos(ang), sin(ang));

  // Advection (flow) used inside noise domain (keeps it stable on screen)
  float spd = (0.06 + 0.22 * velA) * (0.15 + 0.85 * leadA);
  vec2 adv = dir * (uTime * spd * 0.12);

  // Liquid warp (lead+vel stronger, pitch adds slight variation)
  float t = uTime * (0.05 + 0.04 * velA);
  vec2 nuv = uv + adv;

  vec2 warp = vec2(
    fbm(nuv * 2.1 + vec2(0.0,  t)),
    fbm(nuv * 2.1 + vec2(10.0,-t))
  );

  // "stir" push: feels like you are mixing paint in space
  float stir = (0.020 + 0.090 * leadA) * (0.25 + 0.75 * velA);
  uv += dir * stir;
  uv += (warp - 0.5) * (0.055 + 0.110 * leadA);

  // Core field -> pastel gradient "volume"
  float n1 = fbm((uv + adv * 0.8) * 1.4 + vec2(0.0, t));
  float n2 = fbm((uv - adv * 0.6) * 2.6 + vec2(4.0, -t * 1.2));
  float field = 0.55 * n1 + 0.45 * n2;

  // Big soft blobs (gives that "gel" shape)
  vec2 p = uv - 0.5;
  float r = length(p);
  float blobs = smoothstep(
    0.56,
    0.10,
    r + 0.18 * sin(3.0 * p.x + uTime * 0.2) + 0.10 * (n2 - 0.5)
  );

  // Pitch-shifts the palette so high notes feel brighter/warmer
  float palShiftA = 0.10 * sin(uTime * 0.07) + pitchA * 0.38;
  float palShiftB = 0.55 + pitchA * 0.22;

  vec3 pastelA = palettePastel(field * 1.2 + palShiftA);
  vec3 pastelB = palettePastel(field * 1.2 + palShiftB);
  vec3 pastel = mix(pastelB, pastelA, blobs);

  // Subtle "film" sheen (only while playing)
  float sheen = fbm((uv + adv) * 3.6 + vec2(1.7, -uTime * 0.10));
  vec3 ir = vec3(
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.00 + pitchA * 0.15)),
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.33 + pitchA * 0.15)),
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.66 + pitchA * 0.15))
  );
  pastel = mix(pastel, pastel * (0.78 + 0.42 * ir), 0.14 * leadA);

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

  // Presence (lead drives visibility), but still returns to deep space when not playing
  float presence = 0.10 + 0.90 * leadA;
  col *= clamp(uIntensity, 0.0, 1.6) * (0.55 + 0.85 * presence);

  // Soft knee (prevents milky wash / preserves nebula readability)
  col = col / (1.0 + col * 0.85);

  // Deep space base (visible when not playing)
  vec3 deepCol = vec3(0.015, 0.012, 0.030);
  deepCol += 0.020 * vec3(0.12, 0.18, 0.40) * (1.0 - pitchA);

  // Emergence controls deep -> pastel (fully fades back when emergence=0)
  float e = clamp(uEmergence, 0.0, 1.0);
  e = smoothstep(0.0, 1.0, e);

  // When emergence is 0, you get deep space (not pure black)
  col = mix(deepCol, col, e);

  gl_FragColor = vec4(col, 1.0);
}
