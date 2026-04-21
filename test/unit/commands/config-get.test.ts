import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configGet } from '../../../src/commands/config-get.js';
import type { Config } from '../../../src/config/schema.js';

const defaultConfig: Config = {
  version: 1,
  core: { output_format: 'text', color: 'auto', verbose: 0, quiet: false },
  paths: { pending_queue: null, bw_binary: null },
  audit: { skip_categories: [], limit_per_category: null, save_pending_on_sigint: true },
  strength: {
    min_length: 12, require_digit: true, require_symbol: true,
    min_character_classes: 2, zxcvbn_min_score: 2, extra_common_passwords: [],
  },
  dedup: {
    name_similarity_threshold: 3, treat_www_as_same_domain: true,
    case_insensitive_usernames: true, compare_only_primary_uri: true,
  },
  folders: { preserve_existing: true, enabled_categories: [], custom_rules: [] },
  ui: { mask_character: '•', show_revision_date: true, color_scheme: 'auto', prompt_style: 'clack' },
  logging: { format: 'text', level: 'info' },
};

describe('configGet', () => {
  it('returns a top-level value', () => {
    const result = configGet(defaultConfig, 'version');
    assert.deepEqual(result, { ok: true, value: 1 });
  });

  it('returns a nested value', () => {
    const result = configGet(defaultConfig, 'strength.min_length');
    assert.deepEqual(result, { ok: true, value: 12 });
  });

  it('returns an error for non-existent key', () => {
    const result = configGet(defaultConfig, 'nonexistent');
    assert.equal(result.ok, false);
  });

  it('returns an error for deeply non-existent key', () => {
    const result = configGet(defaultConfig, 'strength.nonexistent');
    assert.equal(result.ok, false);
  });

  it('returns a section object', () => {
    const result = configGet(defaultConfig, 'core');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.value as { output_format: string }).output_format, 'text');
    }
  });
});
