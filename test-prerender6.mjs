import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';

function StaticContent() {
  return createElement('div', null, 'I am static');
}

function App() {
  return createElement('html', null,
    createElement('body', null,
      createElement('h1', null, 'Static Shell'),
      createElement(Suspense, { fallback: createElement('div', null, 'Loading...') },
        createElement(StaticContent, null)
      ),
      createElement('footer', null, 'Static Footer')
    )
  );
}

async function test() {
  console.log('Starting prerender...');
  const result = await prerenderToNodeStream(createElement(App));
  console.log('Keys:', Object.keys(result));
  console.log('postponed:', result.postponed);
  console.log('prelude type:', typeof result.prelude);
  console.log('prelude constructor:', result.prelude?.constructor?.name);
  console.log('prelude prototype:', Object.getPrototypeOf(result.prelude)?.constructor?.name);
  
  // Check if it's iterable/async iterable
  console.log('prelude[Symbol.asyncIterator]:', typeof result.prelude?.[Symbol.asyncIterator]);
  console.log('prelude[Symbol.iterator]:', typeof result.prelude?.[Symbol.iterator]);
  console.log('prelude.pipe:', typeof result.prelude?.pipe);
  console.log('prelude.on:', typeof result.prelude?.on);
  
  // Try to get the prelude toString
  console.log('prelude toString:', String(result.prelude));
}

test().catch(e => {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
});
