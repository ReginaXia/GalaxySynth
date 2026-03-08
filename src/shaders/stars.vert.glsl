attribute float aSize;
attribute float aSeed;
attribute float aAlpha;     // ✅ 新增
varying vec3 vColor;
varying float vTw;
varying float vAlpha;       // ✅ 新增

uniform float uTime;
uniform float uPixelRatio;
uniform float uBaseSize;

void main(){
  vColor = color;
  vAlpha = aAlpha;          // ✅ 新增

  vTw = 0.55 + 0.45 * sin(uTime * 2.1 + aSeed * 6.2831);

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uBaseSize * uPixelRatio * (1.0 / max(0.6, -mv.z));
  gl_PointSize = clamp(size, 1.0, 28.0);

  gl_Position = projectionMatrix * mv;
}
