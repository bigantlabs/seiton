import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINDING_CATEGORIES,
  INFORMATIONAL_CATEGORIES,
  ACTIONABLE_CATEGORIES,
  isFindingCategory,
  isInformationalCategory,
  makeDuplicateFinding,
  makeReuseFinding,
  makeWeakFinding,
  makeMissingFinding,
  makeFolderFinding,
} from '../../../src/lib/domain/finding.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

const STUB_ITEM: BwItem = {
  id: 'test-id',
  organizationId: null,
  folderId: null,
  type: 1,
  name: 'Test Item',
  notes: null,
  favorite: false,
  login: {
    uris: [{ match: null, uri: 'https://example.com' }],
    username: 'user@test.com',
    password: 'TestPass123!',
    totp: null,
    passwordRevisionDate: null,
  },
  revisionDate: '2024-01-01T00:00:00.000Z',
};

describe('FINDING_CATEGORIES', () => {
  it('contains exactly 5 categories', () => {
    assert.equal(FINDING_CATEGORIES.length, 5);
  });

  it('contains expected category names', () => {
    assert.deepEqual([...FINDING_CATEGORIES], [
      'duplicates', 'reuse', 'weak', 'missing', 'folders',
    ]);
  });
});

describe('isFindingCategory', () => {
  it('returns true for valid categories', () => {
    for (const cat of FINDING_CATEGORIES) {
      assert.equal(isFindingCategory(cat), true);
    }
  });

  it('returns false for invalid categories', () => {
    assert.equal(isFindingCategory('invalid'), false);
    assert.equal(isFindingCategory(''), false);
    assert.equal(isFindingCategory('WEAK'), false);
  });
});

describe('Finding construction', () => {
  it('constructs DuplicateFinding', () => {
    const finding = makeDuplicateFinding([STUB_ITEM, STUB_ITEM], 'example.com:user@test.com');
    assert.equal(finding.category, 'duplicates');
    assert.equal(finding.items.length, 2);
    assert.equal(finding.key, 'example.com:user@test.com');
  });

  it('constructs ReuseFinding', () => {
    const finding = makeReuseFinding([STUB_ITEM], 'abc123hash');
    assert.equal(finding.category, 'reuse');
    assert.equal(finding.items.length, 1);
    assert.equal(finding.passwordHash, 'abc123hash');
  });

  it('constructs WeakFinding', () => {
    const finding = makeWeakFinding(STUB_ITEM, 1, ['too short']);
    assert.equal(finding.category, 'weak');
    assert.equal(finding.item, STUB_ITEM);
    assert.equal(finding.score, 1);
    assert.deepEqual([...finding.reasons], ['too short']);
  });

  it('constructs MissingFinding', () => {
    const finding = makeMissingFinding(STUB_ITEM, ['password', 'uri']);
    assert.equal(finding.category, 'missing');
    assert.deepEqual([...finding.missingFields], ['password', 'uri']);
  });

  it('constructs FolderFinding with default null existingFolderId', () => {
    const finding = makeFolderFinding(STUB_ITEM, 'Development');
    assert.equal(finding.category, 'folders');
    assert.equal(finding.suggestedFolder, 'Development');
    assert.equal(finding.existingFolderId, null);
  });

  it('constructs FolderFinding with explicit existingFolderId', () => {
    const finding = makeFolderFinding(STUB_ITEM, 'Development', 'folder-xyz');
    assert.equal(finding.category, 'folders');
    assert.equal(finding.suggestedFolder, 'Development');
    assert.equal(finding.existingFolderId, 'folder-xyz');
  });
});

describe('finding classification', () => {
  it('classifies weak, reuse, and missing as informational', () => {
    assert.equal(isInformationalCategory('weak'), true);
    assert.equal(isInformationalCategory('reuse'), true);
    assert.equal(isInformationalCategory('missing'), true);
  });

  it('classifies duplicates and folders as actionable', () => {
    assert.equal(isInformationalCategory('duplicates'), false);
    assert.equal(isInformationalCategory('folders'), false);
  });

  it('INFORMATIONAL_CATEGORIES contains weak, reuse, missing', () => {
    assert.deepEqual([...INFORMATIONAL_CATEGORIES], ['weak', 'reuse', 'missing']);
  });

  it('ACTIONABLE_CATEGORIES contains duplicates, folders', () => {
    assert.deepEqual([...ACTIONABLE_CATEGORIES], ['duplicates', 'folders']);
  });

  it('informational + actionable covers all categories', () => {
    const all = [...INFORMATIONAL_CATEGORIES, ...ACTIONABLE_CATEGORIES].sort();
    const expected = [...FINDING_CATEGORIES].sort();
    assert.deepEqual(all, expected);
  });
});

describe('Finding discriminant', () => {
  it('discriminates findings by category field', () => {
    const findings: Finding[] = [
      makeDuplicateFinding([STUB_ITEM], 'key'),
      makeReuseFinding([STUB_ITEM], 'hash'),
      makeWeakFinding(STUB_ITEM, 2, ['reason']),
      makeMissingFinding(STUB_ITEM, ['field']),
      makeFolderFinding(STUB_ITEM, 'Folder'),
    ];

    const categories = findings.map((f) => f.category);
    assert.deepEqual(categories, ['duplicates', 'reuse', 'weak', 'missing', 'folders']);
  });

  it('allows narrowing via switch on category', () => {
    const finding: Finding = makeWeakFinding(STUB_ITEM, 1, ['short']);

    switch (finding.category) {
      case 'weak':
        assert.equal(finding.score, 1);
        assert.deepEqual([...finding.reasons], ['short']);
        break;
      case 'duplicates':
      case 'reuse':
      case 'missing':
      case 'folders':
        assert.fail('should have matched weak');
        break;
    }
  });
});
