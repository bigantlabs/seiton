import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli, type RunResult } from '../../helpers/run-cli.js';

let tempHome: string;

async function runConfig(args: string[] = [], envOverrides: Record<string, string | undefined> = {}): Promise<RunResult> {
  return runCli(['config', ...args], {
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

describe('seiton config CLI wrapper', () => {
  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'seiton-config-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  describe('top-level help', () => {
    it('prints help text and exits 0 with --help', async () => {
      const { stdout, exitCode } = await runConfig(['--help']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('seiton config'));
      assert.ok(stdout.includes('Subcommands:'));
    });

    it('prints help when no subcommand given', async () => {
      const { stdout, exitCode } = await runConfig([]);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('seiton config'));
    });
  });

  describe('config show', () => {
    it('displays config and exits 0', async () => {
      const { stdout, exitCode } = await runConfig(['show']);
      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout) as { version: number };
      assert.equal(parsed.version, 1);
    });
  });

  describe('config path', () => {
    it('reports no config file when none exists', async () => {
      const { stdout, exitCode } = await runConfig(['path']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('No config file found') || stdout.includes('.config/seiton'));
    });

    it('prints path when config file exists', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), '{ "version": 1 }');

      const { stdout, exitCode } = await runConfig(['path']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('config.json'));
    });
  });

  describe('config get', () => {
    it('exits 64 when no key given', async () => {
      const { stderr, exitCode } = await runConfig(['get']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('key path required'));
    });

    it('returns a config value', async () => {
      const { stdout, exitCode } = await runConfig(['get', 'strength.min_length']);
      assert.equal(exitCode, 0);
      assert.equal(stdout.trim(), '12');
    });

    it('exits 64 on non-existent key', async () => {
      const { stderr, exitCode } = await runConfig(['get', 'nonexistent.key']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('does not exist'));
    });
  });

  describe('config set', () => {
    it('sets a simple value', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), '{ "version": 1 }');

      const { exitCode } = await runConfig(['set', 'strength.min_length', '16']);
      assert.equal(exitCode, 0);

      const content = await readFile(join(configDir, 'config.json'), 'utf-8');
      const config = JSON.parse(content) as { strength?: { min_length?: number } };
      assert.equal(config.strength?.min_length, 16);
    });

    it('unsets a key with --unset', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ version: 1, strength: { min_length: 20 } }),
      );

      const { exitCode, stdout } = await runConfig(['set', 'strength.min_length', '--unset']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Set strength.min_length'));

      const content = await readFile(join(configDir, 'config.json'), 'utf-8');
      const config = JSON.parse(content) as { strength?: { min_length?: number } };
      assert.equal(config.strength?.min_length, undefined);
    });

    it('exits 64 when setting an invalid value that fails validation', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), '{ "version": 1 }');

      const { stderr, exitCode } = await runConfig(['set', 'core.color', 'invalid_value']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('Invalid config'));
    });

    it('exits 64 when no key is provided', async () => {
      const { stderr, exitCode } = await runConfig(['set']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('key path required'));
    });

    it('exits 64 when setting unknown key on strict section', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.json'), '{ "version": 1 }');

      const { stderr, exitCode } = await runConfig(['set', 'strength.nonexistent_key', 'value']);
      assert.equal(exitCode, 64);
      assert.ok(stderr.includes('Invalid config'));
    });
  });

  describe('config reset', () => {
    it('resets config with --yes', async () => {
      const configDir = join(tempHome, '.config', 'seiton');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({ version: 1, strength: { min_length: 20 } }),
      );

      const { exitCode, stdout } = await runConfig(['reset', '--yes']);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('reset to defaults'));

      const content = await readFile(join(configDir, 'config.json'), 'utf-8');
      const config = JSON.parse(content) as { version: number; strength?: unknown };
      assert.equal(config.version, 1);
      assert.equal(config.strength, undefined);
    });
  });
});
