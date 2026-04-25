import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMatchReason, extractRuleKeyword, offerRuleCapture } from '../../../src/ui/rule-capture.js';
import type { BwItem } from '../../../src/lib/domain/types.js';
import type { PromptAdapter } from '../../../src/ui/prompts.js';
import type { RuleSaveRequest } from '../../../src/ui/review-loop.js';
import { makeItem } from '../../helpers/make-item.js';

function makeFakePrompt(selectReturn: unknown): PromptAdapter {
  return {
    intro() {},
    outro() {},
    cancelled() {},
    async select<T>() { return selectReturn as T; },
    async confirm() { return false; },
    async multiselect() { return []; },
    async text() { return ''; },
    startSpinner() { return { message() {}, stop() {}, error() {} }; },
    logInfo() {},
    logSuccess() {},
    logWarning() {},
    logError() {},
    logStep() {},
  };
}

describe('formatMatchReason', () => {
  it('formats builtin rule source', () => {
    assert.equal(
      formatMatchReason({ matchedKeyword: 'github', ruleSource: 'builtin' }),
      'matched keyword: github',
    );
  });

  it('formats custom rule source', () => {
    assert.equal(
      formatMatchReason({ matchedKeyword: 'mysite', ruleSource: 'custom' }),
      'matched custom rule: mysite',
    );
  });
});

describe('extractRuleKeyword', () => {
  it('extracts hostname from URI', () => {
    const item = makeItem({ login: { uris: [{ match: null, uri: 'https://github.com/login' }], username: 'u', password: 'p', totp: null } });
    assert.equal(extractRuleKeyword(item), 'github.com');
  });

  it('strips www. prefix from hostname', () => {
    const item = makeItem({ login: { uris: [{ match: null, uri: 'https://www.example.com' }], username: 'u', password: 'p', totp: null } });
    assert.equal(extractRuleKeyword(item), 'example.com');
  });

  it('falls back to lowercase name when no URI', () => {
    const item = makeItem({ name: 'My PayPal', login: { uris: null, username: 'u', password: 'p', totp: null } });
    assert.equal(extractRuleKeyword(item), 'my paypal');
  });

  it('falls back to name for empty URIs array', () => {
    const item = makeItem({ name: 'SomeService', login: { uris: [], username: 'u', password: 'p', totp: null } });
    assert.equal(extractRuleKeyword(item), 'someservice');
  });

  it('falls back to name for invalid URI', () => {
    const item = makeItem({ name: 'Broken', login: { uris: [{ match: null, uri: 'not-a-url' }], username: 'u', password: 'p', totp: null } });
    assert.equal(extractRuleKeyword(item), 'broken');
  });

  it('falls back to name when login is null', () => {
    const item = makeItem({ name: 'NoLogin', login: null as unknown as BwItem['login'] });
    assert.equal(extractRuleKeyword(item), 'nologin');
  });
});

describe('offerRuleCapture', () => {
  it('returns saved and calls onRuleSave when user selects yes', async () => {
    const saved: RuleSaveRequest[] = [];
    const result = await offerRuleCapture(
      makeItem(),
      'Banking & Finance',
      makeFakePrompt('yes'),
      async (req) => { saved.push(req); },
    );
    assert.equal(result, 'saved');
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.folder, 'Banking & Finance');
    assert.equal(saved[0]!.keyword, 'example.com');
  });

  it('returns declined when user selects no', async () => {
    const saved: RuleSaveRequest[] = [];
    const result = await offerRuleCapture(
      makeItem(),
      'Banking & Finance',
      makeFakePrompt('no'),
      async (req) => { saved.push(req); },
    );
    assert.equal(result, 'declined');
    assert.equal(saved.length, 0);
  });

  it('returns suppressed when user selects never', async () => {
    const saved: RuleSaveRequest[] = [];
    const result = await offerRuleCapture(
      makeItem(),
      'Banking & Finance',
      makeFakePrompt('never'),
      async (req) => { saved.push(req); },
    );
    assert.equal(result, 'suppressed');
    assert.equal(saved.length, 0);
  });

  it('returns suppressed when prompt.select returns null (Ctrl+C)', async () => {
    const saved: RuleSaveRequest[] = [];
    const result = await offerRuleCapture(
      makeItem(),
      'Banking & Finance',
      makeFakePrompt(null),
      async (req) => { saved.push(req); },
    );
    assert.equal(result, 'suppressed');
    assert.equal(saved.length, 0);
  });
});
