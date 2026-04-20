import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRY = join(ROOT, 'src', 'bw-organize.ts');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<RunResult> {
  const mergedEnv = { ...process.env, NODE_NO_WARNINGS: '1', ...env };
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      { cwd: ROOT, env: mergedEnv },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}

describe('seiton config show', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-integ-'));
  });

  it('prints valid JSON with defaults when no config file exists', async () => {
    const { stdout, exitCode } = await runCli(
      ['config', 'show'],
      { HOME: tmp },
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    assert.equal(parsed['version'], 1);
    const core = parsed['core'] as Record<string, unknown>;
    assert.equal(core['output_format'], 'text');
  });

  it('loads config from --config flag', async () => {
    const cfgPath = join(tmp, 'my-config.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      strength: { min_length: 24 },
    }));
    const { stdout, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const strength = parsed['strength'] as Record<string, unknown>;
    assert.equal(strength['min_length'], 24);
  });

  it('exits non-zero when --config points to missing file', async () => {
    const { stderr, exitCode } = await runCli(
      ['config', 'show', '--config', join(tmp, 'nope.json')],
    );
    assert.notEqual(exitCode, 0);
    assert.ok(stderr.includes('not found') || stderr.includes('Config file'));
  });

  it('exits non-zero for invalid JSON', async () => {
    const cfgPath = join(tmp, 'broken.json');
    await writeFile(cfgPath, '{not valid json!!!}');
    const { stderr, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
    );
    assert.notEqual(exitCode, 0);
    assert.ok(stderr.includes('invalid JSON'));
  });

  it('exits non-zero for invalid schema (wrong type)', async () => {
    const cfgPath = join(tmp, 'badtype.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      strength: { min_length: 'not_a_number' },
    }));
    const { stderr, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
    );
    assert.notEqual(exitCode, 0);
    assert.ok(stderr.includes('min_length'));
  });

  it('exits non-zero for unknown keys', async () => {
    const cfgPath = join(tmp, 'unknown.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      runtime: { max_parallelism: 4 },
    }));
    const { stderr, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
    );
    assert.notEqual(exitCode, 0);
    assert.ok(stderr.includes('runtime') || stderr.includes('unknown'));
  });

  it('env vars override config file values', async () => {
    const cfgPath = join(tmp, 'base.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      core: { verbose: 0 },
    }));
    const { stdout, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
      { SEITON_CORE_VERBOSE: '2' },
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const core = parsed['core'] as Record<string, unknown>;
    assert.equal(core['verbose'], 2);
  });

  it('redacts sensitive path values', async () => {
    const cfgPath = join(tmp, 'paths.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      paths: { bw_binary: '/usr/local/bin/bw', pending_queue: '/home/.state/pq' },
    }));
    const { stdout, exitCode } = await runCli(
      ['config', 'show', '--config', cfgPath],
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const paths = parsed['paths'] as Record<string, unknown>;
    assert.equal(paths['bw_binary'], '***REDACTED***');
    assert.equal(paths['pending_queue'], '***REDACTED***');
  });

  it('discovers config from SEITON_CONFIG env var', async () => {
    const cfgPath = join(tmp, 'env-config.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      dedup: { name_similarity_threshold: 5 },
    }));
    const { stdout, exitCode } = await runCli(
      ['config', 'show'],
      { HOME: tmp, SEITON_CONFIG: cfgPath },
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const dedup = parsed['dedup'] as Record<string, unknown>;
    assert.equal(dedup['name_similarity_threshold'], 5);
  });

  it('SEITON_CONFIG exits non-zero when file is missing', async () => {
    const { stderr, exitCode } = await runCli(
      ['config', 'show'],
      { HOME: tmp, SEITON_CONFIG: join(tmp, 'missing.json') },
    );
    assert.notEqual(exitCode, 0);
    assert.ok(stderr.includes('not found') || stderr.includes('Config file'));
  });

  it('discovers config from XDG path in temp home', async () => {
    const xdgDir = join(tmp, '.config', 'seiton');
    await mkdir(xdgDir, { recursive: true });
    await writeFile(join(xdgDir, 'config.json'), JSON.stringify({
      version: 1,
      dedup: { name_similarity_threshold: 9 },
    }));
    const { stdout, exitCode } = await runCli(
      ['config', 'show'],
      { HOME: tmp },
    );
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const dedup = parsed['dedup'] as Record<string, unknown>;
    assert.equal(dedup['name_similarity_threshold'], 9);
  });
});
