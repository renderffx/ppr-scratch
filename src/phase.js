export const PHASES = {
  PRERENDER: 'prerender',
  REQUEST: 'request',
};

export function setPhase(phase) {
  globalThis.__pprPhase = phase;
}

export function getPhase() {
  return globalThis.__pprPhase || PHASES.REQUEST;
}

export function isPrerender() {
  return getPhase() === PHASES.PRERENDER;
}

export function runWithPhase(phase, fn) {
  const prev = globalThis.__pprPhase;
  globalThis.__pprPhase = phase;
  try {
    return fn();
  } finally {
    globalThis.__pprPhase = prev;
  }
}
