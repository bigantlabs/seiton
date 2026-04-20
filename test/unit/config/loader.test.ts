import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, applyEnvOverrides, validateConfig, ConfigError } from '../../../src/config/loader.js';

describe('loadConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-test-'));
  });

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig({ cliConfigPath: undefined, envConfigPath: undefined });
    assert.equal(config.version, 1);
    assert.equal(config.core.output_format, 'text');
  });

  it('loads config from --config path', async () => {
    const cfgPath = join(tmp, 'config.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      strength: { min_length: 20 },
    }));
    const config = await loadConfig({ cliConfigPath: cfgPath });
    assert.equal(config.strength.min_length, 20);
    assert.equal(config.core.output_format, 'text');
  });

  it('throws ConfigError when --config path does not exist', async () => {
    await assert.rejects(
      () => loadConfig({ cliConfigPath: join(tmp, 'nonexistent.json') }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_NOT_FOUND');
        return true;
      },
    );
  });

  it('throws ConfigError for invalid JSON', async () => {
    const cfgPath = join(tmp, 'bad.json');
    await writeFile(cfgPath, '{ broken json !!!');
    await assert.rejects(
      () => loadConfig({ cliConfigPath: cfgPath }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_PARSE_ERROR');
        return true;
      },
    );
  });

  it('throws ConfigError for invalid schema', async () => {
    const cfgPath = join(tmp, 'invalid.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      strength: { min_length: 'not_a_number' },
    }));
    await assert.rejects(
      () => loadConfig({ cliConfigPath: cfgPath }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_VALIDATION');
        assert.ok(err.message.includes('min_length'));
        return true;
      },
    );
  });

  it('throws ConfigError for unknown keys', async () => {
    const cfgPath = join(tmp, 'unknown.json');
    await writeFile(cfgPath, JSON.stringify({ version: 1, bogus_section: true }));
    await assert.rejects(
      () => loadConfig({ cliConfigPath: cfgPath }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_VALIDATION');
        return true;
      },
    );
  });

  it('loads from $SEITON_CONFIG path', async () => {
    const cfgPath = join(tmp, 'env-config.json');
    await writeFile(cfgPath, JSON.stringify({
      version: 1,
      dedup: { name_similarity_threshold: 7 },
    }));
    const config = await loadConfig({ envConfigPath: cfgPath });
    assert.equal(config.dedup.name_similarity_threshold, 7);
  });
});

describe('config discovery stack precedence', () => {
  let tmp: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-disc-'));
    savedEnv['HOME'] = process.env['HOME'];
    savedEnv['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    process.env['HOME'] = tmp;
    delete process.env['XDG_CONFIG_HOME'];
  });

  afterEach(() => {
    if (savedEnv['HOME'] === undefined) delete process.env['HOME'];
    else process.env['HOME'] = savedEnv['HOME'];
    if (savedEnv['XDG_CONFIG_HOME'] === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = savedEnv['XDG_CONFIG_HOME'];
  });

  it('XDG path takes precedence over dotfile', async () => {
    const xdgDir = join(tmp, '.config', 'seiton');
    await mkdir(xdgDir, { recursive: true });
    await writeFile(join(xdgDir, 'config.json'), JSON.stringify({
      version: 1,
      core: { verbose: 2 },
    }));
    await writeFile(join(tmp, '.seitonrc.json'), JSON.stringify({
      version: 1,
      core: { verbose: 1 },
    }));

    const config = await loadConfig();
    assert.equal(config.core.verbose, 2);
  });

  it('dotfile is used when XDG path is absent', async () => {
    await writeFile(join(tmp, '.seitonrc.json'), JSON.stringify({
      version: 1,
      core: { verbose: 1 },
    }));

    const config = await loadConfig();
    assert.equal(config.core.verbose, 1);
  });
});

