import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { findReusedPasswords } from '../../../src/lib/strength/reuse.js';
import { makeItem } from '../../helpers/make-item.js';

function loginItem(id: string, password: string | null) {
  return makeItem({
    id,
    name: `Item ${id}`,
    login: {
      uris: [{ match: null, uri: `https://${id}.example.com` }],
      username: `user-${id}`,
      password,
      totp: null,
    },
  });
}

describe('findReusedPasswords', () => {
  it('returns empty array for empty input', () => {
    const findings = findReusedPasswords([]);
    assert.deepEqual(findings, []);
  });

  it('returns empty array for a single item', () => {
    const items = [loginItem('1', 'password123')];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('returns empty when all passwords are unique', () => {
    const items = [
      loginItem('1', 'uniquePass1!'),
      loginItem('2', 'uniquePass2!'),
      loginItem('3', 'uniquePass3!'),
    ];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('detects two items sharing the same password', () => {
    const items = [
      loginItem('1', 'shared-secret'),
      loginItem('2', 'shared-secret'),
    ];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.category, 'reuse');
    if (findings[0]!.category === 'reuse') {
      assert.equal(findings[0]!.items.length, 2);
    }
  });

  it('groups three items with the same password into one finding', () => {
    const items = [
      loginItem('1', 'same-pw'),
      loginItem('2', 'same-pw'),
      loginItem('3', 'same-pw'),
    ];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 1);
    if (findings[0]!.category === 'reuse') {
      assert.equal(findings[0]!.items.length, 3);
    }
  });

  it('produces multiple groups for distinct reused passwords', () => {
    const items = [
      loginItem('1', 'alpha'),
      loginItem('2', 'alpha'),
      loginItem('3', 'beta'),
      loginItem('4', 'beta'),
    ];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 2);
  });

  it('skips items without a login', () => {
    const items = [
      makeItem({ id: '1', name: 'Note', login: null }),
      makeItem({ id: '2', name: 'Note 2', login: null }),
    ];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('skips items with null password', () => {
    const items = [
      loginItem('1', null),
      loginItem('2', null),
    ];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('skips items with undefined password', () => {
    const items = [
      makeItem({
        id: '1',
        name: 'No PW',
        login: { uris: [], username: 'u', totp: null },
      }),
      makeItem({
        id: '2',
        name: 'No PW 2',
        login: { uris: [], username: 'u2', totp: null },
      }),
    ];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('assigns sequential passwordHash labels (reuse-group-N)', () => {
    const items = [
      loginItem('1', 'pw-a'),
      loginItem('2', 'pw-a'),
      loginItem('3', 'pw-b'),
      loginItem('4', 'pw-b'),
    ];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 2);
    const hashes = findings.map((f) => {
      if (f.category === 'reuse') return f.passwordHash;
      return '';
    });
    assert.ok(hashes.includes('reuse-group-1'));
    assert.ok(hashes.includes('reuse-group-2'));
  });

  it('uses SHA-256 to compare passwords (not plaintext comparison)', () => {
    const pw = 'test-password';
    const expectedHash = createHash('sha256').update(pw).digest('hex');
    const items = [loginItem('1', pw), loginItem('2', pw)];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 1);
    assert.ok(expectedHash.length === 64, 'SHA-256 produces 64-char hex');
  });

  it('treats passwords differing only in case as distinct', () => {
    const items = [
      loginItem('1', 'Password'),
      loginItem('2', 'password'),
    ];
    const findings = findReusedPasswords(items);
    assert.deepEqual(findings, []);
  });

  it('does not group a unique item with a reused group', () => {
    const items = [
      loginItem('1', 'shared'),
      loginItem('2', 'shared'),
      loginItem('3', 'unique'),
    ];
    const findings = findReusedPasswords(items);
    assert.equal(findings.length, 1);
    if (findings[0]!.category === 'reuse') {
      assert.equal(findings[0]!.items.length, 2);
      const ids = findings[0]!.items.map((i) => i.id);
      assert.ok(ids.includes('1'));
      assert.ok(ids.includes('2'));
      assert.ok(!ids.includes('3'));
    }
  });
});
