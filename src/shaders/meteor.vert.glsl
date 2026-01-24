// src/shaders/meteor.vert.glsl
precision highp float;
precision highp int;

uniform float uTime;

uniform float uTailLength;   // GUI: tailLength
uniform float uTailWidth;    // GUI: tailWidth


attribute vec3  aStart;
attribute vec3  aDir;
attribute float aSpeed;
attribute float aBirth;
attribute float aLife;
attribute float aSeed;
attribute float aHue;

varying vec2  vUv;
varying float vAge01;
varying float vSeed;
varying float vHue;
varying float vAlive;

mat3 makeBasis(vec3 forward){
  vec3 up0 = vec3(0.0, 1.0, 0.0);
  if (abs(dot(forward, up0)) > 0.95) up0 = vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(up0, forward));
  vec3 up    = normalize(cross(forward, right));
  return mat3(right, up, forward);
}

void main(){
  float age = uTime - aBirth;
  float age01 = clamp(age / max(0.0001, aLife), 0.0, 1.0);
  float alive = step(0.0, age) * step(age, aLife);

  vAge01 = age01;
  vAlive = alive;
  vSeed  = aSeed;
  vHue   = aHue;

  vec3 fwd = normalize(aDir);
  mat3 B = makeBasis(fwd);
  vec3 right = B[0];
  vec3 up    = B[1];
  vec3 forward = B[2];

  // 中心沿着方向飞行
  vec3 center = aStart + forward * (aSpeed * age);

  // ribbon 语义：position.x 控制长度，position.y 控制宽度
  float uLen = clamp(position.x + 0.5, 0.0, 1.0); // 0=尾, 1=头

  // 尾部更宽一点（更像参考图喷散）
  float widen = mix(1.25, 0.65, pow(uLen, 0.8)); // 尾(0)更宽，头(1)更窄
  float w = uTailWidth * widen;

  vec3 lengthOffset = forward * (position.x * uTailLength);
  vec3 widthOffset  = right   * (position.y * w);

  // 轻微扰动（让尾巴不那么“激光直”）
  float wobble = sin(uTime * 1.4 + aSeed * 10.0 + uLen * 9.0) * 0.06;
  vec3 wobbleOffset = up * (w * wobble);

  vec3 worldPos = center + lengthOffset + widthOffset + wobbleOffset;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);

  // ✅ 给 frag：vUv.y 必须代表“横向”，0.5 是中心线
  // PlaneGeometry 的 uv.y 正好对应宽度方向：0..1
  vUv = vec2(uLen, uv.y);
}
