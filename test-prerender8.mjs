import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';

const NEVER = new Promise(() => {});

function DynamicComponent({ name }) {
  throw NEVER;
}

function App() {
  return createElement('html', null,
    createElement('body', null,
      createElement('h1', null, 'Static Shell'),
      createElement(Suspense, { fallback: createElement('div', null, 'Loading...') },
        createElement(DynamicComponent, { name: 'CookieWidget' })
      ),
      createElement('footer', null, 'Static Footer')
    )
  );
}

async function test() {
  console.log('Starting prerender with async boundary...');
  const result = await prerenderToNodeStream(createElement(App));
  console.log('postponed:', result.postponed);
  console.log('postponed type:', typeof result.postponed);
  if (result.postponed) {
    console.log('postponed keys:', Object.keys(result.postponed));
    console.log('postponed value:', String(result.postponed).slice(0, 200));
    console.log('is Buffer:', Buffer.isBuffer(result.postponed));
  }

  const chunks = [];
  const writable = new Writable({
    write(chunk, _, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

  result.prelude.pipe(writable);

  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
  });

  const html = Buffer.concat(chunks).toString('utf-8');
  console.log('HTML length:', html.length);
  console.log('HTML:', html);
  console.log('Has $? marker:', html.includes('<!--$?-->'));
  console.log('Has $ marker:', html.includes('<!--$-->'));
}

test().catch(e => {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
});
