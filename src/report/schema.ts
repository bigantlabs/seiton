import { z } from 'zod';

export const REPORT_SCHEMA_VERSION = 1;

const RedactedLoginSchema = z.object({
  username: z.string().nullable(),
  uris: z.array(z.string()),
  password: z.string(),
  totp: z.string(),
});

const RedactedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.number(),
  folderId: z.string().nullable(),
  login: RedactedLoginSchema.nullable(),
  revisionDate: z.string(),
});

const DuplicateFindingSchema = z.object({
  category: z.literal('duplicates'),
  key: z.string(),
  items: z.array(RedactedItemSchema),
});

const ReuseFindingSchema = z.object({
  category: z.literal('reuse'),
  items: z.array(RedactedItemSchema),
});

const WeakFindingSchema = z.object({
  category: z.literal('weak'),
  item: RedactedItemSchema,
  score: z.number(),
  reasons: z.array(z.string()),
});

const MissingFindingSchema = z.object({
  category: z.literal('missing'),
  item: RedactedItemSchema,
  missingFields: z.array(z.string()),
});

const FolderFindingSchema = z.object({
  category: z.literal('folders'),
  item: RedactedItemSchema,
  suggestedFolder: z.string(),
});

const NearDuplicateFindingSchema = z.object({
  category: z.literal('near_duplicates'),
  items: z.array(RedactedItemSchema),
  maxDistance: z.number(),
});

const ReportFindingSchema = z.discriminatedUnion('category', [
  DuplicateFindingSchema,
  ReuseFindingSchema,
  WeakFindingSchema,
  MissingFindingSchema,
  FolderFindingSchema,
  NearDuplicateFindingSchema,
]);

export const ReportSchema = z.object({
  version: z.literal(REPORT_SCHEMA_VERSION),
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    totalFolders: z.number().int().nonnegative(),
    totalFindings: z.number().int().nonnegative(),
  }),
  findings: z.array(ReportFindingSchema),
});

export type Report = z.infer<typeof ReportSchema>;
