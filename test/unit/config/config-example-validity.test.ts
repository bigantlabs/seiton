import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigExampleOverrides, parseConfig } from '../../../src/config/schema.js';

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      result[key] = deepMerge(tv, sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

describe('ConfigExampleOverrides validity', () => {
  it('deep-merged example parses successfully through parseConfig', () => {
    const defaultsResult = parseConfig({ version: 1 });
    assert.ok(defaultsResult.success, 'defaults must parse');

    const merged = deepMerge(
      defaultsResult.data as unknown as Record<string, unknown>,
      ConfigExampleOverrides as unknown as Record<string, unknown>,
    );

    const exampleResult = parseConfig(merged);
    assert.ok(
      exampleResult.success,
      `example config failed validation: ${!exampleResult.success ? exampleResult.error.message : ''}`,
    );
  });

  it('parsed example preserves override values', () => {
    const defaultsResult = parseConfig({ version: 1 });
    assert.ok(defaultsResult.success);

    const merged = deepMerge(
      defaultsResult.data as unknown as Record<string, unknown>,
      ConfigExampleOverrides as unknown as Record<string, unknown>,
    );

    const exampleResult = parseConfig(merged);
    assert.ok(exampleResult.success);

    const data = exampleResult.data;
    assert.equal(data.paths.bw_binary, '/usr/local/bin/bw');
    assert.deepEqual(data.audit.skip_categories, ['weak']);
    assert.equal(data.audit.limit_per_category, 25);
    assert.deepEqual(data.strength.extra_common_passwords, ['companyname2024']);
    assert.equal(data.folders.custom_rules.length, 1);
    assert.equal(data.folders.custom_rules[0].folder, 'Crypto');
    assert.deepEqual(data.folders.custom_rules[0].keywords, ['binance', 'coinbase', 'kraken']);
  });

  it('parsed example retains default values for non-overridden fields', () => {
    const defaultsResult = parseConfig({ version: 1 });
    assert.ok(defaultsResult.success);

    const merged = deepMerge(
      defaultsResult.data as unknown as Record<string, unknown>,
      ConfigExampleOverrides as unknown as Record<string, unknown>,
    );

    const exampleResult = parseConfig(merged);
    assert.ok(exampleResult.success);

    const data = exampleResult.data;
    assert.equal(data.version, 1);
    assert.equal(data.core.output_format, 'text');
    assert.equal(data.core.color, 'auto');
    assert.equal(data.core.verbose, 0);
    assert.equal(data.core.quiet, false);
    assert.equal(data.strength.min_length, 12);
    assert.equal(data.dedup.name_similarity_threshold, 3);
    assert.equal(data.dedup.treat_www_as_same_domain, true);
    assert.equal(data.ui.prompt_style, 'clack');
    assert.equal(data.folders.preserve_existing, true);
  });

  it('example overrides alone (without defaults) parse when passed through parseConfig', () => {
    const result = parseConfig({
      version: 1,
      ...ConfigExampleOverrides,
    });
    assert.ok(
      result.success,
      `overrides-only config failed validation: ${!result.success ? result.error.message : ''}`,
    );
  });
});
