import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBatchReport } from '../../../src/ui/batch-report.js';
import type { Finding } from '../../../src/lib/domain/finding.js';
import type { BwItem } from '../../../src/lib/domain/types.js';
import type { PromptAdapter, SpinnerHandle } from '../../../src/ui/prompts.js';

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

function makeCapturingPrompt(): PromptAdapter & { steps: string[]; warnings: string[]; infos: string[] } {
  const steps: string[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const noopSpinner: SpinnerHandle = { message() {}, stop() {}, error() {} };
  return {
    steps, warnings, infos,
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>(): Promise<T | null> { return null; },
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
  it('does nothing when findings array is empty', () => {
    const prompt = makeCapturingPrompt();
    renderBatchReport([], prompt, '•');
    assert.equal(prompt.steps.length, 0);
    assert.equal(prompt.warnings.length, 0);
    assert.equal(prompt.infos.length, 0);
  });

  it('renders header and summary for weak findings', () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem(), score: 1, reasons: ['short'] },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.steps.some(m => m.includes('Informational')));
    assert.ok(prompt.warnings.some(m => m.includes('Weak Passwords (1)')));
    assert.ok(prompt.infos.some(m => m.includes('Score: 1/4')));
    assert.ok(prompt.infos.some(m => m.includes('1 informational')));
  });

  it('renders reuse findings with item count', () => {
    const items = [makeItem({ id: 'a', name: 'Item A' }), makeItem({ id: 'b', name: 'Item B' })];
    const findings: Finding[] = [
      { category: 'reuse', items, passwordHash: 'abc' },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Reused Passwords (1 group(s))')));
    assert.ok(prompt.infos.some(m => m.includes('2 items share the same password')));
  });

  it('renders missing-field findings', () => {
    const findings: Finding[] = [
      { category: 'missing', item: makeItem(), missingFields: ['password', 'uri'] },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Missing Fields (1)')));
    assert.ok(prompt.infos.some(m => m.includes('Missing: password, uri')));
  });

  it('groups multiple informational categories', () => {
    const findings: Finding[] = [
      { category: 'weak', item: makeItem({ id: '1' }), score: 1, reasons: ['short'] },
      { category: 'missing', item: makeItem({ id: '2' }), missingFields: ['password'] },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.warnings.some(m => m.includes('Weak Passwords')));
    assert.ok(prompt.warnings.some(m => m.includes('Missing Fields')));
    assert.ok(prompt.infos.some(m => m.includes('2 informational')));
  });

  it('masks passwords in weak findings output', () => {
    const item = makeItem();
    item.login!.password = 'secret123';
    const findings: Finding[] = [
      { category: 'weak', item, score: 1, reasons: ['short'] },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    const allOutput = prompt.infos.join('\n');
    assert.ok(!allOutput.includes('secret123'));
  });

  it('shows "(empty)" when weak finding has no password', () => {
    const item = makeItem({ login: { uris: null, username: 'user', password: null, totp: null } });
    const findings: Finding[] = [
      { category: 'weak', item, score: 0, reasons: ['no password'] },
    ];
    const prompt = makeCapturingPrompt();
    renderBatchReport(findings, prompt, '•');
    assert.ok(prompt.infos.some(m => m.includes('(empty)')));
  });
});
