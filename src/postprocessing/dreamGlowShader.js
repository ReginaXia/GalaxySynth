import * as THREE from "three";

export const DreamGlowShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 0.0 },
    uBlurScale: { value: 1.0 },
    uTintMix: { value: 0.08 },
    uTintColor: { value: new THREE.Vector3(0.985, 0.99, 1.0) },
    uHaze: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uAmount;
    uniform float uBlurScale;
    uniform float uTintMix;
    uniform vec3 uTintColor;
    uniform float uHaze;
    varying vec2 vUv;

    vec3 sampleBlur(vec2 uv, vec2 px) {
      vec3 c = texture2D(tDiffuse, uv).rgb * 0.18;
      c += texture2D(tDiffuse, uv + vec2( px.x, 0.0)).rgb * 0.12;
      c += texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb * 0.12;
      c += texture2D(tDiffuse, uv + vec2(0.0,  px.y)).rgb * 0.12;
      c += texture2D(tDiffuse, uv + vec2(0.0, -px.y)).rgb * 0.12;
      c += texture2D(tDiffuse, uv + px).rgb * 0.085;
      c += texture2D(tDiffuse, uv - px).rgb * 0.085;
      c += texture2D(tDiffuse, uv + vec2( px.x, -px.y)).rgb * 0.085;
      c += texture2D(tDiffuse, uv + vec2(-px.x,  px.y)).rgb * 0.085;
      return c;
    }

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 px = (uBlurScale / uResolution);
      vec3 blurA = sampleBlur(vUv, px * 2.2);
      vec3 blurB = sampleBlur(vUv, px * 4.8);
      vec3 glow = mix(blurA, blurB, 0.55);
      float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
      float highlightMask = smoothstep(0.24, 1.15, lum);
      vec3 tintedGlow = mix(glow, glow * uTintColor, uTintMix);
      vec3 hazeCol = mix(base, mix(glow, glow * uTintColor, 0.45 + uTintMix * 0.35), 0.45);
      vec3 outCol = base + tintedGlow * uAmount * (0.35 + highlightMask * 0.95);
      outCol = mix(outCol, outCol + hazeCol * (0.22 + highlightMask * 0.28), uHaze);
      gl_FragColor = vec4(outCol, 1.0);
    }
  `,
};
