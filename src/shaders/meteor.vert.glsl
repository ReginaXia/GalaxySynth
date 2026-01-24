// src/shaders/meteor.vert.glsl
// ShaderMaterial 会自动注入 attribute position/uv，所以不要重复声明它们。

precision highp float;
precision highp int;

uniform float uTime;

attribute vec3  aStart;
attribute vec3  aDir;
attribute float aSpeed;
attribute float aBirth;
attribute float aLife;
attribute float aSeed;
attribute float aHue;

uniform vec3 uCamRight;
uniform vec3 uCamUp;

uniform float uTailLength;
uniform float uTailWidth;

varying vec2  vUv;
varying float vAge01;
varying float vSeed;
varying float vHue;
varying float vAlive;

void main() {
  vUv   = uv;
  vSeed = aSeed;
  vHue  = aHue;

  float age   = uTime - aBirth;
  float age01 = clamp(age / max(0.001, aLife), 0.0, 1.0);
  vAge01 = age01;

  // 未出生隐藏
  vAlive = step(0.0, age);

  // 头部世界位置
  vec3 head = aStart + aDir * (age * aSpeed);

  // uv.x: 0尾 -> 1头
  float x = uv.x;

  // 沿着方向：头在 0，尾在 -uTailLength
  float along = (x - 1.0) * uTailLength;

  // ✅ 关键：做“流线锥形” —— 头宽尾窄
  // u: 0(头) -> 1(尾)
  float u = clamp(1.0 - x, 0.0, 1.0);

  // 头部宽、尾部窄（尾部不要为 0，否则会出现极细锯齿）
  float widthScale = mix(1.25, 0.08, pow(u, 1.15));

  // ✅ 关键：宽度方向用 uCamRight（别用 uCamUp），才不会像“竖条长方形”
  float across = (uv.y - 0.5) * uTailWidth * widthScale;

  // 少量厚度（可选）：给一点点 uCamUp，让尾巴更像“气体厚度”
  float thickness = (uv.y - 0.5) * uTailWidth * 0.04 * (1.0 - u);

  vec3 offset = aDir * along + uCamRight * across + uCamUp * thickness;
  vec3 worldPos = head + offset;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
