# kie — KIE.ai media generation CLI for agents

Generate images and video through [KIE.ai](https://kie.ai) from the terminal or
from an AI agent, with the key locked away and a hard ceiling on what any
single run can spend.

- **0 runtime dependencies** — Node ≥ 20 built-ins only (`fetch`, `node:test`).
- **Key in macOS Keychain** (or a `0600` file elsewhere); env vars need an explicit opt-in.
- **Only talks to `api.kie.ai` and `kieai.redpandaai.co`** (KIE's official upload host). No telemetry, no proxy, and it **never sends a `callBackUrl`** — results are polled, not pushed anywhere.
- **Spend guard before every request**: per-task cap, daily budget from a local ledger of *real* `creditsConsumed`, and balance check.
- **Always downloads results** (KIE result URLs expire in ~24 h).
- **Two output modes**: pretty tables/panels when you run it in a terminal, strict **JSON on stdout** when piped or with `--json` — agents get a stable contract, humans get something readable.

## Install

```bash
git clone https://github.com/julio-daza/kie-cli.git
cd kie-cli/kie
npm install        # dev deps only (typescript)
npm run build
npm link           # exposes `kie` on your PATH
```

## Setup (2 minutes, do it right)

1. Create a **dedicated** key at <https://kie.ai/api-key> for agents. On that page set
   **hourly/daily caps** and an **IP whitelist** — those limits are enforced by KIE and
   are your real backstop if the key ever leaks. Keep your main key out of agents entirely.
2. KIE is prepaid: keep a modest balance and top up as needed.
3. Store the key:

```bash
kie key set          # paste when prompted, input is hidden
kie key check        # → {"source":"keychain","key":"sk-1…cdef","valid":true,"balance":1234}
```

Defaults live in `~/.config/kie/config.json` (`kie config`):

| Setting | Default | Meaning |
|---|---|---|
| `dailyBudget` | `200` | Max credits per UTC day across all runs (≈ US$1 at $0.005/credit) |
| `maxCreditsPerTask` | `50` | Per-task cap for models with a known estimate |
| `outDir` | `./kie-media` | Where results are downloaded |
| `pollSeconds` | `5` | Poll interval for `wait` |
| `waitTimeoutSeconds` | `900` | Give up waiting (the task keeps running; resume with `kie wait`) |

## Usage

```bash
kie models                                    # curated catalog
kie credits                                   # balance + today's spend

# Images
kie image nano-banana-2 --prompt "isometric coffee shop, warm light" --aspect 16:9 --resolution 2K
kie image nano-banana-2 --prompt "same scene at night" --ref https://…/day.png
kie image seedream-v4 --prompt "poster for a jazz night" --aspect 3:4 --max-credits 20

# Video
kie video kling-3.0 --prompt "drone shot over a fjord" --duration 5 --sound --max-credits 80
kie video seedance-2.5 --prompt "…" --image https://…/first.png --resolution 720p --max-credits 60
kie video minimax-h3 --prompt "…" --ref https://…/char.png --duration 6 --max-credits 60
kie video veo3 --prompt "…" --fast --max-credits 100

# Local file as reference (KIE keeps uploads ~3 days)
kie upload ./sketch.png                       # → {"url": "https://…"}

# Any Market model not in the catalog
kie run some-vendor/some-model --input '{"prompt":"…"}' --max-credits 30

# Tasks
kie status <taskId>
kie wait <taskId> --out ./assets              # resume a --no-wait run
kie ledger                                    # what was actually spent
```

Generation flags: `--prompt`, `--ref <url>` (repeatable), `--image`, `--end-image`, `--aspect`,
`--resolution`, `--duration`, `--sound`, `--fast`, `--format`, `--set key=value` (raw model
field, repeatable), `--out`, `--name`, `--no-wait`, `--timeout`, `--poll`, `--no-download`,
`--max-credits`, `--dry-run`, `--quiet`.

### Output modes

| Situation | What you get |
|---|---|
| stdout is a terminal | KIE-branded banner on `help`, box-drawing tables (`models`, `ledger`), panels (`credits` with a budget meter, task results), live spinner while waiting |
| stdout is a pipe / `--json` | Pretty-printed JSON on stdout, plain messages on stderr — what agents should use |
| `--pretty` | Force the human view even when piped (e.g. `kie models --pretty | less -R`) |
| `--no-color` or `NO_COLOR=1` | Same layout, no ANSI colors |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | the task failed on KIE's side |
| 2 | usage error |
| 3 | **blocked by the spend guard** (nothing was sent) |
| 4 | timed out waiting (task still running; `kie wait <taskId>`) |
| 5 | API / auth error |

## How the spend guard works

KIE does **not** publish per-model prices in its API docs, so the CLI cannot
reliably pre-compute cost for every model. Instead of guessing it layers three checks:

1. **Estimate vs per-task cap** — only for models with a verified price (today: `nano-banana-2`).
   For everything else you must state `--max-credits <n>`; the agent has to say out loud how much it accepts to spend.
2. **Daily budget** — `~/.config/kie/ledger.jsonl` records every task; when it completes the real
   `creditsConsumed` is written back. Pending tasks count at their estimate / `--max-credits`, so a burst
   of runs cannot overshoot before any of them reports.
3. **Balance** — refuses if the estimate exceeds the account's remaining credits.

Plus the guard you configure on KIE's side (per-key caps + IP whitelist), which works even if
someone bypasses this CLI entirely.

## Security notes

- The key is read from, in order: `KIE_API_KEY` **only if** `KIE_ALLOW_ENV_KEY=1`; macOS Keychain
  (service `kie-cli`); `~/.config/kie/key` (0600). Set `KIE_DISABLE_KEYCHAIN=1` to force the file.
- Output is passed through a redactor; the key never appears in stdout/stderr/ledger.
- `callBackUrl` is rejected everywhere (`--set`, `--input`). Nothing about your generations leaves your
  machine except the request to KIE.
- `dist/` is built from `src/` with `tsc`; audit `src/` (≈600 lines) before trusting it with a key.

## Catalog

| Alias | Kind | KIE model id(s) | Notes |
|---|---|---|---|
| `nano-banana-2` | image | `nano-banana-2` | generate/edit, up to 14 refs; est. 1K=8 · 2K=12 · 4K=18 credits |
| `seedream-v4` | image | `bytedance/seedream-v4-text-to-image` / `-edit` | `--ref` switches to edit |
| `kling-3.0` | video | `kling-3.0/video` | 3–15 s, `--sound`, `--set mode=pro` |
| `seedance-2.5` | video | `bytedance/seedance-2-5` | frames or multimodal refs, 4–30 s |
| `minimax-h3` | video | `minimax-h3/{text,image,reference}-to-video` | sub-model chosen from flags |
| `veo3` | video | `veo3` / `veo3_fast` | own endpoint (`/veo/generate`) |

Adding a model = one entry in `src/catalog.ts` (a `build()` that maps generic flags to the model's
`input`) + a test. Verify the input schema on `docs.kie.ai/market/<vendor>/<model>` first.

## Agent skill

`skill/kie-media/SKILL.md` teaches Claude Code (or any Agent-Skills-compatible agent) when and how
to call this CLI, including the budget etiquette. Install by symlinking:

```bash
ln -s "$PWD/skill/kie-media" ~/.claude/skills/kie-media
```

## Development

```bash
npm test          # tsc + node:test (no network; fetch is mocked)
npm run typecheck
```
