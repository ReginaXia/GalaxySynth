import * as Tone from "tone";

const bus = new Tone.Gain(0.9);
const reverb = new Tone.Reverb({ decay: 6, wet: 0.45 });
const delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.25, wet: 0.25 });

bus.chain(delay, reverb, Tone.Destination);

// 先锁定在 C 大调“仙”音阶（与你现在 audio.js 的 C4 基调更容易和谐）:contentReference[oaicite:4]{index=4}
const scale = ["C5", "D5", "E5", "G5", "A5", "B5"];

const pluck = new Tone.PluckSynth({
  attackNoise: 1.0,
  dampening: 3500,
  resonance: 0.85,
}).connect(bus);

const whoosh = new Tone.NoiseSynth({
  noise: { type: "pink" },
  envelope: { attack: 0.002, decay: 0.16, sustain: 0.0, release: 0.05 },
}).connect(bus);

export function playMeteorSfx({ hue = 0.6, gain = 0.7, speed = 6.0 }) {
  if (Tone.context.state !== "running") return;

  const now = Tone.now();
  bus.gain.setValueAtTime(gain, now);

  const idx = Math.floor(((hue + speed * 0.03) % 1) * scale.length);
  const note = scale[Math.max(0, Math.min(scale.length - 1, idx))];

  pluck.triggerAttack(note, now);
  whoosh.triggerAttackRelease("16n", now + 0.01);
}
