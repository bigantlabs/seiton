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
      assert.equal('context' in parsed, false);
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

    it('omits context key when context is empty', () => {
      const entry: LogEntry = { timestamp: FIXED_ISO, level: 'warn', message: 'x', context: {} };
      const result = formatJsonLog(entry);
      const parsed = JSON.parse(result) as Record<string, unknown>;
      assert.equal('context' in parsed, false);
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

    it('recursively sanitizes objects inside arrays', () => {
      const ctx = { items: [{ SEITON_SECRET: 'abc' }, { HOME: '/home' }] };
      const result = sanitizeContext(ctx);
      const items = result['items'] as Array<Record<string, unknown>>;
      assert.equal(items[0]!['SEITON_SECRET'], '[REDACTED]');
      assert.equal(items[1]!['HOME'], '/home');
    });

    it('passes through arrays of primitives unchanged', () => {
      const ctx = { tags: ['a', 'b', 'c'] };
      const result = sanitizeContext(ctx);
      assert.deepEqual(result['tags'], ['a', 'b', 'c']);
    });

    it('redacts keys matching *_CREDENTIAL* pattern', () => {
      const ctx = {
        MY_CREDENTIAL: 'secret123',
        API_CREDENTIAL_KEY: 'key456',
      };
      const result = sanitizeContext(ctx);
      assert.equal(result['MY_CREDENTIAL'], '[REDACTED]');
      assert.equal(result['API_CREDENTIAL_KEY'], '[REDACTED]');
    });

    it('redacts keys matching *_AUTH$ pattern', () => {
      const ctx = {
        USER_AUTH: 'token123',
        OAUTH_AUTH: 'bearer456',
        API_AUTH: 'secret789',
      };
      const result = sanitizeContext(ctx);
      assert.equal(result['USER_AUTH'], '[REDACTED]');
      assert.equal(result['OAUTH_AUTH'], '[REDACTED]');
      assert.equal(result['API_AUTH'], '[REDACTED]');
    });

    it('redacts keys matching *API_KEY* pattern', () => {
      const ctx = {
        API_KEY: 'pk_live_123',
        MY_API_KEY: 'key456',
        API_KEY_SECRET: 'secret789',
        STRIPE_API_KEY: 'sk_test_abc',
      };
      const result = sanitizeContext(ctx);
      assert.equal(result['API_KEY'], '[REDACTED]');
      assert.equal(result['MY_API_KEY'], '[REDACTED]');
      assert.equal(result['API_KEY_SECRET'], '[REDACTED]');
      assert.equal(result['STRIPE_API_KEY'], '[REDACTED]');
    });

    it('redacts keys matching *PASSPHRASE$ pattern', () => {
      const ctx = {
        PASSPHRASE: 'secret123',
        PRIVATE_KEY_PASSPHRASE: 'pass456',
        SSH_KEY_PASSPHRASE: 'phrase789',
      };
      const result = sanitizeContext(ctx);
      assert.equal(result['PASSPHRASE'], '[REDACTED]');
      assert.equal(result['PRIVATE_KEY_PASSPHRASE'], '[REDACTED]');
      assert.equal(result['SSH_KEY_PASSPHRASE'], '[REDACTED]');
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
