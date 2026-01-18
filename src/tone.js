import * as Tone from "tone";

const pad = new Tone.PolySynth(Tone.Synth, {
  oscillator: {
    type: "sine" // 非常重要：先别用 saw
  },
  envelope: {
    attack: 4.0,
    decay: 2.0,
    sustain: 0.7,
    release: 6.0
  }
});

const filter = new Tone.Filter({
  type: "lowpass",
  frequency: 1200,
  Q: 0.6
});

const reverb = new Tone.Reverb({
  decay: 10,
  wet: 0.65
});

const delay = new Tone.FeedbackDelay({
  delayTime: "8n",
  feedback: 0.35,
  wet: 0.25
});

pad.chain(filter, chorus, delay, reverb, Tone.Destination);


const chords = [
  ["C4", "E4", "G4", "B4", "D5"],      // Cmaj9
  ["A3", "C4", "E4", "G4", "B4"],      // Am9
  ["F3", "A3", "C4", "E4", "G4"],      // Fmaj9
  ["G3", "B3", "D4", "F4", "A4"],      // G9
];

pad.set({
  envelope: { attack: 5.0, decay: 2.0, sustain: 0.75, release: 8.0 }
});

pad.set({
  oscillator: { type: "triangle" } // 比 sine 更有质感但不刺
});


const chorus = new Tone.Chorus({
  frequency: 0.6,
  delayTime: 3.5,
  depth: 0.5,
  wet: 0.25,
}).start();



const bell = new Tone.FMSynth({
  harmonicity: 2,
  modulationIndex: 8,
  oscillator: { type: "sine" },
  envelope: { attack: 0.01, decay: 1.2, sustain: 0.0, release: 2.5 },
  modulation: { type: "triangle" },
  modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.0, release: 0.2 }
});

const bellVerb = new Tone.Reverb({ decay: 12, wet: 0.75 });
const bellDelay = new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.45, wet: 0.35 });

bell.chain(bellDelay, bellVerb, Tone.Destination);
bell.volume.value = -18; // 很轻，像远处星光

const scale = ["C5","D5","E5","G5","A5","B5"]; // C 大调偏仙

Tone.Transport.scheduleRepeat((time) => {
  if (Math.random() < 0.7) return; // 不是每次都响，留空间
  const note = scale[Math.floor(Math.random() * scale.length)];
  bell.triggerAttackRelease(note, "16n", time, 0.6);
}, "8n");


const limiter = new Tone.Limiter(-1).toDestination();
const saturator = new Tone.Distortion(0.08); // 很轻
saturator.wet.value = 0.12;

reverb.disconnect();
reverb.connect(saturator);
saturator.connect(limiter);

Tone.Transport.scheduleRepeat((time) => {
  const base = 800;
  const lift = 700 * (0.5 + Math.random() * 0.5);
  filter.frequency.setValueAtTime(base + lift, time);
  filter.frequency.exponentialRampToValueAtTime(base, time + Tone.Time("2n").toSeconds());
}, "2n");




let chordIndex = 0;

Tone.Transport.scheduleRepeat((time) => {
  pad.triggerAttackRelease(chords[chordIndex], "6n", time);
  chordIndex = (chordIndex + 1) % chords.length;
}, "2n");

Tone.Transport.start();

const lfo = new Tone.LFO({
  frequency: 0.03,   // 非常慢
  min: 400,
  max: 1600
}).connect(filter.frequency);

lfo.start();
