precision highp float;
precision highp int;

uniform float uTime;

precision mediump float;


uniform float uHeadSize;
uniform float uHeadGlow;
uniform float uTailGlow;
uniform float uTailFade;

uniform float uHeadShape;     // 0 orb, 1 cross, 2 star5
uniform float uShapeMix;      // 0..1
uniform float uStarSharpness; // sharpness

uniform float uBaseHue;
uniform float uHueRange;
uniform float uAuroraAmount;
uniform float uAuroraSpeed;
uniform float uSat;
uniform float uVal;

varying vec2 vUv;
varying float vAge01;
varying float vSeed;
varying float vHue;
varying float vAlive;

float hash12(vec2 p){
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sdLine(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h);
}

float crossShape(vec2 p, float w){
  float d1 = sdLine(p, vec2(-1.0, 0.0), vec2(1.0, 0.0));
  float d2 = sdLine(p, vec2(0.0, -1.0), vec2(0.0, 1.0));
  float d = min(d1, d2);
  return exp(-pow(d / w, 2.0));
}

float star5Shape(vec2 p, float w){
  float r = length(p);
  float a = atan(p.y, p.x);
  float m = abs(cos(a * 2.5));
  float k = mix(0.45, 0.15, m);
  float d = abs(r - k);
  return exp(-pow(d / w, 2.0)) * exp(-r * 1.0);
}

void main(){
  float x = vUv.x;
  vec2 p = (vUv - vec2(1.0, 0.5));

  float fadeIn = smoothstep(0.00, 0.08, vAge01);
  float fadeOut = 1.0 - smoothstep(0.80, 1.00, vAge01);
  float lifeFade = fadeIn * fadeOut * vAlive;

  float tailT = clamp(1.0 - x, 0.0, 1.0);
  float tailAlpha = exp(-tailT * uTailFade) * exp(-pow((vUv.y - 0.5) / 0.24, 2.0));
  tailAlpha *= uTailGlow;

  float headR = length(p);
  float headCore = exp(-pow(headR / max(0.001, uHeadSize), 2.0));
  float headHalo = exp(-pow(headR / (uHeadSize * 2.2), 2.0)) * 0.65;
  float headGlow = (headCore + headHalo) * uHeadGlow;

  float shape = 0.0;
  vec2 sp = p / max(0.001, uHeadSize * 2.0);
  float w = 0.16 / max(0.8, uStarSharpness);

  if (uHeadShape < 0.5) shape = 0.0;
  else if (uHeadShape < 1.5) shape = crossShape(sp, w);
  else shape = star5Shape(sp, w);

  shape *= exp(-headR * 6.0);

  float head = headGlow + shape * uHeadGlow * 0.85;
  head = mix(headGlow, head, uShapeMix);

  float n = hash12(vec2(vSeed * 13.7, tailT * 9.1));
  float flow = sin(uTime * uAuroraSpeed + tailT * 8.0 + vSeed * 6.2831) * 0.5 + 0.5;
  float aur = (flow * 0.65 + n * 0.35) * uAuroraAmount;

  float h = fract(vHue + aur * 0.18 + tailT * 0.06);
  vec3 tailCol = hsv2rgb(vec3(h, uSat, uVal));
  vec3 headCol = mix(tailCol, vec3(1.0), 0.55);

  float a = (tailAlpha + head) * lifeFade;
  a *= smoothstep(0.00, 0.01, headCore + tailAlpha);

  vec3 col = tailCol * tailAlpha + headCol * head;

  gl_FragColor = vec4(col, a);
}
