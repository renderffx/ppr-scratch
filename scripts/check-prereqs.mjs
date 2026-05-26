import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let ok = true;

function check(label, condition, hint) {
  if (!condition) {
    console.error(`  [FAIL] ${label}`);
    if (hint) console.error(`         ${hint}`);
    ok = false;
  } else {
    console.log(`  [OK]   ${label}`);
  }
}

console.log('Checking build prerequisites...\n');

check('Node.js >= 22', process.versions.node >= '22', 'Install Node.js 22+');

check(
  'node_modules installed',
  existsSync(resolve(__dirname, '../node_modules/react')),
  'Run: npm install'
);

const reactDomPath = resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.production.js');
const reactDomDevPath = resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.development.js');

if (existsSync(reactDomPath)) {
  const content = readFileSync(reactDomPath, 'utf-8');
  check(
    'React DOM patch applied (production)',
    content.includes('abort(request)'),
    'Run: node scripts/patch-react-dom.mjs'
  );
}

if (existsSync(reactDomDevPath)) {
  const content = readFileSync(reactDomDevPath, 'utf-8');
  check(
    'React DOM patch applied (development)',
    content.includes('abort(request)'),
    'Run: node scripts/patch-react-dom.mjs'
  );
}

console.log(ok ? '\nAll checks passed.\n' : '\nSome checks failed.\n');
process.exit(ok ? 0 : 1);
