import type { FsAdapter } from '../adapters/fs.js';
import type { Logger } from '../adapters/logging.js';
import { resolvePendingPath } from './pending-io.js';

export type DiscardResult =
  | { ok: true; path: string }
  | { ok: false; code: 'NO_PENDING'; message: string };

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

  await fs.remove(pendingPath);
  logger?.info('discard: removed pending queue', { path: pendingPath });
  return { ok: true, path: pendingPath };
}
