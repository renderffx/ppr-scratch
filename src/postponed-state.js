export const MAGIC = Buffer.from('PPRF');
export const VERSION = 1;

export function encodePostponedState(data) {
  if (!data || data.length === 0) {
    const empty = Buffer.alloc(12);
    MAGIC.copy(empty, 0);
    empty.writeUInt32LE(VERSION, 4);
    empty.writeUInt32LE(0, 8);
    return empty;
  }

  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32LE(VERSION, 0);

  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(data.length, 0);

  const entries = data.map((entry, i) => {
    const nameB = Buffer.from(entry.componentName || 'Unknown', 'utf-8');
    const reasonB = Buffer.from(entry.reason || '', 'utf-8');
    const propsB = Buffer.from(JSON.stringify(entry.props || {}), 'utf-8');

    const size = 4 + nameB.length + 4 + reasonB.length + 4 + propsB.length + 4 + 8;
    const buf = Buffer.alloc(size);
    let off = 0;

    buf.writeUInt32LE(nameB.length, off); off += 4;
    nameB.copy(buf, off); off += nameB.length;

    buf.writeUInt32LE(reasonB.length, off); off += 4;
    reasonB.copy(buf, off); off += reasonB.length;

    buf.writeUInt32LE(propsB.length, off); off += 4;
    propsB.copy(buf, off); off += propsB.length;

    buf.writeUInt32LE(i, off); off += 4;
    buf.writeDoubleLE(Date.now(), off);

    return buf;
  });

  const entriesBuf = entries.length > 0 ? Buffer.concat(entries) : Buffer.alloc(0);

  const fiberCount = data.length;
  const fiberNodes = [];
  for (let i = 0; i < fiberCount; i++) {
    const node = Buffer.alloc(64);
    let off = 0;
    node.writeUInt32LE(5, off); off += 4;
    node.writeUInt32LE(1, off); off += 4;
    node.writeUInt32LE(0, off); off += 4;
    node.writeUInt32LE(3, off); off += 4;
    node.writeUInt32LE(0, off); off += 4;
    node.writeUInt32LE(0, off); off += 4;
    node.writeDoubleLE(i, off); off += 8;
    node.writeUInt32LE(i, off); off += 4;
    node.writeUInt32LE(42 + i, off); off += 4;
    node.writeUInt32LE(100 + i, off); off += 4;
    fiberNodes.push(node);
  }

  const hookCount = Math.min(4, Math.max(1, data.length));
  const hookStates = [];
  for (let i = 0; i < hookCount; i++) {
    const hook = Buffer.alloc(32);
    let off = 0;
    hook.writeUInt32LE(i, off); off += 4;
    hook.writeUInt32LE(0, off); off += 4;
    hook.writeDoubleLE(i * 1.5, off); off += 8;
    hook.writeUInt32LE(100 + i, off); off += 4;
    hook.writeUInt32LE(0, off); off += 4;
    hookStates.push(hook);
  }

  const treeBuf = Buffer.concat([...fiberNodes, ...hookStates]);
  const meta = Buffer.alloc(16);
  meta.writeUInt32LE(fiberCount, 0);
  meta.writeUInt32LE(hookStates.length, 4);
  meta.writeDoubleLE(treeBuf.length, 8);

  const parts = [MAGIC, versionBuf, countBuf, entriesBuf, meta, treeBuf];
  return Buffer.concat(parts, parts.reduce((s, b) => s + b.length, 0));
}

export function decodePostponedState(buffer) {
  if (!buffer || buffer.length < 12) {
    return { entries: [], magic: null, version: null };
  }

  const magic = buffer.subarray(0, 4).toString('utf-8');
  if (magic !== 'PPRF') {
    throw new Error(`Invalid magic bytes: expected PPRF, got ${magic}`);
  }

  const version = buffer.readUInt32LE(4);
  const count = buffer.readUInt32LE(8);
  const entries = [];

  let offset = 12;
  for (let i = 0; i < count; i++) {
    if (offset + 4 > buffer.length) break;
    const nameLen = buffer.readUInt32LE(offset); offset += 4;
    if (offset + nameLen > buffer.length) break;
    const componentName = buffer.subarray(offset, offset + nameLen).toString('utf-8'); offset += nameLen;

    if (offset + 4 > buffer.length) break;
    const reasonLen = buffer.readUInt32LE(offset); offset += 4;
    if (offset + reasonLen > buffer.length) break;
    const reason = buffer.subarray(offset, offset + reasonLen).toString('utf-8'); offset += reasonLen;

    if (offset + 4 > buffer.length) break;
    const propsLen = buffer.readUInt32LE(offset); offset += 4;
    if (offset + propsLen > buffer.length) break;
    const props = JSON.parse(buffer.subarray(offset, offset + propsLen).toString('utf-8')); offset += propsLen;

    if (offset + 12 > buffer.length) break;
    const id = buffer.readUInt32LE(offset); offset += 4;
    const ts = buffer.readDoubleLE(offset); offset += 8;

    entries.push({ id, componentName, reason, props, timestamp: ts });
  }

  return { magic, version, entries, count };
}
