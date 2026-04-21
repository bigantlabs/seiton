import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../../helpers/run-cli.js';

describe('CLI routing', () => {
  it('prints help for unknown command', async () => {
    const { stderr, exitCode } = await runCli(['nonexistent']);
    assert.equal(exitCode, 64);
    assert.ok(stderr.includes('unknown command'));
  });

  for (const command of ['audit', 'resume', 'discard', 'report', 'doctor', 'config']) {
    it(`routes "${command} --help" and exits 0`, async () => {
      const { stdout, exitCode } = await runCli([command, '--help'], {
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      assert.equal(exitCode, 0, `"${command} --help" should exit 0 but got ${exitCode}`);
      assert.ok(stdout.length > 0, `"${command} --help" should produce output`);
    });
  }

  it('--help without command prints main help', async () => {
    const { stdout, exitCode } = await runCli(['--help']);
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes('seiton'));
    assert.ok(stdout.includes('Commands:'));
  });

  it('--version prints version and exits 0', async () => {
    const { stdout, exitCode } = await runCli(['--version']);
    assert.equal(exitCode, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  });
});
