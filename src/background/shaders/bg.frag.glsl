precision highp float;

uniform float uTime;
uniform float uIntensity;

uniform vec2  uMouse;      // 0..1
uniform float uParallax;   // 0..1
uniform float uRings;      // 0..1
uniform float uGlitter;    // 0..1

uniform vec3  uTint;       // 0..1 rgb
uniform float uEmergence;  // 0..1

// Audio-driven
uniform float uLeadE;      // 0..1
uniform float uPitch01;    // 0..1
uniform float uVel01;      // 0..1
uniform float uTheta01;    // 0..1

// Note injection
uniform float uPulse;      // 0..1
uniform float uNoteHue;    // 0..1
uniform float uNoteSeed;   // float
uniform vec2  uNotePos;    // 0..1

varying vec2 vUv;

// ---------------------------
// Helpers
// ---------------------------
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p){
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
  float a = 0.55;
  for(int i=0;i<5;i++){
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float softCircle(vec2 p, vec2 c, float r, float blur){
  float d = length(p - c);
  return smoothstep(r + blur, r - blur, d);
}

void main(){
  vec2 uv = vUv;

  // -------- mouse parallax (subtle)
  vec2 mouseOff = (uMouse - 0.5);
  uv += mouseOff * 0.06 * uParallax;

  // -------- direction from theta
  float ang = 6.2831853 * fract(uTheta01);
  vec2 dir = vec2(cos(ang), sin(ang));

  // -------- energy shaping (make small lead still visible)
  float lead = clamp(uLeadE, 0.0, 1.0);
  float vel  = clamp(uVel01, 0.0, 1.0);
  float pitch= clamp(uPitch01,0.0, 1.0);
  float pulse= clamp(uPulse, 0.0, 1.0);

  // Presence curve: small energy also shows up
  float ePlay = clamp(pow(lead, 0.55) * 1.25, 0.0, 1.0);
  float e = max(uEmergence, ePlay);

  // -------- deep space base (NOT pure black)
  vec3 deep = vec3(0.010, 0.012, 0.030);
  deep += 0.030 * vec3(0.10, 0.14, 0.28) * (1.0 - pitch);
  deep += 0.020 * vec3(0.18, 0.10, 0.30) * (0.5 - 0.5*cos(uTime*0.05));

  // -------- liquid advection (flow)
  float t = uTime * (0.08 + 0.10 * vel);
  float turb = mix(0.05, 0.22, vel) * (0.30 + 0.70 * e);

  vec2 adv = dir * (0.10 + 0.55 * vel) * t;
  vec2 w1 = vec2(fbm(uv*2.2 + adv + vec2(0.0,  t)), fbm(uv*2.2 - adv + vec2(7.0, -t)));
  vec2 w2 = vec2(fbm(uv*4.0 + adv*1.3 + vec2(9.0,  t*1.2)), fbm(uv*4.0 - adv*1.2 + vec2(2.0, -t*1.1)));

  uv += (w1 - 0.5) * turb;
  uv += (w2 - 0.5) * turb * 0.55;
  uv += dir * (0.02 + 0.10 * vel) * e; // “搓盘推流”

  // -------- multi-field volume (gives structure)
  float fA = fbm(uv*1.6 + vec2(0.0,  t));
  float fB = fbm(uv*2.8 + vec2(4.0, -t*1.2));
  float fC = fbm(uv*3.9 + vec2(8.0,  t*0.7));
  float field = (0.46*fA + 0.34*fB + 0.20*fC);

  // -------- 3~4 color bands per note (your request)
  float sat = mix(0.18, 0.62, e) * (0.75 + 0.25 * vel);
  float val = mix(0.08, 0.98, e) * mix(0.55, 1.18, pitch);

  float h0 = fract(uNoteHue + 0.00);
  float h1 = fract(uNoteHue + 0.18);
  float h2 = fract(uNoteHue + 0.42);
  float h3 = fract(uNoteHue + 0.68);

  vec3 c0 = hsv2rgb(vec3(h0, sat, val));
  vec3 c1 = hsv2rgb(vec3(h1, sat*0.95, val*0.95));
  vec3 c2 = hsv2rgb(vec3(h2, sat*0.90, val*0.90));
  vec3 c3 = hsv2rgb(vec3(h3, sat*0.92, val*0.92));

  float k0 = smoothstep(0.00, 0.35, field);
  float k1 = smoothstep(0.25, 0.60, field);
  float k2 = smoothstep(0.50, 0.85, field);

  vec3 col = mix(c0, c1, k0);
  col = mix(col, c2, k1);
  col = mix(col, c3, k2);

  // -------- note paint injection (pulse creates new blob sets)
  float p = pulse * (0.25 + 0.75*e);
  if(p > 0.001){
    vec2 np = uNotePos;

    float s = uNoteSeed * 13.37;
    vec2 o1 = vec2(fract(s*1.13)-0.5, fract(s*1.71)-0.5) * 0.22;
    vec2 o2 = vec2(fract(s*2.31)-0.5, fract(s*2.87)-0.5) * 0.25;
    vec2 o3 = vec2(fract(s*3.11)-0.5, fract(s*3.53)-0.5) * 0.28;

    float b1 = softCircle(vUv, np + o1, 0.22 + 0.10*p, 0.25);
    float b2 = softCircle(vUv, np + o2, 0.18 + 0.08*p, 0.22);
    float b3 = softCircle(vUv, np + o3, 0.16 + 0.06*p, 0.20);

    vec3 ink = (b1*c1 + b2*c2 + b3*c3) / max(1e-3, (b1+b2+b3));
    float inkW = clamp((b1+b2+b3) * 0.85 * p, 0.0, 1.0);

    col = mix(col, mix(col, ink, 0.80), inkW);
  }

  // -------- rings / glitter (airy, not nightclub)
  float ring = 0.0;
  if(uRings > 0.001){
    vec2 q = (vUv - 0.5) * vec2(1.10, 1.0);
    float rr = length(q);
    float ph = rr*8.0 - uTime*0.45 - 2.0*vel;
    float waves = 0.5 + 0.5*sin(ph);
    ring = smoothstep(0.75, 1.0, waves) * (0.06 + 0.18*e) * uRings;
  }

  float g = 0.0;
  if(uGlitter > 0.001){
    float h = hash21(vUv * vec2(950.0, 530.0) + uTime * 0.25);
    g = smoothstep(0.997, 1.0, h) * uGlitter * (0.06 + 0.20*e);
  }

  col += ring * vec3(1.0, 0.98, 1.0);
  col += g * vec3(1.0);

  // -------- gentle tint
  col = mix(col, col * uTint, 0.30);

  // -------- intensity (overall presence)
  col *= (0.70 + 0.70 * clamp(uIntensity, 0.0, 1.2));

  // -------- emergence curve (IMPORTANT: no more mixing from pure black)
  float em = clamp(e, 0.0, 1.0);
  em = 1.0 - exp(-em * 3.0); // appears smoothly

  // mix from deep space
  col = mix(deep, col, em);

  // highlight roll-off to avoid "thick filter"
  float mx = max(col.r, max(col.g, col.b));
  col = col / (1.0 + mx * 0.75);

  // slight saturation
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.10);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
