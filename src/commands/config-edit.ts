import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseConfig } from '../config/schema.js';
import { writeConfigFile } from '../config/io.js';

export type ConfigEditResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configEdit(configFilePath: string): Promise<ConfigEditResult> {
  const visual = (process.env['VISUAL'] ?? '').trim();
  const editorVar = (process.env['EDITOR'] ?? '').trim();
  const editorEnv = visual || editorVar || 'vi';
  const [editor, ...editorArgs] = editorEnv.split(/\s+/);

  const ensured = await ensureConfigFileExists(configFilePath);
  if (!ensured.ok) return ensured;

  return new Promise<ConfigEditResult>((resolve) => {
    let settled = false;
    const settle = (result: ConfigEditResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(editor!, [...editorArgs, configFilePath], { stdio: 'inherit' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      settle({ ok: false, error: `Failed to launch editor "${editorEnv}": ${msg}` });
      return;
    }

    child.on('error', (err) => {
      settle({ ok: false, error: `Failed to launch editor "${editorEnv}": ${err.message}` });
    });

    child.on('exit', async (code, signal) => {
      if (settled) return;
      if (signal) {
        settle({ ok: false, error: `Editor "${editorEnv}" was terminated by signal ${signal}` });
      } else if (code === 0) {
        try {
          const content = await readFile(configFilePath, 'utf-8');
          const raw = JSON.parse(content) as unknown;
          const result = parseConfig(raw);
          if (!result.success) {
            const issue = result.error.issues[0];
            const path = issue?.path.length ? issue.path.join('.') : '(root)';
            settle({ ok: false, error: `Config is invalid after editing: ${path}: ${issue?.message}` });
          } else {
            settle({ ok: true });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          settle({ ok: false, error: `Config file is not valid JSON after editing: ${msg}` });
        }
      } else {
        settle({ ok: false, error: `Editor "${editorEnv}" exited with code ${code}` });
      }
    });
  });
}

async function ensureConfigFileExists(configFilePath: string): Promise<ConfigEditResult> {
  try {
    await readFile(configFilePath, 'utf-8');
    return { ok: true };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'ENOENT') {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to read config: ${msg}` };
    }
    return writeConfigFile(configFilePath, { version: 1 });
  }
}
