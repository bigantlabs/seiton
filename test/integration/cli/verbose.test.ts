import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ROOT, ENTRY, type RunResult } from '../../helpers/run-cli.js';

const execFileAsync = promisify(execFile);

let tempHome: string;

async function runVerboseCli(
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
    const e = err as { stdout?: string; stderr?: string; code?: number | string; signal?: string; killed?: boolean };
    const exitCode = typeof e.code === 'number' ? e.code : -1;
    const signalNote = e.signal ? `\n[killed by signal: ${e.signal}]` : '';
    return {
      stdout: e.stdout ?? '',
      stderr: (e.stderr ?? '') + signalNote,
      exitCode,
    };
  }
}

describe('--verbose flag propagation', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-verbose-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('--verbose on config show emits log lines to stderr', async () => {
    const { stderr, exitCode } = await runVerboseCli(['--verbose', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('seiton started'), 'stderr should contain entry log from main');
    assert.ok(stderr.includes('config show'), 'stderr should contain config show log');
  });

  it('-v short flag produces log output on stderr', async () => {
    const { stderr, exitCode } = await runVerboseCli(['-v', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('INFO'), 'stderr should contain INFO-level log lines');
  });

  it('-vv enables debug-level output on stderr', async () => {
    const { stderr, exitCode } = await runVerboseCli(['-v', '-v', 'config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('DEBUG'), 'stderr should contain DEBUG-level log lines');
    assert.ok(stderr.includes('dispatching config show'), 'stderr should contain debug dispatch message');
  });

  it('without --verbose, stderr has no log output', async () => {
    const { stderr, exitCode } = await runVerboseCli(['config', 'show']);
    assert.equal(exitCode, 0);
    assert.ok(!stderr.includes('INFO'), 'stderr should not contain log lines without --verbose');
    assert.ok(!stderr.includes('seiton started'), 'stderr should not contain entry log without --verbose');
  });

  it('--verbose log output does not contaminate stdout JSON', async () => {
    const { stdout, stderr, exitCode } = await runVerboseCli(['--verbose', 'config', 'show']);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    assert.equal(parsed['version'], 1, 'stdout should be valid config JSON');
    assert.ok(stderr.length > 0, 'stderr should have log output');
  });
});
