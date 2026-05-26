import { prerenderToNodeStream } from 'react-dom/static';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';

const NEVER = new Promise(() => {});

function DynamicComponent({ name }) {
  throw NEVER;
}

// Use options with onShellReady/onAllReady callbacks
const options = {
  onShellReady() {
    console.log('onShellReady fired!');
  },
  onShellError(err) {
    console.log('onShellError:', err);
  },
  onAllReady() {
    console.log('onAllReady fired!');
  },
};

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
  console.log('Starting prerender with options...');
  try {
    const result = await prerenderToNodeStream(createElement(App), options);
    console.log('Resolved!');
    console.log('postponed:', result.postponed);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
