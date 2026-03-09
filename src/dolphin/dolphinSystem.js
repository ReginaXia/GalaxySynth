import * as THREE from "three";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function makeDolphinTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, 256, 256);
  ctx.translate(128, 128);
  ctx.rotate(-0.28);

  const g = ctx.createRadialGradient(0, -8, 8, 0, 0, 84);
  g.addColorStop(0.0, "rgba(255,255,255,0.96)");
  g.addColorStop(0.32, "rgba(196,232,255,0.92)");
  g.addColorStop(1.0, "rgba(120,164,255,0.0)");
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(-70, 8);
  ctx.quadraticCurveTo(-20, -44, 36, -18);
  ctx.quadraticCurveTo(74, 0, 52, 18);
  ctx.quadraticCurveTo(20, 24, -10, 16);
  ctx.quadraticCurveTo(-36, 46, -76, 22);
  ctx.quadraticCurveTo(-62, 18, -70, 8);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(206,236,255,0.84)";
  ctx.beginPath();
  ctx.ellipse(-8, -3, 28, 10, -0.35, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createDolphinSystem({ scene, nebulaSystem, planeY = 0.0 }) {
  const root = new THREE.Group();
  scene.add(root);

  const params = {
    enabled: true,
    maxCount: 26,
    jumpHeight: 1.35,
    jumpDistance: 1.95,
    jumpDuration: 1.25,
    size: 0.72,
    glow: 0.94,
    spin: 0.42,
  };

  const fallbackTexture = makeDolphinTexture();
  const texture = fallbackTexture;
  const items = [];
  const maxPool = 44;

  for (let i = 0; i < maxPool; i++) {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(0xbfe3ff),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    spr.renderOrder = 9994;
    root.add(spr);

    items.push({
      alive: false,
      sprite: spr,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      dir: new THREE.Vector3(1, 0, 0),
      birth: 0,
      life: 1.2,
      height: 1.2,
      size: 0.7,
      hue: 0.58,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Prefer user-provided dolphin style texture from /public.
  const loader = new THREE.TextureLoader();
  loader.load(
    "/dophine/1.png",
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      for (let i = 0; i < items.length; i++) {
        items[i].sprite.material.map = tex;
        items[i].sprite.material.needsUpdate = true;
      }
      if (fallbackTexture && fallbackTexture !== tex) fallbackTexture.dispose?.();
    },
    undefined,
    () => {
      // keep fallback texture silently
    }
  );

  function alloc() {
    for (let i = 0; i < items.length; i++) {
      if (!items[i].alive) return items[i];
    }
    let oldest = items[0];
    for (let i = 1; i < items.length; i++) {
      if (items[i].birth < oldest.birth) oldest = items[i];
    }
    return oldest;
  }

  function triggerFromNote({
    galaxyId = null,
    theta01 = Math.random(),
    velocity = 0.65,
    strength = 1.0,
    now = performance.now() * 0.001,
  } = {}) {
    if (!params.enabled) return;

    const live = items.reduce((n, it) => n + (it.alive ? 1 : 0), 0);
    if (live >= Math.max(1, params.maxCount)) return;

    const cluster = galaxyId ? nebulaSystem?.getCluster?.(galaxyId) : null;
    const center = cluster?.group
      ? cluster.group.localToWorld(new THREE.Vector3(0, 0, 0))
      : new THREE.Vector3(0, planeY, 0);

    const a = ((theta01 % 1) + 1) % 1 * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rand(-0.22, 0.22));
    const d = params.jumpDistance * rand(0.62, 1.10) * (0.78 + 0.46 * clamp01(strength));

    const start = center.clone().addScaledVector(dir, -d * 0.54).add(side);
    start.y = planeY + rand(0.08, 0.22);
    const end = center.clone().addScaledVector(dir, d * 0.46).add(side.multiplyScalar(0.2));
    end.y = planeY + rand(0.04, 0.18);

    const v = clamp01(velocity);
    const item = alloc();
    item.alive = true;
    item.birth = now;
    item.life = params.jumpDuration * rand(0.92, 1.18) * (0.9 + 0.25 * (1 - v));
    item.height = params.jumpHeight * rand(0.78, 1.35) * (0.70 + v * 1.05);
    item.size = params.size * rand(0.80, 1.45) * (0.80 + v * 0.62);
    item.start.copy(start);
    item.end.copy(end);
    item.dir.copy(dir);
    item.hue = ((0.54 + theta01 * 0.18 + rand(-0.03, 0.03)) % 1 + 1) % 1;
    item.phase = Math.random() * Math.PI * 2;

    item.sprite.visible = true;
    item.sprite.position.copy(start);
    item.sprite.scale.set(item.size, item.size * 0.52, 1);
  }

  function update(nowSec) {
    const t = nowSec;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      const k = (t - it.birth) / Math.max(1e-4, it.life);
      if (k >= 1) {
        it.alive = false;
        it.sprite.visible = false;
        continue;
      }

      const u = clamp01(k);
      const arc = Math.sin(u * Math.PI);
      const smooth = u * u * (3 - 2 * u);

      it.sprite.position.lerpVectors(it.start, it.end, smooth);
      it.sprite.position.y += it.height * arc;

      // Fixed-frame style: keep mostly upright, then add a slight left tilt
      // after the apex to suggest "falling back into the sea".
      const riseTilt = THREE.MathUtils.smoothstep(u, 0.03, 0.42) * 0.08;
      const apexSettle = THREE.MathUtils.smoothstep(u, 0.42, 0.56);
      const fallTilt = THREE.MathUtils.smoothstep(u, 0.56, 0.96) * 0.34;
      const breathe = Math.sin(t * (1.2 + params.spin * 1.2) + it.phase) * 0.035;
      it.sprite.material.rotation = riseTilt * (1.0 - apexSettle) + fallTilt + breathe;

      const fadeIn = Math.min(1, u / 0.10);
      const fadeOut = Math.min(1, (1 - u) / 0.42);
      const alpha = fadeIn * fadeOut * (0.42 + arc * 0.58) * params.glow;
      it.sprite.material.opacity = alpha;

      const sat = 0.26 + 0.24 * arc;
      const val = 0.72 + 0.28 * arc;
      it.sprite.material.color.setHSL(it.hue, sat, val);

      const scalePulse = 1.0 + 0.09 * Math.sin(t * 3.0 + it.phase) * arc;
      const s = it.size * (0.84 + arc * 0.30) * scalePulse;
      it.sprite.scale.set(s, s * 0.52, 1);
    }
  }

  return {
    root,
    params,
    triggerFromNote,
    update,
  };
}
