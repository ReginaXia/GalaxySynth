precision mediump float;

varying vec3 vColor;
varying float vTwinkle;
varying float vAlpha;
varying float vCrossSeed;
varying float vSizeNorm;

uniform float uOpacity;
uniform float uSoftness;
uniform float uCross;
uniform float uColorGlow;
uniform vec3 uGlowColorA;
uniform vec3 uGlowColorB;
uniform vec3 uGlowColorC;

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

  vec3 col = vColor * (0.70 + 0.44 * clamp(twShaped, 0.65, 1.72));
  // Pastel color glow on halo only: keeps star core white and clean.
  float cgRaw = max(uColorGlow, 0.0);
  float cg = clamp(cgRaw, 0.0, 1.0);
  float hdrGlow = 1.0 + max(0.0, cgRaw - 1.0) * 2.4;
  float k = clamp(vCrossSeed, 0.0, 1.0);
  vec3 tint = (k < 0.5)
    ? mix(uGlowColorA, uGlowColorB, k * 2.0)
    : mix(uGlowColorB, uGlowColorC, (k - 0.5) * 2.0);
  tint = clamp(tint, 0.0, 1.0);
  float haloOnly = clamp(halo, 0.0, 1.0) * (1.0 - clamp(core * 1.45, 0.0, 1.0));
  float colorGlowGain = (0.18 + 1.20 * cg) * clamp(twShaped, 0.78, 1.38) * hdrGlow;
  col += tint * haloOnly * colorGlowGain;
  // Cross glint follows tint when color glow is high (avoids whitening).
  vec3 crossCol = mix(vec3(1.0), tint, 0.35 + 0.60 * cg);
  col += crossCol * (0.02 + 0.10 * (1.0 - cg) + 0.10 * cg) * cross * (0.92 + 0.18 * hdrGlow);

  // Gentle highlight compression keeps hue visible under additive blending.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = col / (1.0 + lum * (0.18 + 0.26 * cg));
  gl_FragColor = vec4(col, alpha);
}
