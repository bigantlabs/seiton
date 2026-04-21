import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interactiveReview } from '../../../src/ui/review-loop.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
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
    login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'pass', totp: null },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockPrompt(responses: (number | boolean | null)[]): PromptAdapter {
  let idx = 0;
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(_msg: string, options: { value: T }[]): Promise<T | null> {
      const resp = responses[idx++];
      if (resp === null) return null;
      if (typeof resp === 'number') return options[resp]?.value ?? null;
      return null;
    },
    async confirm(): Promise<boolean | null> {
      const resp = responses[idx++];
      if (resp === null) return null;
      return Boolean(resp);
    },
    async multiselect<T>(): Promise<T[] | null> { return []; },
    async text(): Promise<string | null> { return ''; },
    startSpinner(): SpinnerHandle { return noopSpinner; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

describe('interactiveReview', () => {
  it('returns empty ops for empty findings', async () => {
    const prompt = makeMockPrompt([]);
    const result = await interactiveReview([], {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('skips findings in skipCategories', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const prompt = makeMockPrompt([]);
    const result = await interactiveReview(findings, {
      skipCategories: ['weak'],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.skipped, 1);
    assert.equal(result.reviewed, 0);
  });

  it('respects limitPerCategory', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '2' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '3' }), score: 1, reasons: ['short'] },
    ];
    const prompt = makeMockPrompt([true, true]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: 2,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.reviewed, 2);
    assert.equal(result.skipped, 1);
  });

  it('creates delete ops for duplicate findings (keep first)', async () => {
    const items = [makeItem({ id: 'keep' }), makeItem({ id: 'dup1' }), makeItem({ id: 'dup2' })];
    const findings: Finding[] = [
      { category: 'duplicates', items, key: 'test-key' },
    ];
    const prompt = makeMockPrompt([0]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'delete_item');
    assert.equal(result.ops[1]!.kind, 'delete_item');
  });

  it('cancels on null from select (user presses Ctrl+C)', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'duplicates', items, key: 'k1' },
    ];
    const prompt = makeMockPrompt([null]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('creates folder ops when user accepts folder suggestion', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking' },
    ];
    const prompt = makeMockPrompt([0]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'create_folder');
    assert.equal(result.ops[1]!.kind, 'assign_folder');
  });

  it('skips folder finding when user selects skip', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking' },
    ];
    const prompt = makeMockPrompt([1]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('acknowledges weak finding when user confirms', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const prompt = makeMockPrompt([true]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('cancels on null from confirm (weak finding)', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const prompt = makeMockPrompt([null]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.reviewed, 0);
  });

  it('acknowledges missing-fields finding when user confirms', async () => {
    const findings: Finding[] = [
      { category: 'missing', item: makeItem(), missingFields: ['password'] },
    ];
    const prompt = makeMockPrompt([true]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('cancels on null from confirm (missing finding)', async () => {
    const findings: Finding[] = [
      { category: 'missing', item: makeItem(), missingFields: ['password'] },
    ];
    const prompt = makeMockPrompt([null]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.reviewed, 0);
  });

  it('acknowledges reuse finding when user confirms', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'reuse', items, passwordHash: 'abc123' },
    ];
    const prompt = makeMockPrompt([true]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('cancels on null from confirm (reuse finding)', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'reuse', items, passwordHash: 'abc123' },
    ];
    const prompt = makeMockPrompt([null]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.reviewed, 0);
  });

  it('cancels on null from folder select', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking' },
    ];
    const prompt = makeMockPrompt([null]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('handles mixed finding types in sequence', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'folders', item: makeItem({ id: '2' }), suggestedFolder: 'Banking' },
      { category: 'missing', item: makeItem({ id: '3' }), missingFields: ['username'] },
    ];
    const prompt = makeMockPrompt([true, 0, true]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.reviewed, 3);
    assert.equal(result.ops.length, 2);
  });

  it('deduplicates create_folder ops across multiple folder findings', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: '1' }), suggestedFolder: 'Banking' },
      { category: 'folders', item: makeItem({ id: '2' }), suggestedFolder: 'Banking' },
    ];
    const prompt = makeMockPrompt([0, 0]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    const createOps = result.ops.filter(op => op.kind === 'create_folder');
    assert.equal(createOps.length, 1);
    const assignOps = result.ops.filter(op => op.kind === 'assign_folder');
    assert.equal(assignOps.length, 2);
  });

  it('keeps second duplicate when user selects index 1', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'duplicates', items, key: 'k1' },
    ];
    const prompt = makeMockPrompt([1]);
    const result = await interactiveReview(findings, {
      skipCategories: [],
      limitPerCategory: null,
      prompt,
      maskChar: '•',
    });
    assert.equal(result.ops.length, 1);
    assert.equal(result.ops[0]!.kind, 'delete_item');
  });
});
