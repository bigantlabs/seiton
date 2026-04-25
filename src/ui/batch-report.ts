import type { Finding, FindingCategory } from '../lib/domain/finding.js';
import type { PromptAdapter } from './prompts.js';
import { itemLabel } from './item-label.js';
import { maskPassword } from './mask.js';

interface CategoryView {
  key: FindingCategory;
  label: string;
  render: () => void;
}

export async function renderBatchReport(
  findings: readonly Finding[],
  prompt: PromptAdapter,
  maskChar: string,
): Promise<void> {
  if (findings.length === 0) return;

  const categories = buildCategoryViews(findings, prompt, maskChar);
  if (categories.length === 0) return;

  const noun = categories.length === 1 ? 'category' : 'categories';
  prompt.logStep(`── Informational Findings (${findings.length} across ${categories.length} ${noun}) ──`);

  if (categories.length === 1) {
    categories[0]!.render();
    prompt.logInfo(`${findings.length} informational finding(s) — no action required.`);
    return;
  }

  const viewed = new Set<FindingCategory>();

  while (true) {
    const options = [
      ...categories.map(c => ({
        value: c.key as FindingCategory | 'done',
        label: c.label,
        hint: viewed.has(c.key) ? 'viewed' : undefined,
      })),
      { value: 'done' as FindingCategory | 'done', label: 'Continue', hint: 'dismiss' },
    ];

    const choice = await prompt.select<FindingCategory | 'done'>(
      'View findings by category:',
      options,
    );

    if (choice === null || choice === 'done') break;

    const cat = categories.find(c => c.key === choice);
    if (cat) {
      cat.render();
      viewed.add(choice);
    }
  }

  prompt.logInfo(`${findings.length} informational finding(s) — no action required.`);
}

function buildCategoryViews(
  findings: readonly Finding[],
  prompt: PromptAdapter,
  maskChar: string,
): CategoryView[] {
  const weak = findings.filter(f => f.category === 'weak');
  const reuse = findings.filter(f => f.category === 'reuse');
  const missing = findings.filter(f => f.category === 'missing');

  const views: CategoryView[] = [];
  if (weak.length > 0) views.push({
    key: 'weak',
    label: `Weak Passwords (${weak.length})`,
    render: () => renderWeakSection(weak, prompt, maskChar),
  });
  if (reuse.length > 0) views.push({
    key: 'reuse',
    label: `Reused Passwords (${reuse.length} group(s))`,
    render: () => renderReuseSection(reuse, prompt),
  });
  if (missing.length > 0) views.push({
    key: 'missing',
    label: `Missing Fields (${missing.length})`,
    render: () => renderMissingSection(missing, prompt),
  });
  return views;
}

function renderWeakSection(
  findings: readonly Extract<Finding, { category: 'weak' }>[],
  prompt: PromptAdapter,
  maskChar: string,
): void {
  prompt.logWarning(`Weak Passwords (${findings.length}):`);
  for (const f of findings) {
    const masked = f.item.login?.password
      ? maskPassword(f.item.login.password, maskChar)
      : '(empty)';
    prompt.logInfo(`  ${itemLabel(f.item)} — Score: ${f.score}/4 | ${masked} | ${f.reasons.join(', ')}`);
  }
}

function renderReuseSection(
  findings: readonly Extract<Finding, { category: 'reuse' }>[],
  prompt: PromptAdapter,
): void {
  prompt.logWarning(`Reused Passwords (${findings.length} group(s)):`);
  for (const f of findings) {
    const names = f.items.map(i => itemLabel(i)).join(', ');
    prompt.logInfo(`  ${f.items.length} items share the same password: ${names}`);
  }
}

function renderMissingSection(
  findings: readonly Extract<Finding, { category: 'missing' }>[],
  prompt: PromptAdapter,
): void {
  prompt.logWarning(`Missing Fields (${findings.length}):`);
  for (const f of findings) {
    prompt.logInfo(`  ${itemLabel(f.item)} — Missing: ${f.missingFields.join(', ')}`);
  }
}
