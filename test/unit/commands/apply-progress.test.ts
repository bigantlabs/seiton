import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatProgressMessage, formatApplySummary } from '../../../src/commands/apply-progress.js';
import type { ApplyProgress, ApplyTimings } from '../../../src/commands/apply.js';

describe('formatProgressMessage', () => {
  it('formats a create_folder progress message', () => {
    const p: ApplyProgress = {
      phase: 'create_folder', current: 3, phaseTotal: 5,
      overallCurrent: 3, overallTotal: 42,
      description: 'Development', failedSoFar: 0,
    };
    assert.equal(formatProgressMessage(p), 'Creating folder 3/5 — Development');
  });

  it('formats an assign_folder progress message', () => {
    const p: ApplyProgress = {
      phase: 'assign_folder', current: 12, phaseTotal: 30,
      overallCurrent: 17, overallTotal: 42,
      description: 'Banking & Finance', failedSoFar: 0,
    };
    assert.equal(formatProgressMessage(p), 'Assigning folder 12/30 — Banking & Finance');
  });

  it('formats a delete_item progress message', () => {
    const p: ApplyProgress = {
      phase: 'delete_item', current: 2, phaseTotal: 7,
      overallCurrent: 39, overallTotal: 42,
      description: 'item-abc123', failedSoFar: 0,
    };
    assert.equal(formatProgressMessage(p), 'Deleting item 2/7 — item-abc123');
  });

  it('includes failure count when > 0', () => {
    const p: ApplyProgress = {
      phase: 'assign_folder', current: 5, phaseTotal: 10,
      overallCurrent: 10, overallTotal: 20,
      description: 'Social', failedSoFar: 3,
    };
    assert.equal(formatProgressMessage(p), 'Assigning folder 5/10 — Social [3 failed]');
  });

  it('truncates long descriptions with ellipsis', () => {
    const p: ApplyProgress = {
      phase: 'create_folder', current: 1, phaseTotal: 1,
      overallCurrent: 1, overallTotal: 1,
      description: 'This Is A Very Long Folder Name That Exceeds Thirty Characters',
      failedSoFar: 0,
    };
    const msg = formatProgressMessage(p);
    assert.ok(msg.includes('…'), 'should contain ellipsis');
    assert.ok(msg.length < 100, 'message should be reasonable length');
  });

  it('handles 1/1 single-op edge case', () => {
    const p: ApplyProgress = {
      phase: 'delete_item', current: 1, phaseTotal: 1,
      overallCurrent: 1, overallTotal: 1,
      description: 'item-1', failedSoFar: 0,
    };
    assert.equal(formatProgressMessage(p), 'Deleting item 1/1 — item-1');
  });
});

describe('formatApplySummary', () => {
  it('formats a summary with all three phases', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 5, succeeded: 5, durationMs: 1200 },
      assign_folder: { count: 30, succeeded: 30, durationMs: 8400 },
      delete_item: { count: 7, succeeded: 7, durationMs: 2100 },
      totalDurationMs: 11700,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Created folders: 5 in 1.2s'));
    assert.ok(summary.includes('Assigned folders: 30 in 8.4s'));
    assert.ok(summary.includes('Deleted items: 7 in 2.1s'));
    assert.ok(summary.includes('Total: 42 ops in 11.7s'));
    assert.ok(!summary.includes('failed'));
  });

  it('includes failure count in total line', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 2, succeeded: 1, durationMs: 500 },
      assign_folder: { count: 3, succeeded: 2, durationMs: 900 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 1400,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 2);
    assert.ok(summary.includes('(2 failed)'));
    assert.ok(summary.includes('Created folders: 1/2'));
    assert.ok(summary.includes('Assigned folders: 2/3'));
  });

  it('omits phases with zero operations', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 0, succeeded: 0, durationMs: 0 },
      assign_folder: { count: 10, succeeded: 10, durationMs: 3000 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 3000,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(!summary.includes('Created folders'));
    assert.ok(summary.includes('Assigned folders: 10 in 3.0s'));
    assert.ok(!summary.includes('Deleted items'));
    assert.ok(summary.includes('Total: 10 ops in 3.0s'));
  });

  it('formats sub-second durations in milliseconds', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 1, succeeded: 1, durationMs: 150 },
      assign_folder: { count: 0, succeeded: 0, durationMs: 0 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 150,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Created folders: 1 in 150ms'));
    assert.ok(summary.includes('Total: 1 op in 150ms'));
  });

  it('handles all-failed scenario', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 3, succeeded: 0, durationMs: 900 },
      assign_folder: { count: 0, succeeded: 0, durationMs: 0 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 900,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 3);
    assert.ok(summary.includes('(3 failed)'));
    assert.ok(summary.includes('Total: 3 ops'));
    assert.ok(summary.includes('Created folders: 0/3'));
  });

  it('formats exactly 1000ms as seconds (boundary)', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 2, succeeded: 2, durationMs: 1000 },
      assign_folder: { count: 0, succeeded: 0, durationMs: 0 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 1000,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Created folders: 2 in 1.0s'));
    assert.ok(summary.includes('Total: 2 ops in 1.0s'));
    assert.ok(!summary.includes('1000ms'));
  });

  it('includes cache line when hits and misses are both non-zero', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 0, succeeded: 0, durationMs: 0 },
      assign_folder: { count: 5, succeeded: 5, durationMs: 2000 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 2000,
      cacheHits: 3,
      cacheMisses: 2,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Cache: 3 hits, 2 misses'));
  });

  it('includes cache line when only hits are non-zero', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 0, succeeded: 0, durationMs: 0 },
      assign_folder: { count: 2, succeeded: 2, durationMs: 500 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 500,
      cacheHits: 2,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Cache: 2 hits, 0 misses'));
  });

  it('includes cache line when only misses are non-zero', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 0, succeeded: 0, durationMs: 0 },
      assign_folder: { count: 1, succeeded: 1, durationMs: 300 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 300,
      cacheHits: 0,
      cacheMisses: 1,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(summary.includes('Cache: 0 hits, 1 misses'));
  });

  it('omits cache line when both hits and misses are zero', () => {
    const timings: ApplyTimings = {
      create_folder: { count: 1, succeeded: 1, durationMs: 200 },
      assign_folder: { count: 0, succeeded: 0, durationMs: 0 },
      delete_item: { count: 0, succeeded: 0, durationMs: 0 },
      totalDurationMs: 200,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const summary = formatApplySummary(timings, 0);
    assert.ok(!summary.includes('Cache:'));
  });
});

describe('onProgress → spinner.message composition', () => {
  it('formatProgressMessage output flows through spinner.message correctly', () => {
    const messages: string[] = [];
    const spinner = { message: (msg: string) => { messages.push(msg); } };

    const events: ApplyProgress[] = [
      { phase: 'create_folder', current: 1, phaseTotal: 2, overallCurrent: 1, overallTotal: 5, description: 'Banking', failedSoFar: 0 },
      { phase: 'assign_folder', current: 3, phaseTotal: 3, overallCurrent: 5, overallTotal: 5, description: 'Social', failedSoFar: 1 },
    ];

    for (const progress of events) {
      spinner.message(formatProgressMessage(progress));
    }

    assert.equal(messages.length, 2);
    assert.equal(messages[0], 'Creating folder 1/2 — Banking');
    assert.equal(messages[1], 'Assigning folder 3/3 — Social [1 failed]');
  });
});
