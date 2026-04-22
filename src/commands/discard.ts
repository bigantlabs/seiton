import type { FsAdapter } from '../adapters/fs.js';
import type { Logger } from '../adapters/logging.js';
import { resolvePendingPath } from './pending-io.js';

export type DiscardResult =
  | { ok: true; path: string }
  | { ok: false; code: 'NO_PENDING' | 'REMOVE_FAILED'; message: string };

export async function discardPending(
  pendingQueuePath: string | null | undefined,
  fs: FsAdapter,
  logger?: Logger,
): Promise<DiscardResult> {
  const pendingPath = resolvePendingPath(pendingQueuePath);
  logger?.info('discard: checking pending queue', { path: pendingPath });

  const exists = await fs.exists(pendingPath);
  if (!exists) {
    return { ok: false, code: 'NO_PENDING', message: 'No pending queue found. Nothing to discard.' };
  }

  try {
    await fs.remove(pendingPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('discard: failed to remove pending queue', { path: pendingPath, error: message });
    return { ok: false, code: 'REMOVE_FAILED', message: `Failed to delete pending queue at ${pendingPath}: ${message}` };
  }

  logger?.info('discard: removed pending queue', { path: pendingPath });
  return { ok: true, path: pendingPath };
}
