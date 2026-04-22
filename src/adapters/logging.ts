import type { Clock } from './clock.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogFormat = 'text' | 'json';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  format: LogFormat;
  level: LogLevel;
  clock: Clock;
  output?: (line: string) => void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const UNSAFE_PATTERNS = /^(SEITON_|BW_SESSION$|.*_TOKEN$|.*_SECRET$|.*_PASSWORD$|.*_KEY$|.*_CREDENTIAL.*|.*_AUTH$|.*API_KEY.*|.*PASSPHRASE$)/i;

const SAFE_ENV_KEYS = new Set([
  'SEITON_CONFIG',
  'SEITON_VERBOSE',
  'SEITON_SUPPRESS_DEPRECATIONS',
  'SEITON_CORE_OUTPUT_FORMAT',
  'SEITON_CORE_COLOR',
  'SEITON_CORE_VERBOSE',
  'SEITON_CORE_QUIET',
  'SEITON_LOGGING_FORMAT',
  'SEITON_LOGGING_LEVEL',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === 'object' && value !== null) {
    return sanitizeContext(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string' && UNSAFE_PATTERNS.test(key) && !SAFE_ENV_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeValue(value);
    }
  }
  return result;
}

export function formatTextLog(entry: LogEntry): string {
  const ctx = entry.context && Object.keys(entry.context).length > 0
    ? ` ${JSON.stringify(entry.context)}`
    : '';
  return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}${ctx}`;
}

export function formatJsonLog(entry: LogEntry): string {
  const obj: Record<string, unknown> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  };
  if (entry.context && Object.keys(entry.context).length > 0) {
    obj.context = entry.context;
  }
  return JSON.stringify(obj);
}

export function createLogger(opts: LoggerOptions): Logger {
  const threshold = LEVEL_ORDER[opts.level];
  const format = opts.format === 'json' ? formatJsonLog : formatTextLog;
  const write = opts.output ?? ((line: string) => process.stderr.write(line + '\n'));

  function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] > threshold) return;
    const sanitized = context ? sanitizeContext(context) : undefined;
    const entry: LogEntry = {
      timestamp: opts.clock.isoNow(),
      level,
      message,
      context: sanitized,
    };
    write(format(entry));
  }

  return {
    error(message, context) { emit('error', message, context); },
    warn(message, context) { emit('warn', message, context); },
    info(message, context) { emit('info', message, context); },
    debug(message, context) { emit('debug', message, context); },
  };
}

export function createNoopLogger(): Logger {
  return {
    error() {},
    warn() {},
    info() {},
    debug() {},
  };
}
