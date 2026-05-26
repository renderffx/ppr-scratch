import { createElement } from 'react';
import { renderToPipeableStream } from 'react-server-dom-webpack/server.node';
import { PassThrough } from 'node:stream';
import { mkdirSync } from 'node:fs';
import { cachedComponents } from './src/cache-registry.js';
import { writeCacheEntry } from './src/flight-cache.js';

function collectBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pt = new PassThrough();
    stream.pipe(pt);
    pt.on('data', c => chunks.push(Buffer.from(c)));
    pt.on('end', () => resolve(Buffer.concat(chunks)));
    pt.on('error', reject);
  });
}

async function prewarm() {
  mkdirSync('./.rsc_cache', { recursive: true });
  const webpackMap = {};
  let cached = 0;
  let failed = 0;

  for (const [name, { createElement: elFactory }] of Object.entries(cachedComponents)) {
    try {
      const element = elFactory();
      const wrapped = createElement('div', { 'data-cache-key': name }, element);
      const stream = renderToPipeableStream(wrapped, webpackMap, {});
      const buf = await collectBuffer(stream);
      await writeCacheEntry(name, {}, buf);
      console.log(`  cached ${name}: ${buf.length} bytes`);
      cached++;
    } catch (err) {
      console.error(`  [WARN] failed to cache ${name}: ${err.message}`);
      failed++;
    }
  }

  const total = Object.keys(cachedComponents).length;
  console.log(`RSC cache prewarm: ${cached}/${total} entries cached${failed > 0 ? `, ${failed} failed` : ''}`);
  if (cached === 0) {
    throw new Error('All cache entries failed to prewarm');
  }
}

prewarm()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cache prewarm failed:', err);
    process.exit(1);
  });
