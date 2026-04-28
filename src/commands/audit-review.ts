import type { Logger } from '../adapters/logging.js';
import type { Finding } from '../lib/domain/finding.js';
import type { PendingOp } from '../lib/domain/pending.js';
import type { PromptAdapter } from '../ui/prompts.js';
import type { PromptStyle } from '../ui/prompts.js';
import { collectOpsFromFindings, interactiveReview, type RuleSaveRequest } from '../ui/review-loop.js';

export interface RunReviewOpts {
  skipCategories: readonly string[];
  limitPerCategory: number | null;
  logger?: Logger;
  prompt: PromptAdapter;
  promptStyle?: PromptStyle;
  maskChar: string;
  dryRun: boolean;
  enabledCategories: readonly string[];
  existingFoldersByName: ReadonlyMap<string, string>;
  folderNamesById?: ReadonlyMap<string, string>;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  isTTY?: () => boolean;
  onProgress?: (ops: readonly PendingOp[]) => void;
  onRuleSave?: (request: RuleSaveRequest) => Promise<void>;
}

export async function runReview(
  findings: readonly Finding[],
  opts: RunReviewOpts,
): Promise<{ ops: PendingOp[]; reviewed: number; skipped: number; cancelled: boolean }> {
  if (opts.dryRun) {
    return collectOpsFromFindings(findings, {
      skipCategories: opts.skipCategories,
      limitPerCategory: opts.limitPerCategory,
      logger: opts.logger,
    });
  }

  return interactiveReview(findings, {
    skipCategories: opts.skipCategories,
    limitPerCategory: opts.limitPerCategory,
    logger: opts.logger,
    prompt: opts.prompt,
    promptStyle: opts.promptStyle,
    maskChar: opts.maskChar,
    enabledCategories: opts.enabledCategories,
    existingFoldersByName: opts.existingFoldersByName,
    folderNamesById: opts.folderNamesById,
    stdin: opts.stdin,
    stdout: opts.stdout,
    isTTY: opts.isTTY,
    onProgress: opts.onProgress,
    onRuleSave: opts.onRuleSave,
  });
}
