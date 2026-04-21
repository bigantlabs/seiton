import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

async function runResume(args: string[] = [], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli(['resume', ...args], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      SEITON_CONFIG: undefined,
      ...envOverrides,
    },
  });
}

describe('seiton resume CLI wrapper', () => {
  it('prints help text and exits 0 with --help', async () => {
    const { stdout, exitCode } = await runResume(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton resume'));
    assert.ok(stdout.includes('Usage:'));
    assert.ok(stdout.includes('Flags:'));
  });

  it('prints help text with -h short flag', async () => {
    const { stdout, exitCode } = await runResume(['-h']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton resume'));
  });

  it('exits 64 on unknown flag', async () => {
    const { stderr, exitCode } = await runResume(['--unknown-flag']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('invalid arguments'));
  });
});
