import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configEdit } from '../../../src/commands/config-edit.js';

let tempDir: string;
let savedVisual: string | undefined;
let savedEditor: string | undefined;

describe('configEdit', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'seiton-config-edit-'));
    savedVisual = process.env['VISUAL'];
    savedEditor = process.env['EDITOR'];
    delete process.env['VISUAL'];
  });

  afterEach(async () => {
    if (savedVisual !== undefined) process.env['VISUAL'] = savedVisual;
    else delete process.env['VISUAL'];
    if (savedEditor !== undefined) process.env['EDITOR'] = savedEditor;
    else delete process.env['EDITOR'];
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reports error when editor binary does not exist', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = '/nonexistent/editor-binary-that-does-not-exist';
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Failed to launch editor'));
      assert.ok(result.error.includes('/nonexistent/editor-binary-that-does-not-exist'));
    }
  });

  it('creates config file with template when it does not exist', async () => {
    const configPath = join(tempDir, 'subdir', 'config.json');
    process.env['EDITOR'] = 'true';
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as { version: number };
    assert.equal(parsed.version, 1);
  });

  it('returns ok when editor exits 0', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = 'true';
    const result = await configEdit(configPath);
    assert.equal(result.ok, true);
  });

  it('reports error when editor exits non-zero', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = 'false';
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('exited with code'));
    }
  });
});
