import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createPromptAdapter, type PromptAdapter } from '../../../src/ui/prompts.js';

describe('createPromptAdapter', () => {
  describe('clack adapter', () => {
    it('creates a clack adapter with all required methods', () => {
      const adapter = createPromptAdapter('clack');
      assert.equal(typeof adapter.intro, 'function');
      assert.equal(typeof adapter.outro, 'function');
      assert.equal(typeof adapter.cancelled, 'function');
      assert.equal(typeof adapter.select, 'function');
      assert.equal(typeof adapter.confirm, 'function');
      assert.equal(typeof adapter.multiselect, 'function');
      assert.equal(typeof adapter.text, 'function');
      assert.equal(typeof adapter.startSpinner, 'function');
      assert.equal(typeof adapter.logInfo, 'function');
      assert.equal(typeof adapter.logSuccess, 'function');
      assert.equal(typeof adapter.logWarning, 'function');
      assert.equal(typeof adapter.logError, 'function');
      assert.equal(typeof adapter.logStep, 'function');
    });
  });

  describe('plain adapter', () => {
    let adapter: PromptAdapter;
    let stdoutChunks: string[];
    let stderrChunks: string[];
    let origStdoutWrite: typeof process.stdout.write;
    let origStderrWrite: typeof process.stderr.write;

    beforeEach(() => {
      adapter = createPromptAdapter('plain');
      stdoutChunks = [];
      stderrChunks = [];
      origStdoutWrite = process.stdout.write;
      origStderrWrite = process.stderr.write;
      process.stdout.write = ((chunk: string) => {
        stdoutChunks.push(chunk);
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string) => {
        stderrChunks.push(chunk);
        return true;
      }) as typeof process.stderr.write;
    });

    afterEach(() => {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      mock.restoreAll();
    });

    it('creates a plain adapter with all required methods', () => {
      assert.equal(typeof adapter.intro, 'function');
      assert.equal(typeof adapter.outro, 'function');
      assert.equal(typeof adapter.cancelled, 'function');
      assert.equal(typeof adapter.select, 'function');
      assert.equal(typeof adapter.confirm, 'function');
      assert.equal(typeof adapter.multiselect, 'function');
      assert.equal(typeof adapter.text, 'function');
      assert.equal(typeof adapter.startSpinner, 'function');
      assert.equal(typeof adapter.logInfo, 'function');
      assert.equal(typeof adapter.logSuccess, 'function');
      assert.equal(typeof adapter.logWarning, 'function');
      assert.equal(typeof adapter.logError, 'function');
      assert.equal(typeof adapter.logStep, 'function');
    });

    describe('intro', () => {
      it('writes title with separator to stdout', () => {
        adapter.intro('Vault Audit');
        const output = stdoutChunks.join('');
        assert.ok(output.includes('Vault Audit'));
        assert.ok(output.includes('─'));
      });
    });

    describe('outro', () => {
      it('writes message to stdout', () => {
        adapter.outro('All done.');
        const output = stdoutChunks.join('');
        assert.ok(output.includes('All done.'));
      });
    });

    describe('cancelled', () => {
      it('writes default message to stderr', () => {
        adapter.cancelled();
        const output = stderrChunks.join('');
        assert.ok(output.includes('Operation cancelled.'));
      });

      it('writes custom message to stderr', () => {
        adapter.cancelled('User aborted.');
        const output = stderrChunks.join('');
        assert.ok(output.includes('User aborted.'));
      });
    });

    describe('log methods', () => {
      it('logInfo writes [info] prefix to stderr', () => {
        adapter.logInfo('checking items');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[info]'));
        assert.ok(output.includes('checking items'));
      });

      it('logSuccess writes [ok] prefix to stderr', () => {
        adapter.logSuccess('items loaded');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[ok]'));
        assert.ok(output.includes('items loaded'));
      });

      it('logWarning writes [warn] prefix to stderr', () => {
        adapter.logWarning('sync failed');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[warn]'));
        assert.ok(output.includes('sync failed'));
      });

      it('logError writes [error] prefix to stderr', () => {
        adapter.logError('fetch failed');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[error]'));
        assert.ok(output.includes('fetch failed'));
      });

      it('logStep writes [step] prefix to stderr', () => {
        adapter.logStep('analyzing');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[step]'));
        assert.ok(output.includes('analyzing'));
      });
    });

    describe('startSpinner', () => {
      it('returns handle with message/stop/error', () => {
        const handle = adapter.startSpinner('Loading…');
        assert.equal(typeof handle.message, 'function');
        assert.equal(typeof handle.stop, 'function');
        assert.equal(typeof handle.error, 'function');
      });

      it('writes initial message to stderr', () => {
        adapter.startSpinner('Fetching vault…');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[...]'));
        assert.ok(output.includes('Fetching vault…'));
      });

      it('handle.message writes progress to stderr', () => {
        const handle = adapter.startSpinner('start');
        stderrChunks.length = 0;
        handle.message('50% done');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[...]'));
        assert.ok(output.includes('50% done'));
      });

      it('handle.stop writes done message to stderr', () => {
        const handle = adapter.startSpinner('start');
        stderrChunks.length = 0;
        handle.stop('Finished');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[done]'));
        assert.ok(output.includes('Finished'));
      });

      it('handle.stop with no message writes nothing', () => {
        const handle = adapter.startSpinner('start');
        stderrChunks.length = 0;
        handle.stop();
        assert.equal(stderrChunks.length, 0);
      });

      it('handle.error writes error message to stderr', () => {
        const handle = adapter.startSpinner('start');
        stderrChunks.length = 0;
        handle.error('Something broke');
        const output = stderrChunks.join('');
        assert.ok(output.includes('[error]'));
        assert.ok(output.includes('Something broke'));
      });

      it('handle.error with no message writes nothing', () => {
        const handle = adapter.startSpinner('start');
        stderrChunks.length = 0;
        handle.error();
        assert.equal(stderrChunks.length, 0);
      });
    });

  });

  describe('style selection', () => {
    it('returns different adapter instances for clack and plain', () => {
      const clack = createPromptAdapter('clack');
      const plain = createPromptAdapter('plain');
      assert.notEqual(clack, plain);
    });
  });
});

