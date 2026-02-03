precision highp float;

uniform float uTime;
uniform float uIntensity;

uniform vec2  uMouse;      // 0..1
uniform float uParallax;   // 0..1
uniform float uRings;      // 0..1
uniform float uGlitter;    // 0..1

uniform vec3  uTint;       // 0..1
uniform float uEmergence;  // 0..1

// Audio-driven (0..1)
uniform float uLeadE;
uniform float uPitch01;
uniform float uVel01;
uniform float uTheta01;

// Note injection (0..1)
uniform float uPulse;
uniform float uNoteHue;
uniform float uNoteSeed;
uniform vec2  uNotePos;

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

// creamy pastel palette
vec3 palettePastel(float t){
  vec3 c1 = vec3(1.00, 0.84, 0.92); // pink
  vec3 c2 = vec3(1.00, 0.96, 0.74); // cream yellow
  vec3 c3 = vec3(0.80, 0.93, 1.00); // icy blue
  vec3 c4 = vec3(0.90, 0.84, 1.00); // lilac

  t = fract(t);
  if(t < 0.33) return mix(c1, c2, t / 0.33);
  if(t < 0.66) return mix(c2, c3, (t - 0.33) / 0.33);
  return mix(c3, c4, (t - 0.66) / 0.34);
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main(){
  float leadA  = clamp(uLeadE,   0.0, 1.0);
  float pitchA = clamp(uPitch01, 0.0, 1.0);
  float velA   = clamp(uVel01,   0.0, 1.0);
  float pulseA = clamp(uPulse,   0.0, 1.0);

  vec2 uv = vUv;

  // subtle parallax
  vec2 m = uMouse - 0.5;
  uv += m * 0.06 * uParallax;

  // theta -> direction
  float ang = 6.2831853 * fract(uTheta01);
  vec2 dir = vec2(cos(ang), sin(ang));

  // stable flow
  float spd = (0.06 + 0.24 * velA) * (0.20 + 0.80 * leadA);
  vec2 adv = dir * (uTime * spd * 0.12);

  // liquid warp
  float t = uTime * (0.05 + 0.05 * velA);
  vec2 nuv = uv + adv;

  vec2 warp = vec2(
    fbm(nuv * 2.1 + vec2(0.0,  t)),
    fbm(nuv * 2.1 + vec2(10.0,-t))
  );

  // stirring (drag feel)
  float stir = (0.020 + 0.090 * leadA) * (0.25 + 0.75 * velA);
  uv += dir * stir;
  uv += (warp - 0.5) * (0.055 + 0.110 * leadA);

  // ---------------------------
  // Base pastel world
  // ---------------------------
  float n1 = fbm((uv + adv * 0.8) * 1.4 + vec2(0.0, t));
  float n2 = fbm((uv - adv * 0.6) * 2.6 + vec2(4.0, -t * 1.2));
  float field = 0.55 * n1 + 0.45 * n2;

  vec2 p = uv - 0.5;
  float r = length(p);
  float blobs = smoothstep(
    0.56, 0.10,
    r + 0.18 * sin(3.0 * p.x + uTime * 0.2) + 0.10 * (n2 - 0.5)
  );

  float palShiftA = 0.10 * sin(uTime * 0.07) + pitchA * 0.38;
  float palShiftB = 0.55 + pitchA * 0.22;

  vec3 pastelA = palettePastel(field * 1.2 + palShiftA);
  vec3 pastelB = palettePastel(field * 1.2 + palShiftB);
  vec3 pastel  = mix(pastelB, pastelA, blobs);

  // ---------------------------
  // Note-driven paint injection (4 colors / note)
  // ---------------------------
  vec2 inject = uNotePos + 0.06 * (warp - 0.5) + dir * (0.02 + 0.06 * velA) * pulseA;

  float s = uNoteSeed;
  vec2 o1 = vec2(fract(s*13.1), fract(s*7.7))   - 0.5;
  vec2 o2 = vec2(fract(s*5.3),  fract(s*19.9))  - 0.5;
  vec2 o3 = vec2(fract(s*17.2), fract(s*3.9))   - 0.5;
  vec2 o4 = vec2(fract(s*11.7), fract(s*9.1))   - 0.5;

  float b1 = exp(-12.0 * length(uv - (inject + o1*0.22)));
  float b2 = exp(-10.0 * length(uv - (inject + o2*0.26)));
  float b3 = exp(-11.0 * length(uv - (inject + o3*0.24)));
  float b4 = exp(- 9.0 * length(uv - (inject + o4*0.30)));

  vec3 c1 = hsv2rgb(vec3(fract(uNoteHue + 0.00), 0.55, 1.0));
  vec3 c2 = hsv2rgb(vec3(fract(uNoteHue + 0.18), 0.55, 1.0));
  vec3 c3 = hsv2rgb(vec3(fract(uNoteHue + 0.36), 0.55, 1.0));
  vec3 c4 = hsv2rgb(vec3(fract(uNoteHue + 0.62), 0.55, 1.0));

  vec3 paint = (b1*c1 + b2*c2 + b3*c3 + b4*c4);
  float paintW = clamp((b1 + b2 + b3 + b4), 0.0, 1.0);

  // pulse controls injection strength
  paintW *= (0.12 + 0.88 * pulseA);

  // normalize and mix
  vec3 paintNorm  = paint / max(1e-3, paintW);
  vec3 paintBlend = mix(pastel, paintNorm, 0.70);
  pastel = mix(pastel, paintBlend, paintW);

  // iridescent sheen (only while playing)
  float sheen = fbm((uv + adv) * 3.6 + vec2(1.7, -uTime * 0.10));
  vec3 ir = vec3(
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.00 + pitchA * 0.15)),
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.33 + pitchA * 0.15)),
    0.55 + 0.45 * sin(6.2831853 * (sheen + 0.66 + pitchA * 0.15))
  );
  pastel = mix(pastel, pastel * (0.78 + 0.42 * ir), 0.14 * leadA);

  // rings (soft)
  float ring = 0.0;
  if(uRings > 0.001){
    float rr = length((uv - 0.5) * vec2(1.1, 1.0));
    float w = 0.015 + 0.02 * (1.0 - uRings);
    ring = smoothstep(w, 0.0, abs(rr - (0.22 + 0.06 * sin(uTime * 0.08))));
    ring *= uRings * 0.35;
  }

  // glitter (very small)
  float g = 0.0;
  if(uGlitter > 0.001){
    float h = hash21(uv * vec2(900.0, 520.0) + uTime * 0.3);
    g = smoothstep(0.995, 1.0, h) * uGlitter * 0.18;
  }

  vec3 col = pastel;

  // tint
  col = mix(col, col * uTint, 0.55);

  // highlights
  col += ring * vec3(1.0, 0.98, 1.0);
  col += g * vec3(1.0);

  // presence
  float presence = 0.10 + 0.90 * leadA;
  col *= clamp(uIntensity, 0.0, 1.6) * (0.55 + 0.85 * presence);

  // soft knee: protect nebula readability
  col = col / (1.0 + col * 0.85);

  // deep space base (idle)
  vec3 deepCol = vec3(0.015, 0.012, 0.030);
  deepCol += 0.020 * vec3(0.12, 0.18, 0.40) * (1.0 - pitchA);

  float e = clamp(uEmergence, 0.0, 1.0);
  e = smoothstep(0.0, 1.0, e);
  col = mix(deepCol, col, e);

  gl_FragColor = vec4(col, 1.0);
}
