import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zxcvbnScore } from '../../../src/lib/strength/zxcvbn.js';

describe('zxcvbnScore', () => {
  it('returns score 0 for empty password', () => {
    const result = zxcvbnScore('', []);
    assert.equal(result.score, 0);
  });

  it('returns score in 0-4 range for various inputs', () => {
    const passwords = ['a', 'password', '123456', 'qwerty', 'Xyq9#mK2pR!vL'];
    for (const pw of passwords) {
      const result = zxcvbnScore(pw, []);
      assert.ok(result.score >= 0, `score ${result.score} < 0 for "${pw}"`);
      assert.ok(result.score <= 4, `score ${result.score} > 4 for "${pw}"`);
    }
  });

  it('scores known weak passwords at 0', () => {
    for (const pw of ['password', '123456', 'qwerty']) {
      const result = zxcvbnScore(pw, []);
      assert.equal(result.score, 0, `"${pw}" should score 0`);
    }
  });

  it('scores a long random string at 4', () => {
    const result = zxcvbnScore('j8$Kp2!mXq9#vL4nR7@wZ', []);
    assert.equal(result.score, 4);
  });

  it('returns feedback for weak passwords', () => {
    const result = zxcvbnScore('password', []);
    assert.ok(result.feedback.length > 0, 'weak password should have feedback');
  });

  it('returns empty feedback for strong passwords', () => {
    const result = zxcvbnScore('j8$Kp2!mXq9#vL4nR7@wZ', []);
    assert.equal(result.feedback.length, 0);
  });

  it('penalizes user dictionary entries', () => {
    const withDict = zxcvbnScore('acmecorp123', ['acmecorp']);
    const withoutDict = zxcvbnScore('acmecorp123', []);
    assert.ok(
      withDict.score < withoutDict.score,
      `with user dict (${withDict.score}) should score lower than without (${withoutDict.score})`,
    );
  });

  it('is deterministic', () => {
    const pw = 'TestP@ssw0rd123';
    const a = zxcvbnScore(pw, []);
    const b = zxcvbnScore(pw, []);
    assert.equal(a.score, b.score);
    assert.deepStrictEqual(a.feedback, b.feedback);
  });

  it('is deterministic across many iterations', () => {
    const pw = 'D3term!nistic#Test';
    const first = zxcvbnScore(pw, []);
    for (let i = 0; i < 100; i++) {
      const result = zxcvbnScore(pw, []);
      assert.equal(result.score, first.score);
    }
  });

  it('includes warning in feedback when present', () => {
    const result = zxcvbnScore('password', []);
    assert.ok(
      result.feedback.some((f) => f.includes('common password')),
      `feedback should mention common password, got: ${JSON.stringify(result.feedback)}`,
    );
  });
});
