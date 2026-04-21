import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const AWK_SCRIPT = `
/^## \\[/ {
  if (found) exit
  if (index($0, "[" ver "]")) found=1
  next
}
found { print }
`;

async function extractChangelog(changelogContent: string, version: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'seiton-awk-'));
  try {
    const changelogPath = join(tmpDir, 'CHANGELOG.md');
    await writeFile(changelogPath, changelogContent);

    const { stdout } = await execFileAsync('awk', [
      '-v', `ver=${version}`,
      AWK_SCRIPT,
      changelogPath,
    ]);
    return stdout;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

describe('CHANGELOG awk extraction (release workflow)', () => {
  const FIXTURE = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [1.2.0] - 2026-05-01',
    '',
    '### Added',
    '- New feature X',
    '- New feature Y',
    '',
    '### Fixed',
    '- Bug fix Z',
    '',
    '## [1.1.0] - 2026-04-01',
    '',
    '### Added',
    '- Earlier feature A',
    '',
    '## [1.0.0] - 2026-03-01',
    '',
    '### Added',
    '- Initial release',
    '',
  ].join('\n');

  it('extracts the correct section for a middle version', async () => {
    const result = await extractChangelog(FIXTURE, '1.1.0');
    assert.ok(result.includes('Earlier feature A'), 'should contain 1.1.0 content');
    assert.ok(!result.includes('New feature X'), 'should not contain 1.2.0 content');
    assert.ok(!result.includes('Initial release'), 'should not contain 1.0.0 content');
  });

  it('extracts the correct section for the latest version', async () => {
    const result = await extractChangelog(FIXTURE, '1.2.0');
    assert.ok(result.includes('New feature X'), 'should contain feature X');
    assert.ok(result.includes('New feature Y'), 'should contain feature Y');
    assert.ok(result.includes('Bug fix Z'), 'should contain bug fix Z');
    assert.ok(!result.includes('Earlier feature A'), 'should not contain 1.1.0 content');
  });

  it('extracts the correct section for the oldest version', async () => {
    const result = await extractChangelog(FIXTURE, '1.0.0');
    assert.ok(result.includes('Initial release'), 'should contain initial release');
    assert.ok(!result.includes('Earlier feature A'), 'should not contain 1.1.0 content');
  });

  it('returns empty string for a non-existent version', async () => {
    const result = await extractChangelog(FIXTURE, '9.9.9');
    assert.equal(result.trim(), '', 'should produce no output for missing version');
  });

  it('handles version with pre-release suffix in heading', async () => {
    const changelog = [
      '# Changelog',
      '',
      '## [2.0.0-beta.1] - 2026-06-01',
      '',
      '### Added',
      '- Beta feature',
      '',
      '## [1.0.0] - 2026-03-01',
      '',
      '### Added',
      '- Stable feature',
      '',
    ].join('\n');

    const result = await extractChangelog(changelog, '2.0.0-beta.1');
    assert.ok(result.includes('Beta feature'), 'should extract pre-release section');
    assert.ok(!result.includes('Stable feature'), 'should not leak other versions');
  });

  it('does not include the heading line itself in the output', async () => {
    const result = await extractChangelog(FIXTURE, '1.2.0');
    assert.ok(!result.includes('## [1.2.0]'), 'heading line should be skipped by next');
  });
});
