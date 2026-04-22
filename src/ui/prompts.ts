import * as clack from '@clack/prompts';
import { createInterface } from 'node:readline';
import { isShuttingDown } from '../core/signals.js';

export type PromptStyle = 'clack' | 'plain';

export interface SelectOption<T> {
  value: T;
  label: string;
  hint?: string;
}

export interface PromptAdapter {
  intro(title: string): void;
  outro(message: string): void;
  cancelled(message?: string): void;
  select<T>(message: string, options: SelectOption<T>[]): Promise<T | null>;
  confirm(message: string, initial?: boolean): Promise<boolean | null>;
  multiselect<T>(message: string, options: SelectOption<T>[], required?: boolean): Promise<T[] | null>;
  text(message: string, placeholder?: string): Promise<string | null>;
  startSpinner(message: string): SpinnerHandle;
  logInfo(message: string): void;
  logSuccess(message: string): void;
  logWarning(message: string): void;
  logError(message: string): void;
  logStep(message: string): void;
}

export interface SpinnerHandle {
  message(msg: string): void;
  stop(msg?: string): void;
  error(msg?: string): void;
}

export function createPromptAdapter(style: PromptStyle): PromptAdapter {
  if (style === 'plain') {
    return createPlainAdapter();
  }
  return createClackAdapter();
}

function createClackAdapter(): PromptAdapter {
  return {
    intro(title: string): void {
      clack.intro(title);
    },

    outro(message: string): void {
      clack.outro(message);
    },

    cancelled(message?: string): void {
      clack.cancel(message ?? 'Operation cancelled.');
    },

    async select<T>(message: string, options: SelectOption<T>[]): Promise<T | null> {
      if (isShuttingDown()) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await clack.select({ message, options: options as any });
      if (clack.isCancel(result)) return null;
      return result as T;
    },

    async confirm(message: string, initial?: boolean): Promise<boolean | null> {
      if (isShuttingDown()) return null;
      const result = await clack.confirm({ message, initialValue: initial });
      if (clack.isCancel(result)) return null;
      return result;
    },

    async multiselect<T>(message: string, options: SelectOption<T>[], required?: boolean): Promise<T[] | null> {
      if (isShuttingDown()) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await clack.multiselect({ message, options: options as any, required });
      if (clack.isCancel(result)) return null;
      return result as T[];
    },

    async text(message: string, placeholder?: string): Promise<string | null> {
      if (isShuttingDown()) return null;
      const result = await clack.text({ message, placeholder });
      if (clack.isCancel(result)) return null;
      return result;
    },

    startSpinner(message: string): SpinnerHandle {
      const s = clack.spinner();
      s.start(message);
      return {
        message(msg: string) { s.message(msg); },
        stop(msg?: string) { s.stop(msg); },
        error(msg?: string) { s.error(msg); },
      };
    },

    logInfo(message: string): void { clack.log.info(message); },
    logSuccess(message: string): void { clack.log.success(message); },
    logWarning(message: string): void { clack.log.warn(message); },
    logError(message: string): void { clack.log.error(message); },
    logStep(message: string): void { clack.log.step(message); },
  };
}

function createPlainAdapter(): PromptAdapter {
  return {
    intro(title: string): void {
      process.stdout.write(`\n${title}\n${'─'.repeat(title.length)}\n\n`);
    },

    outro(message: string): void {
      process.stdout.write(`\n${message}\n`);
    },

    cancelled(message?: string): void {
      process.stderr.write(`${message ?? 'Operation cancelled.'}\n`);
    },

    async select<T>(message: string, options: SelectOption<T>[]): Promise<T | null> {
      if (isShuttingDown()) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const lines = options.map((o, i) => `  ${i + 1}) ${o.label}${o.hint ? ` (${o.hint})` : ''}`);
        process.stdout.write(`${message}\n${lines.join('\n')}\n`);
        while (true) {
          const answer = await new Promise<string>((resolve, reject) => {
            const onClose = () => reject(new Error('cancelled'));
            rl.once('close', onClose);
            rl.question('> ', (ans) => {
              rl.removeListener('close', onClose);
              resolve(ans);
            });
          });
          const idx = parseInt(answer, 10) - 1;
          if (idx >= 0 && idx < options.length) return options[idx]!.value;
          process.stderr.write(`[warn] Invalid selection. Enter a number between 1 and ${options.length}.\n`);
        }
      } catch { return null; }
      finally { rl.close(); }
    },

    async confirm(message: string, initial?: boolean): Promise<boolean | null> {
      if (isShuttingDown()) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const defaultHint = initial === false ? '[y/N]' : '[Y/n]';
      try {
        const answer = await new Promise<string>((resolve, reject) => {
          rl.question(`${message} ${defaultHint} `, resolve);
          rl.once('close', () => reject(new Error('cancelled')));
        });
        if (answer === '') return initial ?? true;
        return answer.toLowerCase().startsWith('y');
      } catch { return null; }
      finally { rl.close(); }
    },

    async multiselect<T>(message: string, options: SelectOption<T>[]): Promise<T[] | null> {
      if (isShuttingDown()) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const lines = options.map((o, i) => `  ${i + 1}) ${o.label}`);
        const prompt = `${message} (comma-separated numbers)\n${lines.join('\n')}\n> `;
        const answer = await new Promise<string>((resolve, reject) => {
          rl.question(prompt, resolve);
          rl.once('close', () => reject(new Error('cancelled')));
        });
        const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
        const results: T[] = [];
        for (const idx of indices) {
          if (idx >= 0 && idx < options.length) results.push(options[idx]!.value);
        }
        return results;
      } catch { return null; }
      finally { rl.close(); }
    },

    async text(message: string, placeholder?: string): Promise<string | null> {
      if (isShuttingDown()) return null;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const hint = placeholder ? ` (${placeholder})` : '';
      try {
        const answer = await new Promise<string>((resolve, reject) => {
          rl.question(`${message}${hint}: `, resolve);
          rl.once('close', () => reject(new Error('cancelled')));
        });
        return answer;
      } catch { return null; }
      finally { rl.close(); }
    },

    startSpinner(message: string): SpinnerHandle {
      process.stderr.write(`[...] ${message}\n`);
      return {
        message(msg: string) { process.stderr.write(`[...] ${msg}\n`); },
        stop(msg?: string) { if (msg) process.stderr.write(`[done] ${msg}\n`); },
        error(msg?: string) { if (msg) process.stderr.write(`[error] ${msg}\n`); },
      };
    },

    logInfo(message: string): void { process.stderr.write(`[info] ${message}\n`); },
    logSuccess(message: string): void { process.stderr.write(`[ok] ${message}\n`); },
    logWarning(message: string): void { process.stderr.write(`[warn] ${message}\n`); },
    logError(message: string): void { process.stderr.write(`[error] ${message}\n`); },
    logStep(message: string): void { process.stderr.write(`[step] ${message}\n`); },
  };
}
