# kie-cli

[![npm](https://img.shields.io/npm/v/%40uxdata-co%2Fkie?logo=npm&color=cb3837)](https://www.npmjs.com/package/@uxdata-co/kie)
[![CI](https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/julio-daza/kie-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Small, dependency-free command-line tools built so AI coding agents can use paid
third-party services **without** being handed the keys to the kingdom. Each CLI
ships with a matching agent skill. Today the repo holds one: `kie`.

| CLI | What it does | Skill |
|-----|--------------|-------|
| [`kie/`](kie/) — `npm i -g @uxdata-co/kie` | Image & video generation on [KIE.ai](https://kie.ai) with hard spend guards, Keychain-stored key, no callbacks to third parties | [`kie/skill/kie-media`](kie/skill/kie-media/SKILL.md) |

## Design rules shared by every CLI here

1. **Zero runtime dependencies.** The only code that touches your key is code you can read in one sitting.
2. **Keys live in the OS keystore** (macOS Keychain), never in env vars by default, never in logs or output.
3. **Talk only to the vendor's official hosts.** No telemetry, no proxies, no default webhooks.
4. **Spend is capped before the request leaves the machine**, and the real cost is written to a local ledger afterwards.
5. **JSON on stdout, humans on stderr, meaningful exit codes** — so agents can script it safely.

## Repository layout

- [`kie/`](kie/) — the CLI (TypeScript, zero runtime dependencies) and its tests.
- [`kie/skill/kie-media/`](kie/skill/kie-media/) — the agent skill.
- Website: [julio-daza/kie-landing](https://github.com/julio-daza/kie-landing) → https://kie-landing.pages.dev

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).

## Disclaimer

This is an independent, community project. It is **not affiliated with, endorsed by, or
supported by KIE.ai**. "KIE" and the KIE logo are trademarks of their respective owner and
are used here only to identify the service the tool talks to.

## License

MIT — see [LICENSE](LICENSE).
