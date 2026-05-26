# PPR Engine

Partial Prerendering engine matching Next.js PPR behavior using React 19 Canary.

## How It Works

### Build Phase (`npm run build`)

```
src/App.js  ──esbuild──▶  dist/App.bundle.js
                            │
build-rsc.js                │
  └── react-server-dom-webpack ──▶  dist/rsc-payload.bin (Flight v1)
                            │
build.js                    │
  ├── set globalThis.__pprPhase = 'prerender'
  ├── prerenderToNodeStream(App, { onError })
  │     └─ Components that call suspendIfPrerendering() throw NEVER promise
  │        → React detects suspended boundary → trackPostpone() called
  │     └─ Shell completes → onShellReady fires
  │     └─ abort(request) called → pending boundaries marked as postponed
  │     └─ onAllReady fires → resolved with {postponed, prelude}
  ├── prelude stream → dist/shell.html (with <!--$?--> markers)
  ├── postponed state (JSON) → dist/postponed.json
  └── manifest → dist/manifest.json
```

### Request Phase (`node server.js`)

```
GET  /            → serve dist/shell.html (static shell, instant)
POST /resume      → read postponed.json → resumeToPipeableStream(App, postponed)
                     → onShellReady → pipe stream → JSON {html: "<div hidden>S:0..." + $RC() scripts}
POST /resume/stream → same but chunked HTML transfer
```

## Key Difference from v1 (the real PPR change)

| Aspect | Before (simulation) | Now (real PPR) |
|--------|-------------------|----------------|
| **Prerender API** | `renderToPipeableStream` (SSR) | `prerenderToNodeStream` (react-dom/static) |
| **Postpone trigger** | `__postponed()` hook → manually injected `<!--$?-->` | Component throws NEVER promise → React's internal `trackPostpone()` |
| **Postponed state** | Custom PPRF binary format | Real React `{resumableState, replayNodes, rootFormatContext, ...}` |
| **Resume** | Hand-crafted HTML | `resumeToPipeableStream()` → React outputs `<div hidden>` + `$RC()` swap scripts |
| **Shell markers** | String-replaced `<!--$?-->` | Native React `<!--$?-->` from prerender |

### What was patched in React

`prerenderToNodeStream` in the public React canary resolves on `onAllReady` (waits for ALL content). This hangs if a component suspends with a never-resolving promise. The patch changes `onShellReady` from `void 0` to a function that calls `abort(request)`. Aborting pending tasks with `trackedPostpones` set causes React to mark them as real postponed state instead of waiting.

File patched: `node_modules/react-dom/cjs/react-dom-server.node.development.js`

```js
// Before:
void 0,           // onShellReady

// After:
function () {     // onShellReady
  abort(request);
},
```

## Components

Components call `suspendIfPrerendering()` at the top of their render function. During prerender (`globalThis.__pprPhase === 'prerender'`), this throws a NEVER promise → React suspends the boundary → boundary becomes postponed. During resume, the phase is not set, so components render normally.

```js
function CookieBasedGreeting() {
  suspendIfPrerendering();
  return <div>Hello, User!</div>;
}
```

## React 19 APIs Used

| API | Source | Use |
|-----|--------|-----|
| `prerenderToNodeStream` | `react-dom/static` | Build-time prerendering |
| `resumeToPipeableStream` | `react-dom/server` | Request-time resume of postponed content |
| `renderToPipeableStream` | `react-server-dom-webpack/server.node` | RSC Flight payload generation |
| `Suspense` | `react` | Defines dynamic boundary locations |

## Artifacts

| File | Contains |
|------|----------|
| `dist/shell.html` | Static HTML with `<!--$?-->` Suspense markers + embedded RSC payload |
| `dist/postponed.json` | React's internal postponed state (resumableState, replayNodes, rootFormatContext) |
| `dist/rsc-payload.bin` | RSC Flight v1 binary protocol payload |
| `dist/manifest.json` | Build metadata |

## CLI

```
npm run clean     # rm -rf dist/
npm run bundle    # esbuild JSX → dist/App.bundle.js
npm run build:rsc # RSC Flight payload
npm run build     # clean → bundle → build:rsc → prerender → atomic write
npm run test      # artifact contract tests
npm run test:e2e  # prerender→resume end-to-end tests
npm run test:all  # all tests
npm run dev:loop  # build + all tests
npm start         # serve (express)
```

## Server Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | shell.html (static HTML) |
| GET | `/rsc-payload` | Raw RSC Flight binary |
| POST | `/resume` | `{html: "...", resumed: true}` |
| POST | `/resume/stream` | Chunked HTML with resumed boundaries |
| GET | `/api/status` | Build status + artifact health |
| GET | `/api/manifest` | Raw build manifest |

## Resume Output Format

React's `resumeToPipeableStream` outputs:

```html
<div hidden id="S:0"><div class="dynamic-hole">...resumed content...</div></div>
<script>$RC("B:0","S:0")</script>
```

The client-side React runtime detects `<!--$?-->` markers in the shell, renders fallbacks, and on receiving `$RC()` scripts, swaps the hidden content into the shell holes.
