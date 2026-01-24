// src/shaders/meteor.vert.glsl
// 注意：ShaderMaterial 会自动注入 attribute position/uv 等，所以这里不要重复声明！

attribute vec3 aStart;
attribute vec3 aDir;
attribute float aSpeed;
attribute float aBirth;
attribute float aLife;
attribute float aSeed;
attribute float aHue;

uniform float uTime;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

uniform float uTailLength;
uniform float uTailWidth;

varying vec2 vUv;
varying float vAge01;
varying float vSeed;
varying float vHue;
varying float vAlive;

void main() {
  vUv = uv;
  vSeed = aSeed;
  vHue = aHue;

  float age = uTime - aBirth;
  float age01 = clamp(age / max(0.001, aLife), 0.0, 1.0);
  vAge01 = age01;

  // 还没出生就隐藏
  vAlive = step(0.0, age);

  // 头部位置
  vec3 head = aStart + aDir * (age * aSpeed);

  // billboard quad：uv.x 0尾->1头
  float along = (uv.x - 1.0) * uTailLength;
  float across = (uv.y - 0.5) * uTailWidth;

  vec3 offset = aDir * along + uCamUp * across;
  vec3 worldPos = head + offset;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
