import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskPassword,
  redactTotp,
  redactNotes,
  stripUriCredentials,
  redactItem,
  redactItems,
} from '../../../src/lib/analyze/redact.js';
import type { BwItem } from '../../../src/lib/domain/types.js';

const ITEM_WITH_SECRETS: BwItem = {
  id: 'test-id',
  organizationId: null,
  folderId: 'fold-1',
  type: 1,
  name: 'Secret Item',
  notes: 'These are secret notes with sensitive info',
  favorite: false,
  login: {
    uris: [{ match: null, uri: 'https://example.com' }],
    username: 'user@test.com',
    password: 'SuperSecret123!',
    totp: 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP',
    passwordRevisionDate: null,
  },
  revisionDate: '2024-01-01T00:00:00.000Z',
};

describe('maskPassword', () => {
  it('replaces password with fixed-length mask characters', () => {
    const masked = maskPassword('mypassword');
    assert.ok(!masked.includes('mypassword'));
    assert.equal(masked.length, 8);
    assert.match(masked, /^•+$/);
  });

  it('uses custom mask character', () => {
    const masked = maskPassword('test', '*');
    assert.equal(masked, '********');
  });

  it('uses fixed-length mask regardless of password length', () => {
    const masked = maskPassword('a'.repeat(50));
    assert.equal(masked.length, 8);
  });

  it('returns empty string for null', () => {
    assert.equal(maskPassword(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(maskPassword(undefined), '');
  });

  it('returns <empty> sentinel for explicitly empty password', () => {
    assert.equal(maskPassword(''), '<empty>');
  });

  it('never contains original password text', () => {
    const pw = 'SuperSecret123!';
    const masked = maskPassword(pw);
    assert.ok(!masked.includes(pw));
    assert.ok(!masked.includes('Super'));
    assert.ok(!masked.includes('Secret'));
  });
});

describe('redactTotp', () => {
  it('returns [REDACTED] for TOTP seed', () => {
    assert.equal(redactTotp('otpauth://totp/Test?secret=ABC'), '[REDACTED]');
  });

  it('returns empty string for null', () => {
    assert.equal(redactTotp(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(redactTotp(undefined), '');
  });

  it('never contains original TOTP data', () => {
    const totp = 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP';
    const redacted = redactTotp(totp);
    assert.ok(!redacted.includes('JBSWY3DPEHPK3PXP'));
    assert.ok(!redacted.includes('otpauth'));
  });
});

describe('redactNotes', () => {
  it('returns [REDACTED] for any notes', () => {
    assert.equal(redactNotes('Sensitive info here'), '[REDACTED]');
  });

  it('returns [REDACTED] for null notes', () => {
    assert.equal(redactNotes(null), '[REDACTED]');
  });

  it('never contains original note content', () => {
    const notes = 'My secret recovery codes: ABC-DEF-GHI';
    const redacted = redactNotes(notes);
    assert.ok(!redacted.includes('recovery'));
    assert.ok(!redacted.includes('ABC-DEF'));
  });

  it('returns [REDACTED] for empty string input', () => {
    assert.equal(redactNotes(''), '[REDACTED]');
  });
});

describe('stripUriCredentials', () => {
  it('strips username and password from URI', () => {
    assert.equal(
      stripUriCredentials('https://admin:s3cret@example.com/path'),
      'https://example.com/path',
    );
  });

  it('strips username-only from URI', () => {
    assert.equal(
      stripUriCredentials('https://admin@example.com/path'),
      'https://example.com/path',
    );
  });

  it('preserves URI without credentials', () => {
    assert.equal(
      stripUriCredentials('https://example.com/path?q=1'),
      'https://example.com/path?q=1',
    );
  });

  it('passes through non-URL strings unchanged', () => {
    assert.equal(stripUriCredentials('not-a-url'), 'not-a-url');
  });

  it('preserves port and query when stripping credentials', () => {
    assert.equal(
      stripUriCredentials('https://user:pass@example.com:8080/path?q=1'),
      'https://example.com:8080/path?q=1',
    );
  });
});

describe('redactItem', () => {
  it('preserves non-sensitive fields', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.equal(redacted.id, 'test-id');
    assert.equal(redacted.name, 'Secret Item');
    assert.equal(redacted.type, 1);
    assert.equal(redacted.folderId, 'fold-1');
    assert.equal(redacted.revisionDate, '2024-01-01T00:00:00.000Z');
  });

  it('preserves username in login', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.equal(redacted.login?.username, 'user@test.com');
  });

  it('preserves URIs in login', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.deepEqual(redacted.login?.uris, ['https://example.com']);
  });

  it('masks password', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.ok(redacted.login?.password);
    assert.ok(!redacted.login.password.includes('SuperSecret'));
    assert.match(redacted.login.password, /^•+$/);
  });

  it('redacts TOTP seed', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.equal(redacted.login?.totp, '[REDACTED]');
  });

  it('omits notes from output', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS);
    assert.ok(!('notes' in redacted));
  });

  it('handles item with null login', () => {
    const item: BwItem = {
      ...ITEM_WITH_SECRETS,
      login: null,
    };
    const redacted = redactItem(item);
    assert.equal(redacted.login, null);
  });

  it('handles item with null password', () => {
    const item: BwItem = {
      ...ITEM_WITH_SECRETS,
      login: { ...ITEM_WITH_SECRETS.login!, password: null },
    };
    const redacted = redactItem(item);
    assert.equal(redacted.login?.password, '');
  });

  it('handles item with null TOTP', () => {
    const item: BwItem = {
      ...ITEM_WITH_SECRETS,
      login: { ...ITEM_WITH_SECRETS.login!, totp: null },
    };
    const redacted = redactItem(item);
    assert.equal(redacted.login?.totp, '');
  });

  it('uses custom mask character', () => {
    const redacted = redactItem(ITEM_WITH_SECRETS, '*');
    assert.match(redacted.login!.password, /^\*+$/);
  });

  it('strips embedded credentials from URIs', () => {
    const item: BwItem = {
      ...ITEM_WITH_SECRETS,
      login: {
        ...ITEM_WITH_SECRETS.login!,
        uris: [
          { match: null, uri: 'https://admin:s3cret@example.com/path' },
          { match: null, uri: 'https://safe.example.com' },
        ],
      },
    };
    const redacted = redactItem(item);
    assert.deepEqual(redacted.login?.uris, [
      'https://example.com/path',
      'https://safe.example.com',
    ]);
  });

  it('filters null URIs', () => {
    const item: BwItem = {
      ...ITEM_WITH_SECRETS,
      login: {
        ...ITEM_WITH_SECRETS.login!,
        uris: [
          { match: null, uri: 'https://example.com' },
          { match: null, uri: null },
        ],
      },
    };
    const redacted = redactItem(item);
    assert.deepEqual(redacted.login?.uris, ['https://example.com']);
  });
});

describe('redactItems', () => {
  it('redacts all items in array', () => {
    const items = [ITEM_WITH_SECRETS, ITEM_WITH_SECRETS];
    const redacted = redactItems(items);
    assert.equal(redacted.length, 2);
    for (const item of redacted) {
      assert.ok(!item.login?.password.includes('SuperSecret'));
    }
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(redactItems([]), []);
  });
});
