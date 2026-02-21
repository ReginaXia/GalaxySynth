precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec2  uMouse;     // 0..1

uniform vec3  uBaseRGB;   // base night color (#131527)
uniform vec3  uMainRGB;   // main accent (pure pink)

uniform float uLeadE;     // 0..1 energy
uniform float uVel01;     // 0..1 scratch speed/strength
uniform float uPitch01;   // 0..1 pitch (low->high)
uniform float uTheta01;   // 0..1 angle
uniform float uPulse;     // 0..1 note pulse

uniform float uIntensity; // overall strength

// ---------------- noise ----------------
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p,p+34.45);
  return fract(p.x*p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.55;
  for(int i=0;i<5;i++){
    v += a*noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 palettePastel(float t){
  // soft iridescent (pastel), stable (no harsh rainbow)
  vec3 a = vec3(0.62, 0.58, 0.72);
  vec3 b = vec3(0.33, 0.30, 0.26);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.05, 0.18, 0.38);
  return a + b*cos(6.28318*(c*t + d));
}

float softStar(vec2 p, float t){
  // sparse sparkles
  float n = noise(p*22.0 + t*0.25);
  float s = smoothstep(0.992, 1.0, n);
  return s;
}

void main(){
  vec2 uv = vUv;

  // --- Deep silent base ---
  vec3 col = uBaseRGB;

  // slight cosmic fog (very subtle)
  float fog = fbm(uv*1.4 + uTime*0.02);
  col += uBaseRGB * (fog - 0.5) * 0.06;

  // --- ignition: silent -> stunning ---
  float ignite = smoothstep(0.02, 0.22, uLeadE);
  float drive  = ignite * (0.30 + 0.70*pow(uVel01, 1.4));

  // flow direction from theta
  float ang = uTheta01 * 6.28318;
  vec2 dir = vec2(cos(ang), sin(ang));

  // Domain warp (liquid feel)
  vec2 p = uv;
  p += (uMouse - 0.5) * 0.05; // tiny parallax

  float spd = 0.10 + 1.20*uVel01;
  float w1 = fbm(p*2.0 + dir*uTime*spd);
  float w2 = fbm(p*3.2 - dir*uTime*(spd*0.7));
  vec2 warp = vec2(w1, w2) - 0.5;
  p += warp * (0.18 + 0.42*uVel01) * ignite;

  // Film field
  float film = fbm(p*3.0 + uTime*0.12);

  // Pastel iridescence, then bias back toward main pink (keeps your identity)
  vec3 iri = palettePastel(film + uPitch01*0.18);
  iri = mix(iri, uMainRGB, 0.35);

  // brightness shaped by pitch (high -> brighter)
  float filmBright = mix(0.20, 0.90, uPitch01);

  // --- Ink injection (NOT center radial): use warped p and pulse, localized around mouse ---
  float d = distance(p, uMouse);
  float ink = smoothstep(0.32, 0.0, d);
  ink *= (0.30 + 0.70*uPulse);
  ink *= drive;

  // compose
  col += iri * filmBright * drive * (0.55*film + 0.20);
  col += uMainRGB * ink * 0.75;

  // sparkle (only when playing)
  float sp = softStar(p + warp*0.8, uTime);
  col += vec3(1.0) * sp * drive * 0.50;

  // tone shaping: keep deep base when silent, but allow bloom-like lift when playing
  float lift = uIntensity * (1.0 + 1.0*drive);
  col *= lift;

  // soft shoulder to avoid grey wash
  float mx = max(col.r, max(col.g, col.b));
  col = col / (1.0 + mx*0.55);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
