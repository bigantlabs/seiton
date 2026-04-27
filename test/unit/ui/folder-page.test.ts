import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPageState,
  moveCursor,
  setDecision,
  setOverride,
  allDecided,
  visibleWindow,
} from '../../../src/ui/folder-page-model.js';
import { pageStateToOps, buildFolderOps } from '../../../src/ui/folder-page-ops.js';
import { renderPage } from '../../../src/ui/folder-page-render.js';
import { makeItem } from '../../helpers/make-item.js';
import type { FolderFinding } from '../../../src/lib/domain/finding.js';

function makeFolderFinding(overrides: Partial<FolderFinding> = {}): FolderFinding {
  return {
    category: 'folders',
    item: makeItem(),
    suggestedFolder: 'Banking',
    existingFolderId: null,
    matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' },
    ...overrides,
  };
}

describe('createPageState', () => {
  it('creates state with correct initial values', () => {
    const findings = [makeFolderFinding(), makeFolderFinding()];
    const state = createPageState(findings);
    assert.equal(state.entries.length, 2);
    assert.equal(state.cursor, 0);
    assert.equal(state.scrollOffset, 0);
    assert.equal(state.pageSize, 15);
  });

  it('uses default pageSize of 15', () => {
    const state = createPageState([makeFolderFinding()]);
    assert.equal(state.pageSize, 15);
  });

  it('accepts custom pageSize', () => {
    const state = createPageState([makeFolderFinding()], 5);
    assert.equal(state.pageSize, 5);
  });

  it('sets all decisions to pending', () => {
    const findings = [makeFolderFinding(), makeFolderFinding(), makeFolderFinding()];
    const state = createPageState(findings);
    for (const entry of state.entries) {
      assert.equal(entry.decision, 'pending');
    }
  });
});

describe('moveCursor', () => {
  it('moves cursor down by delta', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding(), makeFolderFinding()]);
    const next = moveCursor(state, 1);
    assert.equal(next.cursor, 1);
  });

  it('clamps cursor at 0 when moving up from start', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    const next = moveCursor(state, -1);
    assert.equal(next.cursor, 0);
  });

  it('clamps cursor at last index when moving past end', () => {
    const findings = [makeFolderFinding(), makeFolderFinding(), makeFolderFinding()];
    const state = createPageState(findings);
    const next = moveCursor(state, 10);
    assert.equal(next.cursor, 2);
  });

  it('adjusts scrollOffset when cursor passes bottom edge', () => {
    const findings = Array.from({ length: 20 }, () => makeFolderFinding());
    const state = createPageState(findings, 5);
    let current = state;
    for (let i = 0; i < 6; i++) {
      current = moveCursor(current, 1);
    }
    assert.equal(current.cursor, 6);
    assert.equal(current.scrollOffset, 2);
  });

  it('adjusts scrollOffset when cursor passes top edge', () => {
    const findings = Array.from({ length: 20 }, () => makeFolderFinding());
    let state = createPageState(findings, 5);
    state = { ...state, cursor: 10, scrollOffset: 8 };
    const next = moveCursor(state, -5);
    assert.equal(next.cursor, 5);
    assert.equal(next.scrollOffset, 5);
  });
});

describe('setDecision', () => {
  it('sets decision on current cursor entry', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    const next = setDecision(state, 'accept');
    assert.equal(next.entries[0]!.decision, 'accept');
    assert.equal(next.entries[1]!.decision, 'pending');
  });

  it('preserves other entries decisions', () => {
    let state = createPageState([makeFolderFinding(), makeFolderFinding(), makeFolderFinding()]);
    state = setDecision(state, 'accept');
    state = moveCursor(state, 1);
    state = setDecision(state, 'skip');
    assert.equal(state.entries[0]!.decision, 'accept');
    assert.equal(state.entries[1]!.decision, 'skip');
    assert.equal(state.entries[2]!.decision, 'pending');
  });

  it('sets delete decision', () => {
    const state = createPageState([makeFolderFinding()]);
    const next = setDecision(state, 'delete');
    assert.equal(next.entries[0]!.decision, 'delete');
  });
});

