import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWeak,
  scorePassword,
  collectWeaknesses,
  DEFAULT_STRENGTH_CONFIG,
} from '../../../src/lib/strength/heuristic.js';
import type { StrengthConfig } from '../../../src/lib/strength/heuristic.js';

describe('isWeak', () => {
  it('flags short passwords', () => {
    assert.equal(isWeak('Ab1!'), true);
  });

  it('flags passwords missing digits', () => {
    const config: StrengthConfig = { ...DEFAULT_STRENGTH_CONFIG, requireDigit: true };
    assert.equal(isWeak('AbcdefAbcdef!', config), true);
  });

  it('flags passwords missing symbols', () => {
    const config: StrengthConfig = { ...DEFAULT_STRENGTH_CONFIG, requireSymbol: true };
    assert.equal(isWeak('Abcdef123456', config), true);
  });

  it('flags passwords with too few character classes', () => {
    const config: StrengthConfig = { ...DEFAULT_STRENGTH_CONFIG, minCharacterClasses: 4 };
    assert.equal(isWeak('abcdefghijkl', config), true);
  });

  it('flags passwords containing common substrings', () => {
    assert.equal(isWeak('MyPassword123!'), true);
  });

  it('flags passwords with "qwerty"', () => {
    assert.equal(isWeak('Qwerty12345!'), true);
  });

  it('accepts strong passwords', () => {
    assert.equal(isWeak('Xyq9#mK2pR!vL'), false);
  });

  it('uses extra common passwords from config', () => {
    const config: StrengthConfig = {
      ...DEFAULT_STRENGTH_CONFIG,
      extraCommonPasswords: ['mycustomword'],
    };
    assert.equal(isWeak('Mycustomword1!', config), true);
  });
});

describe('collectWeaknesses', () => {
  it('returns empty array for strong password', () => {
    const reasons = collectWeaknesses('Xyq9#mK2pR!vL');
    assert.equal(reasons.length, 0);
  });

  it('reports length violation', () => {
    const reasons = collectWeaknesses('Ab1!');
    assert.ok(reasons.some((r) => r.includes('length')));
  });

  it('reports missing digit', () => {
    const reasons = collectWeaknesses('Abcdefghijkl!');
    assert.ok(reasons.some((r) => r.includes('digit')));
  });

  it('reports missing symbol', () => {
    const reasons = collectWeaknesses('Abcdefgh1234');
    assert.ok(reasons.some((r) => r.includes('symbol')));
  });

  it('reports common substring', () => {
    const reasons = collectWeaknesses('MyPassword123!');
    assert.ok(reasons.some((r) => r.includes('common')));
  });

  it('reports character class deficiency', () => {
    const config: StrengthConfig = { ...DEFAULT_STRENGTH_CONFIG, minCharacterClasses: 4 };
    const reasons = collectWeaknesses('abcdefghijkl', config);
    assert.ok(reasons.some((r) => r.includes('character class')));
  });
});

describe('scorePassword', () => {
  it('returns 0 for empty password', () => {
    assert.equal(scorePassword(''), 0);
  });

  it('returns score in 0..4 range', () => {
    const passwords = ['a', 'abcd1234', 'AbCd1234!@', 'Xyq9#mK2pR!vL', ''];
    for (const pw of passwords) {
      const score = scorePassword(pw);
      assert.ok(score >= 0, `score ${score} < 0 for "${pw}"`);
      assert.ok(score <= 4, `score ${score} > 4 for "${pw}"`);
    }
  });

  it('gives higher score to stronger passwords', () => {
    const weak = scorePassword('abc');
    const strong = scorePassword('Xyq9#mK2pR!vL');
    assert.ok(strong > weak, `strong (${strong}) should be > weak (${weak})`);
  });

  it('gives a score of 0 or 1 for very short passwords', () => {
    const score = scorePassword('ab');
    assert.ok(score <= 1);
  });

  it('is deterministic', () => {
    const pw = 'TestP@ssw0rd123';
    const a = scorePassword(pw);
    const b = scorePassword(pw);
    assert.equal(a, b);
  });

  it('is deterministic across many iterations', () => {
    const pw = 'D3term!nistic#Test';
    const first = scorePassword(pw);
    for (let i = 0; i < 100; i++) {
      assert.equal(scorePassword(pw), first);
    }
  });

  it('penalizes password containing a common substring', () => {
    const withCommon = scorePassword('MyPassword99!x');
    const withoutCommon = scorePassword('MyXzqvbndf99!x');
    assert.ok(
      withoutCommon > withCommon,
      `without common (${withoutCommon}) should score higher than with common (${withCommon})`,
    );
  });

  it('respects custom config', () => {
    const strict: StrengthConfig = {
      minLength: 20,
      requireDigit: true,
      requireSymbol: true,
      minCharacterClasses: 4,
      extraCommonPasswords: [],
    };
    const lenient: StrengthConfig = {
      minLength: 4,
      requireDigit: false,
      requireSymbol: false,
      minCharacterClasses: 1,
      extraCommonPasswords: [],
    };
    const pw = 'AbCd1234';
    const strictScore = scorePassword(pw, strict);
    const lenientScore = scorePassword(pw, lenient);
    assert.ok(lenientScore >= strictScore);
  });
});
