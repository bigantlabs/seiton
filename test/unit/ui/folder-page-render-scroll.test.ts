import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPageState,
  moveCursor,
  setDecision,
} from '../../../src/ui/folder-page-model.js';
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

describe('renderPage with scrolled state', () => {
  it('shows correct position indicator when scrollOffset > 0', () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}`, name: `Item ${i}` }) }),
    );
    let state = createPageState(findings, 5);
    // Move cursor to position 7, which should scroll
    for (let i = 0; i < 7; i++) {
      state = moveCursor(state, 1);
    }
    const output = renderPage(state);
    // scrollOffset should be 3 (cursor=7, pageSize=5, offset=7-5+1=3)
    assert.ok(output.includes('Showing 4-8 of 20'));
  });

  it('renders only the visible window entries when scrolled', () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}`, name: `UniqueEntry${i}` }) }),
    );
    let state = createPageState(findings, 3);
    // Move to position 5
    for (let i = 0; i < 5; i++) {
      state = moveCursor(state, 1);
    }
    const output = renderPage(state);
    // scrollOffset=3, visible: entries 3,4,5
    assert.ok(output.includes('UniqueEntry3'));
    assert.ok(output.includes('UniqueEntry4'));
    assert.ok(output.includes('UniqueEntry5'));
    // entries 0,1,2 should not appear
    assert.ok(!output.includes('UniqueEntry0'));
    assert.ok(!output.includes('UniqueEntry1'));
    assert.ok(!output.includes('UniqueEntry2'));
    // entries 6+ should not appear
    assert.ok(!output.includes('UniqueEntry6'));
  });

  it('shows position indicator at last page', () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}`, name: `Item ${i}` }) }),
    );
    let state = createPageState(findings, 5);
    // Move to last item (index 11)
    for (let i = 0; i < 11; i++) {
      state = moveCursor(state, 1);
    }
    const output = renderPage(state);
    // scrollOffset=7 (cursor=11, offset=11-5+1=7), showing 8-12 of 12
    assert.ok(output.includes('Showing 8-12 of 12'));
  });

  it('does not show position indicator when all entries fit even if scrollOffset is manually set', () => {
    const findings = Array.from({ length: 3 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}` }) }),
    );
    const state = createPageState(findings, 10);
    const output = renderPage(state);
    assert.ok(!output.includes('Showing'));
  });

  it('renders cursor indicator on correct row when scrolled', () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}`, name: `Entry${i}` }) }),
    );
    let state = createPageState(findings, 4);
    // Move to position 5 (scrollOffset becomes 2)
    for (let i = 0; i < 5; i++) {
      state = moveCursor(state, 1);
    }
    const output = renderPage(state);
    const lines = output.split('\n');
    // The cursor row should contain the inverse escape and the item at position 5
    const cursorLine = lines.find(l => l.includes('\x1b[7m') && l.includes('Entry5'));
    assert.ok(cursorLine, 'cursor indicator should be on Entry5 row');
  });

  it('shows decisions correctly on scrolled entries', () => {
    const findings = Array.from({ length: 8 }, (_, i) =>
      makeFolderFinding({ item: makeItem({ id: `item-${i}`, name: `Item${i}` }) }),
    );
    let state = createPageState(findings, 4);
    // Accept first item
    state = setDecision(state, 'accept');
    // Move to position 5 and mark as delete
    for (let i = 0; i < 5; i++) {
      state = moveCursor(state, 1);
    }
    state = setDecision(state, 'delete');
    const output = renderPage(state);
    // Entry at position 5 should show [x] badge
    assert.ok(output.includes('[x]'));
    // Entry at position 0 is scrolled out (scrollOffset=2), should not be visible
    assert.ok(!output.includes('Item0'));
  });
});
