import { performance } from 'node:perf_hooks';
import type { BwAdapter } from '../lib/bw.js';
import type { PendingOp, PendingOpKind } from '../lib/domain/pending.js';
import type { Logger } from '../adapters/logging.js';

export interface ApplyProgress {
  phase: PendingOpKind;
  current: number;
  phaseTotal: number;
  overallCurrent: number;
  overallTotal: number;
  description: string;
  failedSoFar: number;
}

export interface PhaseTiming {
  count: number;
  durationMs: number;
}

export interface ApplyTimings {
  create_folder: PhaseTiming;
  assign_folder: PhaseTiming;
  delete_item: PhaseTiming;
  totalDurationMs: number;
}

export interface ApplyResult {
  applied: number;
  failed: PendingOp[];
  remaining: PendingOp[];
  timings: ApplyTimings;
}

export async function applyOps(
  ops: readonly PendingOp[],
  session: string,
  bw: BwAdapter,
  logger?: Logger,
  onApplied?: (op: PendingOp) => void,
  onProgress?: (progress: ApplyProgress) => void,
): Promise<ApplyResult> {
  const remaining = [...ops];
  const failed: PendingOp[] = [];
  let applied = 0;

  const createOps = remaining.filter((op) => op.kind === 'create_folder');
  const assignOps = remaining.filter((op) => op.kind === 'assign_folder');
  const deleteOps = remaining.filter((op) => op.kind === 'delete_item');

  const folderIdMap = new Map<string, string>();
  const totalOps = ops.length;
  let overallIdx = 0;

  const timings: ApplyTimings = {
    create_folder: { count: createOps.length, durationMs: 0 },
    assign_folder: { count: assignOps.length, durationMs: 0 },
    delete_item: { count: deleteOps.length, durationMs: 0 },
    totalDurationMs: 0,
  };

  const totalStart = performance.now();

  const phaseStart1 = performance.now();
  for (let i = 0; i < createOps.length; i++) {
    const op = createOps[i];
    overallIdx++;
    onProgress?.({ phase: 'create_folder', current: i + 1, phaseTotal: createOps.length, overallCurrent: overallIdx, overallTotal: totalOps, description: op.folderName, failedSoFar: failed.length });

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
  timings.create_folder.durationMs = performance.now() - phaseStart1;

  const phaseStart2 = performance.now();
  for (let i = 0; i < assignOps.length; i++) {
    const op = assignOps[i];
    overallIdx++;
    onProgress?.({ phase: 'assign_folder', current: i + 1, phaseTotal: assignOps.length, overallCurrent: overallIdx, overallTotal: totalOps, description: op.folderName, failedSoFar: failed.length });

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
  timings.assign_folder.durationMs = performance.now() - phaseStart2;

  const phaseStart3 = performance.now();
  for (let i = 0; i < deleteOps.length; i++) {
    const op = deleteOps[i];
    overallIdx++;
    onProgress?.({ phase: 'delete_item', current: i + 1, phaseTotal: deleteOps.length, overallCurrent: overallIdx, overallTotal: totalOps, description: op.itemId, failedSoFar: failed.length });

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
  timings.delete_item.durationMs = performance.now() - phaseStart3;

  timings.totalDurationMs = performance.now() - totalStart;

  return { applied, failed, remaining, timings };
}
