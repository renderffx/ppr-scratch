import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resumeToPipeableStream } from 'react-dom/server';
import { createElement } from 'react';
import { Writable } from 'node:stream';
import App from './dist/App.bundle.js';
import { getCachedBuffer } from './src/flight-cache.js';
import { setRequestContext } from './src/dynamic-apis.js';

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

    setRequestContext(req);
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
    setRequestContext(null);

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
      setRequestContext(req);
      const streamable = resumeToPipeableStream(createElement(App), postponed, {
        onShellReady() {
          streamable.pipe(res);
        },
        onShellError(err) {
          setRequestContext(null);
          res.end(`<!--PPR_ERROR-->${err.message}`);
        },
      });
      streamable.on('end', () => setRequestContext(null));
      return;
    }

    res.write('<!--PPR_RESUME_STREAM_END-->');
    res.end();
  } catch (err) {
    setRequestContext(null);
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

app.get('/live', (req, res) => {
  const shellPath = './dist/shell.html';
  if (!existsSync(shellPath)) {
    return res.status(500).send('Build artifacts not found. Run: npm run build');
  }

  const cookies = req.headers?.cookie || '';
  const c = {};
  for (const pair of cookies.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) c[k.trim()] = v.join('=');
  }
  const userName = c.user || c.username || 'Guest';
  const greeting = c.greeting || 'Hello';
  const role = c.role || 'viewer';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PPR Live Demo</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;line-height:1.6;padding:2rem}
h1{font-size:1.8rem;margin-bottom:.25rem}
.sub{color:#8b949e;margin-bottom:2rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;min-height:200px}
.card h3{margin-bottom:.5rem;font-size:1rem;color:#f0e6d0}
.card .content{font-size:.85rem;color:#8b949e}
.card .content .loaded{color:#e6edf3}
.tag{display:inline-block;font-size:.7rem;padding:2px 10px;border-radius:999px;margin-bottom:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.tag-shell{background:#1f6feb;color:#fff}
.tag-resume{background:#238636;color:#fff}
.meta{color:#484f58;font-size:.8rem;margin-top:.5rem;font-family:monospace}
pre{background:#1c2128;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.8rem;border:1px solid #30363d;margin-top:.5rem;color:#f0e6d0}
button{background:#238636;color:#fff;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.9rem;margin-top:1rem}
button:hover{background:#2ea043}
button:disabled{opacity:.5;cursor:default}
.loading{color:#8b949e;font-style:italic}
.error{color:#da3633}
.cookie-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.cookie-card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:1rem;text-align:center}
.cookie-card .label{color:#8b949e;font-size:.8rem;margin-bottom:.25rem}
.cookie-card .value{color:#f0e6d0;font-size:1.1rem;font-weight:600}
.cookie-card .hint{color:#484f58;font-size:.75rem;margin-top:.5rem}
a{color:#58a6ff}
.nav{margin-bottom:2rem;display:flex;gap:1rem}
.nav a{color:#8b949e;text-decoration:none;font-size:.9rem}
.nav a:hover{color:#58a6ff}
</style>
</head>
<body>
<div class="nav">
  <a href="/">Home</a>
  <a href="/live">Live Demo</a>
  <a href="/debug">Debug</a>
</div>
<h1>PPR Live Demo</h1>
<p class="sub">Set cookies via <code>curl -b "user=alice;greeting=Hey;role=admin" http://localhost:3000/live</code> or use the form below.</p>

<h3 style="margin-bottom:.75rem;color:#f0e6d0">Your Request Data</h3>
<div class="cookie-grid">
  <div class="cookie-card"><div class="label">user</div><div class="value">${escapeHtml(userName)}</div><div class="hint">Cookie: user</div></div>
  <div class="cookie-card"><div class="label">greeting</div><div class="value">${escapeHtml(greeting)}</div><div class="hint">Cookie: greeting</div></div>
  <div class="cookie-card"><div class="label">role</div><div class="value">${escapeHtml(role)}</div><div class="hint">Cookie: role</div></div>
  <div class="cookie-card"><div class="label">User-Agent</div><div class="value" style="font-size:.8rem">${escapeHtml((req.headers['user-agent'] || 'unknown').slice(0, 50))}</div><div class="hint">Header</div></div>
</div>

<div class="grid">
  <div class="card">
    <div class="tag tag-shell">Static Shell</div>
    <h3>Prerendered at build time</h3>
    <div class="content" id="shell-output">
      <div class="loading">Loading shell...</div>
    </div>
    <div class="meta" id="shell-meta"></div>
  </div>
  <div class="card">
    <div class="tag tag-resume">Resumed at request time</div>
    <h3>Live from your request data</h3>
    <div class="content" id="resume-output">
      <div class="loading">Waiting for resume...</div>
    </div>
    <div class="meta" id="resume-meta"></div>
    <button id="btn-resume" onclick="runResume()">Run Resume</button>
  </div>
</div>

<pre id="raw-output" style="display:none"></pre>
<p style="color:#484f58;font-size:.85rem"><a href="#" onclick="document.getElementById('raw-output').style.display=document.getElementById('raw-output').style.display==='none'?'block':'none';return false">Show raw resume JSON</a></p>

<script>
async function runResume() {
  const btn = document.getElementById('btn-resume');
  btn.disabled = true;
  btn.textContent = 'Resuming...';
  document.getElementById('resume-output').innerHTML = '<div class="loading">Resuming postponed boundaries...</div>';
  document.getElementById('resume-meta').textContent = '';

  try {
    const r = await fetch('/resume', { method: 'POST' });
    const data = await r.json();
    document.getElementById('resume-output').innerHTML = data.html || '<div class="error">No resumed content</div>';
    document.getElementById('resume-meta').textContent = 'source: ' + data.source + ' | boundaries: ' + data.boundaries + ' | ts: ' + new Date(data.timestamp).toLocaleTimeString();
    document.getElementById('raw-output').textContent = JSON.stringify(data, null, 2);
  } catch(e) {
    document.getElementById('resume-output').innerHTML = '<div class="error">Resume failed: ' + e.message + '</div>';
  }
  btn.disabled = false;
  btn.textContent = 'Run Resume';
}

(async function() {
  try {
    const r = await fetch('/');
    const html = await r.text();
    const excerpt = html.length > 800 ? html.slice(0, 800) + '...<a href="/" style="color:#58a6ff">(full page)</a>' : html;
    document.getElementById('shell-output').innerHTML = '<div class="loaded">' + excerpt + '</div>';
    document.getElementById('shell-meta').textContent = html.length + ' bytes | ' + (html.match(/\\$\\?/g) || []).length + ' suspense markers';
  } catch(e) {
    document.getElementById('shell-output').innerHTML = '<div class="error">Failed: ' + e.message + '</div>';
  }
})();
</script>
</body>
</html>`);
});

app.get('/debug', (req, res) => {
  const shellPath = './dist/shell.html';
  const postponedPath = './dist/postponed.json';
  const manifestPath = './dist/manifest.json';

  const shell = existsSync(shellPath) ? readFileSync(shellPath, 'utf-8') : null;
  const postponed = existsSync(postponedPath) ? JSON.parse(readFileSync(postponedPath, 'utf-8')) : null;
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : null;

  const shellMeta = shell ? {
    bytes: Buffer.byteLength(shell, 'utf-8'),
    hasDoctype: shell.startsWith('<!DOCTYPE html>'),
    suspenseMarkers: (shell.match(/<!--\$?\??-->/g) || []).length,
    hasRSCScripts: shell.includes('self.__rsc'),
    hasBootstrap: shell.includes('$RC'),
    boundaries: (shell.match(/data-ppr="[^"]+"/g) || []).map(m => m.replace(/data-ppr="/, '').replace(/"$/, '')),
  } : null;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PPR Debug</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;line-height:1.6;padding:2rem}
h1{font-size:1.8rem;margin-bottom:.25rem}
.sub{color:#8b949e;margin-bottom:2rem}
.section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;margin-bottom:1rem}
.section h3{color:#f0e6d0;margin-bottom:.75rem;font-size:1rem}
.row{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #21262d;font-size:.85rem}
.row:last-child{border-bottom:none}
.row .key{color:#8b949e}
.row .val{color:#e6edf3;font-family:monospace;font-size:.8rem}
pre{background:#1c2128;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.8rem;border:1px solid #30363d;margin-top:.5rem;color:#f0e6d0;max-height:400px}
.badge{display:inline-block;font-size:.7rem;padding:2px 10px;border-radius:999px;margin-left:.5rem;font-weight:600}
.badge-ok{background:#238636;color:#fff}
.badge-miss{background:#484f58;color:#fff}
.nav{margin-bottom:2rem;display:flex;gap:1rem}
.nav a{color:#8b949e;text-decoration:none;font-size:.9rem}
.nav a:hover{color:#58a6ff}
</style>
</head>
<body>
<div class="nav">
  <a href="/">Home</a>
  <a href="/live">Live Demo</a>
  <a href="/debug">Debug</a>
</div>
<h1>PPR Debug</h1>
<p class="sub">Full internal system state</p>

<div class="section">
  <h3>Build Artifacts</h3>
  <div class="row"><span class="key">shell.html</span><span class="val">${shell ? shellMeta.bytes + ' bytes' : 'missing'} <span class="badge ${shell ? 'badge-ok' : 'badge-miss'}">${shell ? 'OK' : 'MISS'}</span></span></div>
  <div class="row"><span class="key">postponed.json</span><span class="val">${postponed ? Buffer.byteLength(JSON.stringify(postponed), 'utf-8') + ' bytes' : 'missing'} <span class="badge ${postponed ? 'badge-ok' : 'badge-miss'}">${postponed ? 'OK' : 'MISS'}</span></span></div>
  <div class="row"><span class="key">manifest.json</span><span class="val">${manifest ? 'present' : 'missing'} <span class="badge ${manifest ? 'badge-ok' : 'badge-miss'}">${manifest ? 'OK' : 'MISS'}</span></span></div>
</div>

${shellMeta ? `
<div class="section">
  <h3>Shell Analysis</h3>
  <div class="row"><span class="key">DOCTYPE</span><span class="val">${shellMeta.hasDoctype}</span></div>
  <div class="row"><span class="key">Suspense markers</span><span class="val">${shellMeta.suspenseMarkers}</span></div>
  <div class="row"><span class="key">RSC scripts</span><span class="val">${shellMeta.hasRSCScripts}</span></div>
  <div class="row"><span class="key">Client bootstrap (RC)</span><span class="val">${shellMeta.hasBootstrap}</span></div>
  <div class="row"><span class="key">PPR boundaries</span><span class="val">${shellMeta.boundaries.join(', ') || 'none'}</span></div>
</div>
` : ''}

${postponed ? `
<div class="section">
  <h3>Postponed State</h3>
  <div class="row"><span class="key">resumableState</span><span class="val">${typeof postponed.resumableState}</span></div>
  <div class="row"><span class="key">rootFormatContext</span><span class="val">${typeof postponed.rootFormatContext}</span></div>
  <div class="row"><span class="key">nextSegmentId</span><span class="val">${postponed.nextSegmentId}</span></div>
  <div class="row"><span class="key">progressiveChunkSize</span><span class="val">${postponed.progressiveChunkSize}</span></div>
  <div class="row"><span class="key">replayNodes</span><span class="val">${postponed.replayNodes?.length || 0} nodes</span></div>
</div>
` : ''}

${manifest ? `
<div class="section">
  <h3>Manifest</h3>
  <div class="row"><span class="key">buildTime</span><span class="val">${new Date(manifest.buildTime).toISOString()}</span></div>
  <div class="row"><span class="key">prerenderType</span><span class="val">${manifest.prerenderType}</span></div>
  <div class="row"><span class="key">postponedCount</span><span class="val">${manifest.postponedCount}</span></div>
  <div class="row"><span class="key">rscPayloadSize</span><span class="val">${manifest.rscPayloadSize} bytes</span></div>
  <div class="row"><span class="key">cacheEntries</span><span class="val">${manifest.cacheEntries?.length || 0}</span></div>
  <div class="row"><span class="key">reactVersion</span><span class="val">${manifest.reactVersion}</span></div>
</div>

<div class="section">
  <h3>Cache Entries</h3>
  ${(manifest.cacheEntries || []).map(e =>
    '<div class="row"><span class="key">' + e.key + '</span><span class="val">' + e.size + ' bytes</span></div>'
  ).join('') || '<div class="row"><span class="key">none</span><span class="val">-</span></div>'}
</div>

<div class="section">
  <h3>Boundaries</h3>
  ${(manifest.boundaries || []).map(b =>
    '<div class="row"><span class="key">' + escapeHtml(b.component) + '</span><span class="val">' + escapeHtml(b.reason) + '</span></div>'
  ).join('') || '<div class="row"><span class="key">none</span><span class="val">-</span></div>'}
</div>
` : ''}

<div class="section">
  <h3>Raw Data</h3>
  <div style="margin-bottom:.5rem">
    <button onclick="show('shell')" style="background:#1f6feb;color:#fff;border:none;padding:.4rem .8rem;border-radius:4px;cursor:pointer;font-size:.8rem;margin-right:.5rem">Shell</button>
    <button onclick="show('postponed')" style="background:#8957e5;color:#fff;border:none;padding:.4rem .8rem;border-radius:4px;cursor:pointer;font-size:.8rem;margin-right:.5rem">Postponed</button>
    <button onclick="show('manifest')" style="background:#238636;color:#fff;border:none;padding:.4rem .8rem;border-radius:4px;cursor:pointer;font-size:.8rem">Manifest</button>
  </div>
  <pre id="raw-shell" style="display:none">${escapeHtml((shell || 'missing').slice(0, 3000))}</pre>
  <pre id="raw-postponed" style="display:none">${escapeHtml(JSON.stringify(postponed, null, 2) || 'missing')}</pre>
  <pre id="raw-manifest" style="display:none">${escapeHtml(JSON.stringify(manifest, null, 2) || 'missing')}</pre>
</div>

<script>
function show(type) {
  document.getElementById('raw-shell').style.display = type === 'shell' ? 'block' : 'none';
  document.getElementById('raw-postponed').style.display = type === 'postponed' ? 'block' : 'none';
  document.getElementById('raw-manifest').style.display = type === 'manifest' ? 'block' : 'none';
}
</script>
</body>
</html>`);
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
  console.log(`  GET  /live             - Live PPR demo with request data`);
  console.log(`  GET  /debug            - Full PPR system debug state`);
  console.log(`  GET  /rsc-payload      - Raw RSC Flight binary payload`);
  console.log(`  GET  /cache/:name      - Cached RSC entry by component name`);
  console.log(`  POST /resume           - Resume boundaries (from cache or resume)`);
  console.log(`  POST /resume/stream    - Stream resumed content`);
  console.log(`  GET  /api/status       - PPR system status`);
  console.log(`  GET  /api/manifest     - Build manifest`);
});
