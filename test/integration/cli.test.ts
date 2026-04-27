import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../helpers/run-cli.js";

describe("CLI entry point", () => {
	describe("--version flag", () => {
		it("prints the version string to stdout and exits 0", async () => {
			const { stdout, exitCode } = await runCli(["--version"]);
			const { VERSION } = await import("../../src/version.js");
			assert.equal(stdout.trim(), VERSION);
			assert.equal(exitCode, 0);
		});

		it("prints the version string with -V short flag", async () => {
			const { stdout, exitCode } = await runCli(["-V"]);
			const { VERSION } = await import("../../src/version.js");
			assert.equal(stdout.trim(), VERSION);
			assert.equal(exitCode, 0);
		});
	});

	describe("--help flag", () => {
		it("prints help text to stdout and exits 0", async () => {
			const { stdout, exitCode } = await runCli(["--help"]);
			assert.ok(stdout.includes("seiton"));
			assert.ok(stdout.includes("Usage:"));
			assert.ok(stdout.includes("Commands:"));
			assert.ok(stdout.includes("Global Flags:"));
			assert.equal(exitCode, 0);
		});

		it("prints help text with -h short flag", async () => {
			const { stdout, exitCode } = await runCli(["-h"]);
			assert.ok(stdout.includes("Usage:"));
			assert.equal(exitCode, 0);
		});

		it("includes the version in help output", async () => {
			const { stdout } = await runCli(["--help"]);
			const { VERSION } = await import("../../src/version.js");
			assert.ok(stdout.includes(`seiton v${VERSION}`));
		});
	});

	describe("default (no arguments)", () => {
		it("dispatches to audit which requires a TTY (exits 64 in subprocess)", async () => {
			const { stderr, exitCode } = await runCli([]);
			assert.equal(exitCode, 64);
			assert.ok(
				stderr.includes("interactive terminal") || stderr.includes("report"),
			);
		});
	});

	describe("invalid-argument error path", () => {
		// parseArgs uses strict: true, so unknown flags throw and the catch block
		// in bw-organize.ts writes "invalid arguments: ..." to stderr and exits
		// with ExitCode.USAGE (64). Passing an unknown flag directly exercises
		// this path without a fixture indirection.
		it("unknown flag exits 64 and writes guidance to stderr", async () => {
			const { stderr, exitCode } = await runCli(["--unknown-flag"]);
			assert.equal(exitCode, 64, "ExitCode.USAGE should be 64");
			assert.ok(
				stderr.includes("invalid arguments") || stderr.includes("unknown flag"),
			);
			assert.ok(stderr.includes("--help"));
		});
	});
});
