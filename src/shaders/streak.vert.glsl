varying vec2 vUv;
varying float vPulse;

uniform float uTime;

void main(){
  vUv = uv;

  // 沿长度推进的脉冲亮带
  float speed = 0.55;
  float phase = fract(uTime * speed);
  float head = phase;
  float d = abs(vUv.x - head);
  vPulse = smoothstep(0.22, 0.0, d);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
