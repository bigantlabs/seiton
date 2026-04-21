import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath } from '../../../src/commands/config-path.js';

describe('configPath', () => {
  it('logs debug message when non-ENOENT error occurs', async () => {
    let tempDir: string | null = null;

    try {
      tempDir = await mkdtemp(join(tmpdir(), 'seiton-config-path-'));
      const debugLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];
      const mockLogger = {
        error: (_msg: string) => undefined,
        warn: (_msg: string) => undefined,
        info: (_msg: string) => undefined,
        debug: (msg: string, ctx?: Record<string, unknown>) => {
          debugLogs.push({ message: msg, context: ctx });
        },
      };

      // Create a file and make it unreadable to trigger a non-ENOENT error (EACCES)
      const testPath = join(tempDir, 'unreadable.json');
      await writeFile(testPath, '{}');
      await chmod(testPath, 0o000);

      // Use cliConfigPath to set hardFail=true with the unreadable file
      await configPath(
        {
          cliConfigPath: testPath,
        },
        mockLogger,
      );

      // The function should log the permission error as a debug message
      // and then return the path (because hardFail=true)
      const debugEntry = debugLogs.find(log => log.message.includes('non-ENOENT'));
      assert.ok(debugEntry, 'should log debug message for non-ENOENT error');
      assert.ok(
        debugEntry?.context?.error?.toString().includes('EACCES') ||
        debugEntry?.context?.error?.toString().includes('Permission'),
        'should include permission error in debug context',
      );
    } finally {
      if (tempDir) {
        // Restore permissions before cleanup
        try {
          await chmod(join(tempDir, 'unreadable.json'), 0o644).catch(() => {});
        } catch { /* ignore */ }
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('returns first valid config file path found', async () => {
    let tempDir: string | null = null;

    try {
      tempDir = await mkdtemp(join(tmpdir(), 'seiton-config-path-'));

      // Create a valid config file
      const testPath = join(tempDir, 'test-config.json');
      await writeFile(testPath, JSON.stringify({ version: 1 }));

      const result = await configPath({
        cliConfigPath: testPath,
      });

      // Should return the path to the valid config file
      assert.equal(result, testPath);
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  });
});
