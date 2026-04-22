import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

  it('reports error when editor returns with a signal', async () => {
    // Note: Testing the signal path (line 24-25) requires spawning and killing a process.
    // We test the error message by mocking the child process with a script that uses trap.
    const configPath = join(tempDir, 'config.json');

    // Create a shell script that will exit via a signal
    const scriptPath = join(tempDir, 'kill-self.sh');
    await (await import('node:fs/promises')).writeFile(
      scriptPath,
      '#!/bin/bash\nkill -TERM $$\nwait\n',
      { mode: 0o755 },
    );

    process.env['EDITOR'] = scriptPath;

    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      // When a process is killed by a signal, the error message should mention it
      assert.ok(result.error.includes('terminated by signal'));
    }
  });

  it('splits editor string on whitespace for arguments', async () => {
    const configPath = join(tempDir, 'config.json');
    // Use 'echo' which will succeed and accepts multiple arguments
    // The editor string contains a space, testing the split functionality
    process.env['EDITOR'] = 'echo test-arg';
    const result = await configEdit(configPath);
    // 'echo' command will succeed even with extra args passed to it
    // The test just verifies the split happens without throwing
    assert.equal(result.ok, true);
  });

  it('handles editor with multiple arguments in env variable', async () => {
    const configPath = join(tempDir, 'config.json');
    // Test that VISUAL takes precedence over EDITOR
    process.env['VISUAL'] = 'echo --flag1 --flag2';
    process.env['EDITOR'] = 'sed';
    const result = await configEdit(configPath);
    // Should succeed with the echo command
    assert.equal(result.ok, true);
  });

  it('reports error when config file is not valid JSON after editing', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = 'true';
    // First, create a config file with valid JSON
    await configEdit(configPath);
    // Now write invalid JSON to it
    const { writeFile: writeFileFunc } = await import('node:fs/promises');
    await writeFileFunc(configPath, 'not valid json {]', 'utf-8');
    // Try to edit again with an editor that succeeds
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('not valid JSON'));
    }
  });

  it('reports error when config fails Zod schema validation after editing', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = 'true';
    // First, create a valid config file
    await configEdit(configPath);
    // Now write valid JSON but invalid config (missing version)
    const { writeFile: writeFileFunc } = await import('node:fs/promises');
    await writeFileFunc(configPath, '{"core": {}}', 'utf-8');
    // Try to edit again
    const result = await configEdit(configPath);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('Config is invalid'));
    }
  });

  it('propagates non-ENOENT readFile errors from ensureConfigFileExists', async () => {
    const configPath = join(tempDir, 'config.json');
    process.env['EDITOR'] = 'true';
    // Simulate a permission denied error (EACCES) by making the parent directory unreadable
    const dir = dirname(configPath);
    await mkdir(dir, { recursive: true });
    await chmod(dir, 0o000);

    try {
      // The error should be thrown from ensureConfigFileExists
      await assert.rejects(
        async () => {
          await configEdit(configPath);
        },
        (err: unknown) => {
          // Verify it's an EACCES error
          return (err as { code?: string } | null)?.code === 'EACCES';
        },
      );
    } finally {
      // Restore permissions for cleanup
      await chmod(dir, 0o755);
    }
  });
});
