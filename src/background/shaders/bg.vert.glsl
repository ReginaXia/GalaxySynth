precision highp float;

varying vec2 vUv;
varying vec3 vWorldDir;

void main() {
  vUv = uv;

  // sphere 在 camera.position 附近跟随移动时：
  // worldPos - cameraPosition 就是从相机指向该点的方向
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldDir = normalize(worldPos - cameraPosition);

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
