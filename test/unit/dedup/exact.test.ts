import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findExactDuplicates } from '../../../src/lib/dedup/exact.js';
import type { DedupConfig } from '../../../src/lib/dedup/types.js';
import { makeItem } from '../../helpers/make-item.js';

const DEFAULT_CONFIG: DedupConfig = {
  treat_www_as_same_domain: true,
  case_insensitive_usernames: true,
  compare_only_primary_uri: true,
};

function loginItem(
  id: string,
  uri: string,
  username: string,
  password = 'Str0ng!Pass',
) {
  return makeItem({
    id,
    name: `Item ${id}`,
    login: {
      uris: [{ match: null, uri }],
      username,
      password,
      totp: null,
    },
  });
}

function multiUriItem(
  id: string,
  uris: string[],
  username: string,
) {
  return makeItem({
    id,
    name: `Item ${id}`,
    login: {
      uris: uris.map((uri) => ({ match: null, uri })),
      username,
      password: 'Str0ng!Pass',
      totp: null,
    },
  });
}

describe('findExactDuplicates', () => {
  it('returns empty array for empty input', () => {
    const findings = findExactDuplicates([], DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('returns empty array for a single item', () => {
    const items = [loginItem('1', 'https://example.com', 'user@test.com')];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('groups two items with same domain and username as duplicates', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://github.com', 'alice'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.category, 'duplicates');
    assert.equal(findings[0]!.items.length, 2);
  });

  it('does not group items with different domains', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://gitlab.com', 'alice'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('does not group items with different usernames', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://github.com', 'bob'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('groups three items with matching key into one finding', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://github.com', 'alice'),
      loginItem('3', 'https://github.com', 'alice'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.equal(findings.length, 1);
    const f = findings[0]!;
    assert.equal(f.category, 'duplicates');
    if (f.category === 'duplicates') assert.equal(f.items.length, 3);
  });

  it('produces multiple groups for distinct duplicate sets', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://github.com', 'alice'),
      loginItem('3', 'https://gitlab.com', 'bob'),
      loginItem('4', 'https://gitlab.com', 'bob'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.equal(findings.length, 2);
  });

  it('skips items without a login', () => {
    const items = [
      makeItem({ id: '1', name: 'Secure Note', login: null }),
      makeItem({ id: '2', name: 'Secure Note 2', login: null }),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('skips items with no URIs (key starts with colon)', () => {
    const items = [
      makeItem({
        id: '1',
        name: 'No URI',
        login: { uris: [], username: 'alice', password: 'pw', totp: null },
      }),
      makeItem({
        id: '2',
        name: 'No URI 2',
        login: { uris: [], username: 'alice', password: 'pw2', totp: null },
      }),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  it('skips items with null URI in the first slot', () => {
    const items = [
      makeItem({
        id: '1',
        name: 'Null URI',
        login: { uris: [{ match: null, uri: null }], username: 'alice', password: 'pw', totp: null },
      }),
      makeItem({
        id: '2',
        name: 'Null URI 2',
        login: { uris: [{ match: null, uri: null }], username: 'alice', password: 'pw2', totp: null },
      }),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.deepEqual(findings, []);
  });

  describe('treat_www_as_same_domain', () => {
    it('groups www and non-www when enabled', () => {
      const items = [
        loginItem('1', 'https://www.github.com', 'alice'),
        loginItem('2', 'https://github.com', 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        treat_www_as_same_domain: true,
      });
      assert.equal(findings.length, 1);
      const f = findings[0]!;
      if (f.category === 'duplicates') assert.equal(f.items.length, 2);
    });

    it('does not group www and non-www when disabled', () => {
      const items = [
        loginItem('1', 'https://www.github.com', 'alice'),
        loginItem('2', 'https://github.com', 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        treat_www_as_same_domain: false,
      });
      assert.deepEqual(findings, []);
    });
  });

  describe('case_insensitive_usernames', () => {
    it('groups different-case usernames when enabled', () => {
      const items = [
        loginItem('1', 'https://github.com', 'Alice'),
        loginItem('2', 'https://github.com', 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        case_insensitive_usernames: true,
      });
      assert.equal(findings.length, 1);
    });

    it('does not group different-case usernames when disabled', () => {
      const items = [
        loginItem('1', 'https://github.com', 'Alice'),
        loginItem('2', 'https://github.com', 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        case_insensitive_usernames: false,
      });
      assert.deepEqual(findings, []);
    });
  });

  describe('compare_only_primary_uri', () => {
    it('uses only the first URI when enabled', () => {
      const items = [
        multiUriItem('1', ['https://github.com', 'https://extra.com'], 'alice'),
        multiUriItem('2', ['https://github.com', 'https://other.com'], 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        compare_only_primary_uri: true,
      });
      assert.equal(findings.length, 1);
    });

    it('uses all URIs when disabled, differentiating on secondary URIs', () => {
      const items = [
        multiUriItem('1', ['https://github.com', 'https://extra.com'], 'alice'),
        multiUriItem('2', ['https://github.com', 'https://other.com'], 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        compare_only_primary_uri: false,
      });
      assert.deepEqual(findings, []);
    });

    it('groups items with identical multi-URI sets when disabled', () => {
      const items = [
        multiUriItem('1', ['https://github.com', 'https://extra.com'], 'alice'),
        multiUriItem('2', ['https://github.com', 'https://extra.com'], 'alice'),
      ];
      const findings = findExactDuplicates(items, {
        ...DEFAULT_CONFIG,
        compare_only_primary_uri: false,
      });
      assert.equal(findings.length, 1);
    });
  });

  it('finding has category "duplicates" and a key', () => {
    const items = [
      loginItem('1', 'https://github.com', 'alice'),
      loginItem('2', 'https://github.com', 'alice'),
    ];
    const findings = findExactDuplicates(items, DEFAULT_CONFIG);
    assert.equal(findings[0]!.category, 'duplicates');
    assert.ok(
      'key' in findings[0]!,
      'finding should have a key property',
    );
    assert.equal(typeof (findings[0] as { key: string }).key, 'string');
  });
});
