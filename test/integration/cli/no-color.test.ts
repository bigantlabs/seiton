import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

const ANSI_ESCAPE = /\x1b\[/;

async function runWithNoColor(command: string[], extraEnv: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli([...command, '--no-color'], {
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      SEITON_CONFIG: undefined,
      NO_COLOR: undefined,
      BW_SESSION: 'integration-test-session',
      ...extraEnv,
    },
  });
}

describe('--no-color flag', () => {
  it('is accepted by doctor without error', async () => {
    const { exitCode } = await runWithNoColor(['doctor']);
    assert.equal(exitCode, 0);
  });

  it('is accepted by config show without error', async () => {
    const { exitCode } = await runWithNoColor(['config', 'show']);
    assert.equal(exitCode, 0);
  });

  it('is accepted by report --help without error', async () => {
    const { exitCode } = await runWithNoColor(['report', '--help']);
    assert.equal(exitCode, 0);
  });

  it('doctor output contains no ANSI escapes with --no-color', async () => {
    const { stdout, stderr, exitCode } = await runWithNoColor(['doctor']);
    assert.equal(exitCode, 0);
    assert.ok(!ANSI_ESCAPE.test(stdout), 'stdout should contain no ANSI escapes');
    assert.ok(!ANSI_ESCAPE.test(stderr), 'stderr should contain no ANSI escapes');
  });

  it('config show output contains no ANSI escapes with --no-color', async () => {
    const { stdout, stderr, exitCode } = await runWithNoColor(['config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(!ANSI_ESCAPE.test(stdout), 'stdout should contain no ANSI escapes');
    assert.ok(!ANSI_ESCAPE.test(stderr), 'stderr should contain no ANSI escapes');
  });
});
