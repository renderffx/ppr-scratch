import { test } from 'node:test';
import assert from 'node:assert';
import { prerenderToNodeStream } from 'react-dom/static';
import { resumeToPipeableStream } from 'react-dom/server';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';
import { setPhase, PHASES } from '../src/phase.js';

const NEVER = new Promise(() => {});

function DynamicWidget({ name }) {
  if (globalThis.__pprPhase === 'prerender') throw NEVER;
  return createElement('div', null, `Hello ${name}!`);
}

function App() {
  return createElement('html', null,
    createElement('body', null,
      createElement('h1', null, 'Static Header'),
      createElement(Suspense, { fallback: createElement('div', null, 'Loading widget...') },
        createElement(DynamicWidget, { name: 'World' })
      ),
      createElement('footer', null, 'Footer')
    )
  );
}

async function collectStream(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const writable = new Writable({
      write(c, _, cb) { chunks.push(Buffer.from(c)); cb(); }
    });
    writable.on('finish', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    writable.on('error', reject);
    readable.pipe(writable);
  });
}

test('Full PPR Pipeline: prerender -> resume e2e', async (t) => {
  await t.test('Prerender produces shell with suspense boundaries and postponed state', async () => {
    setPhase(PHASES.PRERENDER);
    const result = await prerenderToNodeStream(createElement(App), { onError() {} });
    setPhase(undefined);

    assert.ok(result.postponed, 'Must have postponed state');
    assert.ok(Array.isArray(result.postponed.replayNodes), 'Must have replayNodes');
    assert.ok(result.postponed.replayNodes.length >= 1, 'Must have at least 1 replay node');

    const shellHtml = await collectStream(result.prelude);
    assert.ok(shellHtml.includes('Static Header'), 'Shell must contain static content');
    assert.ok(shellHtml.includes('Loading widget...'), 'Shell must contain fallback');
    assert.ok(shellHtml.includes('<!--$?-->'), 'Shell must have suspense markers');
    assert.ok(shellHtml.includes('Footer'), 'Shell must contain footer');
    assert.ok(!shellHtml.includes('Hello World'), 'Shell must NOT contain dynamic content');
  });

  await t.test('Resume produces replayed dynamic content', async () => {
    setPhase(PHASES.PRERENDER);
    const result = await prerenderToNodeStream(createElement(App), { onError() {} });
    setPhase(undefined);

    const resumedHtml = await new Promise((resolve, reject) => {
      const chunks = [];
      const streamable = resumeToPipeableStream(createElement(App), result.postponed, {
        onShellReady() {
          const writable = new Writable({
            write(c, _, cb) { chunks.push(Buffer.from(c)); cb(); }
          });
          writable.on('finish', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          writable.on('error', reject);
          streamable.pipe(writable);
        },
        onShellError(err) { reject(err); },
      });
    });

    assert.ok(resumedHtml.includes('Hello World'), 'Resumed content must include dynamic data');
    assert.ok(resumedHtml.includes('$RC('), 'Must include React swap scripts');
  });

  await t.test('Postponed state is JSON-serializable', async () => {
    setPhase(PHASES.PRERENDER);
    const result = await prerenderToNodeStream(createElement(App), { onError() {} });
    setPhase(undefined);

    const json = JSON.stringify(result.postponed);
    const parsed = JSON.parse(json);
    assert.ok(parsed.resumableState, 'resumableState survives JSON roundtrip');
    assert.ok(Array.isArray(parsed.replayNodes), 'replayNodes survives JSON roundtrip');
  });
});
