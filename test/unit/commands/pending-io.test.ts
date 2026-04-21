import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePendingPath } from '../../../src/commands/pending-io.js';

describe('resolvePendingPath', () => {
  it('returns config path when provided', () => {
    const result = resolvePendingPath('/custom/path/pending.json');
    assert.equal(result, '/custom/path/pending.json');
  });

  it('returns XDG-based path when config is null', () => {
    const orig = process.env['XDG_STATE_HOME'];
    process.env['XDG_STATE_HOME'] = '/tmp/test-state';
    try {
      const result = resolvePendingPath(null);
      assert.equal(result, '/tmp/test-state/seiton/pending.json');
    } finally {
      if (orig !== undefined) {
        process.env['XDG_STATE_HOME'] = orig;
      } else {
        delete process.env['XDG_STATE_HOME'];
      }
    }
  });
});
