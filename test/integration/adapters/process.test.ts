import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProcessAdapter, ProcessError, ProcessErrorCode } from '../../../src/adapters/process.js';

describe('ProcessAdapter', () => {
  describe('getEnv', () => {
    it('returns the value when set', () => {
      const proc = createProcessAdapter({ MY_VAR: 'hello' });
      assert.equal(proc.getEnv('MY_VAR'), 'hello');
    });

    it('returns undefined when not set', () => {
      const proc = createProcessAdapter({});
      assert.equal(proc.getEnv('MISSING'), undefined);
    });
  });

  describe('requireEnv', () => {
    it('returns the value when set', () => {
      const proc = createProcessAdapter({ REQUIRED: 'value' });
      assert.equal(proc.requireEnv('REQUIRED'), 'value');
    });

    it('throws PROCESS_ENV_MISSING when not set', () => {
      const proc = createProcessAdapter({});
      assert.throws(
        () => proc.requireEnv('MISSING'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_MISSING);
          assert.equal(err.variable, 'MISSING');
          return true;
        },
      );
    });

    it('throws PROCESS_ENV_MISSING when empty string', () => {
      const proc = createProcessAdapter({ EMPTY: '' });
      assert.throws(
        () => proc.requireEnv('EMPTY'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_MISSING);
          return true;
        },
      );
    });
  });

  describe('getEnvAsInt', () => {
    it('returns a number for valid integer', () => {
      const proc = createProcessAdapter({ NUM: '42' });
      assert.equal(proc.getEnvAsInt('NUM'), 42);
    });

    it('returns undefined when not set', () => {
      const proc = createProcessAdapter({});
      assert.equal(proc.getEnvAsInt('MISSING'), undefined);
    });

    it('throws PROCESS_ENV_INVALID for non-integer', () => {
      const proc = createProcessAdapter({ NUM: '3.14' });
      assert.throws(
        () => proc.getEnvAsInt('NUM'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          assert.equal(err.variable, 'NUM');
          return true;
        },
      );
    });

    it('throws PROCESS_ENV_INVALID for non-numeric string', () => {
      const proc = createProcessAdapter({ NUM: 'abc' });
      assert.throws(
        () => proc.getEnvAsInt('NUM'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          return true;
        },
      );
    });

    it('handles negative integers', () => {
      const proc = createProcessAdapter({ NUM: '-5' });
      assert.equal(proc.getEnvAsInt('NUM'), -5);
    });

    it('throws PROCESS_ENV_INVALID for "Infinity"', () => {
      const proc = createProcessAdapter({ NUM: 'Infinity' });
      assert.throws(
        () => proc.getEnvAsInt('NUM'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          assert.equal(err.variable, 'NUM');
          return true;
        },
      );
    });

    it('throws PROCESS_ENV_INVALID for "NaN"', () => {
      const proc = createProcessAdapter({ NUM: 'NaN' });
      assert.throws(
        () => proc.getEnvAsInt('NUM'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          assert.equal(err.variable, 'NUM');
          return true;
        },
      );
    });

    it('throws ENV_INVALID for empty string', () => {
      const proc = createProcessAdapter({ NUM: '' });
      assert.throws(
        () => proc.getEnvAsInt('NUM'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          assert.equal(err.variable, 'NUM');
          return true;
        },
      );
    });
  });

  describe('getEnvAsBool', () => {
    it('returns true for "true"', () => {
      const proc = createProcessAdapter({ BOOL: 'true' });
      assert.equal(proc.getEnvAsBool('BOOL'), true);
    });

    it('returns true for "1"', () => {
      const proc = createProcessAdapter({ BOOL: '1' });
      assert.equal(proc.getEnvAsBool('BOOL'), true);
    });

    it('returns false for "false"', () => {
      const proc = createProcessAdapter({ BOOL: 'false' });
      assert.equal(proc.getEnvAsBool('BOOL'), false);
    });

    it('returns false for "0"', () => {
      const proc = createProcessAdapter({ BOOL: '0' });
      assert.equal(proc.getEnvAsBool('BOOL'), false);
    });

    it('returns false for empty string', () => {
      const proc = createProcessAdapter({ BOOL: '' });
      assert.equal(proc.getEnvAsBool('BOOL'), false);
    });

    it('returns undefined when not set', () => {
      const proc = createProcessAdapter({});
      assert.equal(proc.getEnvAsBool('MISSING'), undefined);
    });

    it('throws PROCESS_ENV_INVALID for unexpected value', () => {
      const proc = createProcessAdapter({ BOOL: 'yes' });
      assert.throws(
        () => proc.getEnvAsBool('BOOL'),
        (err: unknown) => {
          assert.ok(err instanceof ProcessError);
          assert.equal(err.code, ProcessErrorCode.ENV_INVALID);
          return true;
        },
      );
    });

    it('is case-insensitive', () => {
      const proc = createProcessAdapter({ BOOL: 'TRUE' });
      assert.equal(proc.getEnvAsBool('BOOL'), true);
    });
  });

  describe('exit', () => {
    it('calls the exit function with the code', () => {
      let exitedWith: number | undefined;
      const proc = createProcessAdapter({}, (code) => {
        exitedWith = code;
        throw new Error('exit');
      });
      assert.throws(() => proc.exit(1));
      assert.equal(exitedWith, 1);
    });
  });

  describe('isTTY', () => {
    it('returns a boolean for stdin', () => {
      const proc = createProcessAdapter();
      const result = proc.isTTY('stdin');
      assert.equal(typeof result, 'boolean');
    });

    it('returns a boolean for stdout', () => {
      const proc = createProcessAdapter();
      const result = proc.isTTY('stdout');
      assert.equal(typeof result, 'boolean');
    });

    it('returns a boolean for stderr', () => {
      const proc = createProcessAdapter();
      const result = proc.isTTY('stderr');
      assert.equal(typeof result, 'boolean');
    });
  });
});
