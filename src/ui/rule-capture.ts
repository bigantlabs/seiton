import type { MatchReason } from '../lib/domain/finding.js';
import type { BwItem } from '../lib/domain/types.js';
import type { PromptAdapter } from './prompts.js';
import type { RuleSaveRequest } from './review-loop.js';

export function formatMatchReason(reason: MatchReason): string {
  const source = reason.ruleSource === 'custom' ? 'custom rule' : 'keyword';
  return `matched ${source}: ${reason.matchedKeyword}`;
}

export function extractRuleKeyword(item: BwItem): string {
  const uri = item.login?.uris?.[0]?.uri;
  if (uri && URL.canParse(uri)) {
    const hostname = new URL(uri).hostname.toLowerCase();
    const cleaned = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    if (cleaned) return cleaned;
  }
  const name = item.name.trim().toLowerCase();
  if (!name) return '';
  return name;
}

export async function offerRuleCapture(
  item: BwItem,
  chosenFolder: string,
  prompt: PromptAdapter,
  onRuleSave: (request: RuleSaveRequest) => Promise<void>,
): Promise<'suppressed' | 'saved' | 'declined'> {
  const keyword = extractRuleKeyword(item);
  if (!keyword) return 'declined';
  const answer = await prompt.select<'yes' | 'no' | 'never'>(
    `Save rule so items matching "${keyword}" go to "${chosenFolder}" next time?`,
    [
      { value: 'yes', label: 'Yes', hint: `adds custom rule: ${keyword} → ${chosenFolder}` },
      { value: 'no', label: 'No' },
      { value: 'never', label: "Don't ask again this session" },
    ],
  );

  if (answer === null || answer === 'never') return 'suppressed';
  if (answer === 'yes') {
    await onRuleSave({ folder: chosenFolder, keyword });
    return 'saved';
  }
  return 'declined';
}
