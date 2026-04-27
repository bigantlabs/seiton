import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfigOrExit } from "../../config/loader.js";
import { readConfigFile } from "../../config/io.js";
import { redactConfig } from "../../config/schema.js";
import { configDiscoveryStack } from "../../config/paths.js";
import { ExitCode } from "../../exit-codes.js";
import { applyNoColor } from "../no-color.js";
import { createLogger, createNoopLogger } from "../../adapters/logging.js";
import { createSystemClock } from "../../adapters/clock.js";
import { createPromptAdapter } from "../../ui/prompts.js";
import { VERSION } from "../../version.js";
import { configGet } from "../../commands/config-get.js";
import { configSet } from "../../commands/config-set.js";
import { configPath } from "../../commands/config-path.js";
import { configEdit } from "../../commands/config-edit.js";
import { configReset } from "../../commands/config-reset.js";
import type { Logger } from "../../adapters/logging.js";

const CONFIG_HELP = `seiton config — get, set, edit, reset configuration

Usage: seiton config <subcommand> [flags]

Subcommands:
  show              Display the full resolved configuration
  get <key>         Get a specific configuration value
  set <key> <value> Set a configuration value
  set <key> --unset Remove a configuration key
  path              Print the active config file path
  edit              Open the config file in $VISUAL/$EDITOR
  reset             Reset config to defaults

Flags:
  --config <path>      Override the config file location
  --keep-custom-rules  Preserve custom_rules during reset
  --yes                Skip confirmation for reset
  --verbose, -v        Increase log detail
  --quiet, -q          Suppress non-essential output
  --help, -h           Print this help and exit

Exit Codes:
  0   Success
  64  Invalid arguments or unknown subcommand`;

const CONFIG_VALUE_FLAGS = new Set(["--config"]);

export async function runConfigCli(argv: string[]): Promise<void> {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${CONFIG_HELP}\n`);
		process.exit(ExitCode.SUCCESS);
	}

	const subPos = findConfigSubcommand(argv);
	if (!subPos) {
		process.stdout.write(`${CONFIG_HELP}\n`);
		process.exit(ExitCode.SUCCESS);
	}

	const subcommand = subPos.value;
	const subArgs = [
		...argv.slice(0, subPos.index),
		...argv.slice(subPos.index + 1),
	];

	switch (subcommand) {
		case "show":
			return runConfigShow(subArgs);
		case "get":
			return runConfigGet(subArgs);
		case "set":
			return runConfigSet(subArgs);
		case "path":
			return runConfigPath(subArgs);
		case "edit":
			return runConfigEdit(subArgs);
		case "reset":
			return runConfigReset(subArgs);
		default:
			process.stderr.write(
				`seiton: config: unknown subcommand "${subcommand}"\nRun 'seiton config --help' for usage.\n`,
			);
			process.exit(ExitCode.USAGE);
	}
}

function findConfigSubcommand(
	argv: string[],
): { index: number; value: string } | undefined {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (!a.startsWith("-")) return { index: i, value: a };
		if (CONFIG_VALUE_FLAGS.has(a)) i++;
	}
	return undefined;
}

async function runConfigShow(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "show");
	const log = makeLogger(args);

	log.info("config show command started");
	log.debug("dispatching config show");
	const config = await loadConfigOrExit(
		{
			cliConfigPath: args.configPath,
			envConfigPath: process.env["SEITON_CONFIG"],
			logger: log,
		},
		"config show",
	);
	const redacted = redactConfig(config);
	process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`);
	process.exit(ExitCode.SUCCESS);
}

async function runConfigGet(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "get");
	const log = makeLogger(args);

	if (args.positionals.length === 0) {
		process.stderr.write(
			"seiton: config get: key path required\nUsage: seiton config get <key>\n",
		);
		process.exit(ExitCode.USAGE);
	}

	const keyPath = args.positionals[0]!;
	const config = await loadConfigOrExit(
		{
			cliConfigPath: args.configPath,
			envConfigPath: process.env["SEITON_CONFIG"],
			logger: log,
		},
		"config get",
	);

	const result = configGet(config, keyPath);
	if (!result.ok) {
		process.stderr.write(`seiton: config get: ${result.error}\n`);
		process.exit(ExitCode.USAGE);
	}

	const output =
		typeof result.value === "object" && result.value !== null
			? JSON.stringify(result.value, null, 2)
			: String(result.value);
	process.stdout.write(`${output}\n`);
	process.exit(ExitCode.SUCCESS);
}

