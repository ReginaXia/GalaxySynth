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

pad.chain(filter, delay, reverb, Tone.Destination);

const chords = [
  ["C4", "E4", "G4", "B4"],
  ["A3", "C4", "E4", "G4"],
  ["F3", "A3", "C4", "E4"],
  ["G3", "B3", "D4", "F4"]
];

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
