import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, redactConfig } from '../../../src/config/schema.js';

describe('ConfigSchema', () => {
  it('validates a minimal config with only version', () => {
    const result = parseConfig({ version: 1 });
    assert.ok(result.success);
    assert.equal(result.data.version, 1);
    assert.equal(result.data.core.output_format, 'text');
    assert.equal(result.data.strength.min_length, 12);
  });

  it('validates a full config', () => {
    const full = {
      version: 1,
      core: { output_format: 'json', color: 'never', verbose: 2, quiet: true },
      paths: { pending_queue: '/tmp/pq', bw_binary: '/usr/bin/bw' },
      audit: { skip_categories: ['weak'], limit_per_category: 10, save_pending_on_sigint: false },
      strength: {
        min_length: 16, require_digit: false, require_symbol: false,
        min_character_classes: 3, zxcvbn_min_score: 3, extra_common_passwords: ['hunter2'],
      },
      dedup: {
        name_similarity_threshold: 5, treat_www_as_same_domain: false,
        case_insensitive_usernames: false, compare_only_primary_uri: false,
      },
      folders: {
        preserve_existing: false, enabled_categories: ['Email', 'Social'],
        custom_rules: [{ folder: 'Crypto', keywords: ['binance'] }],
      },
      ui: { mask_character: '*', show_revision_date: false, color_scheme: 'dark', prompt_style: 'plain' },
    };
    const result = parseConfig(full);
    assert.ok(result.success);
    assert.equal(result.data.core.output_format, 'json');
    assert.equal(result.data.strength.min_length, 16);
    assert.equal(result.data.folders.custom_rules[0]!.folder, 'Crypto');
  });

  it('fills defaults for missing optional sections', () => {
    const result = parseConfig({ version: 1 });
    assert.ok(result.success);
    assert.deepEqual(result.data.audit.skip_categories, []);
    assert.equal(result.data.audit.save_pending_on_sigint, true);
    assert.equal(result.data.dedup.treat_www_as_same_domain, true);
    assert.equal(result.data.ui.prompt_style, 'clack');
  });

  it('fills defaults for missing fields within a section', () => {
    const result = parseConfig({
      version: 1,
      core: { verbose: 2 },
    });
    assert.ok(result.success);
    assert.equal(result.data.core.verbose, 2);
    assert.equal(result.data.core.output_format, 'text');
    assert.equal(result.data.core.quiet, false);
  });

  it('rejects wrong version', () => {
    const result = parseConfig({ version: 2 });
    assert.ok(!result.success);
  });

  it('rejects missing version', () => {
    const result = parseConfig({});
    assert.ok(!result.success);
  });

  it('rejects wrong type on numeric fields', () => {
    const result = parseConfig({
      version: 1,
      strength: { min_length: 'not a number' },
    });
    assert.ok(!result.success);
    const paths = result.error.issues.map(i => i.path.join('.'));
    assert.ok(paths.some(p => p.includes('min_length')));
  });

  it('rejects unknown top-level key', () => {
    const result = parseConfig({ version: 1, bogus: true });
    assert.ok(!result.success);
  });

  it('rejects unknown key within a section', () => {
    const result = parseConfig({
      version: 1,
      core: { output_format: 'text', unknown_key: 42 },
    });
    assert.ok(!result.success);
  });

  it('rejects invalid enum value', () => {
    const result = parseConfig({
      version: 1,
      core: { color: 'rainbow' },
    });
    assert.ok(!result.success);
  });

  it('rejects verbose out of range', () => {
    const result = parseConfig({
      version: 1,
      core: { verbose: 5 },
    });
    assert.ok(!result.success);
  });

  it('rejects custom_rules with empty folder', () => {
    const result = parseConfig({
      version: 1,
      folders: { custom_rules: [{ folder: '', keywords: ['x'] }] },
    });
    assert.ok(!result.success);
  });

  it('rejects custom_rules with empty keywords', () => {
    const result = parseConfig({
      version: 1,
      folders: { custom_rules: [{ folder: 'F', keywords: [] }] },
    });
    assert.ok(!result.success);
  });

  it('respects explicit false values', () => {
    const result = parseConfig({
      version: 1,
      audit: { save_pending_on_sigint: false },
    });
    assert.ok(result.success);
    assert.equal(result.data.audit.save_pending_on_sigint, false);
  });

  it('respects explicit null for nullable fields', () => {
    const result = parseConfig({
      version: 1,
      paths: { bw_binary: null },
    });
    assert.ok(result.success);
    assert.equal(result.data.paths.bw_binary, null);
  });
});

describe('redactConfig', () => {
  it('redacts string values for sensitive keys', () => {
    const result = parseConfig({
      version: 1,
      paths: { bw_binary: '/usr/bin/bw', pending_queue: '/home/user/.state/pq' },
    });
    assert.ok(result.success);
    const redacted = redactConfig(result.data);
    const paths = redacted['paths'] as Record<string, unknown>;
    assert.equal(paths['bw_binary'], '***REDACTED***');
    assert.equal(paths['pending_queue'], '***REDACTED***');
  });

  it('does not redact null values', () => {
    const result = parseConfig({ version: 1 });
    assert.ok(result.success);
    const redacted = redactConfig(result.data);
    const paths = redacted['paths'] as Record<string, unknown>;
    assert.equal(paths['bw_binary'], null);
    assert.equal(paths['pending_queue'], null);
  });
});