describe('plain adapter multiselect hint display', () => {
  let origStdoutWrite: typeof process.stdout.write;
  let origStdin: typeof process.stdin;
  let captured: string[];

  beforeEach(() => {
    captured = [];
    origStdoutWrite = process.stdout.write;
    origStdin = process.stdin;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true, writable: true });
  });

  it('renders hint text in parentheses for options that have hints', async () => {
    const fakeStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true, writable: true });

    const adapter = createPromptAdapter('plain');
    setImmediate(() => fakeStdin.write('1\n'));

    const result = await adapter.multiselect('Pick items:', [
      { value: 'a', label: 'Item A', hint: 'Banking · group-a · revised: 2024-01-15' },
      { value: 'b', label: 'Item B' },
    ]);

    const output = captured.join('');
    assert.ok(output.includes('(Banking · group-a · revised: 2024-01-15)'), 'hint text should appear in parentheses');
    assert.ok(output.includes('1) Item A'), 'should show numbered item label');
    assert.ok(output.includes('2) Item B'), 'should show second item without hint parens');
    assert.ok(!output.includes('Item B ('), 'items without hints should not show parentheses');
    assert.deepEqual(result, ['a']);
  });

  it('omits parentheses for options without hints', async () => {
    const fakeStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true, writable: true });

    const adapter = createPromptAdapter('plain');
    setImmediate(() => fakeStdin.write('1,2\n'));

    const result = await adapter.multiselect('Select:', [
      { value: 'x', label: 'No Hint Item' },
      { value: 'y', label: 'Also No Hint' },
    ]);

    const output = captured.join('');
    assert.ok(output.includes('1) No Hint Item'), 'should show first item');
    assert.ok(output.includes('2) Also No Hint'), 'should show second item');
    assert.ok(!output.includes('No Hint Item ('), 'first item should not have hint parentheses');
    assert.ok(!output.includes('Also No Hint ('), 'second item should not have hint parentheses');
    assert.deepEqual(result, ['x', 'y']);
  });

  it('displays hints for all options that have them in a mixed list', async () => {
    const fakeStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true, writable: true });

    const adapter = createPromptAdapter('plain');
    setImmediate(() => fakeStdin.write('2\n'));

    await adapter.multiselect('Pick:', [
      { value: 'a', label: 'First', hint: 'hint-one' },
      { value: 'b', label: 'Second' },
      { value: 'c', label: 'Third', hint: 'hint-three' },
    ]);

    const output = captured.join('');
    assert.ok(output.includes('First (hint-one)'), 'first option hint');
    assert.ok(output.includes('2) Second'), 'second option without hint');
    assert.ok(output.includes('Third (hint-three)'), 'third option hint');
  });
});
