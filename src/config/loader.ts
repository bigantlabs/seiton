import { readFile } from 'node:fs/promises';
import { configDiscoveryStack, type ConfigPathOptions } from './paths.js';
import { parseConfig, type Config } from './schema.js';
import { z } from 'zod';
import type { Logger } from '../adapters/logging.js';

export class ConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export interface LoadConfigOptions extends ConfigPathOptions {
  logger?: Logger;
}

export async function loadConfig(opts: LoadConfigOptions = {}): Promise<Config> {
  opts.logger?.debug('config: loading', { cliConfigPath: opts.cliConfigPath });
  const fileConfig = await loadConfigFile(opts);
  const withEnv = applyEnvOverrides(fileConfig);
  const config = validateConfig(withEnv);
  opts.logger?.debug('config: loaded successfully');
  return config;
}

async function loadConfigFile(opts: LoadConfigOptions): Promise<Record<string, unknown>> {
  const candidates = configDiscoveryStack(opts);

  for (const candidate of candidates) {
    let raw: string;
    try {
      raw = await readFile(candidate.path, 'utf-8');
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 'ENOENT') {
        if (candidate.hardFail) {
          throw new ConfigError('CONFIG_NOT_FOUND', `Config file not found at ${candidate.path} (via ${candidate.source}): ${msg}`);
        }
        continue;
      }
      throw new ConfigError('CONFIG_READ_ERROR', `Failed to read config at ${candidate.path} (via ${candidate.source}): ${msg}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigError('CONFIG_PARSE_ERROR', `Failed to parse config at ${candidate.path}: invalid JSON`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError('CONFIG_VALIDATION', `Config at ${candidate.path} must be a JSON object, got ${Array.isArray(parsed) ? 'array' : parsed === null ? 'null' : typeof parsed}`);
    }
    return parsed as Record<string, unknown>;
  }

  return { version: 1 };
}

const ENV_MAP: ReadonlyMap<string, { path: readonly string[]; type: 'string' | 'number' | 'boolean' }> = new Map([
  ['SEITON_CORE_OUTPUT_FORMAT', { path: ['core', 'output_format'], type: 'string' }],
  ['SEITON_CORE_COLOR', { path: ['core', 'color'], type: 'string' }],
  ['SEITON_CORE_VERBOSE', { path: ['core', 'verbose'], type: 'number' }],
  ['SEITON_CORE_QUIET', { path: ['core', 'quiet'], type: 'boolean' }],
  ['SEITON_PATHS_PENDING_QUEUE', { path: ['paths', 'pending_queue'], type: 'string' }],
  ['SEITON_PATHS_BW_BINARY', { path: ['paths', 'bw_binary'], type: 'string' }],
  ['SEITON_AUDIT_SAVE_PENDING_ON_SIGINT', { path: ['audit', 'save_pending_on_sigint'], type: 'boolean' }],
  ['SEITON_STRENGTH_MIN_LENGTH', { path: ['strength', 'min_length'], type: 'number' }],
  ['SEITON_STRENGTH_REQUIRE_DIGIT', { path: ['strength', 'require_digit'], type: 'boolean' }],
  ['SEITON_STRENGTH_REQUIRE_SYMBOL', { path: ['strength', 'require_symbol'], type: 'boolean' }],
  ['SEITON_STRENGTH_MIN_CHARACTER_CLASSES', { path: ['strength', 'min_character_classes'], type: 'number' }],
  ['SEITON_STRENGTH_ZXCVBN_MIN_SCORE', { path: ['strength', 'zxcvbn_min_score'], type: 'number' }],
  ['SEITON_DEDUP_NAME_SIMILARITY_THRESHOLD', { path: ['dedup', 'name_similarity_threshold'], type: 'number' }],
  ['SEITON_DEDUP_TREAT_WWW_AS_SAME_DOMAIN', { path: ['dedup', 'treat_www_as_same_domain'], type: 'boolean' }],
  ['SEITON_DEDUP_CASE_INSENSITIVE_USERNAMES', { path: ['dedup', 'case_insensitive_usernames'], type: 'boolean' }],
  ['SEITON_DEDUP_COMPARE_ONLY_PRIMARY_URI', { path: ['dedup', 'compare_only_primary_uri'], type: 'boolean' }],
  ['SEITON_FOLDERS_PRESERVE_EXISTING', { path: ['folders', 'preserve_existing'], type: 'boolean' }],
  ['SEITON_UI_MASK_CHARACTER', { path: ['ui', 'mask_character'], type: 'string' }],
  ['SEITON_UI_SHOW_REVISION_DATE', { path: ['ui', 'show_revision_date'], type: 'boolean' }],
  ['SEITON_UI_COLOR_SCHEME', { path: ['ui', 'color_scheme'], type: 'string' }],
  ['SEITON_UI_PROMPT_STYLE', { path: ['ui', 'prompt_style'], type: 'string' }],
  ['SEITON_LOGGING_FORMAT', { path: ['logging', 'format'], type: 'string' }],
  ['SEITON_LOGGING_LEVEL', { path: ['logging', 'level'], type: 'string' }],
]);

export function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(config);

  for (const [envKey, { path, type }] of ENV_MAP) {
    const rawValue = process.env[envKey];
    if (rawValue === undefined) continue;

    const converted = convertEnvValue(rawValue, type, envKey);
    setNestedValue(result, path, converted);
  }

  return result;
}

function convertEnvValue(raw: string, type: 'string' | 'number' | 'boolean', envKey: string): string | number | boolean {
  switch (type) {
    case 'string':
      return raw;
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new ConfigError('CONFIG_ENV_TYPE', `Environment variable ${envKey}=${raw} is not a valid number`);
      }
      return n;
    }
    case 'boolean': {
      const lower = raw.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      throw new ConfigError('CONFIG_ENV_TYPE', `Environment variable ${envKey}=${raw} is not a valid boolean (use true/false/1/0)`);
    }
  }
}

function setNestedValue(obj: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (current[key] === undefined || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[path[path.length - 1]!] = value;
}

export function validateConfig(raw: Record<string, unknown>): Config {
  const result = parseConfig(raw);
  if (result.success) return result.data;

  const issues = result.error.issues.map(formatZodIssue);
  throw new ConfigError('CONFIG_VALIDATION', `Invalid configuration:\n${issues.join('\n')}`);
}

function formatZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.length ? issue.path.join('.') : '(root)';
  if (issue.code === 'unrecognized_keys') {
    return `  - ${path}: unknown key(s): ${issue.keys.join(', ')}`;
  }
  return `  - ${path}: ${issue.message}`;
}
