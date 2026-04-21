import type { Config } from '../config/schema.js';

export type ConfigGetResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function configGet(config: Config, keyPath: string): ConfigGetResult {
  const parts = keyPath.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { ok: false, error: `Key "${keyPath}" does not exist in configuration` };
    }
    if (!(part in (current as Record<string, unknown>))) {
      return { ok: false, error: `Key "${keyPath}" does not exist in configuration` };
    }
    current = (current as Record<string, unknown>)[part];
  }

  return { ok: true, value: current };
}
