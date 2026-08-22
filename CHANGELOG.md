# Changelog

All notable changes to `kie` are documented here. Versions follow semver; the JSON output
shape and flag names are part of the public contract.

## [0.5.0] — 2026-08-22

### Added
- `kie skill install` now supports `--agent cursor` (`~/.cursor/skills/`) and `--agent gemini`
  (`~/.gemini/skills/`) in addition to `claude` and `codex`; `all` installs the four.

### Fixed
- The bundled `SKILL.md` listed two wrong install commands (`@uxdata/kie`, `@julio-daza/kie`).
  It now says the real package, `npm i -g @uxdata-co/kie`. Agents reading the 0.4.0 skill
  would have failed to install the CLI — update with `kie skill install --force`.

## [0.4.0] — 2026-08-21

### Added
- `kie skill install [--agent claude|codex|all] [--project] [--force]` installs the bundled
  `kie-media` agent skill into `~/.claude/skills/` (Claude Code) and/or `~/.agents/skills/` (Codex).
  `kie skill path` / `kie skill show` for inspection. The skill now ships inside the npm package.
- README and website tutorials for using `kie` from chat in Claude Code and Codex.

### Changed
- The skill moved from `kie/skill/kie-media` to `skills/kie-media` at the repo root, so
  `npx skills add julio-daza/kie-cli` discovers it.

## [0.3.0] — 2026-08-21

### Added
- Published to npm as [`@uxdata-co/kie`](https://www.npmjs.com/package/@uxdata-co/kie): `npm i -g @uxdata-co/kie`.
  Releases are built and published from GitHub Actions with npm provenance.

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
