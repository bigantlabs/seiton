import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeItems, type AnalysisConfig, type Scorer } from '../../../src/lib/analyze/index.js';
import { makeItem } from '../../helpers/make-item.js';
import { scorePassword, collectWeaknesses } from '../../../src/lib/strength/heuristic.js';

const throwingScorer: Scorer = () => {
  throw new Error('zxcvbn unavailable');
};

function makeConfig(overrides?: Partial<AnalysisConfig>): AnalysisConfig {
  return {
    strength: {
      min_length: 12,
      require_digit: true,
      require_symbol: true,
      min_character_classes: 2,
      zxcvbn_min_score: 2,
      extra_common_passwords: [],
    },
    dedup: {
      name_similarity_threshold: 3,
      treat_www_as_same_domain: true,
      case_insensitive_usernames: true,
      compare_only_primary_uri: true,
    },
    folders: {
      preserve_existing: true,
      enabled_categories: [],
      custom_rules: [],
    },
    ...overrides,
  };
}

describe('analyzeItems heuristic fallback (zxcvbn unavailable)', () => {
  it('produces weak-password findings using heuristic scoring when scorer throws', () => {
    const items = [
      makeItem({
        id: '1',
        login: {
          uris: [{ match: null, uri: 'https://a.com' }],
          username: 'u',
          password: 'weak',
          totp: null,
        },
      }),
    ];
    const config = makeConfig();
    const findings = analyzeItems(items, config, [], throwingScorer);
    const weak = findings.filter((f) => f.category === 'weak');

    assert.ok(weak.length > 0, 'heuristic fallback should still flag weak passwords');
    if (weak[0]!.category === 'weak') {
      assert.ok(
        weak[0].reasons.some(
          (r) =>
            r.includes('below minimum') ||
            r.includes('character class') ||
            r.includes('missing digit') ||
            r.includes('missing symbol'),
        ),
        `reasons should be heuristic-style, got: ${JSON.stringify(weak[0].reasons)}`,
      );
    }
  });

  it('heuristic fallback findings match scorePassword and collectWeaknesses output', () => {
    const password = 'weak';
    const strengthCfg = {
      minLength: 12,
      requireDigit: true,
      requireSymbol: true,
      minCharacterClasses: 2,
      extraCommonPasswords: [] as string[],
    };

    const expectedScore = scorePassword(password, strengthCfg);
    const expectedReasons = collectWeaknesses(password, strengthCfg);

    const items = [
      makeItem({
        id: '1',
        login: {
          uris: [{ match: null, uri: 'https://a.com' }],
          username: 'u',
          password,
          totp: null,
        },
      }),
    ];
    const config = makeConfig();
    const findings = analyzeItems(items, config, [], throwingScorer);
    const weak = findings.filter((f) => f.category === 'weak');

    assert.equal(weak.length, 1);
    if (weak[0]!.category === 'weak') {
      assert.equal(weak[0].score, expectedScore, 'score should match heuristic scorePassword');
      assert.deepStrictEqual(
        weak[0].reasons,
        expectedReasons,
        'reasons should match heuristic collectWeaknesses',
      );
    }
  });

  it('does not flag Password1! under heuristic path when scorer throws', () => {
    const items = [
      makeItem({
        id: '1',
        login: {
          uris: [{ match: null, uri: 'https://a.com' }],
          username: 'u',
          password: 'Password1!',
          totp: null,
        },
      }),
    ];
    const config = makeConfig({
      strength: {
        min_length: 8,
        require_digit: true,
        require_symbol: true,
        min_character_classes: 2,
        zxcvbn_min_score: 2,
        extra_common_passwords: [],
      },
    });
    const findings = analyzeItems(items, config, [], throwingScorer);
    const weak = findings.filter((f) => f.category === 'weak');

    assert.equal(
      weak.length,
      0,
      'Password1! scores 3 under heuristic (passes min_score 2) but 0 under zxcvbn — ' +
        'zero weak findings proves heuristic path is active',
    );
  });

  it('falls back to heuristic and flags single-char password when scorer throws', () => {
    const items = [
      makeItem({
        id: '1',
        login: {
          uris: [{ match: null, uri: 'https://a.com' }],
          username: 'u',
          password: 'a',
          totp: null,
        },
      }),
    ];
    const config = makeConfig();
    const findings = analyzeItems(items, config, [], throwingScorer);
    const weak = findings.filter((f) => f.category === 'weak');

    assert.ok(
      weak.length > 0,
      'throwing scorer triggers heuristic fallback; heuristic path flags single-char password',
    );
  });
});
