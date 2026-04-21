import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ConfigResetResult =
  | { ok: true }
  | { ok: false; error: string };

export async function configReset(
  configFilePath: string,
  keepCustomRules: boolean,
): Promise<ConfigResetResult> {
  let customRules: unknown[] = [];

  if (keepCustomRules) {
    try {
      const content = await readFile(configFilePath, 'utf-8');
      const raw = JSON.parse(content) as Record<string, unknown>;
      const folders = raw['folders'] as Record<string, unknown> | undefined;
      if (folders && Array.isArray(folders['custom_rules'])) {
        customRules = folders['custom_rules'] as unknown[];
      }
    } catch {
      // No existing config to preserve rules from — proceed with empty rules
    }
  }

  const defaults: Record<string, unknown> = { version: 1 };
  if (customRules.length > 0) {
    defaults['folders'] = { custom_rules: customRules };
  }

  const dir = dirname(configFilePath);
  await mkdir(dir, { recursive: true });
  await writeFile(configFilePath, JSON.stringify(defaults, null, 2) + '\n', { mode: 0o600 });
  return { ok: true };
}
