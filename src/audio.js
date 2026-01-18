import * as Tone from "tone";

let started = false;
let synth;
let gain;

export async function initAudioOnFirstGesture() {
  if (started) return;

  await Tone.start();

  gain = new Tone.Gain(0).toDestination();

  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.6,
      decay: 0.8,
      sustain: 0.3,
      release: 2.5,
    },
  }).connect(
    new Tone.Reverb({
      decay: 6,
      wet: 0.5,
    }).connect(
      new Tone.Delay("8n", 0.35).connect(gain)
    )
  );

  started = true;
}


let lastTime = 0;

export function triggerOnMove(move01, influence = 0) {
  if (!started) return;
  if (move01 < 0.02) {
    gain.gain.rampTo(0, 0.3);
    return;
  }

  const now = Tone.now();
  if (now - lastTime < 0.15) return; // 限制触发频率
  lastTime = now;

  const baseNote = 60; // C4
  const note = baseNote + Math.floor(influence * 12);

  synth.triggerAttackRelease(
    Tone.Frequency(note, "midi"),
    "8n",
    now
  );

  gain.gain.rampTo(0.25 + move01 * 0.4, 0.2);
}
