import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.production.js'),
  resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.development.js'),
];

// Pattern: onShellReady is void 0 (needs patching)
const SEARCH = 'resolve(readable);\n        },\n        void 0,\n        void 0,\n        reject';
const REPLACE = 'resolve(readable);\n        },\n        function () {\n          abort(request);\n        },\n        void 0,\n        reject';

let patched = 0;

for (const filePath of FILES) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  if (content.includes(REPLACE)) continue;

  if (!content.includes(SEARCH)) continue;

  content = content.replace(SEARCH, REPLACE);
  writeFileSync(filePath, content, 'utf-8');
  patched++;
  console.log(`  patched: ${filePath}`);
}

if (patched > 0) {
  console.log(`\nReact DOM patch complete: ${patched} file(s) patched`);
}
