import { resumeToPipeableStream } from 'react-dom/server';
import { createElement, Suspense } from 'react';
import { Writable } from 'node:stream';

function DynamicContent() {
  return createElement('div', null, 'Hello from resumed content!');
}

function App() {
  return createElement('html', null,
    createElement('body', null,
      createElement('h1', null, 'Static Shell'),
      createElement(Suspense, { fallback: createElement('div', null, 'Loading...') },
        createElement(DynamicContent, null)
      ),
      createElement('footer', null, 'Static Footer')
    )
  );
}

async function test() {
  console.log('Testing resumeToPipeableStream...');
  
  // Try with null/undefined postponed state
  try {
    const result = resumeToPipeableStream(createElement(App), null);
    console.log('Resume result type:', typeof result);
    console.log('Resume result keys:', Object.keys(result));
    console.log('has pipe:', typeof result.pipe);
    
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
    console.log('HTML:', html);
  } catch (e) {
    console.log('Error with null:', e.message);
  }
}

test().catch(console.error);
