attribute float aSize;
attribute float aSeed;
attribute float aAlpha;

varying vec3 vColor;
varying float vTwinkle;
varying float vAlpha;
varying float vCrossSeed;
varying float vSizeNorm;

uniform float uTime;
uniform float uPixelRatio;
uniform float uBaseSize;
uniform float uBreath;
uniform float uBling;

void main() {
  vColor = color;
  vAlpha = aAlpha;
  vCrossSeed = fract(aSeed * 1.6180339);
  vSizeNorm = clamp((aSize - 0.70) / 3.0, 0.0, 1.0);

  // Breath intensity is driven by uBreath only (0..1).
  float tw = 0.5 + 0.5 * sin(uTime * (1.10 + 1.95 * uBreath) + aSeed * 13.37);
  float amp = mix(0.08, 0.62, clamp(uBreath, 0.0, 1.0));
  vTwinkle = 1.0 + (tw * 2.0 - 1.0) * amp;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float distScale = clamp(1.0 / max(0.6, pow(max(1.0, -mv.z), 0.28)), 0.35, 1.25);
  float size = aSize * uBaseSize * uPixelRatio * distScale;
  gl_PointSize = clamp(size, 1.2, 48.0);

  gl_Position = projectionMatrix * mv;
}
