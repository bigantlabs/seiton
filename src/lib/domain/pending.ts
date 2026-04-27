import { z } from 'zod';

export const PENDING_SCHEMA_VERSION = 1;

export const PENDING_OP_KINDS = [
  'delete_item',
  'assign_folder',
  'create_folder',
] as const;

export type PendingOpKind = (typeof PENDING_OP_KINDS)[number];

export type DeleteItemOp = {
  readonly kind: 'delete_item';
  readonly itemId: string;
  readonly label?: string;
};

export type AssignFolderOp = {
  readonly kind: 'assign_folder';
  readonly itemId: string;
  readonly folderId: string | null;
  readonly folderName: string;
};

export type CreateFolderOp = {
  readonly kind: 'create_folder';
  readonly folderName: string;
};

export type PendingOp = DeleteItemOp | AssignFolderOp | CreateFolderOp;

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const DeleteItemOpSchema = z.object({
  kind: z.literal('delete_item'),
  itemId: z.string().min(1),
  label: z.string().optional(),
});

const AssignFolderOpSchema = z.object({
  kind: z.literal('assign_folder'),
  itemId: z.string().min(1),
  folderId: z.string().min(1).nullable(),
  folderName: z.string().min(1),
});

const CreateFolderOpSchema = z.object({
  kind: z.literal('create_folder'),
  folderName: z.string().min(1),
});

const PendingOpSchema = z.discriminatedUnion('kind', [
  DeleteItemOpSchema,
  AssignFolderOpSchema,
  CreateFolderOpSchema,
]);

export const PendingQueueSchema = z.object({
  version: z.literal(PENDING_SCHEMA_VERSION),
  items: z.array(PendingOpSchema),
  savedAt: z.string().refine(
    (s) => ISO_8601_REGEX.test(s) && !Number.isNaN(Date.parse(s)),
    { message: 'savedAt must be an ISO 8601 datetime (e.g. YYYY-MM-DDTHH:MM:SS[.sss]Z)' },
  ),
});

export type PendingQueue = z.infer<typeof PendingQueueSchema>;

export function makeDeleteItemOp(itemId: string, label?: string): DeleteItemOp {
  const op: DeleteItemOp = { kind: 'delete_item', itemId };
  if (label) return { ...op, label };
  return op;
}

export function makeAssignFolderOp(
  itemId: string,
  folderId: string | null,
  folderName: string,
): AssignFolderOp {
  return { kind: 'assign_folder', itemId, folderId, folderName };
}

export function makeCreateFolderOp(folderName: string): CreateFolderOp {
  return { kind: 'create_folder', folderName };
}

export function makePendingQueue(
  items: readonly PendingOp[],
  savedAt: string,
): PendingQueue {
  return {
    version: PENDING_SCHEMA_VERSION,
    items: [...items],
    savedAt,
  };
}

export function parsePendingQueue(
  raw: unknown,
): { success: true; data: PendingQueue } | { success: false; error: z.ZodError } {
  return PendingQueueSchema.safeParse(raw) as
    | { success: true; data: PendingQueue }
    | { success: false; error: z.ZodError };
}
