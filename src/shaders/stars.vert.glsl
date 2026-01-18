attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vTwinkle;

uniform float uTime;
uniform vec2 uPointer;
uniform float uPixelRatio;

void main(){
  vColor = color;

  vec3 p = position;

  // 呼吸漂浮：低频 + 个体差异
  float t = uTime * 0.35;
  float w1 = sin(t + aSeed) * 0.08;
  float w2 = cos(t * 0.9 + aSeed * 1.7) * 0.06;

  p.x += w1;
  p.y += w2;

  // 闪烁：每颗星不同节奏
  vTwinkle = 0.5 + 0.5 * sin(uTime * 1.8 + aSeed * 6.0);

  // size：按距离做衰减（让近处更大）
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float size = aSize * (70.0 / dist);

  gl_PointSize = size * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
