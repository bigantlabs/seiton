import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { ExitCode } from '../src/exit-codes.js';
import { VERSION } from '../src/version.js';

const ROOT = join(import.meta.dirname, '..');

const EXIT_CODE_DESCRIPTIONS: Record<number, string> = {
  [ExitCode.SUCCESS]: 'Command completed successfully.',
  [ExitCode.GENERAL_ERROR]: 'General error (apply failures, fetch failures).',
  [ExitCode.INTERNAL_ERROR]: 'Internal/unexpected error.',
  [ExitCode.MALFORMED_BW_OUTPUT]: 'Failed to parse bw CLI output.',
  [ExitCode.USAGE]: 'Invalid arguments, unknown command, or non-interactive terminal.',
  [ExitCode.UNAVAILABLE]: 'bw CLI not available on PATH.',
  [ExitCode.CANT_CREATE]: 'Cannot create file or directory.',
  [ExitCode.NO_PERMISSION]: 'Vault locked or BW_SESSION not set.',
  [ExitCode.USER_INTERRUPT]: 'User interrupt (SIGINT). Pending ops saved if enabled.',
};

function getLastCommitDate(): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs'], { encoding: 'utf-8' }).trim();
  } catch {
    return '1970-01-01';
  }
}

function buildManPage(): string {
  const date = getLastCommitDate();
  const sections: string[] = [];

  sections.push(`.TH SEITON 1 "${date}" "seiton ${VERSION}" "User Commands"`);

  sections.push(`.SH NAME
seiton \\- interactive Bitwarden vault auditor`);

  sections.push(`.SH SYNOPSIS
.B seiton
[\\fIcommand\\fR] [\\fIflags\\fR]`);

  sections.push(`.SH DESCRIPTION
.B seiton
detects duplicates, weak and reused passwords, missing fields, and
disorganized folders in a Bitwarden vault, then walks the user through
each finding for interactive review. Plaintext never leaves the local
machine. All vault mutations flow through the
.B bw
CLI with per\\-item confirmation.`);

  sections.push(buildCommandsSection());
  sections.push(buildOptionsSection());
  sections.push(buildExitStatusSection());
  sections.push(buildEnvironmentSection());
  sections.push(buildFilesSection());
  sections.push(buildSeeAlsoSection());

  return sections.join('\n.\n') + '\n';
}

function buildCommandsSection(): string {
  const cmds = [
    ['audit', 'Fetch, analyze, review findings, apply approved changes (default).'],
    ['resume', 'Resume a previously interrupted audit session.'],
    ['discard', 'Delete the saved pending\\-ops queue.'],
    ['report', 'Read\\-only analysis. Supports \\fB\\-\\-json\\fR output.'],
    ['doctor', 'Preflight checks for bw, session, and config.'],
    ['config show', 'Display the full resolved configuration.'],
    ['config get \\fIkey\\fR', 'Get a specific configuration value.'],
    ['config set \\fIkey\\fR \\fIvalue\\fR', 'Set a configuration value.'],
    ['config path', 'Print the active config file path.'],
    ['config edit', 'Open the config file in $VISUAL/$EDITOR.'],
    ['config reset', 'Reset config to defaults.'],
  ];
  const lines = ['.SH COMMANDS'];
  for (const [name, desc] of cmds) {
    lines.push(`.TP\n.B ${name}\n${desc}`);
  }
  return lines.join('\n');
}

function buildOptionsSection(): string {
  const opts = [
    ['\\-\\-config \\fIpath\\fR', 'Override the config file location.'],
    ['\\-\\-dry\\-run', 'Print planned actions without performing them.'],
    ['\\-\\-json', 'Output findings in JSON format (report only).'],
    ['\\-\\-no\\-color', 'Disable ANSI color output.'],
    ['\\-\\-verbose, \\-v', 'Increase log detail (\\-vv for trace).'],
    ['\\-\\-quiet, \\-q', 'Suppress non\\-essential output.'],
    ['\\-\\-skip \\fIcategory\\fR', 'Skip a finding category (repeatable).'],
    ['\\-\\-limit \\fIn\\fR', 'Stop after n findings per category.'],
    ['\\-\\-help, \\-h', 'Print help and exit.'],
    ['\\-\\-version, \\-V', 'Print version and exit.'],
  ];
  const lines = ['.SH OPTIONS'];
  for (const [flag, desc] of opts) {
    lines.push(`.TP\n.B ${flag}\n${desc}`);
  }
  return lines.join('\n');
}

function buildExitStatusSection(): string {
  const lines = ['.SH EXIT STATUS'];
  const entries = Object.entries(ExitCode) as [string, number][];
  for (const [key, code] of entries) {
    const desc = EXIT_CODE_DESCRIPTIONS[code] ?? `${key}.`;
    lines.push(`.TP\n.B ${code}\n${desc}`);
  }
  return lines.join('\n');
}

function buildEnvironmentSection(): string {
  const vars = [
    ['BW_SESSION', 'Bitwarden session token. Required for audit, resume, and report.'],
    ['SEITON_CONFIG', 'Alternate config file path.'],
    ['SEITON_VERBOSE', 'Set to 1 or 2 for verbose/trace output.'],
    ['NO_COLOR', 'Disable ANSI color output when set to any value.'],
    ['CI', 'Simulates CI behavior (plain output, quiet by default).'],
    ['VISUAL', 'Editor used by config edit (takes precedence over EDITOR).'],
    ['EDITOR', 'Fallback editor used by config edit.'],
  ];
  const lines = ['.SH ENVIRONMENT'];
  for (const [name, desc] of vars) {
    lines.push(`.TP\n.B ${name}\n${desc}`);
  }
  return lines.join('\n');
}

function buildFilesSection(): string {
  return `.SH FILES
.TP
.I $XDG_CONFIG_HOME/seiton/config.json
User configuration file (mode 0600).
.TP
.I $XDG_STATE_HOME/seiton/pending.json
Pending operations queue (mode 0600). Created on SIGINT during audit.
.TP
.I $HOME/.config/seiton/config.json
Fallback config location when XDG_CONFIG_HOME is not set.
.TP
.I $HOME/.seitonrc.json
Legacy config file location (lowest priority).`;
}

function buildSeeAlsoSection(): string {
  return `.SH SEE ALSO
.BR bw (1)
.PP
Project homepage: https://github.com/AntPerez69367/seiton`;
}

function writeArtifact(relPath: string, content: string): void {
  const absPath = join(ROOT, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf-8');
}

const manPage = buildManPage();
writeArtifact('man/seiton.1', manPage);
console.log('  man/seiton.1');
console.log('gen-man: done');
