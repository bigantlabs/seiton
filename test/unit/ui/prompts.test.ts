import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPromptAdapter } from '../../../src/ui/prompts.js';

describe('createPromptAdapter', () => {
  describe('clack adapter', () => {
    it('creates a clack adapter with all required methods', () => {
      const adapter = createPromptAdapter('clack');
      assert.equal(typeof adapter.intro, 'function');
      assert.equal(typeof adapter.outro, 'function');
      assert.equal(typeof adapter.cancelled, 'function');
      assert.equal(typeof adapter.select, 'function');
      assert.equal(typeof adapter.confirm, 'function');
      assert.equal(typeof adapter.multiselect, 'function');
      assert.equal(typeof adapter.text, 'function');
      assert.equal(typeof adapter.startSpinner, 'function');
      assert.equal(typeof adapter.logInfo, 'function');
      assert.equal(typeof adapter.logSuccess, 'function');
      assert.equal(typeof adapter.logWarning, 'function');
      assert.equal(typeof adapter.logError, 'function');
      assert.equal(typeof adapter.logStep, 'function');
    });
  });

  describe('plain adapter', () => {
    it('creates a plain adapter with all required methods', () => {
      const adapter = createPromptAdapter('plain');
      assert.equal(typeof adapter.intro, 'function');
      assert.equal(typeof adapter.outro, 'function');
      assert.equal(typeof adapter.cancelled, 'function');
      assert.equal(typeof adapter.select, 'function');
      assert.equal(typeof adapter.confirm, 'function');
      assert.equal(typeof adapter.multiselect, 'function');
      assert.equal(typeof adapter.text, 'function');
      assert.equal(typeof adapter.startSpinner, 'function');
      assert.equal(typeof adapter.logInfo, 'function');
      assert.equal(typeof adapter.logSuccess, 'function');
      assert.equal(typeof adapter.logWarning, 'function');
      assert.equal(typeof adapter.logError, 'function');
      assert.equal(typeof adapter.logStep, 'function');
    });

    it('startSpinner returns handle with message/stop/error', () => {
      const adapter = createPromptAdapter('plain');
      const handle = adapter.startSpinner('test');
      assert.equal(typeof handle.message, 'function');
      assert.equal(typeof handle.stop, 'function');
      assert.equal(typeof handle.error, 'function');
    });
  });
});
