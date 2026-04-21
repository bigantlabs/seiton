import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../../helpers/run-cli.js';

describe('--dry-run flag', () => {
  it('is accepted as a valid global flag', async () => {
    const { exitCode } = await runCli(['--dry-run', '--help']);
    assert.equal(exitCode, 0);
  });

  it('appears in help text', async () => {
    const { stdout } = await runCli(['--help']);
    assert.ok(stdout.includes('--dry-run'));
    assert.ok(stdout.includes('Print planned actions'));
  });

  it('does not error when combined with config show', async () => {
    const { exitCode } = await runCli(['--dry-run', 'config', 'show']);
    assert.equal(exitCode, 0);
  });

  it('dispatches to audit with --dry-run (exits 64 without TTY)', async () => {
    const { exitCode, stderr } = await runCli(['--dry-run']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('interactive terminal') || stderr.includes('report'));
  });
});
