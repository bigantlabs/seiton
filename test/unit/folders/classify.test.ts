import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyItem,
  builtinFolderForKeyword,
  type CustomRuleEntry,
} from '../../../src/lib/folders/classify.js';
import { BUILTIN_RULES } from '../../../src/lib/folders/builtins.js';

const ALL_CATEGORIES = BUILTIN_RULES.map((r) => r.folder);

describe('classifyItem (direct import from classify.ts)', () => {
  it('classifies a builtin keyword match in item name', () => {
    const result = classifyItem('GitHub', ['https://github.com'], [], ALL_CATEGORIES);
    assert.deepEqual(result, {
      folder: 'Development',
      matchedKeyword: 'github',
      ruleSource: 'builtin',
    });
  });

  it('classifies by URI when name does not match', () => {
    const result = classifyItem('My Login', ['https://netflix.com/browse'], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Entertainment');
    assert.equal(result?.matchedKeyword, 'netflix');
    assert.equal(result?.ruleSource, 'builtin');
  });

  it('returns null when nothing matches', () => {
    const result = classifyItem('Random Thing', ['https://unknown-site.xyz'], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('custom rules take precedence over builtins', () => {
    const customRules: CustomRuleEntry[] = [
      { folder: 'My Custom', keywords: ['github'] },
    ];
    const result = classifyItem('GitHub', ['https://github.com'], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'My Custom');
    assert.equal(result?.ruleSource, 'custom');
  });

  it('respects first-match-wins among custom rules', () => {
    const customRules: CustomRuleEntry[] = [
      { folder: 'First', keywords: ['example'] },
      { folder: 'Second', keywords: ['example'] },
    ];
    const result = classifyItem('example site', [], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'First');
  });

  it('skips disabled builtin categories', () => {
    const result = classifyItem('GitHub', ['https://github.com'], [], ['Email', 'Social']);
    assert.equal(result, null);
  });

  it('is case-insensitive for both name and URIs', () => {
    const result = classifyItem('GITHUB', ['HTTPS://GITHUB.COM'], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Development');
  });

  it('handles empty URIs array', () => {
    const result = classifyItem('Unknown Item', [], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('handles empty name and empty URIs', () => {
    const result = classifyItem('', [], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('matches keyword in URI when name has no match', () => {
    const customRules: CustomRuleEntry[] = [
      { folder: 'Crypto', keywords: ['binance'] },
    ];
    const result = classifyItem('My Account', ['https://binance.com/trade'], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'Crypto');
    assert.equal(result?.ruleSource, 'custom');
  });

  it('custom rule with empty keywords array matches nothing', () => {
    const customRules: CustomRuleEntry[] = [
      { folder: 'Empty', keywords: [] },
    ];
    const result = classifyItem('GitHub', ['https://github.com'], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'Development');
    assert.equal(result?.ruleSource, 'builtin');
  });

  it('matches word boundary: "bank" matches "My Bank" but not "Banksy"', () => {
    const resultBank = classifyItem('My Bank', [], [], ALL_CATEGORIES);
    assert.equal(resultBank?.folder, 'Banking & Finance');
    assert.equal(resultBank?.matchedKeyword, 'bank');

    const resultBanksy = classifyItem('Banksy Art', [], [], ALL_CATEGORIES);
    assert.equal(resultBanksy, null);
  });

  it('matches keyword at start of text', () => {
    const result = classifyItem('bank account', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
  });

  it('matches keyword at end of text', () => {
    const result = classifyItem('my bank', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
  });

  it('matches keyword surrounded by non-word characters', () => {
    const result = classifyItem('my-bank-login', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
  });

  it('does not match keyword embedded in a longer word', () => {
    const result = classifyItem('disbanking', [], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('matches multi-word builtin keywords like "wells fargo"', () => {
    const result = classifyItem('Wells Fargo Checking', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
    assert.equal(result?.matchedKeyword, 'wells fargo');
  });

  it('matches across multiple URIs', () => {
    const result = classifyItem(
      'Login',
      ['https://other.com', 'https://github.com/settings'],
      [],
      ALL_CATEGORIES,
    );
    assert.equal(result?.folder, 'Development');
  });

  it('enabled categories filter applies only to builtins, not custom', () => {
    const customRules: CustomRuleEntry[] = [
      { folder: 'Development', keywords: ['mydev'] },
    ];
    const result = classifyItem('mydev tool', [], customRules, ['Email']);
    assert.equal(result?.folder, 'Development');
    assert.equal(result?.ruleSource, 'custom');
  });
});

describe('builtinFolderForKeyword (direct import from classify.ts)', () => {
  it('maps "github" to Development', () => {
    assert.equal(builtinFolderForKeyword('github'), 'Development');
  });

  it('maps "netflix" to Entertainment', () => {
    assert.equal(builtinFolderForKeyword('netflix'), 'Entertainment');
  });

  it('is case-insensitive', () => {
    assert.equal(builtinFolderForKeyword('GitHub'), 'Development');
    assert.equal(builtinFolderForKeyword('NETFLIX'), 'Entertainment');
  });

  it('returns undefined for unknown keyword', () => {
    assert.equal(builtinFolderForKeyword('xyznonexistent'), undefined);
  });

  it('maps "paypal" to Banking & Finance', () => {
    assert.equal(builtinFolderForKeyword('paypal'), 'Banking & Finance');
  });

  it('maps "gmail" to Email', () => {
    assert.equal(builtinFolderForKeyword('gmail'), 'Email');
  });
});
