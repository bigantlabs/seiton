import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, writeFile, mkdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');
const FAKE_BW = join(ROOT, 'test', 'helpers', 'fake-bw.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runAudit(
  args: string[] = [],
  env: Record<string, string> = {},
  _options: { usePty?: boolean } = {},
): Promise<RunResult> {
  const tmp = await mkdtemp(join(tmpdir(), 'seiton-audit-'));
  const stateDir = join(tmp, '.local', 'state', 'seiton');
  await mkdir(stateDir, { recursive: true });

  const fakeBwWrapper = join(tmp, 'bw');
  await writeFile(fakeBwWrapper, `#!/usr/bin/env node\nimport '${FAKE_BW}';\n`);
  await chmod(fakeBwWrapper, 0o755);

  const wrapperScript = join(tmp, 'bw-wrapper');
  await writeFile(wrapperScript, `#!/bin/sh\nexec node --import tsx "${FAKE_BW}" "$@"\n`);
  await chmod(wrapperScript, 0o755);

  const mergedEnv: Record<string, string | undefined> = {
    ...process.env,
    NODE_NO_WARNINGS: '1',
    HOME: tmp,
    XDG_STATE_HOME: join(tmp, '.local', 'state'),
    PATH: `${dirname(wrapperScript)}:${process.env['PATH']}`,
    BW_SESSION: 'fake-session-token',
    FAKE_BW_SCENARIO: 'default',
    ...env,
  };

  delete mergedEnv['SEITON_CONFIG'];
  delete mergedEnv['XDG_CONFIG_HOME'];

  const allArgs = ['--import', 'tsx', ENTRY, 'audit', ...args];

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      allArgs,
      { cwd: ROOT, env: mergedEnv as NodeJS.ProcessEnv, timeout: 15_000 },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

describe('seiton audit', () => {
  describe('TTY enforcement', () => {
    it('exits 64 when run without a TTY', async () => {
      const { exitCode, stderr } = await runAudit();
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('interactive terminal'));
      assert.ok(stderr.includes('report'));
    });
  });

  describe('BW_SESSION requirement', () => {
    it('exits 77 when BW_SESSION is not set', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'seiton-audit-'));
      const mergedEnv: Record<string, string | undefined> = {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        HOME: tmp,
      };
      delete mergedEnv['BW_SESSION'];
      delete mergedEnv['SEITON_CONFIG'];
      delete mergedEnv['XDG_CONFIG_HOME'];

      try {
        await execFileAsync(
          process.execPath,
          ['--import', 'tsx', ENTRY, 'audit'],
          { cwd: ROOT, env: mergedEnv as NodeJS.ProcessEnv, timeout: 5_000 },
        );
        assert.fail('should have exited non-zero');
      } catch (err: unknown) {
        const e = err as { code: number; stderr: string };
        assert.equal(e.code, 64);
      }
    });
  });

  describe('--dry-run flag', () => {
    it('exits 64 without a TTY even with --dry-run', async () => {
      const { exitCode, stderr } = await runAudit(['--dry-run']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('interactive terminal'));
    });
  });

  describe('--help flag', () => {
    it('audit --help shows help and exits 0', async () => {
      const { exitCode, stdout } = await runAudit(['--help']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage:'));
    });
  });

  describe('--limit validation', () => {
    it('rejects --limit with non-integer value', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'seiton-audit-'));
      const mergedEnv: Record<string, string | undefined> = {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        HOME: tmp,
        BW_SESSION: 'test',
      };
      delete mergedEnv['SEITON_CONFIG'];
      delete mergedEnv['XDG_CONFIG_HOME'];

      try {
        await execFileAsync(
          process.execPath,
          ['--import', 'tsx', ENTRY, 'audit', '--limit', 'abc'],
          { cwd: ROOT, env: mergedEnv as NodeJS.ProcessEnv, timeout: 5_000 },
        );
        assert.fail('should have exited non-zero');
      } catch (err: unknown) {
        const e = err as { code: number; stderr: string };
        assert.equal(e.code, 64);
        assert.ok(e.stderr.includes('--limit'));
      }
    });

    it('rejects --limit 0', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'seiton-audit-'));
      const mergedEnv: Record<string, string | undefined> = {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        HOME: tmp,
        BW_SESSION: 'test',
      };
      delete mergedEnv['SEITON_CONFIG'];
      delete mergedEnv['XDG_CONFIG_HOME'];

      try {
        await execFileAsync(
          process.execPath,
          ['--import', 'tsx', ENTRY, 'audit', '--limit', '0'],
          { cwd: ROOT, env: mergedEnv as NodeJS.ProcessEnv, timeout: 5_000 },
        );
        assert.fail('should have exited non-zero');
      } catch (err: unknown) {
        const e = err as { code: number; stderr: string };
        assert.equal(e.code, 64);
      }
    });
  });

  describe('--skip flag', () => {
    it('--skip is accepted as a valid flag', async () => {
      const { exitCode } = await runAudit(['--skip', 'duplicates', '--help']);
      assert.equal(exitCode, 0);
    });
  });
});
