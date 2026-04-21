import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ConfigEditResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configEdit(configFilePath: string): Promise<ConfigEditResult> {
  const editor = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';

  await ensureConfigFileExists(configFilePath);

  return new Promise<ConfigEditResult>((resolve) => {
    const child = spawn(editor, [configFilePath], { stdio: 'inherit' });

    child.on('error', (err) => {
      resolve({ ok: false, error: `Failed to launch editor "${editor}": ${err.message}` });
    });

    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `Editor "${editor}" exited with code ${code}` });
      }
    });
  });
}

async function ensureConfigFileExists(configFilePath: string): Promise<void> {
  try {
    await readFile(configFilePath, 'utf-8');
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      const dir = dirname(configFilePath);
      await mkdir(dir, { recursive: true });
      const template = JSON.stringify({ version: 1 }, null, 2) + '\n';
      await writeFile(configFilePath, template, { mode: 0o600 });
    }
  }
}
