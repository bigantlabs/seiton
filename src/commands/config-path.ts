import { configDiscoveryStack, type ConfigPathOptions } from '../config/paths.js';
import { readFile } from 'node:fs/promises';

export async function configPath(opts: ConfigPathOptions = {}): Promise<string | null> {
  const candidates = configDiscoveryStack(opts);

  for (const candidate of candidates) {
    try {
      await readFile(candidate.path, 'utf-8');
      return candidate.path;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'ENOENT' && !candidate.hardFail) continue;
      if (candidate.hardFail) return candidate.path;
    }
  }

  return null;
}
