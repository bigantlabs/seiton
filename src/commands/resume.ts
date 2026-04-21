import { readFile } from 'node:fs/promises';
import type { BwAdapter } from '../lib/bw.js';
import type { FsAdapter } from '../adapters/fs.js';
import type { Clock } from '../adapters/clock.js';
import type { Logger } from '../adapters/logging.js';
import { parsePendingQueue, type PendingOp } from '../lib/domain/pending.js';
import { applyOps, type ApplyResult } from './apply.js';
import { savePendingOps, resolvePendingPath } from './pending-io.js';

export type ResumeResult =
  | { ok: true; applied: number; failed: number }
  | { ok: false; code: 'NO_PENDING' | 'INVALID_PENDING' | 'VERSION_MISMATCH'; message: string };

export interface ResumeOptions {
  pendingQueuePath: string | null | undefined;
  session: string;
  bw: BwAdapter;
  fs: FsAdapter;
  clock: Clock;
  logger?: Logger;
}

export async function loadPendingOps(
  pendingQueuePath: string | null | undefined,
  logger?: Logger,
): Promise<{ ok: true; ops: PendingOp[]; path: string } | { ok: false; code: 'NO_PENDING' | 'INVALID_PENDING' | 'VERSION_MISMATCH'; message: string }> {
  const pendingPath = resolvePendingPath(pendingQueuePath);
  logger?.info('resume: loading pending queue', { path: pendingPath });

  let raw: string;
  try {
    raw = await readFile(pendingPath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      return { ok: false, code: 'NO_PENDING', message: 'No pending queue found. Run "seiton audit" first.' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'INVALID_PENDING', message: `Failed to read pending queue: ${msg}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'INVALID_PENDING', message: 'Pending queue file contains invalid JSON' };
  }

  const result = parsePendingQueue(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, code: 'INVALID_PENDING', message: `Invalid pending queue: ${issue?.message ?? 'unknown error'}` };
  }

  if (result.data.items.length === 0) {
    return { ok: false, code: 'NO_PENDING', message: 'Pending queue is empty. Nothing to resume.' };
  }

  return { ok: true, ops: result.data.items, path: pendingPath };
}

export async function resumeApply(
  ops: readonly PendingOp[],
  pendingPath: string,
  opts: ResumeOptions,
): Promise<ApplyResult> {
  const { session, bw, fs, clock, logger } = opts;
  const result = await applyOps(ops, session, bw, logger);

  if (result.failed.length > 0 || result.remaining.length > 0) {
    const persist = [...result.failed, ...result.remaining];
    await savePendingOps(persist, pendingPath, fs, clock, logger);
  } else {
    await fs.remove(pendingPath);
  }

  return result;
}
