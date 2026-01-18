precision highp float;

varying vec2 vUv;
varying float vPulse;

uniform float uTime;

vec3 palette(float t){
  vec3 a = vec3(1.00, 0.35, 0.95);
  vec3 b = vec3(0.35, 0.55, 1.00);
  vec3 c = vec3(0.20, 1.00, 0.90);
  if(t < 0.5) return mix(a, b, t/0.5);
  return mix(b, c, (t-0.5)/0.5);
}

void main(){
  vec3 col = palette(vUv.x);

  float edge = abs(vUv.y - 0.5) * 2.0;
  float body = smoothstep(1.0, 0.0, edge);

  float breathe = 0.75 + 0.25 * sin(uTime * 1.2 + vUv.x * 6.283);
  float glow = (0.35 + vPulse * 1.25) * body * breathe;

  float alpha = glow * 0.65;

  gl_FragColor = vec4(col * glow, alpha);
}
