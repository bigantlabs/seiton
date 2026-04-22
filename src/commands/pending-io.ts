import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { FsAdapter } from '../adapters/fs.js';
import type { Clock } from '../adapters/clock.js';
import type { Logger } from '../adapters/logging.js';
import type { PendingOp } from '../lib/domain/pending.js';
import { makePendingQueue } from '../lib/domain/pending.js';

export function resolvePendingPath(configPath?: string | null): string {
  if (configPath) return configPath;
  const xdgState = process.env['XDG_STATE_HOME']?.trim();
  const home = process.env['HOME']?.trim();
  const stateHome = xdgState || join(home || homedir(), '.local', 'state');
  return join(stateHome, 'seiton', 'pending.json');
}

export async function savePendingOps(
  ops: readonly PendingOp[],
  pendingPath: string,
  fs: FsAdapter,
  clock: Clock,
  logger?: Logger,
): Promise<boolean> {
  if (ops.length === 0) return true;

  const queue = makePendingQueue(ops, clock.isoNow());
  const content = `${JSON.stringify(queue, null, 2)}\n`;

  try {
    await fs.ensureDir(dirname(pendingPath));
    await fs.writeAtomic(pendingPath, content, 0o600);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error('pending: failed to save ops — recover from this log entry', {
      path: pendingPath,
      error: message,
      ops,
    });
    return false;
  }

  logger?.info('pending: saved ops', { count: ops.length, path: pendingPath });
  return true;
}
