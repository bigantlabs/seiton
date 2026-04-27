import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findNearDuplicateGroups } from '../../../src/lib/dedup/near.js';
import { makeItem } from '../../helpers/make-item.js';

function loginItem(id: string, name: string) {
  return makeItem({
    id,
    name,
    login: { uris: [{ match: null, uri: `https://${name.toLowerCase()}.com` }], username: 'u', password: 'Str0ng!Pass', totp: null },
  });
}

describe('findNearDuplicateGroups', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(findNearDuplicateGroups([], 3), []);
  });

  it('returns empty array for single item', () => {
    assert.deepEqual(findNearDuplicateGroups([loginItem('1', 'GitHub')], 3), []);
  });

  it('returns empty array when threshold is 0', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'GitHub')];
    assert.deepEqual(findNearDuplicateGroups(items, 0), []);
  });

  it('returns empty array when threshold is negative', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'GitHub')];
    assert.deepEqual(findNearDuplicateGroups(items, -1), []);
  });

  it('groups exact-match names (distance 0)', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'GitHub')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.items.length, 2);
    assert.equal(groups[0]!.maxDistance, 0);
  });

  it('groups items within threshold distance', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'GitHubb')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.items.length, 2);
    assert.equal(groups[0]!.maxDistance, 1);
  });

  it('includes pairs at exactly the threshold boundary', () => {
    const items = [loginItem('1', 'abc'), loginItem('2', 'abcdef')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
  });

  it('excludes pairs beyond threshold', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'Facebook')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 0);
  });

  it('clusters transitively: A-B close and B-C close produces one group', () => {
    const items = [
      loginItem('1', 'GitHub'),
      loginItem('2', 'GitHubb'),
      loginItem('3', 'GitHubbb'),
    ];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.items.length, 3);
  });

  it('records maxDistance as the largest pairwise distance in the cluster', () => {
    const items = [
      loginItem('1', 'GitHub'),
      loginItem('2', 'GitHubb'),
      loginItem('3', 'GitHubbb'),
    ];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups[0]!.maxDistance, 2);
  });

  it('is case-insensitive', () => {
    const items = [loginItem('1', 'GitHub'), loginItem('2', 'GITHUB')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.maxDistance, 0);
  });

  it('handles short names', () => {
    const items = [loginItem('1', 'VPN'), loginItem('2', 'VPS')];
    const groups = findNearDuplicateGroups(items, 1);
    assert.equal(groups.length, 1);
  });

  it('short names not grouped when threshold is too low', () => {
    const items = [loginItem('1', 'VPN'), loginItem('2', 'VPS')];
    const groups = findNearDuplicateGroups(items, 0);
    assert.equal(groups.length, 0);
  });

  it('skips pairs via length-difference pruning', () => {
    const items = [loginItem('1', 'a'), loginItem('2', 'abcde')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 0);
  });

  it('handles large threshold without crashing', () => {
    const items = [loginItem('1', 'abc'), loginItem('2', 'xyz')];
    const groups = findNearDuplicateGroups(items, 100);
    assert.equal(groups.length, 1);
  });

  it('skips non-login items', () => {
    const items = [
      loginItem('1', 'GitHub'),
      makeItem({ id: '2', name: 'GitHub', type: 2, login: undefined }),
    ];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 0);
  });

  it('produces separate groups for unrelated clusters', () => {
    const items = [
      loginItem('1', 'GitHub'),
      loginItem('2', 'GitHubb'),
      loginItem('3', 'Amazon'),
      loginItem('4', 'Amazn'),
    ];
    const groups = findNearDuplicateGroups(items, 2);
    assert.equal(groups.length, 2);
  });

  it('trims whitespace from names', () => {
    const items = [loginItem('1', '  GitHub  '), loginItem('2', 'GitHub')];
    const groups = findNearDuplicateGroups(items, 3);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.maxDistance, 0);
  });
});
