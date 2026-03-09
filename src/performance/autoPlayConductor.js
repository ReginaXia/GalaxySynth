import * as Tone from "tone";
import { MAJOR_SCALE, NOTE_STEPS, mapThetaRToNoteIntent, stepToCenterTheta01, wrapStep } from "../music/noteMapping.js";

const AUTO_ROLE_IDS = ["A_pad", "B_bell", "C_pluck", "D_sparkle", "E_air"];
const AUTO_CHORDS = [
  [0, 4, 7],   // C
  [9, 0, 4],   // Am
  [5, 9, 0],   // F
  [7, 11, 2],  // G
];

function semiToStep(semi) {
  const idx = MAJOR_SCALE.indexOf(((semi % 12) + 12) % 12);
  return idx >= 0 ? idx : 0;
}

export function createAutoPlayConductor({
  nebulaSystem,
  voices,
  audio,
  triggerBackgroundPulse,
  onEvent = null,
} = {}) {
  const state = {
    enabled: false,
    style: "dream", // dream | sparkle | calm
    tempo: 86,
    lastStepIndex: -1,
  };

  function setConfig({ enabled, style, tempo } = {}) {
    if (typeof enabled === "boolean") {
      state.enabled = enabled;
      if (enabled) state.lastStepIndex = -1;
    }
    if (typeof style === "string" && style.length) state.style = style;
    if (Number.isFinite(Number(tempo))) state.tempo = Math.max(60, Math.min(140, Number(tempo)));
  }

  function getConfig() {
    return { ...state };
  }

  function resolveGalaxy(roleIdx) {
    const fixedId = AUTO_ROLE_IDS[roleIdx];
    if (nebulaSystem?.getCluster?.(fixedId)) return fixedId;
    const list = nebulaSystem?.clusters ?? [];
    return list[roleIdx]?.id ?? list[0]?.id ?? null;
  }

  function triggerRole(galaxyId, step, r01, vel = 0.65, _dur = 0.18) {
    if (!galaxyId) return;
    const theta01 = stepToCenterTheta01(step, NOTE_STEPS);
    const intent = mapThetaRToNoteIntent({ galaxyId, theta01, r01, timeMs: performance.now() });
    const instrument = voices?.getNebulaInstrument?.(galaxyId);
    if (!instrument) return;
    audio?.playNebulaScratch?.({
      galaxyId,
      theta01: intent.theta01,
      r01: intent.r01,
      step: intent.step,
      degree: intent.degree,
      noteName: intent.noteName,
      midi: intent.midi,
      instrument,
      forceTrigger: true,
      disableHarmony: true,
      now: Tone.now(),
    });
    nebulaSystem?.triggerNotePulse?.({
      galaxyId,
      theta01: intent.theta01,
      strength: Math.max(0, Math.min(1, 0.55 + vel * 0.40)),
    });
    triggerBackgroundPulse?.(0.45);
    onEvent?.({
      galaxyId,
      theta01: intent.theta01,
      r01: intent.r01,
      step: intent.step,
      degree: intent.degree,
      velocity: vel,
      timeMs: performance.now(),
    });
  }

  function update(tSec, { pointerDown = false } = {}) {
    if (!state.enabled) return;
    const stepDur = (60 / Math.max(50, Math.min(160, state.tempo))) / 4; // 16th note
    const stepIndex = Math.floor(tSec / stepDur);
    if (stepIndex === state.lastStepIndex) return;
    state.lastStepIndex = stepIndex;

    const s16 = ((stepIndex % 16) + 16) % 16;
    const bar = Math.floor(stepIndex / 16);
    const chord = AUTO_CHORDS[((bar % AUTO_CHORDS.length) + AUTO_CHORDS.length) % AUTO_CHORDS.length];
    const chordSteps = chord.map(semiToStep);
    const root = chordSteps[0];

    const style = state.style;
    const styleVel = style === "sparkle" ? 0.76 : style === "calm" ? 0.58 : 0.66;
    const styleDurMul = style === "sparkle" ? 0.82 : style === "calm" ? 1.28 : 1.0;

    const gA = resolveGalaxy(0);
    const gB = resolveGalaxy(1);
    const gC = resolveGalaxy(2);
    const gD = resolveGalaxy(3);
    const gE = resolveGalaxy(4);

    if (s16 === 0 || s16 === 8) {
      const step = s16 === 0 ? root : chordSteps[1];
      triggerRole(gA, step, 0.82, styleVel * 0.74, 0.42 * styleDurMul);
    }

    if ((s16 & 1) === 0) {
      const motif = style === "calm"
        ? [0, 1, 2, 1, 0, 2, 1, 0]
        : style === "sparkle"
          ? [2, 3, 4, 3, 2, 5, 4, 3]
          : [1, 2, 3, 2, 1, 4, 3, 2];
      const k = motif[(s16 / 2) % motif.length];
      const step = wrapStep(root + k, NOTE_STEPS);
      triggerRole(gB, step, 0.22, styleVel * 0.96, 0.18 * styleDurMul);
    }

    {
      const arpIdx = [0, 1, 2, 1][s16 % 4];
      const step = chordSteps[arpIdx];
      triggerRole(gC, step, 0.38, styleVel * 0.84, 0.13 * styleDurMul);
    }

    if (s16 === 7 || s16 === 15 || (style === "sparkle" && (s16 === 3 || s16 === 11))) {
      const step = wrapStep(root + (style === "sparkle" ? 5 : 4), NOTE_STEPS);
      triggerRole(gD, step, 0.16, styleVel * 0.70, 0.11 * styleDurMul);
    }

    if (s16 === 4 || s16 === 12) {
      const step = wrapStep(root + (style === "calm" ? 2 : 3), NOTE_STEPS);
      triggerRole(gE, step, 0.28, styleVel * 0.78, 0.24 * styleDurMul);
    }
  }

  return {
    setConfig,
    getConfig,
    update,
  };
}
