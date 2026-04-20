import { z } from 'zod';

const CustomRuleSchema = z.object({
  folder: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
}).strict();

const CoreSchema = z.object({
  output_format: z.enum(['text', 'json']).default('text'),
  color: z.enum(['auto', 'always', 'never']).default('auto'),
  verbose: z.number().int().min(0).max(2).default(0),
  quiet: z.boolean().default(false),
}).strict();

const PathsSchema = z.object({
  pending_queue: z.string().nullable().default(null),
  bw_binary: z.string().nullable().default(null),
}).strict();

const AuditSchema = z.object({
  skip_categories: z.array(z.string()).default([]),
  limit_per_category: z.number().int().positive().nullable().default(null),
  save_pending_on_sigint: z.boolean().default(true),
}).strict();

const StrengthSchema = z.object({
  min_length: z.number().int().positive().default(12),
  require_digit: z.boolean().default(true),
  require_symbol: z.boolean().default(true),
  min_character_classes: z.number().int().min(1).max(4).default(2),
  zxcvbn_min_score: z.number().int().min(0).max(4).default(2),
  extra_common_passwords: z.array(z.string()).default([]),
}).strict();

const DedupSchema = z.object({
  name_similarity_threshold: z.number().int().min(0).default(3),
  treat_www_as_same_domain: z.boolean().default(true),
  case_insensitive_usernames: z.boolean().default(true),
  compare_only_primary_uri: z.boolean().default(true),
}).strict();

const DEFAULT_CATEGORIES = [
  'Banking & Finance', 'Email', 'Social', 'Shopping', 'Development',
  'Entertainment', 'Utilities', 'Government & ID', 'Health', 'Other',
] as const;

const FoldersSchema = z.object({
  preserve_existing: z.boolean().default(true),
  enabled_categories: z.array(z.string()).default([...DEFAULT_CATEGORIES]),
  custom_rules: z.array(CustomRuleSchema).default([]),
}).strict();

const UiSchema = z.object({
  mask_character: z.string().min(1).max(4).default('\u2022'),
  show_revision_date: z.boolean().default(true),
  color_scheme: z.enum(['auto', 'light', 'dark']).default('auto'),
  prompt_style: z.enum(['clack', 'plain']).default('clack'),
}).strict();

const LoggingSchema = z.object({
  format: z.enum(['text', 'json']).default('text'),
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).strict();

const SECTION_KEYS = ['core', 'paths', 'audit', 'strength', 'dedup', 'folders', 'ui', 'logging'] as const;

const RawConfigSchema = z.object({
  version: z.literal(1),
  core: CoreSchema.optional(),
  paths: PathsSchema.optional(),
  audit: AuditSchema.optional(),
  strength: StrengthSchema.optional(),
  dedup: DedupSchema.optional(),
  folders: FoldersSchema.optional(),
  ui: UiSchema.optional(),
  logging: LoggingSchema.optional(),
}).strict();

export function parseConfig(raw: unknown): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const preprocessed = typeof raw === 'object' && raw !== null ? { ...raw } : raw;
  if (typeof preprocessed === 'object' && preprocessed !== null) {
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
