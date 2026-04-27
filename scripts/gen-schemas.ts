import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { ConfigSchema, ConfigExampleOverrides, parseConfig } from '../src/config/schema.js';
import { ReportSchema } from '../src/report/schema.js';
import { PendingQueueSchema } from '../src/lib/domain/pending.js';

const ROOT = join(import.meta.dirname, '..');

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
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

function writeArtifact(relPath: string, content: string): void {
  const absPath = join(ROOT, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content + '\n', 'utf-8');
}

// 1. JSON Schema
const jsonSchema = z.toJSONSchema(ConfigSchema, { target: 'draft-2020-12' });
writeArtifact('schemas/config.schema.json', JSON.stringify(jsonSchema, null, 2));

// 2. Defaults config — produced by parsing an empty config through zod
const defaultsResult = parseConfig({ version: 1 });
if (!defaultsResult.success) {
  console.error('Failed to produce defaults:', defaultsResult.error.message);
  process.exit(1);
}
writeArtifact('config/defaults.config.json', JSON.stringify(defaultsResult.data, null, 2));

// 3. Example config — deep-merge defaults with illustrative overrides
const example = deepMerge(
  defaultsResult.data as unknown as Record<string, unknown>,
  ConfigExampleOverrides as unknown as Record<string, unknown>,
);
writeArtifact('config/example.config.json', JSON.stringify(example, null, 2));

// 4. Report JSON Schema
const reportJsonSchema = z.toJSONSchema(ReportSchema, { target: 'draft-2020-12' });
writeArtifact('schemas/report-v1.schema.json', JSON.stringify(reportJsonSchema, null, 2));

// 5. Pending Queue JSON Schema
const pendingJsonSchema = z.toJSONSchema(PendingQueueSchema, { target: 'draft-2020-12' });
writeArtifact('schemas/pending.schema.json', JSON.stringify(pendingJsonSchema, null, 2));

console.log('Generated:');
console.log('  schemas/config.schema.json');
console.log('  schemas/report-v1.schema.json');
console.log('  schemas/pending.schema.json');
console.log('  config/defaults.config.json');
console.log('  config/example.config.json');
