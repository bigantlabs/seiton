import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { presentAllDuplicates, formatRevisionHint, formatItemHint } from '../../../src/ui/duplicate-review.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import type { DuplicateFinding } from '../../../src/lib/domain/finding.js';
import { makeItem } from '../../helpers/make-item.js';

interface MockConfig {
  multiselectResponses?: (number[] | null)[];
  confirmResponse?: boolean | null;
}

function makeMockPrompt(config: MockConfig = {}): PromptAdapter {
  let msIdx = 0;
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(): Promise<T | null> { return null; },
    async confirm(): Promise<boolean | null> {
      return config.confirmResponse ?? null;
    },
    async multiselect<T>(_msg: string, options: { value: T }[]): Promise<T[] | null> {
      const resps = config.multiselectResponses ?? [[]];
      const resp = resps[msIdx++];
      if (resp === undefined) return [];
      if (resp === null) return null;
      return resp.map(i => options[i]!.value);
    },
    async text(): Promise<string | null> { return ''; },
    startSpinner(): SpinnerHandle { return noopSpinner; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

describe('formatRevisionHint', () => {
  it('uses passwordRevisionDate when available', () => {
    const item = makeItem({ login: { uris: null, username: null, password: null, totp: null, passwordRevisionDate: '2024-06-15T12:00:00.000Z' } });
    assert.equal(formatRevisionHint(item), 'revised: 2024-06-15');
  });

  it('falls back to revisionDate when no passwordRevisionDate', () => {
    const item = makeItem({ revisionDate: '2024-01-15T00:00:00.000Z' });
    assert.equal(formatRevisionHint(item), 'revised: 2024-01-15');
  });

  it('returns unknown for invalid date', () => {
    const item = makeItem({ revisionDate: 'not-a-date', login: null });
    assert.equal(formatRevisionHint(item), 'revised: unknown');
  });
});

describe('formatItemHint', () => {
  it('includes folder name when folderId maps to a known folder', () => {
    const item = makeItem({ folderId: 'f1' });
    const folders = new Map([['f1', 'Banking']]);
    assert.ok(formatItemHint(item, 'group-a', folders).includes('Banking'));
  });

  it('shows "No folder" when folderId is null', () => {
    const item = makeItem({ folderId: null });
    assert.ok(formatItemHint(item, 'group-a', new Map()).includes('No folder'));
  });

  it('shows "Unknown folder" when folderId is not in map', () => {
    const item = makeItem({ folderId: 'missing' });
    assert.ok(formatItemHint(item, 'group-a', new Map()).includes('Unknown folder'));
  });

  it('includes group key and revision hint', () => {
    const item = makeItem({ revisionDate: '2024-03-10T00:00:00.000Z', folderId: null });
    const hint = formatItemHint(item, 'my-group', new Map());
    assert.ok(hint.includes('my-group'));
    assert.ok(hint.includes('revised: 2024-03-10'));
  });
});

describe('presentAllDuplicates', () => {
  it('returns empty ops for empty findings', async () => {
    const result = await presentAllDuplicates([], makeMockPrompt());
    assert.equal(result.ops.length, 0);
    assert.equal(result.skipped, false);
  });

  it('generates delete ops for checked items across multiple groups', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a1' }), makeItem({ id: 'a2' })], key: 'group-a' },
      { category: 'duplicates', items: [makeItem({ id: 'b1' }), makeItem({ id: 'b2' })], key: 'group-b' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponses: [[1, 3]] }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.ops[0]!.kind, 'delete_item');
    assert.equal(result.ops[1]!.kind, 'delete_item');
    if (result.ops[0]!.kind === 'delete_item') assert.equal(result.ops[0]!.itemId, 'a2');
    if (result.ops[1]!.kind === 'delete_item') assert.equal(result.ops[1]!.itemId, 'b2');
  });

  it('returns skipped when multiselect returns null', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponses: [null] }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.skipped, true);
  });

  it('returns no ops when nothing is checked', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponses: [[]] }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.skipped, false);
  });

  it('triggers safety confirm when all items in a group are checked', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 1]],
      confirmResponse: true,
    }));
    assert.equal(result.ops.length, 2);
    assert.equal(result.skipped, false);
  });

  it('loops back to multiselect when safety confirm is declined', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
      { category: 'duplicates', items: [makeItem({ id: 'c' }), makeItem({ id: 'd' })], key: 'k2' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 1, 3], [3]],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 1);
    if (result.ops[0]!.kind === 'delete_item') assert.equal(result.ops[0]!.itemId, 'd');
    assert.equal(result.skipped, false);
  });

  it('returns skipped when safety confirm returns null', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 1]],
      confirmResponse: null,
    }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.skipped, true);
  });

  it('does not trigger safety confirm when at least one item per group is kept', async () => {
    let confirmCalled = false;
    const prompt = makeMockPrompt({ multiselectResponses: [[1]] });
    prompt.confirm = async () => { confirmCalled = true; return true; };
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const result = await presentAllDuplicates(findings, prompt);
    assert.equal(confirmCalled, false);
    assert.equal(result.ops.length, 1);
  });

  it('produces one delete op when overlapping item is selected from multiple groups', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponses: [[0, 2]] }));
    const deleteIds = result.ops
      .filter((op): op is Extract<typeof op, { kind: 'delete_item' }> => op.kind === 'delete_item')
      .map(op => op.itemId);
    assert.equal(deleteIds.length, 1);
    assert.equal(deleteIds[0], 'shared');
    assert.equal(result.skipped, false);
  });

  it('loops back when declining safety for group with shared item', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 3], [3]],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 1);
    if (result.ops[0]!.kind === 'delete_item') assert.equal(result.ops[0]!.itemId, 'b2');
    assert.equal(result.skipped, false);
  });

  it('deletes all overlapping items when safety confirm is accepted across groups', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 1, 2, 3]],
      confirmResponse: true,
    }));
    const deleteIds = result.ops
      .filter((op): op is Extract<typeof op, { kind: 'delete_item' }> => op.kind === 'delete_item')
      .map(op => op.itemId);
    assert.deepEqual(new Set(deleteIds), new Set(['shared', 'a2', 'b2']));
    assert.equal(result.skipped, false);
  });

  it('handles declining safety confirm when both overlapping groups lose all items', async () => {
    const shared = makeItem({ id: 'shared' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, makeItem({ id: 'a2' })], key: 'groupA' },
      { category: 'duplicates', items: [shared, makeItem({ id: 'b2' })], key: 'groupB' },
    ];
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [[0, 1, 2, 3], []],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 0);
    assert.equal(result.skipped, false);
  });

  it('handles a large number of duplicate groups correctly', async () => {
    const groupCount = 50;
    const findings: DuplicateFinding[] = [];
    const selectedIndices: number[] = [];
    for (let g = 0; g < groupCount; g++) {
      findings.push({
        category: 'duplicates',
        items: [
          makeItem({ id: `g${g}-a` }),
          makeItem({ id: `g${g}-b` }),
          makeItem({ id: `g${g}-c` }),
        ],
        key: `group-${g}`,
      });
      selectedIndices.push(g * 3 + 2);
    }
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [selectedIndices],
    }));
    assert.equal(result.ops.length, groupCount);
    for (let g = 0; g < groupCount; g++) {
      const op = result.ops[g]!;
      assert.equal(op.kind, 'delete_item');
      if (op.kind === 'delete_item') assert.equal(op.itemId, `g${g}-c`);
    }
    assert.equal(result.skipped, false);
  });

  it('loops back and re-selects when many groups have all items selected and safety is declined', async () => {
    const groupCount = 20;
    const findings: DuplicateFinding[] = [];
    const firstSelection: number[] = [];
    const secondSelection: number[] = [];
    for (let g = 0; g < groupCount; g++) {
      findings.push({
        category: 'duplicates',
        items: [makeItem({ id: `g${g}-a` }), makeItem({ id: `g${g}-b` })],
        key: `group-${g}`,
      });
      if (g % 2 === 0) {
        firstSelection.push(g * 2, g * 2 + 1);
      } else {
        firstSelection.push(g * 2 + 1);
      }
      secondSelection.push(g * 2 + 1);
    }
    const result = await presentAllDuplicates(findings, makeMockPrompt({
      multiselectResponses: [firstSelection, secondSelection],
      confirmResponse: false,
    }));
    assert.equal(result.ops.length, 20);
    assert.equal(result.skipped, false);
  });

  it('flattens groups in order with correct hints including overlapping items', async () => {
    const shared = makeItem({ id: 'shared', folderId: 'f1', name: 'Shared Login',
      login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'alice', password: 'p', totp: null },
      revisionDate: '2024-03-01T00:00:00.000Z' });
    const a2 = makeItem({ id: 'a2', folderId: null, name: 'Bank A',
      login: { uris: [{ match: null, uri: 'https://bank-a.com' }], username: 'bob', password: 'p', totp: null },
      revisionDate: '2024-05-10T00:00:00.000Z' });
    const b2 = makeItem({ id: 'b2', folderId: 'f2', name: 'Bank B',
      login: { uris: [{ match: null, uri: 'https://bank-b.com' }], username: 'carol', password: 'p', totp: null },
      revisionDate: '2024-06-20T00:00:00.000Z' });

    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [shared, a2], key: 'groupA' },
      { category: 'duplicates', items: [shared, b2], key: 'groupB' },
    ];
    const folders = new Map([['f1', 'Banking'], ['f2', 'Shopping']]);

    let capturedOptions: { value: string; label: string; hint?: string }[] = [];
    const prompt = makeMockPrompt({ multiselectResponses: [[]] });
    const origMultiselect = prompt.multiselect.bind(prompt);
    prompt.multiselect = async <T>(_msg: string, options: { value: T; label: string; hint?: string }[]): Promise<T[] | null> => {
      capturedOptions = options as unknown as typeof capturedOptions;
      return origMultiselect(_msg, options) as Promise<T[] | null>;
    };

    await presentAllDuplicates(findings, prompt, folders);

    assert.equal(capturedOptions.length, 4, 'overlapping item appears once per group');
    assert.equal(capturedOptions[0]!.value, 'shared');
    assert.equal(capturedOptions[1]!.value, 'a2');
    assert.equal(capturedOptions[2]!.value, 'shared');
    assert.equal(capturedOptions[3]!.value, 'b2');

    assert.ok(capturedOptions[0]!.hint!.includes('groupA'), 'first occurrence has groupA key');
    assert.ok(capturedOptions[0]!.hint!.includes('Banking'), 'shared item shows folder from map');
    assert.ok(capturedOptions[0]!.hint!.includes('revised: 2024-03-01'), 'shared item shows revision');

    assert.ok(capturedOptions[1]!.hint!.includes('groupA'), 'a2 has groupA key');
    assert.ok(capturedOptions[1]!.hint!.includes('No folder'), 'a2 with null folderId shows No folder');

    assert.ok(capturedOptions[2]!.hint!.includes('groupB'), 'second occurrence has groupB key');
    assert.ok(capturedOptions[2]!.hint!.includes('Banking'), 'shared in groupB still shows Banking folder');

    assert.ok(capturedOptions[3]!.hint!.includes('groupB'), 'b2 has groupB key');
    assert.ok(capturedOptions[3]!.hint!.includes('Shopping'), 'b2 shows Shopping folder');
    assert.ok(capturedOptions[3]!.hint!.includes('revised: 2024-06-20'), 'b2 shows its revision date');
  });

  it('flattens options with correct labels from itemLabel', async () => {
    const item1 = makeItem({ id: 'x', name: 'My Login',
      login: { uris: [{ match: null, uri: 'https://site.com' }], username: 'user1', password: 'p', totp: null } });
    const item2 = makeItem({ id: 'y', name: 'Other',
      login: { uris: null, username: null, password: null, totp: null } });

    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [item1, item2], key: 'g1' },
    ];

    let capturedOptions: { value: string; label: string; hint?: string }[] = [];
    const prompt = makeMockPrompt({ multiselectResponses: [[]] });
    const origMultiselect = prompt.multiselect.bind(prompt);
    prompt.multiselect = async <T>(_msg: string, options: { value: T; label: string; hint?: string }[]): Promise<T[] | null> => {
      capturedOptions = options as unknown as typeof capturedOptions;
      return origMultiselect(_msg, options) as Promise<T[] | null>;
    };

    await presentAllDuplicates(findings, prompt);

    assert.equal(capturedOptions.length, 2);
    assert.equal(capturedOptions[0]!.label, 'My Login (https://site.com) [user1]');
    assert.equal(capturedOptions[1]!.label, 'Other');
  });

  it('uses "Unknown folder" hint when folderId not in map', async () => {
    const item = makeItem({ id: 'z', folderId: 'missing-id' });
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [item, makeItem({ id: 'z2' })], key: 'g1' },
    ];
    const folders = new Map<string, string>();

    let capturedOptions: { value: string; label: string; hint?: string }[] = [];
    const prompt = makeMockPrompt({ multiselectResponses: [[]] });
    const origMultiselect = prompt.multiselect.bind(prompt);
    prompt.multiselect = async <T>(_msg: string, options: { value: T; label: string; hint?: string }[]): Promise<T[] | null> => {
      capturedOptions = options as unknown as typeof capturedOptions;
      return origMultiselect(_msg, options) as Promise<T[] | null>;
    };

    await presentAllDuplicates(findings, prompt, folders);

    assert.ok(capturedOptions[0]!.hint!.includes('Unknown folder'), 'unmapped folderId shows Unknown folder');
  });

  it('passes folder names to item hints when provided', async () => {
    const findings: DuplicateFinding[] = [
      { category: 'duplicates', items: [makeItem({ id: 'a', folderId: 'f1' }), makeItem({ id: 'b' })], key: 'k1' },
    ];
    const folders = new Map([['f1', 'Banking']]);
    const result = await presentAllDuplicates(findings, makeMockPrompt({ multiselectResponses: [[1]] }), folders);
    assert.equal(result.ops.length, 1);
    assert.equal(result.skipped, false);
  });
});
