import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain,
  stripWww,
  registrableDomain,
  dedupKey,
} from '../../../src/lib/dedup/key.js';

describe('normalizeDomain', () => {
  it('extracts hostname from HTTPS URL', () => {
    assert.equal(normalizeDomain('https://github.com/login'), 'github.com');
  });

  it('extracts hostname from HTTP URL', () => {
    assert.equal(normalizeDomain('http://example.org/page'), 'example.org');
  });

  it('strips port from URL', () => {
    assert.equal(normalizeDomain('https://localhost:8080/api'), 'localhost');
  });

  it('strips path from URL', () => {
    assert.equal(normalizeDomain('https://example.com/very/deep/path'), 'example.com');
  });

  it('lowercases hostname', () => {
    assert.equal(normalizeDomain('https://GitHub.COM/login'), 'github.com');
  });

  it('handles URL with www prefix', () => {
    assert.equal(normalizeDomain('https://www.example.com'), 'www.example.com');
  });

  it('handles android:// scheme', () => {
    assert.equal(
      normalizeDomain('android://com.example.app'),
      'android://com.example.app',
    );
  });

  it('handles ios:// scheme', () => {
    assert.equal(
      normalizeDomain('ios://com.example.app'),
      'ios://com.example.app',
    );
  });

  it('lowercases android:// URIs', () => {
    assert.equal(
      normalizeDomain('android://COM.Example.App'),
      'android://com.example.app',
    );
  });

  it('returns empty string for null', () => {
    assert.equal(normalizeDomain(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(normalizeDomain(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(normalizeDomain(''), '');
  });

  it('lowercases non-URL strings as fallback', () => {
    assert.equal(normalizeDomain('NOT-A-URL'), 'not-a-url');
  });

  it('handles IDN (punycode) URLs', () => {
    const result = normalizeDomain('https://xn--nxasmq6b.example.com');
    assert.equal(result, 'xn--nxasmq6b.example.com');
  });

  it('does not perform Unicode normalization on IDN', () => {
    const result1 = normalizeDomain('https://xn--80ak6aa92e.com');
    const result2 = normalizeDomain('https://xn--e1afmapc.com');
    assert.notEqual(result1, result2);
  });

  it('extracts hostname from URL containing userinfo', () => {
    assert.equal(
      normalizeDomain('https://admin:secret@example.com/path'),
      'example.com',
    );
  });

  it('extracts hostname from URL with username-only userinfo', () => {
    assert.equal(
      normalizeDomain('https://user@example.com'),
      'example.com',
    );
  });
});

describe('stripWww', () => {
  it('removes www. prefix', () => {
    assert.equal(stripWww('www.example.com'), 'example.com');
  });

  it('does not modify hostnames without www', () => {
    assert.equal(stripWww('example.com'), 'example.com');
  });

  it('only strips leading www.', () => {
    assert.equal(stripWww('notwww.example.com'), 'notwww.example.com');
  });
});

describe('registrableDomain', () => {
  it('extracts registrable domain from subdomain', () => {
    assert.equal(registrableDomain('mail.google.com'), 'google.com');
  });

  it('handles multi-part TLD .co.uk', () => {
    assert.equal(registrableDomain('www.bbc.co.uk'), 'bbc.co.uk');
  });

  it('handles multi-part TLD .com.au', () => {
    assert.equal(registrableDomain('shop.example.com.au'), 'example.com.au');
  });

  it('returns hostname for bare domain', () => {
    assert.equal(registrableDomain('example.com'), 'example.com');
  });

  it('returns empty string for empty input', () => {
    assert.equal(registrableDomain(''), '');
  });

  it('lowercases the result', () => {
    assert.equal(registrableDomain('WWW.EXAMPLE.COM'), 'example.com');
  });

  it('handles deeply nested subdomains', () => {
    assert.equal(registrableDomain('a.b.c.d.example.com'), 'example.com');
  });
});

describe('dedupKey', () => {
  it('combines domain and username', () => {
    const key = dedupKey('https://github.com', 'user@test.com', {
      treatWwwAsSameDomain: false,
      caseInsensitiveUsernames: false,
    });
    assert.equal(key, 'github.com:user@test.com');
  });

  it('strips www when treatWwwAsSameDomain is true', () => {
    const key = dedupKey('https://www.github.com', 'user', {
      treatWwwAsSameDomain: true,
      caseInsensitiveUsernames: false,
    });
    assert.equal(key, 'github.com:user');
  });

  it('preserves www when treatWwwAsSameDomain is false', () => {
    const key = dedupKey('https://www.github.com', 'user', {
      treatWwwAsSameDomain: false,
      caseInsensitiveUsernames: false,
    });
    assert.equal(key, 'www.github.com:user');
  });

  it('lowercases username when caseInsensitiveUsernames is true', () => {
    const key = dedupKey('https://example.com', 'UserName', {
      treatWwwAsSameDomain: false,
      caseInsensitiveUsernames: true,
    });
    assert.equal(key, 'example.com:username');
  });

  it('preserves username case when caseInsensitiveUsernames is false', () => {
    const key = dedupKey('https://example.com', 'UserName', {
      treatWwwAsSameDomain: false,
      caseInsensitiveUsernames: false,
    });
    assert.equal(key, 'example.com:UserName');
  });

  it('handles null URI', () => {
    const key = dedupKey(null, 'user', {
      treatWwwAsSameDomain: true,
      caseInsensitiveUsernames: true,
    });
    assert.equal(key, ':user');
  });

  it('handles null username', () => {
    const key = dedupKey('https://example.com', null, {
      treatWwwAsSameDomain: true,
      caseInsensitiveUsernames: true,
    });
    assert.equal(key, 'example.com:');
  });

  it('produces deterministic output', () => {
    const opts = { treatWwwAsSameDomain: true, caseInsensitiveUsernames: true };
    const a = dedupKey('https://github.com', 'USER', opts);
    const b = dedupKey('https://github.com', 'USER', opts);
    assert.equal(a, b);
  });
});
