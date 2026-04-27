import { readConfigFile, writeConfigFile, type WriteConfigResult } from './io.js';
import type { Logger } from '../adapters/logging.js';
import type { CustomRuleEntry } from '../lib/folders/types.js';

export type { CustomRuleEntry };

export async function addCustomRule(
  configFilePath: string,
  rule: CustomRuleEntry,
  logger?: Logger,
): Promise<WriteConfigResult> {
  const readResult = await readConfigFile(configFilePath);

  let data: Record<string, unknown>;
  if (readResult.ok) {
    data = readResult.data;
  } else if (readResult.code === 'NOT_FOUND') {
    data = { version: 1 };
  } else {
    return { ok: false, error: readResult.error };
  }

  let folders: Record<string, unknown>;
  let existingRules: unknown[];
  try {
    folders = ensureObject(data, 'folders');
    existingRules = ensureArray(folders, 'custom_rules');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  existingRules.push({ folder: rule.folder, keywords: [...rule.keywords] });
  folders['custom_rules'] = existingRules;
  data['folders'] = folders;

  const writeResult = await writeConfigFile(configFilePath, data);
  if (writeResult.ok) {
    logger?.info('config: added custom rule', { folder: rule.folder });
  } else {
    logger?.error('config: failed to add custom rule', { folder: rule.folder, error: writeResult.error });
  }
  return writeResult;
}

function ensureObject(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const val = parent[key];
  if (val === undefined) return {};
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  throw new Error(`Config key "${key}" expected an object but got ${typeof val}`);
}

function ensureArray(
  parent: Record<string, unknown>,
  key: string,
): unknown[] {
  const val = parent[key];
  if (val === undefined) return [];
  if (Array.isArray(val)) return [...val];
  throw new Error(`Config key "${key}" expected an array but got ${typeof val}`);
}
