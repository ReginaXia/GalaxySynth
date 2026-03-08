attribute float aSize;
attribute float aSeed;
attribute float aAlpha;

varying vec3 vColor;
varying float vTwinkle;
varying float vAlpha;
varying float vCrossSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uBaseSize;
uniform float uBreath;
uniform float uBling;

void main() {
  vColor = color;
  vAlpha = aAlpha;
  vCrossSeed = fract(aSeed * 1.6180339);

  float tw = 0.5 + 0.5 * sin(uTime * (1.8 + 2.8 * uBreath) + aSeed * 13.37);
  float pulse = 0.5 + 0.5 * sin(uTime * (4.0 + 5.5 * uBling) + aSeed * 31.7);
  vTwinkle = mix(0.78, 1.22, pow(tw, mix(2.5, 1.1, uBreath))) * (1.0 + 0.22 * uBling * smoothstep(0.82, 1.0, pulse));

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float distScale = clamp(1.0 / max(0.6, pow(max(1.0, -mv.z), 0.28)), 0.35, 1.25);
  float size = aSize * uBaseSize * uPixelRatio * distScale;
  gl_PointSize = clamp(size, 1.2, 48.0);

  gl_Position = projectionMatrix * mv;
}
