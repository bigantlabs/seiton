import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemClock, createFixedClock } from '../../../src/adapters/clock.js';

describe('Clock', () => {
  describe('createSystemClock', () => {
    it('returns a date close to now', () => {
      const clock = createSystemClock();
      const before = Date.now();
      const result = clock.now();
      const after = Date.now();
      assert.ok(result.getTime() >= before);
      assert.ok(result.getTime() <= after);
    });

    it('returns an ISO string', () => {
      const clock = createSystemClock();
      const iso = clock.isoNow();
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(iso));
    });
  });

  describe('createFixedClock', () => {
    it('always returns the same time', () => {
      const fixed = new Date('2025-06-15T12:00:00.000Z');
      const clock = createFixedClock(fixed);
      assert.equal(clock.now().getTime(), fixed.getTime());
      assert.equal(clock.now().getTime(), fixed.getTime());
    });

    it('returns the fixed ISO string', () => {
      const fixed = new Date('2025-06-15T12:00:00.000Z');
      const clock = createFixedClock(fixed);
      assert.equal(clock.isoNow(), '2025-06-15T12:00:00.000Z');
    });

    it('returns independent Date objects', () => {
      const fixed = new Date('2025-06-15T12:00:00.000Z');
      const clock = createFixedClock(fixed);
      const a = clock.now();
      const b = clock.now();
      assert.notEqual(a, b);
      assert.equal(a.getTime(), b.getTime());
    });

    it('is not affected by mutating the original Date', () => {
      const fixed = new Date('2025-06-15T12:00:00.000Z');
      const clock = createFixedClock(fixed);
      fixed.setFullYear(2000);
      assert.equal(clock.isoNow(), '2025-06-15T12:00:00.000Z');
    });
  });
});
