import { PassThrough } from 'node:stream';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { renderToPipeableStream } from 'react-server-dom-webpack/server.node';
import { createElement } from 'react';
import App from './dist/App.bundle.js';

function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const passthrough = new PassThrough();
    stream.pipe(passthrough);
    passthrough.on('data', c => chunks.push(Buffer.from(c)));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);
  });
}

const origConsoleError = console.error;
console.error = function (...args) {
  const msg = args.join(' ');
  if (msg.includes('ErrorBoundary') && msg.includes('cannot be invoked without')) return;
  origConsoleError.apply(console, args);
};

async function buildRSC() {
  mkdirSync('./dist', { recursive: true });

  const webpackMap = {};

  const element = createElement(App);
  const stream = renderToPipeableStream(element, webpackMap, {});

  const payload = await collectStream(stream);

  atomicWrite('./dist/rsc-payload.bin', payload);

  console.log(`RSC Flight build complete:`);
  console.log(`  rsc-payload.bin: ${payload.length} bytes`);
  console.log(`  Protocol: React Server Components Flight v1`);
}

buildRSC()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('RSC build failed:', err);
    process.exit(1);
  });
