import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.production.js'),
  resolve(__dirname, '../node_modules/react-dom/cjs/react-dom-server.node.development.js'),
];

const RE = /(resolve\(readable\);\s*\n\s*\},)\s*\n\s*void\s+0\s*,\s*\n(\s*void\s+0\s*,\s*\n\s*reject)/;
const REPLACE = '$1\n        function () {\n          abort(request);\n        },\n$2';

let patched = 0;

for (const filePath of FILES) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  if (content.includes('abort(request)')) {
    console.log(`  [OK]   already patched: ${filePath}`);
    continue;
  }

  if (!RE.test(content)) {
    console.warn(`  [WARN] pattern not found in: ${filePath}`);
    continue;
  }

  content = content.replace(RE, REPLACE);
  writeFileSync(filePath, content, 'utf-8');
  patched++;
  console.log(`  [PATCH] applied: ${filePath}`);
}

if (patched > 0) {
  console.log(`\nReact DOM patch complete: ${patched} file(s) patched`);
} else {
  console.log('\nNo files needed patching.');
}
