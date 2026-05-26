import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';

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
  console.log('Resolved!');
  console.log('Keys:', Object.keys(result));
  console.log('Has postponed:', 'postponed' in result, 'value:', result.postponed);

  const chunks = [];
  const writable = new Writable({
    write(chunk, _, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

  result.pipe(writable);

  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
  });

  const html = Buffer.concat(chunks).toString('utf-8');
  console.log('HTML length:', html.length);
  console.log('HTML sample:', html.slice(0, 500));
  console.log('Has $? marker:', html.includes('<!--$?-->'));
  console.log('Has $? marker:', html.includes('<!--$?-->'));
}

test().catch(e => {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
});
