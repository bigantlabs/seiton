import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getBwVersion(): Promise<string> {
  const { stdout } = await execFileAsync('bw', ['--version'], { timeout: 10_000 });
  return stdout.trim();
}
