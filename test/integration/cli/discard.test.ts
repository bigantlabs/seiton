import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

let tempHome: string;

async function runDiscard(args: string[] = [], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli(['discard', ...args], {
    env: {
      ...process.env,
      HOME: tempHome,
      XDG_CONFIG_HOME: join(tempHome, '.config'),
      XDG_STATE_HOME: join(tempHome, '.local', 'state'),
      NODE_NO_WARNINGS: '1',
      SEITON_CONFIG: undefined,
      ...envOverrides,
    },
  });
}

describe('seiton discard CLI wrapper', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-discard-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('prints help text and exits 0 with --help', async () => {
    const { stdout, exitCode } = await runDiscard(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton discard'));
    assert.ok(stdout.includes('Usage:'));
  });

  it('exits 0 when no pending queue exists', async () => {
    const { stdout, exitCode } = await runDiscard();
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('Nothing to discard'));
  });

  it('exits 64 on unknown flag', async () => {
    const { stderr, exitCode } = await runDiscard(['--unknown-flag']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('invalid arguments'));
  });
});
