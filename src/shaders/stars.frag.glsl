precision mediump float;

varying vec3 vColor;
varying float vTwinkle;
varying float vAlpha;
varying float vCrossSeed;
varying float vSizeNorm;

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
  float bigStarBoost = mix(0.55, 1.25, smoothstep(0.20, 0.95, vSizeNorm));
  float twShaped = mix(1.0 + (vTwinkle - 1.0) * 0.55, vTwinkle * 1.10, smoothstep(0.25, 1.0, vSizeNorm));
  float breathAlpha = clamp(1.0 + (twShaped - 1.0) * bigStarBoost, 0.66, 1.72);
  float alpha = clamp(mask * vAlpha * uOpacity * breathAlpha, 0.0, 1.0);
  if (alpha < 0.003) discard;

  vec3 col = vColor * (0.76 + 0.58 * clamp(twShaped, 0.65, 1.72));
  col += vec3(1.0) * (0.04 + 0.18 * uCross) * cross;
  gl_FragColor = vec4(col, alpha);
}
