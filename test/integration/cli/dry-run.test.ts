import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[] = []): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' } },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

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
