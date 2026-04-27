import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BwItemSchema,
  BwLoginUriSchema,
  BwFolderSchema,
  ItemType,
  BwErrorCode,
  makeBwError,
} from '../../../src/lib/domain/types.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../fixtures/bw');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

describe('BwItemSchema', () => {
  it('parses all items from the fixture file', () => {
    const raw = loadFixture('items.json') as unknown[];
    const result = BwItemSchema.array().safeParse(raw);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.length, 8);
    }
  });

  it('preserves unknown fields via passthrough', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const extraItem = raw.find((i) => i['id'] === 'oooo-7890-pppp-1234');
    assert.ok(extraItem);

    const result = BwItemSchema.safeParse(extraItem);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(
        (result.data as Record<string, unknown>)['customFieldFromBw'],
        'extra-data-preserved',
      );
    }
  });

  it('parses item with null URIs', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const item = raw.find((i) => i['id'] === 'eeee-5555-ffff-6666');
    assert.ok(item);

    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.login?.uris, null);
    }
  });

  it('parses item with null username', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const item = raw.find((i) => i['id'] === 'gggg-7777-hhhh-8888');
    assert.ok(item);

    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.login?.username, null);
    }
  });

  it('parses item with null password', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const item = raw.find((i) => i['id'] === 'iiii-9999-jjjj-0000');
    assert.ok(item);

    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.login?.password, null);
    }
  });

  it('parses secure note with null login', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const item = raw.find((i) => i['id'] === 'kkkk-1234-llll-5678');
    assert.ok(item);

    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.type, ItemType.SECURE_NOTE);
      assert.equal(result.data.login, null);
    }
  });

  it('rejects item missing required id field', () => {
    const result = BwItemSchema.safeParse({
      organizationId: null,
      folderId: null,
      type: 1,
      name: 'Missing ID',
      notes: null,
      favorite: false,
      revisionDate: '2024-01-01T00:00:00.000Z',
    });
    assert.equal(result.success, false);
  });

  it('rejects item missing required name field', () => {
    const result = BwItemSchema.safeParse({
      id: 'test-id',
      organizationId: null,
      folderId: null,
      type: 1,
      notes: null,
      favorite: false,
      revisionDate: '2024-01-01T00:00:00.000Z',
    });
    assert.equal(result.success, false);
  });

  it('parses item with empty URI array', () => {
    const raw = loadFixture('items.json') as Record<string, unknown>[];
    const item = raw.find((i) => i['id'] === 'mmmm-9012-nnnn-3456');
    assert.ok(item);

    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.login?.uris, []);
    }
  });
});

describe('BwLoginUriSchema', () => {
  it('parses URI object with match field present', () => {
    const result = BwLoginUriSchema.safeParse({ match: 0, uri: 'https://example.com' });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.match, 0);
      assert.equal(result.data.uri, 'https://example.com');
    }
  });

  it('parses URI object with match field null', () => {
    const result = BwLoginUriSchema.safeParse({ match: null, uri: 'https://example.com' });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.match, null);
    }
  });

  it('parses URI object without match field (optional)', () => {
    const result = BwLoginUriSchema.safeParse({ uri: 'https://example.com' });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.match, undefined);
      assert.equal(result.data.uri, 'https://example.com');
    }
  });

  it('parses full item containing a login URI without match field', () => {
    const item = {
      id: 'test-no-match',
      organizationId: null,
      folderId: null,
      type: 1,
      name: 'No Match Field Login',
      notes: null,
      favorite: false,
      revisionDate: '2024-06-01T00:00:00.000Z',
      login: {
        uris: [{ uri: 'https://nomatch.example.com' }],
        username: 'user@example.com',
        password: 'secret',
        totp: null,
        passwordRevisionDate: null,
      },
    };
    const result = BwItemSchema.safeParse(item);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.login?.uris?.[0]?.match, undefined);
      assert.equal(result.data.login?.uris?.[0]?.uri, 'https://nomatch.example.com');
    }
  });

  it('rejects URI object with invalid match type', () => {
    const result = BwLoginUriSchema.safeParse({ match: 'bad', uri: 'https://example.com' });
    assert.equal(result.success, false);
  });

  it('preserves unknown fields via passthrough', () => {
    const result = BwLoginUriSchema.safeParse({ uri: 'https://example.com', extraField: 42 });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal((result.data as Record<string, unknown>)['extraField'], 42);
    }
  });
});

describe('BwFolderSchema', () => {
  it('parses all folders from fixture file', () => {
    const raw = loadFixture('folders.json');
    const result = BwFolderSchema.array().safeParse(raw);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.length, 3);
    }
  });

  it('preserves unknown fields via passthrough', () => {
    const result = BwFolderSchema.safeParse({
      id: 'fold-test',
      name: 'Test',
      extraField: 'preserved',
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(
        (result.data as Record<string, unknown>)['extraField'],
        'preserved',
      );
    }
  });

  it('rejects folder missing id', () => {
    const result = BwFolderSchema.safeParse({ name: 'Missing ID' });
    assert.equal(result.success, false);
  });

  it('rejects folder missing name', () => {
    const result = BwFolderSchema.safeParse({ id: 'fold-test' });
    assert.equal(result.success, false);
  });
});

describe('ItemType', () => {
  it('has correct numeric values', () => {
    assert.equal(ItemType.LOGIN, 1);
    assert.equal(ItemType.SECURE_NOTE, 2);
    assert.equal(ItemType.CARD, 3);
    assert.equal(ItemType.IDENTITY, 4);
  });
});

describe('BwError', () => {
  it('has all expected error codes', () => {
    assert.equal(BwErrorCode.SPAWN_FAILED, 'SPAWN_FAILED');
    assert.equal(BwErrorCode.INVALID_JSON, 'INVALID_JSON');
    assert.equal(BwErrorCode.SCHEMA_MISMATCH, 'SCHEMA_MISMATCH');
    assert.equal(BwErrorCode.VAULT_LOCKED, 'VAULT_LOCKED');
    assert.equal(BwErrorCode.SESSION_MISSING, 'SESSION_MISSING');
    assert.equal(BwErrorCode.NOT_FOUND, 'NOT_FOUND');
    assert.equal(BwErrorCode.UNKNOWN, 'UNKNOWN');
  });

  it('constructs with makeBwError', () => {
    const err = makeBwError(BwErrorCode.VAULT_LOCKED, 'vault is locked', 1, 'stderr output');
    assert.equal(err.code, 'VAULT_LOCKED');
    assert.equal(err.message, 'vault is locked');
    assert.equal(err.exitCode, 1);
    assert.equal(err.stderr, 'stderr output');
  });

  it('allows discrimination by code field', () => {
    const err = makeBwError(BwErrorCode.SPAWN_FAILED, 'spawn failed');
    switch (err.code) {
      case 'SPAWN_FAILED':
        assert.ok(true);
        break;
      default:
        assert.fail('should have matched SPAWN_FAILED');
    }
  });
});
