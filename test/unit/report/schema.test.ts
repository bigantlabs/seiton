import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReportSchema, REPORT_SCHEMA_VERSION } from '../../../src/report/schema.js';

function makeRedactedItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'item-001',
    name: 'Example Login',
    type: 1,
    folderId: null,
    login: {
      username: 'user@example.com',
      uris: ['https://example.com'],
      password: '••••••••',
      totp: '',
    },
    revisionDate: '2024-01-15T10:30:00.000Z',
    ...overrides,
  };
}

function makeValidReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: REPORT_SCHEMA_VERSION,
    summary: {
      totalItems: 10,
      totalFolders: 3,
      totalFindings: 0,
    },
    findings: [],
    ...overrides,
  };
}

describe('ReportSchema: valid reports', () => {
  it('accepts a minimal valid report with no findings', () => {
    const report = makeValidReport();
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a duplicate finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'duplicates',
        key: 'example.com|user@example.com',
        items: [makeRedactedItem(), makeRedactedItem({ id: 'item-002', name: 'Dupe Login' })],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a reuse finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'reuse',
        items: [makeRedactedItem(), makeRedactedItem({ id: 'item-002' })],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a weak finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item: makeRedactedItem(),
        score: 1,
        reasons: ['too short', 'no digits'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a missing finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'missing',
        item: makeRedactedItem(),
        missingFields: ['password', 'username'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a folders finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'folders',
        item: makeRedactedItem(),
        suggestedFolder: 'Banking & Finance',
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with a near_duplicates finding', () => {
    const report = makeValidReport({
      summary: { totalItems: 5, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'near_duplicates',
        items: [makeRedactedItem(), makeRedactedItem({ id: 'item-002', name: 'Exampl Login' })],
        maxDistance: 2,
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts a report with all finding types', () => {
    const report = makeValidReport({
      summary: { totalItems: 20, totalFolders: 5, totalFindings: 6 },
      findings: [
        { category: 'duplicates', key: 'k1', items: [makeRedactedItem(), makeRedactedItem({ id: 'i2' })] },
        { category: 'reuse', items: [makeRedactedItem(), makeRedactedItem({ id: 'i3' })] },
        { category: 'weak', item: makeRedactedItem(), score: 0, reasons: ['trivial'] },
        { category: 'missing', item: makeRedactedItem(), missingFields: ['username'] },
        { category: 'folders', item: makeRedactedItem(), suggestedFolder: 'Email' },
        { category: 'near_duplicates', items: [makeRedactedItem(), makeRedactedItem({ id: 'i4' })], maxDistance: 1 },
      ],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts item with null login', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'missing',
        item: makeRedactedItem({ login: null }),
        missingFields: ['login'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts item with null folderId', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item: makeRedactedItem({ folderId: null }),
        score: 2,
        reasons: ['common pattern'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });

  it('accepts item with string folderId', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 1, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item: makeRedactedItem({ folderId: 'folder-abc' }),
        score: 2,
        reasons: ['common pattern'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });
});

describe('ReportSchema: formatFindingsJson output shape', () => {
  it('accepts a report shaped like formatFindingsJson output', () => {
    const report = {
      version: 1,
      summary: {
        totalItems: 3,
        totalFolders: 1,
        totalFindings: 2,
      },
      findings: [
        {
          category: 'duplicates',
          key: 'example.com|alice',
          items: [
            {
              id: 'a1b2c3',
              name: 'Example (old)',
              type: 1,
              folderId: null,
              login: {
                username: 'alice',
                uris: ['https://example.com/login'],
                password: '••••••••',
                totp: '',
              },
              revisionDate: '2023-06-01T00:00:00.000Z',
            },
            {
              id: 'd4e5f6',
              name: 'Example (new)',
              type: 1,
              folderId: 'folder-1',
              login: {
                username: 'alice',
                uris: ['https://example.com'],
                password: '••••••••',
                totp: '[REDACTED]',
              },
              revisionDate: '2024-01-15T10:30:00.000Z',
            },
          ],
        },
        {
          category: 'weak',
          item: {
            id: 'g7h8i9',
            name: 'Weak Site',
            type: 1,
            folderId: null,
            login: {
              username: 'bob',
              uris: ['https://weak.example.com'],
              password: '••••••••',
              totp: '',
            },
            revisionDate: '2024-02-20T15:00:00.000Z',
          },
          score: 1,
          reasons: ['too short', 'no special characters'],
        },
      ],
    };
    const result = ReportSchema.safeParse(report);
    assert.ok(result.success, `Expected valid: ${JSON.stringify(result)}`);
  });
});

describe('ReportSchema: rejection cases', () => {
  it('rejects report with wrong version', () => {
    const report = makeValidReport({ version: 2 });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects report with version 0', () => {
    const report = makeValidReport({ version: 0 });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects report with string version', () => {
    const report = makeValidReport({ version: '1' });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects report missing version', () => {
    const report = makeValidReport();
    delete (report as Record<string, unknown>)['version'];
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects report missing summary', () => {
    const report = makeValidReport();
    delete (report as Record<string, unknown>)['summary'];
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects report missing findings', () => {
    const report = makeValidReport();
    delete (report as Record<string, unknown>)['findings'];
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects summary with negative totalItems', () => {
    const report = makeValidReport({
      summary: { totalItems: -1, totalFolders: 0, totalFindings: 0 },
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects summary with non-integer totalItems', () => {
    const report = makeValidReport({
      summary: { totalItems: 1.5, totalFolders: 0, totalFindings: 0 },
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects summary missing totalFolders', () => {
    const report = makeValidReport({
      summary: { totalItems: 10, totalFindings: 0 },
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects finding with unknown category', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'unknown_type',
        item: makeRedactedItem(),
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects weak finding without score', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item: makeRedactedItem(),
        reasons: ['too short'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects weak finding without reasons', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item: makeRedactedItem(),
        score: 1,
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects duplicates finding without key', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'duplicates',
        items: [makeRedactedItem()],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects folders finding without suggestedFolder', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'folders',
        item: makeRedactedItem(),
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects near_duplicates finding without maxDistance', () => {
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'near_duplicates',
        items: [makeRedactedItem()],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects item missing id', () => {
    const item = makeRedactedItem();
    delete (item as Record<string, unknown>)['id'];
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item,
        score: 1,
        reasons: ['bad'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects item missing revisionDate', () => {
    const item = makeRedactedItem();
    delete (item as Record<string, unknown>)['revisionDate'];
    const report = makeValidReport({
      summary: { totalItems: 1, totalFolders: 0, totalFindings: 1 },
      findings: [{
        category: 'weak',
        item,
        score: 1,
        reasons: ['bad'],
      }],
    });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects non-array findings', () => {
    const report = makeValidReport({ findings: 'not-an-array' });
    const result = ReportSchema.safeParse(report);
    assert.equal(result.success, false);
  });

  it('rejects null report', () => {
    const result = ReportSchema.safeParse(null);
    assert.equal(result.success, false);
  });

  it('rejects completely empty object', () => {
    const result = ReportSchema.safeParse({});
    assert.equal(result.success, false);
  });
});

describe('ReportSchema: version constant', () => {
  it('REPORT_SCHEMA_VERSION is 1', () => {
    assert.equal(REPORT_SCHEMA_VERSION, 1);
  });
});
