import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expandTilde, resolveConfigHome, configDiscoveryStack } from '../../../src/config/paths.js';

describe('expandTilde', () => {
  it('expands bare ~ to homedir', () => {
    assert.equal(expandTilde('~'), homedir());
  });

  it('expands ~/ prefix to homedir', () => {
    assert.equal(expandTilde('~/foo/bar'), join(homedir(), 'foo/bar'));
  });

  it('returns non-tilde paths unchanged', () => {
    assert.equal(expandTilde('/absolute/path'), '/absolute/path');
    assert.equal(expandTilde('relative/path'), 'relative/path');
  });
});

describe('resolveConfigHome', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    saved['HOME'] = process.env['HOME'];
  });

  afterEach(() => {
    if (saved['XDG_CONFIG_HOME'] === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = saved['XDG_CONFIG_HOME'];
    if (saved['HOME'] === undefined) delete process.env['HOME'];
    else process.env['HOME'] = saved['HOME'];
  });

  it('uses $XDG_CONFIG_HOME when set', () => {
    process.env['XDG_CONFIG_HOME'] = '/custom/config';
    assert.equal(resolveConfigHome(), '/custom/config');
  });

  it('expands tilde in $XDG_CONFIG_HOME', () => {
    process.env['XDG_CONFIG_HOME'] = '~/.myconfig';
    assert.equal(resolveConfigHome(), join(homedir(), '.myconfig'));
  });

  it('falls back to $HOME/.config when XDG is unset', () => {
    delete process.env['XDG_CONFIG_HOME'];
    process.env['HOME'] = '/test/home';
    assert.equal(resolveConfigHome(), '/test/home/.config');
  });

  it('falls back to os.homedir when both are unset', () => {
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['HOME'];
    assert.equal(resolveConfigHome(), join(homedir(), '.config'));
  });
});

describe('configDiscoveryStack', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved['XDG_CONFIG_HOME'] = process.env['XDG_CONFIG_HOME'];
    saved['HOME'] = process.env['HOME'];
  });

  afterEach(() => {
    if (saved['XDG_CONFIG_HOME'] === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = saved['XDG_CONFIG_HOME'];
    if (saved['HOME'] === undefined) delete process.env['HOME'];
    else process.env['HOME'] = saved['HOME'];
  });

  it('returns only --config candidate when cliConfigPath is set', () => {
    const stack = configDiscoveryStack({ cliConfigPath: '/my/config.json' });
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.path, '/my/config.json');
    assert.equal(stack[0]!.hardFail, true);
    assert.equal(stack[0]!.source, '--config');
  });

  it('returns only $SEITON_CONFIG candidate when envConfigPath is set', () => {
    const stack = configDiscoveryStack({ envConfigPath: '/env/config.json' });
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.path, '/env/config.json');
    assert.equal(stack[0]!.hardFail, true);
    assert.equal(stack[0]!.source, '$SEITON_CONFIG');
  });

  it('--config takes precedence over $SEITON_CONFIG', () => {
    const stack = configDiscoveryStack({
      cliConfigPath: '/cli/config.json',
      envConfigPath: '/env/config.json',
    });
    assert.equal(stack.length, 1);
    assert.equal(stack[0]!.source, '--config');
  });

  it('returns 3 soft candidates when no overrides', () => {
    process.env['HOME'] = '/test/home';
    delete process.env['XDG_CONFIG_HOME'];
    const stack = configDiscoveryStack();
    assert.equal(stack.length, 3);
    assert.ok(stack.every(c => !c.hardFail));
    assert.ok(stack[0]!.path.includes('config.json'));
    assert.ok(stack[2]!.path.endsWith('.seitonrc.json'));
  });

  it('expands tilde in cliConfigPath', () => {
    const stack = configDiscoveryStack({ cliConfigPath: '~/myconfig.json' });
    assert.equal(stack[0]!.path, join(homedir(), 'myconfig.json'));
  });
});
