import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { FsAdapter } from '../adapters/fs.js';
import type { Clock } from '../adapters/clock.js';
import type { Logger } from '../adapters/logging.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makePendingQueue } from '../lib/domain/pending.js';

export function resolvePendingPath(configPath?: string | null): string {
  if (configPath) return configPath;
  const stateHome = process.env['XDG_STATE_HOME']
    ?? join(process.env['HOME'] ?? homedir(), '.local', 'state');
  return join(stateHome, 'seiton', 'pending.json');
}

export async function savePendingOps(
  ops: readonly PendingOp[],
  pendingPath: string,
  fs: FsAdapter,
  clock: Clock,
  logger?: Logger,
): Promise<void> {
  if (ops.length === 0) return;

  const dir = dirname(pendingPath);
  await fs.ensureDir(dir);

  const queue = makePendingQueue(ops, clock.isoNow());
  const content = JSON.stringify(queue, null, 2) + '\n';
  await fs.writeAtomic(pendingPath, content, 0o600);
  logger?.info('pending: saved ops', { count: ops.length, path: pendingPath });
}
