import type { Finding } from '../lib/domain/finding.js';
import type { PromptAdapter } from './prompts.js';
import { itemLabel } from './review-loop.js';
import { maskPassword } from './mask.js';

export function renderBatchReport(
  findings: readonly Finding[],
  prompt: PromptAdapter,
  maskChar: string,
): void {
  if (findings.length === 0) return;

  prompt.logStep('── Informational Findings ──');

  const weak = findings.filter(f => f.category === 'weak');
  const reuse = findings.filter(f => f.category === 'reuse');
  const missing = findings.filter(f => f.category === 'missing');

  if (weak.length > 0) renderWeakSection(weak, prompt, maskChar);
  if (reuse.length > 0) renderReuseSection(reuse, prompt);
  if (missing.length > 0) renderMissingSection(missing, prompt);

  prompt.logInfo(`${findings.length} informational finding(s) shown above — no action required.`);
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
