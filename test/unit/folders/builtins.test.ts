import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_RULES,
  classifyItem,
  builtinFolderForKeyword,
} from '../../../src/lib/folders/builtins.js';

const ALL_CATEGORIES = BUILTIN_RULES.map((r) => r.folder);

describe('BUILTIN_RULES', () => {
  it('has rules for expected categories', () => {
    const folders = BUILTIN_RULES.map((r) => r.folder);
    assert.ok(folders.includes('Banking & Finance'));
    assert.ok(folders.includes('Email'));
    assert.ok(folders.includes('Social'));
    assert.ok(folders.includes('Shopping'));
    assert.ok(folders.includes('Development'));
    assert.ok(folders.includes('Entertainment'));
    assert.ok(folders.includes('Utilities'));
    assert.ok(folders.includes('Government & ID'));
    assert.ok(folders.includes('Health'));
  });

  it('every rule has at least one keyword', () => {
    for (const rule of BUILTIN_RULES) {
      assert.ok(rule.keywords.length > 0, `${rule.folder} has no keywords`);
    }
  });
});

describe('builtinFolderForKeyword', () => {
  it('maps "github" to Development', () => {
    assert.equal(builtinFolderForKeyword('github'), 'Development');
  });

  it('maps "netflix" to Entertainment', () => {
    assert.equal(builtinFolderForKeyword('netflix'), 'Entertainment');
  });

  it('maps "paypal" to Banking & Finance', () => {
    assert.equal(builtinFolderForKeyword('paypal'), 'Banking & Finance');
  });

  it('maps "gmail" to Email', () => {
    assert.equal(builtinFolderForKeyword('gmail'), 'Email');
  });

  it('is case-insensitive', () => {
    assert.equal(builtinFolderForKeyword('GitHub'), 'Development');
    assert.equal(builtinFolderForKeyword('NETFLIX'), 'Entertainment');
  });

  it('returns undefined for unknown keyword', () => {
    assert.equal(builtinFolderForKeyword('xyznonexistent'), undefined);
  });
});

describe('classifyItem', () => {
  it('classifies GitHub as Development with builtin match reason', () => {
    const result = classifyItem('GitHub', ['https://github.com'], [], ALL_CATEGORIES);
    assert.deepEqual(result, { folder: 'Development', matchedKeyword: 'github', ruleSource: 'builtin' });
  });

  it('classifies by URI content', () => {
    const result = classifyItem('My Login', ['https://netflix.com/browse'], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Entertainment');
    assert.equal(result?.matchedKeyword, 'netflix');
    assert.equal(result?.ruleSource, 'builtin');
  });

  it('classifies by name content', () => {
    const result = classifyItem('My PayPal Account', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
    assert.equal(result?.matchedKeyword, 'paypal');
  });

  it('returns null when no rule matches', () => {
    const result = classifyItem('Random Thing', ['https://unknown-site.xyz'], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('custom rules take precedence over builtins', () => {
    const customRules = [{ folder: 'My Custom', keywords: ['github'] }];
    const result = classifyItem('GitHub', ['https://github.com'], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'My Custom');
    assert.equal(result?.ruleSource, 'custom');
    assert.equal(result?.matchedKeyword, 'github');
  });

  it('respects first-match-wins for custom rules', () => {
    const customRules = [
      { folder: 'First Match', keywords: ['example'] },
      { folder: 'Second Match', keywords: ['example'] },
    ];
    const result = classifyItem('example site', [], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'First Match');
  });

  it('respects enabled categories', () => {
    const result = classifyItem('GitHub', ['https://github.com'], [], ['Email', 'Social']);
    assert.equal(result, null);
  });

  it('classification is case-insensitive', () => {
    const result = classifyItem('GITHUB', ['HTTPS://GITHUB.COM'], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Development');
  });

  it('matches partial keyword in name', () => {
    const result = classifyItem('My Bank of America', [], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Banking & Finance');
    assert.equal(result?.matchedKeyword, 'bank');
  });

  it('matches partial keyword in URI', () => {
    const result = classifyItem('Login', ['https://gmail.com/inbox'], [], ALL_CATEGORIES);
    assert.equal(result?.folder, 'Email');
  });

  it('handles empty URIs array', () => {
    const result = classifyItem('Unknown Item', [], [], ALL_CATEGORIES);
    assert.equal(result, null);
  });

  it('matches custom rule keyword in URI when name does not match', () => {
    const customRules = [{ folder: 'Crypto', keywords: ['binance'] }];
    const result = classifyItem('My Account', ['https://binance.com/trade'], customRules, ALL_CATEGORIES);
    assert.equal(result?.folder, 'Crypto');
    assert.equal(result?.ruleSource, 'custom');
    assert.equal(result?.matchedKeyword, 'binance');
  });
});
