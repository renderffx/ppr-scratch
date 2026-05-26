import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = path.resolve('./.rsc_cache');
const TTL_MS = 5 * 60 * 1000;

const memoryCache = new Map();

function getFromMemory(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.buf;
}

function setInMemory(key, buf) {
  memoryCache.set(key, { buf, ts: Date.now() });
  if (memoryCache.size > 1000) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) memoryCache.delete(oldest[0]);
  }
}

function ensureDirSync() {
  if (!existsSync(CACHE_DIR)) {
    fsp.mkdir(CACHE_DIR, { recursive: true });
  }
}

async function ensureDir() {
  try {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // dir exists
  }
}

export function makeCacheKey(componentName, props) {
  return crypto.createHash('md5')
    .update(componentName + ':' + JSON.stringify(props))
    .digest('hex');
}

export function cacheFilePath(componentName, props) {
  return path.join(CACHE_DIR, makeCacheKey(componentName, props) + '.bin');
}

export async function getCachedBuffer(componentName, props) {
  const p = cacheFilePath(componentName, props);
  const memKey = p;

  const mem = getFromMemory(memKey);
  if (mem) return mem;

  try {
    const buf = await fsp.readFile(p);
    setInMemory(memKey, buf);
    return buf;
  } catch {
    return null;
  }
}

export async function getCachedStream(componentName, props) {
  const buf = await getCachedBuffer(componentName, props);
  if (!buf) return null;
  const { PassThrough } = await import('node:stream');
  const s = new PassThrough();
  s.end(buf);
  return s;
}

export async function writeCacheEntry(componentName, props, buffer) {
  await ensureDir();
  const p = cacheFilePath(componentName, props);
  const tmp = p + '.tmp';
  await fsp.writeFile(tmp, buffer);
  await fsp.rename(tmp, p);
  setInMemory(p, buffer);
}

export async function invalidateCache(componentName, props) {
  const p = cacheFilePath(componentName, props);
  const memKey = p;
  memoryCache.delete(memKey);
  try {
    await fsp.unlink(p);
  } catch {
    // not found
  }
}

export async function cacheManifest() {
  await ensureDir();
  let files;
  try {
    files = await fsp.readdir(CACHE_DIR);
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    if (!f.endsWith('.bin')) continue;
    const fullPath = path.join(CACHE_DIR, f);
    try {
      const stat = await fsp.stat(fullPath);
      entries.push({
        key: f.replace('.bin', ''),
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    } catch {
      // race: file deleted between readdir and stat
    }
  }
  return entries;
}
