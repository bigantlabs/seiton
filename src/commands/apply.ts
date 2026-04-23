import type { BwAdapter } from '../lib/bw.js';
import type { PendingOp } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';

export interface ApplyResult {
  applied: number;
  failed: PendingOp[];
  remaining: PendingOp[];
}

export async function applyOps(
  ops: readonly PendingOp[],
  session: string,
  bw: BwAdapter,
  logger?: Logger,
  onApplied?: (op: PendingOp) => void,
): Promise<ApplyResult> {
  const remaining = [...ops];
  const failed: PendingOp[] = [];
  let applied = 0;

  const createOps = remaining.filter((op) => op.kind === 'create_folder');
  const assignOps = remaining.filter((op) => op.kind === 'assign_folder');
  const deleteOps = remaining.filter((op) => op.kind === 'delete_item');

  const folderIdMap = new Map<string, string>();

  for (const op of createOps) {
    const idx = remaining.indexOf(op);
    if (idx >= 0) remaining.splice(idx, 1);

    const encoded = Buffer.from(JSON.stringify({ name: op.folderName })).toString('base64');
    logger?.info('apply: creating folder', { folderName: op.folderName });
    const result = await bw.createFolder(session, encoded);
    if (result.ok) {
      folderIdMap.set(op.folderName, result.data);
      applied++;
      onApplied?.(op);
    } else {
      logger?.error('apply: create folder failed', { folderName: op.folderName, error: result.error.message });
      failed.push(op);
    }
  }

  for (const op of assignOps) {
    const idx = remaining.indexOf(op);
    if (idx >= 0) remaining.splice(idx, 1);

    let folderId = op.folderId;
    if (!folderId && folderIdMap.has(op.folderName)) {
      folderId = folderIdMap.get(op.folderName)!;
    }

    if (!folderId) {
      logger?.error('apply: folder ID not resolved', { itemId: op.itemId, folderName: op.folderName });
      failed.push(op);
      continue;
    }

    logger?.info('apply: assigning folder', { itemId: op.itemId, folderName: op.folderName });
    const itemResult = await bw.getItem(session, op.itemId);
    if (!itemResult.ok) {
      logger?.error('apply: fetch item failed', { itemId: op.itemId, error: itemResult.error.message });
      const persistOp = folderId !== op.folderId ? { ...op, folderId } : op;
      failed.push(persistOp);
      continue;
    }

    const updatedItem = { ...itemResult.data, folderId };
    const encoded = Buffer.from(JSON.stringify(updatedItem)).toString('base64');
    const result = await bw.editItem(session, op.itemId, encoded);
    if (result.ok) {
      applied++;
      onApplied?.(op);
    } else {
      const persistOp = folderId !== op.folderId ? { ...op, folderId } : op;
      logger?.error('apply: assign folder failed', { itemId: op.itemId, error: result.error.message });
      failed.push(persistOp);
    }
  }

  for (const op of deleteOps) {
    const idx = remaining.indexOf(op);
    if (idx >= 0) remaining.splice(idx, 1);

    logger?.info('apply: deleting item', { itemId: op.itemId });
    const result = await bw.deleteItem(session, op.itemId);
    if (result.ok) {
      applied++;
      onApplied?.(op);
    } else {
      logger?.error('apply: delete item failed', { itemId: op.itemId, error: result.error.message });
      failed.push(op);
    }
  }

  return { applied, failed, remaining };
}