describe('allDecided', () => {
  it('returns false when any entry is pending', () => {
    let state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    state = setDecision(state, 'accept');
    assert.equal(allDecided(state), false);
  });

  it('returns true when all entries are non-pending', () => {
    let state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    state = setDecision(state, 'accept');
    state = moveCursor(state, 1);
    state = setDecision(state, 'skip');
    assert.equal(allDecided(state), true);
  });

  it('returns true for empty entries', () => {
    const state = createPageState([]);
    assert.equal(allDecided(state), true);
  });
});

describe('visibleWindow', () => {
  it('returns all entries when count is less than pageSize', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()], 5);
    const win = visibleWindow(state);
    assert.equal(win.entries.length, 2);
    assert.equal(win.startIndex, 0);
    assert.equal(win.endIndex, 2);
  });

  it('returns pageSize entries when more entries exist', () => {
    const findings = Array.from({ length: 20 }, () => makeFolderFinding());
    const state = createPageState(findings, 5);
    const win = visibleWindow(state);
    assert.equal(win.entries.length, 5);
    assert.equal(win.startIndex, 0);
    assert.equal(win.endIndex, 5);
  });

  it('respects scrollOffset', () => {
    const findings = Array.from({ length: 20 }, () => makeFolderFinding());
    let state = createPageState(findings, 5);
    state = { ...state, scrollOffset: 10 };
    const win = visibleWindow(state);
    assert.equal(win.startIndex, 10);
    assert.equal(win.endIndex, 15);
  });

  it('clamps endIndex to entries length', () => {
    const findings = Array.from({ length: 8 }, () => makeFolderFinding());
    let state = createPageState(findings, 5);
    state = { ...state, scrollOffset: 5 };
    const win = visibleWindow(state);
    assert.equal(win.startIndex, 5);
    assert.equal(win.endIndex, 8);
    assert.equal(win.entries.length, 3);
  });
});

describe('pageStateToOps', () => {
  it('produces create_folder + assign_folder for accepted entries', () => {
    let state = createPageState([makeFolderFinding({ item: makeItem({ id: 'item-1' }) })]);
    state = setDecision(state, 'accept');
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops.length, 2);
    assert.equal(ops[0]!.kind, 'create_folder');
    assert.equal(ops[1]!.kind, 'assign_folder');
  });

  it('produces delete_item for deleted entries', () => {
    let state = createPageState([makeFolderFinding({ item: makeItem({ id: 'del-1' }) })]);
    state = setDecision(state, 'delete');
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'delete_item');
    if (ops[0]!.kind === 'delete_item') {
      assert.equal(ops[0]!.itemId, 'del-1');
    }
  });

  it('produces nothing for skipped entries', () => {
    let state = createPageState([makeFolderFinding()]);
    state = setDecision(state, 'skip');
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops.length, 0);
  });

  it('produces nothing for pending entries', () => {
    const state = createPageState([makeFolderFinding()]);
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops.length, 0);
  });

  it('deduplicates create_folder across entries with same folder', () => {
    const findings = [
      makeFolderFinding({ item: makeItem({ id: '1' }), suggestedFolder: 'Banking' }),
      makeFolderFinding({ item: makeItem({ id: '2' }), suggestedFolder: 'Banking' }),
    ];
    let state = createPageState(findings);
    state = setDecision(state, 'accept');
    state = moveCursor(state, 1);
    state = setDecision(state, 'accept');
    const ops = pageStateToOps(state, new Map());
    const creates = ops.filter(o => o.kind === 'create_folder');
    const assigns = ops.filter(o => o.kind === 'assign_folder');
    assert.equal(creates.length, 1);
    assert.equal(assigns.length, 2);
  });

  it('uses existingFoldersByName to avoid create_folder', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: null,
    });
    let state = createPageState([finding]);
    state = setDecision(state, 'accept');
    const existingFolders = new Map([['banking', 'folder-id-123']]);
    const ops = pageStateToOps(state, existingFolders);
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'assign_folder');
    if (ops[0]!.kind === 'assign_folder') {
      assert.equal(ops[0]!.folderId, 'folder-id-123');
    }
  });

  it('uses existingFolderId from finding when available', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: 'existing-folder',
    });
    let state = createPageState([finding]);
    state = setDecision(state, 'accept');
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'assign_folder');
    if (ops[0]!.kind === 'assign_folder') {
      assert.equal(ops[0]!.folderId, 'existing-folder');
    }
  });
});

