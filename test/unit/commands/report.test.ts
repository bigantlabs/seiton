import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFindingsText, formatFindingsJson } from '../../../src/commands/report.js';
import type { WeakFinding, MissingFinding, FolderFinding } from '../../../src/lib/domain/finding.js';

function makeFakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    name: 'Test Item',
    type: 1 as const,
    organizationId: null,
    folderId: null,
    notes: null,
    favorite: false,
    login: {
      uris: [{ match: null, uri: 'https://example.com' }],
      username: 'user@example.com',
      password: 'secret123',
      totp: null,
    },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatFindingsText', () => {
  it('returns clean message for empty findings', () => {
    const output = formatFindingsText([]);
    assert.ok(output.includes('No findings'));
  });

  it('formats weak findings', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeFakeItem(),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('[weak]'));
    assert.ok(output.includes('Test Item'));
    assert.ok(output.includes('too short'));
  });

  it('formats missing findings', () => {
    const finding: MissingFinding = {
      category: 'missing',
      item: makeFakeItem(),
      missingFields: ['password'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('[missing]'));
    assert.ok(output.includes('password'));
  });

  it('formats folder findings', () => {
    const finding: FolderFinding = {
      category: 'folders',
      item: makeFakeItem(),
      suggestedFolder: 'Banking & Finance',
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('[folders]'));
    assert.ok(output.includes('Banking & Finance'));
  });
});

describe('formatFindingsJson', () => {
  it('returns valid JSON with version and summary', () => {
    const output = formatFindingsJson([], '•', 10, 3);
    const parsed = JSON.parse(output) as { version: number; summary: { totalItems: number } };
    assert.equal(parsed.version, 1);
    assert.equal(parsed.summary.totalItems, 10);
  });

  it('redacts passwords in JSON output', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeFakeItem(),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsJson([finding], '•', 1, 0);
    assert.ok(!output.includes('secret123'));
    assert.ok(output.includes('•'));
  });
});
