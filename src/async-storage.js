import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const PHASES = {
  PRERENDER: 'prerender',
  REQUEST: 'request',
};

export function runWithPhase(phase, fn) {
  globalThis.__pprPhase = phase;
  return storage.run({ phase }, fn);
}

export function getPhase() {
  if (globalThis.__pprPhase) return globalThis.__pprPhase;
  const store = storage.getStore();
  return store ? store.phase : PHASES.REQUEST;
}

export function isPrerender() {
  return getPhase() === PHASES.PRERENDER;
}
