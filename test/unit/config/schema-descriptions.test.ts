import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ConfigSchema } from '../../../src/config/schema.js';

function collectMissingDescriptions(
  schema: Record<string, unknown>,
  path: string,
): string[] {
  const missing: string[] = [];
  if (typeof schema !== 'object' || schema === null) return missing;

  const props = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  if (!props) return missing;

  for (const [key, value] of Object.entries(props)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (!value['description']) {
      missing.push(fieldPath);
    }
    if (value['type'] === 'object' && value['properties']) {
      missing.push(...collectMissingDescriptions(value, fieldPath));
    }
    if (value['type'] === 'array' && typeof value['items'] === 'object') {
      const items = value['items'] as Record<string, unknown>;
      if (items['type'] === 'object' && items['properties']) {
        missing.push(...collectMissingDescriptions(items, `${fieldPath}[]`));
      }
    }
  }
  return missing;
}

describe('ConfigSchema descriptions', () => {
  it('every field in ConfigSchema has a .describe() description', () => {
    const jsonSchema = z.toJSONSchema(ConfigSchema, { target: 'draft-2020-12' });
    const missing = collectMissingDescriptions(jsonSchema as Record<string, unknown>, '');
    assert.deepEqual(missing, [], `Fields missing descriptions: ${missing.join(', ')}`);
  });

  it('root schema has a description', () => {
    const jsonSchema = z.toJSONSchema(ConfigSchema, { target: 'draft-2020-12' });
    assert.ok(
      (jsonSchema as Record<string, unknown>)['description'],
      'Root schema should have a description',
    );
  });
});