describe('buildFolderOps', () => {
  it('creates folder when not existing and not yet needed', () => {
    const foldersNeeded = new Set<string>();
    const ops = buildFolderOps('item-1', 'Banking', null, foldersNeeded);
    assert.equal(ops.length, 2);
    assert.equal(ops[0]!.kind, 'create_folder');
    assert.equal(ops[1]!.kind, 'assign_folder');
    assert.ok(foldersNeeded.has('banking'));
  });

  it('skips create when folder already needed', () => {
    const foldersNeeded = new Set(['banking']);
    const ops = buildFolderOps('item-1', 'Banking', null, foldersNeeded);
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'assign_folder');
  });

  it('skips create when existingFolderId provided', () => {
    const foldersNeeded = new Set<string>();
    const ops = buildFolderOps('item-1', 'Banking', 'folder-abc', foldersNeeded);
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'assign_folder');
    if (ops[0]!.kind === 'assign_folder') {
      assert.equal(ops[0]!.folderId, 'folder-abc');
    }
  });
});

describe('setOverride', () => {
  it('sets overrideFolder on specified entry and marks as accept', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    const next = setOverride(state, 1, 'Email');
    assert.equal(next.entries[1]!.overrideFolder, 'Email');
    assert.equal(next.entries[1]!.decision, 'accept');
  });

  it('preserves other entries unchanged', () => {
    let state = createPageState([makeFolderFinding(), makeFolderFinding(), makeFolderFinding()]);
    state = setDecision(state, 'skip');
    const next = setOverride(state, 2, 'Shopping');
    assert.equal(next.entries[0]!.decision, 'skip');
    assert.equal(next.entries[0]!.overrideFolder, undefined);
    assert.equal(next.entries[1]!.decision, 'pending');
    assert.equal(next.entries[2]!.overrideFolder, 'Shopping');
    assert.equal(next.entries[2]!.decision, 'accept');
  });

  it('preserves cursor and scrollOffset', () => {
    let state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    state = moveCursor(state, 1);
    const next = setOverride(state, 0, 'Email');
    assert.equal(next.cursor, 1);
    assert.equal(next.scrollOffset, 0);
  });
});

