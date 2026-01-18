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

  // --- Pointer influence (screen space-ish) ---
  // 把当前点投到 NDC（近似做法：用 view 方向的 x/y）
  // 这里用 position 的 xz 做一个“银河平面”映射到 0..1 再转 -1..1
  vec2 approxNDC = vec2(p.x / 7.0, p.z / 7.0); // 你的 radius=7，所以除以 7
  float d = length(approxNDC - uPointer);

  // 鼠标附近产生“引力”和“扫动”
  float influence = smoothstep(0.55, 0.0, d);     // 越近越强
  vec3 dir = normalize(vec3(uPointer.x - approxNDC.x, 0.0, uPointer.y - approxNDC.y));

  // 轻吸引 + 微旋转扰动（更梦幻）
  p += dir * influence * 0.20;
  p.y += influence * 0.10 * sin(uTime * 2.0 + aSeed);


  // 呼吸漂浮：低频 + 个体差异
  float t = uTime * 0.35;
  float w1 = sin(t + aSeed) * 0.08;
  float w2 = cos(t * 0.9 + aSeed * 1.7) * 0.06;

  p.x += w1;
  p.y += w2;

  // 闪烁：每颗星不同节奏
  vTwinkle = (0.5 + 0.5 * sin(uTime * 1.8 + aSeed * 6.0)) + influence * 0.35;


  // size：按距离做衰减（让近处更大）
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float size = aSize * (70.0 / dist);

  gl_PointSize = size * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
