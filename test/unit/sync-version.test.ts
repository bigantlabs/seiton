import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

function createTempProject(version: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'seiton-sync-version-'));
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }));
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'src', 'version.ts'), 'export const VERSION = "0.0.0";\n');
	writeFileSync(join(dir, 'VERSION'), '0.0.0\n');
	return dir;
}

function runSyncVersion(projectRoot: string): void {
	const patchedScript = `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = ${JSON.stringify(projectRoot)};
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  throw new Error('package.json is missing a valid "version" field');
}
const version = pkg.version;

writeFileSync(join(root, 'src', 'version.ts'), \`export const VERSION = "\${version}";\n\`);
writeFileSync(join(root, 'VERSION'), \`\${version}\n\`);
`;

	execFileSync('node', ['--input-type=module', '-e', patchedScript], {
		cwd: projectRoot,
		timeout: 10_000,
	});
}

describe('sync-version script', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = '';
	});

	afterEach(() => {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('syncs a normal semver version to version.ts and VERSION', () => {
		tempDir = createTempProject('1.2.3');
		runSyncVersion(tempDir);

		const versionTs = readFileSync(join(tempDir, 'src', 'version.ts'), 'utf8');
		assert.equal(versionTs, 'export const VERSION = "1.2.3";\n');

		const versionFile = readFileSync(join(tempDir, 'VERSION'), 'utf8');
		assert.equal(versionFile, '1.2.3\n');
	});

	it('syncs a pre-release version correctly', () => {
		tempDir = createTempProject('2.0.0-beta.1');
		runSyncVersion(tempDir);

		const versionTs = readFileSync(join(tempDir, 'src', 'version.ts'), 'utf8');
		assert.equal(versionTs, 'export const VERSION = "2.0.0-beta.1";\n');

		const versionFile = readFileSync(join(tempDir, 'VERSION'), 'utf8');
		assert.equal(versionFile, '2.0.0-beta.1\n');
	});

	it('overwrites existing content completely', () => {
		tempDir = createTempProject('3.0.0');
		writeFileSync(join(tempDir, 'src', 'version.ts'), 'export const VERSION = "old";\nextra line\n');
		writeFileSync(join(tempDir, 'VERSION'), 'old\nextra\n');

		runSyncVersion(tempDir);

		const versionTs = readFileSync(join(tempDir, 'src', 'version.ts'), 'utf8');
		assert.equal(versionTs, 'export const VERSION = "3.0.0";\n');

		const versionFile = readFileSync(join(tempDir, 'VERSION'), 'utf8');
		assert.equal(versionFile, '3.0.0\n');
	});

	it('throws when package.json is missing', () => {
		tempDir = mkdtempSync(join(tmpdir(), 'seiton-sync-version-'));
		mkdirSync(join(tempDir, 'src'), { recursive: true });

		assert.throws(
			() => runSyncVersion(tempDir),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				const stderr = 'stderr' in err ? String(err.stderr) : '';
				assert.ok(
					err.message.includes('package.json') || stderr.includes('ENOENT'),
					'error should mention package.json or ENOENT',
				);
				return true;
			},
		);
	});

	it('throws when package.json has no version field', () => {
		tempDir = mkdtempSync(join(tmpdir(), 'seiton-sync-version-'));
		writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'no-version' }));
		mkdirSync(join(tempDir, 'src'), { recursive: true });

		assert.throws(
			() => runSyncVersion(tempDir),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				return true;
			},
		);
	});

	it('syncs the actual project files when run via tsx', () => {
		const scriptPath = join(import.meta.dirname, '..', '..', 'scripts', 'sync-version.ts');
		const projectRoot = join(import.meta.dirname, '..', '..');

		const pkgJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
		const currentVersion: string = pkgJson.version;

		execFileSync('node', ['--import', 'tsx', scriptPath], {
			cwd: projectRoot,
			timeout: 30_000,
		});

		const versionTs = readFileSync(join(projectRoot, 'src', 'version.ts'), 'utf8');
		assert.equal(versionTs, `export const VERSION = "${currentVersion}";\n`);

		const versionFile = readFileSync(join(projectRoot, 'VERSION'), 'utf8');
		assert.equal(versionFile, `${currentVersion}\n`);
	});
});
