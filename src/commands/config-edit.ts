import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseConfig } from '../config/schema.js';

export type ConfigEditResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configEdit(configFilePath: string): Promise<ConfigEditResult> {
  const editorEnv = process.env['VISUAL'] ?? process.env['EDITOR'] ?? 'vi';
  const [editor, ...editorArgs] = editorEnv.split(/\s+/);

  await ensureConfigFileExists(configFilePath);

  return new Promise<ConfigEditResult>((resolve) => {
    const child = spawn(editor!, [...editorArgs, configFilePath], { stdio: 'inherit' });

    child.on('error', (err) => {
      resolve({ ok: false, error: `Failed to launch editor "${editorEnv}": ${err.message}` });
    });

    child.on('exit', async (code, signal) => {
      if (signal) {
        resolve({ ok: false, error: `Editor "${editorEnv}" was terminated by signal ${signal}` });
      } else if (code === 0) {
        try {
          const content = await readFile(configFilePath, 'utf-8');
          const raw = JSON.parse(content) as unknown;
          const result = parseConfig(raw);
          if (!result.success) {
            const issue = result.error.issues[0];
            const path = issue?.path.length ? issue.path.join('.') : '(root)';
            resolve({ ok: false, error: `Config is invalid after editing: ${path}: ${issue?.message}` });
          } else {
            resolve({ ok: true });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          resolve({ ok: false, error: `Config file is not valid JSON after editing: ${msg}` });
        }
      } else {
        resolve({ ok: false, error: `Editor "${editorEnv}" exited with code ${code}` });
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
    } else {
      throw err;
    }
  }
}
