// src/audio/galaxyVoices.js
import * as Tone from "tone";

/**
 * 目标：梦幻、柔软、Ariana-ish 的 “空气感合成器”
 * 原则：不尖、不吵、但有 shimmer / chorus / 轻微 delay 的“仙境空间”
 */
export function createGalaxyVoices() {
  // ---- FX (先声明，避免引用顺序问题) ----
  const chorus = new Tone.Chorus({
    frequency: 0.45,
    delayTime: 3.5,
    depth: 0.55,
    wet: 0.22,
  }).start();

  const filter = new Tone.Filter({
    type: "lowpass",
    frequency: 1100,
    Q: 0.65,
  });

  // Shimmer-ish：用 PitchShift + Reverb 做“亮晶晶空气”
  const pitch = new Tone.PitchShift({ pitch: 12, windowSize: 0.1, wet: 0.12 });
  const reverb = new Tone.Reverb({ decay: 10.5, wet: 0.55 });

  const delay = new Tone.FeedbackDelay({
    delayTime: "8n.",
    feedback: 0.33,
    wet: 0.18,
  });

  const compressor = new Tone.Compressor(-26, 3);
  const limiter = new Tone.Limiter(-1);

  // ---- PAD（主氛围：maj9 / add9）----
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" }, // 比 saw 温柔，仍有质感
    envelope: { attack: 2.8, decay: 1.6, sustain: 0.75, release: 6.5 },
  });
  pad.volume.value = -18;

  // ---- BELL / PLUCK（点缀：远处星光）----
  const bell = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 9,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 1.1, sustain: 0.0, release: 2.2 },
    modulation: { type: "triangle" },
    modulationEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.0, release: 0.2 },
  });
  bell.volume.value = -22;

  // ---- Routing ----
  // pad -> filter -> chorus -> delay -> pitch -> reverb -> comp -> limiter -> out
  pad.chain(filter, chorus, delay, pitch, reverb, compressor, limiter, Tone.Destination);
  bell.chain(delay, pitch, reverb, compressor, limiter, Tone.Destination);

  // ---- 和声：温柔但“有希望”的循环（很 Ariana 那种光亮感）----
  const chords = [
    ["C4", "E4", "G4", "B4", "D5"], // Cmaj9
    ["A3", "C4", "E4", "G4", "B4"], // Am9
    ["F3", "A3", "C4", "E4", "G4"], // Fmaj9
    ["G3", "B3", "D4", "F4", "A4"], // G9
  ];

  const scale = ["C5", "D5", "E5", "G5", "A5", "B5"];

  let chordIndex = 0;

  function startTransport() {
    Tone.Transport.bpm.value = 78;

    // Pad：慢慢换和弦
    Tone.Transport.scheduleRepeat((time) => {
      pad.triggerAttackRelease(chords[chordIndex], "2n", time, 0.55);
      chordIndex = (chordIndex + 1) % chords.length;
    }, "2n");

    // Bell：稀疏地闪一下（不要变噪音）
    Tone.Transport.scheduleRepeat((time) => {
      if (Math.random() < 0.75) return;
      const note = scale[(Math.random() * scale.length) | 0];
      bell.triggerAttackRelease(note, "16n", time, 0.45);
    }, "4n");

    Tone.Transport.start();
  }

  // ---- 交互参数（你后面会让星云 influence 影响这些）----
  function setDreaminess(v01) {
    // v01: 0..1，越靠近星云越“亮”“开阔”
    const cutoff = 650 + v01 * 2200;
    filter.frequency.rampTo(cutoff, 0.12);

    reverb.wet.rampTo(0.45 + v01 * 0.25, 0.2);
    delay.wet.rampTo(0.10 + v01 * 0.18, 0.2);

    // 轻微增益，但别炸
    pad.volume.rampTo(-20 + v01 * 6, 0.2);
  }

  function spark(vel = 0.6) {
    const note = scale[(Math.random() * scale.length) | 0];
    bell.triggerAttackRelease(note, "16n", Tone.now(), vel);
    }

  return {
    setDreaminess,
    spark,
    };
}
