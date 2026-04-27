import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFindingsText, formatFindingsJson } from '../../../src/commands/report.js';
import type { WeakFinding, MissingFinding, FolderFinding, DuplicateFinding, ReuseFinding, NearDuplicateFinding } from '../../../src/lib/domain/finding.js';
import { makeItem } from '../../helpers/make-item.js';

describe('formatFindingsText', () => {
  it('returns clean message for empty findings', () => {
    const output = formatFindingsText([]);
    assert.ok(output.includes('No findings'));
  });

  it('formats weak findings grouped under category header', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeItem(),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Weak Passwords (1)'));
    assert.ok(output.includes('Test Item'));
    assert.ok(output.includes('too short'));
  });

  it('formats missing findings grouped under category header', () => {
    const finding: MissingFinding = {
      category: 'missing',
      item: makeItem(),
      missingFields: ['password'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Missing Fields (1)'));
    assert.ok(output.includes('password'));
  });

  it('formats folder findings grouped under category header', () => {
    const finding: FolderFinding = {
      category: 'folders',
      item: makeItem(),
      suggestedFolder: 'Banking & Finance',
      existingFolderId: null,
      matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' },
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Folder Suggestions (1)'));
    assert.ok(output.includes('Banking & Finance'));
  });

  it('formats duplicate findings grouped under category header', () => {
    const finding: DuplicateFinding = {
      category: 'duplicates',
      items: [
        makeItem({ id: 'dup-1', name: 'Email A' }),
        makeItem({ id: 'dup-2', name: 'Email B' }),
      ],
      key: 'user@example.com:https://example.com',
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Duplicates (1)'));
    assert.ok(output.includes('2 items share key'));
    assert.ok(output.includes('Email A'));
    assert.ok(output.includes('Email B'));
  });

  it('formats reuse findings grouped under category header', () => {
    const finding: ReuseFinding = {
      category: 'reuse',
      items: [
        makeItem({ id: 'reuse-1', name: 'Gmail' }),
        makeItem({ id: 'reuse-2', name: 'GitHub' }),
        makeItem({ id: 'reuse-3', name: 'Twitter' }),
      ],
      passwordHash: 'abc123def456',
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Reused Passwords (1)'));
    assert.ok(output.includes('3 items share the same password'));
    assert.ok(output.includes('Gmail'));
    assert.ok(output.includes('GitHub'));
    assert.ok(output.includes('Twitter'));
  });

  it('formats near_duplicates findings grouped under category header', () => {
    const finding: NearDuplicateFinding = {
      category: 'near_duplicates',
      items: [
        makeItem({ id: 'nd-1', name: 'Amazon Login' }),
        makeItem({ id: 'nd-2', name: 'Amazon Logins' }),
      ],
      maxDistance: 1,
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Near-Duplicate Names (1)'));
    assert.ok(output.includes('distance 1'));
    assert.ok(output.includes('Amazon Login'));
    assert.ok(output.includes('Amazon Logins'));
  });

  it('orders categories consistently in grouped output', () => {
    const findings = [
      {
        category: 'missing' as const,
        item: makeItem({ id: 'missing-1' }),
        missingFields: ['password'],
      },
      {
        category: 'duplicates' as const,
        items: [makeItem({ id: 'dup-1' }), makeItem({ id: 'dup-2' })],
        key: 'test@example.com:https://test.com',
      },
      {
        category: 'weak' as const,
        item: makeItem({ id: 'weak-1' }),
        score: 1,
        reasons: ['too short'],
      },
      {
        category: 'reuse' as const,
        items: [makeItem({ id: 'reuse-1' }), makeItem({ id: 'reuse-2' })],
        passwordHash: 'hash123',
      },
    ];
    const output = formatFindingsText(findings);
    const duplicatesIndex = output.indexOf('Duplicates');
    const reuseIndex = output.indexOf('Reused Passwords');
    const weakIndex = output.indexOf('Weak Passwords');
    const missingIndex = output.indexOf('Missing Fields');
    assert.ok(duplicatesIndex < reuseIndex, 'duplicates should come before reuse');
    assert.ok(reuseIndex < weakIndex, 'reuse should come before weak');
    assert.ok(weakIndex < missingIndex, 'weak should come before missing');
  });

  it('includes near_duplicates in category ordering after folders', () => {
    const findings = [
      {
        category: 'near_duplicates' as const,
        items: [makeItem({ id: 'nd-1', name: 'A' }), makeItem({ id: 'nd-2', name: 'B' })],
        maxDistance: 2,
      },
      {
        category: 'folders' as const,
        item: makeItem({ id: 'f-1' }),
        suggestedFolder: 'Banking',
        existingFolderId: null,
        matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' as const },
      },
    ];
    const output = formatFindingsText(findings);
    const foldersIndex = output.indexOf('Folder Suggestions');
    const nearDupIndex = output.indexOf('Near-Duplicate Names');
    assert.ok(foldersIndex >= 0, 'Folder Suggestions should be present');
    assert.ok(nearDupIndex >= 0, 'Near-Duplicate Names should be present');
    assert.ok(foldersIndex < nearDupIndex, 'folders should come before near_duplicates');
  });
});

describe('formatFindingsJson', () => {
  it('returns valid JSON with version and summary', () => {
    const output = formatFindingsJson([], '•', 10, 3);
    const parsed = JSON.parse(output) as { version: number; summary: { totalItems: number } };
    assert.equal(parsed.version, 1);
    assert.equal(parsed.summary.totalItems, 10);
  });

  it('formats near_duplicates findings with items and maxDistance in JSON', () => {
    const finding: NearDuplicateFinding = {
      category: 'near_duplicates',
      items: [
        makeItem({ id: 'nd-1', name: 'Amazon Login', login: { uris: [{ match: null, uri: 'https://amazon.com' }], username: 'user', password: 'secret', totp: null } }),
        makeItem({ id: 'nd-2', name: 'Amazon Logins', login: { uris: [{ match: null, uri: 'https://amazon.com' }], username: 'user', password: 'secret2', totp: null } }),
      ],
      maxDistance: 1,
    };
    const output = formatFindingsJson([finding], '•', 5, 2);
    const parsed = JSON.parse(output) as { findings: { category: string; items: { id: string; name: string; login: { password: string } }[]; maxDistance: number }[] };
    assert.equal(parsed.findings.length, 1);
    const f = parsed.findings[0]!;
    assert.equal(f.category, 'near_duplicates');
    assert.equal(f.maxDistance, 1);
    assert.equal(f.items.length, 2);
    assert.equal(f.items[0]!.id, 'nd-1');
    assert.equal(f.items[1]!.id, 'nd-2');
    assert.ok(!output.includes('secret'));
    assert.ok(f.items[0]!.login.password.includes('•'));
  });

  it('redacts passwords in JSON output', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeItem({ login: { uris: [{ match: null, uri: 'https://example.com' }], username: 'user', password: 'secret123', totp: null } }),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsJson([finding], '•', 1, 0);
    assert.ok(!output.includes('secret123'));
    assert.ok(output.includes('•'));
  });
});
