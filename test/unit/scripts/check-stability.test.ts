import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT_PATH = join(import.meta.dirname, '..', '..', '..', 'scripts', 'check-stability.ts');

function parseExitCodes(content: string): Map<string, number> {
  const codes = new Map<string, number>();
  const regex = /(\w+):\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    codes.set(match[1], Number(match[2]));
  }
  return codes;
}

function getCliFlags(content: string): Set<string> {
  const flags = new Set<string>();
  const regex = /['"](-{1,2}[\w-]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const flag = match[1];
    if (flag.startsWith('--') || (flag.startsWith('-') && flag.length === 2)) {
      flags.add(flag);
    }
  }
  return flags;
}

function buildDeprecationSet(content: string): Set<string> {
  const entries = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') || trimmed.startsWith('-')) {
      entries.add(trimmed.toLowerCase());
    }
  }
  return entries;
}

function isDocumentedDeprecation(name: string, deprecations: Set<string>): boolean {
  const lower = name.toLowerCase();
  for (const entry of deprecations) {
    if (entry.includes(lower)) return true;
  }
  return false;
}

describe('check-stability: parseExitCodes', () => {
  it('extracts key-value pairs from TypeScript enum-like content', () => {
    const content = `export const ExitCode = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE: 64,
} as const;`;
    const codes = parseExitCodes(content);
    assert.equal(codes.get('SUCCESS'), 0);
    assert.equal(codes.get('GENERAL_ERROR'), 1);
    assert.equal(codes.get('USAGE'), 64);
    assert.equal(codes.size, 3);
  });

  it('returns empty map for content with no matches', () => {
    const codes = parseExitCodes('export type Foo = string;');
    assert.equal(codes.size, 0);
  });

  it('handles codes with varying whitespace', () => {
    const content = 'FOO:0\nBAR:  42\nBAZ:\t99';
    const codes = parseExitCodes(content);
    assert.equal(codes.get('FOO'), 0);
    assert.equal(codes.get('BAR'), 42);
    assert.equal(codes.get('BAZ'), 99);
  });

  it('handles large exit code numbers', () => {
    const content = 'USER_INTERRUPT: 130';
    const codes = parseExitCodes(content);
    assert.equal(codes.get('USER_INTERRUPT'), 130);
  });

  it('matches underscore-containing names', () => {
    const content = 'CANT_CREATE: 73\nNO_PERMISSION: 77';
    const codes = parseExitCodes(content);
    assert.equal(codes.get('CANT_CREATE'), 73);
    assert.equal(codes.get('NO_PERMISSION'), 77);
  });
});

describe('check-stability: getCliFlags', () => {
  it('extracts double-dash flags from quoted strings', () => {
    const content = `case '--verbose': break;\ncase '--dry-run': break;`;
    const flags = getCliFlags(content);
    assert.ok(flags.has('--verbose'));
    assert.ok(flags.has('--dry-run'));
  });

  it('extracts single-dash short flags (single char)', () => {
    const content = `case '-v': break;\ncase '-h': break;`;
    const flags = getCliFlags(content);
    assert.ok(flags.has('-v'));
    assert.ok(flags.has('-h'));
  });

  it('ignores single-dash flags longer than two chars', () => {
    const content = `case '-verbose': break;`;
    const flags = getCliFlags(content);
    assert.ok(!flags.has('-verbose'));
  });

  it('extracts flags from both single and double quotes', () => {
    const content = `"--json" '--config'`;
    const flags = getCliFlags(content);
    assert.ok(flags.has('--json'));
    assert.ok(flags.has('--config'));
  });

  it('returns empty set for content with no flags', () => {
    const flags = getCliFlags('const x = 42;');
    assert.equal(flags.size, 0);
  });

  it('extracts flags with hyphens in the name', () => {
    const content = `'--no-color' '--dry-run' '--skip-confirmation'`;
    const flags = getCliFlags(content);
    assert.ok(flags.has('--no-color'));
    assert.ok(flags.has('--dry-run'));
    assert.ok(flags.has('--skip-confirmation'));
  });

  it('deduplicates repeated flags', () => {
    const content = `'--verbose' '--verbose' '--verbose'`;
    const flags = getCliFlags(content);
    assert.ok(flags.has('--verbose'));
    assert.equal(flags.size, 1);
  });

  it('ignores strings that are not flags', () => {
    const content = `'hello' "world" 'some-text' "another thing"`;
    const flags = getCliFlags(content);
    assert.equal(flags.size, 0);
  });
});

