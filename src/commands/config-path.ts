import { configDiscoveryStack, type ConfigPathOptions } from '../config/paths.js';
import { readFile } from 'node:fs/promises';
import type { Logger } from '../adapters/logging.js';

export async function configPath(opts: ConfigPathOptions = {}, logger?: Logger): Promise<string | null> {
  const candidates = configDiscoveryStack(opts);

  for (const candidate of candidates) {
    try {
      await readFile(candidate.path, 'utf-8');
      return candidate.path;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT' && !candidate.hardFail) continue;
      if (code !== 'ENOENT') {
        logger?.debug('config-path: non-ENOENT error reading candidate', {
          path: candidate.path,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (candidate.hardFail) return candidate.path;
    }
  }

  return null;
}
