import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';
import { Writable, Readable } from 'node:stream';

// Simple component that doesn't throw
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
  console.log('prelude is ReadableStream:', result.prelude instanceof ReadableStream);

  // prelude might be a ReadableStream (Web API)
  const reader = result.prelude.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  const html = chunks.map(c => decoder.decode(c, { stream: true })).join('');
  console.log('HTML length:', html.length);
  console.log('HTML sample:', html.slice(0, 1000));
  console.log('Has $? marker:', html.includes('<!--$?-->'));
}

test().catch(e => {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
});
