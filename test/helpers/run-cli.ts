import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENTRY = join(ROOT, 'src', 'bw-organize.ts');
export const FAKE_BW = join(ROOT, 'test', 'helpers', 'fake-bw.ts');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCli(
  args: string[] = [],
  options?: {
    env?: Record<string, string | undefined>;
    cwd?: string;
    timeout?: number;
  },
): Promise<RunResult> {
  const env = options?.env ?? { ...process.env, NODE_NO_WARNINGS: '1' };
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', ENTRY, ...args],
      {
        cwd: options?.cwd ?? ROOT,
        env: env as NodeJS.ProcessEnv,
        timeout: options?.timeout,
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code };
  }
}
