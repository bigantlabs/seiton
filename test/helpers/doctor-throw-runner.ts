#!/usr/bin/env node
/**
 * Spawned by doctor-coverage integration tests.
 * Patches process.stdout.write to throw, forcing the outer
 * try/catch in runDoctor() to exercise --debug error output.
 */

export {};

process.stdout.write = (): boolean => {
  throw new Error('simulated stdout failure');
};

const { runDoctor } = await import('../../src/cli/commands/doctor.js');
await runDoctor(process.argv.slice(2));
