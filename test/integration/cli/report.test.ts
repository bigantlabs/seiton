import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

async function runReport(args: string[] = [], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli(['report', ...args], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      SEITON_CONFIG: undefined,
      ...envOverrides,
    },
  });
}

describe('seiton report CLI wrapper', () => {
  it('prints help text and exits 0 with --help', async () => {
    const { stdout, exitCode } = await runReport(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton report'));
    assert.ok(stdout.includes('Usage:'));
    assert.ok(stdout.includes('--json'));
  });

  it('prints help text with -h short flag', async () => {
    const { stdout, exitCode } = await runReport(['-h']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton report'));
  });

  it('exits 64 on unknown flag', async () => {
    const { stderr, exitCode } = await runReport(['--unknown-flag']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('invalid arguments'));
  });

  it('exits 77 when BW_SESSION is not set', async () => {
    const { stderr, exitCode } = await runReport([], { BW_SESSION: undefined });
    assert.equal(exitCode, 77);
    assert.ok(stderr.includes('BW_SESSION'));
  });
});
