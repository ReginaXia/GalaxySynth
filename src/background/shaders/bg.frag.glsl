precision highp float;

varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec2  uMouse01;

uniform float uLeadE;
uniform float uVel01;
uniform float uPitch01;
uniform float uTheta01;
uniform float uPulse;

uniform vec3 uBase;
uniform vec3 uTint;

// Three.js built-in uniform: cameraPosition (DO NOT redeclare)

// ---------- noise / fbm ----------
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
vec2 rot(vec2 p, float a){
  float c = cos(a), s = sin(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

// “亮但不灰”的曝光曲线
vec3 filmic(vec3 x){
  return 1.0 - exp(-x);
}

// ---------- pretty pearl palette ----------
vec3 pearlPalette(float t){
  vec3 c0 = vec3(1.00, 0.55, 0.95); // pink
  vec3 c1 = vec3(1.00, 0.72, 0.55); // peach
  vec3 c2 = vec3(1.00, 0.95, 0.60); // butter
  vec3 c3 = vec3(0.55, 1.00, 0.88); // mint (clean)
  vec3 c4 = vec3(0.55, 0.82, 1.00); // sky
  vec3 c5 = vec3(0.80, 0.60, 1.00); // lavender

  t = fract(t) * 6.0;
  float i = floor(t);
  float f = fract(t);
  f = f*f*(3.0-2.0*f);

  vec3 a = c0, b = c1;
  if(i < 1.0){ a=c0; b=c1; }
  else if(i < 2.0){ a=c1; b=c2; }
  else if(i < 3.0){ a=c2; b=c3; }
  else if(i < 4.0){ a=c3; b=c4; }
  else if(i < 5.0){ a=c4; b=c5; }
  else { a=c5; b=c0; }
  return mix(a,b,f);
}

// ---------- flow field (gives visible motion) ----------
vec2 flowField(vec2 p, float t){
  // curl-ish flow from fbm gradients (cheap)
  float n1 = fbm(p*1.7 + vec2(0.0, t));
  float n2 = fbm(p*1.7 + vec2(5.2, -t));
  float ang = 6.28318 * (n1 - n2);
  return vec2(cos(ang), sin(ang));
}

// Advect p along flow field (2 steps)
vec2 advect(vec2 p, float t, float speed){
  vec2 v1 = flowField(p, t);
  p += v1 * speed;
  vec2 v2 = flowField(p, t + 0.37);
  p += v2 * speed * 0.8;
  return p;
}

void main(){
  float ignite = smoothstep(0.004, 0.07, uLeadE);
  float velBoost = 0.25 + 0.75*pow(uVel01, 1.20);
  float drive = ignite * velBoost;
  float glow  = drive * drive;

  // view ray
  vec3 ray = normalize(vWorldPos - cameraPosition);

  // base quiet
  vec3 col = uBase;

  // ---- FLOWING nacre marbling ----
  vec2 q = ray.xz;

  // base flow speed: always a little, but much faster when playing
  float baseSpeed = 0.010;
  float playSpeed = mix(baseSpeed, 0.060, drive);     // << 流动强度
  float t = uTime * (0.12 + 0.55*drive);              // << 时间流速

  // two layers: big slow + small fast
  vec2 p0 = advect(q*1.2, t*0.55, playSpeed*0.7);
  vec2 p1 = advect(q*3.2 + vec2(2.0, -1.0), t*1.15, playSpeed*1.2);

  // domain warp between layers (adds liquid look)
  vec2 warp = (vec2(fbm(p0*2.0 + t), fbm(p0*2.0 - t)) - 0.5) * (0.75 + 1.25*drive);
  vec2 p = p1 + warp*0.35;

  float a = fbm(p*2.2 + 0.7);
  float b = fbm(rot(p*4.6, 0.8) - 1.1);
  float cloud = 0.62*a + 0.38*b;

  // fresnel / nacre edge
  float ndv = abs(ray.y);
  float fres = pow(1.0 - ndv, 3.4);
  fres *= (0.25 + 0.75*drive);

  // hue driver (palette-based, but animated by flow)
  float phase = (1.0 + 2.4*cloud + 1.4*uPulse) * (1.0 - ndv);

  float hueKey = 0.0;
  hueKey += phase * 0.55;
  hueKey += uPitch01 * 1.55;
  hueKey += uTheta01 * 0.70;
  hueKey += uTime * (0.04 + 0.18*drive);      // << 更明显的变色速度
  hueKey += (cloud - 0.5) * 0.55;

  vec3 nacre = pearlPalette(hueKey) * uTint;

  // stronger color takeover when playing
  col = mix(col, nacre, drive * 0.98);

  // colored pearl highlights (no gray)
  col += nacre * fres * (1.10 + 1.90*glow);

  // flowing “ribbons” that move with b
  float ridge = smoothstep(0.52, 0.92, b);
  float silk  = ridge * fres * (0.25 + 0.85*drive);
  col += nacre * silk * (0.60 + 1.10*glow);

  // mouse ink injection (more motion + more saturation)
  float d = distance(vUv, uMouse01);
  float ink = smoothstep(0.60, 0.0, d);
  ink *= (0.15 + 0.85*uPulse);
  ink *= (0.30 + 0.70*uVel01);

  vec3 inkCol = pearlPalette(hueKey + 0.33 + fbm(p*6.0 + uTime*0.25)*0.35);
  col += inkCol * ink * (0.75 + 2.00*glow);

  // sparkles (slightly animated)
  float sp = smoothstep(0.992, 1.0, noise(p*26.0 + uTime*0.65));
  col += nacre * sp * (0.18 + 0.80*drive);

  // brighten during play
  col *= (0.90 + 2.10*drive);
  col = filmic(col);
  col = pow(col, vec3(0.90));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}