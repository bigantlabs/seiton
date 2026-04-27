import { z } from 'zod';

export const ItemType = {
  LOGIN: 1,
  SECURE_NOTE: 2,
  CARD: 3,
  IDENTITY: 4,
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ItemTypeSchema = z.union([
  z.literal(ItemType.LOGIN),
  z.literal(ItemType.SECURE_NOTE),
  z.literal(ItemType.CARD),
  z.literal(ItemType.IDENTITY),
]);

export const BwLoginUriSchema = z.object({
  match: z.number().nullable().optional(),
  uri: z.string().nullable(),
}).passthrough();

export type BwLoginUri = z.infer<typeof BwLoginUriSchema>;

export const BwLoginSchema = z.object({
  uris: z.array(BwLoginUriSchema).nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  totp: z.string().nullable().optional(),
  passwordRevisionDate: z.string().nullable().optional(),
}).passthrough();

export type BwLogin = z.infer<typeof BwLoginSchema>;

export const BwItemSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  folderId: z.string().nullable(),
  type: ItemTypeSchema,
  name: z.string(),
  notes: z.string().nullable(),
  favorite: z.boolean(),
  login: BwLoginSchema.nullable().optional(),
  revisionDate: z.string(),
  creationDate: z.string().optional(),
  deletedDate: z.string().nullable().optional(),
}).passthrough();

export type BwItem = z.infer<typeof BwItemSchema>;

export const BwFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
}).passthrough();

export type BwFolder = z.infer<typeof BwFolderSchema>;

export const BwErrorCode = {
  SPAWN_FAILED: 'SPAWN_FAILED',
  INVALID_JSON: 'INVALID_JSON',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  VAULT_LOCKED: 'VAULT_LOCKED',
  SESSION_MISSING: 'SESSION_MISSING',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN: 'UNKNOWN',
} as const;

export type BwErrorCode = (typeof BwErrorCode)[keyof typeof BwErrorCode];

export type BwError = {
  readonly code: BwErrorCode;
  readonly message: string;
  readonly exitCode: number | null;
  readonly stderr: string;
};

export function makeBwError(
  code: BwErrorCode,
  message: string,
  exitCode: number | null = null,
  stderr: string = '',
): BwError {
  return { code, message, exitCode, stderr };
}
