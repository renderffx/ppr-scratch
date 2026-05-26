import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

const ARTIFACTS = [
  './dist/shell.html',
  './dist/postponed.json',
  './dist/manifest.json',
];

test('PPR Production Architecture Validation', async (t) => {
  await t.test('All build artifacts exist', () => {
    for (const artifact of ARTIFACTS) {
      assert.ok(existsSync(artifact), `Missing artifact: ${artifact}`);
    }
  });

  await t.test('Static shell is valid HTML with suspense boundaries', () => {
    const shell = readFileSync('./dist/shell.html', 'utf-8');
    assert.ok(shell.length > 100, 'Shell HTML too small');
    assert.ok(shell.startsWith('<!DOCTYPE html>'), 'Shell must start with doctype');
    assert.ok(shell.includes('</html>'), 'Shell must end with closing html tag');

    assert.match(shell, /<!--\$?\??-->/, 'Shell must contain Suspense boundary markers');
    assert.ok(shell.includes('static-shell') || shell.includes('Static'), 'Shell must contain static content');
    assert.ok(shell.includes('PPR') || shell.includes('Prerendering'), 'Shell must mention PPR');
  });

  await t.test('Postponed JSON has valid React PPR format', () => {
    const postponed = JSON.parse(readFileSync('./dist/postponed.json', 'utf-8'));

    assert.ok('resumableState' in postponed, 'Must have resumableState');
    assert.ok('rootFormatContext' in postponed, 'Must have rootFormatContext');
    assert.ok('nextSegmentId' in postponed, 'Must have nextSegmentId');
    assert.ok('progressiveChunkSize' in postponed, 'Must have progressiveChunkSize');
    assert.ok(Array.isArray(postponed.replayNodes), 'Must have replayNodes array');

    assert.ok(typeof postponed.resumableState === 'object', 'resumableState must be an object');
    assert.ok(typeof postponed.rootFormatContext === 'object', 'rootFormatContext must be an object');
    assert.ok(typeof postponed.nextSegmentId === 'number', 'nextSegmentId must be a number');

    if (postponed.replayNodes.length > 0) {
      const firstNode = postponed.replayNodes[0];
      assert.ok(Array.isArray(firstNode), 'Each replayNode must be an array');
      assert.ok(firstNode.length >= 3, 'Replay node must have at least [name, depth, children]');
    }
  });

  await t.test('Manifest follows correct schema', () => {
    const manifest = JSON.parse(readFileSync('./dist/manifest.json', 'utf-8'));

    assert.strictEqual(manifest.version, 1, 'Manifest version must be 1');
    assert.ok(typeof manifest.buildTime === 'number', 'buildTime must be a number');
    assert.ok(manifest.buildTime > 0, 'buildTime must be positive');
    assert.ok(manifest.buildTime < Date.now() + 10000, 'buildTime must be in the past');

    assert.ok(manifest.prerenderType === 'react-postponed', 'prerenderType must be react-postponed');
    assert.ok(Array.isArray(manifest.boundaries), 'boundaries must be an array');
  });

  await t.test('Artifact sizes within expected ranges', () => {
    const shell = readFileSync('./dist/shell.html', 'utf-8');
    const postponed = readFileSync('./dist/postponed.json', 'utf-8');
    const manifest = readFileSync('./dist/manifest.json', 'utf-8');

    assert.ok(shell.length >= 200, `Shell too small: ${shell.length} bytes`);
    assert.ok(shell.length <= 100000, `Shell too large: ${shell.length} bytes`);

    assert.ok(postponed.length >= 50, `Postponed too small: ${postponed.length} bytes`);
    assert.ok(postponed.length <= 50000, `Postponed too large: ${postponed.length} bytes`);

    assert.ok(manifest.length >= 50, `Manifest too small: ${manifest.length} bytes`);
    assert.ok(manifest.length <= 50000, `Manifest too large: ${manifest.length} bytes`);
  });

  await t.test('postponed.json contains valid replay nodes for Suspense boundaries', () => {
    const postponed = JSON.parse(readFileSync('./dist/postponed.json', 'utf-8'));

    assert.ok(postponed.replayNodes.length >= 1, 'Must have at least one replay node');

    const boundaryCount = countSuspenseBoundaries(postponed.replayNodes);
    assert.ok(boundaryCount >= 1, 'Must have at least one Suspense boundary to resume');
  });
});

function countSuspenseBoundaries(nodes) {
  let count = 0;
  for (const node of nodes) {
    if (typeof node === 'string' && node === 'Suspense') {
      count++;
    }
    if (Array.isArray(node)) {
      count += countSuspenseBoundaries(node);
    }
  }
  return count;
}
