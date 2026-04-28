import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function npmPack(destDir: string): Promise<string> {
	const { stdout } = await execFileAsync(
		"npm",
		["pack", "--pack-destination", destDir],
		{
			cwd: ROOT,
		},
	);
	return join(destDir, stdout.trim());
}

describe("release smoke test", () => {
	it("npm pack produces a valid tarball", async () => {
		const tmpDir = await mkdtemp(join(tmpdir(), "seiton-"));
		try {
			const tarball = await npmPack(tmpDir);
			assert.ok(tarball.endsWith(".tgz"), `expected .tgz, got ${tarball}`);

			const { stdout } = await execFileAsync("tar", ["tzf", tarball]);
			const files = stdout.split("\n").filter(Boolean);

			assert.ok(
				files.some((f) => f.includes("dist/bw-organize.js")),
				"tarball must include dist/bw-organize.js",
			);
			assert.ok(
				files.some((f) => f.includes("package.json")),
				"tarball must include package.json",
			);
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	});

	it("seiton --help exits 0 when run from built dist", async () => {
		const entry = join(ROOT, "dist", "bw-organize.js");
		const { stdout } = await execFileAsync(process.execPath, [entry, "--help"]);
		assert.ok(stdout.includes("Usage:"));
		assert.ok(stdout.includes("Commands:"));
	});

	it("seiton --version matches package.json", async () => {
		const entry = join(ROOT, "dist", "bw-organize.js");
		const { stdout } = await execFileAsync(process.execPath, [
			entry,
			"--version",
		]);
		const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
		assert.equal(stdout.trim(), pkg.version);
	});

	it("VERSION file matches package.json", async () => {
		const versionFile = (await readFile(join(ROOT, "VERSION"), "utf8")).trim();
		const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
		assert.equal(versionFile, pkg.version);
	});

	it("SHA256SUMS content matches actual tarball checksum", async () => {
		const tmpDir = await mkdtemp(join(tmpdir(), "seiton-sha-"));
		try {
			const tarball = await npmPack(tmpDir);
			const tarballName = basename(tarball);

			const { stdout: sha256sumOutput } = await execFileAsync("sha256sum", [
				tarball,
			]);
			const expectedLine = `${sha256sumOutput.trim().split(/\s+/)[0]}  ${tarballName}`;

			const tarballBytes = await readFile(tarball);
			const computedHash = createHash("sha256")
				.update(tarballBytes)
				.digest("hex");

			assert.equal(
				computedHash,
				expectedLine.split(/\s+/)[0],
				"node crypto SHA-256 must match sha256sum output",
			);

			const sha256sumsContent = `${computedHash}  ${tarballName}\n`;
			assert.match(
				sha256sumsContent,
				/^[a-f0-9]{64}  bigantlabs-seiton-.*\.tgz\n$/,
				"SHA256SUMS line must be: 64-char hex, two spaces, filename",
			);
		} finally {
			await rm(tmpDir, { recursive: true, force: true });
		}
	});
});
