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

  for (const [name, { createElement: elFactory }] of Object.entries(cachedComponents)) {
    const element = elFactory();
    const wrapped = createElement('div', { 'data-cache-key': name }, element);
    const stream = renderToPipeableStream(wrapped, webpackMap, {});
    const buf = await collectBuffer(stream);
    await writeCacheEntry(name, {}, buf);
    console.log(`  cached ${name}: ${buf.length} bytes`);
  }

  console.log(`RSC cache prewarm complete: ${Object.keys(cachedComponents).length} entries`);
}

prewarm()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cache prewarm failed:', err);
    process.exit(1);
  });
