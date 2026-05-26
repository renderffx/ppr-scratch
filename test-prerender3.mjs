import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';

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
  const resolved = await prerenderToNodeStream(createElement(App));
  console.log('type:', typeof resolved);
  console.log('keys:', Object.keys(resolved));
  console.log('has pipe:', typeof resolved.pipe);
  console.log('has abort:', typeof resolved.abort);
  console.log('has postponed:', 'postponed' in resolved);
  console.log('postponed:', resolved.postponed);
  console.log('postponed type:', typeof resolved.postponed);
  if (resolved.postponed) {
    console.log('postponed keys:', Object.keys(resolved.postponed));
  }

  const chunks = [];
  const { Writable } = await import('node:stream');
  const writable = new Writable({
    write(chunk, _, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

  resolved.pipe(writable);

  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
  });

  const html = Buffer.concat(chunks).toString('utf-8');
  console.log('HTML length:', html.length);
  console.log('HTML:', html);
  console.log('Has $? marker:', html.includes('<!--$?-->'));
  console.log('Has $? marker:', html.includes('<!--$?-->'));
}

main().catch(console.error);
