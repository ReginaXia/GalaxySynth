precision highp float;

uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = vUv;

  // 超慢呼吸
  float breathe = 0.5 + 0.5 * sin(uTime * 0.12);

  // 大尺度渐变坐标
  vec2 gUv = uv;
  gUv.y += breathe * 0.10;

  // 粉->紫->蓝 hue
  float baseHue = 0.84 - gUv.y * 0.20;

  // 轻微横向漂移
  baseHue += sin(uTime * 0.05 + gUv.x * 2.0) * 0.02;

  // 噪声液态扰动
  float n = noise(uv * 3.0 + uTime * 0.02);
  baseHue += (n - 0.5) * 0.04;

  // ✅ 关键：降低亮度上限（从 0.95 -> 0.42）
  vec3 col = hsv2rgb(vec3(baseHue, 0.55, 0.42));

  // ✅ 轻暗角：防止被洗白，且更“唯美”
  vec2 p = uv * 2.0 - 1.0;
  float vignette = smoothstep(1.25, 0.25, dot(p, p));
  col *= mix(0.65, 1.0, vignette);

  // ✅ 呼吸只做轻微增益
  col *= 0.92 + 0.08 * breathe * uIntensity;

  gl_FragColor = vec4(col, 1.0);
}
