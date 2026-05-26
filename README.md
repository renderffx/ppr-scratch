# ppr-scratch

[![CI](https://github.com/renderffx/ppr-scratch/actions/workflows/ci.yml/badge.svg)](https://github.com/renderffx/ppr-scratch/actions/workflows/ci.yml)

Next.js-style Partial Prerendering engine using React 19 Canary (`prerenderToNodeStream` / `resumeToPipeableStream`).

## Quick Start

```bash
npm install
npm run build
npm start
# http://localhost:3000
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Full pipeline: prereqs → clean → bundle → RSC flight → prerender |
| `npm start` | Start Express server on port 3000 |
| `npm run test` | Artifact contract tests |
| `npm run test:unit` | Unit tests (phase, dynamic-apis, flight-cache) |
| `npm run test:e2e` | End-to-end prerender→resume pipeline test |
| `npm run test:all` | All tests |
| `npm run dev:loop` | Build + all tests |
| `npm run clean` | Remove `dist/` |
| `npm run clean:cache` | Remove `.rsc_cache/` |
| `npm run prewarm` | Prewarm RSC cache entries |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves static prerendered shell HTML |
| GET | `/rsc-payload` | Raw RSC Flight v1 binary payload |
| GET | `/cache/:name` | Cached RSC entry by component name |
| POST | `/resume` | Resume postponed boundaries (JSON) |
| POST | `/resume/stream` | Resume boundaries as chunked HTML |
| GET | `/api/status` | Build status and artifact health |
| GET | `/api/manifest` | Raw build manifest |

Environment: `PORT` (default 3000), `PPR_RESUME_TIMEOUT` (default 10000ms).

## Architecture

### Build Pipeline

```
src/App.js ──esbuild──▶ dist/App.bundle.js
                            │
build-rsc.js                │
  └── react-server-dom-webpack ──▶ dist/rsc-payload.bin

build.js
  ├── setPhase('prerender')
  ├── prewarm-cache → .rsc_cache/*.bin
  ├── prerenderToNodeStream(App)
  │     └── dynamic components throw NEVER promise
  │     └── Suspense boundaries → postponed state
  │     └── onShellReady fires → abort(request) via patch
  │     └── resolves with {postponed, prelude}
  ├── prelude → dist/shell.html (<!--$?--> markers)
  ├── postponed JSON → dist/postponed.json
  ├── RSC payload embedded in shell </body>
  └── manifest → dist/manifest.json
```

### Request Pipeline

```
GET  /        → shell.html (instant, no JS required)
POST /resume  → resumeToPipeableStream(App, postponed)
               → pipes resumed content + $RC() swap scripts
POST /resume/stream → same, chunked HTML transfer
```

## React Patch

React's `prerenderToNodeStream` waits for all content (blocks on never-resolving promises). The `postinstall` script patches `onShellReady` from `void 0` to a function that calls `abort(request)`, which marks pending Suspense boundaries as real postponed state.

Targets: `node_modules/react-dom/cjs/react-dom-server.node.{production,development}.js`

Run manually: `node scripts/patch-react-dom.mjs`

## Project Structure

```
├── src/
│   ├── App.js            React app with static + dynamic boundaries
│   ├── phase.js          Prerender/request phase management
│   ├── dynamic-apis.js   Cookies, headers, searchParams (suspend during prerender)
│   ├── ErrorBoundary.js  Catch errors per boundary
│   ├── flight-cache.js   RSC Flight cache (memory + disk, TTL 5min)
│   └── cache-registry.js Component definitions for cache prewarming
├── scripts/
│   ├── patch-react-dom.mjs    React abort-on-shellReady patch
│   └── check-prereqs.mjs      Node/npm/patch validation
├── tests/
│   ├── ppr.test.js       Artifact contract tests
│   ├── unit.test.js      Unit tests (phase, dynamic-apis, flight-cache)
│   └── ppr-e2e.test.js   Prerender→resume end-to-end
├── server.js             Express server
├── build.js              PPR build orchestrator
├── build-rsc.js          RSC Flight payload builder
└── prewarm-cache.mjs     Cache prewarming
```

## Output Artifacts

| File | Contents |
|------|----------|
| `dist/shell.html` | Static HTML with `<!--$?-->` markers + embedded RSC payload |
| `dist/postponed.json` | React postponed state (resumableState, replayNodes) |
| `dist/rsc-payload.bin` | RSC Flight v1 binary protocol payload |
| `dist/manifest.json` | Build metadata (boundaries, cache entries, timestamps) |
| `.rsc_cache/*.bin` | Per-component RSC Flight cache entries |

## License

ISC &mdash; &copy; 2026 renderffx
