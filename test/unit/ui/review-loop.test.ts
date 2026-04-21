import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectOpsFromFindings } from '../../../src/ui/review-loop.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

function makeItem(overrides: Partial<BwItem> = {}): BwItem {
  return {
    id: 'test-id',
    organizationId: null,
    folderId: null,
    type: 1,
    name: 'Test Item',
    notes: null,
    favorite: false,
    login: { uris: null, username: 'user', password: 'pass', totp: null },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('collectOpsFromFindings', () => {
  it('returns empty ops for empty findings', () => {
    const result = collectOpsFromFindings([], {
      skipCategories: [],
      limitPerCategory: null,
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
    assert.equal(result.skipped, 0);
  });

  it('skips findings in skipCategories', () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem(), missingFields: ['password'] },
    ];
    const result = collectOpsFromFindings(findings, {
      skipCategories: ['weak'],
      limitPerCategory: null,
    });
    assert.equal(result.reviewed, 1);
    assert.equal(result.skipped, 1);
  });

  it('respects limitPerCategory', () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '2' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '3' }), score: 1, reasons: ['short'] },
    ];
    const result = collectOpsFromFindings(findings, {
      skipCategories: [],
      limitPerCategory: 2,
    });
    assert.equal(result.reviewed, 2);
    assert.equal(result.skipped, 1);
  });

  it('creates delete ops for duplicate findings', () => {
    const item1 = makeItem({ id: 'keep' });
    const item2 = makeItem({ id: 'dup1' });
    const item3 = makeItem({ id: 'dup2' });
    const findings: Finding[] = [
      { category: 'duplicates', items: [item1, item2, item3], key: 'test-key' },
    ];
    const result = collectOpsFromFindings(findings, {
      skipCategories: [],
      limitPerCategory: null,
    });
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'delete_item');
    assert.equal(result.ops[1]!.kind, 'delete_item');
  });

  it('creates folder ops for folder findings', () => {
    const item = makeItem({ id: 'item-1' });
    const findings: Finding[] = [
      { category: 'folders', item, suggestedFolder: 'Banking' },
    ];
    const result = collectOpsFromFindings(findings, {
      skipCategories: [],
      limitPerCategory: null,
    });
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'create_folder');
    assert.equal(result.ops[1]!.kind, 'assign_folder');
  });

  it('deduplicates create_folder ops for same folder', () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: '1' }), suggestedFolder: 'Banking' },
      { category: 'folders', item: makeItem({ id: '2' }), suggestedFolder: 'Banking' },
    ];
    const result = collectOpsFromFindings(findings, {
      skipCategories: [],
      limitPerCategory: null,
    });
    const createOps = result.ops.filter((op) => op.kind === 'create_folder');
    assert.equal(createOps.length, 1);
  });
});
