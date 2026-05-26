import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resumeToPipeableStream, renderToPipeableStream } from 'react-dom/server';
import { createElement } from 'react';
import { Writable } from 'node:stream';
import App from './dist/App.bundle.js';
import { getCachedBuffer } from './src/flight-cache.js';

const app = express();
const PORT = process.env.PORT || 3000;
const RESUME_TIMEOUT_MS = Math.max(1000, parseInt(process.env.PPR_RESUME_TIMEOUT || '10000', 10));

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static('./public', { index: false }));

const CACHED_NAMES = ['CookieBasedGreeting', 'HeaderBasedContent', 'AsyncDataWidget', 'AuthBasedSection'];
const VALID_CACHE_NAMES = new Set(CACHED_NAMES);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[m];
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

app.get('/', (req, res) => {
  const shellPath = './dist/shell.html';
  if (!existsSync(shellPath)) {
    return res.status(500).send('Build artifacts not found. Run: npm run build');
  }

  const shell = readFileSync(shellPath, 'utf-8');
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('X-PPR', 'static-shell');
  res.send(shell);
});

app.get('/rsc-payload', (req, res) => {
  const payloadPath = './dist/rsc-payload.bin';
  if (!existsSync(payloadPath)) {
    return res.status(404).json({ error: 'No RSC payload. Run build first.' });
  }

  const payload = readFileSync(payloadPath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-RSC-Protocol', 'flight-v1');
  res.setHeader('Content-Length', payload.length);
  res.send(payload);
});

app.get('/cache/:name', async (req, res) => {
  const { name } = req.params;
  if (!VALID_CACHE_NAMES.has(name)) {
    return res.status(400).json({ error: `Invalid cache name. Valid: ${CACHED_NAMES.join(', ')}` });
  }
  try {
    const buf = await getCachedBuffer(name, {});
    if (!buf) {
      return res.status(404).json({ error: `No cache entry for ${name}` });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Cache-Entry', name);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: `Cache read failed: ${err.message}` });
  }
});

function readPostponed(path) {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.resumableState || !Array.isArray(parsed.replayNodes)) {
    throw new Error('Invalid postponed state: missing resumableState or replayNodes');
  }
  return parsed;
}

app.post('/resume', async (req, res) => {
  const postponedPath = './dist/postponed.json';
  if (!existsSync(postponedPath)) {
    return res.status(400).json({ error: 'No postponed state available. Run build first.' });
  }

  try {
    const cacheChecks = await Promise.all(CACHED_NAMES.map(n => getCachedBuffer(n, {})));
    const hasCachedContent = cacheChecks.some(Boolean);

    if (hasCachedContent) {
      const resumedHtml = [];
      for (const name of CACHED_NAMES) {
        const buf = await getCachedBuffer(name, {});
        if (buf) {
          resumedHtml.push(
            `<div class="ppr-cached-boundary" data-component="${name}">` +
            `<h3>${escapeHtml(name)} <span class="badge">served from RSC cache</span></h3>` +
            `<p class="meta">Cached RSC Flight payload: ${buf.length} bytes</p>` +
            `<pre class="cache-key">Cache key: ${escapeHtml(name)}:{}</pre>` +
            `</div>`
          );
        }
      }
      return res.json({
        resumed: true,
        source: 'cache',
        boundaries: resumedHtml.length,
        html: resumedHtml.join('\n'),
        timestamp: Date.now(),
      });
    }

    const postponed = readPostponed(postponedPath);
    const chunks = [];

    const html = await withTimeout(new Promise((resolve, reject) => {
      const streamable = resumeToPipeableStream(createElement(App), postponed, {
        onShellReady() {
          const writable = new Writable({
            write(chunk, _, cb) {
              chunks.push(Buffer.from(chunk));
              cb();
            },
          });
          streamable.pipe(writable);
          writable.on('finish', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          writable.on('error', reject);
        },
        onShellError(err) {
          reject(err);
        },
      });
    }), RESUME_TIMEOUT_MS, 'Resume');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-PPR-Resume', 'true');
    res.json({
      resumed: true,
      source: 'resume',
      boundaries: 1,
      html,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/resume/stream', async (req, res) => {
  const postponedPath = './dist/postponed.json';
  if (!existsSync(postponedPath)) {
    return res.status(400).json({ error: 'No postponed state' });
  }

  res.setTimeout(RESUME_TIMEOUT_MS, () => {
    res.end(`<!--PPR_TIMEOUT-->Resume timed out after ${RESUME_TIMEOUT_MS}ms`);
  });

  try {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-PPR-Resume', 'true');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write('<!--PPR_RESUME_STREAM-->');

    const cacheChecks = await Promise.all(CACHED_NAMES.map(n => getCachedBuffer(n, {})));
    const hasCachedContent = cacheChecks.some(Boolean);

    if (hasCachedContent) {
      for (const name of CACHED_NAMES) {
        const buf = await getCachedBuffer(name, {});
        if (buf) {
          res.write(
            `<div class="streamed-boundary" data-component="${name}">` +
            `<h3>${escapeHtml(name)} (Streamed from RSC cache)</h3>` +
            `<p>RSC payload: ${buf.length} bytes</p>` +
            `<p class="meta">Served at: ${new Date().toISOString()}</p>` +
            `</div>`
          );
          await new Promise(r => setTimeout(r, 100));
        }
      }
    } else {
      const postponed = readPostponed(postponedPath);
      const streamable = resumeToPipeableStream(createElement(App), postponed, {
        onShellReady() {
          streamable.pipe(res);
        },
        onShellError(err) {
          res.end(`<!--PPR_ERROR-->${err.message}`);
        },
      });
      return;
    }

    res.write('<!--PPR_RESUME_STREAM_END-->');
    res.end();
  } catch (err) {
    try { res.status(500).json({ error: err.message }); } catch {}
  }
});

app.get('/api/status', (req, res) => {
  const shellExists = existsSync('./dist/shell.html');
  const postponedExists = existsSync('./dist/postponed.json');
  const manifestExists = existsSync('./dist/manifest.json');

  let manifest = null;
  if (manifestExists) {
    try {
      manifest = JSON.parse(readFileSync('./dist/manifest.json', 'utf-8'));
    } catch {}
  }

  res.json({
    status: shellExists && postponedExists ? 'ready' : 'not-built',
    artifacts: {
      shell: shellExists,
      postponed: postponedExists,
      manifest: manifestExists,
    },
    ppr: manifest ? {
      boundaries: manifest.postponedCount,
      buildTime: new Date(manifest.buildTime).toISOString(),
      prerenderType: manifest.prerenderType,
      hasRSCPayload: manifest.hasRSCPayload,
      cacheEntries: manifest.cacheEntries?.length || 0,
      components: manifest.boundaries?.map(b => b.component) || [],
    } : null,
  });
});

app.get('/api/manifest', (req, res) => {
  if (!existsSync('./dist/manifest.json')) {
    return res.status(404).json({ error: 'No manifest found. Run build first.' });
  }
  res.json(JSON.parse(readFileSync('./dist/manifest.json', 'utf-8')));
});

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`PPR server running on http://localhost:${PORT}`);
  console.log(`  GET  /                - Static shell`);
  console.log(`  GET  /rsc-payload      - Raw RSC Flight binary payload`);
  console.log(`  GET  /cache/:name      - Cached RSC entry by component name`);
  console.log(`  POST /resume           - Resume boundaries (from cache or resume)`);
  console.log(`  POST /resume/stream    - Stream resumed content`);
  console.log(`  GET  /api/status       - PPR system status`);
  console.log(`  GET  /api/manifest     - Build manifest`);
});
