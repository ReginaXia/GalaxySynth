// src/audio/galaxyVoices.js
import * as Tone from "tone";

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

export function createGalaxyVoices() {
  async function safeTriggerAttackRelease(inst, note, dur, time, vel) {
    if (!inst) return;
    const ok = await ensureToneRunning();
    if (!ok) return;
    try {
      inst.triggerAttackRelease(note, dur, time ?? Tone.now(), vel ?? 0.9);
    } catch (e) {
      console.warn("[Audio] triggerAttackRelease failed:", e);
    }
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const PROFILE_NAMES = [
    "legacy_current",
    "cosmic_bell_pad",
    "ambient_dreamy_pad",
    "digital_sparkle_tone",
    "cosmic_synth_tone",
  ];

  const DEFAULT_ID_TO_PROFILE = {
    A_pad: "legacy_current",
    B_bell: "cosmic_bell_pad",
    C_pluck: "ambient_dreamy_pad",
    D_sparkle: "digital_sparkle_tone",
    E_air: "cosmic_synth_tone",
  };
  const profileOverrideByGalaxyId = new Map();

  function pickInstrument(galaxyId) {
    if (galaxyId && profileOverrideByGalaxyId.has(galaxyId)) {
      const override = profileOverrideByGalaxyId.get(galaxyId);
      if (PROFILE_NAMES.includes(override)) return override;
    }
    if (galaxyId && DEFAULT_ID_TO_PROFILE[galaxyId]) return DEFAULT_ID_TO_PROFILE[galaxyId];
    const idx = hashString(String(galaxyId ?? "")) % PROFILE_NAMES.length;
    return PROFILE_NAMES[idx];
  }

  const chorus = new Tone.Chorus({
    frequency: 0.45,
    delayTime: 3.5,
    depth: 0.55,
    wet: 0.22,
  }).start();

  const filter = new Tone.Filter({ type: "lowpass", frequency: 1100, Q: 0.65 });
  const pitch = new Tone.PitchShift({ pitch: 12, windowSize: 0.06, wet: 0.05 });
  const reverb = new Tone.Reverb({ decay: 10.5, wet: 0.55 });
  const delay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.33, wet: 0.18 });
  const compressor = new Tone.Compressor(-26, 3);
  const limiter = new Tone.Limiter(-1);

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 2.8, decay: 1.6, sustain: 0.75, release: 6.5 },
  });
  pad.volume.value = -18;

  const bell = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 9,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 1.1, sustain: 0.0, release: 2.2 },
    modulation: { type: "triangle" },
    modulationEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.0, release: 0.2 },
  });
  bell.volume.value = -22;

  const scratchDryBus = new Tone.Gain(1.45);
  const scratchHP = new Tone.Filter({ type: "highpass", frequency: 120, Q: 0.2 });
  const scratchLP = new Tone.Filter({ type: "lowpass", frequency: 13200, Q: 0.2 });
  const scratchTone = new Tone.EQ3({ low: -2.0, mid: 0.0, high: 2.5 });
  const scratchComp = new Tone.Compressor(-17, 2);
  scratchDryBus.chain(scratchHP, scratchLP, scratchTone, scratchComp, limiter, Tone.Destination);

  const haloSendBus = new Tone.Gain(1.12);
  const haloHP = new Tone.Filter({ type: "highpass", frequency: 1900, Q: 0.2 });
  const haloLP = new Tone.Filter({ type: "lowpass", frequency: 12000, Q: 0.2 });
  const haloShimmer = new Tone.PitchShift({ pitch: 12, windowSize: 0.05, wet: 0.10 });
  const haloReverb = new Tone.Reverb({ decay: 3.4, preDelay: 0.024, wet: 0.19 });
  haloSendBus.chain(haloHP, haloLP, haloShimmer, haloReverb, limiter, Tone.Destination);

  const sparkleSendBus = new Tone.Gain(0.72);
  const sparkleHP = new Tone.Filter({ type: "highpass", frequency: 2200, Q: 0.2 });
  const sparkleDelay = new Tone.FeedbackDelay({ delayTime: "16n", feedback: 0.18, wet: 0.24 });
  const sparkleLP = new Tone.Filter({ type: "lowpass", frequency: 10800, Q: 0.2 });
  sparkleSendBus.chain(sparkleHP, sparkleDelay, sparkleLP, limiter, Tone.Destination);

  function createLayeredVoice(profile) {
    const transient = new Tone.Synth({
      oscillator: { type: profile.transientOsc ?? "triangle" },
      envelope: profile.transientEnv ?? { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.05 },
    });
    transient.volume.value = profile.transientVol ?? -13.0;

    const coreCarrier = new Tone.Synth({
      oscillator: { type: profile.coreOsc ?? "sine" },
      envelope: profile.coreEnv ?? { attack: 0.01, decay: 0.30, sustain: 0.09, release: 0.8 },
    });
    coreCarrier.volume.value = profile.coreVol ?? -11.0;
    if (typeof profile.coreDetune === "number") coreCarrier.detune.value = profile.coreDetune;

    const coreSaw = profile.enableSaw
      ? new Tone.Synth({ oscillator: { type: "sawtooth" }, envelope: profile.coreEnv ?? { attack: 0.01, decay: 0.30, sustain: 0.09, release: 0.8 } })
      : null;
    if (coreSaw) {
      coreSaw.volume.value = profile.coreSawVol ?? -24.0;
      coreSaw.detune.value = profile.coreSawDetune ?? 6;
    }

    const coreFM = new Tone.FMSynth({
      harmonicity: profile.fmHarmonicity ?? 1.5,
      modulationIndex: profile.fmModIndex ?? 2.2,
      oscillator: { type: profile.fmCarrierOsc ?? "sine" },
      envelope: profile.fmEnv ?? { attack: 0.01, decay: 0.28, sustain: 0.06, release: 0.78 },
      modulation: { type: profile.fmModOsc ?? "triangle" },
      modulationEnvelope: profile.fmModEnv ?? { attack: 0.01, decay: 0.18, sustain: 0.0, release: 0.26 },
    });
    coreFM.volume.value = profile.fmVol ?? -17.0;

    const coreBell = new Tone.Synth({
      oscillator: { type: profile.bellOsc ?? "triangle" },
      envelope: profile.bellEnv ?? { attack: 0.005, decay: 0.22, sustain: 0.0, release: 0.55 },
    });
    coreBell.volume.value = profile.bellVol ?? -22.0;

    const airSpark = new Tone.Synth({
      oscillator: { type: profile.airOsc ?? "sine" },
      envelope: profile.airEnv ?? { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.08 },
    });
    airSpark.volume.value = profile.airVol ?? -23.0;

    const transientHP = new Tone.Filter({ type: "highpass", frequency: profile.transientHP ?? 3600, Q: 0.35 });
    const transientLP = new Tone.Filter({ type: "lowpass", frequency: profile.transientLP ?? 13200, Q: 0.2 });

    const coreBus = new Tone.Gain(1.0);
    const coreHP = new Tone.Filter({ type: "highpass", frequency: profile.coreHP ?? 200, Q: 0.25 });
    const coreLP = new Tone.Filter({ type: "lowpass", frequency: profile.coreLP ?? 6200, Q: 0.2 });
    const coreWidth = new Tone.StereoWidener(profile.width ?? 0.18);

    const airHP = new Tone.Filter({ type: "highpass", frequency: profile.airHP ?? 4300, Q: 0.35 });
    const airLP = new Tone.Filter({ type: "lowpass", frequency: profile.airLP ?? 12500, Q: 0.25 });

    const transientLayer = new Tone.Gain(profile.transientLayer ?? 0.70);
    const coreLayer = new Tone.Gain(profile.coreLayer ?? 0.88);
    const airLayer = new Tone.Gain(profile.airLayer ?? 0.16);

    transient.chain(transientHP, transientLP, transientLayer);
    coreCarrier.connect(coreBus);
    coreFM.connect(coreBus);
    coreBell.connect(coreBus);
    if (coreSaw) coreSaw.connect(coreBus);
    coreBus.chain(coreHP, coreLP, coreWidth, coreLayer);
    airSpark.chain(airHP, airLP, airLayer);

    if ((profile.coreLfoHz ?? 0) > 0.001) {
      const lfo = new Tone.LFO({
        frequency: profile.coreLfoHz,
        min: profile.coreLfoMin ?? 2400,
        max: profile.coreLfoMax ?? 6200,
      }).start();
      lfo.connect(coreLP.frequency);
    }

    function sendLayer(layer, dry = 1.0, halo = 0.25, sparkle = 0.0) {
      const dryTap = new Tone.Gain(dry);
      const haloTap = new Tone.Gain(halo);
      layer.connect(dryTap);
      layer.connect(haloTap);
      dryTap.connect(scratchDryBus);
      haloTap.connect(haloSendBus);
      if (sparkle > 0.0001) {
        const sparkleTap = new Tone.Gain(sparkle);
        layer.connect(sparkleTap);
        sparkleTap.connect(sparkleSendBus);
      }
    }

    sendLayer(transientLayer, profile.transientDry ?? 1.0, profile.transientHalo ?? 0.25, profile.transientSparkle ?? 0.0);
    sendLayer(coreLayer, profile.coreDry ?? 1.0, profile.coreHalo ?? 0.40, profile.coreSparkle ?? 0.0);
    sendLayer(airLayer, profile.airDry ?? 1.0, profile.airHalo ?? 0.52, profile.airSparkle ?? 0.0);

    return {
      triggerAttackRelease(note, dur, time, vel = 0.9) {
        const now = time ?? Tone.now();
        const velocity = Math.max(0.05, Math.min(1, vel));
        const baseDur = (typeof dur === "number" ? dur : 0.14);
        const coreDur = Math.max(profile.minCoreDur ?? 0.10, baseDur * (profile.coreDurMul ?? 1.0));
        const transientDur = Math.max(profile.minTransientDur ?? 0.022, coreDur * (profile.transientDurMul ?? 0.22));
        const airDur = Math.max(profile.minAirDur ?? 0.038, coreDur * (profile.airDurMul ?? 0.28));

        if ((profile.transientVelMul ?? 0.8) > 0.001) {
          const topNote = Tone.Frequency(note).transpose(profile.transientTranspose ?? 24).toNote();
          transient.triggerAttackRelease(topNote, transientDur, now, velocity * (profile.transientVelMul ?? 0.8));
        }

        coreCarrier.triggerAttackRelease(note, coreDur, now, velocity * (profile.coreVelMul ?? 0.9));

        if ((profile.fmVelMul ?? 0.4) > 0.001) {
          coreFM.triggerAttackRelease(note, coreDur * (profile.fmDurMul ?? 0.92), now, velocity * (profile.fmVelMul ?? 0.4));
        }

        if ((profile.bellVelMul ?? 0.3) > 0.001) {
          const corePartial = Tone.Frequency(note).transpose(profile.bellTranspose ?? 12).toNote();
          coreBell.triggerAttackRelease(corePartial, coreDur * (profile.bellDurMul ?? 0.56), now, velocity * (profile.bellVelMul ?? 0.3));
        }

        if (coreSaw) {
          coreSaw.triggerAttackRelease(note, coreDur * (profile.sawDurMul ?? 1.0), now, velocity * (profile.sawVelMul ?? 0.28));
        }

        if ((profile.airVelMul ?? 0.3) > 0.001) {
          const airNote = Tone.Frequency(note).transpose(profile.airTranspose ?? 24).toNote();
          airSpark.triggerAttackRelease(airNote, airDur, now, velocity * (profile.airVelMul ?? 0.3));
        }
      },
      set() {},
    };
  }

  function createCelestialVoice() {
    return createLayeredVoice({
      transientOsc: "triangle",
      transientEnv: { attack: 0.001, decay: 0.032, sustain: 0.0, release: 0.035 },
      transientVol: -10.5,
      coreOsc: "sine",
      coreEnv: { attack: 0.01, decay: 0.30, sustain: 0.09, release: 0.80 },
      coreVol: -10.5,
      fmHarmonicity: 1.5,
      fmModIndex: 2.2,
      fmCarrierOsc: "sine",
      fmModOsc: "triangle",
      fmEnv: { attack: 0.01, decay: 0.28, sustain: 0.06, release: 0.78 },
      fmModEnv: { attack: 0.01, decay: 0.18, sustain: 0.0, release: 0.26 },
      fmVol: -16.5,
      bellOsc: "triangle",
      bellEnv: { attack: 0.005, decay: 0.22, sustain: 0.0, release: 0.55 },
      bellVol: -22.5,
      airOsc: "sine",
      airEnv: { attack: 0.001, decay: 0.045, sustain: 0.0, release: 0.08 },
      airVol: -22.5,
      transientHP: 3800,
      transientLP: 13000,
      coreHP: 200,
      coreLP: 6200,
      airHP: 4500,
      airLP: 12500,
      transientLayer: 0.72,
      coreLayer: 0.88,
      airLayer: 0.16,
      transientDry: 1.0,
      transientHalo: 0.28,
      coreDry: 1.0,
      coreHalo: 0.40,
      airDry: 1.0,
      airHalo: 0.52,
      coreDurMul: 1.0,
      transientDurMul: 0.22,
      airDurMul: 0.28,
      transientVelMul: 0.80,
      coreVelMul: 0.92,
      fmVelMul: 0.42,
      bellVelMul: 0.30,
      airVelMul: 0.34,
      bellTranspose: 12,
      airTranspose: 24,
      width: 0.18,
    });
  }

  function createCosmicBellPadVoice() {
    return createLayeredVoice({
      transientOsc: "sine",
      transientEnv: { attack: 0.008, decay: 0.070, sustain: 0.0, release: 0.11 },
      transientVol: -16.0,
      coreOsc: "sine",
      coreEnv: { attack: 0.035, decay: 0.56, sustain: 0.20, release: 1.30 },
      coreVol: -12.8,
      fmHarmonicity: 2.3,
      fmModIndex: 3.1,
      fmCarrierOsc: "sine",
      fmModOsc: "sine",
      fmEnv: { attack: 0.02, decay: 0.38, sustain: 0.10, release: 0.90 },
      fmModEnv: { attack: 0.02, decay: 0.34, sustain: 0.0, release: 0.40 },
      fmVol: -18.2,
      bellOsc: "triangle",
      bellEnv: { attack: 0.01, decay: 0.34, sustain: 0.0, release: 0.88 },
      bellVol: -20.5,
      airOsc: "sine",
      airEnv: { attack: 0.004, decay: 0.085, sustain: 0.0, release: 0.16 },
      airVol: -24.0,
      transientHP: 3200,
      transientLP: 12000,
      coreHP: 170,
      coreLP: 8600,
      airHP: 5200,
      airLP: 13200,
      transientLayer: 0.36,
      coreLayer: 0.92,
      airLayer: 0.12,
      transientDry: 1.0,
      transientHalo: 0.30,
      coreDry: 1.0,
      coreHalo: 0.58,
      airDry: 0.95,
      airHalo: 0.70,
      coreDurMul: 1.36,
      transientDurMul: 0.27,
      airDurMul: 0.44,
      transientVelMul: 0.45,
      coreVelMul: 0.84,
      fmVelMul: 0.34,
      bellVelMul: 0.36,
      airVelMul: 0.20,
      bellTranspose: 24,
      airTranspose: 24,
      width: 0.28,
      minCoreDur: 0.14,
    });
  }

  function createAmbientDreamyPadVoice() {
    return createLayeredVoice({
      transientOsc: "sine",
      transientEnv: { attack: 0.020, decay: 0.120, sustain: 0.0, release: 0.18 },
      transientVol: -22.0,
      coreOsc: "triangle",
      coreEnv: { attack: 0.12, decay: 0.95, sustain: 0.46, release: 2.40 },
      coreVol: -12.0,
      fmHarmonicity: 1.25,
      fmModIndex: 1.0,
      fmCarrierOsc: "sine",
      fmModOsc: "triangle",
      fmEnv: { attack: 0.10, decay: 0.70, sustain: 0.22, release: 1.70 },
      fmModEnv: { attack: 0.08, decay: 0.45, sustain: 0.0, release: 0.80 },
      fmVol: -24.0,
      bellOsc: "sine",
      bellEnv: { attack: 0.04, decay: 0.30, sustain: 0.0, release: 0.80 },
      bellVol: -30.0,
      airOsc: "sine",
      airEnv: { attack: 0.020, decay: 0.160, sustain: 0.0, release: 0.30 },
      airVol: -26.0,
      transientHP: 2600,
      transientLP: 9600,
      coreHP: 150,
      coreLP: 5600,
      airHP: 5000,
      airLP: 11000,
      transientLayer: 0.12,
      coreLayer: 1.02,
      airLayer: 0.10,
      transientDry: 0.90,
      transientHalo: 0.32,
      coreDry: 0.98,
      coreHalo: 0.74,
      airDry: 0.90,
      airHalo: 0.82,
      coreDurMul: 2.0,
      transientDurMul: 0.22,
      airDurMul: 0.55,
      transientVelMul: 0.14,
      coreVelMul: 0.78,
      fmVelMul: 0.18,
      bellVelMul: 0.0,
      airVelMul: 0.12,
      bellTranspose: 12,
      airTranspose: 24,
      width: 0.72,
      minCoreDur: 0.28,
    });
  }

  function createDigitalSparkleVoice() {
    return createLayeredVoice({
      transientOsc: "triangle",
      transientEnv: { attack: 0.001, decay: 0.025, sustain: 0.0, release: 0.030 },
      transientVol: -11.5,
      coreOsc: "sine",
      coreEnv: { attack: 0.008, decay: 0.24, sustain: 0.08, release: 0.66 },
      coreVol: -11.8,
      fmHarmonicity: 2.8,
      fmModIndex: 5.2,
      fmCarrierOsc: "sine",
      fmModOsc: "triangle",
      fmEnv: { attack: 0.008, decay: 0.21, sustain: 0.0, release: 0.44 },
      fmModEnv: { attack: 0.005, decay: 0.16, sustain: 0.0, release: 0.22 },
      fmVol: -14.0,
      bellOsc: "triangle",
      bellEnv: { attack: 0.004, decay: 0.18, sustain: 0.0, release: 0.38 },
      bellVol: -17.8,
      airOsc: "sine",
      airEnv: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.09 },
      airVol: -19.8,
      transientHP: 4300,
      transientLP: 15000,
      coreHP: 250,
      coreLP: 12000,
      airHP: 6200,
      airLP: 14800,
      transientLayer: 0.85,
      coreLayer: 0.78,
      airLayer: 0.22,
      transientDry: 1.0,
      transientHalo: 0.16,
      transientSparkle: 0.10,
      coreDry: 1.0,
      coreHalo: 0.28,
      coreSparkle: 0.26,
      airDry: 0.95,
      airHalo: 0.30,
      airSparkle: 0.42,
      coreDurMul: 0.95,
      transientDurMul: 0.20,
      airDurMul: 0.24,
      transientVelMul: 0.88,
      coreVelMul: 0.88,
      fmVelMul: 0.62,
      bellVelMul: 0.45,
      airVelMul: 0.40,
      bellTranspose: 24,
      airTranspose: 31,
      width: 0.22,
      minCoreDur: 0.09,
    });
  }

  function createCosmicSynthVoice() {
    return createLayeredVoice({
      transientOsc: "sine",
      transientEnv: { attack: 0.015, decay: 0.070, sustain: 0.0, release: 0.12 },
      transientVol: -19.0,
      coreOsc: "sine",
      coreEnv: { attack: 0.085, decay: 0.75, sustain: 0.32, release: 2.10 },
      coreVol: -12.0,
      coreDetune: -4,
      enableSaw: true,
      coreSawVol: -26.0,
      coreSawDetune: 6,
      fmHarmonicity: 1.2,
      fmModIndex: 1.8,
      fmCarrierOsc: "sine",
      fmModOsc: "sine",
      fmEnv: { attack: 0.06, decay: 0.40, sustain: 0.18, release: 1.45 },
      fmModEnv: { attack: 0.05, decay: 0.30, sustain: 0.0, release: 0.62 },
      fmVol: -24.5,
      bellOsc: "sine",
      bellEnv: { attack: 0.05, decay: 0.30, sustain: 0.0, release: 0.70 },
      bellVol: -31.0,
      airOsc: "triangle",
      airEnv: { attack: 0.028, decay: 0.22, sustain: 0.0, release: 0.55 },
      airVol: -23.5,
      transientHP: 2800,
      transientLP: 11500,
      coreHP: 180,
      coreLP: 7600,
      coreLfoHz: 0.18,
      coreLfoMin: 3200,
      coreLfoMax: 7600,
      airHP: 4600,
      airLP: 12400,
      transientLayer: 0.18,
      coreLayer: 1.04,
      airLayer: 0.18,
      transientDry: 1.0,
      transientHalo: 0.26,
      coreDry: 0.98,
      coreHalo: 0.72,
      airDry: 0.92,
      airHalo: 0.86,
      coreDurMul: 1.45,
      transientDurMul: 0.28,
      airDurMul: 0.68,
      transientVelMul: 0.16,
      coreVelMul: 0.88,
      fmVelMul: 0.16,
      bellVelMul: 0.0,
      airVelMul: 0.24,
      bellTranspose: 12,
      airTranspose: 24,
      sawVelMul: 0.22,
      width: 0.52,
      minCoreDur: 0.18,
    });
  }

  const nebulaInstruments = {
    legacy_current: createCelestialVoice(),
    cosmic_bell_pad: createCosmicBellPadVoice(),
    ambient_dreamy_pad: createAmbientDreamyPadVoice(),
    digital_sparkle_tone: createDigitalSparkleVoice(),
    cosmic_synth_tone: createCosmicSynthVoice(),
  };

  pad.chain(filter, chorus, delay, pitch, reverb, compressor, limiter, Tone.Destination);
  bell.chain(delay, pitch, reverb, compressor, limiter, Tone.Destination);

  const chords = [
    ["C4", "E4", "G4", "B4", "D5"],
    ["A3", "C4", "E4", "G4", "B4"],
    ["F3", "A3", "C4", "E4", "G4"],
    ["G3", "B3", "D4", "F4", "A4"],
  ];

  const scale = ["C5", "D5", "E5", "G5", "A5", "B5"];
  let chordIndex = 0;

  function startTransport() {
    Tone.Transport.bpm.value = 78;

    Tone.Transport.scheduleRepeat((time) => {
      safeTriggerAttackRelease(pad, chords[chordIndex], "2n", time, 0.55);
      chordIndex = (chordIndex + 1) % chords.length;
    }, "2n");

    Tone.Transport.scheduleRepeat((time) => {
      if (Math.random() < 0.75) return;
      const note = scale[(Math.random() * scale.length) | 0];
      safeTriggerAttackRelease(bell, note, "16n", time, 0.45);
    }, "4n");

    Tone.Transport.start();
  }

  function setDreaminess(v01) {
    const cutoff = 650 + v01 * 2200;
    filter.frequency.rampTo(cutoff, 0.12);
    reverb.wet.rampTo(0.45 + v01 * 0.25, 0.2);
    delay.wet.rampTo(0.10 + v01 * 0.18, 0.2);
    pad.volume.rampTo(-20 + v01 * 6, 0.2);
  }

  function setShimmer(v01) {
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
    return nebulaInstruments[name] ?? nebulaInstruments.legacy_current;
  }

  function getAvailableNebulaProfiles() {
    return PROFILE_NAMES.slice();
  }

  function setNebulaInstrumentProfile(galaxyId, profileName) {
    if (!galaxyId) return;
    if (!profileName || profileName === "auto") {
      profileOverrideByGalaxyId.delete(galaxyId);
      return;
    }
    if (!PROFILE_NAMES.includes(profileName)) return;
    profileOverrideByGalaxyId.set(galaxyId, profileName);
  }

  function clearNebulaInstrumentProfile(galaxyId) {
    if (!galaxyId) return;
    profileOverrideByGalaxyId.delete(galaxyId);
  }

  return {
    setDreaminess,
    setShimmer,
    spark,
    startTransport,
    getNebulaInstrument,
    getNebulaInstrumentName,
    getAvailableNebulaProfiles,
    setNebulaInstrumentProfile,
    clearNebulaInstrumentProfile,
  };
}
