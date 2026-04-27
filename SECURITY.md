# Security Policy

## Supported Versions

seiton is currently pre-1.0 (`0.x`). Only the latest released version receives
security patches. After 1.0, this policy will be revised to define a supported
set of major versions.

| Version             | Supported          |
| ------------------- | ------------------ |
| Latest `0.x`        | :white_check_mark: |
| Older `0.x`         | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub's Private Vulnerability Reporting][pvr] to submit a report. The
report routes directly to the maintainers and is not visible to the public.

[pvr]: https://github.com/bigantlabs/seiton/security/advisories/new

When reporting, please include:

- A description of the vulnerability and its security impact.
- Steps to reproduce, ideally with a minimal vault fixture or command.
- The seiton version (`seiton --version`).
- The Node.js version (`node --version`) and `bw` CLI version (`bw --version`).
- Operating system and version.

### What to expect

- Acknowledgment within **7 days** of receipt.
- A status update or follow-up questions within **21 days**.
- A target fix-and-disclosure window of **90 days** from the initial report.
  Extensions may be negotiated for complex issues.
- Credit in the release notes and the published advisory, if desired.

### Coordinated disclosure

seiton follows a coordinated-disclosure model. Please do not publicly disclose
the vulnerability until a fix has shipped and users have had a reasonable
window to update.

## Threat Model

seiton is an interactive command-line tool that audits Bitwarden vaults via
the `bw` CLI. The threat model assumes:

- A non-compromised local user account on Linux or macOS.
- A trusted `bw` binary, installed and authenticated by the user.
- A `BW_SESSION` environment variable supplied by the user. seiton never
  handles the master password.
- No network I/O initiated by seiton itself, beyond a delegated post-apply
  `bw sync` invocation.

### In scope

The following are security-relevant and should be reported:

- **Plaintext leakage** of passwords, TOTP seeds, note bodies, URLs with
  embedded credentials, or `BW_SESSION` in any log, error message, stack
  trace, temp file, exit-code output, or the pending-operations queue.
- **Subprocess injection**: any path by which user-controlled vault content
  (item names, URLs, notes, custom fields) reaches the `bw` subprocess as
  anything other than a properly-quoted `argv` array element. Shell-mode
  spawning is banned by policy; bypasses are in scope.
- **Pending-queue compromise**: the pending-operations file must be written
  at mode `0600`, must not contain plaintext secrets, and must not be
  readable by other local users.
- **Config-parser exploits**: zod schema bypass, prototype pollution, or
  JSON-parse vulnerabilities that allow attacker-controlled config to escape
  validation.
- **Filesystem-boundary violations**: writes outside `$HOME`,
  `$XDG_CONFIG_HOME`, or `$XDG_STATE_HOME`.
- **Apply-phase confirmation bypass**: any code path that performs a `bw`
  mutation without per-item user confirmation.
- **Domain-collision attacks**: IDN homograph confusion in duplicate
  detection that causes distinct domains to be merged.
- **Supply-chain tampering** with seiton's published artifacts (npm tarball,
  GitHub Releases) detectable via SHA256SUMS or provenance attestations.

### Out of scope

The following are not reportable here; please route them to the appropriate
upstream:

- Vulnerabilities in the `bw` CLI, the Bitwarden server, vault encryption, or
  master-password handling. Report to
  [Bitwarden's responsible-disclosure program](https://bitwarden.com/contact/).
- Vulnerabilities in the npm registry, npm CLI, or Node.js itself.
- Attacks requiring local root, kernel compromise, or physical access to the
  user's machine.
- Theoretical timing or side-channel attacks against `zxcvbn-ts` (report
  upstream).
- Functional bugs without a security impact — open a regular GitHub issue.
- Social-engineering attacks against the maintainer.

## Acknowledgments

seiton thanks the researchers who responsibly disclose vulnerabilities.
Reporters who request credit are acknowledged in the release notes for the
version containing the fix.
