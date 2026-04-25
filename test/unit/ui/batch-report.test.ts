import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBatchReport } from '../../../src/ui/batch-report.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';
import { makeItem } from '../../helpers/make-item.js';

function makeCapturingPrompt(
  selectResponses: (string | null)[] = [],
): PromptAdapter & { steps: string[]; warnings: string[]; infos: string[]; selectCallOptions: Array<Array<{ value: unknown; label: string; hint?: string }>> } {
  const steps: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const selectCallOptions: Array<Array<{ value: unknown; label: string; hint?: string }>> = [];
  let selectIdx = 0;
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    steps, warnings, infos, selectCallOptions,
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(_msg: string, options: { value: T; label: string; hint?: string }[]): Promise<T | null> {
      selectCallOptions.push([...options]);
      const resp = selectResponses[selectIdx++];
      if (resp === null || resp === undefined) return null;
      const opt = options.find(o => String(o.value) === resp);
      return opt?.value ?? null;
    },
    async confirm(): Promise<boolean | null> { return null; },
    async multiselect<T>(): Promise<T[] | null> { return []; },
    async text(): Promise<string | null> { return ''; },
    startSpinner(): SpinnerHandle { return noopSpinner; },
    logInfo(msg: string) { infos.push(msg); },
    logSuccess() {},
    logWarning(msg: string) { warnings.push(msg); },
    logError() {},
    logStep(msg: string) { steps.push(msg); },
  };
}

describe('renderBatchReport', () => {
  it('does nothing when findings array is empty', async () => {
    const prompt = makeCapturingPrompt();
    await renderBatchReport([], prompt, '•');
    assert.equal(prompt.steps.length, 0);
    assert.equal(prompt.warnings.length, 0);
    assert.equal(prompt.infos.length, 0);
  });

  it('renders single category directly without select', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const prompt = makeCapturingPrompt();
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.steps.some(m => m.includes('Informational')));
    assert.ok(prompt.warnings.some(m => m.includes('Weak Passwords (1)')));
    assert.ok(prompt.infos.some(m => m.includes('Score: 1/4')));
    assert.ok(prompt.infos.some(m => m.includes('1 informational')));
  });

  it('renders reuse findings with item count', async () => {
    const items = [makeItem({ id: 'a', name: 'Item A' }), makeItem({ id: 'b', name: 'Item B' })];
    const findings: Finding[] = [
      { category: 'reuse', items, passwordHash: 'abc' },
    ];
    const prompt = makeCapturingPrompt();
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Reused Passwords (1 group(s))')));
    assert.ok(prompt.infos.some(m => m.includes('2 items share the same password')));
  });

  it('renders missing-field findings', async () => {
    const findings: Finding[] = [
      { category: 'missing', item: makeItem(), missingFields: ['password', 'uri'] },
    ];
    const prompt = makeCapturingPrompt();
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Missing Fields (1)')));
    assert.ok(prompt.infos.some(m => m.includes('Missing: password, uri')));
  });

  it('shows select for multiple categories and renders chosen ones', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem({ id: '2' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt(['weak', 'missing', 'done']);
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Weak Passwords')));
    assert.ok(prompt.warnings.some(m => m.includes('Missing Fields')));
    assert.ok(prompt.infos.some(m => m.includes('2 informational')));
  });

  it('exits category browser on Continue selection', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem({ id: '2' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt(['done']);
    await renderBatchReport(findings, prompt, '•');
    assert.equal(prompt.warnings.length, 0);
    assert.ok(prompt.infos.some(m => m.includes('2 informational')));
  });

  it('exits category browser on cancel (escape)', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem({ id: '2' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt([null]);
    await renderBatchReport(findings, prompt, '•');
    assert.equal(prompt.warnings.length, 0);
    assert.ok(prompt.infos.some(m => m.includes('2 informational')));
  });

  it('masks passwords in weak findings output', async () => {
    const item = makeItem({
      login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'secret123', totp: null },
    });
    const findings: Finding[] = [
      { category: 'weak', item, score: 1, reasons: ['short'] },
    ];
    const prompt = makeCapturingPrompt();
    await renderBatchReport(findings, prompt, '•');
    const allOutput = prompt.infos.join('\n');
    assert.ok(!allOutput.includes('secret123'));
  });

  it('shows "(empty)" when weak finding has no password', async () => {
    const item = makeItem({ login: { uris: null, username: 'user', password: null, totp: null } });
    const findings: Finding[] = [
      { category: 'weak', item, score: 0, reasons: ['no password'] },
    ];
    const prompt = makeCapturingPrompt();
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.infos.some(m => m.includes('(empty)')));
  });

  it('shows header with correct count and category pluralization', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'weak', item: makeItem({ id: '2' }), score: 0, reasons: ['no chars'] },
      { category: 'missing', item: makeItem({ id: '3' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt([null]);
    await renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.steps.some(m => m.includes('3 across 2 categories')));
  });

  it('shows "viewed" hint on previously-viewed categories when select re-renders', async () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem({ id: '2' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt(['weak', 'missing', 'done']);
    await renderBatchReport(findings, prompt, '•');

    // First select call (before viewing any category)
    assert.equal(prompt.selectCallOptions.length, 3);
    const firstSelectOptions = prompt.selectCallOptions[0]!;
    const weakOptionInFirstSelect = firstSelectOptions.find(o => o.value === 'weak');
    const missingOptionInFirstSelect = firstSelectOptions.find(o => o.value === 'missing');
    assert.equal(weakOptionInFirstSelect?.hint, undefined, 'weak category should not have hint on first select');
    assert.equal(missingOptionInFirstSelect?.hint, undefined, 'missing category should not have hint on first select');

    // Second select call (after viewing weak category)
    const secondSelectOptions = prompt.selectCallOptions[1]!;
    const weakOptionInSecondSelect = secondSelectOptions.find(o => o.value === 'weak');
    const missingOptionInSecondSelect = secondSelectOptions.find(o => o.value === 'missing');
    assert.equal(weakOptionInSecondSelect?.hint, 'viewed', 'weak category should have "viewed" hint after being selected');
    assert.equal(missingOptionInSecondSelect?.hint, undefined, 'missing category should not have hint yet');

    // Third select call (after viewing both weak and missing)
    const thirdSelectOptions = prompt.selectCallOptions[2]!;
    const weakOptionInThirdSelect = thirdSelectOptions.find(o => o.value === 'weak');
    const missingOptionInThirdSelect = thirdSelectOptions.find(o => o.value === 'missing');
    assert.equal(weakOptionInThirdSelect?.hint, 'viewed', 'weak category should still have "viewed" hint');
    assert.equal(missingOptionInThirdSelect?.hint, 'viewed', 'missing category should now have "viewed" hint');
  });
});
