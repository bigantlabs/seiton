import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { interactiveReview } from '../../../src/ui/review-loop.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { InteractiveReviewOptions } from '../../../src/ui/review-loop.js';
import type { PendingOp } from '../../../src/lib/domain/pending.js';
import { makeItem } from '../../helpers/make-item.js';

interface FakeStdin extends EventEmitter {
  isRaw: boolean;
  setRawMode(mode: boolean): this;
  resume(): this;
  pause(): this;
}

function createFakeStdin(): FakeStdin {
  const emitter = new EventEmitter() as FakeStdin;
  emitter.isRaw = false;
  emitter.setRawMode = function (mode: boolean) { this.isRaw = mode; return this; };
  emitter.resume = function () { return this; };
  emitter.pause = function () { return this; };
  return emitter;
}

function createFakeStdout(): { write(data: string): boolean } {
  return { write() { return true; } };
}

function emitKey(stdin: FakeStdin, name: string, ctrl = false): void {
  stdin.emit('keypress', undefined, { name, ctrl, meta: false, shift: false, sequence: '' });
}

function createNoopPrompt(): PromptAdapter {
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(_msg: string, _options: { value: T }[]): Promise<T | null> { return null; },
    async confirm(): Promise<boolean | null> { return true; },
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
    prompt: createNoopPrompt(),
    maskChar: '•',
    enabledCategories: DEFAULT_CATEGORIES,
    existingFoldersByName: new Map(),
    ...overrides,
  };
}

describe('interactiveReview page display path', () => {
  it('routes folder findings through runFolderPage when isTTY and promptStyle is clack', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    const resultPromise = interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.cancelled, false);
    assert.equal(result.reviewed, 1);
    const createOp = result.ops.find((o: PendingOp) => o.kind === 'create_folder');
    const assignOp = result.ops.find((o: PendingOp) => o.kind === 'assign_folder');
    assert.ok(createOp);
    assert.ok(assignOp);
  });

  it('returns cancelled when user quits the folder page via q', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    const resultPromise = interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'q');

    const result = await resultPromise;
    assert.equal(result.cancelled, true);
    assert.deepEqual(result.ops, []);
  });

  it('handles multiple folder findings through page display', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
      { category: 'folders', item: makeItem({ id: 'item-2' }), suggestedFolder: 'Shopping', existingFolderId: null, matchReason: { matchedKeyword: 'shop', ruleSource: 'builtin' } },
    ];

    const resultPromise = interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
    }));

    await new Promise(r => setImmediate(r));
    // Accept first, move down, accept second, submit
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'j');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.cancelled, false);
    assert.equal(result.reviewed, 2);
    const creates = result.ops.filter(o => o.kind === 'create_folder');
    const assigns = result.ops.filter(o => o.kind === 'assign_folder');
    assert.equal(creates.length, 2);
    assert.equal(assigns.length, 2);
  });

  it('calls onProgress when folder page produces ops', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    let progressCalled = false;
    let progressOps: readonly PendingOp[] = [];

    const resultPromise = interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      onProgress: (ops) => { progressCalled = true; progressOps = ops; },
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    await resultPromise;
    assert.equal(progressCalled, true);
    assert.ok(progressOps.length > 0);
  });

  it('skips folder findings without entering page display when category is skipped', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    const result = await interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      skipCategories: ['folders'],
    }));

    assert.equal(result.skipped, 1);
    assert.equal(result.reviewed, 0);
    assert.deepEqual(result.ops, []);
  });

  it('uses existing folder id from existingFoldersByName in page display path', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    const resultPromise = interactiveReview(findings, opts({
      prompt: createNoopPrompt(),
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      existingFoldersByName: new Map([['banking', 'folder-existing']]),
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.cancelled, false);
    // Should use existing folder, no create_folder op
    const creates = result.ops.filter(o => o.kind === 'create_folder');
    const assigns = result.ops.filter(o => o.kind === 'assign_folder');
    assert.equal(creates.length, 0);
    assert.equal(assigns.length, 1);
    if (assigns[0]!.kind === 'assign_folder') {
      assert.equal(assigns[0]!.folderId, 'folder-existing');
    }
  });
});

describe('interactiveReview edit flow via page display', () => {
  it('pressing e then selecting a different folder produces assign_folder with overridden name', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    let selectCalls = 0;
    const prompt = createNoopPrompt();
    prompt.select = async <T>(_msg: string, options: { value: T }[]): Promise<T | null> => {
      selectCalls++;
      return options[1]?.value ?? null;
    };

    const resultPromise = interactiveReview(findings, opts({
      prompt,
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      enabledCategories: ['Banking', 'Email', 'Social'],
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'e');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.cancelled, false);
    assert.equal(result.reviewed, 1);
    const assigns = result.ops.filter((o: PendingOp) => o.kind === 'assign_folder');
    assert.equal(assigns.length, 1);
    if (assigns[0]!.kind === 'assign_folder') {
      assert.equal(assigns[0]!.folderName, 'Email');
    }
  });

  it('cancelling edit returns to page without modifying entry', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    let selectCalls = 0;
    const prompt = createNoopPrompt();
    prompt.select = async <T>(): Promise<T | null> => {
      selectCalls++;
      if (selectCalls === 1) return null;
      return null;
    };

    const resultPromise = interactiveReview(findings, opts({
      prompt,
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      enabledCategories: ['Banking', 'Email'],
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'e');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'q');

    const result = await resultPromise;
    assert.equal(result.cancelled, true);
  });

  it('create new folder calls onRuleSave and uses new folder name', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings: Finding[] = [
      { category: 'folders', item: makeItem({ id: 'item-1', name: 'My Bank', login: { uris: [{ match: null, uri: 'https://mybank.com' }], username: 'u', password: 'p', totp: null } }), suggestedFolder: 'Banking', existingFolderId: null, matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' } },
    ];

    let selectCalls = 0;
    const prompt = createNoopPrompt();
    prompt.select = async <T>(_msg: string, options: { value: T }[]): Promise<T | null> => {
      selectCalls++;
      const lastOption = options[options.length - 1];
      return lastOption?.value ?? null;
    };
    prompt.text = async (): Promise<string | null> => 'Crypto';

    const ruleSaves: { folder: string; keyword: string }[] = [];

    const resultPromise = interactiveReview(findings, opts({
      prompt,
      promptStyle: 'clack',
      isTTY: () => true,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      enabledCategories: ['Banking', 'Email'],
      onRuleSave: async (req) => { ruleSaves.push(req); },
    }));

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'e');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.cancelled, false);
    assert.equal(ruleSaves.length, 1);
    assert.equal(ruleSaves[0]!.folder, 'Crypto');
    assert.equal(ruleSaves[0]!.keyword, 'mybank.com');
    const assigns = result.ops.filter((o: PendingOp) => o.kind === 'assign_folder');
    assert.equal(assigns.length, 1);
    if (assigns[0]!.kind === 'assign_folder') {
      assert.equal(assigns[0]!.folderName, 'Crypto');
    }
  });
});
