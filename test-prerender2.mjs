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
  const result = prerenderToNodeStream(createElement(App));
  console.log('typeof result:', typeof result);
  console.log('result:', result);
  console.log('Object.keys(result):', Object.keys(result));
  console.log('result prototype:', Object.getPrototypeOf(result));
  
  // Maybe it's a promise?
  if (result && typeof result.then === 'function') {
    console.log('It is a promise/thenable!');
    const resolved = await result;
    console.log('resolved:', resolved);
    console.log('resolved keys:', Object.keys(resolved));
    console.log('resolved prototype:', Object.getPrototypeOf(resolved));
  }
}

main().catch(console.error);
