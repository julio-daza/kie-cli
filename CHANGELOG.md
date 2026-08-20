# Changelog

All notable changes to `kie` are documented here. Versions follow semver; the JSON output
shape and flag names are part of the public contract.

## Unreleased

### Changed
- The website moved to its own repository, [kie-landing](https://github.com/julio-daza/kie-landing).

## [0.2.0] — 2026-08-20

### Added
- Human-friendly terminal UI when stdout is a TTY: KIE banner on `help`, box-drawing tables
  for `models`/`ledger`, panels for `credits` (with a budget meter), task results, `status`,
  `--dry-run`, `key` and `config`, and a live spinner while waiting.
- `--pretty`, `--json`, `--no-color` flags (`NO_COLOR` honoured).
- Tables shrink to the terminal width instead of wrapping.

### Unchanged
- JSON contract for pipes/agents (`--json`), exit codes, spend guard.

## [0.1.0] — 2026-08-20

### Added
- Initial release: `key`, `credits`, `models`, `image`, `video`, `run`, `status`, `wait`,
  `upload`, `ledger`, `config`.
- Keychain-backed key storage, spend guard (per-task cap, daily budget from a local ledger of
  real `creditsConsumed`, balance check), no `callBackUrl` ever sent.
- Catalog: `nano-banana-2`, `seedream-v4`, `kling-3.0`, `seedance-2.5`, `minimax-h3`, `veo3`.
- `kie-media` agent skill.
