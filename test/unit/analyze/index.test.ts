import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeItems, type AnalysisConfig } from '../../../src/lib/analyze/index.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

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
      treat_www_as_same_domain: true,
      case_insensitive_usernames: true,
      compare_only_primary_uri: true,
    },
    folders: {
      preserve_existing: true,
      enabled_categories: ['Banking & Finance', 'Email', 'Social'],
      custom_rules: [],
    },
    ...overrides,
  };
}

function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'test-id',
    organizationId: null,
    folderId: null,
    type: 1,
    name: 'Test Item',
    notes: null,
    favorite: false,
    login: {
      uris: [{ match: null, uri: 'https://example.com' }],
      username: 'user',
      password: 'Str0ng!Passw0rd',
      totp: null,
    },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('analyzeItems', () => {
  it('returns empty findings for empty items', () => {
    const findings = analyzeItems([], makeConfig());
    assert.equal(findings.length, 0);
  });

  it('returns empty findings for items with no issues', () => {
    const items = [makeItem({ id: '1' })];
    const findings = analyzeItems(items, makeConfig());
    const nonFolder = findings.filter((f) => f.category !== 'folders');
    assert.equal(nonFolder.length, 0);
  });

  it('skips non-login items', () => {
    const items = [makeItem({ id: '1', type: 2, login: undefined })];
    const findings = analyzeItems(items, makeConfig());
    assert.equal(findings.length, 0);
  });

  describe('duplicates', () => {
    it('finds exact duplicates by domain+username', () => {
      const items = [
        makeItem({ id: '1', name: 'A' }),
        makeItem({ id: '2', name: 'B' }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 1);
      if (dupes[0]!.category === 'duplicates') {
        assert.equal(dupes[0].items.length, 2);
      }
    });

    it('does not group items with different URIs', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null } }),
        makeItem({ id: '2', login: { uris: [{ match: null, uri: 'https://b.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 0);
    });
  });

  describe('reused passwords', () => {
    it('finds items sharing the same password', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u1', password: 'SamePass!123', totp: null } }),
        makeItem({ id: '2', login: { uris: [{ match: null, uri: 'https://b.com' }], username: 'u2', password: 'SamePass!123', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const reuse = findings.filter((f) => f.category === 'reuse');
      assert.equal(reuse.length, 1);
      if (reuse[0]!.category === 'reuse') {
        assert.equal(reuse[0].items.length, 2);
      }
    });

    it('does not flag unique passwords', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u1', password: 'UniquePass!1', totp: null } }),
        makeItem({ id: '2', login: { uris: [{ match: null, uri: 'https://b.com' }], username: 'u2', password: 'DiffPass!2@x', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const reuse = findings.filter((f) => f.category === 'reuse');
      assert.equal(reuse.length, 0);
    });
  });

  describe('weak passwords', () => {
    it('flags short passwords', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'weak', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const weak = findings.filter((f) => f.category === 'weak');
      assert.ok(weak.length > 0);
    });

    it('does not flag strong passwords', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'V3ry$tr0ng!Pass', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const weak = findings.filter((f) => f.category === 'weak');
      assert.equal(weak.length, 0);
    });

    it('skips items without passwords', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: '', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const weak = findings.filter((f) => f.category === 'weak');
      assert.equal(weak.length, 0);
    });
  });

  describe('missing fields', () => {
    it('detects missing password', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: '', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const missing = findings.filter((f) => f.category === 'missing');
      assert.ok(missing.length > 0);
      if (missing[0]!.category === 'missing') {
        assert.ok(missing[0].missingFields.includes('password'));
      }
    });

    it('detects missing username', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: '', password: 'Str0ng!Passw0rd', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const missing = findings.filter((f) => f.category === 'missing');
      assert.ok(missing.length > 0);
      if (missing[0]!.category === 'missing') {
        assert.ok(missing[0].missingFields.includes('username'));
      }
    });

    it('detects missing URI', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [], username: 'u', password: 'Str0ng!Passw0rd', totp: null } }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const missing = findings.filter((f) => f.category === 'missing');
      assert.ok(missing.length > 0);
      if (missing[0]!.category === 'missing') {
        assert.ok(missing[0].missingFields.includes('uri'));
      }
    });
  });

  describe('folder suggestions', () => {
    it('suggests folders for unassigned items matching rules', () => {
      const items = [
        makeItem({
          id: '1',
          folderId: null,
          name: 'Chase Bank',
          login: { uris: [{ match: null, uri: 'https://chase.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const folders = findings.filter((f) => f.category === 'folders');
      assert.ok(folders.length > 0);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].suggestedFolder, 'Banking & Finance');
      }
    });

    it('skips items already in a folder when preserve_existing is true', () => {
      const items = [
        makeItem({
          id: '1',
          folderId: 'existing-folder',
          name: 'Chase Bank',
          login: { uris: [{ match: null, uri: 'https://chase.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 0);
    });

    it('suggests folders for items in folders when preserve_existing is false', () => {
      const items = [
        makeItem({
          id: '1',
          folderId: 'existing-folder',
          name: 'Chase Bank',
          login: { uris: [{ match: null, uri: 'https://chase.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
        }),
      ];
      const config = makeConfig({
        folders: { preserve_existing: false, enabled_categories: ['Banking & Finance'], custom_rules: [] },
      });
      const findings = analyzeItems(items, config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.ok(folders.length > 0);
    });
  });

  describe('folder finding producer shape', () => {
    it('produces FolderFinding with item reference and suggestedFolder from analyzeItems', () => {
      const item = makeItem({
        id: 'github-item',
        folderId: null,
        name: 'GitHub',
        login: { uris: [{ match: null, uri: 'https://github.com' }], username: 'dev', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Development'], custom_rules: [] },
      });
      const findings = analyzeItems([item], config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      const f = folders[0]!;
      assert.equal(f.category, 'folders');
      if (f.category === 'folders') {
        assert.equal(f.item.id, 'github-item');
        assert.equal(f.suggestedFolder, 'Development');
        assert.equal('matchedRule' in f, false, 'FolderFinding should not have matchedRule property');
      }
    });

    it('produces FolderFinding via custom_rules through analyzeItems', () => {
      const item = makeItem({
        id: 'custom-item',
        folderId: null,
        name: 'My Crypto Exchange',
        login: { uris: [{ match: null, uri: 'https://exchange.example.com' }], username: 'trader', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: {
          preserve_existing: true,
          enabled_categories: [],
          custom_rules: [{ folder: 'Crypto', keywords: ['crypto'] }],
        },
      });
      const findings = analyzeItems([item], config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].item.id, 'custom-item');
        assert.equal(folders[0].suggestedFolder, 'Crypto');
      }
    });

    it('classifies items by URI when name does not match', () => {
      const item = makeItem({
        id: 'uri-match',
        folderId: null,
        name: 'My Account',
        login: { uris: [{ match: null, uri: 'https://gmail.com/login' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Email'], custom_rules: [] },
      });
      const findings = analyzeItems([item], config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].suggestedFolder, 'Email');
      }
    });

    it('does not produce FolderFinding when no rule matches', () => {
      const item = makeItem({
        id: 'no-match',
        folderId: null,
        name: 'Random Service',
        login: { uris: [{ match: null, uri: 'https://uniquesite.example.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Banking & Finance'], custom_rules: [] },
      });
      const findings = analyzeItems([item], config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 0);
    });

    it('filters null URIs before classification', () => {
      const item = makeItem({
        id: 'null-uri-folder',
        folderId: null,
        name: 'Netflix',
        login: { uris: [{ match: null, uri: null }, { match: null, uri: 'https://netflix.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Entertainment'], custom_rules: [] },
      });
      const findings = analyzeItems([item], config);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].suggestedFolder, 'Entertainment');
      }
    });
  });

  describe('existing folders handling', () => {
    it('sets existingFolderId to null when no existing folder matches', () => {
      const item = makeItem({
        id: 'gh',
        folderId: null,
        name: 'GitHub',
        login: { uris: [{ match: null, uri: 'https://github.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Development'], custom_rules: [] },
      });
      const findings = analyzeItems([item], config, []);
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].existingFolderId, null);
      }
    });

    it('resolves existingFolderId when an existing folder name matches the suggestion', () => {
      const item = makeItem({
        id: 'gh',
        folderId: null,
        name: 'GitHub',
        login: { uris: [{ match: null, uri: 'https://github.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Development'], custom_rules: [] },
      });
      const findings = analyzeItems(
        [item],
        config,
        [{ id: 'dev-folder-uuid', name: 'Development' }],
      );
      const folders = findings.filter((f) => f.category === 'folders');
      assert.equal(folders.length, 1);
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].existingFolderId, 'dev-folder-uuid');
      }
    });

    it('folder name matching is case-sensitive', () => {
      const item = makeItem({
        id: 'gh',
        folderId: null,
        name: 'GitHub',
        login: { uris: [{ match: null, uri: 'https://github.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Development'], custom_rules: [] },
      });
      const findings = analyzeItems(
        [item],
        config,
        [{ id: 'dev-lower-uuid', name: 'development' }],
      );
      const folders = findings.filter((f) => f.category === 'folders');
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].existingFolderId, null);
      }
    });

    it('picks the first matching folder id when duplicates exist in the vault', () => {
      const item = makeItem({
        id: 'gh',
        folderId: null,
        name: 'GitHub',
        login: { uris: [{ match: null, uri: 'https://github.com' }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig({
        folders: { preserve_existing: true, enabled_categories: ['Development'], custom_rules: [] },
      });
      const findings = analyzeItems(
        [item],
        config,
        [
          { id: 'first-uuid', name: 'Development' },
          { id: 'second-uuid', name: 'Development' },
        ],
      );
      const folders = findings.filter((f) => f.category === 'folders');
      if (folders[0]!.category === 'folders') {
        assert.equal(folders[0].existingFolderId, 'first-uuid');
      }
    });
  });

  describe('determinism', () => {
    it('produces identical findings for identical input', () => {
      const items = [
        makeItem({ id: '1', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'weak', totp: null } }),
        makeItem({ id: '2', login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'weak', totp: null } }),
      ];
      const config = makeConfig();
      const r1 = analyzeItems(items, config);
      const r2 = analyzeItems(items, config);
      assert.deepStrictEqual(r1, r2);
    });

    it('produces equivalent findings regardless of input order', () => {
      const itemA = makeItem({
        id: '1',
        name: 'Alpha',
        login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'weak', totp: null },
      });
      const itemB = makeItem({
        id: '2',
        name: 'Beta',
        login: { uris: [{ match: null, uri: 'https://a.com' }], username: 'u', password: 'weak', totp: null },
      });
      const itemC = makeItem({
        id: '3',
        name: 'Gamma',
        folderId: null,
        login: { uris: [{ match: null, uri: 'https://b.com' }], username: 'u2', password: 'Str0ng!Passw0rd', totp: null },
      });
      const config = makeConfig();

      const forward = analyzeItems([itemA, itemB, itemC], config);
      const reversed = analyzeItems([itemC, itemB, itemA], config);

      const sortFindings = (findings: typeof forward) =>
        [...findings].sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          const aIds = 'items' in a ? a.items.map((i) => i.id).sort().join(',') : ('item' in a ? a.item.id : '');
          const bIds = 'items' in b ? b.items.map((i) => i.id).sort().join(',') : ('item' in b ? b.item.id : '');
          return aIds.localeCompare(bIds);
        });

      const normalizeGroupOrder = (findings: typeof forward) =>
        sortFindings(findings).map((f) => {
          if ('items' in f) {
            return { ...f, items: [...f.items].sort((a, b) => a.id.localeCompare(b.id)) };
          }
          return f;
        });

      assert.deepStrictEqual(normalizeGroupOrder(forward), normalizeGroupOrder(reversed));
    });
  });

  describe('compare_only_primary_uri: false', () => {
    it('groups duplicates using all URIs when compare_only_primary_uri is false', () => {
      const items = [
        makeItem({
          id: '1',
          name: 'A',
          login: {
            uris: [
              { match: null, uri: 'https://a.com' },
              { match: null, uri: 'https://b.com' },
            ],
            username: 'u',
            password: 'Str0ng!Passw0rd',
            totp: null,
          },
        }),
        makeItem({
          id: '2',
          name: 'B',
          login: {
            uris: [
              { match: null, uri: 'https://a.com' },
              { match: null, uri: 'https://b.com' },
            ],
            username: 'u',
            password: 'Str0ng!Passw0rd',
            totp: null,
          },
        }),
      ];
      const config = makeConfig({
        dedup: { treat_www_as_same_domain: true, case_insensitive_usernames: true, compare_only_primary_uri: false },
      });
      const findings = analyzeItems(items, config);
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 1);
      if (dupes[0]!.category === 'duplicates') {
        assert.equal(dupes[0].items.length, 2);
      }
    });

    it('groups items with identical URIs in different order when compare_only_primary_uri is false', () => {
      const items = [
        makeItem({
          id: '1',
          name: 'A',
          login: {
            uris: [
              { match: null, uri: 'https://a.com' },
              { match: null, uri: 'https://b.com' },
            ],
            username: 'u',
            password: 'Str0ng!Passw0rd',
            totp: null,
          },
        }),
        makeItem({
          id: '2',
          name: 'B',
          login: {
            uris: [
              { match: null, uri: 'https://b.com' },
              { match: null, uri: 'https://a.com' },
            ],
            username: 'u',
            password: 'Str0ng!Passw0rd',
            totp: null,
          },
        }),
      ];
      const config = makeConfig({
        dedup: { treat_www_as_same_domain: true, case_insensitive_usernames: true, compare_only_primary_uri: false },
      });
      const findings = analyzeItems(items, config);
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 1, 'identical URIs in different order match when compare_only_primary_uri is false');
    });
  });

  describe('null URI entries', () => {
    it('handles login.uris with uri: null without crashing', () => {
      const items = [
        makeItem({
          id: '1',
          name: 'NullUri',
          login: { uris: [{ match: null, uri: null }], username: 'u', password: 'Str0ng!Passw0rd', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const missing = findings.filter((f) => f.category === 'missing');
      assert.equal(missing.length, 1, 'item with only null URIs should flag missing uri');
    });

    it('does not group null-URI items as duplicates when they have different usernames', () => {
      const items = [
        makeItem({
          id: '1',
          login: { uris: [{ match: null, uri: null }], username: 'alice', password: 'Str0ng!Passw0rd', totp: null },
        }),
        makeItem({
          id: '2',
          login: { uris: [{ match: null, uri: null }], username: 'bob', password: 'An0ther!Pass99', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 0);
    });
  });

  describe('colon-key early-continue guard', () => {
    it('skips items with null URI and null username (key would be ":")', () => {
      const items = [
        makeItem({
          id: '1',
          login: { uris: [{ match: null, uri: null }], username: null, password: 'Str0ng!Passw0rd', totp: null },
        }),
        makeItem({
          id: '2',
          login: { uris: [{ match: null, uri: null }], username: null, password: 'An0ther!Pass99', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 0, 'items with empty domain and empty username should not be grouped as duplicates');
    });

    it('skips items with no uris and empty username (key would be ":")', () => {
      const items = [
        makeItem({
          id: '1',
          login: { uris: [], username: '', password: 'Str0ng!Passw0rd', totp: null },
        }),
        makeItem({
          id: '2',
          login: { uris: [], username: '', password: 'An0ther!Pass99', totp: null },
        }),
      ];
      const findings = analyzeItems(items, makeConfig());
      const dupes = findings.filter((f) => f.category === 'duplicates');
      assert.equal(dupes.length, 0, 'items with empty dedup key should not be grouped as duplicates');
    });
  });

  describe('extra_common_passwords', () => {
    it('flags password containing an extra_common_passwords entry', () => {
      const items = [
        makeItem({
          id: '1',
          login: {
            uris: [{ match: null, uri: 'https://a.com' }],
            username: 'u',
            password: 'myCompanyName99!x',
            totp: null,
          },
        }),
      ];
      const config = makeConfig({
        strength: {
          min_length: 12,
          require_digit: true,
          require_symbol: true,
          min_character_classes: 2,
          zxcvbn_min_score: 4,
          extra_common_passwords: ['companyname'],
        },
      });
      const findings = analyzeItems(items, config);
      const weak = findings.filter((f) => f.category === 'weak');
      assert.ok(weak.length > 0, 'password containing extra common substring should be flagged at zxcvbn_min_score: 4');
      if (weak[0]!.category === 'weak') {
        assert.ok(
          weak[0].reasons.some((r) => r.includes('common password')),
          'reasons should mention common password substring',
        );
      }
    });

    it('does not flag same password when extra_common_passwords is empty', () => {
      const items = [
        makeItem({
          id: '1',
          login: {
            uris: [{ match: null, uri: 'https://a.com' }],
            username: 'u',
            password: 'myCompanyName99!x',
            totp: null,
          },
        }),
      ];
      const config = makeConfig({
        strength: {
          min_length: 12,
          require_digit: true,
          require_symbol: true,
          min_character_classes: 2,
          zxcvbn_min_score: 4,
          extra_common_passwords: [],
        },
      });
      const findings = analyzeItems(items, config);
      const weak = findings.filter((f) => f.category === 'weak');
      assert.equal(weak.length, 0, 'same password should score 4 (pass) when extra_common_passwords is empty');
    });
  });
});
