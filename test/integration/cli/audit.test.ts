import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

async function runAudit(args: string[] = [], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli(['audit', ...args], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      SEITON_CONFIG: undefined,
      ...envOverrides,
    },
  });
}

describe('seiton audit CLI wrapper', () => {
  it('prints help text and exits 0 with --help', async () => {
    const { stdout, exitCode } = await runAudit(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton audit'));
    assert.ok(stdout.includes('Usage:'));
    assert.ok(stdout.includes('Flags:'));
  });

  it('prints help text with -h short flag', async () => {
    const { stdout, exitCode } = await runAudit(['-h']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton audit'));
  });

  it('exits 64 on unknown flag', async () => {
    const { stderr, exitCode } = await runAudit(['--unknown-flag']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('invalid arguments'));
  });
});
