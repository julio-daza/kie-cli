# MyCLIs

Small, dependency-free command-line tools built so AI coding agents can use paid
third-party services **without** being handed the keys to the kingdom. Each CLI
ships with a matching agent skill.

| CLI | What it does | Skill |
|-----|--------------|-------|
| [`kie/`](kie/) | Image & video generation on [KIE.ai](https://kie.ai) with hard spend guards, Keychain-stored key, no callbacks to third parties | [`kie/skill/kie-media`](kie/skill/kie-media/SKILL.md) |

## Design rules shared by every CLI here

1. **Zero runtime dependencies.** The only code that touches your key is code you can read in one sitting.
2. **Keys live in the OS keystore** (macOS Keychain), never in env vars by default, never in logs or output.
3. **Talk only to the vendor's official hosts.** No telemetry, no proxies, no default webhooks.
4. **Spend is capped before the request leaves the machine**, and the real cost is written to a local ledger afterwards.
5. **JSON on stdout, humans on stderr, meaningful exit codes** — so agents can script it safely.

## License

MIT — see [LICENSE](LICENSE).
