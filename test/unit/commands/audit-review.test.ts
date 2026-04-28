import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runReview, type RunReviewOpts } from '../../../src/commands/audit-review.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import { makeDuplicateFinding, makeWeakFinding, makeMissingFinding, makeFolderFinding, makeReuseFinding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import { makeNoopLogger } from '../../helpers/test-doubles.js';

function makeItem(id: string, name: string): BwItem {
  return {
    id, organizationId: null, folderId: null, type: 1 as const,
    name, notes: null, favorite: false,
    login: { uris: [{ match: null, uri: `https://${name.toLowerCase()}.com` }], username: 'user', password: 'p@ss', totp: null },
    revisionDate: '2024-01-01T00:00:00.000Z',
  };
}

function makeStubPrompt(): PromptAdapter {
  const spinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select() { return null; },
    async confirm() { return null; },
    async multiselect() { return null; },
    async text() { return null; },
    startSpinner() { return spinner; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

function makeDryRunOpts(overrides: Partial<RunReviewOpts> = {}): RunReviewOpts {
  return {
    skipCategories: [],
    limitPerCategory: null,
    logger: makeNoopLogger(),
    prompt: makeStubPrompt(),
    maskChar: '•',
    dryRun: true,
    enabledCategories: ['Banking & Finance'],
    existingFoldersByName: new Map(),
    ...overrides,
  };
}

describe('runReview', () => {
  describe('dry-run mode (collectOpsFromFindings path)', () => {
    it('returns delete ops for duplicate findings', async () => {
      const itemA = makeItem('a', 'Login A');
      const itemB = makeItem('b', 'Login B');
      const findings: Finding[] = [makeDuplicateFinding([itemA, itemB], 'example.com|user')];

      const result = await runReview(findings, makeDryRunOpts());

      assert.equal(result.cancelled, false);
      assert.equal(result.reviewed, 1);
      assert.equal(result.skipped, 0);
      assert.equal(result.ops.length, 1);
      assert.equal(result.ops[0].kind, 'delete_item');
      if (result.ops[0].kind === 'delete_item') {
        assert.equal(result.ops[0].itemId, 'b');
      }
    });

    it('returns assign_folder and create_folder ops for folder findings', async () => {
      const item = makeItem('item-1', 'Chase Bank');
      const findings: Finding[] = [
        makeFolderFinding(item, 'Banking & Finance', null, { matchedKeyword: 'chase', ruleSource: 'builtin' }),
      ];

      const result = await runReview(findings, makeDryRunOpts());

      assert.equal(result.cancelled, false);
      assert.equal(result.reviewed, 1);
      const createOps = result.ops.filter((op) => op.kind === 'create_folder');
      const assignOps = result.ops.filter((op) => op.kind === 'assign_folder');
      assert.equal(createOps.length, 1);
      assert.equal(assignOps.length, 1);
      if (createOps[0].kind === 'create_folder') {
        assert.equal(createOps[0].folderName, 'Banking & Finance');
      }
      if (assignOps[0].kind === 'assign_folder') {
        assert.equal(assignOps[0].itemId, 'item-1');
        assert.equal(assignOps[0].folderName, 'Banking & Finance');
      }
    });

    it('returns empty ops for informational-only findings (weak, reuse, missing)', async () => {
      const item = makeItem('item-1', 'Weak Login');
      const findings: Finding[] = [
        makeWeakFinding(item, 1, ['too short']),
        makeReuseFinding([item, makeItem('item-2', 'Other')], 'abc123hash'),
        makeMissingFinding(item, ['username']),
      ];

      const result = await runReview(findings, makeDryRunOpts());

      assert.equal(result.cancelled, false);
      assert.equal(result.reviewed, 3);
      assert.equal(result.ops.length, 0);
    });

    it('skips findings in skipCategories', async () => {
      const itemA = makeItem('a', 'Login A');
      const itemB = makeItem('b', 'Login B');
      const findings: Finding[] = [
        makeDuplicateFinding([itemA, itemB], 'example.com|user'),
        makeWeakFinding(makeItem('c', 'Weak'), 1, ['too short']),
      ];

      const result = await runReview(findings, makeDryRunOpts({ skipCategories: ['duplicates'] }));

      assert.equal(result.reviewed, 1);
      assert.equal(result.skipped, 1);
      assert.equal(result.ops.length, 0);
    });

    it('respects limitPerCategory', async () => {
      const findings: Finding[] = [
        makeDuplicateFinding([makeItem('a1', 'A1'), makeItem('a2', 'A2')], 'key1'),
        makeDuplicateFinding([makeItem('b1', 'B1'), makeItem('b2', 'B2')], 'key2'),
        makeDuplicateFinding([makeItem('c1', 'C1'), makeItem('c2', 'C2')], 'key3'),
      ];

      const result = await runReview(findings, makeDryRunOpts({ limitPerCategory: 2 }));

      assert.equal(result.reviewed, 2);
      assert.equal(result.skipped, 1);
      assert.equal(result.ops.length, 2);
    });

    it('returns empty result for empty findings', async () => {
      const result = await runReview([], makeDryRunOpts());

      assert.equal(result.cancelled, false);
      assert.equal(result.reviewed, 0);
      assert.equal(result.skipped, 0);
      assert.equal(result.ops.length, 0);
    });

    it('does not create duplicate folder ops for same folder name', async () => {
      const findings: Finding[] = [
        makeFolderFinding(makeItem('item-1', 'Chase'), 'Banking & Finance', null, { matchedKeyword: 'chase', ruleSource: 'builtin' }),
        makeFolderFinding(makeItem('item-2', 'Wells Fargo'), 'Banking & Finance', null, { matchedKeyword: 'wells fargo', ruleSource: 'builtin' }),
      ];

      const result = await runReview(findings, makeDryRunOpts());

      const createOps = result.ops.filter((op) => op.kind === 'create_folder');
      const assignOps = result.ops.filter((op) => op.kind === 'assign_folder');
      assert.equal(createOps.length, 1);
      assert.equal(assignOps.length, 2);
    });

    it('skips create_folder when folder already exists', async () => {
      const findings: Finding[] = [
        makeFolderFinding(makeItem('item-1', 'Chase'), 'Banking & Finance', 'existing-folder-id', { matchedKeyword: 'chase', ruleSource: 'builtin' }),
      ];

      const result = await runReview(findings, makeDryRunOpts());

      const createOps = result.ops.filter((op) => op.kind === 'create_folder');
      const assignOps = result.ops.filter((op) => op.kind === 'assign_folder');
      assert.equal(createOps.length, 0);
      assert.equal(assignOps.length, 1);
      if (assignOps[0].kind === 'assign_folder') {
        assert.equal(assignOps[0].folderId, 'existing-folder-id');
      }
    });
  });
});
