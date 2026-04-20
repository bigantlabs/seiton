import { loadConfig, ConfigError } from '../../config/loader.js';
import { redactConfig } from '../../config/schema.js';
import { ExitCode } from '../../exit-codes.js';

export async function configShow(cliConfigPath?: string): Promise<void> {
  try {
    const config = await loadConfig({
      cliConfigPath,
      envConfigPath: process.env['SEITON_CONFIG'],
    });
    const redacted = redactConfig(config);
    process.stdout.write(JSON.stringify(redacted, null, 2) + '\n');
    process.exit(ExitCode.SUCCESS);
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      process.stderr.write(`seiton: ${err.message}\n`);
      process.exit(ExitCode.USAGE);
    }
    throw err;
  }
}
