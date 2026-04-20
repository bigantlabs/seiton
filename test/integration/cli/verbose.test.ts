import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

let tempHome: string;

async function runCli(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: join(tempHome, '.config'),
    NODE_NO_WARNINGS: '1',
    SEITON_CONFIG: undefined,
    ...envOverrides,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      { cwd: ROOT, env: env as NodeJS.ProcessEnv, timeout: 15_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

describe('--verbose flag propagation', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-verbose-'));
  });

  it('--verbose on config show emits log lines to stderr', async () => {
    const { stderr, exitCode } = await runCli(['--verbose', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('seiton started'), 'stderr should contain entry log from main');
    assert.ok(stderr.includes('config show'), 'stderr should contain config show log');
  });

  it('-v short flag produces log output on stderr', async () => {
    const { stderr, exitCode } = await runCli(['-v', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('INFO'), 'stderr should contain INFO-level log lines');
  });

  it('-vv enables debug-level output on stderr', async () => {
    const { stderr, exitCode } = await runCli(['-v', '-v', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('DEBUG'), 'stderr should contain DEBUG-level log lines');
    assert.ok(stderr.includes('dispatching config show'), 'stderr should contain debug dispatch message');
  });

  it('without --verbose, stderr has no log output', async () => {
    const { stderr, exitCode } = await runCli(['config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(!stderr.includes('INFO'), 'stderr should not contain log lines without --verbose');
    assert.ok(!stderr.includes('seiton started'), 'stderr should not contain entry log without --verbose');
  });

  it('--verbose log output does not contaminate stdout JSON', async () => {
    const { stdout, stderr, exitCode } = await runCli(['--verbose', 'config', 'show']);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    assert.equal(parsed['version'], 1, 'stdout should be valid config JSON');
    assert.ok(stderr.length > 0, 'stderr should have log output');
  });
});
