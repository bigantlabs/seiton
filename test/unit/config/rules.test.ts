import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { addCustomRule } from '../../../src/config/rules.js';

function tmpPath(): string {
  return join(tmpdir(), `seiton-test-${randomUUID()}`);
}

describe('addCustomRule', () => {
  it('creates config with rule when file does not exist', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      const result = await addCustomRule(filePath, { folder: 'Dev', keywords: ['github'] });
      assert.equal(result.ok, true);
      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      assert.equal(content.version, 1);
      assert.deepEqual(content.folders.custom_rules, [{ folder: 'Dev', keywords: ['github'] }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appends rule to existing config preserving other keys', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, JSON.stringify({
        version: 1,
        core: { output_format: 'text' },
        folders: { preserve_existing: true, custom_rules: [{ folder: 'Email', keywords: ['gmail'] }] },
      }));

      const result = await addCustomRule(filePath, { folder: 'Dev', keywords: ['github'] });
      assert.equal(result.ok, true);

      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      assert.equal(content.version, 1);
      assert.equal(content.core.output_format, 'text');
      assert.equal(content.folders.preserve_existing, true);
      assert.equal(content.folders.custom_rules.length, 2);
      assert.deepEqual(content.folders.custom_rules[0], { folder: 'Email', keywords: ['gmail'] });
      assert.deepEqual(content.folders.custom_rules[1], { folder: 'Dev', keywords: ['github'] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('creates folders object when config has none', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, JSON.stringify({ version: 1 }));

      const result = await addCustomRule(filePath, { folder: 'Social', keywords: ['twitter'] });
      assert.equal(result.ok, true);

      const content = JSON.parse(await readFile(filePath, 'utf-8'));
      assert.deepEqual(content.folders.custom_rules, [{ folder: 'Social', keywords: ['twitter'] }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns error for unreadable config', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, 'not json!!!');

      const result = await addCustomRule(filePath, { folder: 'Dev', keywords: ['gh'] });
      assert.equal(result.ok, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns error when folders key is wrong type', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, JSON.stringify({ version: 1, folders: 'not-an-object' }));

      const result = await addCustomRule(filePath, { folder: 'Dev', keywords: ['gh'] });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes('"folders"'));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns error when custom_rules key is wrong type', async () => {
    const dir = tmpPath();
    const filePath = join(dir, 'config.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, JSON.stringify({ version: 1, folders: { custom_rules: 'not-an-array' } }));

      const result = await addCustomRule(filePath, { folder: 'Dev', keywords: ['gh'] });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.includes('"custom_rules"'));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
