uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vColor;
varying float vTw;
varying float vAlpha;

vec3 tonemap(vec3 x){
  // 简单 Reinhard，专治 additive 爆白
  return x / (1.0 + x);
}

void main(){
  vec4 tex = texture2D(uMap, gl_PointCoord);

  float a = tex.a * uOpacity * vAlpha;   // ✅ 每点不同透明度

  // twinkle：范围收窄，别一下子乘到发白
  float glow = mix(0.90, 1.18, vTw);
  vec3 col = vColor * glow;

  col = tonemap(col);                    // ✅ 防爆白
  col = pow(col, vec3(0.9));             // ✅ 轻微提对比（可删）

  gl_FragColor = vec4(col, a);
}
