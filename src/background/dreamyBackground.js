import * as THREE from "three";

// Vite 常用：?raw 读取 shader 字符串
import bgVert from "./shaders/bg.vert.glsl?raw";
import bgFrag from "./shaders/bg.frag.glsl?raw";

export function createDreamyBackground(scene) {
  const geo = new THREE.PlaneGeometry(2, 2);

  const mat = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthWrite: false,
    depthTest: false,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.7 },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // 永远在最底层
  mesh.renderOrder = -10000;

  scene.add(mesh);

  return {
    mesh,
    material: mat,
    update(t) {
      mat.uniforms.uTime.value = t;
    },
    setIntensity(v) {
      mat.uniforms.uIntensity.value = v;
    },
  };
}
