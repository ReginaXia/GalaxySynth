precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2  uMouse01;

uniform float uLeadE;    // 0..1
uniform float uVel01;    // 0..1
uniform float uPitch01;  // 0..1
uniform float uTheta01;  // 0..1
uniform float uPulse;    // 0..1

uniform vec3 uBase;      // #131527
uniform vec3 uTint;      // pink main

// ----------------- noise / fbm -----------------
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

// pastel iridescent palette (controlled)
vec3 palette(float t){
  vec3 a = vec3(0.62, 0.56, 0.74);
  vec3 b = vec3(0.38, 0.36, 0.32);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.10, 0.26, 0.44);
  return a + b*cos(6.28318*(c*t + d));
}

// tiny sparkle
float sparkle(vec2 p, float t){
  float n = noise(p*24.0 + t*0.35);
  return smoothstep(0.992, 1.0, n);
}

// small star glint (cross-ish)
float starGlint(vec2 p){
  float ax = abs(p.x);
  float ay = abs(p.y);
  float line = exp(-ax*18.0) + exp(-ay*18.0);
  float core = exp(-(ax*ax+ay*ay)*60.0);
  return (0.35*line + 0.65*core);
}

void main(){
  vec2 uv = vUv;

  // ---------- base deep night ----------
  vec3 col = uBase;

  // subtle base fog (keep quiet)
  float fog0 = fbm(uv*1.4 + uTime*0.015);
  col += uBase * (fog0-0.5) * 0.06;

  // ---------- ignite / drive (BRIGHT when playing) ----------
  // kick in earlier (instant wow)
  float ignite = smoothstep(0.005, 0.12, uLeadE);
  float velBoost = 0.35 + 0.65*pow(uVel01, 1.35);
  float drive = ignite * velBoost;
  float glow = drive * drive; // extra "ignite" pop

  // global lift so it doesn't stay dark while playing
  float lift = drive * (0.28 + 0.35*uPitch01);
  col += uTint * lift * 0.55;

  // ---------- flow direction ----------
  float ang = uTheta01 * 6.28318;
  vec2 dir = vec2(cos(ang), sin(ang));
  float spd = 0.12 + 1.35*uVel01;

  // ---------- domain warp (2 layers: macro + micro) ----------
  vec2 p = uv;

  float wA = fbm(p*2.6 + dir*uTime*spd);
  float wB = fbm(p*4.2 - dir*uTime*(spd*0.75));
  vec2 warp1 = vec2(wA, wB) - 0.5;

  float wC = fbm(p*7.0 + vec2(-dir.y, dir.x)*uTime*(0.35+uVel01));
  float wD = fbm(p*9.0 - vec2(-dir.y, dir.x)*uTime*(0.28+uVel01));
  vec2 warp2 = vec2(wC, wD) - 0.5;

  p += warp1 * (0.20 + 0.35*uVel01) * ignite;
  p += warp2 * (0.06 + 0.10*uVel01) * ignite; // micro warp -> smaller blocks

  // ---------- iridescent film (smaller patches) ----------
  float film1 = fbm(p*6.8 + uTime*0.10);
  float film2 = fbm(p*13.5 - uTime*0.16); // micro film
  float film  = 0.68*film1 + 0.32*film2;

  // color: palette more driven by pitch (more visible music color change)
  vec3 iri = palette(film + uPitch01*0.35);
  // keep identity (pink) but don't kill the variation
  iri = mix(iri, uTint, 0.30);

  // "pearl" highlight ridges
  float ridge = pow(smoothstep(0.55, 1.0, film2), 2.0);
  vec3 pearl = vec3(1.0) * ridge;

  float filmBright = (0.28 + 0.75*uPitch01);

  // brighter film: drive + glow
  col += (iri * filmBright + pearl*0.45) * (drive * 1.05 + glow * 0.65);

  // ---------- music-driven injection near mouse ----------
  // Make ink color respond to music strongly (but still pink-anchored)
  float noteT = fract(uPitch01 * 1.05 + uTheta01 * 0.08);
  vec3 musicCol = palette(noteT);
  musicCol = mix(musicCol, uTint, 0.22); // keep overall pink vibe

  float d = distance(p, uMouse01);
  float ink = smoothstep(0.42, 0.0, d);
  ink *= (0.25 + 0.75*uPulse);     // step breath
  ink *= (0.55 + 0.45*uVel01);     // stronger when scratching harder

  vec3 inkCol = mix(uTint, musicCol, 0.70); // 70% music color
  col += inkCol * ink * (drive * 1.25 + glow * 0.85);

  // ---------- sparkles / glints (more璀璨, but gated) ----------
  float sp = sparkle(p + warp1*0.6, uTime);
  col += vec3(1.0) * sp * (drive * (0.30 + 0.55*uVel01) + glow * 0.25);

  vec2 gp = fract(p*vec2(10.0, 8.0)) - 0.5;
  float gseed = noise(floor(p*vec2(10.0, 8.0)));
  float glintMask = step(0.985, gseed); // rare
  float gl = starGlint(gp) * glintMask;
  col += vec3(1.0) * gl * (drive * (0.18 + 0.35*uPulse) + glow * 0.18);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}