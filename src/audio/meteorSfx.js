import * as Tone from "tone";

const bus = new Tone.Gain(0.9);
const reverb = new Tone.Reverb({ decay: 5.2, wet: 0.30 });
const delay = new Tone.FeedbackDelay({ delayTime: "16n", feedback: 0.20, wet: 0.12 });

bus.chain(delay, reverb, Tone.Destination);

// 先锁定在 C 大调“仙”音阶（与你现在 audio.js 的 C4 基调更容易和谐）:contentReference[oaicite:4]{index=4}
const scale = ["C5", "D5", "E5", "G5", "A5", "B5"];

const glideCore = new Tone.MonoSynth({
  oscillator: { type: "triangle" },
  envelope: { attack: 0.012, decay: 0.22, sustain: 0.12, release: 0.46 },
  filter: { type: "lowpass", Q: 0.4, rolloff: -24 },
  filterEnvelope: {
    attack: 0.008,
    decay: 0.22,
    sustain: 0.18,
    release: 0.40,
    baseFrequency: 1200,
    octaves: 2.2,
  },
}).connect(bus);

const crystal = new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.003, decay: 0.12, sustain: 0.0, release: 0.22 },
}).connect(bus);

export function playMeteorSfx({ hue = 0.6, gain = 0.7, speed = 6.0, life = 1.0, romance = 0.6, chime = 0.6, tail = 0.6 }) {
  if (Tone.context.state !== "running") return;

  const now = Tone.now();
  const g = Math.max(0.05, Math.min(1.4, gain * (0.78 + romance * 0.52)));
  bus.gain.setValueAtTime(g, now);
  reverb.wet.rampTo(0.18 + romance * 0.42, 0.08);
  delay.wet.rampTo(0.06 + tail * 0.24, 0.08);

  const idx = Math.floor(((hue + speed * 0.025 + romance * 0.08) % 1) * scale.length);
  const note = scale[Math.max(0, Math.min(scale.length - 1, idx))];
  const slideTo = Tone.Frequency(note).transpose(2 + Math.round(chime * 2)).toNote();
  const coreDur = Math.max(0.10, Math.min(0.9, 0.14 + life * 0.20 + romance * 0.25));
  const chimeDur = Math.max(0.06, Math.min(0.55, 0.10 + tail * 0.18));

  glideCore.portamento = 0.02 + romance * 0.08;
  glideCore.triggerAttack(note, now, 0.72 + romance * 0.18);
  glideCore.frequency.linearRampToValueAtTime(Tone.Frequency(slideTo).toFrequency(), now + 0.08 + romance * 0.10);
  glideCore.triggerRelease(now + coreDur);

  const upNote = Tone.Frequency(note).transpose(12).toNote();
  crystal.triggerAttackRelease(upNote, chimeDur, now + 0.012, 0.25 + chime * 0.35);
}
