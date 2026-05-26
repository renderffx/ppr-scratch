import { isPrerender } from './phase.js';

const NEVER = new Promise(() => {});

export function suspendIfPrerendering() {
  if (isPrerender()) {
    throw NEVER;
  }
}

export function cookies(request) {
  if (isPrerender()) {
    throw NEVER;
  }
  return parseCookies(request);
}

export function headers(request) {
  if (isPrerender()) {
    throw NEVER;
  }
  return Object.fromEntries(request.headers.entries());
}

export function searchParams(url) {
  if (isPrerender()) {
    throw NEVER;
  }
  const parsed = new URL(url, 'http://localhost');
  return Object.fromEntries(parsed.searchParams.entries());
}

export function dynamicFetch(url, options = {}) {
  if (isPrerender()) {
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
