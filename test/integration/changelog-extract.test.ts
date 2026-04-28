import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const AWK_SCRIPT = `
/^## / {
  if (found) exit
  if (index($0, ver) > 0) found=1
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

const KEEP_A_CHANGELOG_FIXTURE = [
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

describe('CHANGELOG awk extraction — keep-a-changelog format', () => {
  it('extracts the correct section for a middle version', async () => {
    const result = await extractChangelog(KEEP_A_CHANGELOG_FIXTURE, '1.1.0');
    assert.ok(result.includes('Earlier feature A'), 'should contain 1.1.0 content');
    assert.ok(!result.includes('New feature X'), 'should not contain 1.2.0 content');
    assert.ok(!result.includes('Initial release'), 'should not contain 1.0.0 content');
  });

  it('extracts the correct section for the latest version', async () => {
    const result = await extractChangelog(KEEP_A_CHANGELOG_FIXTURE, '1.2.0');
    assert.ok(result.includes('New feature X'), 'should contain feature X');
    assert.ok(result.includes('New feature Y'), 'should contain feature Y');
    assert.ok(result.includes('Bug fix Z'), 'should contain bug fix Z');
    assert.ok(!result.includes('Earlier feature A'), 'should not contain 1.1.0 content');
  });

  it('extracts the correct section for the oldest version', async () => {
    const result = await extractChangelog(KEEP_A_CHANGELOG_FIXTURE, '1.0.0');
    assert.ok(result.includes('Initial release'), 'should contain initial release');
    assert.ok(!result.includes('Earlier feature A'), 'should not contain 1.1.0 content');
  });

  it('returns empty string for a non-existent version', async () => {
    const result = await extractChangelog(KEEP_A_CHANGELOG_FIXTURE, '9.9.9');
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
    const result = await extractChangelog(KEEP_A_CHANGELOG_FIXTURE, '1.2.0');
    assert.ok(!result.includes('## [1.2.0]'), 'heading line should be skipped by next');
  });
});

const CHANGESETS_FIXTURE = [
  '# @bigantlabs/seiton',
  '',
  '## 2.0.0',
  '',
  '### Major Changes',
  '- Breaking change A',
  '',
  '## 1.3.0',
  '',
  '### Minor Changes',
  '- Feature B',
  '- Feature C',
  '',
  '## 1.2.0',
  '',
  '### Patch Changes',
  '- Fix D',
  '',
].join('\n');

describe('CHANGELOG awk extraction — changesets format', () => {
  it('extracts the correct section for a changesets version', async () => {
    const result = await extractChangelog(CHANGESETS_FIXTURE, '1.3.0');
    assert.ok(result.includes('Feature B'), 'should contain 1.3.0 content');
    assert.ok(result.includes('Feature C'), 'should contain 1.3.0 content');
    assert.ok(!result.includes('Breaking change A'), 'should not contain 2.0.0 content');
    assert.ok(!result.includes('Fix D'), 'should not contain 1.2.0 content');
  });

  it('extracts the latest changesets version', async () => {
    const result = await extractChangelog(CHANGESETS_FIXTURE, '2.0.0');
    assert.ok(result.includes('Breaking change A'), 'should contain 2.0.0 content');
    assert.ok(!result.includes('Feature B'), 'should not contain 1.3.0 content');
  });

  it('extracts the oldest changesets version', async () => {
    const result = await extractChangelog(CHANGESETS_FIXTURE, '1.2.0');
    assert.ok(result.includes('Fix D'), 'should contain 1.2.0 content');
    assert.ok(!result.includes('Feature B'), 'should not contain 1.3.0 content');
  });

  it('does not include the heading line itself', async () => {
    const result = await extractChangelog(CHANGESETS_FIXTURE, '2.0.0');
    assert.ok(!result.includes('## 2.0.0'), 'heading line should be skipped');
  });
});

const MIXED_FIXTURE = [
  '# Changelog',
  '',
  '## 2.1.0',
  '',
  '### Minor Changes',
  '- New changeset feature',
  '',
  '## 2.0.0',
  '',
  '### Major Changes',
  '- Major changeset bump',
  '',
  '## [1.2.0] - 2026-05-01',
  '',
  '### Added',
  '- Legacy feature X',
  '',
  '## [1.1.0] - 2026-04-01',
  '',
  '### Added',
  '- Legacy feature Y',
  '',
].join('\n');

describe('CHANGELOG awk extraction — mixed format', () => {
  it('extracts a changesets entry from a mixed file', async () => {
    const result = await extractChangelog(MIXED_FIXTURE, '2.1.0');
    assert.ok(result.includes('New changeset feature'), 'should contain 2.1.0 content');
    assert.ok(!result.includes('Major changeset bump'), 'should not contain 2.0.0 content');
    assert.ok(!result.includes('Legacy feature X'), 'should not contain 1.2.0 content');
  });

  it('extracts a keep-a-changelog entry from a mixed file', async () => {
    const result = await extractChangelog(MIXED_FIXTURE, '1.2.0');
    assert.ok(result.includes('Legacy feature X'), 'should contain 1.2.0 content');
    assert.ok(!result.includes('Legacy feature Y'), 'should not contain 1.1.0 content');
    assert.ok(!result.includes('Major changeset bump'), 'should not contain 2.0.0 content');
  });

  it('extracts the boundary version between formats', async () => {
    const result = await extractChangelog(MIXED_FIXTURE, '2.0.0');
    assert.ok(result.includes('Major changeset bump'), 'should contain 2.0.0 content');
    assert.ok(!result.includes('New changeset feature'), 'should not contain 2.1.0 content');
    assert.ok(!result.includes('Legacy feature X'), 'should not contain 1.2.0 content');
  });
});
