import { isPrerender } from './phase.js';

const NEVER = new Promise(() => {});

export function setRequestContext(ctx) {
  globalThis.__pprRequest = ctx;
}

export function getRequestContext() {
  return globalThis.__pprRequest || null;
}

export function suspendIfPrerendering() {
  if (isPrerender()) {
    throw NEVER;
  }
}

export function cookies(request) {
  if (isPrerender()) {
    throw NEVER;
  }
  const r = request || getRequestContext();
  return parseCookies(r);
}

export function headers(request) {
  if (isPrerender()) {
    throw NEVER;
  }
  const r = request || getRequestContext();
  if (!r) return {};
  if (r.headers && typeof r.headers.entries === 'function') {
    return Object.fromEntries(r.headers.entries());
  }
  if (r.headers && typeof r.headers.get === 'function') {
    const result = {};
    const h = r.headers;
    for (const key of ['cookie', 'user-agent', 'authorization', 'accept', 'referer']) {
      const val = h.get(key);
      if (val) result[key] = val;
    }
    return result;
  }
  return r.headers || {};
}

export function searchParams(url) {
  if (isPrerender()) {
    throw NEVER;
  }
  const u = url || '';
  const parsed = new URL(u, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
}

export function dynamicFetch(url, options = {}) {
  if (isPrerender()) {
    throw NEVER;
  }
  return fetch(url, options).then(r => {
    if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
    return r.json();
  });
}

function parseCookies(request) {
  if (!request) return {};
  const cookieHeader = request.headers?.get?.('cookie')
    || request.headers?.cookie
    || '';
  const result = {};
  for (const pair of cookieHeader.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) result[key.trim()] = rest.join('=');
  }
  return result;
}
