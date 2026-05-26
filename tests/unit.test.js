import { test, mock } from 'node:test';
import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('phase.js', async (t) => {
  await t.test('exports PHASES with PRERENDER and REQUEST', async () => {
    const { PHASES } = await import('../src/phase.js');
    assert.strictEqual(PHASES.PRERENDER, 'prerender');
    assert.strictEqual(PHASES.REQUEST, 'request');
  });

  await t.test('setPhase/getPhase roundtrip', async () => {
    const { setPhase, getPhase, PHASES } = await import('../src/phase.js');
    setPhase(PHASES.PRERENDER);
    assert.strictEqual(getPhase(), PHASES.PRERENDER);
    setPhase(undefined);
    assert.strictEqual(getPhase(), PHASES.REQUEST);
  });

  await t.test('isPrerender returns true during prerender phase', async () => {
    const { setPhase, isPrerender, PHASES } = await import('../src/phase.js');
    setPhase(PHASES.PRERENDER);
    assert.strictEqual(isPrerender(), true);
    setPhase(undefined);
    assert.strictEqual(isPrerender(), false);
  });

  await t.test('runWithPhase sets and restores phase correctly', async () => {
    const { runWithPhase, getPhase, setPhase, PHASES } = await import('../src/phase.js');
    setPhase(undefined);

    let captured;
    runWithPhase(PHASES.PRERENDER, () => {
      captured = getPhase();
    });

    assert.strictEqual(captured, PHASES.PRERENDER);
    assert.strictEqual(getPhase(), PHASES.REQUEST);
  });

  await t.test('runWithPhase restores phase even on throw', async () => {
    const { runWithPhase, getPhase, setPhase, PHASES } = await import('../src/phase.js');
    setPhase(undefined);

    assert.throws(() => {
      runWithPhase(PHASES.PRERENDER, () => { throw new Error('boom'); });
    });
    assert.strictEqual(getPhase(), PHASES.REQUEST);
  });
});

test('dynamic-apis.js', async (t) => {
  await t.test('suspendIfPrerendering throws during prerender', async () => {
    const { setPhase, PHASES } = await import('../src/phase.js');
    const { suspendIfPrerendering } = await import('../src/dynamic-apis.js');

    setPhase(PHASES.PRERENDER);
    assert.throws(() => suspendIfPrerendering());
    setPhase(undefined);
  });

  await t.test('suspendIfPrerendering does not throw during request', async () => {
    const { setPhase, PHASES } = await import('../src/phase.js');
    const { suspendIfPrerendering } = await import('../src/dynamic-apis.js');

    setPhase(PHASES.REQUEST);
    assert.doesNotThrow(() => suspendIfPrerendering());
  });

  await t.test('cookies throws during prerender', async () => {
    const { setPhase, PHASES } = await import('../src/phase.js');
    const { cookies } = await import('../src/dynamic-apis.js');

    setPhase(PHASES.PRERENDER);
    assert.throws(() => cookies(null));
    setPhase(undefined);
  });

  await t.test('cookies parses cookie header', async () => {
    const { setPhase, PHASES } = await import('../src/phase.js');
    const { cookies } = await import('../src/dynamic-apis.js');

    setPhase(PHASES.REQUEST);
    const request = {
      headers: {
        get: (name) => name === 'cookie' ? 'foo=bar; baz=qux' : '',
      },
    };
    const parsed = cookies(request);
    assert.deepStrictEqual(parsed, { foo: 'bar', baz: 'qux' });
    setPhase(undefined);
  });

  await t.test('headers throws during prerender', async () => {
    const { setPhase, PHASES } = await import('../src/phase.js');
    const { headers } = await import('../src/dynamic-apis.js');

    setPhase(PHASES.PRERENDER);
    assert.throws(() => headers(null));
    setPhase(undefined);
  });
});

test('flight-cache.js', async (t) => {
  await t.test('getCachedBuffer returns null for missing entry', async () => {
    const { getCachedBuffer } = await import('../src/flight-cache.js');
    const result = await getCachedBuffer('NonExistent', {});
    assert.strictEqual(result, null);
  });

  await t.test('writeCacheEntry and getCachedBuffer roundtrip', async () => {
    const { writeCacheEntry, getCachedBuffer } = await import('../src/flight-cache.js');
    const data = Buffer.from('test-data');
    await writeCacheEntry('TestComp', { id: 1 }, data);
    const retrieved = await getCachedBuffer('TestComp', { id: 1 });
    assert.ok(retrieved);
    assert.strictEqual(retrieved.toString(), 'test-data');
  });

  await t.test('makeCacheKey produces consistent keys', async () => {
    const { makeCacheKey } = await import('../src/flight-cache.js');
    const key1 = makeCacheKey('Comp', { a: 1 });
    const key2 = makeCacheKey('Comp', { a: 1 });
    const key3 = makeCacheKey('Comp', { a: 2 });
    assert.strictEqual(key1, key2);
    assert.notStrictEqual(key1, key3);
  });

  await t.test('cacheManifest returns entry metadata', async () => {
    const { writeCacheEntry, cacheManifest } = await import('../src/flight-cache.js');
    const data = Buffer.from('manifest-test');
    await writeCacheEntry('ManifestComp', {}, data);
    const entries = await cacheManifest();
    assert.ok(entries.length >= 1);
    const entry = entries[0];
    assert.ok(entry.key.length === 32, 'key should be md5 hash');
    assert.ok(entry.size > 0);
    assert.ok(entry.mtime > 0);
  });

  await t.test('invalidateCache removes entry', async () => {
    const { writeCacheEntry, getCachedBuffer, invalidateCache } = await import('../src/flight-cache.js');
    await writeCacheEntry('TempComp', {}, Buffer.from('temp'));
    assert.ok(await getCachedBuffer('TempComp', {}));
    await invalidateCache('TempComp', {});
    assert.strictEqual(await getCachedBuffer('TempComp', {}), null);
  });

  await t.test('getCachedStream returns null for missing entry', async () => {
    const { getCachedStream } = await import('../src/flight-cache.js');
    const result = await getCachedStream('NonExistent', {});
    assert.strictEqual(result, null);
  });

  await t.test('getCachedStream returns readable stream for existing entry', async () => {
    const { writeCacheEntry, getCachedStream } = await import('../src/flight-cache.js');
    await writeCacheEntry('StreamComp', {}, Buffer.from('stream-data'));
    const stream = await getCachedStream('StreamComp', {});
    assert.ok(stream);
    assert.strictEqual(stream.readable, true);
    stream.destroy();
  });
});
