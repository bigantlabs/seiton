import type { Logger } from './logging.js';

export const ProcessErrorCode = {
  ENV_MISSING: 'PROCESS_ENV_MISSING',
  ENV_INVALID: 'PROCESS_ENV_INVALID',
} as const;

export type ProcessErrorCode = (typeof ProcessErrorCode)[keyof typeof ProcessErrorCode];

export class ProcessError extends Error {
  readonly code: ProcessErrorCode;
  readonly variable: string;
  constructor(code: ProcessErrorCode, variable: string, message: string) {
    super(message);
    this.name = 'ProcessError';
    this.code = code;
    this.variable = variable;
  }
}

export interface ProcessAdapter {
  getEnv(name: string): string | undefined;
  requireEnv(name: string): string;
  getEnvAsInt(name: string): number | undefined;
  getEnvAsBool(name: string): boolean | undefined;
  exit(code: number): never;
  isTTY(stream: 'stdin' | 'stdout' | 'stderr'): boolean;
}

export function createProcessAdapter(
  env: Record<string, string | undefined> = process.env,
  exitFn: (code: number) => never = (code) => process.exit(code),
  logger?: Logger,
): ProcessAdapter {
  return {
    getEnv(name: string): string | undefined {
      return env[name];
    },

    requireEnv(name: string): string {
      const value = env[name];
      if (value === undefined || value === '') {
        logger?.debug('process: requireEnv failed', { variable: name });
        throw new ProcessError(
          ProcessErrorCode.ENV_MISSING,
          name,
          `Required environment variable ${name} is not set`,
        );
      }
      return value;
    },

    getEnvAsInt(name: string): number | undefined {
      const raw = env[name];
      if (raw === undefined) return undefined;
      if (raw === '') {
        throw new ProcessError(
          ProcessErrorCode.ENV_INVALID,
          name,
          `Environment variable ${name}="" is not a valid integer`,
        );
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new ProcessError(
          ProcessErrorCode.ENV_INVALID,
          name,
          `Environment variable ${name}=${raw} is not a valid integer`,
        );
      }
      return n;
    },

    getEnvAsBool(name: string): boolean | undefined {
      const raw = env[name];
      if (raw === undefined) return undefined;
      const lower = raw.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0' || lower === '') return false;
      throw new ProcessError(
        ProcessErrorCode.ENV_INVALID,
        name,
        `Environment variable ${name}=${raw} is not a valid boolean`,
      );
    },

    exit(code: number): never {
      logger?.debug('process: exit', { code });
      return exitFn(code);
    },

    isTTY(stream: 'stdin' | 'stdout' | 'stderr'): boolean {
      switch (stream) {
        case 'stdin': return Boolean(process.stdin.isTTY);
        case 'stdout': return Boolean(process.stdout.isTTY);
        case 'stderr': return Boolean(process.stderr.isTTY);
      }
    },
  };
}
