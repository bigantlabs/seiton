import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLogger,
  createNoopLogger,
  sanitizeContext,
  formatTextLog,
  formatJsonLog,
  type LogEntry,
} from '../../../src/adapters/logging.js';
import { createFixedClock } from '../../../src/adapters/clock.js';

const FIXED_TIME = new Date('2025-01-15T10:30:00.000Z');
const FIXED_ISO = '2025-01-15T10:30:00.000Z';

describe('logging adapter', () => {
  describe('formatTextLog', () => {
    it('formats entry without context', () => {
      const entry: LogEntry = { timestamp: FIXED_ISO, level: 'info', message: 'hello' };
      const result = formatTextLog(entry);
      assert.equal(result, '[2025-01-15T10:30:00.000Z] INFO hello');
    });

    it('formats entry with context', () => {
      const entry: LogEntry = {
        timestamp: FIXED_ISO,
        level: 'error',
        message: 'failed',
        context: { code: 'ERR_01' },
      };
      const result = formatTextLog(entry);
      assert.equal(result, '[2025-01-15T10:30:00.000Z] ERROR failed {"code":"ERR_01"}');
    });

    it('omits empty context object', () => {
      const entry: LogEntry = { timestamp: FIXED_ISO, level: 'warn', message: 'test', context: {} };
      const result = formatTextLog(entry);
      assert.equal(result, '[2025-01-15T10:30:00.000Z] WARN test');
    });
  });

  describe('formatJsonLog', () => {
    it('produces valid JSON with required fields', () => {
      const entry: LogEntry = { timestamp: FIXED_ISO, level: 'info', message: 'started' };
      const result = formatJsonLog(entry);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      assert.equal(parsed['timestamp'], FIXED_ISO);
      assert.equal(parsed['level'], 'info');
      assert.equal(parsed['message'], 'started');
      assert.deepEqual(parsed['context'], {});
    });

    it('includes context when present', () => {
      const entry: LogEntry = {
        timestamp: FIXED_ISO,
        level: 'debug',
        message: 'check',
        context: { path: '/foo' },
      };
      const result = formatJsonLog(entry);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      assert.deepEqual(parsed['context'], { path: '/foo' });
    });

    it('includes empty context object when no context provided', () => {
      const entry: LogEntry = { timestamp: FIXED_ISO, level: 'warn', message: 'x', context: {} };
      const result = formatJsonLog(entry);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      assert.deepEqual(parsed['context'], {});
    });
  });

  describe('sanitizeContext', () => {
    it('redacts SEITON_ keys that are not safe-listed', () => {
      const ctx = { SEITON_SECRET_KEY: 'my-secret' };
      const result = sanitizeContext(ctx);
      assert.equal(result['SEITON_SECRET_KEY'], '[REDACTED]');
    });

    it('preserves safe-listed SEITON_ keys', () => {
      const ctx = { SEITON_CONFIG: '/path/to/config', SEITON_VERBOSE: '2' };
      const result = sanitizeContext(ctx);
      assert.equal(result['SEITON_CONFIG'], '/path/to/config');
      assert.equal(result['SEITON_VERBOSE'], '2');
    });

    it('preserves non-SEITON keys', () => {
      const ctx = { path: '/usr/bin', count: 42 };
      const result = sanitizeContext(ctx);
      assert.equal(result['path'], '/usr/bin');
      assert.equal(result['count'], 42);
    });

    it('recursively sanitizes nested objects', () => {
      const ctx = { env: { SEITON_DB_PASSWORD: 'pass123', HOME: '/home' } };
      const result = sanitizeContext(ctx);
      const env = result['env'] as Record<string, unknown>;
      assert.equal(env['SEITON_DB_PASSWORD'], '[REDACTED]');
      assert.equal(env['HOME'], '/home');
    });

    it('does not redact non-string SEITON_ values', () => {
      const ctx = { SEITON_UNKNOWN_FLAG: 42 };
      const result = sanitizeContext(ctx);
      assert.equal(result['SEITON_UNKNOWN_FLAG'], 42);
    });
  });

  describe('createLogger', () => {
    it('emits at the configured level', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'text',
        level: 'info',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.info('visible');
      log.debug('hidden');

      assert.equal(lines.length, 1);
      assert.ok(lines[0]!.includes('visible'));
    });

    it('respects debug level', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'text',
        level: 'debug',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.debug('debug-msg');
      log.info('info-msg');
      log.warn('warn-msg');
      log.error('error-msg');

      assert.equal(lines.length, 4);
    });

    it('filters above threshold', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'text',
        level: 'error',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.info('dropped');
      log.warn('dropped');
      log.error('kept');

      assert.equal(lines.length, 1);
      assert.ok(lines[0]!.includes('kept'));
    });

    it('produces JSON format when configured', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'json',
        level: 'info',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.info('test-msg', { key: 'val' });

      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      assert.equal(parsed['timestamp'], FIXED_ISO);
      assert.equal(parsed['level'], 'info');
      assert.equal(parsed['message'], 'test-msg');
      assert.deepEqual(parsed['context'], { key: 'val' });
    });

    it('sanitizes context values in output', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'json',
        level: 'info',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.info('checking env', { SEITON_MASTER_PASSWORD: 'secret123' });

      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      const ctx = parsed['context'] as Record<string, unknown>;
      assert.equal(ctx['SEITON_MASTER_PASSWORD'], '[REDACTED]');
    });

    it('uses clock timestamp', () => {
      const lines: string[] = [];
      const log = createLogger({
        format: 'json',
        level: 'info',
        clock: createFixedClock(FIXED_TIME),
        output: (line) => lines.push(line),
      });

      log.info('timestamp check');

      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      assert.equal(parsed['timestamp'], FIXED_ISO);
    });

    it('writes to process.stderr by default when no output option provided', () => {
      const written: string[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        written.push(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      }) as typeof process.stderr.write;

      try {
        const log = createLogger({
          format: 'text',
          level: 'info',
          clock: createFixedClock(FIXED_TIME),
        });

        log.info('stderr-test-message');

        assert.ok(written.length > 0, 'should have written to process.stderr');
        assert.ok(
          written.some(line => line.includes('stderr-test-message')),
          'stderr output should contain the log message',
        );
        assert.ok(
          written.some(line => line.includes('INFO')),
          'stderr output should contain the level',
        );
        assert.ok(
          written.some(line => line.endsWith('\n')),
          'stderr output should be newline-terminated',
        );
      } finally {
        process.stderr.write = originalWrite;
      }
    });
  });

  describe('createNoopLogger', () => {
    it('does not throw on any method', () => {
      const log = createNoopLogger();
      log.error('msg');
      log.warn('msg');
      log.info('msg');
      log.debug('msg');
    });
  });
});
