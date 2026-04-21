import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runDoctorChecks } from '../../../src/commands/doctor.js';

describe('runDoctorChecks', () => {
  it('uses bwSession from options when provided', async () => {
    const results = await runDoctorChecks({
      bwSession: 'test-session-token-12345',
    });

    // Find the session check result
    const sessionCheck = results.find(r => r.name === 'session');
    assert.ok(sessionCheck, 'should have a session check result');
    assert.equal(sessionCheck.status, 'ok', 'session check should pass when bwSession is provided');
    assert.ok(sessionCheck.detail.includes('BW_SESSION is set'), 'detail should indicate session is set');
  });

  it('falls back to process.env BW_SESSION when options.bwSession is not provided', async () => {
    const originalSession = process.env['BW_SESSION'];

    try {
      delete process.env['BW_SESSION'];

      const results = await runDoctorChecks({});

      const sessionCheck = results.find(r => r.name === 'session');
      assert.ok(sessionCheck, 'should have a session check result');
      assert.equal(sessionCheck.status, 'fail', 'session check should fail when BW_SESSION is not set');
    } finally {
      if (originalSession) {
        process.env['BW_SESSION'] = originalSession;
      }
    }
  });

  it('prefers bwSession option over process.env BW_SESSION', async () => {
    const originalSession = process.env['BW_SESSION'];

    try {
      process.env['BW_SESSION'] = 'env-session-token';

      const results = await runDoctorChecks({
        bwSession: 'option-session-token',
      });

      const sessionCheck = results.find(r => r.name === 'session');
      assert.ok(sessionCheck, 'should have a session check result');
      assert.equal(sessionCheck.status, 'ok', 'session check should pass with option value');
    } finally {
      if (originalSession) {
        process.env['BW_SESSION'] = originalSession;
      } else {
        delete process.env['BW_SESSION'];
      }
    }
  });

  it('fails session check when both option and env are absent', async () => {
    const originalSession = process.env['BW_SESSION'];

    try {
      delete process.env['BW_SESSION'];

      const results = await runDoctorChecks({
        bwSession: undefined,
      });

      const sessionCheck = results.find(r => r.name === 'session');
      assert.ok(sessionCheck, 'should have a session check result');
      assert.equal(sessionCheck.status, 'fail', 'session check should fail when both are absent');
    } finally {
      if (originalSession) {
        process.env['BW_SESSION'] = originalSession;
      }
    }
  });

  it('includes other checks in results', async () => {
    const results = await runDoctorChecks({});

    const checkNames = results.map(r => r.name);
    assert.ok(checkNames.includes('node'), 'should include node version check');
    assert.ok(checkNames.includes('bw'), 'should include bw binary check');
    assert.ok(checkNames.includes('session'), 'should include session check');
    assert.ok(checkNames.includes('config'), 'should include config check');
    assert.ok(checkNames.includes('version'), 'should include version check');
  });
});
