import { shouldSwitchByHysteresis } from "./resolveNoteIntent.js";

function cloneIntent(intent) {
  return intent ? { ...intent } : null;
}

export function onPointerMove(state, currentIntent) {
  state.hoverIntent = cloneIntent(currentIntent);
  return state;
}

export function onPointerDown(state) {
  state.activeIntent = cloneIntent(state.hoverIntent);
  return state;
}

export function onPointerMovePressed(state, currentIntent, hysteresis = 0.18) {
  if (!state.activeIntent || !currentIntent) return state;
  if (shouldSwitchByHysteresis(state.activeIntent, currentIntent, hysteresis, 7)) {
    state.activeIntent = cloneIntent(currentIntent);
  }
  return state;
}

export function onPointerUp(state) {
  state.lastIntent = cloneIntent(state.activeIntent);
  state.activeIntent = null;
  return state;
}

