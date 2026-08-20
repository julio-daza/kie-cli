# Security Policy

`kie` handles a paid API key, so we treat security reports seriously.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use
[GitHub Security Advisories](https://github.com/julio-daza/kie-cli/security/advisories/new)
to report privately. You should get an acknowledgement within a few days.

## What counts

- Anything that could expose the KIE API key (logs, output, files with wrong permissions, env leakage).
- Anything that makes the CLI contact a host other than `api.kie.ai`, `kieai.redpandaai.co`
  or the result URLs KIE returns.
- Anything that bypasses the spend guard (per-task cap, daily budget, balance check) or
  lets a `callBackUrl` through.

## Scope

Only the code in this repository. Issues in KIE.ai's service itself should go to
<support@kie.ai>.

## Supported versions

The latest release on `main`.
