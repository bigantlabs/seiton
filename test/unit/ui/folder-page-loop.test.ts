import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runFolderPage } from '../../../src/ui/folder-page-loop.js';
import { makeItem } from '../../helpers/make-item.js';
import type { FolderFinding } from '../../../src/lib/domain/finding.js';
import type { PromptAdapter, SelectOption, SpinnerHandle } from '../../../src/ui/prompts.js';

function makeFolderFinding(overrides: Partial<FolderFinding> = {}): FolderFinding {
  return {
    category: 'folders',
    item: makeItem(),
    suggestedFolder: 'Banking',
    existingFolderId: null,
    matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' },
    ...overrides,
  };
}

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

interface FakeStdout {
  write(data: string): boolean;
  written: string[];
}

function createFakeStdout(): FakeStdout {
  const written: string[] = [];
  return {
    written,
    write(data: string) { written.push(data); return true; },
  };
}

function emitKey(stdin: FakeStdin, name: string, ctrl = false): void {
  stdin.emit('keypress', undefined, { name, ctrl, meta: false, shift: false, sequence: '' });
}

function createMockPrompt(confirmResult: boolean | null = true): PromptAdapter {
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(_msg: string, _options: SelectOption<T>[]): Promise<T | null> { return null; },
    async confirm(): Promise<boolean | null> { return confirmResult; },
    async multiselect<T>(): Promise<T[] | null> { return null; },
    async text(): Promise<string | null> { return null; },
    startSpinner(): SpinnerHandle { return { message() {}, stop() {}, error() {} }; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

describe('runFolderPage - keypressLoop', () => {
  it('returns cancel action when q is pressed', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [makeFolderFinding()];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'q');

    const result = await resultPromise;
    assert.equal(result.action, 'cancel');
  });

  it('returns cancel action when Ctrl+C is pressed', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [makeFolderFinding()];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'c', true);

    const result = await resultPromise;
    assert.equal(result.action, 'cancel');
  });

  it('submits on Enter producing ops for accepted entries', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'item-1' }), suggestedFolder: 'Banking' }),
    ];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.action, 'submit');
    if (result.action === 'submit') {
      assert.ok(result.ops.length > 0);
      const createOp = result.ops.find(o => o.kind === 'create_folder');
      const assignOp = result.ops.find(o => o.kind === 'assign_folder');
      assert.ok(createOp);
      assert.ok(assignOp);
    }
  });

  it('marks entry as deleted and produces delete_item op after confirmation', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'del-1', name: 'To Delete' }) }),
    ];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(true),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'd');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.action, 'submit');
    if (result.action === 'submit') {
      assert.equal(result.deleteCount, 1);
      const deleteOp = result.ops.find(o => o.kind === 'delete_item');
      assert.ok(deleteOp);
      if (deleteOp.kind === 'delete_item') {
        assert.equal(deleteOp.itemId, 'del-1');
      }
    }
  });

  it('navigates with j/k keys', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'item-0' }), suggestedFolder: 'Banking' }),
      makeFolderFinding({ item: makeItem({ id: 'item-1' }), suggestedFolder: 'Shopping' }),
    ];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'j');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 's');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'k');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.action, 'submit');
    if (result.action === 'submit') {
      const assignOps = result.ops.filter(o => o.kind === 'assign_folder');
      assert.equal(assignOps.length, 1);
    }
  });

  it('restores raw mode state after completion', async () => {
    const stdin = createFakeStdin();
    stdin.isRaw = false;
    const stdout = createFakeStdout();
    const findings = [makeFolderFinding()];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'q');

    await resultPromise;
    assert.equal(stdin.isRaw, false);
  });

  it('submits empty ops when all entries are skipped', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [makeFolderFinding()];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 's');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.action, 'submit');
    if (result.action === 'submit') {
      assert.deepEqual(result.ops, []);
      assert.equal(result.deleteCount, 0);
    }
  });

  it('returns edit action with entryIndex when e is pressed', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'item-0' }) }),
      makeFolderFinding({ item: makeItem({ id: 'item-1' }) }),
    ];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'j');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'e');

    const result = await resultPromise;
    assert.equal(result.action, 'edit');
    if (result.action === 'edit') {
      assert.equal(result.entryIndex, 1);
      assert.equal(result.state.entries.length, 2);
    }
  });
});

describe('runFolderPage - recursive restart on deletion decline', () => {
  it('restarts page when deletion confirmation is declined', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'item-0' }) }),
    ];

    let confirmCallCount = 0;
    const prompt = createMockPrompt();
    prompt.confirm = async (): Promise<boolean | null> => {
      confirmCallCount++;
      if (confirmCallCount === 1) {
        setTimeout(() => emitKey(stdin, 'q'), 10);
        return false;
      }
      return true;
    };

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      prompt,
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'd');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(confirmCallCount, 1);
    assert.equal(result.action, 'cancel');
  });

  it('proceeds with deletion when confirmation is accepted', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [
      makeFolderFinding({ item: makeItem({ id: 'del-item' }) }),
    ];

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      createMockPrompt(true),
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'd');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    const result = await resultPromise;
    assert.equal(result.action, 'submit');
    if (result.action === 'submit') {
      assert.equal(result.deleteCount, 1);
      assert.ok(result.ops.some(o => o.kind === 'delete_item'));
    }
  });

  it('does not prompt for confirmation when no deletions', async () => {
    const stdin = createFakeStdin();
    const stdout = createFakeStdout();
    const findings = [makeFolderFinding({ item: makeItem({ id: 'item-0' }) })];

    let confirmCalled = false;
    const prompt = createMockPrompt();
    prompt.confirm = async (): Promise<boolean | null> => {
      confirmCalled = true;
      return true;
    };

    const resultPromise = runFolderPage(
      findings,
      new Map(),
      prompt,
      stdin as unknown as NodeJS.ReadStream,
      stdout as unknown as NodeJS.WriteStream,
    );

    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'a');
    await new Promise(r => setImmediate(r));
    emitKey(stdin, 'return');

    await resultPromise;
    assert.equal(confirmCalled, false);
  });
});
