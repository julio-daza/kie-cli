# Changelog

All notable changes to `kie` are documented here. Versions follow semver; the JSON output
shape and flag names are part of the public contract.

## [0.6.0] — 2026-08-22

### Added
- `kie mcp` — an MCP server (stdio only, no dependencies) exposing the CLI as tools:
  `kie_credits`, `kie_models`, `kie_generate_image`, `kie_generate_video`, `kie_task_status`,
  `kie_wait_task`, `kie_upload`, `kie_ledger`. Same catalog, spend guard and ledger as the CLI;
  generated images are returned inline so the chat can show them. Built for desktop apps whose
  shells run in a sandbox (Claude Desktop, Codex app) — the server runs on your machine, the
  key stays in the keystore.
- `kie mcp install [--app claude|codex|cursor|all]` writes the server into
  `claude_desktop_config.json`, `~/.codex/config.toml` or `~/.cursor/mcp.json` using the
  absolute Node path (GUI apps do not inherit the shell PATH). `kie mcp config` prints the snippet.

- OS keystores on every platform: macOS Keychain, **Windows DPAPI** (user scope, ciphertext in
  `~/.config/kie/key.dpapi`) and **Linux Secret Service** via `secret-tool` when installed; the
  `0600` file remains the fallback. `kie key check` reports which one is in use.
- `kie-media` skill: if `kie` is not on PATH or `api.kie.ai` is unreachable, the agent now tells
  the user the session is sandboxed and points to the terminal or the MCP server.

### Fixed
- Keychain access uses `/usr/bin/security` by absolute path so it works when spawned with an
  empty environment.

## [0.5.1] — 2026-08-22

### Changed
- README (GitHub and npm): KIE CLI logo, terminal screenshot, comparison with other KIE
  clients, and a Spanish version (`README.es.md`). No code changes.

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
