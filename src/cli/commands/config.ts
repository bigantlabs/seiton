import { loadConfig, ConfigError } from '../../config/loader.js';
import { redactConfig } from '../../config/schema.js';
import { ExitCode } from '../../exit-codes.js';
import type { Logger } from '../../adapters/logging.js';

export async function configShow(cliConfigPath?: string, logger?: Logger): Promise<void> {
  logger?.info('config show command started');
  try {
    const config = await loadConfig({
      cliConfigPath,
      envConfigPath: process.env['SEITON_CONFIG'],
      logger,
    });
    const redacted = redactConfig(config);
    process.stdout.write(JSON.stringify(redacted, null, 2) + '\n');
    logger?.debug('config show complete');
    process.exit(ExitCode.SUCCESS);
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      logger?.error('config show failed', { code: err.code });
      process.stderr.write(`seiton: ${err.message}\n`);
      process.exit(ExitCode.USAGE);
    }
    throw err;
  }
}
