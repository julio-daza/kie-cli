<p align="center">
  <a href="https://kiecli.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/logo-dark.png">
      <img src="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/logo-light.png" alt="KIE CLI" width="320">
    </picture>
  </a>
</p>

<p align="center">
  <strong>Generate media. Keep your keys.</strong><br>
  The zero-dependency CLI that lets AI agents create images &amp; video on <a href="https://kie.ai">KIE.ai</a> — without ever seeing the API key, and never spending more than you allow.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@uxdata-co/kie"><img src="https://img.shields.io/npm/v/%40uxdata-co%2Fkie?logo=npm&color=cb3837" alt="npm"></a>
  <a href="https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml"><img src="https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@uxdata-co/kie"><img src="https://img.shields.io/badge/dependencies-0-00a8ff" alt="0 dependencies"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.es.md">Español</a> · <a href="https://kiecli.com/docs">Docs</a> · <a href="https://kiecli.com/#tutorials">Use it from chat</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/julio-daza/kie-cli/main/docs/assets/terminal.png" alt="kie in a terminal: KIE banner, credits panel with a budget meter, and an image generation completing with the file path and credits spent" width="640">
</p>

```bash
npm i -g @uxdata-co/kie
kie key set            # paste the key once → macOS Keychain (0600 file elsewhere)
kie skill install      # teach Claude Code, Codex, Cursor and Gemini CLI to use it
kie image nano-banana-2 --prompt "isometric coffee shop, warm light" --aspect 16:9
```

## Why kie

Media APIs are the most expensive credentials to leak: one leaked key can burn hundreds of
dollars of video generation in an afternoon. Most KIE integrations read the key from an
environment variable, pull in hundreds of npm packages, and ship a default webhook. `kie` is
built around the opposite assumptions.

| | **kie** (`@uxdata-co/kie`) | [felores/kie-cli-mcp](https://github.com/felores/kie-cli-mcp) |
|---|---|---|
| Runtime dependencies | **0** — Node built-ins only; ~700 lines you can audit before trusting it | 582 packages in the lockfile (`sqlite3`, `express`, `yargs`, MCP SDK…) |
| Where the API key lives | **macOS Keychain** (0600 file elsewhere); env var only with an explicit opt-in; output is redacted | `KIE_AI_API_KEY` environment variable |
| Outbound hosts | **Only `api.kie.ai` and KIE's upload host**; `callBackUrl` is rejected everywhere | Same KIE hosts, but every task is created with a hardcoded `callBackUrl` → `proxy.kie.ai/mcp-callback` unless you override it |
| Spend protection | **Three checks before the request leaves**: per-task cap, daily budget from a ledger of *real* `creditsConsumed`, balance. Blocked = exit 3, nothing sent | Quote + approve flow (`prepare_media_generation` → `submit_media_generation`); no daily ledger |
| Agent integration | **Agent Skills** (`SKILL.md`) for Claude Code, Codex, Cursor and Gemini CLI — `kie skill install`, nothing to run in the background | MCP server (stdio/HTTP) + OpenAI-compatible server; a long-running process that holds the key |
| Releases | Published from GitHub Actions with **npm provenance** (trusted publishing; no tokens) | Published manually |
| Human UX | Brand banner, tables that fit your terminal, budget meter, live spinner; strict JSON when piped | JSON / MCP tool output |
| Results | Always downloaded to disk; returns file paths (KIE URLs expire in 24 h) | Returns KIE URLs; optional callback rendezvous |
| Model coverage | Curated: Nano Banana 2, Seedream V4, Kling 3.0, Seedance 2.5, MiniMax H3, Veo 3 — plus `kie run <any-model>` | Broader: ~30 tools including audio (Suno, ElevenLabs), Midjourney, upscalers |
| Tests | 45, no network (fetch mocked), run on Node 20 and 22 in CI | Jest suites per package |

`kie-cli-mcp` is a solid project and the right choice if you need an **MCP server** or its wider
model list. `kie` is the right choice if the thing you care about is **not leaking a paid key
to an agent** and knowing, before any request, the most it can cost.

## How it works

1. **Key in the keystore.** `kie key set` stores it in the macOS Keychain (service `kie-cli`) or a
   `0600` file. Agents never see it; every byte of output passes through a redactor.
2. **Spend guard in front of every request.** Models with a verified price are checked against
   `maxCreditsPerTask`; everything else requires an explicit `--max-credits` — the agent has to
   say out loud how much it accepts to spend. A local ledger tracks the real cost per day.
3. **Polling, not callbacks.** The CLI never sends a `callBackUrl`; nothing about your
   generations is pushed to any third party.
4. **Files, not links.** Results are downloaded immediately; the agent gets a path.
5. **An agent skill, not a server.** `kie skill install` drops `kie-media` into
   `~/.claude/skills`, `~/.agents/skills`, `~/.cursor/skills` and `~/.gemini/skills`. Then you
   just ask: *"generate a 16:9 hero image of an isometric coffee shop"*.

Full reference: **[kiecli.com/docs](https://kiecli.com/docs)** · package README: [`kie/README.md`](kie/README.md).

## Repository layout

- [`kie/`](kie/) — the CLI (TypeScript, zero runtime dependencies) and its tests.
- [`skills/kie-media/`](skills/kie-media/) — the agent skill (`kie skill install`, or `npx skills add julio-daza/kie-cli`).
- [`docs/assets/`](docs/assets/) — logo and screenshots used by the READMEs.
- Website: [julio-daza/kie-landing](https://github.com/julio-daza/kie-landing) → [kiecli.com](https://kiecli.com)

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).

## Disclaimer

This is an independent, community project. It is **not affiliated with, endorsed by, or
supported by KIE.ai**. "KIE" and the KIE logo are trademarks of their respective owner and
are used here only to identify the service the tool talks to. Comparison data about other
projects was taken from their public repositories on 2026-08-22; open an issue if it is outdated.

## License

MIT — see [LICENSE](LICENSE).
