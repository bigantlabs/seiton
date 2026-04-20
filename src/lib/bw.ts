import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '../adapters/logging.js';

const execFileAsync = promisify(execFile);

export async function getBwVersion(logger?: Logger): Promise<string> {
  logger?.debug('bw: fetching version');
  const { stdout } = await execFileAsync('bw', ['--version'], { timeout: 10_000 });
  const version = stdout.trim();
  logger?.debug('bw: version retrieved', { version });
  return version;
}
