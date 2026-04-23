import type { ProcessAdapter } from '../../src/adapters/process.js';
import type { FsAdapter } from '../../src/adapters/fs.js';
import type { Clock } from '../../src/adapters/clock.js';
import type { Logger } from '../../src/adapters/logging.js';

export class ExitSignal extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
  }
}

export function makeFakeProc(
  env: Record<string, string | undefined> = {},
  tty = true,
): ProcessAdapter {
  return {
    getEnv: (name) => env[name],
    requireEnv: (name) => {
      const v = env[name];
      if (!v) throw new Error(`Missing env: ${name}`);
      return v;
    },
    getEnvAsInt: (name) => {
      const v = env[name];
      if (v === undefined || v === '') return undefined;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    },
    getEnvAsBool: (name) => {
      const v = env[name];
      if (v === undefined || v === '') return undefined;
      const lowered = v.toLowerCase();
      if (lowered === 'true' || lowered === '1') return true;
      if (lowered === 'false' || lowered === '0') return false;
      return undefined;
    },
    exit: (code) => { throw new ExitSignal(code); },
    isTTY: () => tty,
  };
}

export function makeFakeFs(): FsAdapter & { written: Map<string, { content: string; mode: number }> } {
  const written = new Map<string, { content: string; mode: number }>();
  return {
    written,
    readText: async () => '',
    writeAtomic: async (path, content, mode = 0o600) => { written.set(path, { content, mode }); },
    remove: async () => {},
    exists: async () => false,
    ensureDir: async () => {},
  };
}

export function makeFakeClock(): Clock {
  return {
    now: () => new Date('2024-06-01T00:00:00Z'),
    isoNow: () => '2024-06-01T00:00:00.000Z',
  };
}

export function makeNoopLogger(): Logger {
  return { error() {}, warn() {}, info() {}, debug() {} };
}
