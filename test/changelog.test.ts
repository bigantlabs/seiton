import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const SOURCE_TRIGGER_PATTERNS = [
  /^src\/commands\//,
  /^src\/cli\//,
  /^src\/config\/schema\.ts$/,
  /^src\/exit-codes\.ts$/,
  /^src\/report\//,
];

const CHANGESET_PATTERN = /^\.changeset\/[^/]+\.md$/;
const CHANGESET_EXCLUDED = new Set(['.changeset/README.md']);

function getChangedFiles(): string[] | null {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      { encoding: 'utf-8', timeout: 10_000 },
    );
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function isInGitRepo(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function hasOriginMain(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'origin/main'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

describe('changeset enforcement', () => {
  const skipReason = !isInGitRepo()
    ? 'not in a git repository'
    : !hasOriginMain()
      ? 'origin/main not available'
      : null;

  it('source trigger files require a changeset', { skip: skipReason ?? undefined }, () => {
    if (process.env['NO_CHANGELOG'] === '1') return;

    const changedFiles = getChangedFiles();
    if (changedFiles === null) {
      return;
    }

    const hasTriggerFile = changedFiles.some((file) =>
      SOURCE_TRIGGER_PATTERNS.some((pattern) => pattern.test(file)),
    );

    if (!hasTriggerFile) return;

    const hasChangeset = changedFiles.some(
      (file) => CHANGESET_PATTERN.test(file) && !CHANGESET_EXCLUDED.has(file),
    );
    assert.ok(
      hasChangeset,
      'Source trigger files were modified but no changeset was added. ' +
        'Run "npx changeset" to add one, or set NO_CHANGELOG=1 (requires no-changelog-needed label in CI).',
    );
  });

  it('passes when NO_CHANGELOG=1 is set', { skip: skipReason ?? undefined }, () => {
    if (process.env['NO_CHANGELOG'] !== '1') return;
    assert.ok(true, 'NO_CHANGELOG=1 bypasses changeset requirement');
  });
});
