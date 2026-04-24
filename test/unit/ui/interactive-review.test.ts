import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interactiveReview, itemLabel } from '../../../src/ui/review-loop.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';
import type { InteractiveReviewOptions } from '../../../src/ui/review-loop.js';

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

const DEFAULT_CATEGORIES = ['Banking & Finance', 'Email', 'Social'];

function opts(overrides: Partial<InteractiveReviewOptions>): InteractiveReviewOptions {
  return {
    skipCategories: [],
    limitPerCategory: null,
    prompt: makeMockPrompt([]),
    maskChar: '•',
    enabledCategories: DEFAULT_CATEGORIES,
    existingFoldersByName: new Map(),
    ...overrides,
  };
}

describe('interactiveReview', () => {
  it('returns empty ops for empty findings', async () => {
    const result = await interactiveReview([], opts({ prompt: makeMockPrompt([]) }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('skips findings in skipCategories', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const result = await interactiveReview(findings, opts({ skipCategories: ['weak'] }));
    assert.equal(result.skipped, 1);
    assert.equal(result.reviewed, 0);
  });

  it('respects limitPerCategory', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '2' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '3' }), score: 1, reasons: ['short'] },
    ];
    const result = await interactiveReview(findings, opts({ limitPerCategory: 2 }));
    assert.equal(result.reviewed, 2);
    assert.equal(result.skipped, 1);
  });

  it('creates delete ops for duplicate findings (keep first)', async () => {
    const items = [makeItem({ id: 'keep' }), makeItem({ id: 'dup1' }), makeItem({ id: 'dup2' })];
    const findings: Finding[] = [
      { category: 'duplicates', items, key: 'test-key' },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([0]) }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'delete_item');
    assert.equal(result.ops[1]!.kind, 'delete_item');
  });

  it('cancels on null from select (user presses Ctrl+C)', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'duplicates', items, key: 'k1' },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([null]) }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('creates folder ops when user accepts folder suggestion', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([0]) }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'create_folder');
    assert.equal(result.ops[1]!.kind, 'assign_folder');
  });

  it('skips folder finding when user selects skip (index 2)', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([2]) }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('shows weak findings in batch report (no individual prompt)', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const result = await interactiveReview(findings, opts({}));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('shows missing findings in batch report (no individual prompt)', async () => {
    const findings: Finding[] = [
      { category: 'missing', item: makeItem(), missingFields: ['password'] },
    ];
    const result = await interactiveReview(findings, opts({}));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('shows reuse findings in batch report (no individual prompt)', async () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const findings: Finding[] = [
      { category: 'reuse', items, passwordHash: 'abc123' },
    ];
    const result = await interactiveReview(findings, opts({}));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 1);
  });

  it('cancels on null from folder select', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([null]) }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.reviewed, 0);
  });

  it('handles mixed finding types: batch report + interactive', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'folders', item: makeItem({ id: '2' }), suggestedFolder: 'Banking', existingFolderId: null },
      { category: 'missing', item: makeItem({ id: '3' }), missingFields: ['username'] },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([0]) }));
    assert.equal(result.reviewed, 3);
    assert.equal(result.ops.length, 2);
  });

  it('deduplicates create_folder ops across multiple folder findings', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: '1' }), suggestedFolder: 'Banking', existingFolderId: null },
      { category: 'folders', item: makeItem({ id: '2' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([0, 0]) }));
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
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([1]) }));
    assert.equal(result.ops.length, 1);
    assert.equal(result.ops[0]!.kind, 'delete_item');
  });

  it('invokes onProgress after each approved op so SIGINT cleanup sees latest state', async () => {
    const findings: Finding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
      { category: 'duplicates', items: [makeItem({ id: 'c' }), makeItem({ id: 'd' })], key: 'k2' },
    ];
    const snapshots: number[] = [];
    const result = await interactiveReview(findings, opts({
      prompt: makeMockPrompt([0, 0]),
      onProgress: (ops) => snapshots.push(ops.length),
    }));
    assert.deepEqual(snapshots, [1, 2]);
    assert.equal(result.ops.length, 2);
  });

  it('"choose different folder" produces correct PendingOp', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({
      prompt: makeMockPrompt([1, 1]),
      enabledCategories: ['Banking & Finance', 'Email', 'Social'],
    }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'create_folder');
    assert.equal(result.ops[1]!.kind, 'assign_folder');
    const assignOp = result.ops[1]!;
    if (assignOp.kind === 'assign_folder') {
      assert.equal(assignOp.folderName, 'Email');
    }
  });

  it('"choose different folder" uses existing folder ID when folder exists', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const existingFolders = new Map([['email', 'folder-email-id']]);
    const result = await interactiveReview(findings, opts({
      prompt: makeMockPrompt([1, 1]),
      enabledCategories: ['Banking & Finance', 'Email', 'Social'],
      existingFoldersByName: existingFolders,
    }));
    assert.equal(result.ops.length, 1);
    assert.equal(result.ops[0]!.kind, 'assign_folder');
    const assignOp = result.ops[0]!;
    if (assignOp.kind === 'assign_folder') {
      assert.equal(assignOp.folderId, 'folder-email-id');
      assert.equal(assignOp.folderName, 'Email');
    }
  });

  it('cancels when user presses Ctrl+C on folder choice select', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null },
    ];
    const result = await interactiveReview(findings, opts({
      prompt: makeMockPrompt([1, null]),
    }));
    assert.equal(result.cancelled, true);
    assert.equal(result.ops.length, 0);
  });

  it('skips batch report when no informational findings exist', async () => {
    const findings: Finding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const logged: string[] = [];
    const prompt = makeMockPrompt([0]);
    prompt.logStep = (msg: string) => { logged.push(msg); };
    const result = await interactiveReview(findings, opts({ prompt }));
    assert.equal(result.reviewed, 1);
    assert.ok(!logged.some(m => m.includes('Informational')));
  });

  it('renders batch report when informational findings exist', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const logged: string[] = [];
    const prompt = makeMockPrompt([]);
    prompt.logStep = (msg: string) => { logged.push(msg); };
    const result = await interactiveReview(findings, opts({ prompt }));
    assert.equal(result.reviewed, 1);
    assert.ok(logged.some(m => m.includes('Informational')));
  });

  it('accepts folder with existingFolderId — no create_folder op emitted', async () => {
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: 'folder-abc' },
    ];
    const result = await interactiveReview(findings, opts({ prompt: makeMockPrompt([0]) }));
    assert.equal(result.ops.length, 1);
    assert.equal(result.ops[0]!.kind, 'assign_folder');
    if (result.ops[0]!.kind === 'assign_folder') {
      assert.equal(result.ops[0]!.folderId, 'folder-abc');
    }
  });
});

describe('itemLabel', () => {
  it('returns name only when no URI and no username', () => {
    const item = makeItem({ login: null });
    assert.equal(itemLabel(item), 'Test Item');
  });

  it('includes URI when present', () => {
    const item = makeItem({ login: { uris: [{ match: null, uri: 'https://example.com' }], username: null, password: null, totp: null } });
    assert.equal(itemLabel(item), 'Test Item (https://example.com)');
  });

  it('includes username when present', () => {
    const item = makeItem({ login: { uris: null, username: 'alice', password: null, totp: null } });
    assert.equal(itemLabel(item), 'Test Item [alice]');
  });

  it('includes both URI and username when both present', () => {
    const item = makeItem();
    assert.equal(itemLabel(item), 'Test Item (https://example.com) [user]');
  });
});