describe('pageStateToOps with overrides', () => {
  it('uses overrideFolder instead of suggestedFolder', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: null,
    });
    const state = createPageState([finding]);
    const next = setOverride(state, 0, 'Email');
    const ops = pageStateToOps(next, new Map());
    assert.equal(ops.length, 2);
    assert.equal(ops[0]!.kind, 'create_folder');
    if (ops[0]!.kind === 'create_folder') {
      assert.equal(ops[0]!.folderName, 'Email');
    }
    assert.equal(ops[1]!.kind, 'assign_folder');
    if (ops[1]!.kind === 'assign_folder') {
      assert.equal(ops[1]!.folderName, 'Email');
    }
  });

  it('uses existing folder id for override folder when available', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: 'bank-folder-id',
    });
    const state = createPageState([finding]);
    const next = setOverride(state, 0, 'Email');
    const existingFolders = new Map([['email', 'email-folder-id']]);
    const ops = pageStateToOps(next, existingFolders);
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.kind, 'assign_folder');
    if (ops[0]!.kind === 'assign_folder') {
      assert.equal(ops[0]!.folderId, 'email-folder-id');
      assert.equal(ops[0]!.folderName, 'Email');
    }
  });

  it('creates folder when override folder does not exist', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: 'bank-folder-id',
    });
    const state = createPageState([finding]);
    const next = setOverride(state, 0, 'NewFolder');
    const ops = pageStateToOps(next, new Map());
    assert.equal(ops.length, 2);
    assert.equal(ops[0]!.kind, 'create_folder');
    if (ops[0]!.kind === 'create_folder') {
      assert.equal(ops[0]!.folderName, 'NewFolder');
    }
  });

  it('deduplicates create_folder when multiple entries override to same folder', () => {
    const findings = [
      makeFolderFinding({ item: makeItem({ id: '1' }), suggestedFolder: 'Banking' }),
      makeFolderFinding({ item: makeItem({ id: '2' }), suggestedFolder: 'Shopping' }),
    ];
    let state = createPageState(findings);
    state = setOverride(state, 0, 'Email');
    state = setOverride(state, 1, 'Email');
    const ops = pageStateToOps(state, new Map());
    const creates = ops.filter(o => o.kind === 'create_folder');
    const assigns = ops.filter(o => o.kind === 'assign_folder');
    assert.equal(creates.length, 1);
    assert.equal(assigns.length, 2);
  });

  it('falls back to suggestedFolder when no override is set', () => {
    const finding = makeFolderFinding({
      item: makeItem({ id: 'item-1' }),
      suggestedFolder: 'Banking',
      existingFolderId: null,
    });
    let state = createPageState([finding]);
    state = setDecision(state, 'accept');
    const ops = pageStateToOps(state, new Map());
    assert.equal(ops[1]!.kind, 'assign_folder');
    if (ops[1]!.kind === 'assign_folder') {
      assert.equal(ops[1]!.folderName, 'Banking');
    }
  });
});

describe('renderPage', () => {
  it('includes header with item count', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()]);
    const output = renderPage(state);
    assert.ok(output.includes('2 items'));
  });

  it('includes status bar with key bindings', () => {
    const state = createPageState([makeFolderFinding()]);
    const output = renderPage(state);
    assert.ok(output.includes('accept'));
    assert.ok(output.includes('skip'));
    assert.ok(output.includes('delete'));
    assert.ok(output.includes('submit'));
    assert.ok(output.includes('cancel'));
  });

  it('shows page position when entries exceed pageSize', () => {
    const findings = Array.from({ length: 20 }, () => makeFolderFinding());
    const state = createPageState(findings, 5);
    const output = renderPage(state);
    assert.ok(output.includes('Showing 1-5 of 20'));
  });

  it('does not show page position when entries fit in page', () => {
    const state = createPageState([makeFolderFinding(), makeFolderFinding()], 15);
    const output = renderPage(state);
    assert.ok(!output.includes('Showing'));
  });

  it('shows all-decided message when all entries are decided', () => {
    let state = createPageState([makeFolderFinding()]);
    state = setDecision(state, 'accept');
    const output = renderPage(state);
    assert.ok(output.includes('All entries reviewed'));
  });

  it('shows accept badge [v] for accepted entries', () => {
    let state = createPageState([makeFolderFinding()]);
    state = setDecision(state, 'accept');
    const output = renderPage(state);
    assert.ok(output.includes('[v]'));
  });

  it('shows skip badge [-] for skipped entries', () => {
    let state = createPageState([makeFolderFinding()]);
    state = setDecision(state, 'skip');
    const output = renderPage(state);
    assert.ok(output.includes('[-]'));
  });

  it('shows delete badge [x] for deleted entries', () => {
    let state = createPageState([makeFolderFinding()]);
    state = setDecision(state, 'delete');
    const output = renderPage(state);
    assert.ok(output.includes('[x]'));
  });

  it('shows pending badge [ ] for pending entries', () => {
    const state = createPageState([makeFolderFinding()]);
    const output = renderPage(state);
    assert.ok(output.includes('[ ]'));
  });
});
