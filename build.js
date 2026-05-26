import { createElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { Writable } from 'node:stream';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import App from './dist/App.bundle.js';
import { getCachedBuffer, cacheManifest } from './src/flight-cache.js';
import { setPhase, PHASES } from './src/phase.js';

setPhase('prerender');

function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function embedRSCPayload(html, payload) {
  const b64 = payload.toString('base64');
  const chunkSize = 8192;
  const chunks = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize));
  }
  const scriptTags = chunks.map((chunk, i) =>
    `<script>self.__rsc.push(${JSON.stringify(chunk)})</script>`
  ).join('\n');
  const rscScript = `<script>self.__rsc=[];\n${scriptTags}</script>`;
  return html.replace('</body>', `${rscScript}</body>`);
}

function embedCacheEntries(html) {
  const cached = ['CookieBasedGreeting', 'HeaderBasedContent', 'AsyncDataWidget', 'AuthBasedSection'];
  let result = html;
  for (const name of cached) {
    const buf = getCachedBuffer(name, {});
    if (buf) {
      const b64 = buf.toString('base64');
      result = result.replace('</body>',
        `<script>self.__rsc_${name}=${JSON.stringify(b64)};</script>\n</body>`
      );
    }
  }
  return result;
}

async function build() {
  execSync('node --conditions react-server prewarm-cache.mjs', { stdio: 'inherit' });
  console.log('');

  const result = await prerenderToNodeStream(
    createElement(App),
    { onError() {} }
  );

  const postponed = result.postponed;
  const chunks = [];
  const writable = new Writable({
    write(chunk, _, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

  result.prelude.pipe(writable);
  await new Promise((resolve) => writable.on('finish', resolve));

  let shellHtml = Buffer.concat(chunks).toString('utf-8');

  const rscPayload = existsSync('./dist/rsc-payload.bin')
    ? readFileSync('./dist/rsc-payload.bin')
    : null;

  if (rscPayload) {
    shellHtml = embedRSCPayload(shellHtml, rscPayload);
  }

  shellHtml = embedCacheEntries(shellHtml);

  mkdirSync('./dist', { recursive: true });
  atomicWrite('./dist/shell.html', shellHtml);
  atomicWrite('./dist/postponed.json', JSON.stringify(postponed, null, 2));

  const cacheEntries = cacheManifest();
  const manifest = {
    version: 1,
    buildTime: Date.now(),
    prerenderType: 'react-postponed',
    hasRSCPayload: !!rscPayload,
    rscPayloadSize: rscPayload ? rscPayload.length : 0,
    postponedCount: postponed
      ? (postponed.replayNodes?.length || 0) + (postponed.replaySlots ? 1 : 0)
      : 0,
    boundaries: postponed?.replayNodes?.map((n, i) => ({
      component: `Boundary_${i}`,
      reason: 'Dynamic boundary suspended during prerender',
      props: { replayed: true },
    })) || [],
    rscProtocol: 'flight-v1',
    reactVersion: '19.3.0-canary',
    cacheEntries: cacheEntries,
  };
  atomicWrite('./dist/manifest.json', JSON.stringify(manifest, null, 2));

  console.log(`PPR build complete:`);
  console.log(`  shell.html: ${Buffer.byteLength(shellHtml, 'utf-8')} bytes`);
  console.log(`  rsc-payload.bin: ${rscPayload ? rscPayload.length : 0} bytes`);
  console.log(`  postponed.json: ${Buffer.byteLength(JSON.stringify(postponed), 'utf-8')} bytes`);
  console.log(`  manifest.json: written`);
  console.log(`  has postponed state: ${!!postponed}`);
  console.log(`  cache entries: ${cacheEntries.length}`);

  setPhase(undefined);
}

build()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
