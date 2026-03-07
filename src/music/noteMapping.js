const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const NOTE_STEPS = MAJOR_SCALE.length;
export const NOTE_DIRECTION = 1; // 1: CCW, -1: CW
export const NOTE_ZERO_OFFSET01 = 0; // global phase offset

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

export function wrapStep(i, steps = NOTE_STEPS) {
  const s = Math.max(1, steps | 0);
  return ((i % s) + s) % s;
}

export function theta01ToStep(theta01, steps = NOTE_STEPS) {
  const s = Math.max(1, steps | 0);
  const phase = directionAdjustedTheta01(theta01);
  return Math.floor(clamp01(phase) * s) % s;
}

export function directionAdjustedTheta01(theta01) {
  const t = wrap01(theta01);
  const directed = NOTE_DIRECTION > 0 ? t : (1 - t);
  return wrap01(directed + NOTE_ZERO_OFFSET01);
}

export function stepToCenterTheta01(step, steps = NOTE_STEPS) {
  const s = Math.max(1, steps | 0);
  const phase = (wrapStep(step, s) + 0.5) / s;
  if (NOTE_DIRECTION > 0) return wrap01(phase - NOTE_ZERO_OFFSET01);
  return wrap01(1 - (phase - NOTE_ZERO_OFFSET01));
}

export function stepToBoundaryTheta01(step, steps = NOTE_STEPS) {
  const s = Math.max(1, steps | 0);
  const phase = wrapStep(step, s) / s;
  if (NOTE_DIRECTION > 0) return wrap01(phase - NOTE_ZERO_OFFSET01);
  return wrap01(1 - (phase - NOTE_ZERO_OFFSET01));
}

export function r01ToOctaveOffset(r01) {
  if (r01 < 0.33) return 12;
  if (r01 < 0.66) return 0;
  return -12;
}

export function midiToNoteName(midi) {
  const m = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[m % 12]}${octave}`;
}

export function quantizeWithHysteresis(theta01, steps, lastStep, margin = 0.18) {
  const s = Math.max(1, steps | 0);
  const x = clamp01(theta01) * s;
  if (lastStep == null || lastStep < 0) return Math.floor(x) % s;

  let d = x - (lastStep + 0.5);
  d = ((d + s / 2) % s) - s / 2;

  const keepZone = 0.5 - margin;
  if (Math.abs(d) <= keepZone) return wrapStep(lastStep, s);
  return wrapStep(lastStep + (d > 0 ? 1 : -1), s);
}

export function mapThetaRToNoteIntent({
  galaxyId,
  theta01,
  r01,
  timeMs = performance.now(),
  rootMidi = 60,
  inDisk = true,
  ...extra
}) {
  const t = wrap01(theta01);
  const r = clamp01(r01);
  const step = theta01ToStep(t, NOTE_STEPS);
  const degree = MAJOR_SCALE[step];
  const octaveOffset = r01ToOctaveOffset(r);
  const midi = rootMidi + octaveOffset + degree;
  const noteName = midiToNoteName(midi);

  return {
    galaxyId,
    noteName,
    midi,
    step,
    degree,
    theta01: t,
    r01: r,
    inDisk: !!inDisk,
    timeMs,
    ...extra,
  };
}