describe('loadConfig host isolation', () => {
  let tmp: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-iso-'));
    savedEnv['HOME'] = process.env['HOME'];
    savedEnv['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    savedEnv['SEITON_CONFIG'] = process.env['SEITON_CONFIG'];
    process.env['HOME'] = tmp;
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['SEITON_CONFIG'];
  });

  afterEach(() => {
    for (const k of ['HOME', 'XDG_CONFIG_HOME', 'SEITON_CONFIG'] as const) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('returns defaults without leaking host config when HOME points to empty temp dir', async () => {
    const config = await loadConfig();
    assert.equal(config.version, 1);
    assert.equal(config.core.output_format, 'text');
    assert.equal(config.core.verbose, 0);
    assert.equal(config.core.quiet, false);
    assert.equal(config.strength.min_length, 12);
    assert.equal(config.dedup.name_similarity_threshold, 3);
  });

  it('does not discover config from real HOME when XDG_CONFIG_HOME points to empty temp dir', async () => {
    process.env['XDG_CONFIG_HOME'] = join(tmp, 'xdg');
    const config = await loadConfig();
    assert.equal(config.version, 1);
    assert.equal(config.core.output_format, 'text');
  });
});

describe('applyEnvOverrides', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'SEITON_CORE_VERBOSE', 'SEITON_CORE_QUIET', 'SEITON_CORE_COLOR',
    'SEITON_STRENGTH_MIN_LENGTH', 'SEITON_DEDUP_TREAT_WWW_AS_SAME_DOMAIN',
  ];

  beforeEach(() => {
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('overrides a numeric value', () => {
    process.env['SEITON_CORE_VERBOSE'] = '2';
    const result = applyEnvOverrides({ version: 1 });
    assert.equal((result['core'] as Record<string, unknown>)['verbose'], 2);
  });

  it('overrides a boolean value with true', () => {
    process.env['SEITON_CORE_QUIET'] = 'true';
    const result = applyEnvOverrides({ version: 1 });
    assert.equal((result['core'] as Record<string, unknown>)['quiet'], true);
  });

  it('overrides a boolean value with 0', () => {
    process.env['SEITON_DEDUP_TREAT_WWW_AS_SAME_DOMAIN'] = '0';
    const result = applyEnvOverrides({ version: 1 });
    assert.equal((result['dedup'] as Record<string, unknown>)['treat_www_as_same_domain'], false);
  });

  it('overrides a string value', () => {
    process.env['SEITON_CORE_COLOR'] = 'never';
    const result = applyEnvOverrides({ version: 1 });
    assert.equal((result['core'] as Record<string, unknown>)['color'], 'never');
  });

  it('throws on invalid number', () => {
    process.env['SEITON_STRENGTH_MIN_LENGTH'] = 'abc';
    assert.throws(
      () => applyEnvOverrides({ version: 1 }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_ENV_TYPE');
        return true;
      },
    );
  });

  it('throws on invalid boolean', () => {
    process.env['SEITON_CORE_QUIET'] = 'maybe';
    assert.throws(
      () => applyEnvOverrides({ version: 1 }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_ENV_TYPE');
        return true;
      },
    );
  });

  it('does not override when env var is not set', () => {
    const input = { version: 1, core: { verbose: 1 } };
    const result = applyEnvOverrides(input);
    assert.equal((result['core'] as Record<string, unknown>)['verbose'], 1);
  });
});

describe('env override with schema validation conflict', () => {
  let tmp: string;
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ['SEITON_CORE_VERBOSE', 'SEITON_STRENGTH_MIN_LENGTH'];

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'seiton-envval-'));
    savedEnv['HOME'] = process.env['HOME'];
    savedEnv['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    process.env['HOME'] = tmp;
    delete process.env['XDG_CONFIG_HOME'];
    for (const k of envKeys) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ['HOME', 'XDG_CONFIG_HOME', ...envKeys]) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('throws CONFIG_VALIDATION when SEITON_CORE_VERBOSE exceeds schema max', async () => {
    process.env['SEITON_CORE_VERBOSE'] = '5';
    await assert.rejects(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_VALIDATION');
        assert.ok(err.message.includes('verbose'));
        return true;
      },
    );
  });

  it('throws CONFIG_VALIDATION when SEITON_STRENGTH_MIN_LENGTH is negative', async () => {
    process.env['SEITON_STRENGTH_MIN_LENGTH'] = '-1';
    await assert.rejects(
      () => loadConfig(),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_VALIDATION');
        assert.ok(err.message.includes('min_length'));
        return true;
      },
    );
  });
});

describe('validateConfig', () => {
  it('returns valid config', () => {
    const config = validateConfig({ version: 1 });
    assert.equal(config.version, 1);
  });

  it('throws ConfigError with path info for invalid config', () => {
    assert.throws(
      () => validateConfig({ version: 1, strength: { min_length: -5 } }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.code, 'CONFIG_VALIDATION');
        assert.ok(err.message.includes('min_length'));
        return true;
      },
    );
  });
});
