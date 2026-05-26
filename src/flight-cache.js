import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PassThrough } from 'node:stream';

const CACHE_DIR = path.resolve('./.rsc_cache');

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function makeCacheKey(componentName, props) {
  return crypto.createHash('md5')
    .update(componentName + ':' + JSON.stringify(props))
    .digest('hex');
}

export function cacheFilePath(componentName, props) {
  return path.join(CACHE_DIR, makeCacheKey(componentName, props) + '.bin');
}

export function getCachedBuffer(componentName, props) {
  const p = cacheFilePath(componentName, props);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  return null;
}

export function getCachedStream(componentName, props) {
  const buf = getCachedBuffer(componentName, props);
  if (!buf) return null;
  const s = new PassThrough();
  s.end(buf);
  return s;
}

export function writeCacheEntry(componentName, props, buffer) {
  ensureDir();
  const p = cacheFilePath(componentName, props);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, p);
}

export function invalidateCache(componentName, props) {
  const p = cacheFilePath(componentName, props);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function cacheManifest() {
  ensureDir();
  const entries = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.bin'));
  return entries.map(f => {
    const fullPath = path.join(CACHE_DIR, f);
    return {
      key: f.replace('.bin', ''),
      size: fs.statSync(fullPath).size,
      mtime: fs.statSync(fullPath).mtimeMs,
    };
  });
}
