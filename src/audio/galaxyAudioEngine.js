// src/audio/galaxyAudioEngine.js
import * as Tone from "tone";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function nz(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return clamp01(v);
}

// Safe scale: minor pentatonic (never too wrong)
const MINOR_PENTA = [0, 3, 5, 7, 10]; // semitones
function pitch01ToNote(p01, root = "A3") {
  const octaves = 2;
  const stepsPerOct = MINOR_PENTA.length;
  const totalSteps = stepsPerOct * octaves;

  const idx = Math.max(
    0,
    Math.min(totalSteps - 1, Math.floor(clamp01(p01) * totalSteps))
  );
  const octave = Math.floor(idx / stepsPerOct);
  const degree = MINOR_PENTA[idx % stepsPerOct];

  return Tone.Frequency(root).transpose(octave * 12 + degree).toNote();
}

export function createGalaxyAudioEngine() {
  let started = false;
  let rhythmEnabled = false;   // kick/hat/bass
  let padEnabled = false;      // pad drone


  // ---------------------------
  // MASTER & GLOBAL FX
  // ---------------------------
  const masterLimiter = new Tone.Limiter(-1);
  const masterMeter = new Tone.Meter({ smoothing: 0.85, normalRange: true });

  // Global tone controls (these act like "mix bus" coloration)
  const busFilter = new Tone.Filter(900, "lowpass");
  const busDrive = new Tone.Distortion({ distortion: 0.02, wet: 0.10 });
  const busReverb = new Tone.Reverb({ decay: 4.0, wet: 0.14 });

  // connect bus -> master
  busFilter.chain(busDrive, busReverb, masterLimiter, masterMeter, Tone.Destination);

  // ---------------------------
  // PER-TRACK METERS (for UI)
  // ---------------------------
  const meterKick = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  const meterHat = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  const meterPad = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  const meterBass = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  const meterLead = new Tone.Meter({ smoothing: 0.85, normalRange: true });

  // ---------------------------
  // TRACK BUSSES
  // (Track -> trackGain -> meter -> global busFilter)
  // ---------------------------
  const gainKick = new Tone.Gain(1.0);
  const gainHat = new Tone.Gain(1.0);
  const gainPad = new Tone.Gain(1.0);
  const gainBass = new Tone.Gain(1.0);
  const gainLead = new Tone.Gain(1.0);

  // track routing into global bus
  gainKick.chain(meterKick, busFilter);
  gainHat.chain(meterHat, busFilter);
  gainPad.chain(meterPad, busFilter);
  // Bass: do NOT go through reverb-heavy bus by default (keep it tight).
  // We'll send bass to busFilter but keep busReverb wet low globally; also bass track is lowpassed.
  gainBass.chain(meterBass, busFilter);
  gainLead.chain(meterLead, busFilter);

  // ---------------------------
  // INSTRUMENTS
  // ---------------------------
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 10,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.22, sustain: 0.0, release: 0.02 },
  }).connect(gainKick);

  const hat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0.0 },
  }).connect(gainHat);

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.6, decay: 0.8, sustain: 0.65, release: 1.6 },
  }).connect(gainPad);

  const bass = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.18 },
    filter: { Q: 1, type: "lowpass", rolloff: -24 },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.4,
      release: 0.2,
      baseFrequency: 80,
      octaves: 2,
    },
  }).connect(gainBass);

  const lead = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.04, decay: 0.12, sustain: 0.35, release: 0.55 },
  }).connect(gainLead);

  // ---------------------------
  // meteor
  // ---------------------------

  const meteorNoise = new Tone.Noise("pink").start();
  const meteorFilter = new Tone.Filter({ type: "bandpass", frequency: 800, Q: 1.8 });
  const meteorEnv = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 0.25, sustain: 0.0, release: 0.25 });
  meteorNoise.chain(meteorFilter, meteorEnv, busFilter); // 或接一个单独 gainFX

  function triggerMeteor(strength = 1, brightness = 0.6) {
  const s = clamp01(strength);
  meteorFilter.frequency.setValueAtTime(lerp(500, 2200, clamp01(brightness)), Tone.now());
  meteorEnv.triggerAttackRelease(lerp(0.18, 0.5, s));
}


  // ---------------------------
  // DEFAULT MIX (important!)
  // Make sure pad doesn't "hum" too loud, and lead is clearly audible.
  // ---------------------------
  gainKick.gain.value = 0.95;
  gainHat.gain.value = 0.55;
  gainPad.gain.value = 0.22;  // keep low; we'll animate with energy/texture
  gainBass.gain.value = 0.55; // will be boosted by energy
  gainLead.gain.value = 0.85; // keep lead obvious

  // ---------------------------
  // TRANSPORT SETTINGS
  // ---------------------------
  Tone.Transport.bpm.value = 118;
  Tone.Transport.swing = 0.08;

  // ---------------------------
  // OUTPUT STATE FOR VISUALS & UI
  // ---------------------------
  const out = {
    rms: 0,        // master 0..1
    beatPulse: 0,  // 0..1 decays
    lastNote: null,
    lastNoteTime: 0,
    lastMidi: 60,

    level: { kick: 0, hat: 0, pad: 0, bass: 0, lead: 0 },

    style: {
      bpm: 118,
      cutoff: 900,
      drive: 0.02,
      reverbWet: 0.14,
      swing: 0.08,
    },
  };

  let beatPulse = 0;

  // ---------------------------
  // SCHEDULING
  // ---------------------------
  let evtKick = null;
  let evtHat = null;
  let evtPad = null;

  // For hat density gating
  let hatGate = 0.3; // 0..1
  // For “climax lever” feel, we keep a little internal memory
  let energySmoothed = 0;

  function scheduleAll() {
    // Kick every quarter note
    evtKick = Tone.Transport.scheduleRepeat((time) => {
      kick.triggerAttackRelease("C1", "8n", time, 1.2);
      // Bass follows kick on root
      // bass.triggerAttackRelease("A1", "8n", time, 0.85);

      beatPulse = 1.0;
    }, "4n");

    // Hat every 8th note; density is controlled by volume + gating randomness
    evtHat = Tone.Transport.scheduleRepeat((time) => {
      if (!rhythmEnabled) return;

      const r = Math.random();
      const prob = lerp(0.15, 0.98, hatGate);
      if (r < prob) hat.triggerAttackRelease("16n", time, 0.55);
    }, "8n");


    // Pad: "breathing refresh" every 2 bars
    evtPad = Tone.Transport.scheduleRepeat((time) => {
      if (!padEnabled) return;

      pad.releaseAll(time);
      pad.triggerAttackRelease(["A3","E4","G4"], "2m", time, 0.18);
    }, "2m");

    // ✅ 删掉“开局立刻触发”的那段 now 触发（否则一上来就嗡嗡）

  }

  function unscheduleAll() {
    if (evtKick !== null) Tone.Transport.clear(evtKick);
    if (evtHat !== null) Tone.Transport.clear(evtHat);
    if (evtPad !== null) Tone.Transport.clear(evtPad);
    evtKick = evtHat = evtPad = null;
  }

  // ---------------------------
  // MANUAL TRIGGERS (for step sequencer)
  // ---------------------------
  function triggerBeat(time, vel = 1.0) {
    kick.triggerAttackRelease("C1", "8n", time, 1.0 * vel);
    beatPulse = Math.max(beatPulse, 0.9 * vel);
  }

  function triggerPerc(time, vel = 1.0) {
    hat.triggerAttackRelease("16n", time, 0.55 * vel);
  }


  // ---------------------------
  // START / STOP
  // ---------------------------
  function start() {
    if (started) return;
    Tone.start();
    started = true;

    // ✅ 今晚目标：默认安静。节奏之后由 16-step 音轨来触发。
    // scheduleAll();

    Tone.Transport.start();
  }


  function stop() {
    if (!started) return;
    Tone.Transport.stop();
    unscheduleAll();
    pad.releaseAll();
    started = false;
  }

  // IMPORTANT: browsers require a user gesture to start audio
  function bindUserStart(target = window) {
    const handler = async () => {
      if (!started) await start();
      target.removeEventListener("pointerdown", handler);
      target.removeEventListener("keydown", handler);
    };
    target.addEventListener("pointerdown", handler, { once: false });
    target.addEventListener("keydown", handler, { once: false });
  }

  // ---------------------------
  // MAIN CONTROL: PerformanceState -> Sound
  // ---------------------------
  function setPerformance(ps) {
    // ps: { energy, texture, rhythmDensity, rotation, pitch, trigger, triggerStrength }
    const e = clamp01(ps.energy ?? 0);
    const dens = clamp01(ps.rhythmDensity ?? 0.3);

    rhythmEnabled = dens > 0.08 && e > 0.10;
    padEnabled = e > 0.08;

    const tex = clamp01(ps.texture ?? 0.5);
    const rot = Math.max(-1, Math.min(1, ps.rotation ?? 0));

    // smooth energy to avoid zipper noise
    energySmoothed = energySmoothed + (e - energySmoothed) * 0.08;

    // Hat density / feel
    hatGate = dens;
    gainHat.gain.rampTo(lerp(0.35, 0.90, dens), 0.08);

    // 在 setPerformance 里
    const padCutoff = lerp(600, 2400, 0.5 * tex + 0.5 * energySmoothed);
    pad.set({
      filter: { frequency: padCutoff }
    });

    // Global bus tone mapping (this is where texture/energy really shows)
    // cutoff: higher = brighter
    const cutoff = lerp(380, 5200, 0.55 * tex + 0.45 * energySmoothed);
    busFilter.frequency.rampTo(cutoff, 0.04);

    // drive: higher = more Y2K edge
    const driveAmt = lerp(0.01, 0.32, energySmoothed);
    busDrive.distortion = driveAmt;

    // reverb: texture + a little energy
    const rv = lerp(0.08, 0.26, 0.70 * tex + 0.30 * energySmoothed);
    busReverb.wet.rampTo(rv, 0.12);

    // swing from rotation (DJ nudging feel)
    Tone.Transport.swing = lerp(0.02, 0.22, Math.abs(rot));

    // master loudness (keep within headroom)
    Tone.Destination.volume.value = lerp(-6, 0, energySmoothed);

    // Track mixing influenced by energy (so it's not static)
    // Keep pad subtle; let it "breathe" without becoming hum.
    gainPad.gain.rampTo(lerp(0.14, 0.28, 0.40 * tex + 0.60 * (1 - energySmoothed)), 0.15);

    // Bass becomes present with energy
    gainBass.gain.rampTo(lerp(0.20, 0.95, energySmoothed), 0.08);
    bass.filterEnvelope.octaves = lerp(1.2, 3.8, energySmoothed);

    // Lead stays clear
    gainLead.gain.rampTo(lerp(0.75, 1.05, energySmoothed), 0.05);

    // Trigger -> Lead note
    if (ps.trigger) {
      const note = pitch01ToNote(ps.pitch ?? 0.5, "A3");
      out.lastNote = note;
      out.lastNoteTime = Tone.now();

      out.lastMidi = Tone.Frequency(note).toMidi();

      // Make it impossible to miss (you can tune down later)
      const strength = clamp01(ps.triggerStrength ?? 1);
      const vel = lerp(0.55, 1.15, strength);

      const bassNote = Tone.Frequency(note).transpose(-24).toNote();
      bass.triggerAttackRelease(bassNote, "8n", Tone.now(), 0.35);

      lead.triggerAttackRelease(note, "8n", Tone.now(), vel * 0.85);
    }

    // expose style for UI
    out.style.bpm = Tone.Transport.bpm.value;
    out.style.cutoff = cutoff;
    out.style.drive = driveAmt;
    out.style.reverbWet = rv;
    out.style.swing = Tone.Transport.swing;
  }

  // ---------------------------
  // UPDATE LOOP: beatPulse + meters
  // ---------------------------
  function update(dt) {
    beatPulse *= Math.exp(-dt * 10.0);
    out.beatPulse = beatPulse;

    out.rms = nz(masterMeter.getValue());

    out.level.kick = nz(meterKick.getValue());
    out.level.hat = nz(meterHat.getValue());
    out.level.pad = nz(meterPad.getValue());
    out.level.bass = nz(meterBass.getValue());
    out.level.lead = nz(meterLead.getValue());
  }

  function getState() {
    return { ...out, level: { ...out.level }, style: { ...out.style } };
  }

  return {
    start,
    stop,
    bindUserStart,
    setPerformance,
    update,
    getState,
    triggerMeteor,
    triggerBeat,
    triggerPerc,
    isStarted: () => started,
  };
}
