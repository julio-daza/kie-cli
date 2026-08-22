---
name: kie-media
description: >
  Generate images and videos with the `kie` CLI (KIE.ai: Nano Banana 2, Seedream, Kling 3.0,
  Seedance 2.5, MiniMax H3, Veo 3) under strict spend limits, and hand back local files.
  Trigger: user asks to generate, create, render or edit an image, illustration, logo draft,
  mockup, poster, video clip, animation, or b-roll; or mentions KIE, Kling, Veo, Seedance,
  Nano Banana, "genera una imagen", "hazme un video".
license: MIT
metadata:
  author: juliodaza
  version: "1.4"
---

## When to Use

Works in Claude Code (`/kie-media`), Codex (`$kie-media`), Cursor (`/kie-media` in Agent chat) and Gemini CLI (auto-activated), or automatically whenever the request matches.

- The user wants a generated image or video (not a chart, not a screenshot, not an SVG icon you can hand-write).
- An asset is needed for a landing page, blog post, store listing, social post, demo data, or storyboard.
- The user asks to iterate on a previous generation (edit with a reference image).

Do **not** use it for: diagrams (use SVG/mermaid), UI mockups you can code, or anything the
user did not ask to spend money on. Every call costs credits.

## Critical Patterns

| Rule | Why |
|---|---|
| **Check budget first**: `kie credits` before the first generation of a session. | Spend is capped per day; know what is left before promising results. |
| **Always pass `--max-credits`** on video and on any model without an estimate. Start low (image ≤ 20, video ≤ 80) and only raise it if the user explicitly agrees. | Exit code 3 = blocked, nothing was sent. Never retry a blocked call with a bigger number on your own. |
| **Use `--dry-run` when unsure of the request shape** (new model, `--set` fields). | Prints the exact payload; costs nothing. |
| **Hand back the local file path from the JSON `files` array, never `resultUrls`.** | Result URLs expire in ~24 h. |
| **Prefer images over video for drafts.** Generate 1 image, show it, then iterate. Only move to video once the user confirms the look. | Video costs 5–20× more per run. |
| **Local reference files go through `kie upload <file>` first**, then `--ref`/`--image <url>`. | Models take URLs, not paths. Uploads auto-delete after ~3 days. |
| **Never ask for, echo, or set the API key.** If `kie key check` fails, tell the user to run `kie key set` themselves. | The key must not enter the conversation. |
| **One task at a time, `--no-wait` only for batches the user asked for.** | Pending tasks reserve budget at their cap. |
| If `kie` is not installed: `npm i -g @uxdata-co/kie` (Node ≥ 20), then the user runs `kie key set`. | Official package, published from CI with provenance. |
| **If `kie` is not on PATH, or `api.kie.ai` is unreachable (proxy 403 / allowlist), this session is not running on the user's machine.** Do not try to install the CLI or pass the key here. Tell the user: run the request from Claude Code / Codex in their terminal, or use the `kie` MCP server (`kie mcp install`) from the desktop app. | Desktop-app sandboxes have no keystore and no network to KIE; the key must stay on the user's machine. |
| **Always pass `--json`** and parse stdout; stderr is chatter. | When stdout is a terminal the CLI switches to human tables; `--json` pins the machine contract. |

## Model Choice

| Need | Command | Notes |
|---|---|---|
| Fast, cheap, good image; edits with refs | `kie image nano-banana-2` | 1K ≈ 8 cr, 2K ≈ 12, 4K ≈ 18. Default choice. |
| Posters / text-heavy / alt style | `kie image seedream-v4` | `--ref` switches to edit mode. Needs `--max-credits`. |
| Short clip with native audio | `kie video kling-3.0 --sound` | 3–15 s, `--set mode=pro` for quality. |
| Image → video, frames, long (≤30 s) | `kie video seedance-2.5 --image <url>` | `--resolution 480p` for cheap drafts. |
| Consistent character from refs | `kie video minimax-h3 --ref <url>` | 4–15 s. |
| Highest quality cinematic | `kie video veo3` (`--fast` for cheaper) | Own endpoint; 16:9 for 1080p. |

## Code Examples

```bash
# 1. budget check
kie credits --json
# {"balance":980,"spentToday":16,"dailyBudget":200,"remainingToday":184}

# 2. draft image
kie image nano-banana-2 --prompt "flat illustration of a barista handing a coffee, teal palette" \
  --aspect 16:9 --out ./assets --name hero-barista --json
# {"taskId":"…","state":"success","creditsConsumed":8,"files":["assets/hero-barista.png"],…}

# 3. iterate with the draft as reference
kie image nano-banana-2 --prompt "same illustration, add a plant on the counter" \
  --ref "$(kie upload ./assets/hero-barista.png --json | jq -r .url)" --out ./assets --name hero-barista-v2 --json

# 4. only after the user approves: a clip, with an explicit ceiling
kie video kling-3.0 --prompt "the barista slides the cup across the counter, soft dolly-in" \
  --image "$(kie upload ./assets/hero-barista-v2.png --json | jq -r .url)" --duration 5 --max-credits 80 --out ./assets --json
```

Handling outcomes:

```text
exit 0 → report files[] and creditsConsumed to the user
exit 3 → tell the user the spend guard blocked it and quote the reason; ask before raising --max-credits or dailyBudget
exit 4 → task still running: `kie wait <taskId> --out <dir>` later
exit 1 → KIE failed the task (failMsg); failed tasks are not charged — rephrase the prompt or change model
exit 5 → API/auth issue; suggest `kie key check`
```

## Commands

```bash
kie models --kind image|video            # catalog with supported flags
kie image <model> --prompt "…" [--ref url]... [--aspect 16:9] [--resolution 1K|2K|4K] [--out dir] [--name base]
kie video <model> --prompt "…" [--image url] [--end-image url] [--ref url]... [--duration s] [--sound] --max-credits N
kie run <model-id> --input '{…}' --max-credits N   # any Market model; verify schema on docs.kie.ai first
kie upload <file>                        # local file → temporary URL
kie status <taskId> | kie wait <taskId> --out dir
kie ledger                               # real spend log
kie config set dailyBudget 300           # only when the user asks
```

## Resources

- **CLI README**: [../../kie/README.md](../../kie/README.md)
- **Model catalog** (flags → KIE input mapping): [../../kie/src/catalog.ts](../../kie/src/catalog.ts)
- **Request shapes reference**: [references/kie-api.md](references/kie-api.md)
