import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  throw new Error('package.json is missing a valid "version" field');
}
const version: string = pkg.version;

const versionTsPath = join(root, 'src', 'version.ts');
const versionFilePath = join(root, 'VERSION');

writeFileSync(versionTsPath, `export const VERSION = "${version}";\n`);
writeFileSync(versionFilePath, `${version}\n`);

console.log(`synced version ${version} → src/version.ts, VERSION`);
