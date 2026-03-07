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
    return "celestial_base";
  }


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


  // ---- Nebula scratch architecture: Transient + Core + Air + Halo ----
  const scratchDryBus = new Tone.Gain(1.45);
  const scratchHP = new Tone.Filter({ type: "highpass", frequency: 120, Q: 0.2 });
  const scratchLP = new Tone.Filter({ type: "lowpass", frequency: 13200, Q: 0.2 });
  const scratchTone = new Tone.EQ3({ low: -2.0, mid: 0.0, high: 2.5 });
  const scratchComp = new Tone.Compressor(-17, 2);
  scratchDryBus.chain(scratchHP, scratchLP, scratchTone, scratchComp, limiter, Tone.Destination);

  // Very light celestial halo (kept subtle and easy to tune)
  const HALO_GAIN = 1.12;
  const HALO_SHIMMER_WET = 0.10;
  const HALO_REVERB_DECAY = 3.4;
  const HALO_REVERB_WET = 0.19;

  const haloSendBus = new Tone.Gain(HALO_GAIN);
  const haloHP = new Tone.Filter({ type: "highpass", frequency: 1900, Q: 0.2 });
  const haloLP = new Tone.Filter({ type: "lowpass", frequency: 12000, Q: 0.2 });
  const haloShimmer = new Tone.PitchShift({ pitch: 12, windowSize: 0.05, wet: HALO_SHIMMER_WET });
  const haloReverb = new Tone.Reverb({ decay: HALO_REVERB_DECAY, preDelay: 0.024, wet: HALO_REVERB_WET });
  haloSendBus.chain(haloHP, haloLP, haloShimmer, haloReverb, limiter, Tone.Destination);

  function createCelestialVoice() {
    const transient = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.032, sustain: 0.0, release: 0.035 },
    });
    transient.volume.value = -10.5;

    // Core layer: CelestialCore (sine center + subtle FM richness + light overtone).
    const coreCarrier = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.30, sustain: 0.09, release: 0.80 },
    });
    coreCarrier.volume.value = -10.5;

    const coreFM = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 2.2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.28, sustain: 0.06, release: 0.78 },
      modulation: { type: "triangle" },
      modulationEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.0, release: 0.26 },
    });
    coreFM.volume.value = -16.5;

    const coreBell = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.22, sustain: 0.0, release: 0.55 },
    });
    coreBell.volume.value = -22.5;

    const airSpark = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0.0, release: 0.08 },
    });
    airSpark.volume.value = -22.5;

    const transientHP = new Tone.Filter({ type: "highpass", frequency: 3800, Q: 0.35 });
    const transientLP = new Tone.Filter({ type: "lowpass", frequency: 13000, Q: 0.2 });
    const coreBus = new Tone.Gain(1.0);
    const coreHP = new Tone.Filter({ type: "highpass", frequency: 200, Q: 0.25 });
    const coreLP = new Tone.Filter({ type: "lowpass", frequency: 6200, Q: 0.2 });
    const airHP = new Tone.Filter({ type: "highpass", frequency: 4500, Q: 0.4 });
    const airLP = new Tone.Filter({ type: "lowpass", frequency: 12500, Q: 0.25 });

    const transientLayer = new Tone.Gain(0.72);
    const coreLayer = new Tone.Gain(0.88);
    const airLayer = new Tone.Gain(0.16);

    transient.chain(transientHP, transientLP, transientLayer);
    coreCarrier.connect(coreBus);
    coreFM.connect(coreBus);
    coreBell.connect(coreBus);
    coreBus.chain(coreHP, coreLP, coreLayer);
    airSpark.chain(airHP, airLP, airLayer);

    function sendLayer(layer, dry = 1, halo = 0.25) {
      const dryTap = new Tone.Gain(dry);
      const haloTap = new Tone.Gain(halo);
      layer.connect(dryTap);
      layer.connect(haloTap);
      dryTap.connect(scratchDryBus);
      haloTap.connect(haloSendBus);
    }

    // Keep dry articulation, add a faint trailing glow behind each note.
    sendLayer(transientLayer, 1.0, 0.28);
    sendLayer(coreLayer, 1.0, 0.40);
    sendLayer(airLayer, 1.0, 0.52);

    return {
      triggerAttackRelease(note, dur, time, vel = 0.9) {
        const now = time ?? Tone.now();
        const velocity = Math.max(0.05, Math.min(1, vel));
        const coreDur = Math.max(0.10, (typeof dur === "number" ? dur : 0.14) * 1.0);
        const transientDur = Math.max(0.025, coreDur * 0.22);
        const airDur = Math.max(0.040, coreDur * 0.28);

        const topNote = Tone.Frequency(note).transpose(24).toNote();
        transient.triggerAttackRelease(topNote, transientDur, now, velocity * 0.80);
        coreCarrier.triggerAttackRelease(note, coreDur, now, velocity * 0.92);
        coreFM.triggerAttackRelease(note, coreDur * 0.92, now, velocity * 0.42);
        const corePartial = Tone.Frequency(note).transpose(12).toNote();
        coreBell.triggerAttackRelease(corePartial, coreDur * 0.56, now, velocity * 0.30);
        const airNote = Tone.Frequency(note).transpose(24).toNote();
        airSpark.triggerAttackRelease(airNote, airDur, now, velocity * 0.34);
      },
      set() {},
    };
  }

  const nebulaInstruments = {
    celestial_base: createCelestialVoice(),
  };


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
