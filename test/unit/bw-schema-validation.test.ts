import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createBwAdapter } from '../../src/lib/bw.js';

function makeTempScript(content: string): string {
  const dir = join(tmpdir(), `seiton-test-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  const scriptPath = join(dir, 'fake-bw');
  writeFileSync(scriptPath, `#!/usr/bin/env node\n${content}`, { mode: 0o755 });
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe('listItems schema validation error messages', () => {
  it('includes path info when an item fails schema validation', async () => {
    const script = makeTempScript(`
      const args = process.argv.slice(2);
      if (args[0] === 'list' && args[1] === 'items') {
        const items = [{
          id: 'valid-1', organizationId: null, folderId: null, type: 1,
          name: 'Good Item', notes: null, favorite: false,
          revisionDate: '2024-01-01T00:00:00.000Z',
        }, {
          organizationId: null, folderId: null, type: 1,
          name: 'Bad Item Missing ID', notes: null, favorite: false,
          revisionDate: '2024-01-01T00:00:00.000Z',
        }];
        process.stdout.write(JSON.stringify(items));
        process.exit(0);
      }
      process.exit(1);
    `);

    const adapter = createBwAdapter(script);
    const result = await adapter.listItems('fake-session');

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'SCHEMA_MISMATCH');
      assert.match(result.error.message, /at 1\.id/);
      assert.match(result.error.message, /Vault items failed schema validation/);
    }
  });

  it('shows (root) path when the entire array is not parseable', async () => {
    const script = makeTempScript(`
      const args = process.argv.slice(2);
      if (args[0] === 'list' && args[1] === 'items') {
        process.stdout.write('"not-an-array"');
        process.exit(0);
      }
      process.exit(1);
    `);

    const adapter = createBwAdapter(script);
    const result = await adapter.listItems('fake-session');

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'SCHEMA_MISMATCH');
      assert.match(result.error.message, /\(root\)/);
    }
  });

  it('includes specific field name in path for nested validation errors', async () => {
    const script = makeTempScript(`
      const args = process.argv.slice(2);
      if (args[0] === 'list' && args[1] === 'items') {
        const items = [{
          id: 'item-bad-type', organizationId: null, folderId: null,
          type: 999,
          name: 'Bad Type', notes: null, favorite: false,
          revisionDate: '2024-01-01T00:00:00.000Z',
        }];
        process.stdout.write(JSON.stringify(items));
        process.exit(0);
      }
      process.exit(1);
    `);

    const adapter = createBwAdapter(script);
    const result = await adapter.listItems('fake-session');

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'SCHEMA_MISMATCH');
      assert.match(result.error.message, /at 0\.type/);
    }
  });
});