async function runConfigSet(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "set");

	if (args.positionals.length === 0) {
		process.stderr.write(
			"seiton: config set: key path required\nUsage: seiton config set <key> <value>\n",
		);
		process.exit(ExitCode.USAGE);
	}

	const keyPath = args.positionals[0]!;
	const value = args.positionals[1];
	const filePath = await resolveConfigFilePath(args.configPath);

	const result = await configSet(filePath, keyPath, value, args.unset);
	if (!result.ok) {
		process.stderr.write(`seiton: config set: ${result.error}\n`);
		process.exit(ExitCode.USAGE);
	}

	process.stdout.write(`Set ${keyPath} successfully.\n`);
	process.exit(ExitCode.SUCCESS);
}

async function runConfigPath(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "path");
	const path = await configPath({
		cliConfigPath: args.configPath,
		envConfigPath: process.env["SEITON_CONFIG"],
	});

	if (path) {
		process.stdout.write(`${path}\n`);
	} else {
		process.stdout.write("No config file found (using defaults).\n");
	}
	process.exit(ExitCode.SUCCESS);
}

async function runConfigEdit(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "edit");
	const filePath = await resolveConfigFilePath(args.configPath);

	const result = await configEdit(filePath);
	if (!result.ok) {
		process.stderr.write(`seiton: config edit: ${result.error}\n`);
		process.exit(ExitCode.GENERAL_ERROR);
	}
	process.exit(ExitCode.SUCCESS);
}

async function runConfigReset(argv: string[]): Promise<void> {
	const args = parseConfigFlags(argv, "reset");
	const filePath = await resolveConfigFilePath(args.configPath);

	const read = await readConfigFile(filePath);
	const existingStyle = read.ok
		? (read.data["ui"] as Record<string, unknown> | undefined)?.["prompt_style"]
		: undefined;
	const prompt = createPromptAdapter(
		existingStyle === "plain" ? "plain" : "clack",
	);

	if (!args.yes) {
		prompt.intro(`seiton config reset v${VERSION}`);
		const confirmed = await prompt.confirm(
			"Reset configuration to defaults? This cannot be undone.",
			false,
		);
		if (!confirmed) {
			prompt.cancelled("Reset cancelled.");
			process.exit(ExitCode.SUCCESS);
		}
	}

	const result = await configReset(filePath, args.keepCustomRules);
	if (!result.ok) {
		process.stderr.write(`seiton: config reset: ${result.error}\n`);
		process.exit(ExitCode.GENERAL_ERROR);
	}

	process.stdout.write("Configuration reset to defaults.\n");
	process.exit(ExitCode.SUCCESS);
}

interface ParsedConfigArgs {
	configPath: string | undefined;
	verbose: number;
	quiet: boolean;
	positionals: string[];
	unset: boolean;
	keepCustomRules: boolean;
	yes: boolean;
}

function parseConfigFlags(argv: string[], sub: string): ParsedConfigArgs {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			strict: true,
			options: {
				help: { type: "boolean", short: "h" },
				config: { type: "string" },
				"dry-run": { type: "boolean" },
				"no-color": { type: "boolean" },
				verbose: { type: "boolean", short: "v", multiple: true },
				quiet: { type: "boolean", short: "q" },
				unset: { type: "boolean" },
				"keep-custom-rules": { type: "boolean" },
				yes: { type: "boolean" },
			},
		});
	} catch (err: unknown) {
		const detail = err instanceof Error ? err.message : String(err);
		process.stderr.write(
			`seiton: config ${sub}: invalid arguments: ${detail}\nRun 'seiton config --help' for usage.\n`,
		);
		process.exit(ExitCode.USAGE);
	}

	if (parsed.values.help) {
		process.stdout.write(`${CONFIG_HELP}\n`);
		process.exit(ExitCode.SUCCESS);
	}

	applyNoColor(parsed.values["no-color"]);

	const verboseCount = Array.isArray(parsed.values.verbose)
		? parsed.values.verbose.length
		: parsed.values.verbose
			? 1
			: 0;

	return {
		configPath: parsed.values.config as string | undefined,
		verbose: verboseCount,
		quiet: Boolean(parsed.values.quiet),
		positionals: parsed.positionals,
		unset: Boolean(parsed.values.unset),
		keepCustomRules: Boolean(parsed.values["keep-custom-rules"]),
		yes: Boolean(parsed.values.yes),
	};
}

function makeLogger(args: ParsedConfigArgs): Logger {
	if (args.quiet || args.verbose === 0) return createNoopLogger();
	return createLogger({
		format: "text",
		level: args.verbose >= 2 ? "debug" : "info",
		clock: createSystemClock(),
	});
}

async function resolveConfigFilePath(cliConfigPath?: string): Promise<string> {
	const candidates = configDiscoveryStack({
		cliConfigPath,
		envConfigPath: process.env["SEITON_CONFIG"],
	});
	if (candidates.length > 0) return candidates[0]!.path;

	return join(homedir(), ".config", "seiton", "config.json");
}
