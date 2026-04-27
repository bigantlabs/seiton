import { parseArgs } from "node:util";
import { ExitCode } from "../../exit-codes.js";
import { applyNoColor } from "../no-color.js";
import { VERSION } from "../../version.js";
import { createLogger, createNoopLogger } from "../../adapters/logging.js";
import { createSystemClock } from "../../adapters/clock.js";
import { createPromptAdapter } from "../../ui/prompts.js";
import { installSignalHandlers } from "../../core/signals.js";
import { runDoctorChecks } from "../../commands/doctor.js";
import type { DoctorOptions } from "../../commands/doctor.js";

const DOCTOR_HELP = `seiton doctor — preflight checks for bw, session, and config

Usage: seiton doctor [flags]

Checks:
  • bw CLI is on PATH and reports its version
  • BW_SESSION environment variable is set (unlock status is not probed)
  • Node.js version meets the minimum requirement (>=22)
  • Config file is valid (if present)

Flags:
  --debug         Show stack traces on unexpected error
  --config <path> Override the config file location
  --no-color      Disable ANSI color output
  --verbose, -v   Increase log detail
  --quiet, -q     Suppress non-essential output
  --help, -h      Print this help and exit

Exit Codes:
  0   All checks passed
  1   One or more checks failed
  2   Internal error`;

export async function doctor(
	opts: DoctorOptions & { promptStyle?: "clack" | "plain" } = {},
): Promise<void> {
	const prompt = createPromptAdapter(opts.promptStyle ?? "clack");
	prompt.intro(`seiton doctor v${VERSION}`);

	const results = await runDoctorChecks(opts);
	const hasFail = results.some((r) => r.status === "fail");

	for (const result of results) {
		if (result.status === "ok") {
			prompt.logSuccess(`${result.name}: ${result.detail}`);
		} else if (result.status === "warn") {
			prompt.logWarning(`${result.name}: ${result.detail}`);
		} else {
			prompt.logError(`${result.name}: ${result.detail}`);
		}
	}

	if (hasFail) {
		prompt.outro("Some checks failed.");
		process.exit(ExitCode.GENERAL_ERROR);
	}
	prompt.outro("All checks passed.");
	process.exit(ExitCode.SUCCESS);
}

export function parseDoctorArgs(argv: string[]): {
	help: boolean;
	opts: DoctorOptions & { promptStyle?: "clack" | "plain" };
} {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			strict: true,
			options: {
				help: { type: "boolean", short: "h" },
				debug: { type: "boolean" },
				config: { type: "string" },
				"no-color": { type: "boolean" },
				verbose: { type: "boolean", short: "v", multiple: true },
				quiet: { type: "boolean", short: "q" },
			},
		});
	} catch (err: unknown) {
		const detail = err instanceof Error ? err.message : String(err);
		process.stderr.write(
			`seiton: doctor: invalid arguments: ${detail}\nRun 'seiton doctor --help' for usage.\n`,
		);
		process.exit(ExitCode.USAGE);
	}

	if (parsed.values.help) {
		return { help: true, opts: {} };
	}

	applyNoColor(parsed.values["no-color"]);

	const verboseCount = Array.isArray(parsed.values.verbose)
		? parsed.values.verbose.length
		: parsed.values.verbose
			? 1
			: 0;

	const level =
		verboseCount >= 2
			? ("debug" as const)
			: verboseCount === 1
				? ("info" as const)
				: ("warn" as const);

	const logger =
		verboseCount > 0
			? createLogger({ format: "text", level, clock: createSystemClock() })
			: createNoopLogger();

	return {
		help: false,
		opts: {
			cliConfigPath: parsed.values.config as string | undefined,
			envConfigPath: process.env["SEITON_CONFIG"],
			debug: parsed.values.debug as boolean | undefined,
			promptStyle: parsed.values["no-color"] ? "plain" : undefined,
			logger,
			bwSession: process.env["BW_SESSION"],
			nodeVersion: process.versions.node,
		},
	};
}

export async function runDoctor(argv: string[]): Promise<void> {
	const { help, opts } = parseDoctorArgs(argv);
	if (help) {
		process.stdout.write(`${DOCTOR_HELP}\n`);
		process.exit(ExitCode.SUCCESS);
	}

	installSignalHandlers(opts.logger ?? createNoopLogger());

	try {
		await doctor(opts);
	} catch (err: unknown) {
		if (opts.debug) {
			process.stderr.write(
				`seiton: doctor: unexpected error\n${err instanceof Error ? err.stack : String(err)}\n`,
			);
		} else {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(
				`seiton: doctor: unexpected error: ${msg}\nRun with --debug to see the full stack trace.\n`,
			);
		}
		process.exit(ExitCode.INTERNAL_ERROR);
	}
}
