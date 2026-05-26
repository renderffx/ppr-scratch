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

async function main() {
  const result = prerenderToNodeStream(createElement(App));
  console.log('prerender result keys:', Object.keys(result));

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
  console.log('HTML:', html);
  console.log('HTML length:', html.length);
  console.log('Has $? marker:', html.includes('<!--$?-->'));
  console.log('Has postponed:', result.postponed !== null && result.postponed !== undefined);

  if (result.postponed) {
    console.log('Postponed type:', typeof result.postponed);
    console.log('Postponed is buffer:', Buffer.isBuffer(result.postponed));
    console.log('Postponed keys:', Object.keys(result.postponed));
    console.log('Postponed value:', result.postponed);
  }
}

main().catch(console.error);
