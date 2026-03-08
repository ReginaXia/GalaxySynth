precision mediump float;

varying vec3 vColor;
varying float vTwinkle;
varying float vAlpha;
varying float vCrossSeed;

uniform float uOpacity;
uniform float uSoftness;
uniform float uCross;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);

  float soft = mix(3.8, 1.9, clamp(uSoftness, 0.0, 1.0));
  float core = exp(-pow(d / 0.20, soft));
  float halo = exp(-pow(d / 0.48, 2.0)) * mix(0.16, 0.40, uSoftness);

  float crossW = mix(0.035, 0.085, uCross);
  float crossX = exp(-abs(p.x) / crossW) * exp(-abs(p.y) / (0.22 + 0.08 * vCrossSeed));
  float crossY = exp(-abs(p.y) / crossW) * exp(-abs(p.x) / (0.22 + 0.08 * (1.0 - vCrossSeed)));
  float cross = (crossX + crossY) * 0.5;

  float mask = core + halo + cross * (0.10 + 0.48 * uCross);
  float alpha = clamp(mask * vAlpha * uOpacity, 0.0, 1.0);
  if (alpha < 0.003) discard;

  vec3 col = vColor * (0.82 + 0.44 * vTwinkle);
  col += vec3(1.0) * (0.04 + 0.18 * uCross) * cross;
  gl_FragColor = vec4(col, alpha);
}
