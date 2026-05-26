import { createElement } from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { Writable } from 'node:stream';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import App from './dist/App.bundle.js';
import { getCachedBuffer, cacheManifest } from './src/flight-cache.js';
import { setPhase, PHASES } from './src/phase.js';

setPhase('prerender');

function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function verifyPatch() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const prodFile = resolve(__dirname, 'node_modules/react-dom/cjs/react-dom-server.node.production.js');
  const devFile = resolve(__dirname, 'node_modules/react-dom/cjs/react-dom-server.node.development.js');

  for (const file of [prodFile, devFile]) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    if (!content.includes('abort(request)')) {
      throw new Error(
        `React DOM patch not applied: ${file}\n` +
        `Run "node scripts/patch-react-dom.mjs" or "npm run postinstall"`
      );
    }
  }
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

async function embedCacheEntries(html) {
  const cached = ['CookieBasedGreeting', 'HeaderBasedContent', 'AsyncDataWidget', 'AuthBasedSection'];
  let result = html;
  for (const name of cached) {
    const buf = await getCachedBuffer(name, {});
    if (buf) {
      const b64 = buf.toString('base64');
      result = result.replace('</body>',
        `<script>self.__rsc_${name}=${JSON.stringify(b64)};</script>\n</body>`
      );
    }
  }
  return result;
}

function embedClientBootstrap(html) {
  const script = `<script>function $RC(a,b){var c=document.getElementById(a),d=document.getElementById(b);if(c&&d){var e=d.querySelector('template[data-type]');if(e){var f=e.content.cloneNode(!0);c.parentNode.replaceChild(f,c)}else d.removeAttribute('hidden'),c.replaceWith(d)}}function $RS(a,b){var c=document.getElementById(a);c&&c.removeAttribute('hidden')}
self.__rsc=[];(function(){var p=self.__rsc;self.__rsc={push:function(c){var s=document.createElement('script');s.type='application/json';s.textContent=c;document.body.appendChild(s)}};for(var i=0;i<p.length;i++)self.__rsc.push(p[i])})();</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

function validateShell(html) {
  const errors = [];
  if (!html.startsWith('<!DOCTYPE html>')) errors.push('Missing DOCTYPE');
  if (!html.includes('</html>')) errors.push('Missing closing html tag');
  if (!/<!--\$?\??-->/.test(html)) errors.push('Missing Suspense boundary markers');

  if (errors.length > 0) {
    console.warn(`  [WARN] Shell validation issues:\n    - ${errors.join('\n    - ')}`);
  }
  return errors.length === 0;
}

async function build() {
  console.log('PPR build starting...\n');

  verifyPatch();
  console.log('  [OK]   React DOM patch verified\n');

  if (!existsSync('./dist/App.bundle.js')) {
    throw new Error('dist/App.bundle.js not found. Run: npm run bundle');
  }
  if (!existsSync('./dist/rsc-payload.bin')) {
    throw new Error('dist/rsc-payload.bin not found. Run: npm run build:rsc');
  }

  execSync('node --conditions react-server prewarm-cache.mjs', { stdio: 'inherit' });
  console.log('');

  const prerenderErrors = [];
  const result = await prerenderToNodeStream(
    createElement(App),
    {
      onError(err) {
        prerenderErrors.push(err);
        console.error('  [PRERENDER ERROR]', err?.message || err);
      },
    }
  );

  const postponed = result.postponed;
  if (!postponed) {
    throw new Error('Prerender produced no postponed state — no Suspense boundaries were suspended');
  }

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

  validateShell(shellHtml);

  const rscPayload = existsSync('./dist/rsc-payload.bin')
    ? readFileSync('./dist/rsc-payload.bin')
    : null;

  if (rscPayload) {
    shellHtml = embedRSCPayload(shellHtml, rscPayload);
  }

  shellHtml = await embedCacheEntries(shellHtml);
  shellHtml = embedClientBootstrap(shellHtml);

  mkdirSync('./dist', { recursive: true });
  atomicWrite('./dist/shell.html', shellHtml);
  atomicWrite('./dist/postponed.json', JSON.stringify(postponed, null, 2));

  const cacheEntries = await cacheManifest();
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

  console.log(`\nPPR build complete:`);
  console.log(`  shell.html: ${Buffer.byteLength(shellHtml, 'utf-8')} bytes`);
  console.log(`  rsc-payload.bin: ${rscPayload ? rscPayload.length : 0} bytes`);
  console.log(`  postponed.json: ${Buffer.byteLength(JSON.stringify(postponed), 'utf-8')} bytes`);
  console.log(`  manifest.json: written`);
  console.log(`  has postponed state: ${!!postponed}`);
  console.log(`  cache entries: ${cacheEntries.length}`);
  if (prerenderErrors.length > 0) {
    console.log(`  prerender errors: ${prerenderErrors.length}`);
  }

  setPhase(undefined);
}

build()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nBuild failed:', err);
    process.exit(1);
  });
