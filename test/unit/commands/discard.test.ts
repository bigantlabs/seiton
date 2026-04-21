import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discardPending } from '../../../src/commands/discard.js';

function makeFakeFs(files: Set<string>) {
  return {
    readText: async () => '',
    writeAtomic: async () => {},
    remove: async (path: string) => { files.delete(path); },
    exists: async (path: string) => files.has(path),
    ensureDir: async () => {},
  };
}

describe('discardPending', () => {
  it('returns NO_PENDING when no pending file exists', async () => {
    const fs = makeFakeFs(new Set());
    const result = await discardPending(null, fs);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'NO_PENDING');
  });

  it('removes pending file when it exists', async () => {
    const files = new Set(['/state/seiton/pending.json']);
    const fs = makeFakeFs(files);
    const result = await discardPending('/state/seiton/pending.json', fs);
    assert.equal(result.ok, true);
    assert.equal(files.has('/state/seiton/pending.json'), false);
  });
});
