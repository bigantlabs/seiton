import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigSchema, ConfigExampleOverrides, parseConfig } from '../../../src/config/schema.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');

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

function readArtifact(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

describe('gen-schemas freshness', () => {
  it('schemas/config.schema.json is up-to-date with ConfigSchema', () => {
    const expected = JSON.stringify(
      z.toJSONSchema(ConfigSchema, { target: 'draft-2020-12' }),
      null, 2,
    ) + '\n';
    const actual = readArtifact('schemas/config.schema.json');
    assert.equal(actual, expected, 'schemas/config.schema.json is stale — run npm run gen:docs');
  });

  it('config/defaults.config.json is up-to-date with ConfigSchema.parse({})', () => {
    const result = parseConfig({ version: 1 });
    assert.ok(result.success);
    const expected = JSON.stringify(result.data, null, 2) + '\n';
    const actual = readArtifact('config/defaults.config.json');
    assert.equal(actual, expected, 'config/defaults.config.json is stale — run npm run gen:docs');
  });

  it('config/example.config.json is up-to-date with defaults + overrides', () => {
    const result = parseConfig({ version: 1 });
    assert.ok(result.success);
    const example = deepMerge(
      result.data as unknown as Record<string, unknown>,
      ConfigExampleOverrides as unknown as Record<string, unknown>,
    );
    const expected = JSON.stringify(example, null, 2) + '\n';
    const actual = readArtifact('config/example.config.json');
    assert.equal(actual, expected, 'config/example.config.json is stale — run npm run gen:docs');
  });

  it('example config includes at least one custom folder rule', () => {
    const example = JSON.parse(readArtifact('config/example.config.json')) as Record<string, unknown>;
    const folders = example['folders'] as Record<string, unknown>;
    const rules = folders['custom_rules'] as unknown[];
    assert.ok(rules.length >= 1, 'example should include at least one custom_rules entry');
  });

  it('example config includes at least one extra_common_passwords entry', () => {
    const example = JSON.parse(readArtifact('config/example.config.json')) as Record<string, unknown>;
    const strength = example['strength'] as Record<string, unknown>;
    const passwords = strength['extra_common_passwords'] as unknown[];
    assert.ok(passwords.length >= 1, 'example should include at least one extra_common_passwords entry');
  });

  it('JSON schema is valid draft-2020-12', () => {
    const schema = JSON.parse(readArtifact('schemas/config.schema.json')) as Record<string, unknown>;
    assert.equal(schema['$schema'], 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema['type'], 'object');
    assert.ok(schema['properties']);
  });
});
