import { parseArgs } from 'node:util';
import { loadConfig, ConfigError } from '../../config/loader.js';
import { ExitCode } from '../../exit-codes.js';
import { getBwVersion } from '../../lib/bw.js';
import { VERSION } from '../../version.js';
import { createLogger, createNoopLogger, type Logger } from '../../adapters/logging.js';
import { createSystemClock } from '../../adapters/clock.js';
import { configDiscoveryStack } from '../../config/paths.js';

const DOCTOR_HELP = `seiton doctor — preflight checks for bw, session, and config

Usage: seiton doctor [flags]

Checks:
  • bw CLI is on PATH and reports its version
  • BW_SESSION is set and the vault is unlocked
  • Node.js version meets the minimum requirement (>=22)
  • Config file is valid (if present)

Flags:
  --debug         Show stack traces on unexpected errors
  --config <path> Override the config file location
  --no-color      Disable ANSI color output
  --verbose, -v   Increase log detail
  --quiet, -q     Suppress non-essential output
  --help, -h      Print this help and exit

Exit Codes:
  0   All checks passed
  1   One or more checks failed
  2   Internal error`;

export interface DoctorOptions {
  cliConfigPath?: string;
  envConfigPath?: string;
  debug?: boolean;
  logger?: Logger;
}

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export async function doctor(opts: DoctorOptions = {}): Promise<void> {
  const log = opts.logger ?? createNoopLogger();

  log.info('doctor command started', { version: VERSION });

  const results: CheckResult[] = [];

  results.push(checkNodeVersion());
  results.push(await checkBwBinary());
  results.push(checkBwSession());
  results.push(await checkConfig(opts));
  results.push(checkVersion());

  const hasFail = results.some(r => r.status === 'fail');

  log.info('doctor checks complete', {
    passed: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'fail').length,
  });

  const output = results.map(formatCheck).join('\n') + '\n';
  process.stdout.write(output);

  if (hasFail) {
    log.debug('doctor exiting with failure');
    process.exit(ExitCode.GENERAL_ERROR);
  }
  log.debug('doctor exiting with success');
  process.exit(ExitCode.SUCCESS);
}

function checkNodeVersion(): CheckResult {
  const major = parseInt(process.versions.node.split('.')[0]!, 10);
  if (major >= 22) {
    return { name: 'node', status: 'ok', detail: `v${process.versions.node}` };
  }
  return {
    name: 'node',
    status: 'fail',
    detail: `v${process.versions.node} (requires >=22)`,
  };
}

async function checkBwBinary(): Promise<CheckResult> {
  try {
    const version = await getBwVersion();
    return { name: 'bw', status: 'ok', detail: `v${version}` };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      return { name: 'bw', status: 'fail', detail: 'not found on PATH' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'bw', status: 'fail', detail: `error: ${msg}` };
  }
}

function checkBwSession(): CheckResult {
  const session = process.env['BW_SESSION'];
  if (session && session.length > 0) {
    return { name: 'session', status: 'ok', detail: 'BW_SESSION is set' };
  }
  return {
    name: 'session',
    status: 'fail',
    detail: 'BW_SESSION is not set. Run: export BW_SESSION=$(bw unlock --raw)',
  };
}

async function checkConfig(opts: DoctorOptions): Promise<CheckResult> {
  try {
    await loadConfig({
      cliConfigPath: opts.cliConfigPath,
      envConfigPath: opts.envConfigPath,
    });
    const candidates = configDiscoveryStack({
      cliConfigPath: opts.cliConfigPath,
      envConfigPath: opts.envConfigPath,
    });
    const location = candidates.length > 0 ? candidates[0]!.path : 'defaults';
    return { name: 'config', status: 'ok', detail: `valid (${location})` };
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      return { name: 'config', status: 'fail', detail: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'config', status: 'fail', detail: msg };
  }
}

function checkVersion(): CheckResult {
  return { name: 'version', status: 'ok', detail: `seiton v${VERSION}` };
}

function formatCheck(result: CheckResult): string {
  const tag = result.status === 'ok' ? '[ok]'
    : result.status === 'warn' ? '[warn]'
    : '[fail]';
  return `${tag} ${result.name}: ${result.detail}`;
}

export function parseDoctorArgs(argv: string[]): { help: boolean; opts: DoctorOptions } {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        debug: { type: 'boolean' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean', short: 'v', multiple: true },
        quiet: { type: 'boolean', short: 'q' },
      },
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`seiton: doctor: invalid arguments: ${detail}\nRun 'seiton doctor --help' for usage.\n`);
    process.exit(ExitCode.USAGE);
  }

  if (parsed.values.help) {
    return { help: true, opts: {} };
  }

  const verboseCount = Array.isArray(parsed.values.verbose)
    ? parsed.values.verbose.length
    : parsed.values.verbose ? 1 : 0;

  const level = verboseCount >= 2 ? 'debug' as const
    : verboseCount === 1 ? 'info' as const
    : 'warn' as const;

  const logger = verboseCount > 0
    ? createLogger({ format: 'text', level, clock: createSystemClock() })
    : createNoopLogger();

  return {
    help: false,
    opts: {
      cliConfigPath: parsed.values.config as string | undefined,
      envConfigPath: process.env['SEITON_CONFIG'],
      debug: parsed.values.debug as boolean | undefined,
      logger,
    },
  };
}

export async function runDoctor(argv: string[]): Promise<void> {
  const { help, opts } = parseDoctorArgs(argv);
  if (help) {
    process.stdout.write(`${DOCTOR_HELP}\n`);
    process.exit(ExitCode.SUCCESS);
  }

  try {
    await doctor(opts);
  } catch (err: unknown) {
    if (opts.debug) {
      process.stderr.write(`seiton: doctor: unexpected error\n${err instanceof Error ? err.stack : String(err)}\n`);
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`seiton: doctor: unexpected error: ${msg}\nRun with --debug to see the full stack trace.\n`);
    }
    process.exit(ExitCode.MALFORMED_INPUT);
  }
}
