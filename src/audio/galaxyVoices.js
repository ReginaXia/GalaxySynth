// src/audio/galaxyVoices.js
import * as Tone from "tone";


// ------------------ Tone context guard (robust) ------------------
let __toneReady = false;
async function ensureToneRunning() {
  if (__toneReady && Tone.context.state === "running") return true;
  try {
    await Tone.start();
    await Tone.context.resume?.();
    __toneReady = (Tone.context.state === "running");
    return __toneReady;
  } catch (e) {
    console.warn("[Audio] ensureToneRunning failed:", e);
    return false;
  }
}

/**
 * 目标：梦幻、柔软、Ariana-ish 的 “空气感合成器”
 * 原则：不尖、不吵、但有 shimmer / chorus / 轻微 delay 的“仙境空间”
 */
export function createGalaxyVoices() {async function safeTriggerAttackRelease(inst, note, dur, time, vel) {
  if (!inst) return;
  const ok = await ensureToneRunning();
  if (!ok) return;
  try {
    inst.triggerAttackRelease(note, dur, time ?? Tone.now(), vel ?? 0.9);
  } catch (e) {
    console.warn("[Audio] triggerAttackRelease failed:", e);
  }
}



  // -------------------------------------
  // Nebula instruments (scratch voices)
  // -------------------------------------

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pickInstrument(key) {
    const list = ["violin", "cello", "organ", "harp", "piano"];
    return list[hashString(key) % list.length];
  }

  const nebulaInstruments = {
    violin: new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.03, decay: 0.26, sustain: 0.36, release: 1.35 },
    }),

    cello: new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.05, decay: 0.30, sustain: 0.42, release: 1.55 },
    }),
    organ: new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.04, decay: 0.20, sustain: 0.58, release: 1.45 },
    }),
    harp: new Tone.PluckSynth({ attackNoise: 0.45, dampening: 2800, resonance: 0.82 }),
    piano: new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.015, decay: 0.24, sustain: 0.06, release: 1.75 },
    }),
  };

  Object.values(nebulaInstruments).forEach(inst => {
    inst.volume.value = -14.5;
  });


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
  // const pitch = new Tone.PitchShift({ pitch: 12, windowSize: 0.1, wet: 0.12 });
  const pitch = new Tone.PitchShift({ pitch: 12, windowSize: 0.06, wet: 0.05 });
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


  // ---- Nebula scratch instruments routing ----
  // 让 violin/cello/organ/harp/piano 也走同一套空间效果，声音才“融入银河”
  // 建一个专门 scratchBus
  const scratchBus = new Tone.Gain(1.0);
  const scratchHP = new Tone.Filter({ type: "highpass", frequency: 140, Q: 0.2 });
  const scratchLP = new Tone.Filter({ type: "lowpass", frequency: 8800, Q: 0.2 });
  const scratchAir = new Tone.EQ3({ low: -3.5, mid: -0.5, high: 3.0 });
  const scratchChorus = new Tone.Chorus({ frequency: 0.28, delayTime: 2.4, depth: 0.24, wet: 0.10 }).start();
  const scratchDelay = new Tone.FeedbackDelay({ delayTime: "16n", feedback: 0.18, wet: 0.07 });
  scratchBus.chain(scratchHP, scratchLP, scratchAir, scratchChorus, scratchDelay, compressor, limiter, Tone.Destination);

  // Bright, transparent space (avoid dark/wet cloud)
  const scratchReverb = new Tone.Reverb({ decay: 3.6, preDelay: 0.02, wet: 0.14 });
  scratchBus.connect(scratchReverb);
  scratchReverb.toDestination();

  // 每个 nebula 乐器走 scratchBus
  Object.values(nebulaInstruments).forEach((inst) => {
    inst.connect(scratchBus);
  });


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
      safeTriggerAttackRelease(pad, chords[chordIndex], "2n", time, 0.55);
      chordIndex = (chordIndex + 1) % chords.length;
    }, "2n");

    // Bell：稀疏地闪一下（不要变噪音）
    Tone.Transport.scheduleRepeat((time) => {
      if (Math.random() < 0.75) return;
      const note = scale[(Math.random() * scale.length) | 0];
      safeTriggerAttackRelease(bell, note, "16n", time, 0.45);
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

  function setShimmer(v01) {
    // 0..1
    pitch.wet.rampTo(0.02 + v01 * 0.10, 0.2);
  }


  function spark(vel = 0.6) {
    const note = scale[(Math.random() * scale.length) | 0];
    safeTriggerAttackRelease(bell, note, "16n", Tone.now(), vel);
    }

  function getNebulaInstrumentName(galaxyId) {
  return pickInstrument(galaxyId);
  }

  function getNebulaInstrument(galaxyId) {
    const name = getNebulaInstrumentName(galaxyId);
    return nebulaInstruments[name];
  }


  return {
    setDreaminess,
    setShimmer,
    spark,
    getNebulaInstrument,
    getNebulaInstrumentName,
  };

}
