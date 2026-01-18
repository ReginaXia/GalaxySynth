precision highp float;

varying vec3 vColor;
varying float vTwinkle;

void main(){
  vec2 uv = gl_PointCoord.xy - 0.5;
  float d = length(uv);

  float core = smoothstep(0.5, 0.0, d);
  float halo = smoothstep(0.5, 0.15, d) * 0.55;

  float alpha = (core + halo) * (0.10 + vTwinkle * 0.18);
  vec3 col = vColor * (0.55 + vTwinkle * 0.25);

  if (d > 0.5) discard;

  gl_FragColor = vec4(col, alpha);
}
