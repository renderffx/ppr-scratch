import { isPrerender } from './async-storage.js';

const NEVER = new Promise(() => {});

globalThis.__pprPostponed = globalThis.__pprPostponed || [];

export function getPostponedList() {
  return globalThis.__pprPostponed;
}

export function resetPostponedList() {
  globalThis.__pprPostponed.length = 0;
}

export function __postponed(data) {
  if (globalThis.__pprPhase === 'prerender') {
    globalThis.__pprPostponed.push(data);
    throw NEVER;
  }
  return false;
}

export function suspendIfPrerendering() {
  if (globalThis.__pprPhase === 'prerender') {
    throw NEVER;
  }
}

export function cookies(request) {
  if (globalThis.__pprPhase === 'prerender') {
    throw NEVER;
  }
  return parseCookies(request);
}

export function headers(request) {
  if (globalThis.__pprPhase === 'prerender') {
    throw NEVER;
  }
  return Object.fromEntries(request.headers.entries());
}

export function searchParams(url) {
  if (globalThis.__pprPhase === 'prerender') {
    throw NEVER;
  }
  const parsed = new URL(url, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
}

export function dynamicFetch(url, options = {}) {
  if (globalThis.__pprPhase === 'prerender') {
    throw NEVER;
  }
  return fetch(url, options).then(r => r.json());
}

function parseCookies(request) {
  const cookieHeader = request?.headers?.get?.('cookie') || '';
  const result = {};
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) result[key] = rest.join('=');
  }
  return result;
}
