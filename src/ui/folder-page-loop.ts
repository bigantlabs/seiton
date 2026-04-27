import * as readline from 'node:readline';
import type { FolderFinding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import type { PromptAdapter } from './prompts.js';
import {
  createPageState,
  moveCursor,
  setDecision,
  type FolderPageState,
} from './folder-page-model.js';
import { renderPage } from './folder-page-render.js';
import { pageStateToOps } from './folder-page-ops.js';

export type FolderPageResult =
  | { action: 'submit'; ops: PendingOp[]; deleteCount: number }
  | { action: 'cancel' }
  | { action: 'edit'; entryIndex: number; state: FolderPageState };

export async function runFolderPage(
  findings: readonly FolderFinding[],
  existingFoldersByName: ReadonlyMap<string, string>,
  prompt: PromptAdapter,
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  pageSize?: number,
  initialState?: FolderPageState,
): Promise<FolderPageResult> {
  let state = initialState ?? createPageState(findings, pageSize);
  let renderedLineCount = 0;

  const clearRendered = () => {
    if (renderedLineCount > 0) {
      stdout.write(`\x1b[${renderedLineCount}A\x1b[J`);
      renderedLineCount = 0;
    }
  };

  const render = () => {
    clearRendered();
    const output = renderPage(state);
    stdout.write(output + '\n');
    renderedLineCount = output.split('\n').length;
  };

  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  readline.emitKeypressEvents(stdin);

  try {
    render();
    const result = await keypressLoop(state, stdin, render, (s) => { state = s; });
    clearRendered();

    if (result.cancelled) {
      return { action: 'cancel' };
    }

    if (result.editIndex !== undefined) {
      return { action: 'edit', entryIndex: result.editIndex, state };
    }

    const deleteCount = state.entries.filter(e => e.decision === 'delete').length;

    if (deleteCount > 0) {
      const confirmed = await prompt.confirm(
        `${deleteCount} item(s) marked for deletion. This cannot be undone. Continue?`,
        false,
      );
      if (confirmed !== true) {
        return runFolderPage(findings, existingFoldersByName, prompt, stdin, stdout, pageSize);
      }
    }

    const ops = pageStateToOps(state, existingFoldersByName);
    return { action: 'submit', ops, deleteCount };
  } finally {
    stdin.setRawMode(wasRaw ?? false);
    stdin.pause();
  }
}

interface LoopResult {
  cancelled: boolean;
  editIndex?: number;
}

function keypressLoop(
  initialState: FolderPageState,
  stdin: NodeJS.ReadStream,
  render: () => void,
  setState: (s: FolderPageState) => void,
): Promise<LoopResult> {
  let state = initialState;

  return new Promise<LoopResult>((resolve) => {
    const handler = (_str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve({ cancelled: true });
        return;
      }

      if (key.name === 'return') {
        cleanup();
        resolve({ cancelled: false });
        return;
      }

      if (key.name === 'e') {
        cleanup();
        resolve({ cancelled: false, editIndex: state.cursor });
        return;
      }

      let next = state;

      if (key.name === 'up' || key.name === 'k') {
        next = moveCursor(next, -1);
      } else if (key.name === 'down' || key.name === 'j') {
        next = moveCursor(next, 1);
      } else if (key.name === 'a') {
        next = setDecision(next, 'accept');
      } else if (key.name === 's') {
        next = setDecision(next, 'skip');
      } else if (key.name === 'd') {
        next = setDecision(next, 'delete');
      }

      if (next !== state) {
        state = next;
        setState(state);
        render();
      }
    };

    const cleanup = () => {
      stdin.removeListener('keypress', handler);
    };

    stdin.on('keypress', handler);
  });
}
