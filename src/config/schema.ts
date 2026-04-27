import { z } from 'zod';

const CustomRuleSchema = z.object({
  folder: z.string().min(1).describe('Target folder name for matched items'),
  keywords: z.array(z.string().min(1)).min(1).describe('Keywords to match against item names and URIs'),
}).strict().describe('A custom folder classification rule');

const CoreSchema = z.object({
  output_format: z.enum(['text', 'json']).default('text').describe('Output format for CLI results'),
  color: z.enum(['auto', 'always', 'never']).default('auto').describe('Color mode for terminal output'),
  verbose: z.number().int().min(0).max(2).default(0).describe('Verbosity level (0=normal, 1=verbose, 2=debug)'),
  quiet: z.boolean().default(false).describe('Suppress non-essential output'),
}).strict().describe('Core CLI behavior settings');

const PathsSchema = z.object({
  pending_queue: z.string().nullable().default(null).describe('Custom path for the pending operations queue file'),
  bw_binary: z.string().nullable().default(null).describe('Custom path to the Bitwarden CLI binary'),
}).strict().describe('File path overrides');

const AuditSchema = z.object({
  skip_categories: z.array(z.string()).default([]).describe('Finding categories to skip during audit'),
  limit_per_category: z.number().int().positive().nullable().default(null)
    .describe('Maximum findings to show per category (null = unlimited)'),
  save_pending_on_sigint: z.boolean().default(true).describe('Save pending operations on SIGINT'),
}).strict().describe('Audit behavior settings');

const StrengthSchema = z.object({
  min_length: z.number().int().positive().default(12).describe('Minimum acceptable password length'),
  require_digit: z.boolean().default(true).describe('Require at least one digit in passwords'),
  require_symbol: z.boolean().default(true).describe('Require at least one symbol in passwords'),
  min_character_classes: z.number().int().min(1).max(4).default(2)
    .describe('Minimum distinct character classes (lowercase, uppercase, digit, symbol)'),
  zxcvbn_min_score: z.number().int().min(0).max(4).default(2)
    .describe('Minimum zxcvbn strength score (0=weakest, 4=strongest)'),
  extra_common_passwords: z.array(z.string()).default([])
    .describe('Additional passwords to treat as common/weak'),
}).strict().describe('Password strength policy settings');

const DedupSchema = z.object({
  name_similarity_threshold: z.number().int().min(0).default(3)
    .describe('Levenshtein distance threshold for near-duplicate detection (0 = exact only)'),
  treat_www_as_same_domain: z.boolean().default(true)
    .describe('Treat www.example.com and example.com as the same domain'),
  case_insensitive_usernames: z.boolean().default(true)
    .describe('Ignore case when comparing usernames for duplicates'),
  compare_only_primary_uri: z.boolean().default(true)
    .describe('Only compare the first URI when detecting duplicates'),
}).strict().describe('Duplicate detection settings');

const DEFAULT_CATEGORIES = [
  'Banking & Finance', 'Email', 'Social', 'Shopping', 'Development',
  'Entertainment', 'Utilities', 'Government & ID', 'Health',
] as const;

const FoldersSchema = z.object({
  preserve_existing: z.boolean().default(true)
    .describe('Keep items in their current folder if already assigned'),
  enabled_categories: z.array(z.string()).default([...DEFAULT_CATEGORIES])
    .describe('Folder categories available for auto-classification'),
  custom_rules: z.array(CustomRuleSchema).default([])
    .describe('Custom keyword-based folder classification rules (evaluated before built-ins)'),
}).strict().describe('Folder organization settings');

const UiSchema = z.object({
  mask_character: z.string().min(1).max(4).default('\u2022')
    .describe('Character used to mask passwords in output'),
  show_revision_date: z.boolean().default(true)
    .describe('Show item revision dates during review'),
  color_scheme: z.enum(['auto', 'light', 'dark']).default('auto')
    .describe('UI color scheme'),
  prompt_style: z.enum(['clack', 'plain']).default('clack')
    .describe('Prompt toolkit (clack = rich TUI, plain = basic readline fallback)'),
}).strict().describe('User interface settings');

const LoggingSchema = z.object({
  format: z.enum(['text', 'json']).default('text').describe('Log output format'),
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info').describe('Minimum log level'),
}).strict().describe('Logging configuration');

const SECTION_KEYS = ['core', 'paths', 'audit', 'strength', 'dedup', 'folders', 'ui', 'logging'] as const;

const RawConfigSchema = z.object({
  version: z.literal(1).describe('Config file format version (must be 1)'),
  core: CoreSchema.optional(),
  paths: PathsSchema.optional(),
  audit: AuditSchema.optional(),
  strength: StrengthSchema.optional(),
  dedup: DedupSchema.optional(),
  folders: FoldersSchema.optional(),
  ui: UiSchema.optional(),
  logging: LoggingSchema.optional(),
}).strict().describe('seiton configuration');

export { RawConfigSchema as ConfigSchema };

export const ConfigExampleOverrides = {
  paths: {
    bw_binary: '/usr/local/bin/bw',
  },
  audit: {
    skip_categories: ['weak'],
    limit_per_category: 25,
  },
  strength: {
    extra_common_passwords: ['companyname2024'],
  },
  folders: {
    custom_rules: [
      { folder: 'Crypto', keywords: ['binance', 'coinbase', 'kraken'] },
    ],
  },
} as const;

export function parseConfig(raw: unknown): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const preprocessed = typeof raw === 'object' && raw !== null ? { ...raw } : raw;
  if (typeof preprocessed === 'object' && preprocessed !== null) {
    delete (preprocessed as Record<string, unknown>)['$schema'];
    for (const key of SECTION_KEYS) {
      if (!(key in preprocessed)) {
        (preprocessed as Record<string, unknown>)[key] = {};
      }
    }
  }
  return RawConfigSchema.safeParse(preprocessed) as
    | { success: true; data: Config }
    | { success: false; error: z.ZodError };
}

export type Config = z.output<typeof RawConfigSchema> & {
  version: 1;
  core: z.output<typeof CoreSchema>;
  paths: z.output<typeof PathsSchema>;
  audit: z.output<typeof AuditSchema>;
  strength: z.output<typeof StrengthSchema>;
  dedup: z.output<typeof DedupSchema>;
  folders: z.output<typeof FoldersSchema>;
  ui: z.output<typeof UiSchema>;
  logging: z.output<typeof LoggingSchema>;
};

export type CustomRule = z.infer<typeof CustomRuleSchema>;

const REDACTED_KEYS = new Set(['bw_binary', 'pending_queue']);

export function redactConfig(config: Config): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config, (key, value) => {
    if (REDACTED_KEYS.has(key) && typeof value === 'string') {
      return '***REDACTED***';
    }
    return value as unknown;
  })) as Record<string, unknown>;
}