describe('check-stability: deprecation matching', () => {
  it('buildDeprecationSet collects pipe-prefixed lines', () => {
    const content = `# Deprecations

| Flag | Landed | Removal |
| ---- | ------ | ------- |
| --old-flag | v0.3.0 | v0.5.0 |
`;
    const deps = buildDeprecationSet(content);
    assert.ok(deps.size > 0);
    for (const entry of deps) {
      assert.ok(entry.startsWith('|') || entry.startsWith('-'));
    }
  });

  it('buildDeprecationSet collects dash-prefixed lines', () => {
    const content = `- --removed-flag: deprecated in v0.3.0, removal in v0.5.0`;
    const deps = buildDeprecationSet(content);
    assert.equal(deps.size, 1);
  });

  it('buildDeprecationSet lowercases entries', () => {
    const content = `| --MyFlag | v0.3.0 | v0.5.0 |`;
    const deps = buildDeprecationSet(content);
    for (const entry of deps) {
      assert.equal(entry, entry.toLowerCase());
    }
  });

  it('buildDeprecationSet ignores non-pipe non-dash lines', () => {
    const content = `# Title\n\nSome paragraph text.\n\n| --flag | v1 | v2 |`;
    const deps = buildDeprecationSet(content);
    assert.equal(deps.size, 1);
  });

  it('buildDeprecationSet returns empty for empty content', () => {
    const deps = buildDeprecationSet('');
    assert.equal(deps.size, 0);
  });

  it('isDocumentedDeprecation returns true when name appears in an entry', () => {
    const deps = new Set(['| --old-flag | v0.3.0 | v0.5.0 |']);
    assert.equal(isDocumentedDeprecation('--old-flag', deps), true);
  });

  it('isDocumentedDeprecation is case-insensitive', () => {
    const deps = new Set(['| --old-flag | v0.3.0 | v0.5.0 |']);
    assert.equal(isDocumentedDeprecation('--OLD-FLAG', deps), true);
  });

  it('isDocumentedDeprecation returns false when name is not in any entry', () => {
    const deps = new Set(['| --old-flag | v0.3.0 | v0.5.0 |']);
    assert.equal(isDocumentedDeprecation('--new-flag', deps), false);
  });

  it('isDocumentedDeprecation matches exit code names', () => {
    const deps = new Set(['| old_exit_code | v0.3.0 | v0.5.0 |']);
    assert.equal(isDocumentedDeprecation('OLD_EXIT_CODE', deps), true);
  });

  it('isDocumentedDeprecation returns false for empty deprecations', () => {
    assert.equal(isDocumentedDeprecation('--flag', new Set()), false);
  });
});

describe('check-stability: drift guard', () => {
  const scriptSource = readFileSync(SCRIPT_PATH, 'utf-8');

  it('script contains the parseExitCodes regex', () => {
    assert.ok(
      scriptSource.includes(String.raw`/(\w+):\s*(\d+)/g`),
      'parseExitCodes regex not found in check-stability.ts — update tests if regex changed',
    );
  });

  it('script contains the getCliFlags regex', () => {
    assert.ok(
      scriptSource.includes(String.raw`/['"](-{1,2}[\w-]+)['"]/g`),
      'getCliFlags regex not found in check-stability.ts — update tests if regex changed',
    );
  });

  it('script contains isDocumentedDeprecation function', () => {
    assert.ok(
      scriptSource.includes('function isDocumentedDeprecation'),
      'isDocumentedDeprecation function not found in check-stability.ts',
    );
  });

  it('script contains getDeprecations function', () => {
    assert.ok(
      scriptSource.includes('function getDeprecations'),
      'getDeprecations function not found in check-stability.ts',
    );
  });
});
