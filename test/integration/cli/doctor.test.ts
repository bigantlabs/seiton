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

describe('seiton doctor', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-doctor-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  describe('--help flag', () => {
    it('prints help text and exits 0', async () => {
      const { stdout, exitCode } = await runDoctor(['--help']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('seiton doctor'));
      assert.ok(stdout.includes('Usage:'));
      assert.ok(stdout.includes('Flags:'));
      assert.ok(stdout.includes('Exit Codes:'));
    });

    it('prints help text with -h short flag', async () => {
      const { stdout, exitCode } = await runDoctor(['-h']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('seiton doctor'));
    });
  });

  describe('happy path — all checks pass', () => {
    it('prints [ok] for each check and exits 0', async () => {
      const { stdout, exitCode } = await runDoctor();
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('[ok] node:'));
      assert.ok(stdout.includes('[ok] bw:'));
      assert.ok(stdout.includes('[ok] session:'));
      assert.ok(stdout.includes('[ok] config:'));
    });
  });

  describe('bw not found', () => {
    it('prints [fail] for bw and exits 1', async () => {
      const { stdout, exitCode } = await runDoctor([], {
        PATH: '/nonexistent',
      });
      assert.equal(exitCode, 1);
      assert.ok(stdout.includes('[fail] bw:'));
      assert.ok(stdout.includes('not found'));
    });
  });

  describe('BW_SESSION not set', () => {
    it('prints [fail] for session and exits 1', async () => {
      const { stdout, exitCode } = await runDoctor([], {
        BW_SESSION: undefined,
      });
      assert.equal(exitCode, 1);
      assert.ok(stdout.includes('[fail] session:'));
      assert.ok(stdout.includes('BW_SESSION is not set'));
    });
  });

  describe('invalid config file', () => {
    it('prints [fail] for config and exits 1', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), '{ invalid json');

      const { stdout, exitCode } = await runDoctor();
      assert.equal(exitCode, 1);
      assert.ok(stdout.includes('[fail] config:'));
    });
  });

  describe('invalid arguments', () => {
    it('exits 64 with error message on unknown flag', async () => {
      const { stderr, exitCode } = await runDoctor(['--unknown-flag']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('invalid arguments'));
      assert.ok(stderr.includes('seiton doctor --help'));
    });
  });

  describe('--debug flag', () => {
    it('is accepted without error', async () => {
      const { exitCode } = await runDoctor(['--debug']);
      assert.equal(exitCode, 0);
    });
  });

  describe('--config flag', () => {
    it('uses the specified config file path', async () => {
      const configPath = join(tempHome, 'custom-config.json');
      await writeFile(configPath, JSON.stringify({ version: 1 }));
      const { stdout, exitCode } = await runDoctor(['--config', configPath]);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('[ok] config:'));
    });

    it('fails when specified config does not exist', async () => {
      const { stdout, exitCode } = await runDoctor([
        '--config', join(tempHome, 'nonexistent.json'),
      ]);
      assert.equal(exitCode, 1);
      assert.ok(stdout.includes('[fail] config:'));
    });
  });
});
