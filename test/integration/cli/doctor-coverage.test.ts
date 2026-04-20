import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');
const FAKE_BW = join(ROOT, 'test', 'helpers', 'fake-bw.ts');
const THROW_RUNNER = join(ROOT, 'test', 'helpers', 'doctor-throw-runner.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

let tempHome: string;

async function createFakeBwShim(dir: string): Promise<string> {
  const binDir = join(dir, 'bin');
  await mkdir(binDir, { recursive: true });
  const shimPath = join(binDir, 'bw');
  const shimContent = `#!/bin/sh\nexec node --import tsx "${FAKE_BW}" "$@"\n`;
  await writeFile(shimPath, shimContent, { mode: 0o755 });
  return binDir;
}

async function runDoctor(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const binDir = await createFakeBwShim(tempHome);
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: join(tempHome, '.config'),
    XDG_STATE_HOME: join(tempHome, '.local', 'state'),
    PATH: `${binDir}:${process.env['PATH']}`,
    NODE_NO_WARNINGS: '1',
    BW_SESSION: 'test-session-token',
    FAKE_BW_SCENARIO: 'default',
    SEITON_CONFIG: undefined,
    ...envOverrides,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, 'doctor', ...args],
      { cwd: ROOT, env: env as NodeJS.ProcessEnv, timeout: 15_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

async function runThrowRunner(
  args: string[] = [],
  envOverrides: Record<string, string | undefined> = {},
): Promise<RunResult> {
  const binDir = await createFakeBwShim(tempHome);
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: join(tempHome, '.config'),
    XDG_STATE_HOME: join(tempHome, '.local', 'state'),
    PATH: `${binDir}:${process.env['PATH']}`,
    NODE_NO_WARNINGS: '1',
    BW_SESSION: 'test-session-token',
    FAKE_BW_SCENARIO: 'default',
    SEITON_CONFIG: undefined,
    ...envOverrides,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', THROW_RUNNER, ...args],
      { cwd: ROOT, env: env as NodeJS.ProcessEnv, timeout: 15_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

describe('seiton doctor — coverage gap tests', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-doctor-cov-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  describe('--debug flag with actual thrown error', () => {
    it('prints stack trace on stderr when --debug is set and an error occurs', async () => {
      const { stderr, exitCode } = await runThrowRunner(['--debug']);
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('unexpected error'), 'should mention unexpected error');
      assert.ok(stderr.includes('simulated stdout failure'), 'should include error message');
      assert.match(stderr, /at\s+/, 'should include stack trace frames');
    });

    it('prints hint to use --debug when error occurs without --debug flag', async () => {
      const { stderr, exitCode } = await runThrowRunner([]);
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('unexpected error'), 'should mention unexpected error');
      assert.ok(stderr.includes('simulated stdout failure'), 'should include error message');
      assert.ok(stderr.includes('Run with --debug'), 'should hint to use --debug');
    });
  });

  describe('bw returning a non-ENOENT error', () => {
    it('prints [fail] with error detail when bw crashes (not ENOENT)', async () => {
      const { stdout, exitCode } = await runDoctor([], {
        FAKE_BW_SCENARIO: 'version-error',
      });
      assert.equal(exitCode, 1);
      assert.ok(stdout.includes('[fail] bw:'), 'should show bw check as failed');
      assert.ok(stdout.includes('error:'), 'should show error detail prefix');
      assert.ok(!stdout.includes('not found on PATH'), 'should NOT show ENOENT message');
    });
  });
});
