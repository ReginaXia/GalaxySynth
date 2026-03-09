import * as THREE from "three";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

const NOTE_GLYPHS = [
  "♫⋆｡",
  "♪",
  "♬",
  "₊˚♪",
  "𝄞",
  "𝄢",
  "𝄚𝅦",
  "𝄞₊˚",
];

function makeNoteTexture(char = "♪") {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, 320, 320);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontStack = "'Noto Music','Noto Sans Symbols 2','Segoe UI Symbol','Apple Symbols','Arial Unicode MS',sans-serif";

  let fontSize = 220;
  for (; fontSize >= 96; fontSize -= 8) {
    ctx.font = `700 ${fontSize}px ${fontStack}`;
    if (ctx.measureText(char).width <= 260) break;
  }
  ctx.font = `700 ${fontSize}px ${fontStack}`;

  ctx.shadowColor = "rgba(190,230,255,0.78)";
  ctx.shadowBlur = 22;
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.04));
  ctx.strokeStyle = "rgba(170,215,255,0.72)";
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.strokeText(char, 160, 160);
  ctx.fillText(char, 160, 160);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createNotePopSystem({ scene, nebulaSystem, planeY = 0.0 }) {
  const root = new THREE.Group();
  scene.add(root);

  const params = {
    enabled: true,
    maxCount: 42,
    jumpHeight: 1.05,
    jumpDistance: 1.35,
    duration: 1.0,
    size: 0.52,
    glow: 0.9,
    followNoteColor: true,
  };

  const textures = NOTE_GLYPHS.map((g) => makeNoteTexture(g));
  const items = [];
  const maxPool = 72;

  for (let i = 0; i < maxPool; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures[i % textures.length],
      color: new THREE.Color(0xb8dfff),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    spr.renderOrder = 9993;
    root.add(spr);

    items.push({
      alive: false,
      sprite: spr,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      birth: 0,
      life: 1.0,
      height: 1.0,
      size: 0.5,
      hue: 0.58,
      speed01: 0.5,
      pitch01: 0.5,
      phase: Math.random() * Math.PI * 2,
    });
  }

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
    velocity = 0.66,
    notePitch01 = null,
    noteHue = null,
    strength = 1.0,
    now = performance.now() * 0.001,
  } = {}) {
    if (!params.enabled) return;
    let live = 0;
    for (let i = 0; i < items.length; i++) if (items[i].alive) live++;
    if (live >= Math.max(1, params.maxCount)) return;

    const cluster = galaxyId ? nebulaSystem?.getCluster?.(galaxyId) : null;
    const center = cluster?.group
      ? cluster.group.localToWorld(new THREE.Vector3(0, 0, 0))
      : new THREE.Vector3(0, planeY, 0);

    const a = ((theta01 % 1) + 1) % 1 * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rand(-0.18, 0.18));
    const d = params.jumpDistance * rand(0.7, 1.15) * (0.78 + 0.42 * clamp01(strength));

    const start = center.clone().addScaledVector(dir, -d * 0.3).add(side);
    start.y = planeY + rand(0.08, 0.24);
    const end = center.clone().addScaledVector(dir, d * 0.68).add(side.multiplyScalar(0.25));
    end.y = planeY + rand(0.05, 0.2);

    const v = clamp01(velocity);
    const pitch01 = clamp01(notePitch01 ?? theta01 ?? 0.5);
    const item = alloc();
    item.alive = true;
    item.birth = now;
    item.life = params.duration * rand(0.84, 1.22) * THREE.MathUtils.lerp(1.24, 0.80, v) * THREE.MathUtils.lerp(1.06, 0.90, pitch01);
    const lively = clamp01(0.55 * v + 0.45 * clamp01(strength));
    item.height = params.jumpHeight * rand(0.58, 1.95) * (0.58 + lively * 1.45) * (0.72 + pitch01 * 0.95);
    item.size = params.size * rand(0.82, 1.3) * (0.78 + v * 0.58);
    item.start.copy(start);
    item.end.copy(end);
    item.hue = (noteHue != null ? noteHue : (0.55 + theta01 * 0.22)) % 1;
    item.speed01 = v;
    item.pitch01 = pitch01;
    item.phase = Math.random() * Math.PI * 2;

    item.sprite.visible = true;
    item.sprite.position.copy(start);
    item.sprite.scale.set(item.size, item.size, 1);
  }

  function update(nowSec) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      const k = (nowSec - it.birth) / Math.max(1e-4, it.life);
      if (k >= 1) {
        it.alive = false;
        it.sprite.visible = false;
        continue;
      }

      const u = clamp01(k);
      const smooth = u * u * (3 - 2 * u);
      const arc = Math.sin(u * Math.PI);
      it.sprite.position.lerpVectors(it.start, it.end, smooth);
      it.sprite.position.y += it.height * arc;

      // Mostly upright; slight right tilt during fall.
      const tiltFall = THREE.MathUtils.smoothstep(u, 0.58, 0.96) * 0.28;
      const breathe = Math.sin(nowSec * 1.8 + it.phase) * 0.03;
      it.sprite.material.rotation = tiltFall + breathe;

      const fadeIn = Math.min(1, u / THREE.MathUtils.lerp(0.16, 0.07, it.speed01));
      const fadeOut = Math.min(1, (1 - u) / THREE.MathUtils.lerp(0.62, 0.32, it.speed01));
      const alpha = fadeIn * fadeOut * (0.34 + 0.66 * arc) * params.glow;
      it.sprite.material.opacity = alpha;

      if (params.followNoteColor) {
        it.sprite.material.color.setHSL(it.hue, 0.35 + 0.25 * arc, 0.72 + 0.2 * arc);
      } else {
        it.sprite.material.color.setRGB(0.76, 0.88, 1.0);
      }

      const drift = (1.0 - it.speed01) * 0.22 * u;
      it.sprite.position.y += drift;
      const s = it.size * (0.84 + (0.22 + 0.12 * it.pitch01) * arc);
      it.sprite.scale.set(s, s, 1);
    }
  }

  return {
    root,
    params,
    triggerFromNote,
    update,
  };
}
