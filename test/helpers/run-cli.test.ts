import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from './run-cli.js';

describe('runCli helper', () => {
  describe('timeout option', () => {
    it('kills the child process when timeout elapses', async () => {
      const result = await runCli(['--help'], { timeout: 1 });
      assert.notEqual(result.exitCode, 0, 'process should be killed before completing');
    });

    it('completes normally when timeout is generous', async () => {
      const result = await runCli(['--help'], { timeout: 30_000 });
      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.length > 0 || result.stderr.length > 0);
    });
  });
});
