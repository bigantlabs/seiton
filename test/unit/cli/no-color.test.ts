import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyNoColor } from '../../../src/cli/no-color.js';

describe('applyNoColor', () => {
  let savedNoColor: string | undefined;

  beforeEach(() => {
    savedNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (savedNoColor !== undefined) {
      process.env['NO_COLOR'] = savedNoColor;
    } else {
      delete process.env['NO_COLOR'];
    }
  });

  it('sets NO_COLOR=1 when given boolean true', () => {
    applyNoColor(true);
    assert.equal(process.env['NO_COLOR'], '1');
  });

  it('does not set NO_COLOR when given boolean false', () => {
    applyNoColor(false);
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('sets NO_COLOR=1 when given string "true"', () => {
    applyNoColor('true');
    assert.equal(process.env['NO_COLOR'], '1');
  });

  it('sets NO_COLOR=1 when given string "1"', () => {
    applyNoColor('1');
    assert.equal(process.env['NO_COLOR'], '1');
  });

  it('does not set NO_COLOR when given string "false"', () => {
    applyNoColor('false');
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('does not set NO_COLOR when given string "0"', () => {
    applyNoColor('0');
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('does not set NO_COLOR when given other string values', () => {
    applyNoColor('yes');
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('sets NO_COLOR=1 when given array with last element true', () => {
    applyNoColor([false, true]);
    assert.equal(process.env['NO_COLOR'], '1');
  });

  it('does not set NO_COLOR when given array with last element false', () => {
    applyNoColor([true, false]);
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('sets NO_COLOR=1 when given array with last element "1"', () => {
    applyNoColor(['0', '1']);
    assert.equal(process.env['NO_COLOR'], '1');
  });

  it('does not set NO_COLOR when given array with last element "false"', () => {
    applyNoColor(['true', 'false']);
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('does not set NO_COLOR when given array with last element "0"', () => {
    applyNoColor(['1', '0']);
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('does not set NO_COLOR when given empty array', () => {
    applyNoColor([]);
    assert.equal(process.env['NO_COLOR'], undefined);
  });

  it('does not set NO_COLOR when given undefined', () => {
    applyNoColor(undefined);
    assert.equal(process.env['NO_COLOR'], undefined);
  });
});
